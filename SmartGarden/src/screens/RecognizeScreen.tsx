/**
 * RecognizeScreen — 花卉识别主界面
 *
 * 流程: 点击选图 → 预处理 → ONNX 推理 → 显示结果
 * 使用 useRecognition hook 管理状态机
 */

import React, {useCallback, useLayoutEffect, useState} from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useColorScheme,
} from 'react-native';
import {Icon} from 'react-native-paper';
import {useFocusEffect, useNavigation} from '@react-navigation/native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import RecognitionOrchestrator from '../services/RecognitionOrchestrator';
import CameraViewfinder from '../components/CameraViewfinder';
import DesignCard from '../components/DesignCard';
import FlowerAvatar from '../components/FlowerAvatar';
import StatusBadge from '../components/StatusBadge';
import ActionButton from '../components/ActionButton';
import SegmentedControl from '../components/SegmentedControl';
import AddToGardenModal from '../components/AddToGardenModal';
import CorrectionModal from '../components/CorrectionModal';
import {getKnowledge} from '../services/KnowledgeService';
import {CorrectionService} from '../services/CorrectionService';
import {useRecognition} from '../hooks/useRecognition';
import type {RecognitionResult} from '../services/RecognitionOrchestrator';
import type {CareGuide} from '../types';
import {getErrorInfoFromError} from '../services/ErrorHandler';
import {COLORS, RADIUS, SPACING, SHADOWS, TYPOGRAPHY} from '../constants';

function RecognizeScreen(): React.JSX.Element {
  const isDark = useColorScheme() === 'dark';
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();

  const {
    state,
    handleEnterCamera,
    handleCameraCancel,
    handleCameraPhoto,
    handlePickImage,
    handleReset,
    handleRetry,
  } = useRecognition();

  // 离开页面时重置识别状态
  useFocusEffect(
    useCallback(() => {
      return () => handleReset();
    }, [handleReset]),
  );

  const [knowledge, setKnowledge] = useState<CareGuide | null>(null);
  const [resultTab, setResultTab] = useState<'care' | 'info'>('care');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showCorrectionModal, setShowCorrectionModal] = useState(false);

  const pageBg = isDark ? COLORS.bgDark : COLORS.bg;
  const textColor = isDark ? COLORS.textDark : COLORS.text;
  const secondaryColor = isDark
    ? COLORS.textSecondaryDark
    : COLORS.textSecondary;
  const cardBg = isDark ? COLORS.cardDark : COLORS.card;
  const dividerColor = isDark ? COLORS.dividerDark : COLORS.divider;
  const surfaceBg = isDark ? COLORS.surfaceDark : COLORS.surface;

  const modelReady = RecognitionOrchestrator.getInstance().isModelLoaded;

  // 获取花卉知识
  React.useEffect(() => {
    if (state.phase === 'result' && state.result) {
      setKnowledge(getKnowledge(state.result.topClass));
    } else {
      setKnowledge(null);
    }
  }, [state.phase === 'result' ? (state as any).result?.topClass : null]);

  // 相机激活时隐藏 Tab bar
  useLayoutEffect(() => {
    const parent = navigation.getParent();
    if (state.phase === 'camera') {
      parent?.setOptions({
        tabBarStyle: {display: 'none'},
      });
    } else {
      parent?.setOptions({
        tabBarStyle: {
          backgroundColor: cardBg,
          borderTopColor: 'transparent',
          borderTopWidth: 0,
        },
      });
    }
  }, [state.phase, navigation, cardBg]);

  // 纠错逻辑
  const handleCorrection = useCallback(() => {
    if (!state.result) {
      Alert.alert('提示', '暂无识别结果，无法纠错');
      return;
    }
    setShowCorrectionModal(true);
  }, [state.result]);

  const handleSubmitCorrection = useCallback(
    async (correction: string) => {
      if (!state.result) {return;}
      try {
        const correctionService = CorrectionService.getInstance();
        const correctionResult = await correctionService.submit({
          imageHash: state.result.topClass + '_' + Date.now(),
          recognitionResult: state.result,
          userCorrection: correction,
        });
        Alert.alert(
          correctionResult.success ? '反馈成功' : '反馈失败',
          correctionResult.message,
        );
      } catch (error) {
        Alert.alert('错误', '提交纠错失败：' + (error as Error).message);
      }
    },
    [state.result],
  );

  // 子视图
  const renderIdle = () => (
    <View style={styles.idleContainer}>
      {/* 顶部提示 */}
      {modelReady && (
        <View style={styles.modelReadyBadge}>
          <StatusBadge
            text={`${RecognitionOrchestrator.getInstance().executionProvider ?? 'CPU'} 就绪`}
            variant="success"
          />
        </View>
      )}

      {/* 中央图标区 */}
      <View style={styles.idleCenter}>
        <View style={[styles.idleIconWrap, {backgroundColor: isDark ? COLORS.forest + '20' : COLORS.forestBg}]}>
          <Icon source="flower-outline" size={56} color={COLORS.forest} />
        </View>
        <Text style={[styles.idleTitle, {color: textColor}]}>智慧识花</Text>
        <Text style={[styles.idleSub, {color: secondaryColor}]}>
          拍摄或选择花卉照片{'\n'}AI 即刻识别品种并提供养护建议
        </Text>
      </View>

      {/* 底部按钮区 */}
      <View style={styles.idleActions}>
        <ActionButton
          title={modelReady ? '拍照识别' : '模型加载中…'}
          variant="primary"
          size="lg"
          icon="camera"
          fullWidth
          disabled={!modelReady}
          onPress={handleEnterCamera}
        />
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={handlePickImage}
          style={[styles.albumBtn, {borderColor: dividerColor}]}>
          <Icon source="image-multiple" size={18} color={COLORS.forest} />
          <Text style={[styles.albumBtnText, {color: COLORS.forest}]}>
            从相册选择
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderInferring = (imageUri: string) => (
    <View style={styles.inferringContainer}>
      <DesignCard padding={0} radius={RADIUS.xxl} bg={cardBg} style={styles.inferringCard}>
        <Image source={{uri: imageUri}} style={styles.inferringImage} />
        <View style={styles.inferringOverlay}>
          <ActivityIndicator size="large" color="#FFFFFF" />
          <Text style={styles.inferringText}>
            正在识别...
          </Text>
        </View>
      </DesignCard>
    </View>
  );

  const renderRejected = (imageUri: string, result: RecognitionResult) => (
    <ScrollView
      style={styles.resultContainer}
      contentContainerStyle={[styles.resultContent, {paddingBottom: insets.bottom + SPACING.xxl}]}
      showsVerticalScrollIndicator={false}>
      <Image source={{uri: imageUri}} style={styles.resultImage} />
      <DesignCard
        bg={cardBg}
        style={styles.resultCardOverlap}
        padding={SPACING.xxl}>
        <View style={{alignItems: 'center'}}>
          <View style={[styles.resultIconCircle, {backgroundColor: isDark ? COLORS.earth + '20' : COLORS.earthBg}]}>
            <Icon source="flower-outline" size={36} color={COLORS.earth} />
          </View>
          <Text style={[styles.resultTitle, {color: textColor}]}>未识别到花卉</Text>
          <Text style={[styles.resultSub, {color: secondaryColor}]}>
            {result.errorMessage || '图片中未检测到花卉，或图片质量过差'}
          </Text>
        </View>
      </DesignCard>
      <View style={styles.resultActionBar}>
        <ActionButton
          title="重新拍摄"
          variant="primary"
          size="lg"
          icon="camera-retake"
          fullWidth
          onPress={handleReset}
        />
      </View>
    </ScrollView>
  );

  const renderLowConfidence = (imageUri: string, result: RecognitionResult) => (
    <ScrollView
      style={styles.resultContainer}
      contentContainerStyle={[styles.resultContent, {paddingBottom: insets.bottom + SPACING.xxl}]}
      showsVerticalScrollIndicator={false}>
      <Image source={{uri: imageUri}} style={styles.resultImage} />
      <DesignCard
        bg={cardBg}
        style={styles.resultCardOverlap}
        padding={SPACING.xxl}>
        <View style={{alignItems: 'center'}}>
          <View style={[styles.resultIconCircle, {backgroundColor: isDark ? COLORS.warning + '20' : COLORS.warningLight}]}>
            <Icon source="alert-circle-outline" size={36} color={COLORS.warning} />
          </View>
          <Text style={[styles.resultTitle, {color: textColor}]}>识别不确定</Text>
          <Text style={[styles.resultSub, {color: secondaryColor}]}>
            {result.errorMessage || '以下为本地模型的参考结果'}
          </Text>
          <View style={[styles.infoBox, {backgroundColor: surfaceBg}]}>
            <Text style={[styles.infoBoxLabel, {color: secondaryColor}]}>本地模型识别</Text>
            <Text style={[styles.infoBoxValue, {color: textColor}]}>
              {result.topClass}（置信度 {(result.confidence * 100).toFixed(1)}%）
            </Text>
            {result.allClasses && (
              <Text style={[styles.infoBoxSub, {color: secondaryColor}]}>
                其他可能：{result.allClasses
                  .slice(1, 4)
                  .map(c => `${c.name} ${(c.probability * 100).toFixed(0)}%`)
                  .join(' · ')}
              </Text>
            )}
          </View>
        </View>
      </DesignCard>
      <View style={[styles.resultActionBar, {gap: SPACING.md}]}>
        <ActionButton
          title="重新拍摄"
          variant="outline"
          size="md"
          icon="camera-retake"
          flex
          onPress={handleReset}
        />
        <ActionButton
          title="添加到花园"
          variant="primary"
          size="md"
          icon="plus"
          flex
          onPress={() => setShowAddModal(true)}
        />
      </View>
    </ScrollView>
  );

  const renderResult = (imageUri: string, result: RecognitionResult) => {
    if (result.status === 'rejected') {
      return renderRejected(imageUri, result);
    }
    if (result.status === 'low_confidence') {
      return renderLowConfidence(imageUri, result);
    }

    const infoFromLLM = result.llmUsed
      ? {
          name: result.flowerName,
          scientificName: result.scientificName,
          family: result.family,
          origin: result.origin,
          bloomPeriod: result.bloomPeriod,
        }
      : null;

    const confidenceBadgeVariant =
      result.confidence >= 0.85 ? 'success' : result.confidence >= 0.5 ? 'warning' : 'error';

    return (
      <ScrollView
        style={styles.resultContainer}
        contentContainerStyle={[styles.resultContent, {paddingBottom: insets.bottom + 100}]}
        showsVerticalScrollIndicator={false}>
        {/* 图片 */}
        <Image source={{uri: imageUri}} style={styles.resultImage} />

        {/* 结果卡片（覆盖在图片底部） */}
        <DesignCard
          bg={cardBg}
          style={styles.resultCardOverlap}
          padding={SPACING.xl}>
          {/* 花名 + 头像 */}
          <View style={styles.flowerNameRow}>
            <FlowerAvatar
              name={result.topClass}
              size={52}
              style={{marginRight: SPACING.md}}
            />
            <View style={{flex: 1}}>
              <Text style={[styles.flowerName, {color: textColor}]} numberOfLines={1}>
                {infoFromLLM?.name ?? result.topClass}
              </Text>
              <View style={styles.flowerMetaRow}>
                {result.source === 'llm' && (
                  <View style={[styles.aiBadge, {backgroundColor: isDark ? COLORS.info + '20' : COLORS.infoLight}]}>
                    <Icon source="auto-fix" size={12} color={COLORS.info} />
                    <Text style={[styles.aiBadgeText, {color: COLORS.info}]}>AI增强</Text>
                  </View>
                )}
                <StatusBadge
                  text={`${(result.confidence * 100).toFixed(0)}%`}
                  variant={confidenceBadgeVariant}
                />
              </View>
            </View>
          </View>

          {/* Tab 切换 */}
          <View style={{marginVertical: SPACING.lg}}>
            <SegmentedControl
              segments={[
                {key: 'care', label: '养护指南', icon: 'book-open-variant'},
                {key: 'info', label: '基本信息', icon: 'information-outline'},
              ]}
              activeKey={resultTab}
              onChange={(k) => setResultTab(k as 'care' | 'info')}
            />
          </View>

          {/* Tab 内容 */}
          {resultTab === 'care' && knowledge ? (
            <View style={styles.careGrid}>
              <CareCell
                icon="water-outline"
                label="浇水"
                iconColor={COLORS.info}
                values={[knowledge.watering.frequency, knowledge.watering.amount]}
                sub={`${knowledge.watering.timing} · ${knowledge.watering.method}`}
                textColor={textColor}
                secondaryColor={secondaryColor}
                surfaceBg={surfaceBg}
                isDark={isDark}
                isLast={false}
                dividerColor={dividerColor}
              />
              <CareCell
                icon="sprout"
                label="施肥"
                iconColor={COLORS.success}
                values={[knowledge.fertilizing.period, knowledge.fertilizing.amount]}
                sub={knowledge.fertilizing.recommended.join('、')}
                textColor={textColor}
                secondaryColor={secondaryColor}
                surfaceBg={surfaceBg}
                isDark={isDark}
                isLast={false}
                dividerColor={dividerColor}
              />
              <CareCell
                icon="white-balance-sunny"
                label="光照"
                iconColor={COLORS.warning}
                values={[knowledge.lighting.requirement]}
                sub={`最佳：${knowledge.lighting.bestLocation}`}
                textColor={textColor}
                secondaryColor={secondaryColor}
                surfaceBg={surfaceBg}
                isDark={isDark}
                isLast={false}
                dividerColor={dividerColor}
              />
              <CareCell
                icon="thermometer-lines"
                label="环境"
                iconColor={COLORS.error}
                values={[knowledge.environment.temperature]}
                sub={`湿度 ${knowledge.environment.humidity} · ${knowledge.environment.ventilation}`}
                textColor={textColor}
                secondaryColor={secondaryColor}
                surfaceBg={surfaceBg}
                isDark={isDark}
                isLast={true}
                dividerColor={dividerColor}
              />
            </View>
          ) : resultTab === 'care' ? (
            <View style={styles.emptyCare}>
              <Icon source="help-circle-outline" size={32} color={secondaryColor} />
              <Text style={[styles.emptyCareText, {color: secondaryColor}]}>
                {result.source === 'llm' ? 'AI 已识别，养护数据加载中' : '暂无该花卉的养护指南'}
              </Text>
            </View>
          ) : (
            <View style={styles.infoGrid}>
              <InfoCell
                label="学名"
                value={infoFromLLM?.scientificName ?? knowledge?.scientificName ?? '—'}
                textColor={textColor}
                secondaryColor={secondaryColor}
              />
              <InfoCell
                label="科属"
                value={infoFromLLM?.family ?? knowledge?.family ?? '—'}
                textColor={textColor}
                secondaryColor={secondaryColor}
              />
              <InfoCell
                label="产地"
                value={infoFromLLM?.origin ?? knowledge?.origin ?? '—'}
                textColor={textColor}
                secondaryColor={secondaryColor}
              />
              <InfoCell
                label="花期"
                value={infoFromLLM?.bloomPeriod ?? knowledge?.bloomPeriod ?? '—'}
                textColor={textColor}
                secondaryColor={secondaryColor}
              />
            </View>
          )}
        </DesignCard>

        {/* 纠错按钮 */}
        <View style={{paddingHorizontal: SPACING.lg, marginTop: SPACING.md}}>
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={handleCorrection}
            style={styles.correctionBtn}>
            <Icon source="pencil-outline" size={14} color={secondaryColor} />
            <Text style={[styles.correctionText, {color: secondaryColor}]}>
              识别结果有误？点击纠错
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    );
  };

  const renderError = (message: string) => {
    const errorInfo = getErrorInfoFromError(message);
    const iconColor =
      errorInfo.severity === 'error'
        ? COLORS.error
        : errorInfo.severity === 'warning'
        ? COLORS.warning
        : COLORS.info;
    const bgColor =
      errorInfo.severity === 'error'
        ? isDark
          ? COLORS.error + '20'
          : COLORS.errorLight
        : errorInfo.severity === 'warning'
        ? isDark
          ? COLORS.warning + '20'
          : COLORS.warningLight
        : isDark
        ? COLORS.info + '20'
        : COLORS.infoLight;
    return (
      <View style={[styles.errorContainer, {paddingHorizontal: SPACING.xl}]}>
        <View style={[styles.errorIconWrap, {backgroundColor: bgColor}]}>
          <Icon source="alert-circle-outline" size={48} color={iconColor} />
        </View>
        <Text style={[styles.errorTitle, {color: textColor}]}>{errorInfo.title}</Text>
        <Text style={[styles.errorDesc, {color: secondaryColor}]}>{errorInfo.description}</Text>
        <ActionButton
          title="重试"
          variant="primary"
          size="lg"
          fullWidth
          onPress={handleRetry}
        />
      </View>
    );
  };

  // 主布局
  const renderContent = () => {
    switch (state.phase) {
      case 'idle':
        return renderIdle();
      case 'camera':
        return null;
      case 'inferring':
        return renderInferring(state.imageUri!);
      case 'result':
        return renderResult(state.imageUri!, state.result!);
      case 'error':
        return renderError(state.message!);
    }
  };

  if (state.phase === 'camera') {
    return (
      <View style={styles.root}>
        <CameraViewfinder
          isActive={true}
          onPhotoTaken={handleCameraPhoto}
          onAlbumPick={handlePickImage}
          onCancel={handleCameraCancel}
        />
      </View>
    );
  }

  // 结果页有自己的滚动容器
  if (state.phase === 'result' && state.result && state.result.status === 'success') {
    return (
      <View style={[styles.container, {backgroundColor: pageBg}]}>
        {renderContent()}

        {/* 底部固定操作栏（仅高置信度结果） */}
        <View style={[styles.bottomBar, {
          backgroundColor: cardBg,
          paddingBottom: insets.bottom + SPACING.md,
          borderTopColor: dividerColor,
        }]}>
          <ActionButton
            title="添加到花园"
            variant="primary"
            size="lg"
            icon="plus"
            fullWidth
            onPress={() => setShowAddModal(true)}
          />
          <View style={styles.bottomBarSecondary}>
            <TouchableOpacity
              style={styles.bottomBarIconBtn}
              activeOpacity={0.7}
              onPress={handleReset}>
              <Icon source="camera-retake" size={20} color={secondaryColor} />
              <Text style={[styles.bottomBarIconLabel, {color: secondaryColor}]}>重拍</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.bottomBarIconBtn}
              activeOpacity={0.7}
              onPress={handleCorrection}>
              <Icon source="pencil-outline" size={20} color={secondaryColor} />
              <Text style={[styles.bottomBarIconLabel, {color: secondaryColor}]}>纠错</Text>
            </TouchableOpacity>
          </View>
        </View>

        <AddToGardenModal
          visible={showAddModal}
          flowerId={knowledge?.flowerId}
          defaultName={state.result?.topClass}
          onClose={() => setShowAddModal(false)}
          onSuccess={() => {}}
        />

        <CorrectionModal
          visible={showCorrectionModal}
          topClass={state.result?.topClass}
          onClose={() => setShowCorrectionModal(false)}
          onSubmit={handleSubmitCorrection}
        />
      </View>
    );
  }

  return (
    <ScrollView
      style={[styles.container, {backgroundColor: pageBg}]}
      contentContainerStyle={[
        styles.scrollContent,
        {paddingTop: insets.top + SPACING.sm, paddingBottom: insets.bottom + SPACING.xxl},
      ]}
      showsVerticalScrollIndicator={false}>
      {renderContent()}

      <AddToGardenModal
        visible={showAddModal}
        flowerId={knowledge?.flowerId}
        defaultName={state.result?.topClass}
        onClose={() => setShowAddModal(false)}
        onSuccess={() => {}}
      />

      <CorrectionModal
        visible={showCorrectionModal}
        topClass={state.result?.topClass}
        onClose={() => setShowCorrectionModal(false)}
        onSubmit={handleSubmitCorrection}
      />
    </ScrollView>
  );
}

// ━━━ 养护网格单元格 ━━━

function CareCell({
  icon,
  label,
  iconColor,
  values,
  sub,
  textColor,
  secondaryColor,
  isDark,
  dividerColor,
}: {
  icon: string;
  label: string;
  iconColor: string;
  values: string[];
  sub: string;
  textColor: string;
  secondaryColor: string;
  surfaceBg: string;
  isDark: boolean;
  isLast: boolean;
  dividerColor: string;
}) {
  return (
    <View style={[careStyles.cell, {borderBottomColor: dividerColor}]}>
      <View style={careStyles.cellHeader}>
        <View style={[careStyles.iconWrap, {backgroundColor: isDark ? iconColor + '20' : iconColor + '12'}]}>
          <Icon source={icon} size={16} color={iconColor} />
        </View>
        <Text style={[careStyles.label, {color: iconColor}]}>{label}</Text>
      </View>
      {values.map((v, i) => (
        <Text key={i} style={[careStyles.value, {color: textColor}]} numberOfLines={1}>{v}</Text>
      ))}
      <Text style={[careStyles.sub, {color: secondaryColor}]} numberOfLines={2}>{sub}</Text>
    </View>
  );
}

function InfoCell({
  label,
  value,
  textColor,
  secondaryColor,
}: {
  label: string;
  value: string;
  textColor: string;
  secondaryColor: string;
}) {
  return (
    <View style={infoStyles.cell}>
      <Text style={[infoStyles.label, {color: secondaryColor}]}>{label}</Text>
      <Text style={[infoStyles.value, {color: textColor}]} numberOfLines={1}>{value}</Text>
    </View>
  );
}

// ━━━ 样式 ━━━

const careStyles = StyleSheet.create({
  cell: {
    width: '50%',
    paddingVertical: SPACING.md,
    paddingRight: SPACING.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  cellHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  iconWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  label: {
    fontSize: 13,
    fontWeight: '700',
  },
  value: {
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 18,
  },
  sub: {
    fontSize: 11,
    lineHeight: 16,
    marginTop: 2,
  },
});

const infoStyles = StyleSheet.create({
  cell: {
    width: '50%',
    paddingVertical: SPACING.sm,
    paddingRight: SPACING.md,
  },
  label: {
    fontSize: 12,
    marginBottom: 3,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  value: {
    fontSize: 14,
    fontWeight: '500',
  },
});

const styles = StyleSheet.create({
  root: {flex: 1},
  container: {flex: 1},
  scrollContent: {
    paddingHorizontal: SPACING.xl,
    flexGrow: 1,
  },

  // ── Idle 状态 ──
  idleContainer: {
    flex: 1,
    justifyContent: 'space-between',
  },
  modelReadyBadge: {
    alignItems: 'center',
    paddingTop: SPACING.sm,
  },
  idleCenter: {
    alignItems: 'center',
    paddingHorizontal: SPACING.xxl,
  },
  idleIconWrap: {
    width: 120,
    height: 120,
    borderRadius: 60,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SPACING.xl,
  },
  idleTitle: {
    fontSize: 24,
    fontWeight: '700',
    marginBottom: SPACING.sm,
    letterSpacing: -0.3,
  },
  idleSub: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 22,
  },
  idleActions: {
    gap: SPACING.md,
    paddingBottom: SPACING.lg,
  },
  albumBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.pill,
    borderWidth: 1.5,
  },
  albumBtnText: {
    fontSize: 14,
    fontWeight: '600',
  },

  // ── 推理中 ──
  inferringContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: SPACING.xxl,
  },
  inferringCard: {
    alignItems: 'center',
    overflow: 'hidden',
  },
  inferringImage: {
    width: 240,
    height: 240,
    borderRadius: RADIUS.xxl,
  },
  inferringOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderRadius: RADIUS.xxl,
  },
  inferringText: {
    ...TYPOGRAPHY.body,
    marginTop: SPACING.md,
    color: '#FFFFFF',
    fontWeight: '600',
  },

  // ── 结果页 ──
  resultContainer: {
    flex: 1,
  },
  resultContent: {
    paddingBottom: SPACING.xxl,
  },
  resultImage: {
    width: '100%',
    height: 280,
    borderBottomLeftRadius: RADIUS.xxl,
    borderBottomRightRadius: RADIUS.xxl,
  },
  resultCardOverlap: {
    marginTop: -28,
    marginHorizontal: SPACING.lg,
    ...SHADOWS.cardHover,
  },
  flowerNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  flowerName: {
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: -0.3,
    marginBottom: SPACING.xs,
  },
  flowerMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  aiBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: RADIUS.pill,
  },
  aiBadgeText: {
    fontSize: 10,
    fontWeight: '600',
  },

  // Care grid
  careGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  emptyCare: {
    alignItems: 'center',
    paddingVertical: SPACING.xl,
    gap: SPACING.sm,
  },
  emptyCareText: {
    fontSize: 13,
  },

  // Info grid
  infoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },

  // Result states
  resultTitle: {
    fontSize: 20,
    fontWeight: '700',
    marginTop: SPACING.lg,
    marginBottom: SPACING.xs,
    textAlign: 'center',
  },
  resultSub: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: SPACING.lg,
  },
  resultIconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: -SPACING.lg,
  },
  resultActionBar: {
    flexDirection: 'row',
    paddingHorizontal: SPACING.lg,
    marginTop: SPACING.lg,
  },
  infoBox: {
    width: '100%',
    padding: SPACING.md,
    borderRadius: RADIUS.md,
    marginTop: SPACING.md,
  },
  infoBoxLabel: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  infoBoxValue: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
  },
  infoBoxSub: {
    fontSize: 12,
    lineHeight: 18,
  },
  correctionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xs,
    paddingVertical: SPACING.md,
  },
  correctionText: {
    fontSize: 12,
  },

  // 底部固定操作栏
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  bottomBarSecondary: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: SPACING.xxxl,
    marginTop: SPACING.sm,
  },
  bottomBarIconBtn: {
    alignItems: 'center',
    gap: 2,
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.md,
  },
  bottomBarIconLabel: {
    fontSize: 11,
    fontWeight: '500',
  },

  // 错误状态
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorIconWrap: {
    width: 96,
    height: 96,
    borderRadius: 48,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SPACING.xl,
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: SPACING.sm,
    textAlign: 'center',
  },
  errorDesc: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: SPACING.xxl,
  },
});

export default RecognizeScreen;

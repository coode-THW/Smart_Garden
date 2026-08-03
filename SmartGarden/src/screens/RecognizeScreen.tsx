/**
 * RecognizeScreen — 花卉识别主界面（重构版）
 *
 * 流程: 点击选图 → 预处理 → ONNX 推理 → 显示结果
 * 重构：modals 抽取为组件，识别流程抽取为 useRecognition hook
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
import {useNavigation} from '@react-navigation/native';
import RecognitionOrchestrator from '../services/RecognitionOrchestrator';
import CameraViewfinder from '../components/CameraViewfinder';
import DesignCard from '../components/DesignCard';
import SectionHeader from '../components/SectionHeader';
import FlowerAvatar from '../components/FlowerAvatar';
import StatusBadge from '../components/StatusBadge';
import ActionButton from '../components/ActionButton';
import ButtonGroup from '../components/ButtonGroup';
import AddToGardenModal from '../components/AddToGardenModal';
import CorrectionModal from '../components/CorrectionModal';
import {getKnowledge} from '../services/KnowledgeService';
import {CorrectionService} from '../services/CorrectionService';
import {useRecognition} from '../hooks/useRecognition';
import type {RecognitionResult} from '../services/RecognitionOrchestrator';
import type {CareGuide} from '../types';
import {getErrorInfo, getErrorInfoFromError} from '../services/ErrorHandler';
import {COLORS, RADIUS, SPACING, SHADOWS, TYPOGRAPHY} from '../constants';

// ━━━ 颜色别名 ━━━
const GREEN = COLORS.primary;
const RED = COLORS.error;
const BLUE = COLORS.info;

function RecognizeScreen(): React.JSX.Element {
  const isDarkMode = useColorScheme() === 'dark';
  const navigation = useNavigation();

  const {
    state,
    handleEnterCamera,
    handleCameraCancel,
    handleCameraPhoto,
    handlePickImage,
    handleReset,
    handleRetry,
  } = useRecognition();

  const [knowledge, setKnowledge] = useState<CareGuide | null>(null);
  const [resultTab, setResultTab] = useState<'care' | 'info'>('care');
  const [showAddModal, setShowAddModal] = useState(false);
  const [customName, setCustomName] = useState('');
  const [showCorrectionModal, setShowCorrectionModal] = useState(false);

  const pageBg = isDarkMode ? COLORS.bgDark : COLORS.bg;
  const textColor = isDarkMode ? COLORS.textDark : COLORS.text;
  const secondaryColor = isDarkMode
    ? COLORS.textSecondaryDark
    : COLORS.textSecondary;
  const cardBg = isDarkMode ? COLORS.cardDark : COLORS.card;
  const dividerColor = isDarkMode ? COLORS.borderDark : COLORS.border;
  const hintGreenBg = isDarkMode ? '#1A3A2A' : '#D4EDDA';
  const hintGreenText = isDarkMode ? '#A3CFAB' : '#155724';
  const hintWarnBg = isDarkMode ? '#3A3010' : '#FFF3CD';
  const hintWarnText = isDarkMode ? '#D4A574' : '#856404';
  const hintErrorBg = isDarkMode ? '#3A1A1A' : '#F8D7DA';
  const hintErrorText = isDarkMode ? '#E8A0A0' : '#721C24';

  const modelReady = RecognitionOrchestrator.getInstance().isModelLoaded;

  // ━━━ 获取花卉知识 ━━━
  React.useEffect(() => {
    if (state.phase === 'result' && state.result) {
      setKnowledge(getKnowledge(state.result.topClass));
    } else {
      setKnowledge(null);
    }
  }, [state.phase === 'result' ? (state as any).result?.topClass : null]);

  // ━━━ 相机激活时隐藏 Tab bar ━━━
  useLayoutEffect(() => {
    const parent = navigation.getParent();
    if (state.phase === 'camera') {
      parent?.setOptions({
        tabBarStyle: {display: 'none'},
      });
    } else {
      parent?.setOptions({
        tabBarStyle: {
          backgroundColor: pageBg,
          borderTopColor: 'transparent',
          borderTopWidth: 0,
        },
      });
    }
  }, [state.phase, isDarkMode, navigation, pageBg]);

  // ━━━ 纠错逻辑 ━━━
  const handleCorrection = useCallback(() => {
    if (!state.result) {
      Alert.alert('提示', '暂无识别结果，无法纠错');
      return;
    }
    setShowCorrectionModal(true);
  }, [state.result]);

  const handleSubmitCorrection = useCallback(
    async (correction: string) => {
      if (!state.result) return;
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

  // ━━━ 渲染 ━━━
  const renderContent = () => {
    switch (state.phase) {
      case 'idle':
        return renderIdle();
      case 'camera':
        return null; // 相机由外层直接渲染
      case 'inferring':
        return renderInferring(state.imageUri!);
      case 'result':
        return renderResult(state.imageUri!, state.result!);
      case 'error':
        return renderError(state.message!);
    }
  };

  // ━━━ 子视图 ━━━

  const renderIdle = () => (
    <View style={{flex: 1}}>
      <View style={{paddingHorizontal: SPACING.lg, marginTop: 12}}>
        <SectionHeader
          label="AI RECOGNITION"
          title="智慧识别"
          labelColor={isDarkMode ? COLORS.sage : COLORS.sageDark}
          titleColor={textColor}
        />
      </View>
      <View style={[styles.centerContent, {paddingVertical: 60}]}>
        <View
          style={[
            styles.iconCircle,
            {
              backgroundColor: isDarkMode
                ? COLORS.forest + '30'
                : COLORS.sageLight + '40',
              marginBottom: SPACING.xl,
            },
          ]}
        >
          <Icon source="camera-outline" size={48} color={COLORS.forest} />
        </View>
        <Text style={[styles.hint, {color: secondaryColor}]}>
          拍照或从相册选择花卉照片，{'\n'}
          立即识别花卉品种
        </Text>
        <ActionButton
          title={
            modelReady ? '拍照识别' : '模型加载中…'
          }
          variant="primary"
          size="lg"
          icon="camera"
          fullWidth
          disabled={!modelReady}
          onPress={handleEnterCamera}
        />
        <ActionButton
          title="从相册选择"
          variant="outline"
          size="lg"
          icon="image-multiple"
          fullWidth
          style={{marginTop: SPACING.md}}
          onPress={handlePickImage}
        />
      </View>
    </View>
  );

  const renderInferring = (imageUri: string) => (
    <View style={[styles.centerContent, {paddingVertical: 80}]}>
      <DesignCard padding={SPACING.xxl} style={{alignItems: 'center'}}>
        <Image source={{uri: imageUri}} style={styles.preview} />
        <ActivityIndicator
          size="large"
          color={COLORS.forest}
          style={styles.spinner}
        />
        <Text style={[styles.statusText, {color: textColor}]}>
          正在识别...
        </Text>
      </DesignCard>
    </View>
  );

  const renderResult = (imageUri: string, result: RecognitionResult) => {
    if (result.status === 'rejected') {
      return (
        <View style={styles.resultScroll}>
          <View style={{paddingHorizontal: SPACING.lg}}>
            <Image
              source={{uri: imageUri}}
              style={{
                width: '100%',
                height: 240,
                borderRadius: RADIUS.xl,
              }}
            />
          </View>
          <DesignCard
            bg={cardBg}
            style={{marginTop: -28, marginHorizontal: SPACING.lg}}
            padding={SPACING.xl}
          >
            <View style={{alignItems: 'center'}}>
              <View
                style={[
                  styles.iconCircle,
                  {
                    width: 80,
                    height: 80,
                    borderRadius: 40,
                    backgroundColor: isDarkMode
                      ? COLORS.earth + '20'
                      : COLORS.earth + '15',
                    marginBottom: SPACING.lg,
                  },
                ]}
              >
                <Icon
                  source="magnify"
                  size={40}
                  color={isDarkMode ? COLORS.earthLight : COLORS.earth}
                />
              </View>
              <Text style={[styles.notFlowerTitle, {color: textColor}]}>
                未识别到花卉
              </Text>
              <Text style={[styles.notFlowerHint, {color: secondaryColor}]}>
                {result.errorMessage || '图片中未检测到花卉，或图片质量过差'}
              </Text>
              <ActionButton
                title="重新拍摄"
                variant="primary"
                size="md"
                fullWidth
                onPress={handleReset}
              />
            </View>
          </DesignCard>
        </View>
      );
    }

    if (result.status === 'low_confidence') {
      return (
        <View style={styles.resultScroll}>
          <View style={{paddingHorizontal: SPACING.lg}}>
            <Image
              source={{uri: imageUri}}
              style={{
                width: '100%',
                height: 240,
                borderRadius: RADIUS.xl,
              }}
            />
          </View>
          <DesignCard
            bg={cardBg}
            style={{marginTop: -28, marginHorizontal: SPACING.lg}}
            padding={SPACING.xl}
          >
            <View style={{alignItems: 'center'}}>
              <View
                style={[
                  styles.iconCircle,
                  {
                    width: 80,
                    height: 80,
                    borderRadius: 40,
                    backgroundColor: isDarkMode
                      ? COLORS.warning + '20'
                      : COLORS.warning + '15',
                    marginBottom: SPACING.lg,
                  },
                ]}
              >
                <Icon source="alert-circle" size={40} color={COLORS.warning} />
              </View>
              <Text style={[styles.notFlowerTitle, {color: textColor}]}>
                识别结果不确定
              </Text>
              <Text style={[styles.notFlowerHint, {color: secondaryColor}]}>
                {result.errorMessage ||
                  '大模型识别失败，以下为本地模型识别结果'}
              </Text>
              <View
                style={{
                  marginTop: SPACING.lg,
                  width: '100%',
                  padding: SPACING.md,
                  backgroundColor: isDarkMode
                    ? COLORS.bgDark
                    : COLORS.bgSecondary,
                  borderRadius: RADIUS.md,
                }}
              >
                <Text style={{fontSize: 12, color: secondaryColor, marginBottom: SPACING.sm}}>
                  识别详情：
                </Text>
                <Text style={{fontSize: 12, color: textColor}}>
                  本地模型识别：{result.topClass} (置信度:{' '}
                  {(result.confidence * 100).toFixed(1)}%)
                </Text>
                {result.allClasses && (
                  <Text style={{fontSize: 12, color: secondaryColor, marginTop: SPACING.xs}}>
                    其他可能：
                    {result.allClasses
                      .slice(1, 4)
                      .map(c => `${c.name}(${(c.probability * 100).toFixed(0)}%)`)
                      .join(' ')}
                  </Text>
                )}
                <Text style={{fontSize: 12, color: secondaryColor, marginTop: SPACING.xs}}>
                  识别来源：
                  {result.source === 'yolov11' ? '本地模型' : '大模型'}
                </Text>
              </View>
              <View
                style={{
                  marginTop: SPACING.lg,
                  flexDirection: 'row',
                  gap: SPACING.md,
                  width: '100%',
                }}
              >
                <ActionButton
                  title="重新拍摄"
                  variant="outline"
                  size="md"
                  icon="camera-retake"
                  flex
                  onPress={handleReset}
                />
                <ActionButton
                  title="查看详情"
                  variant="primary"
                  size="md"
                  icon="info"
                  flex
                  onPress={() => {}}
                />
              </View>
            </View>
          </DesignCard>
        </View>
      );
    }

    // ━━━ HIGH：Hero → 信息 → Tab → 内容 ━━━
    const renderInfoRow = (icon: string, label: string, value: string) => (
      <View style={styles.infoRow} key={label}>
        <Icon
          source={icon}
          size={18}
          color={isDarkMode ? COLORS.sage : COLORS.sageDark}
        />
        <Text style={[styles.infoLabel, {color: secondaryColor}]}>
          {label}
        </Text>
        <Text style={[styles.infoValue, {color: textColor}]} numberOfLines={1}>
          {value}
        </Text>
      </View>
    );

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
      result.confidence >= 0.85
        ? 'success'
        : result.confidence >= 0.5
        ? 'warning'
        : 'error';

    return (
      <View style={styles.resultScroll}>
        {/* 图片 */}
        <View style={{paddingHorizontal: SPACING.lg}}>
          <Image
            source={{uri: imageUri}}
            style={{
              width: '100%',
              height: 260,
              borderRadius: RADIUS.xl,
            }}
          />
        </View>

        <DesignCard
          bg={cardBg}
          style={{marginTop: -32, marginHorizontal: SPACING.lg}}
          padding={SPACING.xl}
        >
          {/* 花名 + FlowerAvatar */}
          <View style={styles.flowerNameRow}>
            <FlowerAvatar
              name={result.topClass}
              size={48}
              style={{marginRight: SPACING.md}}
            />
            <View style={{flex: 1}}>
              <Text
                style={[styles.flowerName, {color: textColor}]}
                numberOfLines={1}
              >
                {infoFromLLM?.name ?? result.topClass}
              </Text>
              {result.source === 'llm' && (
                <Text style={{fontSize: 12, color: COLORS.info}}>
                  AI 增强识别
                </Text>
              )}
            </View>
            <StatusBadge
              text={`${(result.confidence * 100).toFixed(0)}%`}
              variant={confidenceBadgeVariant}
            />
          </View>

          {/* 分隔线 */}
          <View
            style={{
              height: 1,
              backgroundColor: dividerColor,
              marginBottom: SPACING.md,
            }}
          />

          {/* Tab 切换 */}
          <View
            style={{
              flexDirection: 'row',
              gap: 10,
              marginBottom: SPACING.lg,
            }}
          >
            <TouchableOpacity
              onPress={() => setResultTab('care')}
              style={{
                paddingVertical: SPACING.sm,
                paddingHorizontal: SPACING.lg,
                borderRadius: RADIUS.pill,
                backgroundColor:
                  resultTab === 'care'
                    ? isDarkMode
                      ? COLORS.forest + '30'
                      : COLORS.sageLight + '50'
                    : 'transparent',
                borderWidth: 1,
                borderColor:
                  resultTab === 'care'
                    ? COLORS.forest
                    : dividerColor,
              }}
            >
              <Text style={{color: resultTab === 'care' ? COLORS.forest : secondaryColor, fontWeight: '600'}}>
                养护指南
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setResultTab('info')}
              style={{
                paddingVertical: SPACING.sm,
                paddingHorizontal: SPACING.lg,
                borderRadius: RADIUS.pill,
                backgroundColor:
                  resultTab === 'info'
                    ? isDarkMode
                      ? COLORS.forest + '30'
                      : COLORS.sageLight + '50'
                    : 'transparent',
                borderWidth: 1,
                borderColor:
                  resultTab === 'info'
                    ? COLORS.forest
                    : dividerColor,
              }}
            >
              <Text style={{color: resultTab === 'info' ? COLORS.forest : secondaryColor, fontWeight: '600'}}>
                详细信息
              </Text>
            </TouchableOpacity>
          </View>

          {/* Tab 内容 */}
          {resultTab === 'care' && knowledge ? (
            <View style={styles.careGrid}>
              <View style={[styles.careCell, {borderBottomColor: dividerColor}]}>
                <Icon source="water" size={20} color={COLORS.forest} />
                <Text style={[styles.careLabel, {color: COLORS.forest}]}>浇水</Text>
                <Text style={[styles.careValue, {color: textColor}]}>
                  {knowledge.watering.frequency}
                </Text>
                <Text style={[styles.careValue, {color: textColor}]}>
                  {knowledge.watering.amount}
                </Text>
                <Text style={[styles.careSub, {color: secondaryColor}]}>
                  {knowledge.watering.timing} · {knowledge.watering.method}
                </Text>
              </View>
              <View style={[styles.careCell, {borderBottomColor: dividerColor}]}>
                <Icon source="sprout" size={20} color={COLORS.forest} />
                <Text style={[styles.careLabel, {color: COLORS.forest}]}>施肥</Text>
                <Text style={[styles.careValue, {color: textColor}]}>
                  {knowledge.fertilizing.period}
                </Text>
                <Text style={[styles.careValue, {color: textColor}]}>
                  {knowledge.fertilizing.amount}
                </Text>
                <Text style={[styles.careSub, {color: secondaryColor}]}>
                  {knowledge.fertilizing.recommended.join('、')}
                </Text>
              </View>
              <View style={[styles.careCell, {borderBottomColor: dividerColor}]}>
                <Icon source="white-balance-sunny" size={20} color={COLORS.forest} />
                <Text style={[styles.careLabel, {color: COLORS.forest}]}>光照</Text>
                <Text style={[styles.careValue, {color: textColor}]}>
                  {knowledge.lighting.requirement}
                </Text>
                <Text style={[styles.careSub, {color: secondaryColor}]}>
                  最佳：{knowledge.lighting.bestLocation}
                </Text>
              </View>
              <View style={[styles.careCell, {borderBottomColor: dividerColor}]}>
                <Icon source="thermometer" size={20} color={COLORS.forest} />
                <Text style={[styles.careLabel, {color: COLORS.forest}]}>环境</Text>
                <Text style={[styles.careValue, {color: textColor}]}>
                  {knowledge.environment.temperature}
                </Text>
                <Text style={[styles.careSub, {color: secondaryColor}]}>
                  湿度 {knowledge.environment.humidity} ·{' '}
                  {knowledge.environment.ventilation}
                </Text>
              </View>
            </View>
          ) : resultTab === 'care' ? (
            <View style={{alignItems: 'center', paddingVertical: SPACING.xl}}>
              <Text style={{color: secondaryColor}}>
                {result.source === 'llm'
                  ? 'AI 已提供识别，养护数据同步自知识库'
                  : '暂无该花卉的养护指南'}
              </Text>
            </View>
          ) : (
            <View style={styles.grid}>
              <View style={styles.gridCell}>
                <Text style={[styles.gridLabel, {color: secondaryColor}]}>学名</Text>
                <Text style={[styles.gridValue, {color: textColor}]}>
                  {infoFromLLM?.scientificName ?? knowledge?.scientificName ?? '—'}
                </Text>
              </View>
              <View style={styles.gridCell}>
                <Text style={[styles.gridLabel, {color: secondaryColor}]}>科属</Text>
                <Text style={[styles.gridValue, {color: textColor}]}>
                  {infoFromLLM?.family ?? knowledge?.family ?? '—'}
                </Text>
              </View>
              <View style={styles.gridCell}>
                <Text style={[styles.gridLabel, {color: secondaryColor}]}>产地</Text>
                <Text style={[styles.gridValue, {color: textColor}]}>
                  {infoFromLLM?.origin ?? knowledge?.origin ?? '—'}
                </Text>
              </View>
              <View style={styles.gridCell}>
                <Text style={[styles.gridLabel, {color: secondaryColor}]}>花期</Text>
                <Text style={[styles.gridValue, {color: textColor}]}>
                  {infoFromLLM?.bloomPeriod ?? knowledge?.bloomPeriod ?? '—'}
                </Text>
              </View>
            </View>
          )}
        </DesignCard>

        {/* 操作按钮 */}
        <View style={{paddingHorizontal: SPACING.lg, marginTop: SPACING.md}}>
          <ButtonGroup align="center" wrap>
            <ActionButton
              title="提醒"
              variant="outline"
              size="sm"
              icon="bell-outline"
              onPress={() =>
                Alert.alert('提醒功能即将上线', '敬请期待！')
              }
            />
            <ActionButton
              title="纠错"
              variant="outline"
              size="sm"
              icon="pencil"
              onPress={handleCorrection}
            />
            <ActionButton
              title="添加到花园"
              variant="primary"
              size="sm"
              icon="plus"
              onPress={() => setShowAddModal(true)}
            />
            <ActionButton
              title="重新识别"
              variant="earth"
              size="sm"
              icon="refresh"
              onPress={handleReset}
            />
          </ButtonGroup>
        </View>
      </View>
    );
  };

  const renderError = (message: string) => {
    const errorInfo = getErrorInfoFromError(message);
    const iconColor =
      errorInfo.severity === 'error'
        ? RED
        : errorInfo.severity === 'warning'
        ? COLORS.warning
        : COLORS.info;
    const bgColor =
      errorInfo.severity === 'error'
        ? isDarkMode
          ? COLORS.error + '20'
          : COLORS.error + '12'
        : errorInfo.severity === 'warning'
        ? isDarkMode
          ? '#3A3010'
          : '#FFF3CD'
        : isDarkMode
        ? '#1A2A3A'
        : '#CCE5FF';
    return (
      <View style={[styles.centerContent, {paddingVertical: 80, paddingHorizontal: SPACING.xl}]}>
        <View
          style={[styles.iconCircle, {backgroundColor: bgColor, marginBottom: SPACING.lg}]}
        >
          <Icon source="alert-circle" size={48} color={iconColor} />
        </View>
        <Text style={[styles.notFlowerTitle, {color: textColor}]}>
          {errorInfo.title}
        </Text>
        <Text
          style={[
            styles.notFlowerHint,
            {color: secondaryColor, marginBottom: SPACING.xxl},
          ]}
        >
          {errorInfo.description}
        </Text>
        <ActionButton
          title="重试"
          variant="primary"
          size="md"
          fullWidth
          onPress={handleRetry}
        />
      </View>
    );
  };

  // ━━━ 主布局 ━━━
  const modelLoaded = RecognitionOrchestrator.getInstance().isModelLoaded;
  const modelEp = RecognitionOrchestrator.getInstance().executionProvider;

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

  return (
    <ScrollView
      style={[styles.container, {backgroundColor: pageBg}]}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
    >
      {modelLoaded && state.phase === 'idle' && (
        <View style={{alignItems: 'center', marginBottom: SPACING.md}}>
          <StatusBadge text={`${modelEp ?? 'CPU'} 就绪`} variant="success" />
        </View>
      )}

      {renderContent()}

      {/* ── 添加到花园弹窗 ── */}
      <AddToGardenModal
        visible={showAddModal}
        flowerId={knowledge?.flowerId}
        defaultName={state.result?.topClass}
        onClose={() => setShowAddModal(false)}
        onSuccess={() => {}}
      />

      {/* ── 纠错弹窗 ── */}
      <CorrectionModal
        visible={showCorrectionModal}
        topClass={state.result?.topClass}
        onClose={() => setShowCorrectionModal(false)}
        onSubmit={handleSubmitCorrection}
      />
    </ScrollView>
  );
}

// ━━━ 样式 ━━━

const styles = StyleSheet.create({
  root: {flex: 1},
  container: {flex: 1},
  scrollContent: {padding: SPACING.lg, paddingBottom: 60},

  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 40,
  },
  iconCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    justifyContent: 'center',
    alignItems: 'center',
  },
  hint: {
    ...TYPOGRAPHY.body,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: SPACING.xxl,
    paddingHorizontal: SPACING.xl,
  },
  preview: {
    width: 224,
    height: 224,
    borderRadius: RADIUS.lg,
    marginBottom: 16,
  },
  spinner: {marginBottom: 12},
  statusText: {...TYPOGRAPHY.body, textAlign: 'center'},

  resultScroll: {
    width: '100%',
    alignItems: 'center',
    paddingBottom: 40,
  },
  flowerNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.lg,
  },
  flowerName: {
    ...TYPOGRAPHY.h1,
    fontSize: 24,
  },
  notFlowerTitle: {
    ...TYPOGRAPHY.h2,
    marginBottom: SPACING.sm,
    textAlign: 'center',
  },
  notFlowerHint: {
    ...TYPOGRAPHY.body,
    textAlign: 'center',
    lineHeight: 22,
  },

  careGrid: {flexDirection: 'row', flexWrap: 'wrap'},
  careCell: {
    width: '50%',
    paddingVertical: SPACING.md,
    paddingRight: SPACING.sm,
    borderBottomWidth: 1,
  },
  careLabel: {
    ...TYPOGRAPHY.label,
    marginTop: SPACING.xs,
    marginBottom: SPACING.xs,
  },
  careValue: {
    ...TYPOGRAPHY.bodySmall,
    marginBottom: 2,
  },
  careSub: {
    fontSize: 11,
    lineHeight: 16,
    marginTop: SPACING.xs,
  },

  grid: {flexDirection: 'row', flexWrap: 'wrap'},
  gridCell: {
    width: '50%',
    paddingVertical: SPACING.sm,
    paddingRight: SPACING.md,
  },
  gridLabel: {
    ...TYPOGRAPHY.bodySmall,
    marginBottom: 2,
  },
  gridValue: {
    ...TYPOGRAPHY.body,
    fontWeight: '500',
  },

  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
  },
  infoLabel: {
    ...TYPOGRAPHY.bodySmall,
    width: 60,
  },
  infoValue: {
    ...TYPOGRAPHY.bodySmall,
    flex: 1,
    fontWeight: '500',
  },
});

export default RecognizeScreen;

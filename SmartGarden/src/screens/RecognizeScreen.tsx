/**
 * RecognizeScreen — 花卉识别主界面（Organic/Natural 重构版）
 *
 * 流程: 点击选图 → 预处理 → ONNX 推理 → 显示结果
 */

import React, { useCallback, useLayoutEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useColorScheme,
} from 'react-native';
import { Icon } from 'react-native-paper';
import { useNavigation } from '@react-navigation/native';
import { launchImageLibrary } from 'react-native-image-picker';
import YoloService from '../services/YoloService';
import RecognitionOrchestrator from '../services/RecognitionOrchestrator';
import CameraViewfinder from '../components/CameraViewfinder';
import DesignCard from '../components/DesignCard';
import SectionHeader from '../components/SectionHeader';
import FlowerAvatar from '../components/FlowerAvatar';
import StatusBadge from '../components/StatusBadge';
import ActionButton from '../components/ActionButton';
import ButtonGroup from '../components/ButtonGroup';
import { getKnowledge } from '../services/KnowledgeService';
import { GardenService } from '../services/GardenService';
import { CorrectionService } from '../services/CorrectionService';
import type { RecognitionResult } from '../services/RecognitionOrchestrator';
import type { CareGuide } from '../types';
import { ErrorCode } from '../types';
import {
  COLORS,
  DROP_OFF_THRESHOLD,
  BOTTOM_SUM_MAX,
  GREEN_RATIO_MAX,
  SATURATION_MIN,
  RADIUS,
  SPACING,
  SHADOWS,
  TYPOGRAPHY,
} from '../constants';
import {
  getErrorInfo,
  getErrorInfoFromError,
  getErrorMessage,
} from '../services/ErrorHandler';

// ━━━ 状态 ━━━

type ScreenState =
  | { phase: 'idle' }
  | { phase: 'camera' }
  | { phase: 'inferring'; imageUri: string }
  | { phase: 'result'; imageUri: string; result: RecognitionResult }
  | { phase: 'error'; message: string };

// ━━━ 颜色 ━━━

const GREEN = COLORS.primary;
const RED = COLORS.error;
const BLUE = COLORS.info;

function RecognizeScreen(): React.JSX.Element {
  const isDarkMode = useColorScheme() === 'dark';
  const [state, setState] = useState<ScreenState>({ phase: 'idle' });
  const navigation = useNavigation();
  const [knowledge, setKnowledge] = useState<CareGuide | null>(null);
  const [resultTab, setResultTab] = useState<'care' | 'info'>('care');
  const [showAddModal, setShowAddModal] = useState(false);
  const [customName, setCustomName] = useState('');
  const [gardenLocation, setGardenLocation] = useState('');
  const [showCorrectionModal, setShowCorrectionModal] = useState(false);
  const [correctionText, setCorrectionText] = useState('');

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

  // ━━━ 模型就绪状态（模型在 App.tsx 启动时预加载） ━━━
  const modelReady = RecognitionOrchestrator.getInstance().isModelLoaded;

  // ━━━ 获取花卉知识 ━━━

  React.useEffect(() => {
    if (state.phase === 'result') {
      setKnowledge(getKnowledge(state.result.topClass));
    } else {
      setKnowledge(null);
    }
  }, [state.phase === 'result' ? state.result.topClass : null]);

  // ━━━ 相机激活时隐藏 Tab bar ━━━

  useLayoutEffect(() => {
    const parent = navigation.getParent();
    if (!parent) {
      return;
    }
    if (state.phase === 'camera') {
      parent.setOptions({ tabBarStyle: { display: 'none' } });
    } else {
      parent.setOptions({
        tabBarStyle: {
          backgroundColor: pageBg,
          borderTopColor: 'transparent',
          borderTopWidth: 0,
        },
      });
    }
    return () => {
      parent.setOptions({
        tabBarStyle: {
          backgroundColor: pageBg,
          borderTopColor: 'transparent',
          borderTopWidth: 0,
        },
      });
    };
  }, [state.phase, isDarkMode, navigation]);

  // ━━━ 相机回调 ━━━

  const handleEnterCamera = useCallback(() => {
    setState({ phase: 'camera' });
  }, []);

  const handleCameraCancel = useCallback(() => {
    setState({ phase: 'idle' });
  }, []);

  const handleCameraPhoto = useCallback((localUri: string) => {
    async function run() {
      try {
        setState({ phase: 'inferring', imageUri: localUri });
        // 使用 RecognitionOrchestrator 进行一站式识别（包含置信度判断和LLM调用）
        const result = await RecognitionOrchestrator.getInstance().recognize(
          localUri,
        );
        setState({ phase: 'result', imageUri: localUri, result });
      } catch (e: any) {
        const info = getErrorInfoFromError(e);
        setState({ phase: 'error', message: info.fullMessage });
      }
    }
    run();
  }, []);

  // ━━━ 选图 → 识别 ━━━

  const handlePickImage = useCallback(async () => {
    try {
      const result = await launchImageLibrary({
        mediaType: 'photo',
        selectionLimit: 1,
      });

      if (result.didCancel) {
        return;
      }

      const asset = result.assets?.[0];
      if (!asset?.uri) {
        const info = getErrorInfo(ErrorCode.INVALID_PARAM);
        throw new Error(info.description);
      }

      setState({ phase: 'inferring', imageUri: asset.uri });

      // 使用 RecognitionOrchestrator 进行一站式识别（包含置信度判断和LLM调用）
      const inferenceResult =
        await RecognitionOrchestrator.getInstance().recognize(asset.uri);

      setState({
        phase: 'result',
        imageUri: asset.uri,
        result: inferenceResult,
      });
    } catch (e: any) {
      const info = getErrorInfoFromError(e);
      setState({ phase: 'error', message: info.fullMessage });
    }
  }, []);

  // ━━━ 重新开始 ━━━

  const handleReset = useCallback(() => {
    setState({ phase: 'idle' });
  }, []);

  const handleRetry = useCallback(() => {
    setState({ phase: 'idle' });
  }, []);

  const handleCorrection = useCallback(() => {
    // 检查是否有识别结果
    if (!state.result) {
      Alert.alert('提示', '暂无识别结果，无法纠错');
      return;
    }
    // 打开纠错弹窗
    setCorrectionText('');
    setShowCorrectionModal(true);
  }, [state.result]);

  const handleSubmitCorrection = useCallback(async () => {
    if (!state.result || !correctionText.trim()) {
      return;
    }

    try {
      const correctionService = CorrectionService.getInstance();
      const correctionResult = await correctionService.submit({
        imageHash: state.result.topClass + '_' + Date.now(),
        recognitionResult: state.result,
        userCorrection: correctionText.trim(),
      });
      Alert.alert(
        correctionResult.success ? '反馈成功' : '反馈失败',
        correctionResult.message,
      );
      setShowCorrectionModal(false);
    } catch (error) {
      Alert.alert('错误', '提交纠错失败：' + (error as Error).message);
    }
  }, [state.result, correctionText]);

  // ━━━ 渲染 ━━━

  const renderContent = () => {
    switch (state.phase) {
      case 'idle':
        return renderIdle();

      case 'inferring':
        return renderInferring(state.imageUri);

      case 'result':
        return renderResult(state.imageUri, state.result);

      case 'error':
        return renderError(state.message);
    }
  };

  // ━━━ 子视图 ━━━

  const renderIdle = () => (
    <View style={{ flex: 1 }}>
      <View style={{ paddingHorizontal: SPACING.lg, marginTop: 12 }}>
        <SectionHeader
          label="AI RECOGNITION"
          title="智慧识别"
          labelColor={isDarkMode ? COLORS.sage : COLORS.sageDark}
          titleColor={textColor}
        />
      </View>
      <View style={[styles.centerContent, { paddingVertical: 60 }]}>
        <View
          style={[
            styles.iconCircle,
            {
              backgroundColor: isDarkMode
                ? COLORS.forest + '20'
                : COLORS.sage + '25',
            },
          ]}
        >
          <Icon
            source="camera-enhance"
            size={64}
            color={isDarkMode ? COLORS.sage : COLORS.sageDark}
          />
        </View>
        <Text
          style={[styles.hint, { color: textColor, marginTop: SPACING.xl }]}
        >
          拍照或从相册选择花卉照片{'\n'}AI 将自动识别品种
        </Text>
        <ButtonGroup align="center" wrap={true}>
          <ActionButton
            title={modelReady ? '拍照识别' : '模型加载中…'}
            variant="primary"
            size="lg"
            icon="camera"
            disabled={!modelReady}
            onPress={handleEnterCamera}
          />
          <ActionButton
            title="从相册选择"
            variant="outline"
            size="lg"
            icon="image"
            disabled={!modelReady}
            onPress={handlePickImage}
          />
        </ButtonGroup>
      </View>
    </View>
  );

  const renderInferring = (imageUri: string) => (
    <View style={[styles.centerContent, { paddingVertical: 80 }]}>
      <DesignCard padding={SPACING.xxl} style={{ alignItems: 'center' }}>
        <Image source={{ uri: imageUri }} style={styles.preview} />
        <ActivityIndicator
          size="large"
          color={COLORS.forest}
          style={styles.spinner}
        />
        <Text style={[styles.statusText, { color: textColor }]}>
          正在识别...
        </Text>
      </DesignCard>
    </View>
  );

  const renderResult = (imageUri: string, result: RecognitionResult) => {
    // ━━━ 拒绝（非花卉） ━━━
    if (result.status === 'rejected') {
      return (
        <View style={styles.resultScroll}>
          <View style={{ paddingHorizontal: SPACING.lg }}>
            <Image
              source={{ uri: imageUri }}
              style={{
                width: '100%',
                height: 240,
                borderRadius: RADIUS.xl,
              }}
            />
          </View>
          <DesignCard
            bg={cardBg}
            style={{ marginTop: -28, marginHorizontal: SPACING.lg }}
            padding={SPACING.xl}
          >
            <View style={{ alignItems: 'center' }}>
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
              <Text style={[styles.notFlowerTitle, { color: textColor }]}>
                未识别到花卉
              </Text>
              <Text style={[styles.notFlowerHint, { color: secondaryColor }]}>
                {result.errorMessage || '图片中未检测到花卉，或图片质量过差'}
              </Text>

              <ActionButton
                title="重新拍摄"
                variant="primary"
                size="md"
                icon="camera-retake"
                fullWidth
                onPress={handleReset}
              />
            </View>
          </DesignCard>
        </View>
      );
    }

    // ━━━ 低置信度 ━━━
    if (result.status === 'low_confidence') {
      return (
        <View style={styles.resultScroll}>
          <View style={{ paddingHorizontal: SPACING.lg }}>
            <Image
              source={{ uri: imageUri }}
              style={{
                width: '100%',
                height: 240,
                borderRadius: RADIUS.xl,
              }}
            />
          </View>
          <DesignCard
            bg={cardBg}
            style={{ marginTop: -28, marginHorizontal: SPACING.lg }}
            padding={SPACING.xl}
          >
            <View style={{ alignItems: 'center' }}>
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
              <Text style={[styles.notFlowerTitle, { color: textColor }]}>
                识别结果不确定
              </Text>
              <Text style={[styles.notFlowerHint, { color: secondaryColor }]}>
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
                <Text
                  style={{
                    fontSize: 12,
                    color: secondaryColor,
                    marginBottom: SPACING.sm,
                  }}
                >
                  识别详情：
                </Text>
                <Text style={{ fontSize: 12, color: textColor }}>
                  本地模型识别：{result.topClass} (置信度:{' '}
                  {(result.confidence * 100).toFixed(1)}%)
                </Text>
                {result.allClasses && (
                  <Text
                    style={{
                      fontSize: 12,
                      color: secondaryColor,
                      marginTop: SPACING.xs,
                    }}
                  >
                    其他可能：
                    {result.allClasses
                      .slice(0, 3)
                      .map(
                        c => `${c.name}: ${(c.probability * 100).toFixed(1)}%`,
                      )
                      .join(', ')}
                  </Text>
                )}
                <Text
                  style={{
                    fontSize: 12,
                    color: secondaryColor,
                    marginTop: SPACING.xs,
                  }}
                >
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
                  onPress={() =>
                    setState({ phase: 'result', imageUri, result })
                  }
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
        <Text style={[styles.infoLabel, { color: secondaryColor }]}>
          {label}
        </Text>
        <Text
          style={[styles.infoValue, { color: textColor }]}
          numberOfLines={1}
        >
          {value}
        </Text>
      </View>
    );

    return (
      <View style={styles.resultScroll}>
        {/* 图片 — 轻微超出卡片边界营造层次感 */}
        <View style={{ paddingHorizontal: SPACING.lg }}>
          <Image
            source={{ uri: imageUri }}
            style={{
              width: '100%',
              height: 260,
              borderRadius: RADIUS.xl,
            }}
          />
        </View>

        <DesignCard
          bg={cardBg}
          style={{ marginTop: -32, marginHorizontal: SPACING.lg }}
          padding={SPACING.xl}
        >
          {/* 花名 + FlowerAvatar */}
          <View style={styles.flowerNameRow}>
            <FlowerAvatar
              name={result.topClass}
              size={48}
              style={{ marginRight: SPACING.md }}
            />
            <View style={{ flex: 1 }}>
              <Text
                style={[styles.flowerName, { color: textColor }]}
                numberOfLines={1}
              >
                {result.topClass}
              </Text>
              {result.llmUsed && (
                <Text
                  style={{
                    fontSize: 12,
                    color: COLORS.info,
                    fontWeight: '500',
                  }}
                >
                  AI辅助识别
                </Text>
              )}
              {(knowledge || result.scientificName) && (
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                  }}
                >
                  <Text
                    style={[styles.scientificName, { color: secondaryColor }]}
                    numberOfLines={1}
                  >
                    {knowledge?.scientificName || result.scientificName}
                  </Text>
                  {!knowledge && result.scientificName && (
                    <Text
                      style={{
                        fontSize: 10,
                        color: COLORS.warning,
                        marginLeft: SPACING.xs,
                      }}
                    >
                      AI
                    </Text>
                  )}
                </View>
              )}
            </View>
            <StatusBadge
              text={`${(result.confidence * 100).toFixed(0)}%`}
              variant="success"
            />
          </View>

          {/* 细分隔 */}
          <View
            style={[
              styles.divider,
              { backgroundColor: dividerColor, marginVertical: SPACING.lg },
            ]}
          />

          {/* Tab */}
          <View style={styles.tabRow}>
            <TouchableOpacity
              style={[
                styles.tab,
                resultTab === 'care' && {
                  backgroundColor: isDarkMode
                    ? COLORS.forest + '30'
                    : COLORS.forest + '12',
                  borderColor: isDarkMode
                    ? COLORS.forest + '50'
                    : COLORS.forest + '25',
                },
              ]}
              onPress={() => setResultTab('care')}
            >
              <Icon
                source="book-open-variant"
                size={16}
                color={
                  resultTab === 'care'
                    ? isDarkMode
                      ? COLORS.sage
                      : COLORS.forest
                    : secondaryColor
                }
              />
              <Text
                style={[
                  styles.tabText,
                  { color: secondaryColor },
                  resultTab === 'care' && {
                    color: isDarkMode ? COLORS.sage : COLORS.forest,
                    fontWeight: '600',
                  },
                ]}
              >
                养护指南
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.tab,
                resultTab === 'info' && {
                  backgroundColor: isDarkMode
                    ? COLORS.forest + '30'
                    : COLORS.forest + '12',
                  borderColor: isDarkMode
                    ? COLORS.forest + '50'
                    : COLORS.forest + '25',
                },
              ]}
              onPress={() => setResultTab('info')}
            >
              <Icon
                source="information"
                size={16}
                color={
                  resultTab === 'info'
                    ? isDarkMode
                      ? COLORS.sage
                      : COLORS.forest
                    : secondaryColor
                }
              />
              <Text
                style={[
                  styles.tabText,
                  { color: secondaryColor },
                  resultTab === 'info' && {
                    color: isDarkMode ? COLORS.sage : COLORS.forest,
                    fontWeight: '600',
                  },
                ]}
              >
                详细信息
              </Text>
            </TouchableOpacity>
          </View>

          {/* Tab 内容 */}
          <View style={{ marginTop: SPACING.lg }}>
            {resultTab === 'care' ? (
              knowledge ? (
                <View style={[styles.careGrid, { borderColor: dividerColor }]}>
                  <View style={styles.careCell}>
                    <Icon source="water" size={20} color={COLORS.info} />
                    <Text
                      style={[
                        styles.careLabel,
                        { color: isDarkMode ? COLORS.sage : COLORS.forest },
                      ]}
                    >
                      浇水
                    </Text>
                    <Text style={[styles.careValue, { color: textColor }]}>
                      {knowledge.watering.frequency}
                    </Text>
                    <Text style={[styles.careValue, { color: textColor }]}>
                      {knowledge.watering.amount}
                    </Text>
                    <Text style={[styles.careSub, { color: secondaryColor }]}>
                      {knowledge.watering.timing} · {knowledge.watering.method}
                    </Text>
                  </View>
                  <View style={styles.careCell}>
                    <Icon source="sprout" size={20} color={COLORS.success} />
                    <Text
                      style={[
                        styles.careLabel,
                        { color: isDarkMode ? COLORS.sage : COLORS.forest },
                      ]}
                    >
                      施肥
                    </Text>
                    <Text style={[styles.careValue, { color: textColor }]}>
                      {knowledge.fertilizing.period}
                    </Text>
                    <Text style={[styles.careValue, { color: textColor }]}>
                      {knowledge.fertilizing.amount}
                    </Text>
                    <Text style={[styles.careSub, { color: secondaryColor }]}>
                      {knowledge.fertilizing.recommended.join('、')}
                    </Text>
                  </View>
                  <View style={styles.careCell}>
                    <Icon
                      source="white-balance-sunny"
                      size={20}
                      color={COLORS.warning}
                    />
                    <Text
                      style={[
                        styles.careLabel,
                        { color: isDarkMode ? COLORS.sage : COLORS.forest },
                      ]}
                    >
                      光照
                    </Text>
                    <Text style={[styles.careValue, { color: textColor }]}>
                      {knowledge.lighting.requirement}
                    </Text>
                    <Text style={[styles.careSub, { color: secondaryColor }]}>
                      最佳：{knowledge.lighting.bestLocation}
                    </Text>
                  </View>
                  <View style={styles.careCell}>
                    <Icon source="thermometer" size={20} color={COLORS.error} />
                    <Text
                      style={[
                        styles.careLabel,
                        { color: isDarkMode ? COLORS.sage : COLORS.forest },
                      ]}
                    >
                      环境
                    </Text>
                    <Text style={[styles.careValue, { color: textColor }]}>
                      {knowledge.environment.temperature}
                    </Text>
                    <Text style={[styles.careSub, { color: secondaryColor }]}>
                      湿度 {knowledge.environment.humidity} ·{' '}
                      {knowledge.environment.ventilation}
                    </Text>
                  </View>
                </View>
              ) : result.careGuide ? (
                <View>
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      marginBottom: SPACING.sm,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 11,
                        color: COLORS.warning,
                        fontWeight: '500',
                      }}
                    >
                      AI生成
                    </Text>
                    <Text
                      style={{
                        fontSize: 10,
                        color: secondaryColor,
                        marginLeft: SPACING.xs,
                      }}
                    >
                      信息仅供参考，请谨慎识别
                    </Text>
                  </View>
                  <View
                    style={[styles.careGrid, { borderColor: dividerColor }]}
                  >
                    <View style={styles.careCell}>
                      <Icon source="water" size={20} color={COLORS.info} />
                      <Text
                        style={[
                          styles.careLabel,
                          { color: isDarkMode ? COLORS.sage : COLORS.forest },
                        ]}
                      >
                        浇水
                      </Text>
                      <Text style={[styles.careValue, { color: textColor }]}>
                        {result.careGuide.watering?.frequency || ''}
                      </Text>
                    </View>
                    <View style={styles.careCell}>
                      <Icon source="sprout" size={20} color={COLORS.success} />
                      <Text
                        style={[
                          styles.careLabel,
                          { color: isDarkMode ? COLORS.sage : COLORS.forest },
                        ]}
                      >
                        施肥
                      </Text>
                      <Text style={[styles.careValue, { color: textColor }]}>
                        {result.careGuide.fertilizing?.period || ''}
                      </Text>
                    </View>
                    <View style={styles.careCell}>
                      <Icon
                        source="white-balance-sunny"
                        size={20}
                        color={COLORS.warning}
                      />
                      <Text
                        style={[
                          styles.careLabel,
                          { color: isDarkMode ? COLORS.sage : COLORS.forest },
                        ]}
                      >
                        光照
                      </Text>
                      <Text style={[styles.careValue, { color: textColor }]}>
                        {result.careGuide.lighting?.requirement || ''}
                      </Text>
                    </View>
                    <View style={styles.careCell}>
                      <Icon
                        source="thermometer"
                        size={20}
                        color={COLORS.error}
                      />
                      <Text
                        style={[
                          styles.careLabel,
                          { color: isDarkMode ? COLORS.sage : COLORS.forest },
                        ]}
                      >
                        环境
                      </Text>
                      <Text style={[styles.careValue, { color: textColor }]}>
                        {result.careGuide.environment?.temperature || ''}
                      </Text>
                    </View>
                  </View>
                </View>
              ) : (
                <View style={styles.knowledgePlaceholder}>
                  <Icon
                    source="book-open-page-variant"
                    size={32}
                    color={secondaryColor}
                  />
                  <Text
                    style={[
                      styles.knowledgePlaceholderText,
                      { color: secondaryColor },
                    ]}
                  >
                    暂无该花卉的养护指南
                  </Text>
                </View>
              )
            ) : knowledge ? (
              <View style={styles.grid}>
                <View style={styles.gridCell}>
                  <Text style={[styles.gridLabel, { color: secondaryColor }]}>
                    学名
                  </Text>
                  <Text style={[styles.gridValue, { color: textColor }]}>
                    {knowledge.scientificName}
                  </Text>
                </View>
                <View style={styles.gridCell}>
                  <Text style={[styles.gridLabel, { color: secondaryColor }]}>
                    科属
                  </Text>
                  <Text style={[styles.gridValue, { color: textColor }]}>
                    {knowledge.family}
                  </Text>
                </View>
                <View style={styles.gridCell}>
                  <Text style={[styles.gridLabel, { color: secondaryColor }]}>
                    产地
                  </Text>
                  <Text style={[styles.gridValue, { color: textColor }]}>
                    {knowledge.origin}
                  </Text>
                </View>
                <View style={styles.gridCell}>
                  <Text style={[styles.gridLabel, { color: secondaryColor }]}>
                    花期
                  </Text>
                  <Text style={[styles.gridValue, { color: textColor }]}>
                    {knowledge.bloomPeriod}
                  </Text>
                </View>
              </View>
            ) : (
              <View>
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    marginBottom: SPACING.sm,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 11,
                      color: COLORS.warning,
                      fontWeight: '500',
                    }}
                  >
                    AI生成
                  </Text>
                  <Text
                    style={{
                      fontSize: 10,
                      color: secondaryColor,
                      marginLeft: SPACING.xs,
                    }}
                  >
                    信息仅供参考，请谨慎识别
                  </Text>
                </View>
                <View style={styles.grid}>
                  <View style={styles.gridCell}>
                    <Text style={[styles.gridLabel, { color: secondaryColor }]}>
                      学名
                    </Text>
                    <Text style={[styles.gridValue, { color: textColor }]}>
                      {result.scientificName || '暂无'}
                    </Text>
                  </View>
                  <View style={styles.gridCell}>
                    <Text style={[styles.gridLabel, { color: secondaryColor }]}>
                      科属
                    </Text>
                    <Text style={[styles.gridValue, { color: textColor }]}>
                      {result.family || '暂无'}
                    </Text>
                  </View>
                  <View style={styles.gridCell}>
                    <Text style={[styles.gridLabel, { color: secondaryColor }]}>
                      产地
                    </Text>
                    <Text style={[styles.gridValue, { color: textColor }]}>
                      {result.origin || '暂无'}
                    </Text>
                  </View>
                  <View style={styles.gridCell}>
                    <Text style={[styles.gridLabel, { color: secondaryColor }]}>
                      花期
                    </Text>
                    <Text style={[styles.gridValue, { color: textColor }]}>
                      {result.bloomPeriod || '暂无'}
                    </Text>
                  </View>
                </View>
              </View>
            )}
          </View>
        </DesignCard>

        {/* ── 操作按钮组 ── */}
        <ButtonGroup align="center" wrap={true}>
          <ActionButton
            title="提醒"
            variant="outline"
            size="sm"
            icon="bell-outline"
            onPress={() => Alert.alert('提醒功能即将上线', '敬请期待！')}
          />
          <ActionButton
            title="纠错"
            variant="outline"
            size="sm"
            icon="pencil"
            onPress={handleCorrection}
          />
          <ActionButton
            title="添加"
            variant="primary"
            size="sm"
            icon="plus"
            onPress={() => {
              setCustomName(knowledge?.flowerName ?? result.topClass);
              setGardenLocation('');
              setShowAddModal(true);
            }}
          />
          <ActionButton
            title="重新识别"
            variant="earth"
            size="sm"
            icon="camera-retake"
            onPress={handleReset}
          />
        </ButtonGroup>

        {/* ── 添加到花园弹窗 ── */}
        <Modal
          visible={showAddModal}
          transparent
          animationType="fade"
          onRequestClose={() => setShowAddModal(false)}
        >
          <View style={styles.modalOverlay}>
            <DesignCard
              bg={cardBg}
              shadow="modal"
              style={{ width: '100%', marginHorizontal: SPACING.xl }}
            >
              <View style={{ padding: SPACING.xxl }}>
                <Text style={[styles.modalTitle, { color: textColor }]}>
                  添加到我的花园
                </Text>

                <Text style={[styles.modalLabel, { color: secondaryColor }]}>
                  花卉名称
                </Text>
                <TextInput
                  style={[
                    styles.modalInput,
                    {
                      color: textColor,
                      borderColor: dividerColor,
                      backgroundColor: isDarkMode ? COLORS.bgDark : COLORS.bg,
                    },
                  ]}
                  value={customName}
                  onChangeText={setCustomName}
                  placeholderTextColor={secondaryColor}
                />

                <Text style={[styles.modalLabel, { color: secondaryColor }]}>
                  摆放位置（选填）
                </Text>
                <TextInput
                  style={[
                    styles.modalInput,
                    {
                      color: textColor,
                      borderColor: dividerColor,
                      backgroundColor: isDarkMode ? COLORS.bgDark : COLORS.bg,
                    },
                  ]}
                  value={gardenLocation}
                  onChangeText={setGardenLocation}
                  placeholder="如：阳台、客厅、书房"
                  placeholderTextColor={secondaryColor}
                />

                <ButtonGroup align="stretch">
                  <ActionButton
                    title="取消"
                    variant="outline"
                    onPress={() => setShowAddModal(false)}
                  />
                  <ActionButton
                    title="确认添加"
                    variant="primary"
                    onPress={async () => {
                      setShowAddModal(false);
                      try {
                        if (!knowledge?.flowerId) {
                          const info = getErrorInfo(
                            ErrorCode.DATA_QUERY_FAILED,
                          );
                          Alert.alert(info.title, info.description);
                          return;
                        }
                        const resp =
                          await GardenService.getInstance().addToGarden({
                            flowerId: knowledge.flowerId,
                            customName: customName || undefined,
                            location: gardenLocation || undefined,
                          });
                        if (resp.code === 0) {
                          Alert.alert('添加成功', '已添加到我的花园');
                        } else {
                          const info = getErrorInfoFromError(resp.message);
                          Alert.alert(
                            '添加失败',
                            `${info.title}：${resp.message}`,
                          );
                        }
                      } catch (e: any) {
                        const info = getErrorInfoFromError(e);
                        Alert.alert('添加失败', info.fullMessage);
                      }
                    }}
                  />
                </ButtonGroup>
              </View>
            </DesignCard>
          </View>
        </Modal>

        {/* ── 纠错弹窗 ── */}
        <Modal
          visible={showCorrectionModal}
          transparent
          animationType="fade"
          onRequestClose={() => setShowCorrectionModal(false)}
        >
          <View style={styles.modalOverlay}>
            <DesignCard
              bg={cardBg}
              shadow="modal"
              style={{ width: '100%', marginHorizontal: SPACING.xl }}
            >
              <View style={{ padding: SPACING.xxl }}>
                <Text style={[styles.modalTitle, { color: textColor }]}>
                  识别纠错
                </Text>

                <Text style={[styles.modalLabel, { color: secondaryColor }]}>
                  当前识别：{state.result?.topClass}
                </Text>
                <Text style={[styles.modalLabel, { color: secondaryColor }]}>
                  请输入正确的花卉名称
                </Text>
                <TextInput
                  style={[
                    styles.modalInput,
                    {
                      color: textColor,
                      borderColor: dividerColor,
                      backgroundColor: isDarkMode ? COLORS.bgDark : COLORS.bg,
                    },
                  ]}
                  value={correctionText}
                  onChangeText={setCorrectionText}
                  placeholder="如：玫瑰、郁金香"
                  placeholderTextColor={secondaryColor}
                  autoFocus
                />

                <ButtonGroup align="stretch">
                  <ActionButton
                    title="取消"
                    variant="outline"
                    onPress={() => setShowCorrectionModal(false)}
                  />
                  <ActionButton
                    title="提交反馈"
                    variant="primary"
                    onPress={handleSubmitCorrection}
                    disabled={!correctionText.trim()}
                  />
                </ButtonGroup>
              </View>
            </DesignCard>
          </View>
        </Modal>
      </View>
    );
  };

  const renderError = (message: string) => {
    // 尝试从消息反向推断错误码以获取正确的 UI 风格
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
        ? COLORS.info + '20'
        : COLORS.info + '12';

    return (
      <View style={[styles.centerContent, { paddingVertical: 80 }]}>
        <View
          style={[
            styles.iconCircle,
            {
              width: 80,
              height: 80,
              borderRadius: 40,
              backgroundColor: bgColor,
            },
          ]}
        >
          <Icon source={errorInfo.icon as any} size={40} color={iconColor} />
        </View>
        <Text style={[styles.errorText, { color: iconColor }]}>{message}</Text>
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
          isActive={state.phase === 'camera'}
          onPhotoTaken={handleCameraPhoto}
          onAlbumPick={handlePickImage}
          onCancel={handleCameraCancel}
        />
      </View>
    );
  }

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: pageBg }]}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
    >
      {modelLoaded && state.phase === 'idle' && (
        <View style={{ alignItems: 'center', marginBottom: SPACING.md }}>
          <StatusBadge text={`${modelEp ?? 'CPU'} 就绪`} variant="success" />
        </View>
      )}

      {renderContent()}
    </ScrollView>
  );
}

// ━━━ 样式 ━━━

const styles = StyleSheet.create({
  root: { flex: 1 },
  container: { flex: 1 },
  scrollContent: { padding: SPACING.lg, paddingBottom: 60 },

  // idle
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

  // inferring
  preview: {
    width: 224,
    height: 224,
    borderRadius: RADIUS.lg,
    marginBottom: 16,
  },
  spinner: { marginBottom: 12 },
  statusText: { ...TYPOGRAPHY.body, textAlign: 'center' },

  // result
  resultScroll: {
    width: '100%',
    alignItems: 'center',
    paddingBottom: 40,
  },

  // hero
  flowerNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.lg,
  },
  flowerName: {
    ...TYPOGRAPHY.h1,
    fontSize: 24,
    flexShrink: 1,
  },
  scientificName: {
    fontSize: 13,
    marginTop: 2,
    fontStyle: 'italic',
  },

  // info rows
  infoBlock: { width: '100%', marginTop: 4, gap: 10 },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  infoLabel: {
    width: 36,
    fontSize: 13,
    fontWeight: '500',
  },
  infoValue: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
  },

  // divider
  divider: { height: StyleSheet.hairlineWidth },

  // tab
  tabRow: {
    flexDirection: 'row',
    gap: 10,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: RADIUS.lg,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  tabText: { fontSize: 14, fontWeight: '500' },

  // grid info
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 4 },
  gridCell: { width: '50%', paddingVertical: 10, paddingRight: 8 },
  gridLabel: { fontSize: 12, marginBottom: 3, fontWeight: '500' },
  gridValue: { fontSize: 14, fontWeight: '500' },

  // care grid
  careGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  careCell: {
    width: '50%',
    paddingVertical: 12,
    paddingRight: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 4,
  },
  careLabel: { fontSize: 13, fontWeight: '700', marginTop: 2 },
  careValue: { fontSize: 13, lineHeight: 18 },
  careSub: { fontSize: 11, marginTop: 2, lineHeight: 16 },

  knowledgePlaceholder: {
    alignItems: 'center',
    paddingVertical: 24,
    gap: 8,
  },
  knowledgePlaceholderText: { fontSize: 13, opacity: 0.6 },

  // ── 未识别到花卉 ──
  notFlowerTitle: {
    fontSize: 22,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 12,
  },
  notFlowerHint: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 22,
    opacity: 0.6,
    marginBottom: 4,
  },

  // modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 20,
    textAlign: 'center',
  },
  modalLabel: { fontSize: 13, marginBottom: 6, marginTop: 8 },
  modalInput: {
    borderWidth: 1,
    borderRadius: RADIUS.lg,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    marginBottom: 4,
  },

  // error
  errorText: {
    fontSize: 15,
    textAlign: 'center',
    marginVertical: 16,
    paddingHorizontal: 20,
  },
});

export default RecognizeScreen;

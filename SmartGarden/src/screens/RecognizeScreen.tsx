/**
 * RecognizeScreen — 花卉识别主界面
 *
 * 流程: 点击选图 → 预处理 → ONNX 推理 → 显示结果
 */

import React, {useCallback, useLayoutEffect, useState} from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useColorScheme,
} from 'react-native';
import {Button} from 'react-native-paper';
import {useNavigation} from '@react-navigation/native';
import {launchImageLibrary} from 'react-native-image-picker';
import YoloService from '../services/YoloService';
import CameraViewfinder from '../components/CameraViewfinder';
import NeumorphView from '../components/NeumorphView';
import {fetchKnowledge} from '../services/KnowledgeService';
import type {InferenceResult} from '../services/YoloService';
import type {FlowerKnowledge} from '../services/KnowledgeService';
import {
  COLORS,
  DROP_OFF_THRESHOLD,
  BOTTOM_SUM_MAX,
  GREEN_RATIO_MAX,
  SATURATION_MIN,
  RADIUS,
} from '../constants';

// ━━━ 状态 ━━━

type ScreenState =
  | {phase: 'idle'}
  | {phase: 'camera'}
  | {phase: 'inferring'; imageUri: string}
  | {phase: 'result'; imageUri: string; result: InferenceResult}
  | {phase: 'error'; message: string};

// ━━━ 颜色 ━━━

const GREEN = COLORS.primary;
const RED = COLORS.error;
const BLUE = COLORS.info;

function RecognizeScreen(): React.JSX.Element {
  const isDarkMode = useColorScheme() === 'dark';
  const [state, setState] = useState<ScreenState>({phase: 'idle'});
  const navigation = useNavigation();
  const [knowledge, setKnowledge] = useState<FlowerKnowledge | null>(null);

  const pageBg = isDarkMode ? COLORS.bgDark : COLORS.bg;
  const textColor = isDarkMode ? COLORS.textDark : COLORS.text;
  const secondaryColor = isDarkMode ? COLORS.textSecondaryDark : COLORS.textSecondary;

  // ━━━ 模型就绪状态（模型在 App.tsx 启动时预加载） ━━━
  const modelReady = YoloService.getInstance().isLoaded;

  // ━━━ 获取花卉知识 ━━━

  React.useEffect(() => {
    if (state.phase === 'result') {
      fetchKnowledge(state.result.topClass).then(setKnowledge);
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
      parent.setOptions({tabBarStyle: {display: 'none'}});
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
    setState({phase: 'camera'});
  }, []);

  const handleCameraCancel = useCallback(() => {
    setState({phase: 'idle'});
  }, []);

  const handleCameraPhoto = useCallback(
    (localUri: string) => {
      async function run() {
        try {
          setState({phase: 'inferring', imageUri: localUri});
          const result = await YoloService.getInstance().detect(localUri);
          setState({phase: 'result', imageUri: localUri, result});
        } catch (e: any) {
          setState({phase: 'error', message: e.message || String(e)});
        }
      }
      run();
    },
    [],
  );

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
        throw new Error('未获取到图片');
      }

      setState({phase: 'inferring', imageUri: asset.uri});

      // 一站式识别：预处理 + 推理
      const inferenceResult = await YoloService.getInstance().detect(asset.uri);

      setState({
        phase: 'result',
        imageUri: asset.uri,
        result: inferenceResult,
      });
    } catch (e: any) {
      setState({phase: 'error', message: e.message || String(e)});
    }
  }, []);

  // ━━━ 重新开始 ━━━

  const handleReset = useCallback(() => {
    setState({phase: 'idle'});
  }, []);

  const handleRetry = useCallback(() => {
    setState({phase: 'idle'});
  }, []);

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
    <View style={styles.centerContent}>
      <Text style={[styles.emoji, {color: textColor}]}>📷</Text>
      <Text style={[styles.hint, {color: textColor}]}>
        拍照或从相册选择花卉照片{'\n'}AI 将自动识别品种
      </Text>
      <View style={styles.idleButtonRow}>
        <Button
          mode="contained"
          onPress={handleEnterCamera}
          disabled={!modelReady}
          loading={!modelReady}
          style={styles.captureButton}
          labelStyle={styles.captureButtonText}>
          {modelReady ? '拍照识别' : '模型加载中…'}
        </Button>
        <Button
          mode="outlined"
          onPress={handlePickImage}
          disabled={!modelReady}
          style={styles.albumButtonStyle}
          labelStyle={styles.albumButtonLabel}>
          从相册选择
        </Button>
      </View>
    </View>
  );

  const renderInferring = (imageUri: string) => (
    <View style={styles.centerContent}>
      <Image source={{uri: imageUri}} style={styles.preview} />
      <ActivityIndicator size="large" color={GREEN} style={styles.spinner} />
      <Text style={[styles.statusText, {color: textColor}]}>
        正在识别...
      </Text>
    </View>
  );

  const renderResult = (imageUri: string, result: InferenceResult) => {
    // 暗色模式专用颜色
    const dividerColor = isDarkMode ? '#3A3A36' : '#E0E0E0';
    const trackBg = isDarkMode ? '#3A3A36' : '#E8E8E8';
    const hintGreenBg = isDarkMode ? '#1A3A2A' : '#D4EDDA';
    const hintGreenText = isDarkMode ? '#A3CFAB' : '#155724';
    const hintWarnBg = isDarkMode ? '#3A3010' : '#FFF3CD';
    const hintWarnText = isDarkMode ? '#D4A574' : '#856404';
    const hintErrorBg = isDarkMode ? '#3A1A1A' : '#F8D7DA';
    const hintErrorText = isDarkMode ? '#E8A0A0' : '#721C24';

    // 五重判断：置信度 + 边距 + 熵 + 跌落比 + 底部和 + 绿色占比 + 饱和度
    const confOk = result.confidence >= 0.85;
    const marginOk = result.margin >= 0.15;
    const entropyOk = result.entropy < 0.8;
    const dropOffOk = result.dropOff >= DROP_OFF_THRESHOLD;
    const bottomOk = result.bottomSum < BOTTOM_SUM_MAX;
    const greenOk = result.greenRatio < GREEN_RATIO_MAX;
    const satOk = result.avgSaturation >= SATURATION_MIN;

    const isHigh =
      confOk && marginOk && entropyOk && dropOffOk && bottomOk && greenOk && satOk;

    // ━━━ 非花卉 / 低置信度 ━━━
    if (!isHigh) {
      return (
        <View style={styles.resultScroll}>
          <NeumorphView level="l2" bg={pageBg}>
            <Image source={{uri: imageUri}} style={styles.heroImage} />
            <View style={styles.heroBody}>
              <Text style={styles.notFlowerIcon}>🔍</Text>
              <Text style={[styles.notFlowerTitle, {color: textColor}]}>
                未识别到花卉
              </Text>
              <Text style={[styles.notFlowerHint, {color: secondaryColor}]}>
                请重新拍摄花卉照片{'\n'}确保花朵在画面中央、光线充足
              </Text>
              <Button
                mode="contained"
                onPress={handleReset}
                style={styles.retryButton}
                labelStyle={styles.retryButtonText}>
                重新拍摄
              </Button>
            </View>
          </NeumorphView>
        </View>
      );
    }

    // ━━━ HIGH：杂志式排版 ━━━
    return (
      <View style={styles.resultScroll}>

        {/* ── Hero：大图 + 花名 + 置信度 ── */}
        <NeumorphView level="l2" bg={pageBg}>
          <Image source={{uri: imageUri}} style={styles.heroImage} />
          <View style={styles.heroBody}>
            <Text style={[styles.flowerName, {color: textColor}]}>
              {result.topClass}
            </Text>
            <View style={styles.confRow}>
              <View style={[styles.confBadge, {backgroundColor: COLORS.primary}]}>
                <Text style={styles.confBadgeText}>
                  ✅ {(result.confidence * 100).toFixed(1)}%
                </Text>
              </View>
              <Text style={[styles.inferTime, {color: secondaryColor}]}>
                {modelEp ?? 'CPU'} · {result.inferenceTimeMs.toFixed(0)}ms
              </Text>
            </View>
          </View>
        </NeumorphView>

        {/* ── 花卉档案：2 列网格 ── */}
        <NeumorphView level="l1" bg={pageBg}>
          <View style={styles.card}>
            <Text style={[styles.cardTitle, {color: textColor}]}>📋 花卉档案</Text>
            {knowledge ? (
              <View style={styles.grid}>
                <View style={styles.gridCell}>
                  <Text style={[styles.gridLabel, {color: secondaryColor}]}>学名</Text>
                  <Text style={[styles.gridValue, {color: textColor}]}>{knowledge.scientificName}</Text>
                </View>
                <View style={styles.gridCell}>
                  <Text style={[styles.gridLabel, {color: secondaryColor}]}>科属</Text>
                  <Text style={[styles.gridValue, {color: textColor}]}>{knowledge.family} · {knowledge.genus}</Text>
                </View>
                <View style={styles.gridCell}>
                  <Text style={[styles.gridLabel, {color: secondaryColor}]}>产地</Text>
                  <Text style={[styles.gridValue, {color: textColor}]}>{knowledge.origin}</Text>
                </View>
                <View style={styles.gridCell}>
                  <Text style={[styles.gridLabel, {color: secondaryColor}]}>花期</Text>
                  <Text style={[styles.gridValue, {color: textColor}]}>{knowledge.bloomPeriod}</Text>
                </View>
              </View>
            ) : (
              <View style={styles.knowledgePlaceholder}>
                <Text style={[styles.knowledgePlaceholderIcon, {color: textColor}]}>📚</Text>
                <Text style={[styles.knowledgePlaceholderText, {color: secondaryColor}]}>
                  知识库建设中，更多花卉养护知识即将上线
                </Text>
              </View>
            )}
          </View>
        </NeumorphView>

        {/* ── 概率 + 提示 ── */}
        <NeumorphView level="l1" bg={pageBg}>
          <View style={styles.card}>
            <Text style={[styles.cardTitle, {color: textColor}]}>各类别概率</Text>
            {result.allClasses.map((item, i) => (
              <View key={i} style={styles.probRow}>
                <Text style={[styles.probLabel, {color: textColor}]}>{item.name}</Text>
                <View style={[styles.probTrack, {backgroundColor: trackBg}]}>
                  <View style={[styles.probBar, {width: `${(item.probability * 100).toFixed(1)}%` as any}]} />
                </View>
                <Text style={[styles.probValue, {color: textColor}]}>
                  {(item.probability * 100).toFixed(1)}%
                </Text>
              </View>
            ))}
            <View style={[styles.hintBox, {backgroundColor: hintGreenBg}]}>
              <Text style={[styles.hintText, {color: hintGreenText}]}>
                🎯 高置信度，结果可直接使用
              </Text>
            </View>
          </View>
        </NeumorphView>

        {/* ── 操作按钮：3 个横排 ── */}
        <View style={styles.actionRow}>
          <Button mode="outlined" compact
            onPress={() => Alert.alert('提醒功能即将上线', '敬请期待！')}
            style={styles.actionBtn} labelStyle={styles.actionBtnLabel}>
            🔔 提醒
          </Button>
          <Button mode="outlined" compact
            onPress={() => Alert.alert('纠错功能即将上线', '感谢您的反馈！')}
            style={styles.actionBtn} labelStyle={styles.actionBtnLabel}>
            ✏️ 纠错
          </Button>
          <Button mode="contained" compact
            onPress={handleReset}
            style={styles.actionBtn} labelStyle={styles.actionBtnLabel}>
            重新识别
          </Button>
        </View>
      </View>
    );
  };

  const renderError = (message: string) => (
    <View style={styles.centerContent}>
      <Text style={[styles.errorEmoji, {color: RED}]}>⚠️</Text>
      <Text style={[styles.errorText, {color: RED}]}>{message}</Text>
      <Button mode="contained" onPress={handleRetry} style={styles.retryButton} labelStyle={styles.retryButtonText}>
        重试
      </Button>
    </View>
  );

  // ━━━ 主布局 ━━━

  const modelLoaded = YoloService.getInstance().isLoaded;
  const modelEp = YoloService.getInstance().info?.executionProvider;

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
      style={[styles.container, {backgroundColor: pageBg}]}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}>
      <Text style={[styles.title, {color: textColor}]}>
        🌿 智慧花园
      </Text>

      {modelLoaded && (
        <View style={styles.modelBadge}>
          <Text style={styles.modelBadgeText}>
            {modelEp ?? 'CPU'} 就绪
          </Text>
        </View>
      )}

      {renderContent()}
    </ScrollView>
  );
}

// ━━━ 样式 ━━━

const styles = StyleSheet.create({
  root: {flex: 1},
  container: {flex: 1},
  scrollContent: {padding: 20, paddingBottom: 60},
  title: {
    fontSize: 22,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 6,
  },
  modelBadge: {
    alignSelf: 'center',
    backgroundColor: GREEN,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 3,
    marginBottom: 20,
  },
  modelBadgeText: {color: '#fff', fontSize: 12, fontWeight: '600'},

  // idle
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 80,
  },
  emoji: {fontSize: 60, marginBottom: 16},
  hint: {fontSize: 15, textAlign: 'center', lineHeight: 22, marginBottom: 24},
  idleButtonRow: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
  },
  captureButton: {
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.pill,
    paddingVertical: 14,
    paddingHorizontal: 24,
  },
  captureButtonText: {color: '#fff', fontSize: 17, fontWeight: '600'},
  albumButtonStyle: {
    borderColor: GREEN,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 24,
  },
  albumButtonLabel: {color: GREEN, fontSize: 17, fontWeight: '600'},
  statusText: {fontSize: 16, marginTop: 16, textAlign: 'center'},

  // inferring
  preview: {width: 224, height: 224, borderRadius: 12, marginBottom: 12},
  spinner: {marginBottom: 8},

  // result
  resultScroll: {width: '100%', alignItems: 'center', paddingBottom: 40},

  // hero
  heroImage: {
    width: '100%',
    height: 240,
    borderTopLeftRadius: RADIUS.lg,
    borderTopRightRadius: RADIUS.lg,
  },
  heroBody: {
    padding: 20,
    alignItems: 'center',
  },
  flowerName: {fontSize: 30, fontWeight: '700', marginBottom: 10},
  confRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  // grid knowledge
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 4,
  },
  gridCell: {
    width: '50%',
    paddingVertical: 8,
    paddingRight: 8,
  },
  gridLabel: {fontSize: 12, marginBottom: 2},
  gridValue: {fontSize: 14, fontWeight: '500'},
  knowledgePlaceholder: {
    alignItems: 'center',
    paddingVertical: 20,
  },
  knowledgePlaceholderIcon: {fontSize: 28, marginBottom: 6},
  knowledgePlaceholderText: {fontSize: 13, opacity: 0.5},
  confBadge: {
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 6,
    marginBottom: 8,
  },
  confBadgeText: {color: '#fff', fontSize: 16, fontWeight: '600'},
  inferTime: {fontSize: 13, opacity: 0.6},

  // prob bars
  card: {
    width: '100%',
    borderRadius: RADIUS.lg,
    padding: 18,
    marginBottom: 14,
  },
  cardTitle: {fontSize: 16, fontWeight: '600', marginBottom: 10},
  probRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  probLabel: {width: 56, fontSize: 13},
  probTrack: {
    flex: 1,
    height: 10,
    borderRadius: 5,
    marginHorizontal: 8,
    overflow: 'hidden',
  },
  probBar: {
    height: '100%',
    backgroundColor: BLUE,
    borderRadius: 5,
  },
  probValue: {
    width: 56,
    fontSize: 12,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    textAlign: 'right',
  },

  // hints
  hintBox: {
    width: '100%',
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
  },
  hintWarn: {},
  hintError: {},
  hintText: {fontSize: 13, textAlign: 'center'},

  // ── 未识别到花卉 ──
  notFlowerIcon: {fontSize: 48, textAlign: 'center', marginBottom: 12},
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
  },

  // action row
  actionRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
    marginBottom: 20,
    width: '100%',
    paddingHorizontal: 16,
  },
  actionBtn: {
    flex: 1,
    borderRadius: RADIUS.pill,
    paddingVertical: 8,
  },
  actionBtnLabel: {fontSize: 13, fontWeight: '600'},
  // retry (used in not-flower)
  retryButton: {
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.pill,
    paddingVertical: 12,
    paddingHorizontal: 28,
    marginTop: 16,
  },
  retryButtonText: {color: '#fff', fontSize: 15, fontWeight: '600'},

  // error
  errorEmoji: {fontSize: 48},
  errorText: {fontSize: 15, textAlign: 'center', marginVertical: 16, paddingHorizontal: 20},
});

export default RecognizeScreen;

/**
 * RecognizeScreen — 花卉识别主界面
 *
 * 流程: 点击选图 → 预处理 → ONNX 推理 → 显示结果
 */

import React, {useCallback, useLayoutEffect, useState} from 'react';
import {
  Image,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
  ActivityIndicator,
  useColorScheme,
} from 'react-native';
import {Button} from 'react-native-paper';
import {useNavigation} from '@react-navigation/native';
import {launchImageLibrary} from 'react-native-image-picker';
import YoloService from '../services/YoloService';
import CameraViewfinder from '../components/CameraViewfinder';
import type {InferenceResult} from '../services/YoloService';
import {
  DROP_OFF_THRESHOLD,
  BOTTOM_SUM_MAX,
  GREEN_RATIO_MAX,
  SATURATION_MIN,
} from '../constants';

// ━━━ 状态 ━━━

type ScreenState =
  | {phase: 'idle'}
  | {phase: 'camera'}
  | {phase: 'loading-model'}
  | {phase: 'preprocessing'}
  | {phase: 'inferring'; imageUri: string}
  | {phase: 'result'; imageUri: string; result: InferenceResult}
  | {phase: 'error'; message: string};

// ━━━ 颜色 ━━━

const GREEN = '#2ecc71';
const RED = '#e74c3c';
const BLUE = '#3498db';

function RecognizeScreen(): React.JSX.Element {
  const isDarkMode = useColorScheme() === 'dark';
  const [state, setState] = useState<ScreenState>({phase: 'loading-model'});
  const navigation = useNavigation();

  const bg = isDarkMode ? '#1a1a2e' : '#f0f4f3';
  const textColor = isDarkMode ? '#e0e0e0' : '#333';
  const cardBg = isDarkMode ? '#16213e' : '#ffffff';

  // ━━━ 模型加载 ━━━

  React.useEffect(() => {
    let cancelled = false;
    async function init() {
      try {
        await YoloService.getInstance().loadModel();
        if (!cancelled) {
          setState({phase: 'idle'});
        }
      } catch (e: any) {
        if (!cancelled) {
          setState({phase: 'error', message: `模型加载失败: ${e.message}`});
        }
      }
    }
    init();
    return () => { cancelled = true; };
  }, []);

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
          backgroundColor: isDarkMode ? '#1a1a2e' : '#ffffff',
          borderTopColor: isDarkMode ? '#333333' : '#e0e0e0',
          borderTopWidth: 1,
        },
      });
    }
    return () => {
      parent.setOptions({
        tabBarStyle: {
          backgroundColor: isDarkMode ? '#1a1a2e' : '#ffffff',
          borderTopColor: isDarkMode ? '#333333' : '#e0e0e0',
          borderTopWidth: 1,
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
      case 'loading-model':
        return renderLoading('正在加载 AI 模型...');

      case 'idle':
        return renderIdle();

      case 'preprocessing':
        return renderLoading('正在处理图片...');

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
          style={styles.captureButton}
          labelStyle={styles.captureButtonText}>
          拍照识别
        </Button>
        <Button
          mode="outlined"
          onPress={handlePickImage}
          style={styles.albumButtonStyle}
          labelStyle={styles.albumButtonLabel}>
          从相册选择
        </Button>
      </View>
    </View>
  );

  const renderLoading = (msg: string) => (
    <View style={styles.centerContent}>
      <ActivityIndicator size="large" color={GREEN} />
      <Text style={[styles.statusText, {color: textColor}]}>{msg}</Text>
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

    // ━━━ 非花卉 / 低置信度：统一提示重新拍摄 ━━━
    if (!isHigh) {
      return (
        <ScrollView contentContainerStyle={styles.resultScroll}>
          <Image source={{uri: imageUri}} style={styles.resultPreview} />
          <View style={[styles.resultCard, {backgroundColor: cardBg}]}>
            <Text style={styles.notFlowerIcon}>🔍</Text>
            <Text style={[styles.notFlowerTitle, {color: textColor}]}>
              未识别到花卉
            </Text>
            <Text style={[styles.notFlowerHint, {color: textColor}]}>
              请重新拍摄花卉照片{'\n'}确保花朵在画面中央、光线充足
            </Text>
          </View>
          <Button
            mode="contained"
            onPress={handleReset}
            style={styles.retryButton}
            labelStyle={styles.retryButtonText}>
            重新拍摄
          </Button>
        </ScrollView>
      );
    }

    // ━━━ HIGH：正常展示识别结果 ━━━
    return (
      <ScrollView contentContainerStyle={styles.resultScroll}>

        {/* 预览缩略图 */}
        <Image source={{uri: imageUri}} style={styles.resultPreview} />

        {/* 主结果 */}
        <View style={[styles.resultCard, {backgroundColor: cardBg}]}>
          <Text style={[styles.flowerName, {color: textColor}]}>
            {result.topClass}
          </Text>

          <View style={[styles.confBadge, {backgroundColor: GREEN}]}>
            <Text style={styles.confBadgeText}>
              ✅ 置信度: {(result.confidence * 100).toFixed(1)}%
            </Text>
          </View>

          <Text style={[styles.inferTime, {color: textColor}]}>
            推理耗时: {result.inferenceTimeMs.toFixed(1)}ms
          </Text>
        </View>

        {/* 各类别概率 */}
        <View style={[styles.card, {backgroundColor: cardBg}]}>
          <Text style={[styles.cardTitle, {color: textColor}]}>
            各类别概率
          </Text>
          {result.allClasses.map((item, i) => (
            <View key={i} style={styles.probRow}>
              <Text style={[styles.probLabel, {color: textColor}]}>
                {item.name}
              </Text>
              <View style={styles.probTrack}>
                <View
                  style={[
                    styles.probBar,
                    {width: `${(item.probability * 100).toFixed(1)}%` as any},
                  ]}
                />
              </View>
              <Text style={[styles.probValue, {color: textColor}]}>
                {(item.probability * 100).toFixed(1)}%
              </Text>
            </View>
          ))}
        </View>

        {/* 置信度说明 */}
        <View style={styles.hintBox}>
          <Text style={styles.hintText}>
            🎯 高置信度识别，结果可直接使用
          </Text>
        </View>

        <Button mode="contained" onPress={handleReset} style={styles.retryButton} labelStyle={styles.retryButtonText}>
          识别另一张照片
        </Button>
      </ScrollView>
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

  const modelLoaded = state.phase !== 'loading-model';

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
      style={[styles.container, {backgroundColor: bg}]}
      contentContainerStyle={styles.scrollContent}>
      <Text style={[styles.title, {color: textColor}]}>
        🌿 智慧花园
      </Text>

      {modelLoaded && (
        <View style={styles.modelBadge}>
          <Text style={styles.modelBadgeText}>
            {YoloService.getInstance().info?.executionProvider ?? 'CPU'} 就绪
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
  scrollContent: {padding: 20, paddingBottom: 60, minHeight: '100%'},
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
    backgroundColor: GREEN,
    borderRadius: 12,
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
  resultScroll: {alignItems: 'center', paddingBottom: 40},
  resultPreview: {
    width: 200,
    height: 200,
    borderRadius: 12,
    marginBottom: 16,
    borderWidth: 3,
    borderColor: GREEN,
  },
  resultCard: {
    width: '100%',
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
    marginBottom: 12,
  },
  flowerName: {fontSize: 32, fontWeight: '700', marginBottom: 10},
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
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
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
    backgroundColor: '#e8e8e8',
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
    backgroundColor: '#d4edda',
    borderRadius: 8,
    marginBottom: 12,
  },
  hintWarn: {backgroundColor: '#fff3cd'},
  hintError: {backgroundColor: '#f8d7da'},
  hintText: {fontSize: 13, color: '#155724', textAlign: 'center'},

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

  // buttons
  retryButton: {
    backgroundColor: BLUE,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 28,
    marginTop: 8,
  },
  retryButtonText: {color: '#fff', fontSize: 16, fontWeight: '600'},

  // error
  errorEmoji: {fontSize: 48},
  errorText: {fontSize: 15, textAlign: 'center', marginVertical: 16, paddingHorizontal: 20},
});

export default RecognizeScreen;

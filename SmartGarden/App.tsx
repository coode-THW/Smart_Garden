/**
 * SmartGarden — ONNX 模型加载验证
 *
 * 验证 YOLOv11n 花卉分类模型能否在手机上正常加载和推理。
 *
 * 模型加载策略：
 *   1. 从 Metro 打包的 assets 中获取本地文件路径（Release 模式）
 *   2. Android 回退：直接从 APK assets 按文件名加载
 *   3. Debug 模式：fetch 模型字节后通过 buffer 加载
 */

import React, {useCallback, useEffect, useState} from 'react';
import {
  Image,
  Platform,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useColorScheme,
} from 'react-native';
import {InferenceSession, Tensor} from 'onnxruntime-react-native';

// ━━━ 5 种花卉类别 ━━━
const CLASS_NAMES = ['雏菊', '蒲公英', '玫瑰', '向日葵', '郁金香'];

// ━━━ Metro 打包的模型资源 ━━━
// metro.config.js 已添加 'onnx' 到 assetExts
const MODEL_ASSET = require('./assets/yolov11n-flower.onnx');

// ━━━ 类型 ━━━
type ModelState =
  | {status: 'loading'}
  | {status: 'loaded'; inputShape: number[]; outputShape: number[]; ep: string}
  | {status: 'error'; message: string};

function App(): React.JSX.Element {
  const isDarkMode = useColorScheme() === 'dark';
  const [modelState, setModelState] = useState<ModelState>({status: 'loading'});
  const [inferResult, setInferResult] = useState<number[] | null>(null);
  const [inferTime, setInferTime] = useState<number | null>(null);
  const [session, setSession] = useState<InferenceSession | null>(null);

  // ━━━ 获取模型真实路径/数据 ━━━
  const resolveModel = useCallback(async (): Promise<string | Uint8Array> => {
    // 方案 A：通过 Image.resolveAssetSource 获取本地路径
    const resolved = Image.resolveAssetSource(MODEL_ASSET);
    console.log('[SmartGarden] asset URI:', resolved.uri);

    // Release 模式下是 file:// 路径
    if (resolved.uri.startsWith('file://')) {
      const path = Platform.OS === 'android'
        ? resolved.uri.replace('file://', '')
        : resolved.uri;
      console.log('[SmartGarden] 使用本地文件路径:', path);
      return path;
    }

    // Debug 模式下 Metro 返回 http:// 地址
    // Android 回退：尝试从 APK assets 按文件名加载
    if (Platform.OS === 'android') {
      console.log('[SmartGarden] Debug 模式，尝试从 assets 加载...');
      return 'yolov11n-flower.onnx';
    }

    // iOS Debug 模式：fetch 模型字节 → Uint8Array
    console.log('[SmartGarden] Debug 模式，fetch 模型字节...');
    const resp = await fetch(resolved.uri);
    const buffer = await resp.arrayBuffer();
    return new Uint8Array(buffer);
  }, []);

  // ━━━ 启动时加载模型 ━━━
  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        const modelPathOrData = await resolveModel();

        if (cancelled) {
          return;
        }

        // 创建推理会话，启用移动端加速
        const sess =
          typeof modelPathOrData === 'string'
            ? await InferenceSession.create(modelPathOrData, {
                executionProviders: [
                  Platform.OS === 'ios' ? 'coreml' : 'xnnpack',
                  'cpu',
                ],
              })
            : await InferenceSession.create(modelPathOrData, {
                executionProviders: [
                  Platform.OS === 'ios' ? 'coreml' : 'xnnpack',
                  'cpu',
                ],
              });

        if (cancelled) {
          return;
        }

        const inputMeta = sess.inputMetadata[0];
        const outputMeta = sess.outputMetadata[0];
        const inputShape = inputMeta.isTensor
          ? (inputMeta.shape as number[])
          : [];
        const outputShape = outputMeta.isTensor
          ? (outputMeta.shape as number[])
          : [];

        console.log('[SmartGarden] ✅ 模型加载成功');
        console.log('  输入:', sess.inputNames[0], inputShape);
        console.log('  输出:', sess.outputNames[0], outputShape);

        setSession(sess);
        setModelState({
          status: 'loaded',
          inputShape,
          outputShape,
          ep: Platform.OS === 'ios' ? 'CoreML' : 'XNNPACK',
        });
      } catch (e: unknown) {
        if (!cancelled) {
          const msg = e instanceof Error ? e.message : String(e);
          console.error('[SmartGarden] ❌ 模型加载失败:', msg);
          setModelState({status: 'error', message: msg});
        }
      }
    }

    init();

    return () => {
      cancelled = true;
    };
  }, [resolveModel]);

  // ━━━ 运行推理 ━━━
  async function runInference() {
    if (!session) {
      return;
    }

    try {
      const inputName = session.inputNames[0];
      const meta = session.inputMetadata[0];
      if (!meta.isTensor) {
        throw new Error('输入不是 Tensor 类型');
      }

      const inputShape = meta.shape as number[];
      const size = inputShape.reduce((a, b) => a * b, 1);
      const data = new Float32Array(size);

      // 填充 [-1, 1] 正态化随机值
      for (let i = 0; i < size; i++) {
        data[i] = (Math.random() - 0.5) * 2;
      }

      const tensor = new Tensor('float32', data, inputShape);

      const t0 = Date.now();
      const output = await session.run({[inputName]: tensor});
      const t1 = Date.now();

      const outName = session.outputNames[0];
      const outData = output[outName].data as Float32Array;

      console.log(
        `[SmartGarden] 推理完成 (${(t1 - t0).toFixed(1)}ms), 输出:`,
        Array.from(outData),
      );

      setInferResult(Array.from(outData));
      setInferTime(t1 - t0);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('[SmartGarden] ❌ 推理失败:', msg);
      setModelState({status: 'error', message: `推理失败: ${msg}`});
    }
  }

  // ━━━ UI 颜色 ━━━
  const bg = isDarkMode ? '#1a1a2e' : '#f0f4f3';
  const textColor = isDarkMode ? '#e0e0e0' : '#333';
  const cardBg = isDarkMode ? '#16213e' : '#ffffff';
  const green = '#2ecc71';
  const red = '#e74c3c';

  return (
    <SafeAreaView style={[styles.safeArea, {backgroundColor: bg}]}>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={[styles.title, {color: textColor}]}>
          🌿 智慧花园 — ONNX 模型验证
        </Text>

        {/* ━━ 模型状态卡片 ━━ */}
        <View style={[styles.card, {backgroundColor: cardBg}]}>
          <Text style={[styles.cardTitle, {color: textColor}]}>
            📦 模型状态
          </Text>

          {modelState.status === 'loading' && (
            <Text style={styles.statusLoading}>
              ⏳ 正在加载 ONNX 模型...
            </Text>
          )}

          {modelState.status === 'loaded' && (
            <>
              <Text style={[styles.badge, {backgroundColor: green}]}>
                ✅ 已加载
              </Text>
              <Text style={[styles.mono, {color: textColor}]}>
                加速引擎: {modelState.ep}{'\n'}
                输入形状: [{modelState.inputShape.join(', ')}]{'\n'}
                输出形状: [{modelState.outputShape.join(', ')}]{'\n'}
                模型大小: 5.9 MB
              </Text>
            </>
          )}

          {modelState.status === 'error' && (
            <>
              <Text style={[styles.badge, {backgroundColor: red}]}>
                ❌ 加载失败
              </Text>
              <Text style={[styles.mono, {color: red}]}>
                {modelState.message}
              </Text>
            </>
          )}
        </View>

        {/* ━━ 推理按钮 ━━ */}
        {modelState.status === 'loaded' && (
          <TouchableOpacity style={styles.button} onPress={runInference}>
            <Text style={styles.buttonText}>▶ 运行测试推理（随机噪声）</Text>
          </TouchableOpacity>
        )}

        {/* ━━ 推理结果卡片 ━━ */}
        {inferResult && (
          <View style={[styles.card, {backgroundColor: cardBg}]}>
            <Text style={[styles.cardTitle, {color: textColor}]}>
              📊 推理结果
              {inferTime && (
                <Text style={styles.inferTime}>
                  {' '}({inferTime.toFixed(1)}ms)
                </Text>
              )}
            </Text>

            {inferResult.map((prob, i) => (
              <View key={i} style={styles.probRow}>
                <Text style={[styles.probLabel, {color: textColor}]}>
                  {CLASS_NAMES[i]}
                </Text>
                <View style={styles.probTrack}>
                  <View
                    style={[
                      styles.probBar,
                      {width: `${Math.max(0, prob * 100).toFixed(1)}%` as any},
                    ]}
                  />
                </View>
                <Text style={[styles.probValue, {color: textColor}]}>
                  {prob.toFixed(4)}
                </Text>
              </View>
            ))}

            <View style={styles.hintBox}>
              <Text style={styles.hintText}>
                ⚠️ 以上为随机噪声输入结果，仅用于验证 ONNX 推理管线。{'\n'}
                实际识别需传入真实花卉图片的预处理张量。(224×224, mean/std 归一化)
              </Text>
            </View>
          </View>
        )}

        {/* ━━ 下一步说明 ━━ */}
        <View style={[styles.card, {backgroundColor: cardBg}]}>
          <Text style={[styles.cardTitle, {color: textColor}]}>
            📋 验证清单
          </Text>
          <Text style={[styles.checkItem, {color: textColor}]}>
            {modelState.status === 'loaded' ? '✅' : '⬜'} ONNX 模型成功加载
          </Text>
          <Text style={[styles.checkItem, {color: textColor}]}>
            {inferResult ? '✅' : '⬜'} 推理管线正常运行
          </Text>
          <Text style={[styles.checkItem, {color: textColor}]}>
            ⬜ 真实花卉图片识别（需集成图片预处理）
          </Text>
          <Text style={[styles.checkItem, {color: textColor}]}>
            ⬜ 端到端：拍照 → 预处理 → 推理 → 显示结果
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ━━━ 样式 ━━━
const styles = StyleSheet.create({
  safeArea: {flex: 1},
  scroll: {padding: 20, paddingBottom: 60},
  title: {
    fontSize: 21,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 20,
  },
  card: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 14,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  cardTitle: {fontSize: 16, fontWeight: '600', marginBottom: 10},
  badge: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    overflow: 'hidden',
    alignSelf: 'flex-start',
    marginBottom: 8,
  },
  mono: {
    fontSize: 13,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    lineHeight: 20,
  },
  statusLoading: {fontSize: 15, color: '#f0a500'},

  button: {
    backgroundColor: '#2ecc71',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 14,
  },
  buttonText: {color: '#fff', fontSize: 16, fontWeight: '600'},

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
    backgroundColor: '#3498db',
    borderRadius: 5,
  },
  probValue: {
    width: 62,
    fontSize: 12,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    textAlign: 'right',
  },
  inferTime: {fontSize: 12, color: '#999', fontWeight: '400'},

  hintBox: {
    marginTop: 10,
    padding: 10,
    backgroundColor: '#fef9e7',
    borderRadius: 8,
  },
  hintText: {fontSize: 11, color: '#856404', lineHeight: 17},

  checkItem: {fontSize: 14, marginBottom: 6, lineHeight: 20},
});

export default App;

/**
 * YoloService — ONNX 模型加载与推理单例
 *
 * 从 App.tsx 模型验证代码重构而来。
 * 使用 Singleton 模式确保模型仅加载一次。
 */

import {InferenceSession, Tensor} from 'onnxruntime-react-native';
import {Image, Platform} from 'react-native';
import {
  MODEL_INPUT_SHAPE,
  CLASS_NAMES,
  INFERENCE_TIMEOUT_MS,
  MODEL_ASSET,
} from '../constants';
import {loadImageAsTensor} from './ImagePreprocessor';
import logger from './LoggerService';

// ━━━ 类型 ━━━

export interface YoloModelInfo {
  inputName: string;
  inputShape: number[];
  outputName: string;
  outputShape: number[];
  executionProvider: string;
}

export interface InferenceResult {
  probabilities: Float32Array;
  topClass: string;
  confidence: number;
  /** top1 与 top2 的置信度差距（越大越确定） */
  margin: number;
  /** 概率分布熵值（越小越集中，越大越均匀=不确定） */
  entropy: number;
  /** top1/top2 比值：低于 3 说明模型在两个类别间犹豫 */
  dropOff: number;
  /** 第 4、5 名概率之和：超过 0.06 说明概率太分散 */
  bottomSum: number;
  /** 中心区域绿色像素占比 (0-1)，高 → 可能是叶子 */
  greenRatio: number;
  /** 中心区域平均饱和度 (0-255)，低 → 可能是墙壁/天空 */
  avgSaturation: number;
  inferenceTimeMs: number;
  allClasses: Array<{name: string; probability: number}>;
}

// ━━━ 工具函数 ━━━

function softmax(logits: Float32Array): Float32Array {
  const max = Math.max(...Array.from(logits));
  const exps = logits.map(v => Math.exp(v - max));
  const sum = exps.reduce((a, b) => a + b, 0);
  return exps.map(v => v / sum);
}

function argmax(arr: Float32Array): number {
  let maxIdx = 0;
  for (let i = 1; i < arr.length; i++) {
    if (arr[i] > arr[maxIdx]) {
      maxIdx = i;
    }
  }
  return maxIdx;
}

/** 计算概率分布的熵。值越小越集中（确定），越大越均匀（不确定） */
function computeEntropy(probs: Float32Array): number {
  let entropy = 0;
  for (let i = 0; i < probs.length; i++) {
    if (probs[i] > 0) {
      entropy -= probs[i] * Math.log(probs[i]);
    }
  }
  return entropy;
}

// ━━━ 服务类 ━━━

class YoloService {
  private static instance: YoloService;
  private session: InferenceSession | null = null;
  private modelInfo: YoloModelInfo | null = null;

  static getInstance(): YoloService {
    if (!YoloService.instance) {
      YoloService.instance = new YoloService();
    }
    return YoloService.instance;
  }

  get isLoaded(): boolean {
    return this.session !== null;
  }

  get info(): YoloModelInfo | null {
    return this.modelInfo;
  }

  // ━━━ 模型加载 ━━━

  async loadModel(
    onProgress?: (pct: number) => void,
  ): Promise<YoloModelInfo> {
    if (this.session) {
      onProgress?.(100);
      return this.modelInfo!;
    }

    onProgress?.(10);
    const modelPathOrData = await this.resolveModel();

    onProgress?.(30);
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

    onProgress?.(80);

    const inputMeta = sess.inputMetadata[0];
    const outputMeta = sess.outputMetadata[0];

    if (!inputMeta.isTensor || !outputMeta.isTensor) {
      throw new Error('模型输入/输出不是 Tensor 类型');
    }

    const ep = Platform.OS === 'ios' ? 'CoreML' : 'XNNPACK';

    onProgress?.(95);

    logger.info('YoloService', '✅ 模型加载成功');
    logger.debug('YoloService', `引擎: ${ep}`);
    logger.debug('YoloService', `输入: ${sess.inputNames[0]}`, inputMeta.shape);
    logger.debug('YoloService', `输出: ${sess.outputNames[0]}`, outputMeta.shape);

    this.session = sess;
    this.modelInfo = {
      inputName: sess.inputNames[0],
      inputShape: inputMeta.shape as number[],
      outputName: sess.outputNames[0],
      outputShape: outputMeta.shape as number[],
      executionProvider: ep,
    };

    onProgress?.(100);
    return this.modelInfo;
  }

  // ━━━ 推理 ━━━

  async predict(
    inputData: Float32Array,
    inputShape: readonly number[],
    colorFeatures?: {greenRatio: number; avgSaturation: number},
  ): Promise<InferenceResult> {
    if (!this.session) {
      throw new Error('模型未加载，请先调用 loadModel()');
    }

    if (inputData.length !== MODEL_INPUT_SHAPE.reduce((a, b) => a * b, 1)) {
      throw new Error(
        `输入数据长度错误: 期望 ${MODEL_INPUT_SHAPE.reduce((a, b) => a * b, 1)}, 实际 ${inputData.length}`,
      );
    }

    const tensor = new Tensor('float32', inputData, inputShape as number[]);
    const inputName = this.modelInfo!.inputName;
    const outputName = this.modelInfo!.outputName;

    // 超时保护
    const t0 = Date.now();
    const result = await Promise.race([
      this.session.run({[inputName]: tensor}),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error('推理超时')),
          INFERENCE_TIMEOUT_MS,
        ),
      ),
    ]);
    const t1 = Date.now();

    // ONNX 模型已内嵌 softmax，输出即概率，无需再 softmax
    const probabilities = result[outputName].data as Float32Array;
    const topIdx = argmax(probabilities);

    const allClasses = CLASS_NAMES.map((name, i) => ({
      name,
      probability: probabilities[i],
    })).sort((a, b) => b.probability - a.probability);

    // 边距：top1 与 top2 的差距，差距小说明模型在两个类别间犹豫
    const margin =
      allClasses.length >= 2
        ? allClasses[0].probability - allClasses[1].probability
        : allClasses[0].probability;

    // 跌落比：top1/top2。真花通常远超 top2，非花差距没那么大
    const dropOff =
      allClasses.length >= 2 && allClasses[1].probability > 0
        ? allClasses[0].probability / allClasses[1].probability
        : 999;

    // 底部概率和：第 4、5 名之和。真识别时模型概率集中在头部
    const bottomSum =
      allClasses.length >= 5
        ? allClasses[3].probability + allClasses[4].probability
        : 0;

    // 熵：分布越均匀 → 越不确定（5 类时最大值 ln(5) ≈ 1.61）
    const entropy = computeEntropy(probabilities);

    logger.info('YoloService', `推理完成 (${(t1 - t0).toFixed(1)}ms)`, `| 结果: ${CLASS_NAMES[topIdx]} ${(probabilities[topIdx] * 100).toFixed(1)}%`, `| 边距: ${(margin * 100).toFixed(1)}% 跌落比: ${dropOff.toFixed(1)}x`, `| 熵: ${entropy.toFixed(3)} 底部: ${(bottomSum * 100).toFixed(1)}%`,
      colorFeatures
        ? `| 绿色: ${(colorFeatures.greenRatio * 100).toFixed(0)}% 饱和: ${colorFeatures.avgSaturation.toFixed(0)}`
        : '',
    );

    return {
      probabilities,
      topClass: CLASS_NAMES[topIdx],
      confidence: probabilities[topIdx],
      margin,
      entropy,
      dropOff,
      bottomSum,
      greenRatio: colorFeatures?.greenRatio ?? 0,
      avgSaturation: colorFeatures?.avgSaturation ?? 64,
      inferenceTimeMs: t1 - t0,
      allClasses,
    };
  }

  // ━━━ 高层接口：图片路径 → 识别结果 ━━━

  /**
   * 一站式识别：输入图片路径，内部自动完成预处理 + 推理
   *
   * @param imagePath - 本地文件路径 (file:// URI 或绝对路径)
   * @returns 识别结果（花名、置信度、各类别概率、推理耗时）
   */
  async detect(imagePath: string): Promise<InferenceResult> {
    logger.info('YoloService', 'detect() 开始, 路径:', imagePath);

    // 1. 预处理：图片 → Float32Array + 颜色特征
    const {tensor, shape, greenRatio, avgSaturation} =
      await loadImageAsTensor(imagePath);

    // 2. 推理（传入颜色特征，用于非花卉判断）
    const result = await this.predict(tensor, shape, {
      greenRatio,
      avgSaturation,
    });

    logger.info('YoloService', `detect() 完成 → ${result.topClass} ${(result.confidence * 100).toFixed(1)}% (${result.inferenceTimeMs.toFixed(1)}ms)`);

    return result;
  }

  // ━━━ 资源释放 ━━━

  async release(): Promise<void> {
    this.session = null;
    this.modelInfo = null;
  }

  // ━━━ 私有：模型路径解析 ━━━

  private async resolveModel(): Promise<string | Uint8Array> {
    const resolved = Image.resolveAssetSource(MODEL_ASSET);
    logger.debug('YoloService', 'asset URI:', resolved.uri);

    // Release 模式：file:// 路径
    if (resolved.uri.startsWith('file://')) {
      const path =
        Platform.OS === 'android'
          ? resolved.uri.replace('file://', '')
          : resolved.uri;
      logger.debug('YoloService', '本地文件路径:', path);
      return path;
    }

    // Debug 模式：Metro http:// 地址 → fetch 字节
    logger.debug('YoloService', 'Debug 模式，fetch 模型字节:', resolved.uri);
    const resp = await fetch(resolved.uri);
    const buffer = await resp.arrayBuffer();
    return new Uint8Array(buffer);
  }
}

export default YoloService;

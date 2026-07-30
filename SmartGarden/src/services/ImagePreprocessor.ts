/**
 * ImagePreprocessor — 图片预处理管线
 *
 * 完整流程：
 *   1. react-native-image-resizer（原生）缩放至 224×224 + letterbox (114 灰边)
 *   2. react-native-fs 读取缩放后文件为 base64
 *   3. jpeg-js 纯 JS 解码 → RGBA Uint8Array
 *   4. 提取 RGB，除以 255 归一化到 [0, 1]
 *   5. HWC → CHW 转置 + 添加 batch 维度
 *   6. 输出 Float32Array(150528) 可直接传入 ONNX Tensor
 */

import { Platform } from 'react-native';
import jpeg from 'jpeg-js';
import RNFS from 'react-native-fs';
import ImageResizer from 'react-native-image-resizer';
import logger from './LoggerService';

import {
  MODEL_INPUT_WIDTH,
  MODEL_INPUT_HEIGHT,
  MODEL_INPUT_CHANNELS,
  MODEL_INPUT_SHAPE,
  NORMALIZE_SCALE,
} from '../constants';

// ━━━ 类型 ━━━

export interface PreprocessedInput {
  tensor: Float32Array;
  shape: readonly number[];
  originalWidth: number;
  originalHeight: number;
  /** 中心区域绿色主导像素占比 (0-1) */
  greenRatio: number;
  /** 中心区域平均饱和度 (0-255) */
  avgSaturation: number;
}

// ━━━ 纯 JS base64 → Uint8Array（不依赖 Buffer polyfill） ━━━

export function base64ToBytes(base64: string): Uint8Array {
  const lookup =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const len = base64.length;
  const bytes = new Uint8Array(
    ((len * 3) >> 2) -
      (base64[len - 1] === '=' ? (base64[len - 2] === '=' ? 2 : 1) : 0),
  );
  let j = 0;
  for (let i = 0; i < len; i += 4) {
    const a = lookup.indexOf(base64[i]);
    const b = lookup.indexOf(base64[i + 1]);
    const c = lookup.indexOf(base64[i + 2]);
    const d = lookup.indexOf(base64[i + 3]);
    bytes[j++] = (a << 2) | (b >> 4);
    if (c !== -1) bytes[j++] = ((b & 15) << 4) | (c >> 2);
    if (d !== -1) bytes[j++] = ((c & 3) << 6) | d;
  }
  return bytes;
}

// ━━━ RGBA → RGB 归一化 + HWC → CHW 转置（优化版：合并为单一循环） ━━━

/**
 * 将 RGBA Uint8Array 直接转换为 CHW 格式的归一化 Float32Array
 *
 * 优化点：
 * 1. 合并 RGBA→RGB 提取、归一化、HWC→CHW 转置三个步骤为单一循环
 * 2. 避免创建中间的 HWC 格式 Float32Array，减少一次内存分配
 * 3. 减少一次完整的嵌套循环遍历
 *
 * 输入：RGBA 格式的 Uint8Array (H×W×4)
 * 输出：CHW 格式的 Float32Array (C×H×W)
 */
function rgbaToChwTensor(
  rgba: Uint8Array,
  width: number,
  height: number,
  channels: number,
): Float32Array {
  const chw = new Float32Array(channels * height * width);

  // 单一循环完成：RGBA提取 → 归一化 → CHW转置
  // 原始方案：RGBA → HWC RGB → CHW（两次循环，两次内存分配）
  // 优化方案：RGBA → CHW（一次循环，一次内存分配）
  for (let h = 0; h < height; h++) {
    for (let w = 0; w < width; w++) {
      const rgbaIdx = (h * width + w) * 4;
      // R 通道
      chw[0 * height * width + h * width + w] = rgba[rgbaIdx] * NORMALIZE_SCALE;
      // G 通道
      chw[1 * height * width + h * width + w] =
        rgba[rgbaIdx + 1] * NORMALIZE_SCALE;
      // B 通道
      chw[2 * height * width + h * width + w] =
        rgba[rgbaIdx + 2] * NORMALIZE_SCALE;
      // 跳过 Alpha
    }
  }

  return chw;
}

// ━━━ 图片哈希计算（用于缓存去重和纠错反馈） ━━━

/**
 * 计算图片数据的哈希值（FNV-1a 算法）
 * 用于推理结果缓存的 key 和纠错反馈的去重
 */
export function computeImageHash(data: Uint8Array): string {
  let hash = 0x811c9dc5; // FNV-1a 初始值
  const prime = 0x01000193; // FNV-1a 质数

  // 采样计算：每 16 个字节取一个样本
  // 减少计算量的同时保持足够的唯一性
  const step = Math.max(1, Math.floor(data.length / 1024));
  for (let i = 0; i < data.length; i += step) {
    hash ^= data[i];
    hash *= prime;
  }

  // 转换为 8 位十六进制字符串
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/**
 * 根据图片路径生成缓存 key
 * 结合文件路径和修改时间，确保文件变更时缓存失效
 */
export function generateCacheKey(
  imagePath: string,
  fileModifiedTime?: number,
): string {
  let hash = 0;
  for (let i = 0; i < imagePath.length; i++) {
    hash = (hash << 5) - hash + imagePath.charCodeAt(i);
    hash |= 0; // Convert to 32bit integer
  }
  if (fileModifiedTime !== undefined) {
    hash = (hash << 5) - hash + fileModifiedTime;
    hash |= 0;
  }
  return `img_${hash.toString(16)}`;
}

// ━━━ 颜色特征分析（中心 50%×50% 区域） ━━━

interface ColorFeatures {
  greenRatio: number;
  avgSaturation: number;
}

function analyzeColorFeatures(
  rgba: Uint8Array,
  width: number,
  height: number,
): ColorFeatures {
  const halfW = Math.floor(width / 2);
  const halfH = Math.floor(height / 2);
  const startX = Math.floor(width / 4);
  const startY = Math.floor(height / 4);

  let greenCount = 0;
  let totalSaturation = 0;
  let pixelCount = 0;

  for (let y = startY; y < startY + halfH; y++) {
    for (let x = startX; x < startX + halfW; x++) {
      const i = (y * width + x) * 4;
      const r = rgba[i];
      const g = rgba[i + 1];
      const b = rgba[i + 2];

      // 饱和度 = max - min（简单快速，无需 HSV 转换）
      const maxC = Math.max(r, g, b);
      const minC = Math.min(r, g, b);
      totalSaturation += maxC - minC;

      // 绿色主导：G 明显大于 R 和 B（1.2 倍避免噪声）
      if (g > r * 1.2 && g > b * 1.2) {
        greenCount++;
      }

      pixelCount++;
    }
  }

  return {
    greenRatio: greenCount / pixelCount,
    avgSaturation: totalSaturation / pixelCount,
  };
}

// ━━━ 主函数 ━━━

export async function loadImageAsTensor(
  imageUri: string,
  originalWidth?: number,
  originalHeight?: number,
): Promise<PreprocessedInput> {
  // ——— 步骤 1: 原生缩放至 224×224（cover 模式 = CenterCrop） ———
  // YOLO 分类模型训练/推理使用 CenterCrop，并非 letterbox
  logger.info('Preprocessor', '开始缩放...');
  const resized = await ImageResizer.createResizedImage(
    imageUri,
    MODEL_INPUT_WIDTH,
    MODEL_INPUT_HEIGHT,
    'JPEG',
    100, // 最高质量，减少二次压缩损失（原为 95）
    0,
    undefined,
    false,
    {
      mode: 'cover', // 短边缩放到 224，居中裁切
      onlyScaleDown: false,
    },
  );
  logger.info('Preprocessor', '缩放完成:', resized.uri);

  // ——— 步骤 2: 读取文件为 base64 ———
  const filePath =
    Platform.OS === 'android'
      ? resized.uri.replace('file://', '')
      : resized.uri;
  const base64 = await RNFS.readFile(filePath, 'base64');
  logger.info('Preprocessor', 'base64 长度:', base64.length);

  // ——— 步骤 3: JPEG 解码 ———
  const jpegBytes = base64ToBytes(base64);
  const decoded = jpeg.decode(jpegBytes, { useTArray: true });
  logger.info(
    'Preprocessor',
    `JPEG 解码: ${decoded.width}x${decoded.height}, RGBA 长度=${decoded.data.length}`,
  );

  // 清理 resize 临时文件（已读入内存，不再需要）
  RNFS.unlink(filePath).catch(e =>
    logger.warn('Preprocessor', '清理临时文件失败:', e?.message ?? e),
  );

  // ——— 步骤 4: 验证尺寸（cover 模式应为 224×224） ———
  if (
    decoded.width !== MODEL_INPUT_WIDTH ||
    decoded.height !== MODEL_INPUT_HEIGHT
  ) {
    logger.warn(
      'Preprocessor',
      `resize 未产出精确尺寸 (${decoded.width}x${decoded.height})，强制填充`,
    );
    // 兜底: 简单居中裁切/填充到 224×224
    const canvas = new Uint8Array(MODEL_INPUT_WIDTH * MODEL_INPUT_HEIGHT * 4);
    // canvas 是 Uint8Array (0-255)，直接用 114 灰度值（YOLO letterbox 标准填充色）
    const padVal = 114;
    canvas.fill(padVal);
    const sx = Math.max(0, Math.floor((decoded.width - MODEL_INPUT_WIDTH) / 2));
    const sy = Math.max(
      0,
      Math.floor((decoded.height - MODEL_INPUT_HEIGHT) / 2),
    );
    const dx = Math.max(0, Math.floor((MODEL_INPUT_WIDTH - decoded.width) / 2));
    const dy = Math.max(
      0,
      Math.floor((MODEL_INPUT_HEIGHT - decoded.height) / 2),
    );
    const copyW = Math.min(decoded.width, MODEL_INPUT_WIDTH);
    const copyH = Math.min(decoded.height, MODEL_INPUT_HEIGHT);
    for (let y = 0; y < copyH; y++) {
      for (let x = 0; x < copyW; x++) {
        const srcIdx = ((sy + y) * decoded.width + (sx + x)) * 4;
        const dstIdx = ((dy + y) * MODEL_INPUT_WIDTH + (dx + x)) * 4;
        canvas[dstIdx] = decoded.data[srcIdx];
        canvas[dstIdx + 1] = decoded.data[srcIdx + 1];
        canvas[dstIdx + 2] = decoded.data[srcIdx + 2];
        canvas[dstIdx + 3] = 255;
      }
    }
    decoded.data = canvas;
  }

  const finalW = MODEL_INPUT_WIDTH;
  const finalH = MODEL_INPUT_HEIGHT;

  // ——— 步骤 5: RGBA → RGB 归一化 + HWC → CHW 转置（优化版） ———
  // 合并为单一循环，减少一次内存分配和循环遍历
  const chw = rgbaToChwTensor(
    decoded.data,
    finalW,
    finalH,
    MODEL_INPUT_CHANNELS,
  );

  // ——— 步骤 7: 验证 ———
  const totalSize = MODEL_INPUT_SHAPE.reduce((a, b) => a * b, 1);
  if (chw.length !== totalSize) {
    throw new Error(
      `预处理后数据大小异常: 期望 ${totalSize} (${MODEL_INPUT_SHAPE.join(
        'x',
      )}), 实际 ${chw.length}`,
    );
  }

  // ——— 颜色特征分析（用于后续非花卉过滤） ———
  const { greenRatio, avgSaturation } = analyzeColorFeatures(
    decoded.data,
    finalW,
    finalH,
  );

  logger.info(
    'Preprocessor',
    `✅ 预处理完成 | 输出: [${MODEL_INPUT_SHAPE.join(', ')}] | ` +
      `原始尺寸: ${originalWidth ?? '?'}x${originalHeight ?? '?'} | ` +
      `绿色占比: ${(greenRatio * 100).toFixed(0)}% | 饱和度: ${avgSaturation.toFixed(0)}`,
  );

  return {
    tensor: chw,
    shape: MODEL_INPUT_SHAPE,
    originalWidth: originalWidth ?? decoded.width,
    originalHeight: originalHeight ?? decoded.height,
    greenRatio,
    avgSaturation,
  };
}

// ━━━ 快捷函数: 半随机测试数据（兼容旧版验证用途） ━━━

export function createRandomTensor(): PreprocessedInput {
  const size = MODEL_INPUT_SHAPE.reduce((a, b) => a * b, 1);
  const data = new Float32Array(size);
  for (let i = 0; i < size; i++) {
    data[i] = Math.random();
  }
  return {
    tensor: data,
    shape: MODEL_INPUT_SHAPE,
    originalWidth: 224,
    originalHeight: 224,
    greenRatio: 0,
    avgSaturation: 64,
  };
}

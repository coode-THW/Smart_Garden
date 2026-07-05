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

import {Platform} from 'react-native';
import jpeg from 'jpeg-js';
import RNFS from 'react-native-fs';
import ImageResizer from 'react-native-image-resizer';

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

function base64ToBytes(base64: string): Uint8Array {
  const binaryStr = atob(base64);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }
  return bytes;
}

// ━━━ RGBA → RGB 归一化 ━━━

function rgbaToNormalizedRgb(
  rgba: Uint8Array,
  width: number,
  height: number,
): Float32Array {
  const pixelCount = width * height;
  const rgb = new Float32Array(pixelCount * 3);
  for (let i = 0; i < pixelCount; i++) {
    const src = i * 4;
    const dst = i * 3;
    rgb[dst] = rgba[src] * NORMALIZE_SCALE;       // R
    rgb[dst + 1] = rgba[src + 1] * NORMALIZE_SCALE; // G
    rgb[dst + 2] = rgba[src + 2] * NORMALIZE_SCALE; // B
    // 跳过 Alpha (src + 3)
  }
  return rgb;
}

// ━━━ HWC → CHW 转置 ━━━

function transposeToChw(
  rgbFlat: Float32Array,
  height: number,
  width: number,
  channels: number,
): Float32Array {
  const chw = new Float32Array(channels * height * width);
  for (let c = 0; c < channels; c++) {
    for (let h = 0; h < height; h++) {
      for (let w = 0; w < width; w++) {
        chw[c * height * width + h * width + w] =
          rgbFlat[h * width * channels + w * channels + c];
      }
    }
  }
  return chw;
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
  console.log('[Preprocessor] 开始缩放...');
  const resized = await ImageResizer.createResizedImage(
    imageUri,
    MODEL_INPUT_WIDTH,
    MODEL_INPUT_HEIGHT,
    'JPEG',
    100,    // 最高质量，减少二次压缩损失（原为 95）
    0,
    undefined,
    false,
    {
      mode: 'cover',  // 短边缩放到 224，居中裁切
      onlyScaleDown: false,
    },
  );
  console.log('[Preprocessor] 缩放完成:', resized.uri);

  // ——— 步骤 2: 读取文件为 base64 ———
  const filePath =
    Platform.OS === 'android'
      ? resized.uri.replace('file://', '')
      : resized.uri;
  const base64 = await RNFS.readFile(filePath, 'base64');
  console.log('[Preprocessor] base64 长度:', base64.length);

  // ——— 步骤 3: JPEG 解码 ———
  const jpegBytes = base64ToBytes(base64);
  const decoded = jpeg.decode(jpegBytes, {useTArray: true});
  console.log(
    `[Preprocessor] JPEG 解码: ${decoded.width}x${decoded.height}, RGBA 长度=${decoded.data.length}`,
  );

  // 清理 resize 临时文件（已读入内存，不再需要）
  RNFS.unlink(filePath).catch(e =>
    console.warn('[Preprocessor] 清理临时文件失败:', e?.message ?? e),
  );

  // ——— 步骤 4: 验证尺寸（cover 模式应为 224×224） ———
  if (decoded.width !== MODEL_INPUT_WIDTH || decoded.height !== MODEL_INPUT_HEIGHT) {
    console.warn(
      `[Preprocessor] resize 未产出精确尺寸 (${decoded.width}x${decoded.height})，强制填充`,
    );
    // 兜底: 简单居中裁切/填充到 224×224
    const canvas = new Uint8Array(MODEL_INPUT_WIDTH * MODEL_INPUT_HEIGHT * 4);
    // canvas 是 Uint8Array (0-255)，直接用 114 灰度值（YOLO letterbox 标准填充色）
    const padVal = 114;
    canvas.fill(padVal);
    const sx = Math.max(0, Math.floor((decoded.width - MODEL_INPUT_WIDTH) / 2));
    const sy = Math.max(0, Math.floor((decoded.height - MODEL_INPUT_HEIGHT) / 2));
    const dx = Math.max(0, Math.floor((MODEL_INPUT_WIDTH - decoded.width) / 2));
    const dy = Math.max(0, Math.floor((MODEL_INPUT_HEIGHT - decoded.height) / 2));
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

  // ——— 步骤 5: 提取 RGB 并归一化 ———
  const rgb = rgbaToNormalizedRgb(decoded.data, finalW, finalH);

  // ——— 步骤 6: HWC → CHW 转置 ———
  const chw = transposeToChw(rgb, finalH, finalW, MODEL_INPUT_CHANNELS);

  // ——— 步骤 7: 验证 ———
  const totalSize = MODEL_INPUT_SHAPE.reduce((a, b) => a * b, 1);
  if (chw.length !== totalSize) {
    throw new Error(
      `预处理后数据大小异常: 期望 ${totalSize} (${MODEL_INPUT_SHAPE.join('x')}), 实际 ${chw.length}`,
    );
  }

  // ——— 颜色特征分析（用于后续非花卉过滤） ———
  const {greenRatio, avgSaturation} = analyzeColorFeatures(
    decoded.data,
    finalW,
    finalH,
  );

  console.log(
    `[Preprocessor] ✅ 预处理完成 | 输出: [${MODEL_INPUT_SHAPE.join(', ')}] | ` +
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

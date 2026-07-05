/**
 * SmartGarden 常量配置
 * 与 YOLOv11n 分类模型训练参数保持一致
 */

// ━━━ 模型配置 ━━━
/** 模型输入宽度 */
export const MODEL_INPUT_WIDTH = 224;
/** 模型输入高度 */
export const MODEL_INPUT_HEIGHT = 224;
/** 模型输入通道数 (RGB) */
export const MODEL_INPUT_CHANNELS = 3;
/** 模型输入 Tensor 形状 */
export const MODEL_INPUT_SHAPE: readonly number[] = [1, 3, 224, 224];
/** 模型输入总元素数 */
export const MODEL_INPUT_SIZE = 1 * 3 * 224 * 224; // 150528

// ━━━ 花卉类别 ━━━
export const CLASS_NAMES = ['雏菊', '蒲公英', '玫瑰', '向日葵', '郁金香'] as const;
export type FlowerClass = (typeof CLASS_NAMES)[number];

// ━━━ 预处理参数 ━━━
/** YOLO 分类模型只做 /255 归一化，无 mean/std */
export const NORMALIZE_SCALE = 1.0 / 255.0;
/** letterbox 填充灰度值 (RGB 114,114,114，与 Python 训练一致) */
export const LETTERBOX_PAD_COLOR = '#727272';

// ━━━ 置信度阈值 ━━━
/** 高置信度：直接返回本地结果 */
export const HIGH_CONFIDENCE = 0.85;
/** 中等置信度：可调 LLM 增强 */
export const MID_CONFIDENCE = 0.30;
/** 低于此值判定为非花卉 */
export const LOW_CONFIDENCE = 0.30;
/** 推理超时 (ms) */
export const INFERENCE_TIMEOUT_MS = 30000;

// ━━━ 概率质量检查 ━━━
/** top1/top2 比值阈值：低于此值说明模型在两个类别间犹豫 */
export const DROP_OFF_THRESHOLD = 3.0;
/** 第 4、5 名概率和上限：超过此值说明概率分布太均匀 */
export const BOTTOM_SUM_MAX = 0.06;

// ━━━ 颜色特征检查 ━━━
/** 中心区域绿色像素占比上限：超过此值判定为叶子而非花朵 */
export const GREEN_RATIO_MAX = 0.5;
/** 中心区域最低饱和度（0-255）：低于此值可能是墙壁/天空等 */
export const SATURATION_MIN = 20;

// ━━━ 模型资源 ━━━
export const MODEL_ASSET = require('../assets/yolov11n-flower.onnx');

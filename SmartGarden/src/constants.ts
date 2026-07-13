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
/**
 * 模型实际类别顺序（与 class_order.json 保持一致）
 * 索引 0-8 对应 ONNX 输出的概率数组顺序
 *
 * 新增花卉请修改 src/data/flowerClasses.ts
 */
export {
  CLASS_NAMES_EN,
  CLASS_NAMES,
  type FlowerClass,
} from './data/flowerClasses';

// ━━━ 预处理参数 ━━━
/** YOLO 分类模型只做 /255 归一化，无 mean/std */
export const NORMALIZE_SCALE = 1.0 / 255.0;
/** letterbox 填充灰度值 (RGB 114,114,114，与 Python 训练一致) */
export const LETTERBOX_PAD_COLOR = '#727272';

// ━━━ 置信度阈值 ━━━
/** 高置信度：直接返回本地结果 */
export const HIGH_CONFIDENCE = 0.85;
/** 中等置信度：可调 LLM 增强 */
export const MID_CONFIDENCE = 0.3;
/** 低于此值判定为非花卉 */
export const LOW_CONFIDENCE = 0.3;
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

// ━━━ LLM 配置 ━━━
/** 主 LLM API 基础 URL */
export const LLM_PRIMARY_URL = 'https://api.openai.com/v1/chat/completions';
/** 备用 LLM API 基础 URL */
export const LLM_SECONDARY_URL = 'https://api.moonshot.cn/v1/chat/completions';
/** LLM 请求超时 (ms) */
export const LLM_TIMEOUT_MS = 15000;
/** LLM 最大重试次数 */
export const LLM_MAX_RETRIES = 2;
/** 主模型名称 */
export const LLM_MODEL_NAME = 'gpt-4o-mini';
/** 备用模型名称 */
export const LLM_SECONDARY_MODEL = 'moonshot-v1-8k';
/** LLM 温度参数（0-1，越低越确定性） */
export const LLM_TEMPERATURE = 0.1;

// ━━━ 环境变量名 ━━━
/** 主模型 API Key 环境变量名 */
export const LLM_PRIMARY_KEY_ENV = 'LLM_API_KEY';
/** 备用模型 API Key 环境变量名 */
export const LLM_SECONDARY_KEY_ENV = 'MOONSHOT_API_KEY';

// ━━━ 设计主题 — 新拟态 Neumorphism ━━━
// 卡片与背景同色，层次由双影（亮+暗）区分

export const COLORS = {
  /** 鼠尾草绿 — 仅用于强调文字/图标，新拟态按钮不用填色 */
  primary: '#A3B899',
  primaryDark: '#5A7A5A',

  /** 朱砂红 — 错误/警告 */
  error: '#CD5C5C',
  warning: '#E6A817',
  info: '#3B7DD8',
  success: '#5A9A6F',

  /** 页面底色 — 新拟态核心：卡片与背景同色 */
  bg: '#F9F8F4',
  bgDark: '#1E1E1C',

  /** 文字 */
  text: '#2D2D2A',
  textDark: '#E4E0D8',
  textSecondary: '#5A5A55',
  textSecondaryDark: '#8A8680',

  /** 新拟态双影 (iOS shadow) */
  lightShadow: '#FFFFFF',
  lightShadowDark: '#3A3A36',
  darkShadow: 'rgba(0,0,0,0.08)',
  darkShadowDark: 'rgba(0,0,0,0.35)',
} as const;

/** 圆角 */
export const RADIUS = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  pill: 999,
} as const;

/** 新拟态层次 — 三个深度级别 */
export const NEU_LEVEL = {
  /** L1 浅凸：小元素 */
  l1: {
    lightOffset: { width: -2, height: -2 } as const,
    darkOffset: { width: 2, height: 2 } as const,
    blur: 4,
  },
  /** L2 标准凸：卡片、按钮 */
  l2: {
    lightOffset: { width: -4, height: -4 } as const,
    darkOffset: { width: 4, height: 4 } as const,
    blur: 8,
  },
  /** L3 深凸：弹窗、CTA */
  l3: {
    lightOffset: { width: -6, height: -6 } as const,
    darkOffset: { width: 6, height: 6 } as const,
    blur: 12,
  },
} as const;

// ━━━ 模型资源 ━━━
export const MODEL_ASSET = require('../assets/yolov11n-flower.onnx');

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

// ━━━ 设计主题 — Organic/Natural 有机自然主义 ━━━
// 深森林绿 + 温暖泥土色 + 大量留白，杂志编辑感层次

// ━━━ LLM 配置 ━━━
/** 主 LLM API 基础 URL（阿里云通义千问） */
export const LLM_PRIMARY_URL =
  'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions';
/** 备用 LLM API 基础 URL（字节跳动豆包，国内可用） */
export const LLM_SECONDARY_URL = 'https://api.doubao.com/v1/chat/completions';
/** LLM 请求超时 (ms) */
export const LLM_TIMEOUT_MS = 15000;
/** LLM 最大重试次数 */
export const LLM_MAX_RETRIES = 2;
/** 主模型名称（千问视觉模型，支持图片识别） */
export const LLM_MODEL_NAME = 'qwen-vl-plus';
/** 备用模型名称（豆包视觉模型，支持图片识别） */
export const LLM_SECONDARY_MODEL = 'doubao-vl-128k';
/** LLM 温度参数（0-1，越低越确定性） */
export const LLM_TEMPERATURE = 0.1;

// ━━━ 环境变量名 ━━━
/** 主模型 API Key 环境变量名（阿里云 API Key） */
export const LLM_PRIMARY_KEY_ENV = 'QWEN_API_KEY';
/** 备用模型 API Key 环境变量名（豆包 API Key） */
export const LLM_SECONDARY_KEY_ENV = 'DOUBAO_API_KEY';

export const COLORS = {
  // 主色阶
  /** 深森林绿 — 主品牌色，用于标题、核心按钮、导航激活态 */
  forest: '#2D5A3D',
  forestLight: '#3D7A52',
  forestDark: '#1F3D2A',

  /** 鼠尾草绿 — 次要强调，用于标签、图标、装饰 */
  sage: '#A3B899',
  sageLight: '#C8DDC5',
  sageDark: '#5A7A5A',

  /** 泥土棕 — 暖色点缀，用于装饰块、分割线、次要强调 */
  earth: '#8B7355',
  earthLight: '#B8A082',
  earthDark: '#6B5A40',

  // 功能色
  /** 朱砂红 — 错误/警告/危险操作 */
  error: '#CD5C5C',
  errorLight: '#F5D0D0',
  warning: '#E6A817',
  info: '#3B7DD8',
  success: '#5A9A6F',

  // 背景色阶
  /** 页面底色 — 温暖奶油白 */
  bg: '#F7F5F0',
  bgDark: '#1A1A1A',
  /** 次级背景 — 晨露微绿 */
  bgSecondary: '#F2F7F0',
  /** 卡片背景 — 纯白 */
  card: '#FFFFFF',
  cardDark: '#252524',

  // 文字色阶
  /** 主文字 — 墨黑 */
  text: '#1A1A1A',
  textDark: '#F0EDE8',
  /** 次要文字 — 石灰 */
  textSecondary: '#6B6B6B',
  textSecondaryDark: '#9A9894',
  /** 占位文字 */
  textMuted: '#A0A0A0',
  textMutedDark: '#6B6B6B',

  // 边框与分割
  border: '#E8E4DC',
  borderDark: '#333331',
  divider: '#F0EDE8',
  dividerDark: '#2D2D2B',

  // 阴影（RGBA 用于跨平台兼容）
  shadowLight: 'rgba(0,0,0,0.04)',
  shadowMedium: 'rgba(0,0,0,0.08)',
  shadowHeavy: 'rgba(0,0,0,0.12)',
  shadowDark: 'rgba(0,0,0,0.35)',

  // ━━━ 向后兼容别名（旧名称映射到新颜色） ━━━
  /** @deprecated 请使用 COLORS.forest */
  primary: '#2D5A3D',
  /** @deprecated 请使用 COLORS.forestDark */
  primaryDark: '#1F3D2A',
  /** @deprecated 请使用 COLORS.sageLight */
  lightShadow: '#FFFFFF',
  /** @deprecated 请使用 COLORS.shadowMedium */
  darkShadow: 'rgba(0,0,0,0.08)',
} as const;

/** 圆角系统 */
export const RADIUS = {
  xs: 6,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  pill: 999,
} as const;

/** 间距系统 */
export const SPACING = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  huge: 48,
} as const;

/** 阴影样式预设 */
export const SHADOWS = {
  /** 轻阴影 — 卡片默认 */
  card: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  /** 中阴影 — 卡片悬停/强调 */
  cardHover: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 6,
  },
  /** 重阴影 — 弹窗/浮层 */
  modal: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 12,
  },
  /** 顶部阴影 — 底部导航栏 */
  top: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 8,
  },
} as const;

/** 排版系统 */
export const TYPOGRAPHY = {
  /** 页面大标题 */
  hero: {
    fontSize: 32,
    fontWeight: '700' as const,
    lineHeight: 40,
    letterSpacing: -0.5,
  },
  /** 页面标题 */
  h1: {
    fontSize: 26,
    fontWeight: '700' as const,
    lineHeight: 34,
    letterSpacing: -0.3,
  },
  /** 区块标题 */
  h2: {
    fontSize: 20,
    fontWeight: '600' as const,
    lineHeight: 28,
    letterSpacing: -0.2,
  },
  /** 卡片标题 */
  h3: {
    fontSize: 17,
    fontWeight: '600' as const,
    lineHeight: 24,
    letterSpacing: 0,
  },
  /** 正文 */
  body: {
    fontSize: 15,
    fontWeight: '400' as const,
    lineHeight: 22,
    letterSpacing: 0,
  },
  /** 次要正文 */
  bodySmall: {
    fontSize: 13,
    fontWeight: '400' as const,
    lineHeight: 20,
    letterSpacing: 0,
  },
  /** 英文标签 — 大写宽间距 */
  label: {
    fontSize: 11,
    fontWeight: '600' as const,
    lineHeight: 14,
    letterSpacing: 2.5,
  },
  /** 按钮文字 */
  button: {
    fontSize: 15,
    fontWeight: '600' as const,
    lineHeight: 20,
    letterSpacing: 0,
  },
  /** 小按钮/标签 */
  buttonSmall: {
    fontSize: 13,
    fontWeight: '600' as const,
    lineHeight: 18,
    letterSpacing: 0,
  },
  /** 数据统计 */
  stat: {
    fontSize: 28,
    fontWeight: '700' as const,
    lineHeight: 36,
    letterSpacing: -0.5,
  },
} as const;

// ━━━ 模型资源 ━━━
export const MODEL_ASSET = require('../assets/yolov11n-flower.onnx');
export const MODEL_QUANTIZATION = 'fp16' as const;

/**
 * INT8 量化模型路径（延迟加载，避免不存在时的模块解析错误）
 * 当需要使用 INT8 模型时，请先将 yolov11n-flower-int8.onnx 放置到 assets 目录
 */
export const getModelAssetInt8 = (): any => {
  try {
    return require('../assets/yolov11n-flower-int8.onnx');
  } catch (e) {
    console.warn(
      'INT8 模型文件不存在，请使用 fp16 模式或添加 yolov11n-flower-int8.onnx 到 assets 目录',
    );
    return null;
  }
};
export const MODEL_BENCHMARK_ENABLED = true;

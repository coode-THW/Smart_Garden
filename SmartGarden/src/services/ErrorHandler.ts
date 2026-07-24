/**
 * ErrorHandler — 智慧花园统一错误码处理模块
 * ==========================================
 *
 * 集中管理所有错误码对应的 UI 提示文案，提供一致的错误展示规范。
 * 与架构文档 5.1.3 节错误码定义保持一致。
 *
 * 用法：
 *   import {getErrorInfo, getErrorMessage} from '../services/ErrorHandler';
 *   const info = getErrorInfo(ErrorCode.NO_FLOWER_DETECTED);
 *   // → { title: '未识别到花卉', description: '...', suggestion: '...', severity: 'warning' }
 *   alert(info.title, info.description);
 *
 *   // 简单场景只需一条消息
 *   const msg = getErrorMessage(ErrorCode.NO_FLOWER_DETECTED);
 *   // → '未识别到花卉，请重新拍摄'
 */

import {ErrorCode} from '../types';

// ━━━ 错误等级 ━━━

export type ErrorSeverity = 'info' | 'warning' | 'error';

// ━━━ 错误信息结构 ━━━

export interface ErrorInfo {
  /** 错误码 */
  code: number;
  /** 简短标题（弹窗标题 / Toast 文字） */
  title: string;
  /** 详细说明（描述错误原因） */
  description: string;
  /** 用户建议操作（引导用户处理） */
  suggestion: string;
  /** 完整提示文案（标题 + 描述 + 建议，可直接展示） */
  fullMessage: string;
  /** 严重等级，用于 UI 颜色区分 */
  severity: ErrorSeverity;
  /** 建议 Material Design 图标名 */
  icon: string;
}

// ━━━ 错误码 → UI 信息映射 ━━━

type ErrorCodeMapValue = Omit<ErrorInfo, 'code' | 'fullMessage'>;

const ERROR_CODE_MAP: Record<number, ErrorCodeMapValue> = {
  // ── 1xxx: 参数 / 输入错误 ──

  [ErrorCode.INVALID_PARAM]: {
    title: '参数错误',
    description: '请求参数不正确，无法处理当前操作',
    suggestion: '请检查输入信息后重试',
    severity: 'warning',
    icon: 'alert-circle-outline',
  },

  [ErrorCode.IMAGE_FORMAT_UNSUPPORTED]: {
    title: '图片格式不支持',
    description: '仅支持 JPG 和 PNG 格式的图片',
    suggestion: '请选择 JPG 或 PNG 格式的图片后重试',
    severity: 'warning',
    icon: 'file-image-outline',
  },

  [ErrorCode.IMAGE_SIZE_EXCEEDED]: {
    title: '图片尺寸过大',
    description: '图片尺寸超过限制（最大 2048×2048 像素）',
    suggestion: '请选择尺寸较小的图片，或压缩后重试',
    severity: 'warning',
    icon: 'image-size-select-large',
  },

  // ── 2xxx: 识别错误 ──

  [ErrorCode.RECOGNITION_FAILED]: {
    title: '识别出错',
    description: '模型推理异常，无法完成识别',
    suggestion: '请稍后重试，如问题持续请联系反馈',
    severity: 'error',
    icon: 'alert-circle',
  },

  [ErrorCode.MODEL_NOT_LOADED]: {
    title: '模型加载中',
    description: '识别引擎尚未准备就绪',
    suggestion: '请等待模型加载完成后再试',
    severity: 'info',
    icon: 'engine-outline',
  },

  [ErrorCode.NO_FLOWER_DETECTED]: {
    title: '未识别到花卉',
    description: '图片中未检测到花卉，或图片质量过差',
    suggestion: '请重新拍摄，确保花朵在画面中央、光线充足',
    severity: 'warning',
    icon: 'flower-outline',
  },

  // ── 3xxx: 大模型错误 ──

  [ErrorCode.LLM_CALL_FAILED]: {
    title: '联网识别失败',
    description: '网络异常或云端服务暂不可用',
    suggestion: '已返回本地识别结果，请检查网络后重新尝试联网识别',
    severity: 'warning',
    icon: 'cloud-off-outline',
  },

  [ErrorCode.LLM_TIMEOUT]: {
    title: '联网识别超时',
    description: '云端识别请求超时（超过 15 秒未响应）',
    suggestion: '已返回本地识别结果，请检查网络状况后重试',
    severity: 'warning',
    icon: 'timer-off-outline',
  },

  // ── 4xxx: 数据错误 ──

  [ErrorCode.DATA_QUERY_FAILED]: {
    title: '数据获取失败',
    description: '本地数据读取异常，无法获取请求的信息',
    suggestion: '请稍后重试，如问题持续请联系反馈',
    severity: 'error',
    icon: 'database-off-outline',
  },
};

// ━━━ 兜底未知错误 ━━━

const UNKNOWN_ERROR: ErrorCodeMapValue = {
  title: '未知错误',
  description: '发生了一个未预期的错误',
  suggestion: '请重试，如问题持续请联系反馈',
  severity: 'error',
  icon: 'alert-circle',
};

function buildFullMessage(value: ErrorCodeMapValue): string {
  return `${value.title}，${value.description}。${value.suggestion}`;
}

// ━━━ 导出 API ━━━

/**
 * 获取指定错误码的完整 UI 信息。
 * 包含 title / description / suggestion / severity / icon / fullMessage。
 */
export function getErrorInfo(code: number): ErrorInfo {
  const value = ERROR_CODE_MAP[code] ?? UNKNOWN_ERROR;
  return {
    code,
    ...value,
    fullMessage: buildFullMessage(value),
  };
}

/**
 * 获取错误码的简短 UI 消息（用于 Toast、小提示）。
 * 例如："未识别到花卉，请重新拍摄"
 */
export function getErrorMessage(code: number): string {
  const info = getErrorInfo(code);
  return `${info.title}，${info.suggestion}`;
}

/**
 * 获取错误码的详细 UI 消息（用于详情页、弹窗）。
 * 例如："未识别到花卉。图片中未检测到花卉，或图片质量过差。请重新拍摄，确保花朵在画面中央、光线充足"
 */
export function getErrorDetailMessage(code: number): string {
  const info = getErrorInfo(code);
  return info.fullMessage;
}

/**
 * 获取错误等级。
 */
export function getErrorSeverity(code: number): ErrorSeverity {
  return (ERROR_CODE_MAP[code] ?? UNKNOWN_ERROR).severity;
}

/**
 * 根据错误信息文本反向匹配最接近的错误码。
 * 用于将 LLM / 运行时异常信息映射到预定义的错误码。
 */
export function inferErrorCode(errorMessage: string): ErrorCode {
  const msg = errorMessage?.toLowerCase() ?? '';

  // LLM 超时
  if (
    msg.includes('超时') ||
    msg.includes('timeout') ||
    msg.includes('timed out')
  ) {
    return ErrorCode.LLM_TIMEOUT;
  }

  // LLM 调用失败
  if (
    msg.includes('llm') ||
    msg.includes('大模型') ||
    msg.includes('api') ||
    msg.includes('fetch') ||
    msg.includes('network') ||
    msg.includes('网络') ||
    msg.includes('调用失败')
  ) {
    return ErrorCode.LLM_CALL_FAILED;
  }

  // 模型未加载
  if (
    msg.includes('模型') ||
    msg.includes('model') ||
    msg.includes('onnx') ||
    msg.includes('加载')
  ) {
    return ErrorCode.MODEL_NOT_LOADED;
  }

  // 识别失败
  if (
    msg.includes('识别') ||
    msg.includes('推理') ||
    msg.includes('predict') ||
    msg.includes('infer')
  ) {
    return ErrorCode.RECOGNITION_FAILED;
  }

  // 图片格式
  if (
    msg.includes('图片') ||
    msg.includes('image') ||
    msg.includes('format') ||
    msg.includes('格式')
  ) {
    return ErrorCode.IMAGE_FORMAT_UNSUPPORTED;
  }

  // 未检测到花卉
  if (
    msg.includes('花卉') ||
    msg.includes('flower') ||
    msg.includes('非花卉')
  ) {
    return ErrorCode.NO_FLOWER_DETECTED;
  }

  // 参数错误
  if (
    msg.includes('参数') ||
    msg.includes('param') ||
    msg.includes('invalid')
  ) {
    return ErrorCode.INVALID_PARAM;
  }

  return ErrorCode.RECOGNITION_FAILED;
}

/**
 * 根据错误信息文本获取 UI 友好的错误提示。
 * 常用于 catch 块中直接将异常转为用户可读的消息。
 */
export function getErrorMessageFromText(errorMessage: string | Error): string {
  const msg =
    typeof errorMessage === 'string'
      ? errorMessage
      : errorMessage?.message ?? '';
  const code = inferErrorCode(msg);
  return getErrorMessage(code);
}

/**
 * 获取完整 ErrorInfo 从错误信息文本。
 * 常用于 catch 块中获取结构化错误信息用于 UI 展示。
 */
export function getErrorInfoFromError(
  error: unknown,
  fallbackCode?: number,
): ErrorInfo {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : '';
  const code = message ? inferErrorCode(message) : (fallbackCode ?? ErrorCode.RECOGNITION_FAILED);
  return getErrorInfo(code);
}

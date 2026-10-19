/**
 * 智慧花园 — 识别状态机 v1.0（可执行规格）
 * ========================================
 * 依据 `docs/识别状态机设计说明_v1.0.md`（第 4 节流程、第 5 节状态定义、第 6 节优先级）。
 *
 * ── 这个模块是什么 ──
 *
 * **纯函数**：不碰 IO、不碰 UI、不调模型、不记日志。它只回答两件事：
 *   1. transition(state, event, ctx) —— 该转到哪，非法转移返回 null
 *   2. skipEventIfUnavailable(state, caps) —— 某阶段能力缺失时，自动跳过的那个事件
 *
 * 把它做成纯模块，是为了让「流程语义」能被单独评审和回归 ——
 * 不必启动相机、不必加载 ONNX。后续优化延迟时，改动流程先在这里改 + 跑测试。
 *
 * ── 关于缺失阶段（本轮重点）──
 *
 * v1.0 需要植物二分类模型与目标检测模型，当前都还没有。文档 3.3 明确：
 * 「任何前置阶段失败都不应直接等同于整个识别失败。定位失败时保留原图分类
 * 备用路径」。因此缺失阶段走**显式降级**：
 *
 *   质量检查缺失 → 视为合格（QUALITY_OK）
 *   植物二分类缺失 → 视为通过（PLANT_HIGH）
 *   主体定位缺失 → 定位失败（LOCATE_FAILED）→ 原图备用分类
 *   主体裁剪缺失 → 裁剪失败（CROP_FAILED）→ 原图备用分类
 *
 * 全部缺失时的实际路径就是今天生产代码的行为：
 *   原图 → 9 类分类 → 三分支决策
 * （见测试「全部阶段缺失时，路径与今天的实现完全一致」）
 *
 * ── 边界 ──
 *
 * 本模块**不做**识别决策本身。哪些信号参与拒识、阈值多少，仍然由
 * RecognitionOrchestrator 决定 —— 那是精度语义，属于红线，不在这里改。
 */

// ━━━━━ 状态 ━━━━━

export type RecognitionState =
  | 'IDLE'
  | 'CAPTURE_PENDING'
  | 'IMAGE_QUALITY_CHECK'
  | 'PLANT_CLASSIFY'
  | 'PLANT_CONFIRMED'
  | 'PLANT_UNCERTAIN'
  | 'NON_PLANT_REJECTED'
  | 'PLANT_LOCATE'
  | 'LOCATION_CONFIRMED'
  | 'LOCATION_UNCERTAIN'
  | 'LOCATION_FAILED'
  | 'CROP_IMAGE'
  | 'CROPPED_CLASSIFY'
  | 'ORIGINAL_CLASSIFY_FALLBACK'
  | 'MULTI_INPUT_CLASSIFY'
  | 'RESULT_VALIDATE'
  | 'LOCAL_SUCCESS'
  | 'LLM_FALLBACK'
  | 'LLM_CONFIRMED'
  | 'LLM_REJECTED'
  | 'LLM_UNCERTAIN'
  | 'LLM_FAILED'
  | 'LOW_CONFIDENCE'
  | 'RETAKE_REQUIRED'
  | 'SESSION_REJECTED';

export const STATES: RecognitionState[] = [
  'IDLE',
  'CAPTURE_PENDING',
  'IMAGE_QUALITY_CHECK',
  'PLANT_CLASSIFY',
  'PLANT_CONFIRMED',
  'PLANT_UNCERTAIN',
  'NON_PLANT_REJECTED',
  'PLANT_LOCATE',
  'LOCATION_CONFIRMED',
  'LOCATION_UNCERTAIN',
  'LOCATION_FAILED',
  'CROP_IMAGE',
  'CROPPED_CLASSIFY',
  'ORIGINAL_CLASSIFY_FALLBACK',
  'MULTI_INPUT_CLASSIFY',
  'RESULT_VALIDATE',
  'LOCAL_SUCCESS',
  'LLM_FALLBACK',
  'LLM_CONFIRMED',
  'LLM_REJECTED',
  'LLM_UNCERTAIN',
  'LLM_FAILED',
  'LOW_CONFIDENCE',
  'RETAKE_REQUIRED',
  'SESSION_REJECTED',
];

export const INITIAL_STATE: RecognitionState = 'IDLE';

/** 本轮识别已经结束的状态（可 RESTART 开始新一轮） */
const TERMINAL_STATES: RecognitionState[] = [
  'LOCAL_SUCCESS',
  'LLM_CONFIRMED',
  'LOW_CONFIDENCE',
  'SESSION_REJECTED',
];

export function isTerminal(state: RecognitionState): boolean {
  return TERMINAL_STATES.includes(state);
}

// ━━━━━ 事件 ━━━━━

export type MachineEvent =
  | 'START'
  | 'CANCEL_CAPTURE'
  | 'IMAGE_ACQUIRED'
  | 'QUALITY_OK'
  | 'QUALITY_BAD'
  | 'PLANT_HIGH'
  | 'PLANT_UNCERTAIN'
  | 'PLANT_NONE'
  | 'PLANT_OK'
  | 'RETAKE_PRIORITY'
  | 'CONTINUE_WITH_ORIGINAL'
  | 'NON_PLANT_RETAKE'
  | 'NON_PLANT_GIVE_UP'
  | 'LOCATE_OK'
  | 'LOCATE_UNCERTAIN'
  | 'LOCATE_FAILED'
  | 'CROP'
  | 'MULTI_INPUT'
  | 'USE_ORIGINAL'
  | 'CROP_OK'
  | 'CROP_TRY_OTHER'
  | 'CROP_FAILED'
  | 'CLASSIFIED'
  | 'VALIDATE_RELIABLE'
  | 'VALIDATE_UNCERTAIN'
  | 'VALIDATE_RETAKE'
  | 'VALIDATE_REJECT'
  | 'LLM_OK'
  | 'LLM_REJECT'
  | 'LLM_UNCERTAIN'
  | 'LLM_ERROR'
  | 'LLM_REJECT_RETAKE'
  | 'LLM_REJECT_FINAL'
  | 'LLM_UNCERTAIN_RETAKE'
  | 'LLM_UNCERTAIN_FINAL'
  | 'LLM_FAILED_DEGRADE'
  | 'LLM_FAILED_FINAL'
  | 'RETAKE'
  | 'RESTART';

// ━━━━━ 上下文与能力 ━━━━━

export interface MachineContext {
  /** 本轮会话已经重拍过几次 */
  attemptCount: number;
  /** 重拍上限；达到后 RETAKE 直接进 SESSION_REJECTED */
  maxAttempts: number;
  /** 当前不可用的阶段（用于记录/上报，不参与转移表判定） */
  unavailableStages: string[];
}

/** 各阶段能力。缺失的阶段由 skipEventIfUnavailable 显式降级 */
export interface StageCapabilities {
  qualityCheck: boolean;
  plantClassify: boolean;
  locate: boolean;
  crop: boolean;
}

/** 当前默认能力：四个模型阶段都还没有 */
export const NO_ADVANCED_STAGES: StageCapabilities = {
  qualityCheck: false,
  plantClassify: false,
  locate: false,
  crop: false,
};

// ━━━━━ 转移表 ━━━━━

/**
 * 静态转移表。凡是不在表里的 (state, event) 组合都视为非法转移。
 * `RETAKE_REQUIRED + RETAKE` 例外 —— 它依赖尝试次数，见 transition()。
 */
const TRANSITIONS: Partial<
  Record<RecognitionState, Partial<Record<MachineEvent, RecognitionState>>>
> = {
  IDLE: {START: 'CAPTURE_PENDING'},

  CAPTURE_PENDING: {
    CANCEL_CAPTURE: 'IDLE',
    IMAGE_ACQUIRED: 'IMAGE_QUALITY_CHECK',
  },

  IMAGE_QUALITY_CHECK: {
    QUALITY_OK: 'PLANT_CLASSIFY',
    QUALITY_BAD: 'RETAKE_REQUIRED',
  },

  PLANT_CLASSIFY: {
    PLANT_HIGH: 'PLANT_CONFIRMED',
    PLANT_UNCERTAIN: 'PLANT_UNCERTAIN',
    PLANT_NONE: 'NON_PLANT_REJECTED',
  },

  PLANT_CONFIRMED: {PLANT_OK: 'PLANT_LOCATE'},

  PLANT_UNCERTAIN: {
    RETAKE_PRIORITY: 'RETAKE_REQUIRED',
    CONTINUE_WITH_ORIGINAL: 'ORIGINAL_CLASSIFY_FALLBACK',
  },

  NON_PLANT_REJECTED: {
    NON_PLANT_RETAKE: 'RETAKE_REQUIRED',
    NON_PLANT_GIVE_UP: 'SESSION_REJECTED',
  },

  PLANT_LOCATE: {
    LOCATE_OK: 'LOCATION_CONFIRMED',
    LOCATE_UNCERTAIN: 'LOCATION_UNCERTAIN',
    LOCATE_FAILED: 'LOCATION_FAILED',
  },

  LOCATION_CONFIRMED: {CROP: 'CROP_IMAGE'},
  LOCATION_UNCERTAIN: {MULTI_INPUT: 'MULTI_INPUT_CLASSIFY'},
  LOCATION_FAILED: {USE_ORIGINAL: 'ORIGINAL_CLASSIFY_FALLBACK'},

  CROP_IMAGE: {
    CROP_OK: 'CROPPED_CLASSIFY',
    CROP_TRY_OTHER: 'MULTI_INPUT_CLASSIFY',
    CROP_FAILED: 'ORIGINAL_CLASSIFY_FALLBACK',
  },

  CROPPED_CLASSIFY: {CLASSIFIED: 'RESULT_VALIDATE'},
  ORIGINAL_CLASSIFY_FALLBACK: {CLASSIFIED: 'RESULT_VALIDATE'},
  MULTI_INPUT_CLASSIFY: {CLASSIFIED: 'RESULT_VALIDATE'},

  RESULT_VALIDATE: {
    VALIDATE_RELIABLE: 'LOCAL_SUCCESS',
    VALIDATE_UNCERTAIN: 'LLM_FALLBACK',
    VALIDATE_RETAKE: 'RETAKE_REQUIRED',
    VALIDATE_REJECT: 'SESSION_REJECTED',
  },

  LLM_FALLBACK: {
    LLM_OK: 'LLM_CONFIRMED',
    LLM_REJECT: 'LLM_REJECTED',
    LLM_UNCERTAIN: 'LLM_UNCERTAIN',
    LLM_ERROR: 'LLM_FAILED',
  },

  LLM_REJECTED: {
    LLM_REJECT_RETAKE: 'RETAKE_REQUIRED',
    LLM_REJECT_FINAL: 'SESSION_REJECTED',
  },

  LLM_UNCERTAIN: {
    LLM_UNCERTAIN_RETAKE: 'RETAKE_REQUIRED',
    LLM_UNCERTAIN_FINAL: 'SESSION_REJECTED',
  },

  LLM_FAILED: {
    LLM_FAILED_DEGRADE: 'LOW_CONFIDENCE',
    LLM_FAILED_FINAL: 'SESSION_REJECTED',
  },

  // 终端态只接受 RESTART；其余事件由转移表缺失自然变成非法
  LOCAL_SUCCESS: {RESTART: 'IDLE'},
  LLM_CONFIRMED: {RESTART: 'IDLE'},
  LOW_CONFIDENCE: {RESTART: 'IDLE'},
  SESSION_REJECTED: {RESTART: 'IDLE'},
};

// ━━━━━ 转移 ━━━━━

/**
 * 计算下一个状态。
 *
 * @returns 下一个状态；**非法转移返回 null**（调用方应记录并上报异常流程，
 *          而不是静默跳到某个默认状态 —— 隐藏非法转移会让流程 bug 极难发现）
 */
export function transition(
  state: RecognitionState,
  event: MachineEvent,
  context: MachineContext,
): RecognitionState | null {
  // 唯一依赖上下文的转移：重拍次数是否已到上限
  if (state === 'RETAKE_REQUIRED' && event === 'RETAKE') {
    return context.attemptCount >= context.maxAttempts
      ? 'SESSION_REJECTED'
      : 'CAPTURE_PENDING';
  }

  return TRANSITIONS[state]?.[event] ?? null;
}

/**
 * 判断进入 `state` 时，是否应当因为阶段能力缺失而自动跳过。
 *
 * @returns 需要自动发出的事件；null 表示该阶段可用（或该状态与阶段无关），
 *          调用方必须真正执行这一阶段。
 */
export function skipEventIfUnavailable(
  state: RecognitionState,
  caps: StageCapabilities,
): MachineEvent | null {
  switch (state) {
    case 'IMAGE_QUALITY_CHECK':
      return caps.qualityCheck ? null : 'QUALITY_OK';

    case 'PLANT_CLASSIFY':
      // 没有二分类模型时不能凭空断言「有植物」。这里记为通过，
      // 真正的把关交给后面的 9 类分类 + 决策 —— 与今天的实现一致。
      return caps.plantClassify ? null : 'PLANT_HIGH';

    case 'PLANT_LOCATE':
      // 文档 3.3：定位失败保留原图备用路径，不得直接终止
      return caps.locate ? null : 'LOCATE_FAILED';

    case 'CROP_IMAGE':
      return caps.crop ? null : 'CROP_FAILED';

    default:
      return null;
  }
}

/**
 * 计算本轮会话下一次重拍时应采用的上下文（尝试次数 +1）。
 * 由调用方在发 RETAKE 事件并真的回到 CAPTURE_PENDING 后使用。
 */
export function nextAttemptContext(context: MachineContext): MachineContext {
  return {...context, attemptCount: context.attemptCount + 1};
}

/** 新一轮会话的初始上下文 */
export function createContext(maxAttempts = 3): MachineContext {
  return {attemptCount: 0, maxAttempts, unavailableStages: []};
}

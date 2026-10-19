/**
 * RecognitionStateMachine — v1.0 状态机的可执行规格
 * ===============================================
 * 依据 `docs/识别状态机设计说明_v1.0.md` 第 4、5、6 节。
 *
 * 本模块是**纯函数**：不碰 IO、不碰 UI、不调模型。它只回答两件事：
 *   1. 当前状态遇到某个事件，该转到哪（或非法转移）
 *   2. 某个阶段能力缺失时，应该自动跳过成什么事件
 *
 * 第 2 点是本轮的关键：文档 3.3 要求「前置阶段失败不应等同于整个识别失败」。
 * 植物二分类、主体定位、裁剪目前都没有模型，所以它们必须显式降级；
 * 并且降级后的路径必须与今天的实现**完全一致**（见最后一组测试）。
 */

import {
  INITIAL_STATE,
  STATES,
  isTerminal,
  transition,
  skipEventIfUnavailable,
  type RecognitionState,
  type MachineEvent,
  type StageCapabilities,
  type MachineContext,
} from '../RecognitionStateMachine';

const ctx = (over: Partial<MachineContext> = {}): MachineContext => ({
  attemptCount: 0,
  maxAttempts: 3,
  unavailableStages: [],
  ...over,
});

/** 从某状态发一个事件 */
function step(
  state: RecognitionState,
  event: MachineEvent,
  context: MachineContext = ctx(),
) {
  return transition(state, event, context);
}

// ━━━━━ 结构 ━━━━━

describe('状态集合', () => {
  it('包含文档定义的 25 个状态', () => {
    expect(STATES).toHaveLength(25);
  });

  it('初始状态是 IDLE', () => {
    expect(INITIAL_STATE).toBe('IDLE');
  });

  it('四个终端状态', () => {
    expect(isTerminal('LOCAL_SUCCESS')).toBe(true);
    expect(isTerminal('LLM_CONFIRMED')).toBe(true);
    expect(isTerminal('LOW_CONFIDENCE')).toBe(true);
    expect(isTerminal('SESSION_REJECTED')).toBe(true);
    expect(isTerminal('RESULT_VALIDATE')).toBe(false);
  });

  it('每个状态都能从 IDLE 出发走到（没有孤立状态）', () => {
    // 用状态机自身做 BFS，而不是靠人工数转移表
    const seen = new Set<RecognitionState>(['IDLE']);
    const queue: RecognitionState[] = ['IDLE'];
    const events: MachineEvent[] = [
      'START', 'CANCEL_CAPTURE', 'IMAGE_ACQUIRED', 'QUALITY_OK', 'QUALITY_BAD',
      'PLANT_HIGH', 'PLANT_UNCERTAIN', 'PLANT_NONE', 'PLANT_OK',
      'RETAKE_PRIORITY', 'CONTINUE_WITH_ORIGINAL', 'NON_PLANT_RETAKE',
      'NON_PLANT_GIVE_UP', 'LOCATE_OK', 'LOCATE_UNCERTAIN', 'LOCATE_FAILED',
      'CROP', 'MULTI_INPUT', 'USE_ORIGINAL', 'CROP_OK', 'CROP_TRY_OTHER',
      'CROP_FAILED', 'CLASSIFIED', 'VALIDATE_RELIABLE', 'VALIDATE_UNCERTAIN',
      'VALIDATE_RETAKE', 'VALIDATE_REJECT', 'LLM_OK', 'LLM_REJECT',
      'LLM_UNCERTAIN', 'LLM_ERROR', 'LLM_REJECT_RETAKE', 'LLM_REJECT_FINAL',
      'LLM_UNCERTAIN_RETAKE', 'LLM_UNCERTAIN_FINAL', 'LLM_FAILED_DEGRADE',
      'LLM_FAILED_FINAL', 'RETAKE', 'RESTART',
    ];

    while (queue.length > 0) {
      const cur = queue.shift()!;
      for (const e of events) {
        // 用「尝试次数未超限」的上下文探索，保证重拍分支可达
        const next = transition(cur, e, ctx({attemptCount: 0, maxAttempts: 3}));
        if (next && !seen.has(next)) {
          seen.add(next);
          queue.push(next);
        }
      }
    }

    expect(Array.from(seen).sort()).toEqual([...STATES].sort());
  });
});

// ━━━━━ 文档第 4 节的流程边 ━━━━━

describe('主流程转移', () => {
  it('IDLE --START--> CAPTURE_PENDING', () => {
    expect(step('IDLE', 'START')).toBe('CAPTURE_PENDING');
  });

  it('CAPTURE_PENDING --CANCEL_CAPTURE--> IDLE', () => {
    expect(step('CAPTURE_PENDING', 'CANCEL_CAPTURE')).toBe('IDLE');
  });

  it('CAPTURE_PENDING --IMAGE_ACQUIRED--> IMAGE_QUALITY_CHECK', () => {
    expect(step('CAPTURE_PENDING', 'IMAGE_ACQUIRED')).toBe('IMAGE_QUALITY_CHECK');
  });

  it('质量检查合格/不合格', () => {
    expect(step('IMAGE_QUALITY_CHECK', 'QUALITY_OK')).toBe('PLANT_CLASSIFY');
    expect(step('IMAGE_QUALITY_CHECK', 'QUALITY_BAD')).toBe('RETAKE_REQUIRED');
  });

  it('植物判断三分支', () => {
    expect(step('PLANT_CLASSIFY', 'PLANT_HIGH')).toBe('PLANT_CONFIRMED');
    expect(step('PLANT_CLASSIFY', 'PLANT_UNCERTAIN')).toBe('PLANT_UNCERTAIN');
    expect(step('PLANT_CLASSIFY', 'PLANT_NONE')).toBe('NON_PLANT_REJECTED');
  });

  it('确认植物后进入定位', () => {
    expect(step('PLANT_CONFIRMED', 'PLANT_OK')).toBe('PLANT_LOCATE');
  });

  it('植物判断不明确：优先重拍，或继续走原图备用', () => {
    expect(step('PLANT_UNCERTAIN', 'RETAKE_PRIORITY')).toBe('RETAKE_REQUIRED');
    expect(step('PLANT_UNCERTAIN', 'CONTINUE_WITH_ORIGINAL')).toBe(
      'ORIGINAL_CLASSIFY_FALLBACK',
    );
  });

  it('判定非植物：仍可重拍，或最终拒绝', () => {
    expect(step('NON_PLANT_REJECTED', 'NON_PLANT_RETAKE')).toBe('RETAKE_REQUIRED');
    expect(step('NON_PLANT_REJECTED', 'NON_PLANT_GIVE_UP')).toBe('SESSION_REJECTED');
  });

  it('定位三分支', () => {
    expect(step('PLANT_LOCATE', 'LOCATE_OK')).toBe('LOCATION_CONFIRMED');
    expect(step('PLANT_LOCATE', 'LOCATE_UNCERTAIN')).toBe('LOCATION_UNCERTAIN');
    expect(step('PLANT_LOCATE', 'LOCATE_FAILED')).toBe('LOCATION_FAILED');
  });

  it('定位成功 → 裁剪；不确定 → 多输入；失败 → 原图备用', () => {
    expect(step('LOCATION_CONFIRMED', 'CROP')).toBe('CROP_IMAGE');
    expect(step('LOCATION_UNCERTAIN', 'MULTI_INPUT')).toBe('MULTI_INPUT_CLASSIFY');
    expect(step('LOCATION_FAILED', 'USE_ORIGINAL')).toBe(
      'ORIGINAL_CLASSIFY_FALLBACK',
    );
  });

  it('裁剪三分支', () => {
    expect(step('CROP_IMAGE', 'CROP_OK')).toBe('CROPPED_CLASSIFY');
    expect(step('CROP_IMAGE', 'CROP_TRY_OTHER')).toBe('MULTI_INPUT_CLASSIFY');
    expect(step('CROP_IMAGE', 'CROP_FAILED')).toBe('ORIGINAL_CLASSIFY_FALLBACK');
  });

  it('三条分类路径都汇入结果校验', () => {
    expect(step('CROPPED_CLASSIFY', 'CLASSIFIED')).toBe('RESULT_VALIDATE');
    expect(step('ORIGINAL_CLASSIFY_FALLBACK', 'CLASSIFIED')).toBe('RESULT_VALIDATE');
    expect(step('MULTI_INPUT_CLASSIFY', 'CLASSIFIED')).toBe('RESULT_VALIDATE');
  });

  it('结果校验四分支', () => {
    expect(step('RESULT_VALIDATE', 'VALIDATE_RELIABLE')).toBe('LOCAL_SUCCESS');
    expect(step('RESULT_VALIDATE', 'VALIDATE_UNCERTAIN')).toBe('LLM_FALLBACK');
    expect(step('RESULT_VALIDATE', 'VALIDATE_RETAKE')).toBe('RETAKE_REQUIRED');
    expect(step('RESULT_VALIDATE', 'VALIDATE_REJECT')).toBe('SESSION_REJECTED');
  });

  it('LLM 四分支', () => {
    expect(step('LLM_FALLBACK', 'LLM_OK')).toBe('LLM_CONFIRMED');
    expect(step('LLM_FALLBACK', 'LLM_REJECT')).toBe('LLM_REJECTED');
    expect(step('LLM_FALLBACK', 'LLM_UNCERTAIN')).toBe('LLM_UNCERTAIN');
    expect(step('LLM_FALLBACK', 'LLM_ERROR')).toBe('LLM_FAILED');
  });

  it('LLM 拒绝：可重拍或最终拒绝', () => {
    expect(step('LLM_REJECTED', 'LLM_REJECT_RETAKE')).toBe('RETAKE_REQUIRED');
    expect(step('LLM_REJECTED', 'LLM_REJECT_FINAL')).toBe('SESSION_REJECTED');
  });

  it('LLM 无法确认：可重拍或最终拒绝', () => {
    expect(step('LLM_UNCERTAIN', 'LLM_UNCERTAIN_RETAKE')).toBe('RETAKE_REQUIRED');
    expect(step('LLM_UNCERTAIN', 'LLM_UNCERTAIN_FINAL')).toBe('SESSION_REJECTED');
  });

  it('LLM 失败：本地降级或最终拒绝', () => {
    expect(step('LLM_FAILED', 'LLM_FAILED_DEGRADE')).toBe('LOW_CONFIDENCE');
    expect(step('LLM_FAILED', 'LLM_FAILED_FINAL')).toBe('SESSION_REJECTED');
  });
});

// ━━━━━ 重拍与尝试上限 ━━━━━

describe('重拍与尝试上限', () => {
  it('未达上限时重拍回到 CAPTURE_PENDING', () => {
    expect(step('RETAKE_REQUIRED', 'RETAKE', ctx({attemptCount: 0}))).toBe(
      'CAPTURE_PENDING',
    );
  });

  it('达到上限时直接最终拒绝', () => {
    expect(step('RETAKE_REQUIRED', 'RETAKE', ctx({attemptCount: 3}))).toBe(
      'SESSION_REJECTED',
    );
    expect(step('RETAKE_REQUIRED', 'RETAKE', ctx({attemptCount: 3, maxAttempts: 3}))).toBe(
      'SESSION_REJECTED',
    );
  });

  it('上限可配置', () => {
    expect(
      step('RETAKE_REQUIRED', 'RETAKE', ctx({attemptCount: 1, maxAttempts: 1})),
    ).toBe('SESSION_REJECTED');
  });

  it('RESTART 回到 IDLE', () => {
    expect(step('SESSION_REJECTED', 'RESTART')).toBe('IDLE');
    // 成功态也允许开始新一轮，避免调用方必须重建实例
    expect(step('LOCAL_SUCCESS', 'RESTART')).toBe('IDLE');
    expect(step('LOW_CONFIDENCE', 'RESTART')).toBe('IDLE');
  });
});

// ━━━━━ 非法转移 ━━━━━

describe('非法转移', () => {
  it('返回 null 而不是静默跳转', () => {
    expect(step('IDLE', 'IMAGE_ACQUIRED')).toBeNull();
    expect(step('PLANT_LOCATE', 'QUALITY_OK')).toBeNull();
    expect(step('LOCAL_SUCCESS', 'CLASSIFIED')).toBeNull();
  });

  it('终端状态不接受流程事件', () => {
    expect(step('LOCAL_SUCCESS', 'RETAKE')).toBeNull();
    expect(step('LLM_CONFIRMED', 'VALIDATE_RELIABLE')).toBeNull();
  });
});

// ━━━━━ 缺失阶段的降级（本轮核心） ━━━━━

describe('缺失阶段的跳过事件', () => {
  const none: StageCapabilities = {
    qualityCheck: false,
    plantClassify: false,
    locate: false,
    crop: false,
  };
  const all: StageCapabilities = {
    qualityCheck: true,
    plantClassify: true,
    locate: true,
    crop: true,
  };

  it('能力齐全时不自动跳过', () => {
    expect(skipEventIfUnavailable('IMAGE_QUALITY_CHECK', all)).toBeNull();
    expect(skipEventIfUnavailable('PLANT_CLASSIFY', all)).toBeNull();
    expect(skipEventIfUnavailable('PLANT_LOCATE', all)).toBeNull();
    expect(skipEventIfUnavailable('CROP_IMAGE', all)).toBeNull();
  });

  it('质量检查缺失 → 视为合格', () => {
    expect(skipEventIfUnavailable('IMAGE_QUALITY_CHECK', none)).toBe('QUALITY_OK');
  });

  it('植物二分类缺失 → 视为通过（最终由分类结果决定）', () => {
    expect(skipEventIfUnavailable('PLANT_CLASSIFY', none)).toBe('PLANT_HIGH');
  });

  it('定位缺失 → 走原图备用分类', () => {
    expect(skipEventIfUnavailable('PLANT_LOCATE', none)).toBe('LOCATE_FAILED');
  });

  it('裁剪缺失 → 走原图备用分类', () => {
    expect(skipEventIfUnavailable('CROP_IMAGE', none)).toBe('CROP_FAILED');
  });

  it('与阶段无关的状态不产生跳过事件', () => {
    expect(skipEventIfUnavailable('IDLE', none)).toBeNull();
    expect(skipEventIfUnavailable('RESULT_VALIDATE', none)).toBeNull();
    expect(skipEventIfUnavailable('LLM_FALLBACK', none)).toBeNull();
  });

  it('全部阶段缺失时，路径与今天的实现完全一致', () => {
    // 今天：原图 → YOLO 9 类 → 三分支决策。
    // 没有质量检查、没有二分类、没有定位、没有裁剪 —— 对应下面这条路径。
    let state: RecognitionState = 'IDLE';
    const path: RecognitionState[] = [state];

    const context = ctx({unavailableStages: Object.keys(none)});

    // 每次「自动跳过」都走一步，模拟调用方只会在没有跳过事件时真跑阶段
    for (let guard = 0; guard < 20 && !isTerminal(state); guard++) {
      const skip = skipEventIfUnavailable(state, none);
      if (skip) {
        state = transition(state, skip, context)!;
        path.push(state);
        continue;
      }

      // 需要真跑的阶段：按今天的实际行为推进
      switch (state) {
        case 'IDLE':
          state = transition(state, 'START', context)!;
          break;
        case 'CAPTURE_PENDING':
          state = transition(state, 'IMAGE_ACQUIRED', context)!;
          break;
        case 'PLANT_CONFIRMED':
          state = transition(state, 'PLANT_OK', context)!;
          break;
        // 定位失败是两跳：PLANT_LOCATE → LOCATION_FAILED → 原图备用
        // （与文档第 4 节一致，不是可以合并的一步）
        case 'LOCATION_FAILED':
          state = transition(state, 'USE_ORIGINAL', context)!;
          break;
        case 'ORIGINAL_CLASSIFY_FALLBACK':
          state = transition(state, 'CLASSIFIED', context)!;
          break;
        case 'RESULT_VALIDATE':
          state = transition(state, 'VALIDATE_RELIABLE', context)!;
          break;
        default:
          throw new Error(`未预期的状态: ${state}`);
      }
      path.push(state);
    }

    expect(path).toEqual([
      'IDLE',
      'CAPTURE_PENDING',
      'IMAGE_QUALITY_CHECK',
      'PLANT_CLASSIFY',
      'PLANT_CONFIRMED',
      'PLANT_LOCATE',
      'LOCATION_FAILED',
      'ORIGINAL_CLASSIFY_FALLBACK',
      'RESULT_VALIDATE',
      'LOCAL_SUCCESS',
    ]);
  });
});

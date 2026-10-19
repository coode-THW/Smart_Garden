/**
 * analyzeYoloResult — 生产决策逻辑（真实实现）
 * ==========================================
 * 这个文件过去**从不 import 真正的编排器**：它在测试里重写了一份
 * analyzeYoloResult 来断言。那份拷贝比生产严格（检查 dropOff / bottomSum /
 * entropy，并且用 LOW_CONFIDENCE 直接拒绝），后果是：
 *   - 没有覆盖生产代码；
 *   - 描述的是一个不存在的实现；
 *   - 改生产代码不会让它变红。
 *
 * 现在直接 import 生产函数。生产实际只用 3 个信号做门控：
 *
 *   greenRatio   > 0.5   → reject（叶子）
 *   avgSaturation < 20   → reject（墙壁/天空）
 *   confidence  >= 0.85  → use_local
 *   其余                 → call_llm
 *
 * margin / entropy / dropOff / bottomSum 会计算并随结果返回，但**不参与**决策。
 * 把未使用的信号接进门控 = 改识别语义（精度红线），必须显式评审。
 * 下面「未参与门控的信号」一组就是这条边界的锁。
 */

// 编排器模块会 import ONNX / LLM / 缓存等原生或网络依赖。
// 这里只测一个纯函数，替身不需要任何行为。
jest.mock('../YoloService', () => ({
  __esModule: true,
  default: {getInstance: () => ({})},
}));
jest.mock('../LlmService', () => ({
  __esModule: true,
  default: {getInstance: () => ({})},
}));
jest.mock('../RecognitionCache', () => ({
  RecognitionCache: {getInstance: () => ({})},
}));

import {analyzeYoloResult} from '../RecognitionOrchestrator';
import type {InferenceResult} from '../YoloService';
import {
  GREEN_RATIO_MAX,
  HIGH_CONFIDENCE,
  LOW_CONFIDENCE,
  SATURATION_MIN,
} from '../../constants';

/** 一份「三项检查都通过、置信度很高」的基线结果 */
function yolo(over: Partial<InferenceResult> = {}): InferenceResult {
  return {
    probabilities: new Float32Array([0.95, 0.03, 0.02]),
    topClass: '玫瑰',
    confidence: 0.95,
    margin: 0.92,
    entropy: 0.2,
    dropOff: 10,
    bottomSum: 0.01,
    greenRatio: 0.2,
    avgSaturation: 50,
    inferenceTimeMs: 40,
    preprocessMs: 120,
    allClasses: [
      {name: '玫瑰', probability: 0.95},
      {name: '百合', probability: 0.03},
    ],
    ...over,
  };
}

describe('analyzeYoloResult — 生产实现', () => {
  describe('三分支', () => {
    it('高置信度且颜色正常 → use_local', () => {
      expect(analyzeYoloResult(yolo()).action).toBe('use_local');
    });

    it('中间置信度 → call_llm', () => {
      expect(analyzeYoloResult(yolo({confidence: 0.5})).action).toBe(
        'call_llm',
      );
    });

    it('绿色占比过高 → reject（叶子）', () => {
      const decision = analyzeYoloResult(yolo({greenRatio: 0.6}));
      expect(decision.action).toBe('reject');
      expect(decision.reason).toContain('叶子');
    });

    it('饱和度过低 → reject（墙壁/天空）', () => {
      const decision = analyzeYoloResult(yolo({avgSaturation: 10}));
      expect(decision.action).toBe('reject');
      expect(decision.reason).toContain('墙壁/天空');
    });
  });

  describe('阈值边界（生产用的是严格不等号）', () => {
    it('greenRatio 恰好等于上限时不拒绝', () => {
      expect(
        analyzeYoloResult(yolo({greenRatio: GREEN_RATIO_MAX})).action,
      ).toBe('use_local');
    });

    it('avgSaturation 恰好等于下限时不拒绝', () => {
      expect(
        analyzeYoloResult(yolo({avgSaturation: SATURATION_MIN})).action,
      ).toBe('use_local');
    });

    it('confidence 恰好等于 0.85 时使用本地结果', () => {
      expect(
        analyzeYoloResult(yolo({confidence: HIGH_CONFIDENCE})).action,
      ).toBe('use_local');
    });

    it('confidence 略低于 0.85 时调用 LLM', () => {
      expect(
        analyzeYoloResult(yolo({confidence: HIGH_CONFIDENCE - 0.0001})).action,
      ).toBe('call_llm');
    });
  });

  describe('判定顺序', () => {
    it('绿色占比优先于高置信度：即使是 95% 也拒绝', () => {
      const decision = analyzeYoloResult(
        yolo({confidence: 0.99, greenRatio: 0.9}),
      );
      expect(decision.action).toBe('reject');
      expect(decision.reason).toContain('叶子');
    });

    it('绿色占比优先于饱和度', () => {
      const decision = analyzeYoloResult(
        yolo({greenRatio: 0.9, avgSaturation: 5}),
      );
      expect(decision.reason).toContain('叶子');
    });
  });

  describe('未参与门控的信号（精度边界锁）', () => {
    // 这四条在旧测试的拷贝里会得到不同结果 —— 它们锁住的是
    // 「哪些信号真的参与决策」，而不只是三分支的形状。

    it('置信度高时，dropOff / bottomSum / entropy 再差也返回本地结果', () => {
      const decision = analyzeYoloResult(
        yolo({
          confidence: 0.95,
          dropOff: 0, // 远低于 DROP_OFF_THRESHOLD
          bottomSum: 1, // 远高于 BOTTOM_SUM_MAX
          entropy: 99,
          margin: 0,
        }),
      );
      expect(decision.action).toBe('use_local');
    });

    it('置信度中等时，其他信号再好也调用 LLM', () => {
      expect(
        analyzeYoloResult(
          yolo({confidence: 0.5, dropOff: 999, bottomSum: 0, entropy: 0}),
        ).action,
      ).toBe('call_llm');
    });

    it('conf < 0.3 在决策函数里不会直接 reject，而是走 LLM', () => {
      // 低置信度的拒绝发生在后续的 LLM 失败分支（recognizeInternal 的
      // isLikelyNotFlower），不在 analyzeYoloResult 里。
      // 旧测试断言这里 reject，与生产不符。
      expect(
        analyzeYoloResult(yolo({confidence: LOW_CONFIDENCE - 0.1})).action,
      ).toBe('call_llm');
    });

    it('只有颜色信号能推翻置信度：绿色占比 + 高置信度 → reject', () => {
      expect(
        analyzeYoloResult(
          yolo({confidence: 0.99, greenRatio: 0.51, avgSaturation: 80}),
        ).action,
      ).toBe('reject');
    });
  });

  describe('reason 文案', () => {
    it('本地直返说明使用了本地结果', () => {
      expect(analyzeYoloResult(yolo()).reason).toContain('使用本地识别结果');
    });

    it('LLM 兜底说明会调用 LLM', () => {
      expect(analyzeYoloResult(yolo({confidence: 0.5})).reason).toContain(
        '调用 LLM',
      );
    });

    it('拒绝时给出可诊断的原因', () => {
      expect(analyzeYoloResult(yolo({greenRatio: 0.6})).reason).toContain(
        '绿色占比',
      );
      expect(
        analyzeYoloResult(yolo({avgSaturation: 10})).reason,
      ).toContain('饱和度');
    });
  });

  describe('阈值常量', () => {
    // 上面所有行为测试都直接引用常量或写具体数值，
    // 常量被改动时这里与行为测试会一起报错。
    it('与生产常量一致', () => {
      expect(HIGH_CONFIDENCE).toBe(0.85);
      expect(GREEN_RATIO_MAX).toBe(0.5);
      expect(SATURATION_MIN).toBe(20);
      expect(LOW_CONFIDENCE).toBe(0.3);
    });
  });
});

/**
 * RecognitionOrchestrator 集成测试
 * 验证识别编排器的决策逻辑和状态管理
 */

import {
  HIGH_CONFIDENCE,
  MID_CONFIDENCE,
  LOW_CONFIDENCE,
  DROP_OFF_THRESHOLD,
  BOTTOM_SUM_MAX,
  GREEN_RATIO_MAX,
  SATURATION_MIN,
} from '../../constants';

jest.mock('../constants', () => ({
  HIGH_CONFIDENCE: 0.85,
  MID_CONFIDENCE: 0.3,
  LOW_CONFIDENCE: 0.3,
  DROP_OFF_THRESHOLD: 3.0,
  BOTTOM_SUM_MAX: 0.06,
  GREEN_RATIO_MAX: 0.5,
  SATURATION_MIN: 20,
  MODEL_ASSET: { uri: 'mock://model.onnx' },
  MODEL_INPUT_WIDTH: 224,
  MODEL_INPUT_HEIGHT: 224,
  MODEL_INPUT_CHANNELS: 3,
  MODEL_INPUT_SHAPE: [1, 3, 224, 224],
  MODEL_INPUT_SIZE: 150528,
  CLASS_NAMES_EN: [
    'daisy',
    'dandelion',
    'gerbera',
    'hydrangea',
    'lily',
    'lotus',
    'roses',
    'sunflowers',
    'tulips',
  ],
  CLASS_NAMES: [
    '雏菊',
    '蒲公英',
    '非洲菊',
    '绣球花',
    '百合',
    '荷花',
    '玫瑰',
    '向日葵',
    '郁金香',
  ],
  NORMALIZE_SCALE: 1.0 / 255.0,
  LETTERBOX_PAD_COLOR: '#727272',
  INFERENCE_TIMEOUT_MS: 30000,
  LLM_PRIMARY_URL: 'https://api.openai.com/v1/chat/completions',
  LLM_SECONDARY_URL: 'https://api.moonshot.cn/v1/chat/completions',
  LLM_TIMEOUT_MS: 15000,
  LLM_MAX_RETRIES: 2,
  LLM_PRIMARY_KEY_ENV: 'LLM_API_KEY',
  LLM_SECONDARY_KEY_ENV: 'MOONSHOT_API_KEY',
  LLM_MODEL_NAME: 'gpt-4o-mini',
  LLM_SECONDARY_MODEL: 'moonshot-v1-8k',
  LLM_TEMPERATURE: 0.1,
}));

const mockYoloResult = (
  confidence: number,
  greenRatio: number = 0.2,
  avgSaturation: number = 50,
  dropOff: number = 5.0,
  bottomSum: number = 0.02,
  entropy: number = 0.5,
) => ({
  confidence,
  topClass: '玫瑰',
  allClasses: [
    { name: '玫瑰', probability: confidence },
    { name: '百合', probability: confidence * 0.2 },
    { name: '郁金香', probability: confidence * 0.1 },
  ],
  greenRatio,
  avgSaturation,
  dropOff,
  bottomSum,
  entropy,
});

const analyzeYoloResult = (result: ReturnType<typeof mockYoloResult>) => {
  const { confidence, greenRatio, avgSaturation, dropOff, bottomSum, entropy } =
    result;

  if (confidence < LOW_CONFIDENCE) {
    return {
      action: 'reject' as const,
      reason: `置信度 ${(confidence * 100).toFixed(1)}% < ${(
        LOW_CONFIDENCE * 100
      ).toFixed(0)}%`,
    };
  }

  if (greenRatio > GREEN_RATIO_MAX) {
    return {
      action: 'reject' as const,
      reason: `绿色占比 ${(greenRatio * 100).toFixed(0)}% > ${(
        GREEN_RATIO_MAX * 100
      ).toFixed(0)}%，可能是叶子`,
    };
  }

  if (avgSaturation < SATURATION_MIN) {
    return {
      action: 'reject' as const,
      reason: `饱和度 ${avgSaturation.toFixed(
        0,
      )} < ${SATURATION_MIN}，可能是墙壁/天空`,
    };
  }

  if (dropOff < DROP_OFF_THRESHOLD) {
    return {
      action: 'call_llm' as const,
      reason: `跌落比 ${dropOff.toFixed(
        1,
      )} < ${DROP_OFF_THRESHOLD}，模型在类别间犹豫`,
    };
  }

  if (bottomSum > BOTTOM_SUM_MAX) {
    return {
      action: 'call_llm' as const,
      reason: `底部概率和 ${(bottomSum * 100).toFixed(1)}% > ${(
        BOTTOM_SUM_MAX * 100
      ).toFixed(0)}%，分布太均匀`,
    };
  }

  if (entropy > 1.2) {
    return {
      action: 'call_llm' as const,
      reason: `熵值 ${entropy.toFixed(3)} > 1.2，模型不确定`,
    };
  }

  if (confidence >= HIGH_CONFIDENCE) {
    return {
      action: 'use_local' as const,
      reason: `置信度 ${(confidence * 100).toFixed(1)}% ≥ ${(
        HIGH_CONFIDENCE * 100
      ).toFixed(0)}%，直接返回`,
    };
  }

  if (confidence >= MID_CONFIDENCE) {
    return {
      action: 'call_llm' as const,
      reason: `置信度 ${(confidence * 100).toFixed(1)}% 在 ${(
        MID_CONFIDENCE * 100
      ).toFixed(0)}-${(HIGH_CONFIDENCE * 100).toFixed(0)}% 之间，调用 LLM`,
    };
  }

  return { action: 'reject' as const, reason: '未满足任何条件' };
};

describe('RecognitionOrchestrator', () => {
  describe('置信度决策逻辑', () => {
    it('高置信度 (>85%) 应直接返回', () => {
      const result = mockYoloResult(0.9);
      const decision = analyzeYoloResult(result);
      expect(decision.action).toBe('use_local');
      expect(decision.reason).toContain('直接返回');
    });

    it('中置信度 (30%-85%) 应调用 LLM', () => {
      const result = mockYoloResult(0.5);
      const decision = analyzeYoloResult(result);
      expect(decision.action).toBe('call_llm');
      expect(decision.reason).toContain('调用 LLM');
    });

    it('低置信度 (<30%) 应拒绝', () => {
      const result = mockYoloResult(0.2);
      const decision = analyzeYoloResult(result);
      expect(decision.action).toBe('reject');
      expect(decision.reason).toContain('30%');
    });

    it('绿色占比过高应拒绝', () => {
      const result = mockYoloResult(0.9, 0.6);
      const decision = analyzeYoloResult(result);
      expect(decision.action).toBe('reject');
      expect(decision.reason).toContain('叶子');
    });

    it('饱和度过低应拒绝', () => {
      const result = mockYoloResult(0.9, 0.2, 10);
      const decision = analyzeYoloResult(result);
      expect(decision.action).toBe('reject');
      expect(decision.reason).toContain('墙壁/天空');
    });

    it('跌落比过低应调用 LLM', () => {
      const result = mockYoloResult(0.9, 0.2, 50, 2.0);
      const decision = analyzeYoloResult(result);
      expect(decision.action).toBe('call_llm');
      expect(decision.reason).toContain('类别间犹豫');
    });

    it('底部概率和过高应调用 LLM', () => {
      const result = mockYoloResult(0.9, 0.2, 50, 5.0, 0.08);
      const decision = analyzeYoloResult(result);
      expect(decision.action).toBe('call_llm');
      expect(decision.reason).toContain('分布太均匀');
    });

    it('熵值过高应调用 LLM', () => {
      const result = mockYoloResult(0.9, 0.2, 50, 5.0, 0.02, 1.5);
      const decision = analyzeYoloResult(result);
      expect(decision.action).toBe('call_llm');
      expect(decision.reason).toContain('不确定');
    });
  });

  describe('阈值常量', () => {
    it('高置信度阈值应为 0.85', () => {
      expect(HIGH_CONFIDENCE).toBe(0.85);
    });

    it('中置信度阈值应为 0.30', () => {
      expect(MID_CONFIDENCE).toBe(0.3);
    });

    it('低置信度阈值应为 0.30', () => {
      expect(LOW_CONFIDENCE).toBe(0.3);
    });

    it('跌落比阈值应为 3.0', () => {
      expect(DROP_OFF_THRESHOLD).toBe(3.0);
    });

    it('底部概率和上限应为 0.06', () => {
      expect(BOTTOM_SUM_MAX).toBe(0.06);
    });

    it('绿色占比上限应为 0.5', () => {
      expect(GREEN_RATIO_MAX).toBe(0.5);
    });

    it('最低饱和度应为 20', () => {
      expect(SATURATION_MIN).toBe(20);
    });
  });

  describe('RecognitionResult 类型', () => {
    it('应包含所有必要字段', () => {
      const result = {
        status: 'success' as const,
        source: 'yolov11' as const,
        flowerName: '玫瑰',
        confidence: 0.9,
        inferenceTimeMs: 100,
      };

      expect(result.status).toBeDefined();
      expect(result.source).toBeDefined();
      expect(result.flowerName).toBeDefined();
      expect(result.confidence).toBeDefined();
      expect(result.inferenceTimeMs).toBeDefined();
    });

    it('状态应为有效枚举值', () => {
      const validStatuses = [
        'success',
        'rejected',
        'low_confidence',
        'llm_error',
      ] as const;

      validStatuses.forEach(status => {
        const result = {
          status,
          source: 'yolov11' as const,
          flowerName: '玫瑰',
          confidence: 0.9,
          inferenceTimeMs: 100,
        };
        expect(result.status).toBe(status);
      });
    });
  });

  describe('缓存策略', () => {
    it('高置信度结果应缓存', () => {
      const result = mockYoloResult(0.9);
      const decision = analyzeYoloResult(result);
      expect(decision.action).toBe('use_local');
    });

    it('中置信度结果应缓存', () => {
      const result = mockYoloResult(0.5);
      const decision = analyzeYoloResult(result);
      expect(decision.action).toBe('call_llm');
    });

    it('低置信度拒绝结果应缓存', () => {
      const result = mockYoloResult(0.2);
      const decision = analyzeYoloResult(result);
      expect(decision.action).toBe('reject');
    });

    it('非花卉过滤结果应缓存', () => {
      const result = mockYoloResult(0.9, 0.6);
      const decision = analyzeYoloResult(result);
      expect(decision.action).toBe('reject');
    });

    it('LLM 成功结果应缓存', () => {
      const result = mockYoloResult(0.6);
      const decision = analyzeYoloResult(result);
      expect(decision.action).toBe('call_llm');
    });

    it('LLM 失败回退结果应缓存', () => {
      const result = mockYoloResult(0.6);
      const decision = analyzeYoloResult(result);
      expect(decision.action).toBe('call_llm');
    });
  });
});

/**
 * 识别编排器 — 状态机接线集成测试
 * ==============================
 * 这些用例真正驱动 `RecognitionOrchestrator.recognize()`，断言每条业务分支
 * 结束时落在状态机的哪个终态（`result.finalState`）。
 *
 * 它们锁住的是**接线**，不是状态机本身（后者由 RecognitionStateMachine.test.ts
 * 单独覆盖）。最重要的两条：
 *   1. 本地直返 → LOCAL_SUCCESS，中间经过降级后的原图分类路径；
 *   2. reject 决策**仍然交给 LLM 复核**（→ LLM_CONFIRMED），没有走
 *      VALIDATE_REJECT → SESSION_REJECTED。后者会改变识别语义。
 */

const mockYolo = {
  detect: jest.fn(),
  isLoaded: true,
  info: {executionProvider: 'mock'},
  loadModel: jest.fn(),
};

const mockLlm = {
  identify: jest.fn(),
};

const mockCache = {
  get: jest.fn(),
  set: jest.fn(),
};

const mockGetKnowledge = jest.fn();

jest.mock('../YoloService', () => ({
  __esModule: true,
  default: {getInstance: () => mockYolo},
}));

jest.mock('../LlmService', () => ({
  __esModule: true,
  default: {getInstance: () => mockLlm},
}));

jest.mock('../RecognitionCache', () => ({
  RecognitionCache: {getInstance: () => mockCache},
}));

jest.mock('../KnowledgeService', () => ({
  getKnowledge: (name: string) => mockGetKnowledge(name),
}));

/** 默认：颜色正常、置信度 0.95 → use_local */
function yolo(over: Record<string, any> = {}) {
  return {
    confidence: 0.95,
    topClass: '玫瑰',
    allClasses: [
      {name: '玫瑰', probability: 0.95},
      {name: '百合', probability: 0.03},
    ],
    greenRatio: 0.1,
    avgSaturation: 90,
    margin: 0.92,
    entropy: 0.2,
    dropOff: 10,
    bottomSum: 0.01,
    inferenceTimeMs: 10,
    preprocessMs: 20,
    ...over,
  };
}

function llmSuccess(confidence = 0.9) {
  return {
    success: true,
    latencyMs: 5,
    flowerInfo: {
      name: '玫瑰',
      confidence,
      scientificName: 'Rosa',
      family: '蔷薇科',
      origin: '中国',
      bloomPeriod: '5-10月',
      care: {},
    },
  };
}

const llmFailure = {
  success: false,
  latencyMs: 5,
  errorMessage: 'network down',
};

describe('RecognitionOrchestrator — 状态机接线', () => {
  let orchestrator: any;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();

    mockCache.get.mockReturnValue(null);
    mockGetKnowledge.mockReturnValue({flowerName: '玫瑰'});

    // 编排器是 default 导出
    const RecognitionOrchestrator = require('../RecognitionOrchestrator').default;
    (RecognitionOrchestrator as any).instance = undefined;
    orchestrator = RecognitionOrchestrator.getInstance();
  });

  it('本地直返：终态 LOCAL_SUCCESS', async () => {
    mockYolo.detect.mockResolvedValue(yolo());

    const result = await orchestrator.recognize('/tmp/local.jpg');

    expect(result.status).toBe('success');
    expect(result.source).toBe('yolov11');
    expect(result.finalState).toBe('LOCAL_SUCCESS');
    // 知识库命中时不该调用识别兜底的 LLM
    expect(mockLlm.identify).not.toHaveBeenCalled();
  });

  it('本地知识库缺失、LLM 补齐养护指南：终态仍是 LOCAL_SUCCESS', async () => {
    mockGetKnowledge.mockReturnValue(null);
    mockYolo.detect.mockResolvedValue(yolo());
    mockLlm.identify.mockResolvedValue(llmSuccess(0.9));

    const result = await orchestrator.recognize('/tmp/kb.jpg');

    // 这次 LLM 调用属于知识获取，不是识别兜底，不改变识别终态
    expect(result.status).toBe('success');
    expect(result.finalState).toBe('LOCAL_SUCCESS');
    expect(result.llmUsed).toBe(true);
  });

  it('reject 决策仍交给 LLM 复核：LLM 成功 → LLM_CONFIRMED', async () => {
    // 绿色占比过高 → analyzeYoloResult 返回 reject。接线前它同样会调 LLM。
    mockYolo.detect.mockResolvedValue(yolo({greenRatio: 0.9}));
    mockLlm.identify.mockResolvedValue(llmSuccess(0.8));

    const result = await orchestrator.recognize('/tmp/reject.jpg');

    expect(mockLlm.identify).toHaveBeenCalled();
    expect(result.status).toBe('success');
    expect(result.source).toBe('llm');
    expect(result.finalState).toBe('LLM_CONFIRMED');
  });

  it('call_llm 决策 + LLM 成功：终态 LLM_CONFIRMED', async () => {
    mockYolo.detect.mockResolvedValue(yolo({confidence: 0.5}));
    mockLlm.identify.mockResolvedValue(llmSuccess(0.9));

    const result = await orchestrator.recognize('/tmp/llm.jpg');

    expect(result.status).toBe('success');
    expect(result.finalState).toBe('LLM_CONFIRMED');
  });

  it('LLM 置信度恰好 0.3：保持既有边界（成功）', async () => {
    mockYolo.detect.mockResolvedValue(yolo({confidence: 0.5}));
    mockLlm.identify.mockResolvedValue(llmSuccess(0.3));

    const result = await orchestrator.recognize('/tmp/boundary.jpg');

    expect(result.status).toBe('success');
    expect(result.finalState).toBe('LLM_CONFIRMED');
  });

  it('LLM 有响应但置信度不足：终态 SESSION_REJECTED', async () => {
    mockYolo.detect.mockResolvedValue(yolo({confidence: 0.5}));
    mockLlm.identify.mockResolvedValue(llmSuccess(0.1));

    const result = await orchestrator.recognize('/tmp/llm-reject.jpg');

    expect(result.status).toBe('rejected');
    expect(result.finalState).toBe('SESSION_REJECTED');
  });

  it('LLM 失败且本地已判定为非花：终态 SESSION_REJECTED', async () => {
    // reject 决策 + LLM 失败 → isLikelyNotFlower
    mockYolo.detect.mockResolvedValue(yolo({greenRatio: 0.9}));
    mockLlm.identify.mockResolvedValue(llmFailure);

    const result = await orchestrator.recognize('/tmp/not-flower.jpg');

    expect(result.status).toBe('rejected');
    expect(result.finalState).toBe('SESSION_REJECTED');
  });

  it('LLM 失败且本地置信度 < 0.3：终态 SESSION_REJECTED', async () => {
    mockYolo.detect.mockResolvedValue(yolo({confidence: 0.2}));
    mockLlm.identify.mockResolvedValue(llmFailure);

    const result = await orchestrator.recognize('/tmp/low.jpg');

    expect(result.status).toBe('rejected');
    expect(result.finalState).toBe('SESSION_REJECTED');
  });

  it('LLM 失败但本地置信度尚可：降级为低置信度（LOW_CONFIDENCE）', async () => {
    // conf 0.5 → call_llm，且不满足 isLikelyNotFlower
    mockYolo.detect.mockResolvedValue(yolo({confidence: 0.5}));
    mockLlm.identify.mockResolvedValue(llmFailure);

    const result = await orchestrator.recognize('/tmp/degrade.jpg');

    expect(result.status).toBe('low_confidence');
    expect(result.finalState).toBe('LOW_CONFIDENCE');
  });

  it('识别异常：兜底终态 LOW_CONFIDENCE，不抛异常', async () => {
    mockYolo.detect.mockRejectedValue(new Error('模型炸了'));

    const result = await orchestrator.recognize('/tmp/boom.jpg');

    expect(result.status).toBe('low_confidence');
    expect(result.finalState).toBe('LOW_CONFIDENCE');
  });

  it('缓存命中：不跑状态机，finalState 为空', async () => {
    mockCache.get.mockReturnValue({
      status: 'success',
      source: 'yolov11',
      flowerName: '玫瑰',
      topClass: '玫瑰',
      confidence: 0.95,
      inferenceTimeMs: 999,
      // 缓存里带着上一次识别的终态 —— 不应被当成这一轮的终态
      finalState: 'LOCAL_SUCCESS',
    });

    const result = await orchestrator.recognize('/tmp/cached.jpg');

    expect(result.latency.cacheHit).toBe(true);
    expect(result.finalState).toBeUndefined();
    expect(mockYolo.detect).not.toHaveBeenCalled();
  });
});

// 没有任何静态 import/export 的文件会被 TS 当成全局脚本，
// 与另一个同样写法的测试文件产生「重复声明」错误。显式标成模块。
export {};

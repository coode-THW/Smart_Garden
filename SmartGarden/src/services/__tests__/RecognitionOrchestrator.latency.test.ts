/**
 * 识别编排器 — 延迟分解集成测试（F1 度量）
 * ======================================
 * 这个文件**真正驱动** RecognitionOrchestrator.recognize()。
 *
 * 背景：隔壁 RecognitionOrchestrator.test.ts 从不 import 真的编排器 ——
 * 它在测试里自己重写了一份 analyzeYoloResult 来测。那份拷贝甚至比生产代码
 * 严格（拷贝检查 dropOff/bottomSum，生产只检查 greenRatio/saturation/confidence），
 * 所以它不但没覆盖生产逻辑，反而在描述一个不存在的实现。
 * 本文件用 mock 掉外部依赖的方式，把真实流程跑起来。
 */

// ━━━━━ 依赖替身 ━━━━━

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

// ━━━━━ 辅助 ━━━━━

/** 构造一份可预测的 YOLO 结果：置信度 >= 0.85 → use_local */
function yoloResult(over: Record<string, any> = {}) {
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
    dropOff: 30,
    bottomSum: 0.001,
    inferenceTimeMs: 37,
    preprocessMs: 123,
    ...over,
  };
}

const delay = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

describe('RecognitionOrchestrator — 延迟分解', () => {
  let orchestrator: any;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();

    mockCache.get.mockReturnValue(null);
    mockGetKnowledge.mockReturnValue({flowerName: '玫瑰'});

    // 编排器是 default 导出（不是具名导出）
    const RecognitionOrchestrator = require('../RecognitionOrchestrator').default;
    (RecognitionOrchestrator as any).instance = undefined;
    orchestrator = RecognitionOrchestrator.getInstance();
  });

  it('本地识别路径：预处理与推理耗时取自 YoloService 的实测值', async () => {
    mockYolo.detect.mockResolvedValue(yoloResult());

    const result = await orchestrator.recognize('/tmp/a.jpg');

    expect(result.latency).toBeDefined();
    expect(result.latency.preprocessMs).toBe(123);
    expect(result.latency.inferenceMs).toBe(37);
    expect(result.latency.cacheHit).toBe(false);
    // 这条路径没调 LLM
    expect(result.latency.llmMs).toBe(0);
    // 知识库命中，不应触发补齐调用
    expect(mockLlm.identify).not.toHaveBeenCalled();
  });

  it('totalMs 不小于各阶段之和（差额是未归因间隙）', async () => {
    // 让 mock 真的耗时，且与它上报的分段耗时一致 ——
    // 否则 mock 瞬间返回 123ms/37ms，总墙钟只有 2ms，断言就失去意义
    mockYolo.detect.mockImplementation(async () => {
      await delay(180);
      return yoloResult({preprocessMs: 123, inferenceTimeMs: 37});
    });

    const {latency} = await orchestrator.recognize('/tmp/a.jpg');
    const sum =
      latency.preprocessMs +
      latency.inferenceMs +
      latency.decisionMs +
      latency.knowledgeMs +
      latency.llmMs;

    expect(sum).toBe(160);
    expect(latency.totalMs).toBeGreaterThanOrEqual(sum);
  });

  it('缓存命中：各阶段归零并标记 cacheHit', async () => {
    mockCache.get.mockReturnValue({
      status: 'success',
      source: 'yolov11',
      flowerName: '玫瑰',
      topClass: '玫瑰',
      confidence: 0.95,
      inferenceTimeMs: 999,
    });

    const result = await orchestrator.recognize('/tmp/cached.jpg');

    expect(result.latency.cacheHit).toBe(true);
    expect(result.latency.preprocessMs).toBe(0);
    expect(result.latency.inferenceMs).toBe(0);
    expect(result.latency.llmMs).toBe(0);
    // 缓存命中根本不该跑推理
    expect(mockYolo.detect).not.toHaveBeenCalled();
  });

  it('LLM 兜底路径：llmMs 反映识别调用的真实等待', async () => {
    // 置信度 < 0.85 → call_llm
    mockYolo.detect.mockResolvedValue(yoloResult({confidence: 0.5}));
    mockLlm.identify.mockImplementation(async () => {
      await delay(20);
      return {
        success: true,
        latencyMs: 20,
        flowerInfo: {
          name: '玫瑰',
          confidence: 0.9,
          scientificName: 'Rosa',
          family: '蔷薇科',
          origin: '中国',
          bloomPeriod: '5-10月',
          care: {},
        },
      };
    });

    const {latency} = await orchestrator.recognize('/tmp/llm.jpg');

    expect(latency.llmMs).toBeGreaterThanOrEqual(15);
    // LLM 识别与知识库补齐是两回事，这里 knowledge 不应被计入
    expect(latency.knowledgeMs).toBe(0);
  });

  it('知识库缺失时补齐耗时记在 knowledgeMs，不计入 llmMs', async () => {
    mockGetKnowledge.mockReturnValue(null);
    mockYolo.detect.mockResolvedValue(yoloResult());
    mockLlm.identify.mockImplementation(async () => {
      await delay(20);
      return {
        success: true,
        latencyMs: 20,
        flowerInfo: {
          name: '玫瑰',
          confidence: 0.9,
          scientificName: 'Rosa',
          family: '蔷薇科',
          origin: '中国',
          bloomPeriod: '5-10月',
          care: {},
        },
      };
    });

    const {latency} = await orchestrator.recognize('/tmp/kb.jpg');

    // 这条路径的 LLM 调用是「取养护指南」，属知识获取
    expect(latency.knowledgeMs).toBeGreaterThanOrEqual(15);
    expect(latency.llmMs).toBe(0);
  });

  it('识别异常时仍返回带 latency 的结果，不抛异常', async () => {
    mockYolo.detect.mockRejectedValue(new Error('模型炸了'));

    const result = await orchestrator.recognize('/tmp/boom.jpg');

    expect(result.latency).toBeDefined();
    expect(result.status).toBe('low_confidence');
  });

  it('getLatencyStats 累积多次识别并区分缓存命中', async () => {
    mockYolo.detect.mockResolvedValue(yoloResult());

    await orchestrator.recognize('/tmp/1.jpg');
    await orchestrator.recognize('/tmp/2.jpg');

    mockCache.get.mockReturnValue({
      status: 'success',
      source: 'yolov11',
      flowerName: '玫瑰',
      topClass: '玫瑰',
      confidence: 0.95,
      inferenceTimeMs: 1,
    });
    await orchestrator.recognize('/tmp/3.jpg');

    const stats = orchestrator.getLatencyStats();

    expect(stats).not.toBeNull();
    expect(stats.samples).toBe(3);
    expect(stats.cacheHits).toBe(1);
    expect(stats.inference.avg).toBeCloseTo((37 + 37 + 0) / 3, 5);
  });

  it('resetLatencyStats 清空统计', async () => {
    mockYolo.detect.mockResolvedValue(yoloResult());
    await orchestrator.recognize('/tmp/a.jpg');

    orchestrator.resetLatencyStats();

    expect(orchestrator.getLatencyStats()).toBeNull();
  });
});

// 没有任何静态 import/export 的文件会被 TS 当成全局脚本，
// 与另一个同样写法的测试文件产生「重复声明」错误。显式标成模块。
export {};

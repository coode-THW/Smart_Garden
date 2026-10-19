/**
 * 智慧花园 — 延迟度量（F1）
 * =======================
 * 把识别链路的端到端耗时拆成可归因的阶段，供「度量 → 定位 → 优化 → 精度回归」
 * 循环使用。
 *
 * ── 为什么需要它 ──
 *
 * 改造前 `RecognitionOrchestrator.recognize()` 只有一个 `inferenceTimeMs =
 * Date.now() - startTime`，把预处理、推理、决策、LLM 全混在一起。这个数字
 * 只能回答「慢不慢」，回答不了「慢在哪」—— 而优化延迟恰恰需要后者。
 *
 * ── 口径约定（重要）──
 *
 *   totalMs   从 recognize() 入口到返回的真实墙钟时间，**包含**未被标记的间隙
 *             （JSON 解析、调度、GC 等）。因此各阶段之和通常 <= totalMs，
 *             差额就是「其他/未归因」部分。
 *   preprocessMs  图片 → 张量：缩放、解码、归一化、颜色分析
 *   inferenceMs   ONNX session.run
 *   decisionMs    本地多信号校验（置信度/边距/熵/跌落比/底部和/绿色/饱和度）
 *   knowledgeMs   知识库补充（本地查不到时为取养护指南调 LLM 的时间）
 *   llmMs         LLM 兜底识别（未调用为 0）
 *
 * 缓存命中时各阶段一律归零 —— 命中意味着整条链路都没跑，报出旧的分段耗时会误导。
 */

// ━━━━━ 类型 ━━━━━

// 延迟分解的契约定义在 types/index.ts（与 RecognitionResult 放在一起），
// 本模块只负责实现。这样 types 层不反向依赖 services 层。
import type {LatencyBreakdown} from '../types';

export type {LatencyBreakdown};

/** 单阶段统计 */
export interface StageStats {
  avg: number;
  p50: number;
  p95: number;
  max: number;
}

/** 一段时间的延迟分布 */
export interface LatencySnapshot {
  samples: number;
  total: StageStats;
  preprocess: StageStats;
  inference: StageStats;
  decision: StageStats;
  knowledge: StageStats;
  llm: StageStats;
  /** 其中缓存命中的次数 */
  cacheHits: number;
}

export type Clock = () => number;

// ━━━━━ LatencyTracker ━━━━━

export class LatencyTracker {
  private readonly startedAt: number;
  private preprocessMs = 0;
  private inferenceMs = 0;
  private decisionMs = 0;
  private knowledgeMs = 0;
  private llmMs = 0;
  private cacheHit = false;

  constructor(private readonly now: Clock = () => Date.now()) {
    this.startedAt = now();
  }

  markPreprocess(ms: number): void {
    this.preprocessMs = ms;
  }

  markInference(ms: number): void {
    this.inferenceMs = ms;
  }

  markDecision(ms: number): void {
    this.decisionMs = ms;
  }

  markKnowledge(ms: number): void {
    this.knowledgeMs = ms;
  }

  markLLM(ms: number): void {
    this.llmMs = ms;
  }

  /**
   * 标记缓存命中。之后 freeze 时各阶段归零 ——
   * 命中意味着链路没跑，残留的阶段值会让统计失真。
   */
  markCacheHit(): void {
    this.cacheHit = true;
    this.preprocessMs = 0;
    this.inferenceMs = 0;
    this.decisionMs = 0;
    this.knowledgeMs = 0;
    this.llmMs = 0;
  }

  /** 取当前快照（之后的标记不影响已取出的对象） */
  freeze(): LatencyBreakdown {
    return {
      totalMs: this.now() - this.startedAt,
      preprocessMs: this.preprocessMs,
      inferenceMs: this.inferenceMs,
      decisionMs: this.decisionMs,
      knowledgeMs: this.knowledgeMs,
      llmMs: this.llmMs,
      cacheHit: this.cacheHit,
    };
  }
}

// ━━━━━ LatencyStats ━━━━━

/**
 * 滚动窗口的延迟统计。用于在设备上连续采样后给出 p50/p95，
 * 而不是每次都盯着单次日志判断。
 *
 * 默认只保留最近 200 个样本：识别频率不高，但长时间运行也不该无限增长。
 */
export class LatencyStats {
  private samples: LatencyBreakdown[] = [];
  private readonly windowSize: number;

  constructor(opts: {windowSize?: number} = {}) {
    this.windowSize = opts.windowSize ?? 200;
  }

  record(breakdown: LatencyBreakdown): void {
    this.samples.push(breakdown);
    if (this.samples.length > this.windowSize) {
      this.samples = this.samples.slice(-this.windowSize);
    }
  }

  snapshot(): LatencySnapshot | null {
    if (this.samples.length === 0) return null;

    return {
      samples: this.samples.length,
      total: statsOf(this.samples.map(s => s.totalMs)),
      preprocess: statsOf(this.samples.map(s => s.preprocessMs)),
      inference: statsOf(this.samples.map(s => s.inferenceMs)),
      decision: statsOf(this.samples.map(s => s.decisionMs)),
      knowledge: statsOf(this.samples.map(s => s.knowledgeMs)),
      llm: statsOf(this.samples.map(s => s.llmMs)),
      cacheHits: this.samples.filter(s => s.cacheHit).length,
    };
  }

  reset(): void {
    this.samples = [];
  }
}

// ━━━━━ 内部 ━━━━━

function statsOf(values: number[]): StageStats {
  const sorted = [...values].sort((a, b) => a - b);
  const sum = sorted.reduce((acc, v) => acc + v, 0);

  return {
    avg: sum / sorted.length,
    p50: percentile(sorted, 0.5),
    p95: percentile(sorted, 0.95),
    max: sorted[sorted.length - 1],
  };
}

/** 最近秩法取分位（对样本量不敏感，够用且好解释） */
function percentile(sorted: number[], p: number): number {
  const idx = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil(p * sorted.length) - 1),
  );
  return sorted[idx];
}

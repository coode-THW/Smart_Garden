/**
 * LatencyTracker / LatencyStats 单元测试（F1 度量埋点）
 * ==================================================
 * 目标：把端到端的那个混合数字拆成「预处理 / 推理 / 决策 / 知识库 / LLM」。
 * 没有这个分解，后续「定位瓶颈」只能靠猜。
 *
 * 计时函数是注入的，测试里用手动推进的假时钟，不依赖真实耗时。
 */

import {LatencyTracker, LatencyStats} from '../LatencyTracker';
import type {LatencyBreakdown} from '../../types';

// ━━━━━ 假时钟 ━━━━━

function fakeClock() {
  let t = 1000;
  return {
    now: () => t,
    advance: (ms: number) => {
      t += ms;
    },
  };
}

// ━━━━━ LatencyTracker ━━━━━

describe('LatencyTracker', () => {
  it('total 从创建时刻算起，包含没被标记的间隙', () => {
    const clock = fakeClock();
    const tracker = new LatencyTracker(clock.now);

    clock.advance(50); // 未标记的间隙（例如排队、调度）

    expect(tracker.freeze().totalMs).toBe(50);
  });

  it('各阶段耗时原样保留', () => {
    const clock = fakeClock();
    const tracker = new LatencyTracker(clock.now);

    tracker.markPreprocess(120);
    tracker.markInference(80);
    tracker.markDecision(1);
    tracker.markKnowledge(2);
    tracker.markLLM(0);
    clock.advance(210);

    const b = tracker.freeze();

    expect(b.preprocessMs).toBe(120);
    expect(b.inferenceMs).toBe(80);
    expect(b.decisionMs).toBe(1);
    expect(b.knowledgeMs).toBe(2);
    expect(b.llmMs).toBe(0);
    expect(b.totalMs).toBe(210);
    expect(b.cacheHit).toBe(false);
  });

  it('未标记的阶段为 0，而不是 undefined', () => {
    const tracker = new LatencyTracker(fakeClock().now);

    const b = tracker.freeze();

    expect(b.preprocessMs).toBe(0);
    expect(b.inferenceMs).toBe(0);
    expect(b.decisionMs).toBe(0);
    expect(b.knowledgeMs).toBe(0);
    expect(b.llmMs).toBe(0);
  });

  it('缓存命中时各阶段归零并标记 cacheHit', () => {
    const clock = fakeClock();
    const tracker = new LatencyTracker(clock.now);

    tracker.markPreprocess(999); // 即使误标也要被清零
    tracker.markCacheHit();
    clock.advance(3);

    const b = tracker.freeze();

    expect(b.cacheHit).toBe(true);
    expect(b.preprocessMs).toBe(0);
    expect(b.inferenceMs).toBe(0);
    expect(b.totalMs).toBe(3);
  });

  it('重复标记同一阶段时后者生效（便于覆盖测量误差）', () => {
    const tracker = new LatencyTracker(fakeClock().now);

    tracker.markInference(10);
    tracker.markInference(42);

    expect(tracker.freeze().inferenceMs).toBe(42);
  });

  it('freeze 是快照：之后再标记不影响已取出的结果', () => {
    const clock = fakeClock();
    const tracker = new LatencyTracker(clock.now);

    tracker.markInference(10);
    const first = tracker.freeze();

    tracker.markInference(99);
    clock.advance(100);

    expect(first.inferenceMs).toBe(10);
  });
});

// ━━━━━ LatencyStats ━━━━━

describe('LatencyStats', () => {
  const breakdown = (over: Partial<LatencyBreakdown> = {}) => ({
    totalMs: 100,
    preprocessMs: 10,
    inferenceMs: 20,
    decisionMs: 1,
    knowledgeMs: 2,
    llmMs: 0,
    cacheHit: false,
    ...over,
  });

  it('没有样本时 snapshot 为空', () => {
    expect(new LatencyStats().snapshot()).toBeNull();
  });

  it('统计样本数', () => {
    const stats = new LatencyStats();
    stats.record(breakdown());
    stats.record(breakdown());

    expect(stats.snapshot()!.samples).toBe(2);
  });

  it('total 的 p50 与 p95 正确', () => {
    const stats = new LatencyStats();
    // 1..100，p50 ≈ 50，p95 ≈ 95
    for (let i = 1; i <= 100; i++) stats.record(breakdown({totalMs: i}));

    const s = stats.snapshot()!;

    expect(s.total.avg).toBeCloseTo(50.5, 5);
    expect(s.total.p50).toBeGreaterThanOrEqual(49);
    expect(s.total.p50).toBeLessThanOrEqual(51);
    expect(s.total.p95).toBeGreaterThanOrEqual(94);
    expect(s.total.p95).toBeLessThanOrEqual(96);
  });

  it('分阶段各自统计', () => {
    const stats = new LatencyStats();
    stats.record(breakdown({inferenceMs: 10}));
    stats.record(breakdown({inferenceMs: 30}));

    expect(stats.snapshot()!.inference.avg).toBe(20);
  });

  it('缓存命中的样本单独计数，不计入慢样本', () => {
    const stats = new LatencyStats();
    stats.record(breakdown());
    stats.record(breakdown({cacheHit: true, totalMs: 1}));

    expect(stats.snapshot()!.cacheHits).toBe(1);
  });

  it('只保留最近 N 个样本（滚动窗口），避免无限增长', () => {
    const stats = new LatencyStats({windowSize: 3});
    for (let i = 1; i <= 10; i++) stats.record(breakdown({totalMs: i}));

    const s = stats.snapshot()!;

    expect(s.samples).toBe(3);
    // 只剩 8/9/10
    expect(s.total.avg).toBe(9);
  });

  it('reset 清空', () => {
    const stats = new LatencyStats();
    stats.record(breakdown());
    stats.reset();

    expect(stats.snapshot()).toBeNull();
  });
});

/**
 * NetworkService 单元测试
 * ======================
 * 覆盖：单例/初始化/在线检测/监听/强制状态/重置/时间追踪
 *
 * 角色: C（全栈工程师）— Day 4
 */

import NetworkService from '../NetworkService';

// ━━━━━ 模拟全局 fetch ━━━━━

const mockFetch = jest.fn();
(globalThis as any).fetch = mockFetch;
(globalThis as any).AbortController = jest.fn(() => ({
  signal: { aborted: false },
  abort: jest.fn(),
}));
// jsdom 不自动提供 AbortController 的 timeout 行为
(globalThis as any).setTimeout = setTimeout;
(globalThis as any).clearTimeout = clearTimeout;

describe('NetworkService', () => {
  let service: NetworkService;

  beforeEach(() => {
    jest.clearAllMocks();
    // 默认 ping 成功返回 204
    mockFetch.mockResolvedValue({ ok: true, status: 204 });
    service = NetworkService.getInstance();
    service.reset();
  });

  afterEach(() => {
    service.reset();
  });

  // ═══════════════════════════════════════════
  // 1. 单例
  // ═══════════════════════════════════════════

  describe('单例', () => {
    it('getInstance 返回同一实例', () => {
      const a = NetworkService.getInstance();
      const b = NetworkService.getInstance();
      expect(a).toBe(b);
    });
  });

  // ═══════════════════════════════════════════
  // 2. 初始状态
  // ═══════════════════════════════════════════

  describe('初始状态', () => {
    it('reset 后 isOnline 为 true', () => {
      expect(service.isOnline()).toBe(true);
    });

    it('reset 后 lastOnlineAt 为 null', () => {
      expect(service.getLastOnlineAt()).toBeNull();
    });

    it('reset 后 secondsSinceLastOnline 为 null', () => {
      expect(service.getSecondsSinceLastOnline()).toBeNull();
    });
  });

  // ═══════════════════════════════════════════
  // 3. init
  // ═══════════════════════════════════════════

  describe('init', () => {
    it('init 调用后应执行一次连通性检测', async () => {
      await service.init();
      expect(mockFetch).toHaveBeenCalled();
    });

    it('init 幂等 — 多次调用只初始化一次', async () => {
      await service.init();
      await service.init();
      await service.init();
      // 第一次 init 时调用的 ping，后续幂等
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  // ═══════════════════════════════════════════
  // 4. isOnline / setOnline
  // ═══════════════════════════════════════════

  describe('setOnline 强制状态', () => {
    it('setOnline(false) → isOnline 为 false', () => {
      service.setOnline(false);
      expect(service.isOnline()).toBe(false);
    });

    it('setOnline(true) → isOnline 为 true', () => {
      service.setOnline(false);
      service.setOnline(true);
      expect(service.isOnline()).toBe(true);
    });

    it('setOnline(null) → 恢复真实检测', () => {
      service.setOnline(false);
      service.setOnline(null);
      // reset 后默认为 true
      expect(service.isOnline()).toBe(true);
    });
  });

  // ═══════════════════════════════════════════
  // 5. 监听器
  // ═══════════════════════════════════════════

  describe('addListener 监听器', () => {
    it('注册后立即收到当前状态', () => {
      const cb = jest.fn();
      service.addListener(cb);
      expect(cb).toHaveBeenCalledWith(true);
    });

    it('setOnline 变化时通知监听器', () => {
      const cb = jest.fn();
      service.addListener(cb);
      cb.mockClear(); // 清除初始通知

      service.setOnline(false);
      expect(cb).toHaveBeenCalledWith(false);
    });

    it('返回的取消函数能移除监听', () => {
      const cb = jest.fn();
      const unsubscribe = service.addListener(cb);
      cb.mockClear();

      unsubscribe();
      service.setOnline(false);
      expect(cb).not.toHaveBeenCalled();
    });

    it('多个监听器各自收到通知', () => {
      const cb1 = jest.fn();
      const cb2 = jest.fn();
      service.addListener(cb1);
      service.addListener(cb2);
      cb1.mockClear();
      cb2.mockClear();

      service.setOnline(false);
      expect(cb1).toHaveBeenCalledWith(false);
      expect(cb2).toHaveBeenCalledWith(false);
    });

    it('removeListener 移除后不再通知', () => {
      const cb = jest.fn();
      service.addListener(cb);
      cb.mockClear();
      service.removeListener(cb);
      service.setOnline(false);
      expect(cb).not.toHaveBeenCalled();
    });

    it('监听器内抛异常不阻塞其他监听器', () => {
      const cb1 = jest.fn(() => { throw new Error('bad'); });
      const cb2 = jest.fn();
      service.addListener(cb1);
      service.addListener(cb2);
      cb1.mockClear();
      cb2.mockClear();

      expect(() => service.setOnline(false)).not.toThrow();
      expect(cb2).toHaveBeenCalledWith(false);
    });
  });

  // ═══════════════════════════════════════════
  // 6. 时间追踪
  // ═══════════════════════════════════════════

  describe('时间追踪', () => {
    it('checkConnectivity 成功更新 lastOnlineAt', async () => {
      const before = Date.now();
      await service.checkConnectivity();
      const after = Date.now();

      const last = service.getLastOnlineAt();
      expect(last).not.toBeNull();
      expect(last!.getTime()).toBeGreaterThanOrEqual(before);
      expect(last!.getTime()).toBeLessThanOrEqual(after);
    });

    it('getSecondsSinceLastOnline 返回合理值', async () => {
      await service.checkConnectivity();
      const secs = service.getSecondsSinceLastOnline();
      expect(secs).not.toBeNull();
      expect(secs!).toBeGreaterThanOrEqual(0);
      expect(secs!).toBeLessThan(5); // 刚检测完，应在几秒内
    });

    it('未检测过时 getLastOnlineAt 为 null', () => {
      service.reset();
      expect(service.getLastOnlineAt()).toBeNull();
    });
  });

  // ═══════════════════════════════════════════
  // 7. checkConnectivity
  // ═══════════════════════════════════════════

  describe('checkConnectivity', () => {
    it('ping 成功返回 true', async () => {
      mockFetch.mockResolvedValue({ ok: true, status: 204 });
      const result = await service.checkConnectivity();
      expect(result).toBe(true);
    });

    it('ping 失败返回 false', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));
      const result = await service.checkConnectivity();
      expect(result).toBe(false);
    });

    it('fetch 非 ok 也视为失败', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 500 });
      const result = await service.checkConnectivity();
      // 注意：NetworkService 的 ping 方法检查 response.ok || response.status === 204
      // 500 不满足这两个条件
      expect(result).toBe(false);
    });

    it('204 No Content 视为成功', async () => {
      mockFetch.mockResolvedValue({ ok: true, status: 204 });
      const result = await service.checkConnectivity();
      expect(result).toBe(true);
    });

    it('forceOnline 时跳过真实检测', async () => {
      mockFetch.mockResolvedValue({ ok: true, status: 204 });
      service.setOnline(false);
      const result = await service.checkConnectivity();
      expect(result).toBe(false);
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  // ═══════════════════════════════════════════
  // 8. reset
  // ═══════════════════════════════════════════

  describe('reset', () => {
    it('清除强制状态', () => {
      service.setOnline(false);
      service.reset();
      expect(service.isOnline()).toBe(true);
    });

    it('清除所有监听器', () => {
      const cb = jest.fn();
      service.addListener(cb);
      service.reset();
      cb.mockClear();
      service.setOnline(false);
      expect(cb).not.toHaveBeenCalled(); // 重置后旧的监听器被移除
    });

    it('清除时间追踪', () => {
      service.setOnline(true);
      service.reset();
      expect(service.getLastOnlineAt()).toBeNull();
    });
  });
});

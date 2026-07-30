/**
 * NetworkService — 网络状态监控服务
 * ====================================
 * 职责：
 *   - 检测设备在线/离线状态
 *   - 监听网络状态变化（推送变更事件）
 *   - 提供 "上次在线时间" 跟踪
 *   - 纯 JS 实现，无需原生模块
 *
 * 使用方式：
 *   const network = NetworkService.getInstance();
 *   network.isOnline();  // true / false
 *   network.addListener((online) => { ... });
 *   network.getLastOnlineAt();  // Date | null
 *
 * 测试：
 *   NetworkService.setOnline(false);  // 强制模拟离线
 *   NetworkService.reset();           // 恢复真实检测
 */

import logger from './LoggerService';

// ━━━━━ 类型 ━━━━━

export type NetworkStatusListener = (isOnline: boolean) => void;

// ━━━━━ NetworkService ━━━━━

class NetworkService {
  private static instance: NetworkService;

  /** 强制状态（用于测试 / 开发者调试） */
  private forceOnline: boolean | null = null;
  /** 上次确认在线的时间戳 */
  private lastOnlineAt: Date | null = null;
  /** 当前已知在线状态 */
  private _isOnline: boolean = true;
  /** 订阅者列表 */
  private listeners: Set<NetworkStatusListener> = new Set();
  /** 健康检查定时器 ID */
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  /** 是否已初始化 */
  private initialized = false;

  /** 健康检查间隔（ms） */
  private readonly PING_INTERVAL = 30000; // 30s
  /** 健康检查 URL（轻量、高可用） */
  private readonly PING_URL = 'https://clients3.google.com/generate_204';
  /** 健康检查超时 */
  private readonly PING_TIMEOUT = 5000;

  // ─── 单例 ───

  static getInstance(): NetworkService {
    if (!NetworkService.instance) {
      NetworkService.instance = new NetworkService();
    }
    return NetworkService.instance;
  }

  // ─── 初始化 ───

  /**
   * 初始化网络状态监听。
   * - 首次调用立即检测一次状态
   * - 启动定时健康检查（每 30s ping）
   * - 幂等：多次调用安全
   */
  async init(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;

    // 首次检测
    await this.checkConnectivity();

    // 定时健康检查
    this.pingTimer = setInterval(() => {
      this.checkConnectivity();
    }, this.PING_INTERVAL);

    logger.info('NetworkService', `网络监控已启动 (间隔 ${this.PING_INTERVAL / 1000}s)`);
  }

  // ─── 公共接口 ───

  /** 当前是否在线 */
  isOnline(): boolean {
    if (this.forceOnline !== null) return this.forceOnline;
    return this._isOnline;
  }

  /** 上次确认在线的时间 */
  getLastOnlineAt(): Date | null {
    return this.lastOnlineAt;
  }

  /** 上次在线距现在的秒数（human-readable 用） */
  getSecondsSinceLastOnline(): number | null {
    if (!this.lastOnlineAt) return null;
    return Math.floor((Date.now() - this.lastOnlineAt.getTime()) / 1000);
  }

  /** 注册网络状态变化监听 */
  addListener(listener: NetworkStatusListener): () => void {
    this.listeners.add(listener);
    // 立即通知当前状态（异常不阻塞注册）
    try {
      listener(this.isOnline());
    } catch {
      // 单个监听器初始化异常不影响注册
    }
    // 返回取消订阅函数
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** 移除监听 */
  removeListener(listener: NetworkStatusListener): void {
    this.listeners.delete(listener);
  }

  // ─── 测试辅助 ───

  /**
   * 强制设置在线/离线（测试用）。
   * 传 null 恢复真实检测。
   */
  setOnline(online: boolean | null): void {
    this.forceOnline = online;
    const status = online !== null ? online : this._isOnline;
    logger.info('NetworkService', `网络状态强制设为: ${status}`);
    this.notifyListeners(status);
  }

  /** 重置（清除强制状态 + 恢复真实检测） */
  reset(): void {
    this.forceOnline = null;
    this.listeners.clear();
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
    this.initialized = false;
    this._isOnline = true;
    this.lastOnlineAt = null;
  }

  /** 立即执行一次连通性检测 */
  async checkConnectivity(): Promise<boolean> {
    if (this.forceOnline !== null) return this.forceOnline;

    const wasOnline = this._isOnline;
    this._isOnline = await this.ping();

    if (this._isOnline) {
      this.lastOnlineAt = new Date();
    }

    // 状态变化时通知订阅者
    if (wasOnline !== this._isOnline) {
      logger.info(
        'NetworkService',
        `网络状态变化: ${wasOnline ? '在线' : '离线'} → ${this._isOnline ? '在线' : '离线'}`,
      );
      this.notifyListeners(this._isOnline);
    }

    return this._isOnline;
  }

  // ─── 内部方法 ───

  /**
   * 轻量连通性检测。
   * 请求 generate_204（Google 的极轻端点，返回 204 No Content）。
   * 超时 5s 视为离线。
   */
  private async ping(): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.PING_TIMEOUT);

      const response = await fetch(this.PING_URL, {
        method: 'HEAD',
        signal: controller.signal,
        cache: 'no-store',
      } as RequestInit);

      clearTimeout(timeoutId);
      return response.ok || response.status === 204;
    } catch {
      return false;
    }
  }

  /** 通知所有订阅者 */
  private notifyListeners(isOnline: boolean): void {
    for (const listener of this.listeners) {
      try {
        listener(isOnline);
      } catch {
        // 单个监听器异常不阻塞其他通知
      }
    }
  }
}

export default NetworkService;

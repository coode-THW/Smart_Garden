/**
 * KnowledgeService — 花卉养护知识查询
 *
 * 数据来源有两层：
 *   1. 随包数据 —— assets/care/ 的 barrel，随 APP 发版固定
 *   2. 覆盖层   —— 在线更新下载下来的数据（Day55-56），运行时由
 *                  KnowledgeUpdateService 通过 applyOverride() 注入
 * 两层按花名合并，覆盖层优先。所以「不依赖 APP 发版即可更新养护数据」。
 *
 * 对外提供单例类（兼容 GardenService）和简单函数（兼容识别结果页）两套接口，
 * 两者共用同一份缓存 —— 简单函数直接委托给单例，不再自己维护一份 Map
 * （以前确实各存一份，会随覆盖层的引入而分叉）。
 */

import {careGuides} from '../../assets/care';
import type {CareGuide} from '../types';
import type {ApiResponse} from '../types';
import {ErrorCode} from '../types';
import logger from './LoggerService';
import {getErrorMessage} from './ErrorHandler';

// ━━━ 简单函数接口（识别结果页用） ━━━

/**
 * 根据中文花名查询养护知识（同步）。
 * 委托给单例，因此自动看到在线更新下来的覆盖层。
 */
export function getKnowledge(flowerName: string): CareGuide | null {
  const resp = KnowledgeService.getInstance().getCareGuideByName(flowerName);
  return resp.code === ErrorCode.SUCCESS ? resp.data : null;
}

// ━━━ 类接口（兼容 GardenService 和单元测试） ━━━

export class KnowledgeService {
  private static instance: KnowledgeService;
  private nameCache: Map<string, CareGuide> = new Map();
  private idCache: Map<number, CareGuide> = new Map();
  private initialized = false;

  /** 在线更新下来的覆盖层：花名 → 指南。 */
  private override: Record<string, CareGuide> = {};

  constructor(private barrel?: Record<string, CareGuide>) {}

  static getInstance(): KnowledgeService {
    if (!KnowledgeService.instance) {
      KnowledgeService.instance = new KnowledgeService();
    }
    return KnowledgeService.instance;
  }

  initialize(): void {
    if (this.initialized) return;
    this.buildCaches();
    this.initialized = true;
    logger.info(
      'KnowledgeService',
      `已加载 ${this.nameCache.size} 份养护指南` +
        (Object.keys(this.override).length > 0
          ? `（含 ${Object.keys(this.override).length} 份在线更新）`
          : ''),
    );
  }

  /**
   * 注入在线更新下载下来的覆盖层（Day55-56）。
   *
   * 传的是**当前完整的覆盖集合**，不是增量 —— 每次都整体替换。
   * 已初始化时会立即重建缓存，所以调用后新数据马上可查；
   * 未初始化时先存着，等 initialize() 一并生效。
   */
  applyOverride(guides: Record<string, CareGuide>): void {
    this.override = guides ?? {};
    if (this.initialized) {
      this.buildCaches();
      logger.info(
        'KnowledgeService',
        `已应用 ${Object.keys(this.override).length} 份在线更新数据`,
      );
    }
  }

  /** 当前覆盖层（供调试/测试观察） */
  getOverrideCount(): number {
    return Object.keys(this.override).length;
  }

  reset(): void {
    this.nameCache.clear();
    this.idCache.clear();
    this.initialized = false;
  }

  getCareGuide(flowerId: number): ApiResponse<CareGuide> {
    this.ensureInit();
    if (!Number.isInteger(flowerId) || flowerId < 1) {
      return this.err(ErrorCode.INVALID_PARAM);
    }
    const g = this.idCache.get(flowerId);
    return g ? this.ok(g) : this.err(ErrorCode.DATA_QUERY_FAILED);
  }

  getCareGuideByName(flowerName: string): ApiResponse<CareGuide> {
    this.ensureInit();
    if (!flowerName?.trim()) {
      return this.err(ErrorCode.INVALID_PARAM);
    }
    const g = this.nameCache.get(flowerName.trim());
    return g ? this.ok(g) : this.err(ErrorCode.DATA_QUERY_FAILED);
  }

  getAllFlowerNames(): string[] {
    this.ensureInit();
    return Array.from(this.nameCache.keys());
  }

  getAllGuides(): CareGuide[] {
    this.ensureInit();
    return Array.from(this.idCache.values()).sort((a, b) => a.flowerId - b.flowerId);
  }

  get count(): number {
    return this.idCache.size;
  }

  private ensureInit(): void {
    if (!this.initialized) this.initialize();
  }

  /**
   * 从「随包数据 + 覆盖层」重建两个缓存。
   *
   * 先把两层合并成一个纯对象再建缓存 —— 若改成「先建随包、再逐条塞覆盖」，
   * 覆盖里 flowerId 变了的话，旧 id 会遗留在 idCache 里变成幽灵条目。
   */
  private buildCaches(): void {
    const merged: Record<string, CareGuide> = {
      ...(this.barrel ?? (careGuides as Record<string, CareGuide>)),
      ...this.override,
    };

    this.nameCache.clear();
    this.idCache.clear();
    for (const [name, guide] of Object.entries(merged)) {
      this.nameCache.set(name, guide);
      this.idCache.set(guide.flowerId, guide);
    }
  }

  private ok<T>(data: T): ApiResponse<T> {
    return {code: ErrorCode.SUCCESS, message: 'success', data};
  }

  private err<T>(code: ErrorCode): ApiResponse<T> {
    return {code, message: getErrorMessage(code), data: null};
  }
}

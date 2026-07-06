/**
 * 智慧花园 — 养护知识库查询服务
 * ==============================
 * 加载 assets/care/ 下的 JSON 养护数据，提供按 ID/名称查询的能力。
 *
 * 加载策略：
 *   通过 barrel 文件 (assets/care/index.ts) 静态导入所有 JSON，
 *   避免 Metro 不支持动态 require 的问题。
 *
 * 使用方式：
 *   const ks = new KnowledgeService(careGuides);
 *   const resp = ks.getCareGuide(6);  // 月季
 */

import {ApiResponse, CareGuide, ErrorCode} from '../types';

// ━━━━━ 错误消息映射 ━━━━━

const ERROR_MESSAGES: Record<number, string> = {
  [ErrorCode.SUCCESS]: 'success',
  [ErrorCode.DATA_QUERY_FAILED]: '未找到该花卉的养护指南',
  [ErrorCode.INVALID_PARAM]: '参数错误',
};

// ━━━━━ KnowledgeService ━━━━━

export class KnowledgeService {
  /** 名称 → 养护指南 缓存 */
  private nameCache: Map<string, CareGuide> = new Map();

  /** ID → 养护指南 缓存 */
  private idCache: Map<number, CareGuide> = new Map();

  /** 是否已初始化 */
  private initialized = false;

  /**
   * @param barrel assets/care/index.ts 导出的 careGuides 对象
   */
  constructor(private barrel: Record<string, CareGuide>) {}

  // ─── 初始化 ───

  /**
   * 初始化双缓存。
   * 遍历 barrel 中的所有指南，构建 nameCache 和 idCache。
   * 幂等：多次调用安全。
   */
  initialize(): void {
    if (this.initialized) return;

    for (const [name, guide] of Object.entries(this.barrel)) {
      this.nameCache.set(name, guide);
      this.idCache.set(guide.flowerId, guide);
    }

    this.initialized = true;
    console.log(
      `[KnowledgeService] 已加载 ${this.nameCache.size} 份养护指南`,
    );
  }

  /**
   * 重置缓存（用于测试或热更新场景）。
   */
  reset(): void {
    this.nameCache.clear();
    this.idCache.clear();
    this.initialized = false;
  }

  // ─── 查询 ───

  /**
   * 按花卉 ID 查询养护指南。
   * @param flowerId 花卉 ID（1-5 为 YOLO 训练类，6+ 为其余品种）
   * @returns ApiResponse 包装的养护指南
   */
  getCareGuide(flowerId: number): ApiResponse<CareGuide> {
    this.ensureInitialized();

    if (!Number.isInteger(flowerId) || flowerId < 1) {
      return this.error(ErrorCode.INVALID_PARAM);
    }

    const guide = this.idCache.get(flowerId);
    if (!guide) {
      return this.error(ErrorCode.DATA_QUERY_FAILED);
    }

    return this.success(guide);
  }

  /**
   * 按花卉名称查询养护指南。
   * @param flowerName 花卉中文名称（精确匹配）
   * @returns ApiResponse 包装的养护指南
   */
  getCareGuideByName(flowerName: string): ApiResponse<CareGuide> {
    this.ensureInitialized();

    if (!flowerName || flowerName.trim().length === 0) {
      return this.error(ErrorCode.INVALID_PARAM);
    }

    const guide = this.nameCache.get(flowerName.trim());
    if (!guide) {
      return this.error(ErrorCode.DATA_QUERY_FAILED);
    }

    return this.success(guide);
  }

  /**
   * 获取所有花卉名称列表（用于选择器/搜索建议）。
   */
  getAllFlowerNames(): string[] {
    this.ensureInitialized();
    return Array.from(this.nameCache.keys());
  }

  /**
   * 获取所有养护指南（用于列表展示）。
   */
  getAllGuides(): CareGuide[] {
    this.ensureInitialized();
    return Array.from(this.idCache.values()).sort(
      (a, b) => a.flowerId - b.flowerId,
    );
  }

  /**
   * 获取已加载的指南数量。
   */
  get count(): number {
    return this.idCache.size;
  }

  // ─── 内部方法 ───

  private ensureInitialized(): void {
    if (!this.initialized) {
      this.initialize();
    }
  }

  private success<T>(data: T): ApiResponse<T> {
    return {code: ErrorCode.SUCCESS, message: ERROR_MESSAGES[ErrorCode.SUCCESS], data};
  }

  private error<T>(code: ErrorCode): ApiResponse<T> {
    return {
      code,
      message: ERROR_MESSAGES[code] || '未知错误',
      data: null,
    };
  }
}

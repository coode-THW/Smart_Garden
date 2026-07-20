/**
 * KnowledgeService — 花卉养护知识查询
 *
 * 从 assets/care/ 的 barrel 导入 54 种养护 JSON 数据。
 * 提供单例类（兼容 GardenService）和简单函数（兼容识别结果页）两套接口。
 */

import {careGuides} from '../../assets/care';
import type {CareGuide} from '../types';
import type {ApiResponse} from '../types';
import {ErrorCode} from '../types';
import logger from './LoggerService';
import {getErrorMessage} from './ErrorHandler';

// ━━━ 简单函数接口（识别结果页用） ━━━

const nameMap = new Map<string, CareGuide>();
for (const [name, guide] of Object.entries(careGuides)) {
  nameMap.set(name, guide as CareGuide);
}
logger.info('KnowledgeService', `已加载 ${nameMap.size} 种花卉养护数据`);

/**
 * 根据中文花名查询养护知识（同步）。
 */
export function getKnowledge(flowerName: string): CareGuide | null {
  return nameMap.get(flowerName) ?? null;
}

// ━━━ 类接口（兼容 GardenService 和单元测试） ━━━

export class KnowledgeService {
  private static instance: KnowledgeService;
  private nameCache: Map<string, CareGuide> = new Map();
  private idCache: Map<number, CareGuide> = new Map();
  private initialized = false;

  constructor(private barrel?: Record<string, CareGuide>) {}

  static getInstance(): KnowledgeService {
    if (!KnowledgeService.instance) {
      KnowledgeService.instance = new KnowledgeService();
    }
    return KnowledgeService.instance;
  }

  initialize(): void {
    if (this.initialized) return;
    const source = this.barrel ?? (careGuides as Record<string, CareGuide>);
    for (const [name, guide] of Object.entries(source)) {
      this.nameCache.set(name, guide);
      this.idCache.set(guide.flowerId, guide);
    }
    this.initialized = true;
    logger.info('KnowledgeService', `已加载 ${this.nameCache.size} 份养护指南`);
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

  private ok<T>(data: T): ApiResponse<T> {
    return {code: ErrorCode.SUCCESS, message: 'success', data};
  }

  private err<T>(code: ErrorCode): ApiResponse<T> {
    return {code, message: getErrorMessage(code), data: null};
  }
}

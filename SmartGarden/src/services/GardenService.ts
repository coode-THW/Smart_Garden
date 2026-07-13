/**
 * 智慧花园 — 花园业务服务
 * =======================
 * 在 GardenRepository（数据层）之上封装业务逻辑。
 *
 * 职责：
 *   - 添加花卉到花园（去重检查 + 关联知识库）
 *   - 查询我的花园（附带养护指南信息）
 *   - 更新/删除花园记录
 *   - 整合 UserService 和 KnowledgeService
 *
 * 使用方式：
 *   const gardenService = GardenService.getInstance();
 *   const result = await gardenService.addToGarden({ flowerId: 6 });
 *
 * 依赖：
 *   - GardenRepository  — 数据持久化
 *   - KnowledgeService — 养护指南查询
 *   - UserService      — 当前用户身份
 */

import {GardenRepository} from '../database/gardenRepository';
import {KnowledgeService} from './KnowledgeService';
import {UserService} from './UserService';
import {GardenEntity, CareGuide, ApiResponse, ErrorCode} from '../types';

// ━━━━━ 常量 ━━━━━

const ERROR_MESSAGES: Record<number, string> = {
  [ErrorCode.SUCCESS]: 'success',
  [ErrorCode.INVALID_PARAM]: '参数错误',
  [ErrorCode.DATA_QUERY_FAILED]: '未找到该花卉的养护指南',
};

// ━━━━━ 导出类型 ━━━━━

/** 花园条目 + 养护指南的完整信息 */
export interface GardenEntry {
  garden: GardenEntity;
  careGuide: CareGuide | null;
}

// ━━━━━ GardenService (单例) ━━━━━

export class GardenService {
  private static instance: GardenService;

  private gardenRepo = new GardenRepository();
  private knowledgeService = KnowledgeService.getInstance();
  private userService = UserService.getInstance();

  static getInstance(): GardenService {
    if (!GardenService.instance) {
      GardenService.instance = new GardenService();
    }
    return GardenService.instance;
  }

  // ─── 添加 ───

  /**
   * 添加花卉到花园。
   * 自动执行去重检查、获取养护指南。
   *
   * @returns ApiResponse，成功时 data 为完整的 GardenEntry
   */
  async addToGarden(params: {
    flowerId: number;
    customName?: string;
    location?: string;
    photoPath?: string;
  }): Promise<ApiResponse<GardenEntry>> {
    // 1. 参数校验
    if (!params.flowerId || params.flowerId < 1) {
      return this.error(ErrorCode.INVALID_PARAM);
    }

    const userId = this.userService.getUserId();
    if (!userId) {
      return {code: 4002, message: '用户未初始化', data: null};
    }

    // 2. 去重检查
    const existing = await this.gardenRepo.findByUserAndFlower(
      userId,
      params.flowerId,
      params.customName,
    );
    if (existing.length > 0) {
      return {
        code: 4003,
        message: `你的花园已有「${params.customName || this.getDefaultName(params.flowerId)}」，请使用不同的名字`,
        data: null,
      };
    }

    // 3. 写入数据库
    const gardenId = await this.gardenRepo.add({
      userId,
      flowerId: params.flowerId,
      customName: params.customName,
      location: params.location,
      photoPath: params.photoPath,
    });

    // 4. 查询完整记录
    const garden = await this.gardenRepo.findById(gardenId);
    if (!garden) {
      return this.error(ErrorCode.DATA_QUERY_FAILED);
    }

    // 5. 关联养护指南
    const careResp = this.knowledgeService.getCareGuide(params.flowerId);

    return {
      code: ErrorCode.SUCCESS,
      message: '添加成功',
      data: {
        garden,
        careGuide: careResp.data,
      },
    };
  }

  // ─── 查询 ───

  /**
   * 获取我的花园列表，每项附带养护指南。
   */
  async getMyGarden(): Promise<GardenEntry[]> {
    const userId = this.userService.getUserId();
    if (!userId) return [];

    const gardens = await this.gardenRepo.findByUserId(userId);

    return gardens.map((garden) => {
      const careResp = this.knowledgeService.getCareGuide(garden.flowerId);
      return {
        garden,
        careGuide: careResp.data,
      };
    });
  }

  /**
   * 获取花园中某条记录的详情（含养护指南）。
   */
  async getGardenDetail(gardenId: number): Promise<GardenEntry | null> {
    const garden = await this.gardenRepo.findById(gardenId);
    if (!garden) return null;

    const careResp = this.knowledgeService.getCareGuide(garden.flowerId);
    return {
      garden,
      careGuide: careResp.data,
    };
  }

  /**
   * 统计我的花园总数。
   */
  async countMyGarden(): Promise<number> {
    const userId = this.userService.getUserId();
    if (!userId) return 0;
    return this.gardenRepo.countByUserId(userId);
  }

  // ─── 更新 ───

  /**
   * 更新花园记录（位置/别名/照片）。
   */
  async updateEntry(
    gardenId: number,
    updates: {
      customName?: string;
      location?: string;
      photoPath?: string | null;
    },
  ): Promise<boolean> {
    return this.gardenRepo.update(gardenId, updates);
  }

  // ─── 删除 ───

  /**
   * 从花园中移除一盆花。
   */
  async removeFromGarden(gardenId: number): Promise<boolean> {
    return this.gardenRepo.delete(gardenId);
  }

  // ─── 内部方法 ───

  private getDefaultName(flowerId: number): string {
    const resp = this.knowledgeService.getCareGuide(flowerId);
    return resp.data?.flowerName || '这盆花';
  }

  private error<T>(code: ErrorCode): ApiResponse<T> {
    return {
      code,
      message: ERROR_MESSAGES[code] || '未知错误',
      data: null,
    };
  }
}

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
import {ReminderService} from './ReminderService';
import {GardenEntity, CareGuide, ApiResponse, ErrorCode} from '../types';
import {getErrorMessage} from './ErrorHandler';

// ━━━━━ 常量 ━━━━━

// GardenService 自身的业务错误码（非标准 ErrorCode 枚举）
const GARDEN_ERROR = {
  USER_NOT_INIT: 4002,
  DUPLICATE_ENTRY: 4003,
} as const;

// ━━━━━ 导出类型 ━━━━━

/** 花园条目 + 养护指南的完整信息 */
export interface GardenEntry {
  garden: GardenEntity;
  careGuide: CareGuide | null;
}

/** 移除花园记录的结果 */
export interface GardenRemovalResult {
  /** 花园行是否真的删掉了 */
  removed: boolean;
  /** 一并清理掉的提醒条数 */
  remindersRemoved: number;
  /**
   * 调用方需要去系统里**逐一取消**的通知 ID。
   * 不取消的话，这些已删除提醒的系统通知仍会按时弹出来。
   */
  cancelledNotificationIds: string[];
}

// ━━━━━ GardenService (单例) ━━━━━

export class GardenService {
  private static instance: GardenService;

  private gardenRepo = new GardenRepository();
  private knowledgeService = KnowledgeService.getInstance();
  private userService = UserService.getInstance();
  private reminderService = ReminderService.getInstance();

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
      return {code: GARDEN_ERROR.USER_NOT_INIT, message: '用户未初始化', data: null};
    }

    // 2. 去重检查
    const existing = await this.gardenRepo.findByUserAndFlower(
      userId,
      params.flowerId,
      params.customName,
    );
    if (existing.length > 0) {
      return {
        code: GARDEN_ERROR.DUPLICATE_ENTRY,
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
   * 从花园中移除一盆花，**并级联清理它的养护提醒**。
   *
   * 级联必须在服务层显式做：reminder.gardenId 的外键没有被强制执行
   * （SQLite 默认 foreign_keys = OFF），数据库不会自动带走这些提醒，
   * 剩下的"孤儿提醒"会继续给一盆已不存在的花弹通知。
   *
   * 顺序说明：先清提醒再删花园行。若花园行删除失败，用户仍在花园里看到这盆花，
   * 但提醒已被清空 —— 重新点一次「一键设置提醒」即可恢复；
   * 反过来先删花园行则可能留下孤儿提醒，那是用户看不见也清不掉的。
   *
   * @returns 删除结果；调用方需拿 `cancelledNotificationIds` 去系统里取消通知
   */
  async removeFromGarden(gardenId: number): Promise<GardenRemovalResult> {
    // 先确认这盆花存在，避免对不存在的花园产生任何副作用
    const garden = await this.gardenRepo.findById(gardenId);
    if (!garden) {
      return {removed: false, remindersRemoved: 0, cancelledNotificationIds: []};
    }

    const cleanup = await this.reminderService.deleteByGarden(gardenId);
    const removed = await this.gardenRepo.delete(gardenId);

    return {
      removed,
      remindersRemoved: cleanup.removed,
      cancelledNotificationIds: cleanup.cancelledNotificationIds,
    };
  }

  // ─── 内部方法 ───

  private getDefaultName(flowerId: number): string {
    const resp = this.knowledgeService.getCareGuide(flowerId);
    return resp.data?.flowerName || '这盆花';
  }

  private error<T>(code: ErrorCode): ApiResponse<T> {
    return {
      code,
      message: getErrorMessage(code),
      data: null,
    };
  }
}

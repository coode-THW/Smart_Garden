/**
 * 智慧花园 — 养护提醒服务（Phase 2 · Day41-46）
 * ============================================
 * 在 ReminderRepository（数据层）之上封装业务逻辑。
 * 时间推算全部委托给 ReminderScheduler（纯函数），中文频率文本解析
 * 委托给 ReminderPrefill —— 本文件只做校验、编排与持久化。
 *
 * 职责：
 *   - 提醒参数校验（类型 / 频率 / 时间格式 / 星期 / 日期）
 *   - 增删改查、批量创建（一键设置提醒）
 *   - 调度：到期查询、触发记录、排期推进、通知 ID 记账
 *
 * 使用方式：
 *   const reminderService = ReminderService.getInstance();
 *
 *   // 手动创建
 *   await reminderService.create({
 *     gardenId: 1, type: 'water', frequency: 'weekly',
 *     daysOfWeek: [2, 4, 6], time: '08:00',
 *   });
 *
 *   // 识别结果页「一键设置提醒」
 *   await reminderService.createFromCareGuide(gardenId, careGuide);
 *
 *   // 通知调度方：取出到期的 → 发通知 → 记录已触发
 *   const due = await reminderService.listDue();
 *   await reminderService.markTriggeredMany(due.map(r => r.reminderId!));
 *
 * 依赖：
 *   - ReminderRepository — 数据持久化
 *   - UserService        — 当前用户身份
 *   - ReminderScheduler  — 时间推算（纯函数）
 *   - ReminderPrefill    — 养护指南 → 提醒规格
 *
 * 时间约定：
 *   - nextRemindTime 为**本地时间** 'YYYY-MM-DDTHH:mm:ss'，恒定 **严格晚于当前时刻**
 *   - createdAt / updatedAt 为 ISO 8601 (UTC)，与 garden / feedback 表一致
 *   - 星期编号沿用 ISO 8601：1=周一 … 7=周日（架构文档「每周二/四/六」→ 2,4,6）
 *
 * 未覆盖的调度语义（需要时再补）：
 *   - 一天多时段（当前每条提醒只有一个 time）
 *   - 节假日跳过 / 按农历排期
 */

import {ReminderRepository} from '../database/reminderRepository';
import {UserService} from './UserService';
import {buildPrefilledReminders, ReminderSpec} from './ReminderPrefill';
import {describeSchedule, REMINDER_TYPE_LABELS} from './ReminderFormatter';
import {
  computeNextRemindTime,
  formatLocalDateTime,
  parseLocalDateTime,
  parseStoredDaysOfWeek,
  resolveDue,
  toSchedule,
  walkForward,
  type DueInfo,
  type ReminderSchedule,
} from './ReminderScheduler';
import {
  ApiResponse,
  CareGuide,
  ErrorCode,
  ReminderEntity,
  ReminderFrequency,
  ReminderType,
  REMINDER_TYPES,
  REMINDER_FREQUENCIES,
} from '../types';
import {getErrorMessage} from './ErrorHandler';

// ━━━━━ 常量 ━━━━━

/** 24 小时制 'HH:mm'，不接受 '8:00' 等补零变体（存库格式需统一）。 */
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

const REMINDER_ERROR = {
  /** 与 GardenService 语义一致：用户身份尚未初始化 */
  USER_NOT_INIT: 4002,
} as const;

// ━━━━━ 导出类型 ━━━━━

/** 创建提醒的入参（架构文档 5.5.2 输入参数） */
export interface CreateReminderParams {
  gardenId: number;
  type: ReminderType;
  frequency: ReminderFrequency;
  /** HH:mm */
  time: string;
  /** 周提醒指定星期，ISO 8601：1=周一 … 7=周日 */
  daysOfWeek?: number[];
  /** 月提醒指定日期，1-31 */
  dayOfMonth?: number;
  /** 间隔天数（预留，Day45-46 用于「每 N 天」） */
  intervalValue?: number | null;
  title?: string;
  note?: string;
}

/** 更新提醒的入参（仅传入需要变更的字段） */
export interface UpdateReminderParams {
  type?: ReminderType;
  frequency?: ReminderFrequency;
  time?: string;
  daysOfWeek?: number[];
  dayOfMonth?: number;
  intervalValue?: number | null;
  title?: string;
  note?: string;
  /** 1 = 启用，0 = 停用 */
  enabled?: number;
  /** 系统通知 ID 记账（停用/删除时清空用，一般走 setNotificationId） */
  notificationId?: string | null;
}

export type {ReminderSchedule, DueInfo};

/** 批量创建结果 */
export interface BatchCreateResult {
  /** 实际新建的提醒 */
  created: ReminderEntity[];
  /** 因同花园下已存在同类型而被跳过的类型 */
  skipped: ReminderType[];
}

/** 提醒列表的展示视图（Day47-48） */
export interface ReminderView {
  reminderId: number;
  gardenId: number;
  /**
   * 花名。由调用方通过 `flowerNameOf` 提供 —— UI 通常已有花园列表，
   * 传个查表函数即可，既避免 N+1 查询，也让本服务不必依赖花园模块。
   * 未提供解析器或该花园查不到时为 null。
   */
  flowerName: string | null;
  type: ReminderType;
  /** 类型中文标签，如「浇水」 */
  typeLabel: string;
  /** 人类可读排期，如「每周二/四/六 08:00」 */
  scheduleText: string;
  time: string;
  nextRemindTime: string;
  enabled: number;
  title: string | null;
  /** 到期状态，供列表区分「待提醒 / 已逾期」 */
  dueInfo: DueInfo;
}

/** 启用 / 停用结果 */
export interface ReminderStateChange {
  ok: boolean;
  /** 变更后的启用状态；ok=false 时为 null */
  enabled: 0 | 1 | null;
  /**
   * 需要调用方去系统里**取消**的通知 ID。
   * 仅停用时有值；该 ID 已同时从库中清空，不会被重复取消。
   */
  cancelledNotificationId: string | null;
  /** 变更后的提醒实体，便于 UI 直接更新该行 */
  reminder: ReminderEntity | null;
}

/** 删除单条提醒的结果 */
export interface ReminderDeleteResult {
  ok: boolean;
  /** 需要调用方取消的通知 ID（该提醒已删除） */
  cancelledNotificationId: string | null;
}

/** 删除某花园全部提醒的结果 */
export interface GardenReminderCleanup {
  removed: number;
  /** 需要调用方逐一取消的通知 ID */
  cancelledNotificationIds: string[];
}

// ━━━━━ 校验辅助 ━━━━━

function isValidType(value: any): value is ReminderType {
  return REMINDER_TYPES.includes(value);
}

function isValidFrequency(value: any): value is ReminderFrequency {
  return REMINDER_FREQUENCIES.includes(value);
}

function isValidTime(value: any): value is string {
  return typeof value === 'string' && TIME_PATTERN.test(value);
}

function isValidDaysOfWeek(value: any): value is number[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((d) => Number.isInteger(d) && d >= 1 && d <= 7)
  );
}

function isValidDayOfMonth(value: any): value is number {
  return Number.isInteger(value) && value >= 1 && value <= 31;
}

/**
 * 把一条调度规格渲染成落库参数。
 * create() 与 createBatch() 共用，保证单条与批量写入的字段语义完全一致。
 */
function buildInsertParams(
  spec: ReminderSchedule & {type: ReminderType; title?: string; note?: string},
  userId: string,
  gardenId: number,
  now: Date,
) {
  return {
    userId,
    gardenId,
    type: spec.type,
    frequency: spec.frequency,
    intervalValue: spec.intervalValue ?? null,
    daysOfWeek: spec.daysOfWeek?.length ? spec.daysOfWeek.join(',') : null,
    dayOfMonth: spec.dayOfMonth ?? null,
    time: spec.time,
    nextRemindTime: computeNextRemindTime(spec, now),
    // 新建提醒尚无系统通知、从未触发
    notificationId: null,
    lastTriggeredAt: null,
    title: spec.title ?? null,
    note: spec.note ?? null,
    enabled: 1,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };
}

// ━━━━━ ReminderService (单例) ━━━━━

export class ReminderService {
  private static instance: ReminderService;

  private reminderRepo = new ReminderRepository();
  private userService = UserService.getInstance();

  static getInstance(): ReminderService {
    if (!ReminderService.instance) {
      ReminderService.instance = new ReminderService();
    }
    return ReminderService.instance;
  }

  // ─── 创建 ───

  /**
   * 创建一条养护提醒。
   * 自动校验参数、计算 nextRemindTime、绑定当前用户。
   *
   * @returns ApiResponse，成功时 data 为新建的完整记录
   */
  async create(
    params: CreateReminderParams,
    now: Date = new Date(),
  ): Promise<ApiResponse<ReminderEntity>> {
    // 1. 参数校验
    if (!Number.isInteger(params.gardenId) || params.gardenId < 1) {
      return this.error(ErrorCode.INVALID_PARAM);
    }
    if (!this.isValidSchedule(params)) {
      return this.error(ErrorCode.INVALID_PARAM);
    }

    const userId = this.userService.getUserId();
    if (!userId) {
      return {code: REMINDER_ERROR.USER_NOT_INIT, message: '用户未初始化', data: null};
    }

    // 2. 写入数据库
    const reminderId = await this.reminderRepo.add(
      buildInsertParams(params, userId, params.gardenId, now),
    );

    // 3. 回读完整记录（含数据库默认值）
    const reminder = await this.reminderRepo.findById(reminderId);
    if (!reminder) {
      return this.error(ErrorCode.DATA_QUERY_FAILED);
    }

    return {code: ErrorCode.SUCCESS, message: '提醒创建成功', data: reminder};
  }

  // ─── 批量创建 ───

  /**
   * 批量创建一盆花的养护提醒（「一键设置提醒」）。
   *
   * 语义：
   *   - **原子**：一次事务写入，任一条失败则整批回滚
   *   - **跳过已存在**：该花园下已有同类型提醒时不重复创建，idempotent，
   *     避免用户重复点按钮堆叠出重复通知
   *   - 全部已存在不算错误，返回 created=[] 与 skipped 列表
   */
  async createBatch(
    gardenId: number,
    specs: ReminderSpec[],
    now: Date = new Date(),
  ): Promise<ApiResponse<BatchCreateResult>> {
    // 1. 前置校验：整批要么都合法，要么一条都不写
    if (!Number.isInteger(gardenId) || gardenId < 1) {
      return this.error(ErrorCode.INVALID_PARAM);
    }
    if (!specs || specs.length === 0) {
      return this.error(ErrorCode.INVALID_PARAM);
    }
    for (const spec of specs) {
      if (!this.isValidSchedule(spec)) {
        return this.error(ErrorCode.INVALID_PARAM);
      }
    }

    const userId = this.userService.getUserId();
    if (!userId) {
      return {code: REMINDER_ERROR.USER_NOT_INIT, message: '用户未初始化', data: null};
    }

    // 2. 去重：本花园已存在的类型 + 本批内重复的类型（先到者胜）
    const existing = await this.reminderRepo.findByGardenId(userId, gardenId);
    const taken = new Set<string>(existing.map(r => r.type));

    const accepted: ReminderSpec[] = [];
    const skipped: ReminderType[] = [];
    for (const spec of specs) {
      if (taken.has(spec.type)) {
        skipped.push(spec.type);
        continue;
      }
      taken.add(spec.type);
      accepted.push(spec);
    }

    if (accepted.length === 0) {
      return {
        code: ErrorCode.SUCCESS,
        message: '这些提醒都已存在',
        data: {created: [], skipped},
      };
    }

    // 3. 原子写入
    const ids = await this.reminderRepo.addMany(
      accepted.map(spec => buildInsertParams(spec, userId, gardenId, now)),
    );

    // 4. 一次性回读，取出本批新建的记录
    const all = await this.reminderRepo.findByGardenId(userId, gardenId);
    const created = all.filter(
      r => r.reminderId !== undefined && ids.includes(r.reminderId),
    );

    return {
      code: ErrorCode.SUCCESS,
      message: `已设置 ${created.length} 条提醒`,
      data: {created, skipped},
    };
  }

  /**
   * 「一键设置提醒」：解析养护指南 → 批量创建。
   *
   * 识别结果页拿到养护指南后直接调用，无需自己解析中文频率文本。
   */
  async createFromCareGuide(
    gardenId: number,
    guide: CareGuide,
    opts: {month?: number; time?: string} = {},
  ): Promise<ApiResponse<BatchCreateResult>> {
    return this.createBatch(gardenId, buildPrefilledReminders(guide, opts));
  }

  // ─── 查询 ───

  /**
   * 按 reminderId 查询单条提醒。
   */
  async getById(reminderId: number): Promise<ReminderEntity | null> {
    if (!Number.isInteger(reminderId) || reminderId < 1) return null;
    return this.reminderRepo.findById(reminderId);
  }

  /**
   * 查询当前用户的全部提醒，按下次提醒时间升序。
   */
  async listByUser(): Promise<ReminderEntity[]> {
    const userId = this.userService.getUserId();
    if (!userId) return [];
    return this.reminderRepo.findByUserId(userId);
  }

  /**
   * 查询某盆花的全部提醒。
   */
  async listByGarden(gardenId: number): Promise<ReminderEntity[]> {
    const userId = this.userService.getUserId();
    if (!userId) return [];
    return this.reminderRepo.findByGardenId(userId, gardenId);
  }

  /**
   * 统计当前用户的提醒总数。
   */
  async count(): Promise<number> {
    const userId = this.userService.getUserId();
    if (!userId) return 0;
    return this.reminderRepo.countByUserId(userId);
  }

  // ─── 更新 ───

  /**
   * 局部更新提醒。
   *
   * 仅当影响调度的字段（time / frequency / daysOfWeek / dayOfMonth）发生变更时
   * 才重算 nextRemindTime；改标题、备注或启停状态不会打乱既有排期。
   *
   * @returns true = 已更新；false = 记录不存在或参数非法
   */
  async update(
    reminderId: number,
    updates: UpdateReminderParams,
  ): Promise<boolean> {
    const existing = await this.reminderRepo.findById(reminderId);
    if (!existing) return false;

    // 1. 校验传入字段
    if (updates.type !== undefined && !isValidType(updates.type)) return false;
    if (updates.frequency !== undefined && !isValidFrequency(updates.frequency)) {
      return false;
    }
    if (updates.time !== undefined && !isValidTime(updates.time)) return false;
    if (updates.daysOfWeek !== undefined && !isValidDaysOfWeek(updates.daysOfWeek)) {
      return false;
    }
    if (updates.dayOfMonth !== undefined && !isValidDayOfMonth(updates.dayOfMonth)) {
      return false;
    }

    // 2. 组装 patch
    const patch: Record<string, any> = {};
    if (updates.type !== undefined) patch.type = updates.type;
    if (updates.frequency !== undefined) patch.frequency = updates.frequency;
    if (updates.intervalValue !== undefined) patch.intervalValue = updates.intervalValue;
    if (updates.title !== undefined) patch.title = updates.title;
    if (updates.note !== undefined) patch.note = updates.note;
    if (updates.enabled !== undefined) patch.enabled = updates.enabled;
    if (updates.notificationId !== undefined) {
      patch.notificationId = updates.notificationId;
    }
    if (updates.time !== undefined) patch.time = updates.time;
    if (updates.dayOfMonth !== undefined) patch.dayOfMonth = updates.dayOfMonth;
    if (updates.daysOfWeek !== undefined) {
      patch.daysOfWeek = updates.daysOfWeek.length
        ? updates.daysOfWeek.join(',')
        : null;
    }

    // 3. 需要重算排期的两种情况：
    //    a. 调度字段变化
    //    b. 由停用转为启用 —— 否则停用期间攒下的过期排期会原样复活
    const scheduleChanged =
      updates.time !== undefined ||
      updates.frequency !== undefined ||
      updates.daysOfWeek !== undefined ||
      updates.dayOfMonth !== undefined ||
      updates.intervalValue !== undefined;

    const reEnabled = updates.enabled === 1 && !existing.enabled;

    if (scheduleChanged || reEnabled) {
      patch.nextRemindTime = computeNextRemindTime({
        frequency: updates.frequency ?? existing.frequency,
        time: updates.time ?? existing.time,
        daysOfWeek:
          updates.daysOfWeek ?? parseStoredDaysOfWeek(existing.daysOfWeek),
        dayOfMonth: updates.dayOfMonth ?? existing.dayOfMonth,
        intervalValue: updates.intervalValue ?? existing.intervalValue,
      });
    }

    if (Object.keys(patch).length === 0) return false;

    return this.reminderRepo.update(reminderId, patch);
  }

  // ─── 列表视图（Day47-48） ───

  /**
   * 提醒列表的展示视图，UI 可直接渲染。
   *
   * 在实体之上补齐派生字段：类型中文标签、人类可读排期描述、到期状态。
   * 花名由调用方通过 `flowerNameOf` 提供（UI 通常已有花园列表，传查表函数
   * 即可，避免 N+1 查询，也让本服务不必依赖花园模块）。
   *
   * 筛选在内存中完成 —— 提醒数量是「几十条」量级，不值得为筛选再加索引与查询。
   *
   * @param opts.gardenId     只看某盆花的提醒
   * @param opts.enabled      只看启用（1）或停用（0）的
   * @param opts.flowerNameOf 花名解析器
   * @param opts.now          判定到期状态的基准时刻
   */
  async listView(
    opts: {
      gardenId?: number;
      enabled?: 0 | 1;
      flowerNameOf?: (gardenId: number) => string | null;
      now?: Date;
    } = {},
  ): Promise<ReminderView[]> {
    const userId = this.userService.getUserId();
    if (!userId) return [];

    const reminders =
      opts.gardenId !== undefined
        ? await this.reminderRepo.findByGardenId(userId, opts.gardenId)
        : await this.reminderRepo.findByUserId(userId);

    const now = opts.now ?? new Date();

    return reminders
      .filter(r => opts.enabled === undefined || r.enabled === opts.enabled)
      .map(r => ({
        reminderId: r.reminderId!,
        gardenId: r.gardenId,
        flowerName: opts.flowerNameOf?.(r.gardenId) ?? null,
        type: r.type,
        typeLabel: REMINDER_TYPE_LABELS[r.type],
        scheduleText: describeSchedule(toSchedule(r)),
        time: r.time,
        nextRemindTime: r.nextRemindTime,
        enabled: r.enabled,
        title: r.title,
        dueInfo: resolveDue(r, now),
      }));
  }

  // ─── 启用 / 停用（Day47-48） ───

  /**
   * 启用一条提醒。若原本处于停用状态，排期会重算到下一个未来排期点。
   *
   * 无需取消任何通知（启用意味着要新注册一条），`cancelledNotificationId`
   * 恒为 null；调用方拿到 `reminder` 后自行注册通知并回填 ID。
   */
  async enable(reminderId: number): Promise<ReminderStateChange> {
    return this.setState(reminderId, 1);
  }

  /**
   * 停用一条提醒。
   *
   * 返回值里的 `cancelledNotificationId` 是该提醒已注册的系统通知 ID ——
   * **调用方必须去系统里取消它**，否则停用后通知照旧会弹。
   * 该 ID 同时已从库中清空，因此不会被重复取消。
   */
  async disable(reminderId: number): Promise<ReminderStateChange> {
    return this.setState(reminderId, 0);
  }

  /**
   * 在启用 / 停用之间切换。
   */
  async toggle(reminderId: number): Promise<ReminderStateChange> {
    const reminder = await this.reminderRepo.findById(reminderId);
    if (!reminder) {
      return {ok: false, enabled: null, cancelledNotificationId: null, reminder: null};
    }
    return this.setState(reminderId, reminder.enabled ? 0 : 1);
  }

  // ─── 调度（Day45-46） ───

  /**
   * 判定一条提醒当前的到期状态（纯计算，不写库）。
   * 供 UI 展示「已逾期 N 次」，或调度方决定要不要补发。
   */
  getDueInfo(reminder: ReminderEntity, now: Date = new Date()): DueInfo {
    return resolveDue(reminder, now);
  }

  /**
   * 查询当前用户**已到期**的提醒（启用中且排期时刻已到或已过）。
   * 通知调度方的入口 —— 取到即代表「该发了」。
   */
  async listDue(now: Date = new Date()): Promise<ReminderEntity[]> {
    const userId = this.userService.getUserId();
    if (!userId) return [];
    return this.reminderRepo.findDue(userId, formatLocalDateTime(now));
  }

  /**
   * 记录一条提醒已触发：写 lastTriggeredAt，并把排期沿原网格推进到
   * 严格晚于 firedAt 的下一个排期点。
   *
   * 排期从**存储的排期点**出发推进，而不是从 firedAt 重算 —— 后者会让
   * 「每 10 天浇一次」在每次 APP 重启后重新锚定，网格逐渐漂移。
   *
   * notificationId 不在此处改动：系统通知的注册/取消归调用方管理。
   *
   * @returns 更新后的实体；记录不存在或写入失败时返回 null
   */
  async markTriggered(
    reminderId: number,
    firedAt: Date = new Date(),
  ): Promise<ReminderEntity | null> {
    const reminder = await this.reminderRepo.findById(reminderId);
    if (!reminder) return null;

    // 排期损坏时以 firedAt 为起点，避免这条提醒永久卡死
    const base = parseLocalDateTime(reminder.nextRemindTime) ?? firedAt;
    const {next} = walkForward(toSchedule(reminder), base, firedAt);

    const updated = await this.reminderRepo.update(reminderId, {
      lastTriggeredAt: formatLocalDateTime(firedAt),
      nextRemindTime: formatLocalDateTime(next),
    });
    if (!updated) return null;

    return this.reminderRepo.findById(reminderId);
  }

  /**
   * 批量记录触发。通知调度方发出一轮通知后调用。
   *
   * @returns 实际更新的条数（不存在的记录会被跳过，不影响其余）
   */
  async markTriggeredMany(
    reminderIds: number[],
    firedAt: Date = new Date(),
  ): Promise<number> {
    let updated = 0;
    for (const reminderId of reminderIds) {
      const result = await this.markTriggered(reminderId, firedAt);
      if (result) updated++;
    }
    return updated;
  }

  /**
   * 回填系统通知 ID（注册通知后调用；传 null 表示通知已取消）。
   */
  async setNotificationId(
    reminderId: number,
    notificationId: string | null,
  ): Promise<boolean> {
    return this.reminderRepo.update(reminderId, {notificationId});
  }

  /**
   * 把排期重算到下一个未来排期点。
   * 停用很久后重新启用、或系统时区变更后，用它把排期拉回正轨。
   */
  async reschedule(
    reminderId: number,
    now: Date = new Date(),
  ): Promise<ReminderEntity | null> {
    const reminder = await this.reminderRepo.findById(reminderId);
    if (!reminder) return null;

    const updated = await this.reminderRepo.update(reminderId, {
      nextRemindTime: computeNextRemindTime(toSchedule(reminder), now),
    });
    if (!updated) return null;

    return this.reminderRepo.findById(reminderId);
  }

  // ─── 删除 ───

  /**
   * 删除一条提醒。
   *
   * `cancelledNotificationId` 是该提醒已注册的系统通知 ID，调用方必须去
   * 系统里取消 —— 否则删掉的提醒仍会按时弹通知。
   */
  async delete(reminderId: number): Promise<ReminderDeleteResult> {
    const reminder = await this.reminderRepo.findById(reminderId);
    if (!reminder) return {ok: false, cancelledNotificationId: null};

    const ok = await this.reminderRepo.delete(reminderId);
    return {
      ok,
      cancelledNotificationId: ok ? reminder.notificationId : null,
    };
  }

  /**
   * 删除某盆花的全部提醒。
   *
   * 用于花园记录被移除时的级联清理 —— 不清理的话，外键又没开，
   * 这些"孤儿提醒"会继续按时弹通知。
   *
   * @returns 删除条数 + 调用方需要逐一取消的通知 ID
   */
  async deleteByGarden(gardenId: number): Promise<GardenReminderCleanup> {
    const userId = this.userService.getUserId();
    if (!userId) return {removed: 0, cancelledNotificationIds: []};

    // 先读出来拿到 notificationId，再删 —— 删完就查不到了
    const existing = await this.reminderRepo.findByGardenId(userId, gardenId);
    if (existing.length === 0) {
      return {removed: 0, cancelledNotificationIds: []};
    }

    const removed = await this.reminderRepo.deleteByGardenId(userId, gardenId);
    return {
      removed,
      cancelledNotificationIds: existing
        .map(r => r.notificationId)
        .filter((id): id is string => Boolean(id)),
    };
  }

  // ─── 内部方法 ───

  /**
   * 启用 / 停用的公共实现。
   *
   * 刻意复用 update()：它在「停用 → 启用」时会自动把 nextRemindTime
   * 重算到未来，避免停用数月后带着过期排期复活。这条规则只应存在于一处。
   */
  private async setState(
    reminderId: number,
    target: 0 | 1,
  ): Promise<ReminderStateChange> {
    const reminder = await this.reminderRepo.findById(reminderId);
    if (!reminder) {
      return {ok: false, enabled: null, cancelledNotificationId: null, reminder: null};
    }

    // 停用：把已注册的通知交还给调用方取消，并清空库中该列
    const cancelledNotificationId = target === 0 ? reminder.notificationId : null;

    const updates: UpdateReminderParams = {enabled: target};
    if (target === 0 && reminder.notificationId !== null) {
      updates.notificationId = null;
    }

    const ok = await this.update(reminderId, updates);
    if (!ok) {
      return {ok: false, enabled: null, cancelledNotificationId: null, reminder: null};
    }

    return {
      ok: true,
      enabled: target,
      cancelledNotificationId,
      reminder: await this.reminderRepo.findById(reminderId),
    };
  }

  /** 校验一条调度规格（不含 gardenId，调用方单独校验） */
  private isValidSchedule(spec: {
    type: any;
    frequency: any;
    time: any;
    daysOfWeek?: any;
    dayOfMonth?: any;
  }): boolean {
    if (!isValidType(spec.type)) return false;
    if (!isValidFrequency(spec.frequency)) return false;
    if (!isValidTime(spec.time)) return false;

    // 频率与排期字段必须自洽，避免出现「周提醒但没有星期」这类无法调度的记录
    if (spec.frequency === 'weekly') {
      return isValidDaysOfWeek(spec.daysOfWeek);
    }
    if (spec.frequency === 'monthly') {
      return isValidDayOfMonth(spec.dayOfMonth);
    }
    return true;
  }

  private error<T>(code: ErrorCode): ApiResponse<T> {
    return {code, message: getErrorMessage(code), data: null};
  }
}

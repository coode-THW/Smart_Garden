/**
 * 智慧花园 — 提醒数据仓库
 * =======================
 * reminder 表的 CRUD 操作。
 *
 * 设计要点：
 *   - daysOfWeek 以逗号分隔字符串存储（"2,4,6"），ISO 8601 星期编号，1=周一 … 7=周日
 *   - nextRemindTime / createdAt / updatedAt 存本地时间 'YYYY-MM-DDTHH:mm:ss'
 *     （系统通知按本地时区触发，存 UTC 会在调度时反复换算）
 *   - 本层只负责读写，时间计算与参数校验在 ReminderService
 *
 * 使用方式：
 *   const repo = new ReminderRepository();
 *   const reminderId = await repo.add({ ... });
 */

import {getDatabase, SqlResult} from './db';
import {ReminderEntity} from '../types';
import logger from '../services/LoggerService';

// ━━━━━ 结果集解析辅助 ━━━━━

function firstRow(resultSet: SqlResult): any {
  const rows = resultSet.rows.raw();
  return rows.length > 0 ? rows[0] : null;
}

function allRows(resultSet: SqlResult): any[] {
  return resultSet.rows.raw();
}

/** add() / addMany() 的入参 */
export interface ReminderInsertParams {
  userId: string;
  gardenId: number;
  type: string;
  frequency: string;
  intervalValue?: number | null;
  daysOfWeek?: string | null;
  dayOfMonth?: number | null;
  time: string;
  nextRemindTime: string;
  notificationId?: string | null;
  lastTriggeredAt?: string | null;
  title?: string | null;
  note?: string | null;
  enabled?: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * 全部列显式列出并绑定参数，避免位置错配。
 * add() 与 addMany() 共用同一条语句，杜绝两处漂移。
 */
const INSERT_REMINDER_SQL = `INSERT INTO reminder
         (userId, gardenId, type, frequency, intervalValue, daysOfWeek, dayOfMonth,
          time, nextRemindTime, notificationId, lastTriggeredAt, title, note,
          enabled, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

/** 允许通过 update() 写入的列白名单（防止字段名拼接进 SQL）。 */
const UPDATABLE_COLUMNS = [
  'type',
  'frequency',
  'intervalValue',
  'daysOfWeek',
  'dayOfMonth',
  'time',
  'nextRemindTime',
  'notificationId',
  'lastTriggeredAt',
  'title',
  'note',
  'enabled',
] as const;

// ━━━━━ ReminderRepository ━━━━━

export class ReminderRepository {
  // ─── 添加 ───

  /**
   * 新增一条提醒。
   *
   * notificationId / lastTriggeredAt 默认 null —— 新建的提醒尚未注册系统通知、
   * 也从未触发过；这两列由 Day45-46 的通知调度逻辑回填。
   *
   * @returns 新增记录的 reminderId
   */
  async add(params: ReminderInsertParams): Promise<number> {
    const [reminderId] = await this.addMany([params]);
    return reminderId;
  }

  /**
   * 批量新增提醒，**单一事务**：要么全部写入，要么一条都不留。
   *
   * 用于「一键设置提醒」——浇水/施肥/检查三类提醒必须成套出现，
   * 中途失败留下半套会让用户以为设置成功了。
   *
   * @returns 按入参顺序返回的新增 reminderId
   */
  async addMany(items: ReminderInsertParams[]): Promise<number[]> {
    if (items.length === 0) return [];

    const db = await getDatabase();
    const ids: number[] = [];

    await db.executeSql('BEGIN');
    try {
      for (const item of items) {
        const [resultSet] = await db.executeSql(INSERT_REMINDER_SQL, [
          item.userId,
          item.gardenId,
          item.type,
          item.frequency,
          item.intervalValue ?? null,
          item.daysOfWeek ?? null,
          item.dayOfMonth ?? null,
          item.time,
          item.nextRemindTime,
          item.notificationId ?? null,
          item.lastTriggeredAt ?? null,
          item.title ?? null,
          item.note ?? null,
          item.enabled ?? 1,
          item.createdAt,
          item.updatedAt,
        ]);
        // AUTOINCREMENT 保证 insertId 始终有值
        ids.push(resultSet.insertId!);
      }
      await db.executeSql('COMMIT');
      return ids;
    } catch (error) {
      // ROLLBACK 自身失败不能顶掉原始错误——否则排查时只看到回滚异常，
      // 看不到真正让整批失败的那条语句
      try {
        await db.executeSql('ROLLBACK');
      } catch (rollbackError) {
        logger.error('ReminderRepository', 'ROLLBACK 失败:', rollbackError);
      }
      throw error;
    }
  }

  // ─── 查询 ───

  /**
   * 按 reminderId 查询单条记录。
   */
  async findById(reminderId: number): Promise<ReminderEntity | null> {
    const db = await getDatabase();
    const [resultSet] = await db.executeSql(
      `SELECT * FROM reminder WHERE reminderId = ?`,
      [reminderId],
    );
    return firstRow(resultSet) as ReminderEntity | null;
  }

  /**
   * 查询用户的全部提醒，按下次提醒时间升序（最紧急的排最前）。
   */
  async findByUserId(userId: string): Promise<ReminderEntity[]> {
    const db = await getDatabase();
    const [resultSet] = await db.executeSql(
      `SELECT * FROM reminder WHERE userId = ? ORDER BY nextRemindTime ASC`,
      [userId],
    );
    return allRows(resultSet) as ReminderEntity[];
  }

  /**
   * 查询某盆花的全部提醒。
   */
  async findByGardenId(
    userId: string,
    gardenId: number,
  ): Promise<ReminderEntity[]> {
    const db = await getDatabase();
    // WHERE 与 ORDER BY 保持同一行：__tests__/database.test.ts 的 MockDatabase
    // 用单行正则解析 WHERE 子句，跨行会漏匹配
    const [resultSet] = await db.executeSql(
      `SELECT * FROM reminder WHERE userId = ? AND gardenId = ? ORDER BY nextRemindTime ASC`,
      [userId, gardenId],
    );
    return allRows(resultSet) as ReminderEntity[];
  }

  /**
   * 查询用户**已到期**的提醒：启用中且排期时刻已到或已过，按排期升序。
   *
   * 这是通知调度方的入口 —— 取到即代表「该发了」。
   * 逾期多久由 ReminderScheduler.resolveDue 判定，本层不做时间推算。
   *
   * @param now 本地时间字符串 'YYYY-MM-DDTHH:mm:ss'
   */
  async findDue(userId: string, now: string): Promise<ReminderEntity[]> {
    const db = await getDatabase();
    const [resultSet] = await db.executeSql(
      `SELECT * FROM reminder WHERE userId = ? AND enabled = 1 AND nextRemindTime <= ? ORDER BY nextRemindTime ASC`,
      [userId, now],
    );
    return allRows(resultSet) as ReminderEntity[];
  }

  /**
   * 统计用户的提醒总数。
   */
  async countByUserId(userId: string): Promise<number> {
    const db = await getDatabase();
    const [resultSet] = await db.executeSql(
      `SELECT COUNT(*) AS count FROM reminder WHERE userId = ?`,
      [userId],
    );
    return firstRow(resultSet).count as number;
  }

  // ─── 更新 ───

  /**
   * 局部更新提醒。仅白名单内的列可写，未传的列保持原值。
   * updatedAt 由本方法统一刷新，调用方无法覆盖。
   */
  async update(
    reminderId: number,
    patch: Partial<Record<(typeof UPDATABLE_COLUMNS)[number], any>>,
  ): Promise<boolean> {
    const db = await getDatabase();

    const fields: string[] = [];
    const values: any[] = [];

    for (const column of UPDATABLE_COLUMNS) {
      if (patch[column] !== undefined) {
        fields.push(`${column} = ?`);
        values.push(patch[column]);
      }
    }

    if (fields.length === 0) return false;

    // updatedAt 由本方法统一刷新，调用方无法覆盖
    fields.push('updatedAt = ?');
    values.push(nowIso());
    values.push(reminderId);

    const [resultSet] = await db.executeSql(
      `UPDATE reminder SET ${fields.join(', ')} WHERE reminderId = ?`,
      values,
    );
    return resultSet.rowsAffected > 0;
  }

  // ─── 删除 ───

  /**
   * 删除单条提醒。
   */
  async delete(reminderId: number): Promise<boolean> {
    const db = await getDatabase();
    const [resultSet] = await db.executeSql(
      `DELETE FROM reminder WHERE reminderId = ?`,
      [reminderId],
    );
    return resultSet.rowsAffected > 0;
  }

  /**
   * 删除某盆花的全部提醒（花园记录被移除时级联清理）。
   */
  async deleteByGardenId(userId: string, gardenId: number): Promise<number> {
    const db = await getDatabase();
    const [resultSet] = await db.executeSql(
      `DELETE FROM reminder WHERE userId = ? AND gardenId = ?`,
      [userId, gardenId],
    );
    return resultSet.rowsAffected;
  }

  /**
   * 删除用户的全部提醒（用户注销时用）。
   */
  async deleteByUserId(userId: string): Promise<number> {
    const db = await getDatabase();
    const [resultSet] = await db.executeSql(
      `DELETE FROM reminder WHERE userId = ?`,
      [userId],
    );
    return resultSet.rowsAffected;
  }
}

// ━━━━━ 内部辅助 ━━━━━

/** 审计时间戳，与 garden / feedback 表保持一致使用 ISO 8601 (UTC)。 */
function nowIso(): string {
  return new Date().toISOString();
}

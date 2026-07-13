/**
 * 智慧花园 — 识别纠错数据仓库
 * ============================
 * feedback 表的 CRUD 操作。
 *
 * 隐私设计：
 *   - 不上传原始照片，仅存 imageHash 用于去重
 *   - 上传为可选 + WiFi 下静默执行（Phase 3）
 *
 * 使用方式：
 *   const repo = new CorrectionRepository();
 *   const id = await repo.add({ imageHash: '...', ... });
 */

import {getDatabase, SqlResult} from './db';
import {FeedbackEntity} from '../types';

// ━━━━━ 结果集解析辅助 ━━━━━

function firstRow(resultSet: SqlResult): any {
  const rows = resultSet.rows.raw();
  return rows.length > 0 ? rows[0] : null;
}

function allRows(resultSet: SqlResult): any[] {
  return resultSet.rows.raw();
}

// ━━━━━ CorrectionRepository ━━━━━

export class CorrectionRepository {
  // ─── 添加 ───

  /**
   * 记录一条纠错反馈。
   * @returns 新增记录的 id
   */
  async add(params: {
    userId: string;
    imageHash: string;
    yoloResult: string;
    confidence: number;
    userCorrection: string;
    source?: string;
  }): Promise<number> {
    const db = await getDatabase();
    const now = new Date().toISOString();

    const [resultSet] = await db.executeSql(
      `INSERT INTO feedback (userId, imageHash, yoloResult, confidence, userCorrection, timestamp, source, synced)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0)`,
      [
        params.userId,
        params.imageHash,
        params.yoloResult,
        params.confidence,
        params.userCorrection,
        now,
        params.source || 'yolov11',
      ],
    );
    return resultSet.insertId!;
  }

  // ─── 查询 ───

  /**
   * 查询某个用户的所有纠错记录，按时间降序。
   */
  async findByUserId(userId: string): Promise<FeedbackEntity[]> {
    const db = await getDatabase();
    const [resultSet] = await db.executeSql(
      `SELECT * FROM feedback WHERE userId = ? ORDER BY timestamp DESC`,
      [userId],
    );
    return allRows(resultSet) as FeedbackEntity[];
  }

  /**
   * 按 id 查询单条纠错记录。
   */
  async findById(id: number): Promise<FeedbackEntity | null> {
    const db = await getDatabase();
    const [resultSet] = await db.executeSql(
      `SELECT * FROM feedback WHERE id = ?`,
      [id],
    );
    return firstRow(resultSet) as FeedbackEntity | null;
  }

  /**
   * 统计用户的纠错记录总数。
   */
  async countByUserId(userId: string): Promise<number> {
    const db = await getDatabase();
    const [resultSet] = await db.executeSql(
      `SELECT COUNT(*) AS count FROM feedback WHERE userId = ?`,
      [userId],
    );
    return firstRow(resultSet).count as number;
  }

  /**
   * 根据图片哈希查找已存在的纠错记录（去重用）。
   */
  async findByImageHash(imageHash: string): Promise<FeedbackEntity | null> {
    const db = await getDatabase();
    const [resultSet] = await db.executeSql(
      `SELECT * FROM feedback WHERE imageHash = ? ORDER BY timestamp DESC LIMIT 1`,
      [imageHash],
    );
    return firstRow(resultSet) as FeedbackEntity | null;
  }

  // ─── 导出 / 同步（Phase 3） ───

  /**
   * 查询所有未同步的纠错记录，按时间升序。
   */
  async findUnsynced(): Promise<FeedbackEntity[]> {
    const db = await getDatabase();
    const [resultSet] = await db.executeSql(
      `SELECT * FROM feedback WHERE synced = 0 ORDER BY timestamp ASC`,
    );
    return allRows(resultSet) as FeedbackEntity[];
  }

  /**
   * 统计未同步的记录数。
   */
  async countUnsynced(): Promise<number> {
    const db = await getDatabase();
    const [resultSet] = await db.executeSql(
      `SELECT COUNT(*) AS count FROM feedback WHERE synced = 0`,
    );
    return firstRow(resultSet).count as number;
  }

  /**
   * 将指定记录标记为已同步。
   */
  async markSynced(ids: number[]): Promise<number> {
    if (ids.length === 0) return 0;
    const db = await getDatabase();
    const placeholders = ids.map(() => '?').join(',');
    const [resultSet] = await db.executeSql(
      `UPDATE feedback SET synced = 1 WHERE id IN (${placeholders})`,
      ids,
    );
    return resultSet.rowsAffected;
  }

  /**
   * 标记所有未同步记录为已同步。
   */
  async markAllSynced(): Promise<number> {
    const db = await getDatabase();
    const [resultSet] = await db.executeSql(
      `UPDATE feedback SET synced = 1 WHERE synced = 0`,
    );
    return resultSet.rowsAffected;
  }

  // ─── 删除 ───

  /**
   * 删除指定纠错记录。
   */
  async delete(id: number): Promise<boolean> {
    const db = await getDatabase();
    const [resultSet] = await db.executeSql(
      `DELETE FROM feedback WHERE id = ?`,
      [id],
    );
    return resultSet.rowsAffected > 0;
  }

  /**
   * 删除用户的所有纠错记录（用户注销时用）。
   */
  async deleteByUserId(userId: string): Promise<number> {
    const db = await getDatabase();
    const [resultSet] = await db.executeSql(
      `DELETE FROM feedback WHERE userId = ?`,
      [userId],
    );
    return resultSet.rowsAffected;
  }
}

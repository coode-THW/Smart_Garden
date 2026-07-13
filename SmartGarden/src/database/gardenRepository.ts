/**
 * 智慧花园 — 花园数据仓库
 * =======================
 * garden 表的 CRUD 操作。
 *
 * 使用方式：
 *   const repo = new GardenRepository();
 *   const gardens = await repo.findByUserId(userId);
 */

import {getDatabase, SqlResult} from './db';
import {GardenEntity} from '../types';

// ━━━━━ 结果集解析辅助 ━━━━━

function firstRow(resultSet: SqlResult): any {
  const rows = resultSet.rows.raw();
  return rows.length > 0 ? rows[0] : null;
}

function allRows(resultSet: SqlResult): any[] {
  return resultSet.rows.raw();
}

// ━━━━━ GardenRepository ━━━━━

export class GardenRepository {
  // ─── 添加 ───

  /**
   * 添加花卉到花园。
   * @returns 新增记录的 gardenId
   */
  async add(params: {
    userId: string;
    flowerId: number;
    customName?: string;
    location?: string;
    addedDate?: string;
    photoPath?: string;
  }): Promise<number> {
    const db = await getDatabase();
    const now = new Date().toISOString();
    const date = params.addedDate || now.split('T')[0];

    const [resultSet] = await db.executeSql(
      `INSERT INTO garden (userId, flowerId, customName, location, addedDate, photoPath, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        params.userId,
        params.flowerId,
        params.customName || null,
        params.location || null,
        date,
        params.photoPath || null,
        now,
        now,
      ],
    );
    // AUTOINCREMENT 保证 insertId 始终有值
    return resultSet.insertId!;
  }

  // ─── 查询 ───

  /**
   * 查询用户的所有花园记录，按添加时间降序。
   */
  async findByUserId(userId: string): Promise<GardenEntity[]> {
    const db = await getDatabase();
    const [resultSet] = await db.executeSql(
      `SELECT * FROM garden WHERE userId = ? ORDER BY createdAt DESC`,
      [userId],
    );
    return allRows(resultSet) as GardenEntity[];
  }

  /**
   * 按 gardenId 查询单条记录。
   */
  async findById(gardenId: number): Promise<GardenEntity | null> {
    const db = await getDatabase();
    const [resultSet] = await db.executeSql(
      `SELECT * FROM garden WHERE gardenId = ?`,
      [gardenId],
    );
    return firstRow(resultSet) as GardenEntity | null;
  }

  /**
   * 去重检查：同一用户、同一品种、同名 → 视为重复。
   */
  async findByUserAndFlower(
    userId: string,
    flowerId: number,
    customName?: string,
  ): Promise<GardenEntity[]> {
    const db = await getDatabase();
    const [resultSet] = await db.executeSql(
      `SELECT * FROM garden
       WHERE userId = ? AND flowerId = ? AND (customName = ? OR (customName IS NULL AND ? IS NULL))
       ORDER BY createdAt DESC`,
      [userId, flowerId, customName || null, customName || null],
    );
    return allRows(resultSet) as GardenEntity[];
  }

  /**
   * 统计用户的花园总数。
   */
  async countByUserId(userId: string): Promise<number> {
    const db = await getDatabase();
    const [resultSet] = await db.executeSql(
      `SELECT COUNT(*) AS count FROM garden WHERE userId = ?`,
      [userId],
    );
    return firstRow(resultSet).count as number;
  }

  // ─── 更新 ───

  /**
   * 更新花园记录。
   */
  async update(
    gardenId: number,
    updates: {
      customName?: string;
      location?: string;
      photoPath?: string | null;
    },
  ): Promise<boolean> {
    const db = await getDatabase();
    const now = new Date().toISOString();

    const fields: string[] = [];
    const values: any[] = [];

    if (updates.customName !== undefined) {
      fields.push('customName = ?');
      values.push(updates.customName);
    }
    if (updates.location !== undefined) {
      fields.push('location = ?');
      values.push(updates.location);
    }
    if (updates.photoPath !== undefined) {
      fields.push('photoPath = ?');
      values.push(updates.photoPath);
    }

    if (fields.length === 0) return false;

    fields.push('updatedAt = ?');
    values.push(now);
    values.push(gardenId);

    const [resultSet] = await db.executeSql(
      `UPDATE garden SET ${fields.join(', ')} WHERE gardenId = ?`,
      values,
    );
    return resultSet.rowsAffected > 0;
  }

  // ─── 删除 ───

  /**
   * 删除花园记录。
   */
  async delete(gardenId: number): Promise<boolean> {
    const db = await getDatabase();
    const [resultSet] = await db.executeSql(
      `DELETE FROM garden WHERE gardenId = ?`,
      [gardenId],
    );
    return resultSet.rowsAffected > 0;
  }

  /**
   * 删除用户的所有花园记录（用户注销时用）。
   */
  async deleteByUserId(userId: string): Promise<number> {
    const db = await getDatabase();
    const [resultSet] = await db.executeSql(
      `DELETE FROM garden WHERE userId = ?`,
      [userId],
    );
    return resultSet.rowsAffected;
  }
}

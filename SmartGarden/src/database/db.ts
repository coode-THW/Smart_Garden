/**
 * 智慧花园 — SQLite 数据库初始化模块
 * ====================================
 * 职责：
 *   - 数据库连接管理（单例模式）
 *   - Phase 1 三张核心表的 DDL（user / garden / feedback）
 *   - Phase 2 预留表（reminder）DDL 注释
 *
 * 使用方式：
 *   const db = await getDatabase();         // 获取连接（首次自动建表）
 *   const [rows] = await db.executeSql(...); // 执行查询
 *
 * SQLite 库: react-native-quick-sqlite
 * 本模块封装了 executeSql 适配层，使 Repositories 层无需关心底层库差异。
 */

import {open, type QuickSQLiteConnection} from 'react-native-quick-sqlite';

// ━━━━━ 常量 ━━━━━

const DB_NAME = 'smart_garden.db';
const DB_VERSION = 1;

// ━━━━━ 类型定义 ━━━━━

/**
 * 适配后的结果集行接口，与 react-native-sqlite-storage 风格兼容。
 */
export interface SqlResult {
  insertId?: number;
  rowsAffected: number;
  rows: {
    length: number;
    raw(): any[];
    item(idx: number): any;
  };
}

/**
 * 适配后的数据库接口（供 Repositories 层使用）。
 */
export interface SqliteDatabaseAdapter {
  executeSql(sql: string, params?: any[]): Promise<SqlResult[]>;
  close(): void;
}

// ━━━━━ 适配层 ━━━━━

/**
 * 将 react-native-quick-sqlite 的 API 适配为 Repository 层期望的 executeSql 接口。
 */
function createAdapter(rawDb: QuickSQLiteConnection): SqliteDatabaseAdapter {
  return {
    executeSql: async (sql: string, params?: any[]) => {
      try {
        const result = await rawDb.executeAsync(sql, params);

        const rowsArray = result.rows?._array ?? [];

        return [
          {
            insertId: result.insertId ?? undefined,
            rowsAffected: result.rowsAffected ?? 0,
            rows: {
              length: rowsArray.length,
              raw: () => rowsArray,
              item: (idx: number) => rowsArray[idx],
            },
          },
        ];
      } catch (error) {
        console.error('[DB] SQL 执行失败:', sql.slice(0, 80), error);
        throw error;
      }
    },
    close: () => {
      rawDb.close();
    },
  };
}

// ━━━━━ 数据库单例 ━━━━━

let db: SqliteDatabaseAdapter | null = null;

// ━━━━━ DDL 语句 ━━━━━

const DDL_CREATE_TABLES = `-- ============================================================
-- 智慧花园 SQLite 建表脚本
-- 版本: v1.0 | Phase 1
-- 兼容: SQLite 3.x
-- ============================================================

-- -----------------------------------------------------------
-- 1. 用户表（免注册设计）
-- -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS user (
    userId        TEXT    NOT NULL PRIMARY KEY,
    createdAt     TEXT    NOT NULL,
    phone         TEXT    NULL,
    passwordHash  TEXT    NULL,
    nickname      TEXT    NOT NULL DEFAULT '花友',
    avatarPath    TEXT    NULL
);

-- -----------------------------------------------------------
-- 2. 花园表（我的花卉收藏）
-- -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS garden (
    gardenId      INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    userId        TEXT    NOT NULL,
    flowerId      INTEGER NOT NULL,
    customName    TEXT    NULL,
    location      TEXT    NULL,
    addedDate     TEXT    NULL,
    photoPath     TEXT    NULL,
    createdAt     TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
    updatedAt     TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
    FOREIGN KEY (userId) REFERENCES user(userId)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_garden_user_flower
    ON garden(userId, flowerId, customName);

CREATE INDEX IF NOT EXISTS idx_garden_userId
    ON garden(userId);

-- -----------------------------------------------------------
-- 3. 识别纠错反馈表
-- -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS feedback (
    id             INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    userId         TEXT    NOT NULL,
    imageHash      TEXT    NOT NULL,
    yoloResult     TEXT    NOT NULL,
    confidence     REAL    NOT NULL,
    userCorrection TEXT    NOT NULL,
    timestamp      TEXT    NOT NULL,
    source         TEXT    NOT NULL DEFAULT 'yolov11',
    synced         INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (userId) REFERENCES user(userId)
);

CREATE INDEX IF NOT EXISTS idx_feedback_hash
    ON feedback(imageHash);
`;

// ━━━━━ 公开 API ━━━━━

/**
 * 获取数据库实例（单例模式）。
 * 首次调用时自动执行 DDL 建表。
 *
 * @returns 适配后的数据库实例
 */
export async function getDatabase(): Promise<SqliteDatabaseAdapter> {
  if (db) return db;

  try {
    const rawDb = open({name: DB_NAME});
    db = createAdapter(rawDb);

    // 执行 DDL 建表
    await db.executeSql(DDL_CREATE_TABLES);

    console.log(`[DB] 已初始化: ${DB_NAME} (v${DB_VERSION})`);
    return db;
  } catch (error) {
    console.error('[DB] 数据库初始化失败:', error);
    throw error;
  }
}

/**
 * 获取内联 DDL 语句（用于单元测试或手动执行）。
 */
export function getDDL(): string {
  return DDL_CREATE_TABLES;
}

/**
 * 重置数据库（仅开发/测试用）。
 * 删除所有表并重新创建。
 */
export async function resetDatabase(): Promise<void> {
  if (!db) return;

  try {
    await db.executeSql(
      'DROP TABLE IF EXISTS feedback;\n' +
      'DROP TABLE IF EXISTS garden;\n' +
      'DROP TABLE IF EXISTS user;',
    );
    await db.executeSql(DDL_CREATE_TABLES);
    console.log('[DB] 数据库已重置');
  } catch (error) {
    console.error('[DB] 数据库重置失败:', error);
    throw error;
  }
}

/**
 * 关闭数据库连接。
 */
export function closeDatabase(): void {
  if (!db) return;
  try {
    db.close();
    db = null;
    console.log('[DB] 数据库连接已关闭');
  } catch (error) {
    console.error('[DB] 关闭数据库失败:', error);
    throw error;
  }
}

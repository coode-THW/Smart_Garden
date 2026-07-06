/**
 * 智慧花园 — 数据库仓库集成测试
 * ==============================
 * 通过 mock getDatabase() 模拟 SQLite 执行，验证所有 CRUD 逻辑。
 *
 * 运行: npx jest __tests__/database.test.ts
 */

import {GardenRepository} from '../src/database/gardenRepository';
import {CorrectionRepository} from '../src/database/correctionRepository';
import {SqlResult} from '../src/database/db';

// ━━━━━ Mock 数据库引擎 ━━━━━

/**
 * 用 JavaScript 数组模拟 SQLite 表的数据存储。
 * 每个表是一个对象数组，executeSql 模拟 SQL 查询。
 */
class MockDatabase {
  private tables: Record<string, any[]> = {
    user: [],
    garden: [],
    feedback: [],
  };
  private autoIncrement: Record<string, number> = {
    garden: 0,
    feedback: 0,
  };

  /** 清空所有数据 */
  reset() {
    this.tables = {user: [], garden: [], feedback: []};
    this.autoIncrement = {garden: 0, feedback: 0};
  }

  /** 直接注入测试数据（跳过 SQL 解析） */
  seed(table: string, rows: any[]) {
    this.tables[table] = [...rows];
    this.autoIncrement[table] = rows.length;
  }

  /** 模拟 db.executeSql */
  async executeSql(
    sql: string,
    params?: any[],
  ): Promise<SqlResult[]> {
    const type = sql.trim().split(' ')[0].toUpperCase();

    if (type === 'INSERT') {
      return this.handleInsert(sql, params);
    } else if (type === 'SELECT' || type === 'PRAGMA') {
      return this.handleSelect(sql, params);
    } else if (type === 'UPDATE') {
      return this.handleUpdate(sql, params);
    } else if (type === 'DELETE') {
      return this.handleDelete(sql, params);
    }
    return [{rowsAffected: 0, rows: {length: 0, raw: () => [], item: () => null}}];
  }

  // ─── INSERT 模拟 ───

  private handleInsert(sql: string, params?: any[]): SqlResult[] {
    const table = this.parseTableName(sql);
    if (!table) throw new Error(`Mock: 无法解析表名: ${sql}`);

    this.autoIncrement[table] = (this.autoIncrement[table] || 0) + 1;
    const newId = this.autoIncrement[table];

    // 提取 INSERT 的列名
    const colMatch = sql.match(/INSERT\s+INTO\s+\w+\s*\(([^)]+)\)/i);
    const columns = colMatch
      ? colMatch[1].split(',').map(c => c.trim())
      : [];

    const row: any = {id: newId};
    if (columns.length > 0 && params) {
      columns.forEach((col, i) => {
        row[col] = params[i] ?? null;
      });
    }
    // 特殊处理 garden 表的主键
    if (table === 'garden') {
      row.gardenId = newId;
    }
    this.tables[table].push(row);

    return [
      {
        insertId: newId,
        rowsAffected: 1,
        rows: {length: 0, raw: () => [], item: () => null},
      },
    ];
  }

  // ─── SELECT 模拟 ───

  private handleSelect(sql: string, params?: any[]): SqlResult[] {
    const table = this.parseTableName(sql);
    if (!table) {
      // COUNT(*) 无表名时不报错
      return [{
        rowsAffected: 0,
        rows: {length: 0, raw: () => [], item: () => null},
      }];
    }

    let rows = [...(this.tables[table] || [])];

    // 处理 COUNT(*)
    if (/COUNT\s*\(/i.test(sql)) {
      const count = rows.length;
      return [
        {
          rowsAffected: 0,
          rows: {
            length: 1,
            raw: () => [{count}],
            item: (i: number) => ({count}),
          },
        },
      ];
    }

    // 处理 WHERE 条件（简化模拟：只支持 = 条件）
    const whereMatch = sql.match(/WHERE\s+(.+?)(?:ORDER BY|LIMIT|$)/i);
    if (whereMatch && params && params.length > 0) {
      const conditions = whereMatch[1].split('AND').map(c => c.trim());
      let paramIdx = 0;
      for (const cond of conditions) {
        const colMatch = cond.match(/^(\w+)\s*=\s*\??$/);
        if (colMatch && paramIdx < params.length) {
          const col = colMatch[1];
          const val = params[paramIdx++];
          rows = rows.filter(r => r[col] === val || (r[col] == null && val == null));
        } else {
          // 处理 LIKE 或其他条件，跳过
          paramIdx++;
        }
      }
      // 处理 IS NULL 条件
      if (sql.includes('IS NULL')) {
        // 简化处理：不额外过滤
      }
    }

    // ORDER BY createdAt DESC
    if (/ORDER BY\s+createdAt\s+DESC/i.test(sql)) {
      rows = [...rows].sort((a, b) => {
        return (b.createdAt || '').localeCompare(a.createdAt || '');
      });
    }

    // LIMIT 1
    if (/LIMIT\s+1/i.test(sql)) {
      rows = rows.slice(0, 1);
    }

    return [
      {
        rowsAffected: 0,
        rows: {
          length: rows.length,
          raw: () => rows,
          item: (i: number) => rows[i],
        },
      },
    ];
  }

  // ─── UPDATE / DELETE ───

  private handleUpdate(sql: string, params?: any[]): SqlResult[] {
    const table = this.parseTableName(sql);
    if (!table) throw new Error(`Mock: 无法解析表名: ${sql}`);

    const rows = this.tables[table] || [];
    let affected = 0;

    // 简化：只处理 WHERE id = ? 或 WHERE gardenId = ? 或 WHERE userId = ?
    const whereMatch = sql.match(/WHERE\s+(\w+)\s*=\s*\?/i);
    if (whereMatch && params && params.length >= 2) {
      const col = whereMatch[1];
      const val = params[params.length - 1]; // 最后一个参数是 WHERE 值
      for (const row of rows) {
        if (row[col] === val) affected++;
      }
    }
    if (params && params.length >= 1 && !whereMatch) {
      affected = rows.length; // 无条件 UPDATE，更新全部
    }

    return [
      {
        rowsAffected: affected,
        rows: {length: 0, raw: () => [], item: () => null},
      },
    ];
  }

  private handleDelete(sql: string, params?: any[]): SqlResult[] {
    const table = this.parseTableName(sql);
    if (!table) throw new Error(`Mock: 无法解析表名: ${sql}`);

    const rows = this.tables[table] || [];
    let affected = 0;

    const whereMatch = sql.match(/WHERE\s+(\w+)\s*=\s*\?/i);
    if (whereMatch && params && params.length > 0) {
      const col = whereMatch[1];
      const val = params[0];
      const remaining = rows.filter(r => r[col] !== val);
      affected = rows.length - remaining.length;
      this.tables[table] = remaining;
    }

    return [
      {
        rowsAffected: affected,
        rows: {length: 0, raw: () => [], item: () => null},
      },
    ];
  }

  // ─── 工具 ───

  private parseTableName(sql: string): string | null {
    // FROM garden → garden
    const fromMatch = sql.match(/(?:FROM|INTO|UPDATE)\s+(\w+)/i);
    return fromMatch ? fromMatch[1].toLowerCase() : null;
  }
}

const mockDb = new MockDatabase();

// Mock db 模块
jest.mock('../src/database/db', () => ({
  getDatabase: jest.fn(() =>
    Promise.resolve({
      executeSql: (sql: string, params?: any[]) => mockDb.executeSql(sql, params),
      close: () => {},
    }),
  ),
  getDDL: () => '',
}));

// ━━━━━ 测试 ━━━━━

const UUID = 'test-uuid-0001';

function seedUser() {
  mockDb.reset();
  mockDb.seed('user', [
    {
      userId: UUID,
      createdAt: '2026-07-01T00:00:00.000Z',
      phone: null,
      passwordHash: null,
      nickname: '花友',
      avatarPath: null,
    },
  ]);
}

describe('GardenRepository', () => {
  let repo: GardenRepository;

  beforeEach(() => {
    seedUser();
    repo = new GardenRepository();
  });

  describe('add()', () => {
    test('添加花卉返回 gardenId', async () => {
      const id = await repo.add({userId: UUID, flowerId: 6, customName: '小红'});
      expect(id).toBe(1);
    });

    test('添加多条记录 ID 递增', async () => {
      const id1 = await repo.add({userId: UUID, flowerId: 6});
      const id2 = await repo.add({userId: UUID, flowerId: 3});
      expect(id2).toBe(id1 + 1);
    });
  });

  describe('findByUserId()', () => {
    test('空花园返回空数组', async () => {
      const list = await repo.findByUserId(UUID);
      expect(list).toEqual([]);
    });

    test('返回用户的所有花卉（按时间降序）', async () => {
      await repo.add({userId: UUID, flowerId: 6, customName: '小红'});
      // 略微延迟确保排序稳定
      await new Promise(r => setTimeout(r, 5));
      await repo.add({userId: UUID, flowerId: 3, customName: '小黄'});
      const list = await repo.findByUserId(UUID);
      expect(list.length).toBe(2);
      // createdAt DESC, 所以小黄（后添加）在第一个
      expect(list[0].customName).toBe('小黄');
    });
  });

  describe('findById()', () => {
    test('按 ID 查询成功', async () => {
      const id = await repo.add({userId: UUID, flowerId: 6});
      const found = await repo.findById(id);
      expect(found).not.toBeNull();
      expect(found!.flowerId).toBe(6);
    });

    test('不存在的 ID 返回 null', async () => {
      const found = await repo.findById(999);
      expect(found).toBeNull();
    });
  });

  describe('countByUserId()', () => {
    test('空花园统计为 0', async () => {
      const count = await repo.countByUserId(UUID);
      expect(count).toBe(0);
    });

    test('添加后统计正确', async () => {
      await repo.add({userId: UUID, flowerId: 6});
      await repo.add({userId: UUID, flowerId: 3});
      expect(await repo.countByUserId(UUID)).toBe(2);
    });
  });

  describe('update()', () => {
    test('更新位置成功', async () => {
      const id = await repo.add({userId: UUID, flowerId: 6});
      const ok = await repo.update(id, {location: '南阳台'});
      expect(ok).toBe(true);
    });

    test('无更新字段返回 false', async () => {
      const id = await repo.add({userId: UUID, flowerId: 6});
      const ok = await repo.update(id, {});
      expect(ok).toBe(false);
    });
  });

  describe('delete()', () => {
    test('删除后记录消失', async () => {
      const id = await repo.add({userId: UUID, flowerId: 6});
      expect(await repo.delete(id)).toBe(true);
      expect(await repo.findById(id)).toBeNull();
    });

    test('删除不存在的记录返回 false', async () => {
      expect(await repo.delete(999)).toBe(false);
    });
  });
});

describe('CorrectionRepository', () => {
  let repo: CorrectionRepository;

  beforeEach(() => {
    seedUser();
    repo = new CorrectionRepository();
  });

  describe('add()', () => {
    test('插入纠错返回 id', async () => {
      const id = await repo.add({
        userId: UUID,
        imageHash: 'abc123',
        yoloResult: '蒲公英',
        confidence: 0.65,
        userCorrection: '不是花卉',
      });
      expect(id).toBe(1);
    });

    test('LLM 来源记录正常插入', async () => {
      const id = await repo.add({
        userId: UUID,
        imageHash: 'def456',
        yoloResult: '月季',
        confidence: 0.42,
        userCorrection: '玫瑰',
        source: 'llm',
      });
      expect(id).toBe(1);
    });
  });

  describe('查询', () => {
    test('按用户查询纠错历史', async () => {
      await repo.add({userId: UUID, imageHash: 'h1', yoloResult: 'x', confidence: 0.5, userCorrection: 'y'});
      const list = await repo.findByUserId(UUID);
      expect(list.length).toBe(1);
    });

    test('不存在的 id 返回 null', async () => {
      const found = await repo.findById(999);
      expect(found).toBeNull();
    });
  });

  describe('同步管理', () => {
    test('新记录默认未同步', async () => {
      await repo.add({userId: UUID, imageHash: 'h1', yoloResult: 'x', confidence: 0.5, userCorrection: 'y'});
      const unsynced = await repo.findUnsynced();
      expect(unsynced.length).toBe(1);
    });

    test('标记同步后未同步为 0', async () => {
      await repo.add({userId: UUID, imageHash: 'h1', yoloResult: 'x', confidence: 0.5, userCorrection: 'y'});
      const affected = await repo.markSynced([1]);
      expect(affected).toBe(1);
    });
  });

  describe('边界', () => {
    test('空数组标记同步返回 0', async () => {
      expect(await repo.markSynced([])).toBe(0);
    });

    test('不存在的用户纠错为空列表', async () => {
      const list = await repo.findByUserId('nonexistent');
      expect(list).toEqual([]);
    });
  });
});

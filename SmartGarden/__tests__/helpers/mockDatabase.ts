/**
 * 测试用内存版 SQLite 引擎（共享工具）
 * ====================================
 * 用 JS 数组模拟表数据，把 executeSql 认得的 SQL 子集落到这些数组上。
 * 供 __tests__/database.test.ts 与提醒调度集成测试共用，避免复制多份。
 *
 * 支持范围（够用即可，不是完整 SQL）：
 *   INSERT   —— 列名 + VALUES 元组（占位符与字面量混用也支持）
 *   SELECT   —— WHERE（= / <= / >= / < / >，占位符或字面量）、COUNT(*)、ORDER BY、LIMIT 1
 *   UPDATE   —— SET ... WHERE ...，会真正改写行数据
 *   DELETE   —— 多条件 WHERE
 * 不支持：JOIN、GROUP BY、LIKE、子查询、事务语义（BEGIN/COMMIT/ROLLBACK 视为空操作）。
 */

import {SqlResult} from '../../src/database/db';

class MockDatabase {
  private tables: Record<string, any[]> = {
    user: [],
    garden: [],
    feedback: [],
    reminder: [],
  };
  private autoIncrement: Record<string, number> = {
    garden: 0,
    feedback: 0,
    reminder: 0,
  };

  /** 清空所有数据 */
  reset() {
    this.tables = {user: [], garden: [], feedback: [], reminder: []};
    this.autoIncrement = {garden: 0, feedback: 0, reminder: 0};
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

    // 提取 VALUES 元组，逐项判断是占位符还是字面量。
    // 不能按「列下标 == 参数下标」映射：语句里可能混有字面量
    // （如 feedback 的 `..., synced) VALUES (..., 0)`），那样会把
    // 字面量之后的所有列都错位一格。
    const valuesMatch = sql.match(/VALUES\s*\(([\s\S]*?)\)\s*;?\s*$/i);
    const tokens = valuesMatch ? valuesMatch[1].split(',') : [];

    const row: any = {id: newId};
    let paramIdx = 0;
    columns.forEach((col, i) => {
      const token = (tokens[i] ?? '').trim();
      row[col] =
        token === '?' ? params?.[paramIdx++] ?? null : this.parseLiteral(token);
    });
    // 特殊处理 garden / reminder 表的主键
    if (table === 'garden') {
      row.gardenId = newId;
    }
    if (table === 'reminder') {
      row.reminderId = newId;
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

    // 处理 WHERE 条件（支持 = / <= / >= / < / >，占位符或字面量）
    // [\s\S] 而非 . —— 跨行 SQL 也能解析
    const whereMatch = sql.match(/WHERE\s+([\s\S]+?)(?:ORDER BY|LIMIT|$)/i);
    if (whereMatch) {
      const values = params ?? [];
      let paramIdx = 0;

      for (const cond of whereMatch[1].split(/\s+AND\s+/i).map(c => c.trim())) {
        const parsed = this.parseCondition(cond, values, paramIdx);
        if (parsed) {
          paramIdx = parsed.nextIdx;
          rows = rows.filter(r =>
            this.applyCondition(r, parsed.col, parsed.op, parsed.value),
          );
        } else {
          // LIKE、IS NULL 等不识别 —— 仍需推进占位符游标，否则后续条件会错位
          paramIdx += (cond.match(/\?/g) || []).length;
        }
      }
    }

    // 处理 COUNT(*) —— 必须在 WHERE 过滤之后，否则会统计整表行数
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

    // ORDER BY <col> [ASC|DESC]，字符串按字典序、数字按数值比较，NULL 排最后
    const orderMatch = sql.match(/ORDER BY\s+(\w+)\s*(ASC|DESC)?/i);
    if (orderMatch) {
      const col = orderMatch[1];
      const dir = (orderMatch[2] ?? 'ASC').toUpperCase();

      rows = [...rows].sort((a, b) => {
        const av = a[col];
        const bv = b[col];
        if (av == null && bv == null) return 0;
        if (av == null) return 1;
        if (bv == null) return -1;

        const cmp =
          typeof av === 'number' && typeof bv === 'number'
            ? av - bv
            : String(av).localeCompare(String(bv));
        return dir === 'DESC' ? -cmp : cmp;
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

    // SET col = ?, col = ? … WHERE col = ? [AND col = ? …]
    // 真正修改行数据，使 update 后可回读校验
    const setMatch = sql.match(/SET\s+([\s\S]+?)\s+WHERE/i);
    const whereMatch = sql.match(/WHERE\s+([\s\S]+?)(?:ORDER BY|LIMIT|$)/i);

    if (setMatch && whereMatch && params) {
      const setCols = this.parseAssignments(setMatch[1]);
      const whereCols = this.parseAssignments(whereMatch[1]);

      const setValues = params.slice(0, setCols.length);
      const whereValues = params.slice(
        setCols.length,
        setCols.length + whereCols.length,
      );

      for (const row of rows) {
        const matches = whereCols.every((col, i) => row[col] === whereValues[i]);
        if (!matches) continue;
        setCols.forEach((col, i) => {
          row[col] = setValues[i];
        });
        affected++;
      }
    } else if (params && params.length >= 1 && !whereMatch) {
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

    // 支持多条件：WHERE userId = ? AND gardenId = ?
    // 注：无条件 DELETE（清空全表）不支持，Repository 层不产生此类语句
    const whereMatch = sql.match(/WHERE\s+([\s\S]+?)(?:ORDER BY|LIMIT|$)/i);
    if (whereMatch && params && params.length > 0) {
      const whereCols = this.parseAssignments(whereMatch[1]);
      const whereValues = params.slice(0, whereCols.length);

      const remaining = rows.filter(
        r => !whereCols.every((col, i) => r[col] === whereValues[i]),
      );
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

  /**
   * 从 "col = ?, col2 = ?" / "col = ? AND col2 = ?" 解析出列名数组。
   * 无法识别的片段（如 IS NULL）会被跳过。
   */
  private parseAssignments(fragment: string): string[] {
    return fragment
      .split(/\s+AND\s+|,/i)
      .map(part => part.trim().match(/^(\w+)\s*=\s*\??$/)?.[1])
      .filter((col): col is string => Boolean(col));
  }

  /**
   * 解析单个 "col OP value" 条件。
   * OP 支持 = / <= / >= / < / >；value 可以是 `?` 占位符、数字字面量或单引号字符串。
   *
   * @returns null 表示无法识别（LIKE、IS NULL 等）
   */
  private parseCondition(
    raw: string,
    params: any[],
    paramIdx: number,
  ): {col: string; op: string; value: any; nextIdx: number} | null {
    const m = raw.match(/^(\w+)\s*(<=|>=|<|>|=)\s*(.+)$/);
    if (!m) return null;

    const [, col, op, rhs] = m;

    if (rhs === '?') {
      return {col, op, value: params[paramIdx], nextIdx: paramIdx + 1};
    }
    if (/^-?\d+(\.\d+)?$/.test(rhs)) {
      return {col, op, value: Number(rhs), nextIdx: paramIdx};
    }
    if (/^'[^']*'$/.test(rhs)) {
      return {col, op, value: rhs.slice(1, -1), nextIdx: paramIdx};
    }
    return null;
  }

  /** 把 SQL 字面量转成 JS 值（NULL / 数字 / 单引号字符串） */
  private parseLiteral(token: string): any {
    const t = (token ?? '').trim();
    if (t.toUpperCase() === 'NULL') return null;
    if (/^-?\d+(\.\d+)?$/.test(t)) return Number(t);
    if (/^'[^']*'$/.test(t)) return t.slice(1, -1);
    return t;
  }

  private applyCondition(row: any, col: string, op: string, value: any): boolean {
    const actual = row[col];
    switch (op) {
      case '=':
        return actual === value || (actual == null && value == null);
      case '<=':
        return actual != null && actual <= value;
      case '>=':
        return actual != null && actual >= value;
      case '<':
        return actual != null && actual < value;
      case '>':
        return actual != null && actual > value;
      default:
        return true;
    }
  }

  // ─── 工具 ───

  private parseTableName(sql: string): string | null {
    // FROM garden → garden
    const fromMatch = sql.match(/(?:FROM|INTO|UPDATE)\s+(\w+)/i);
    return fromMatch ? fromMatch[1].toLowerCase() : null;
  }
}

export const mockDb = new MockDatabase();

#!/usr/bin/env python3
"""
智慧花园 — Phase 1 集成测试
===========================
模拟完整的数据流验证，可脱离 RN 环境独立运行（仅需 Python 3 + sqlite3）。

测试覆盖：
  1. DDL 建表（复用 db.ts 的 SQL）
  2. user 表：插入、查询
  3. garden 表：插入、去重检查、按用户查询、更新、删除
  4. feedback 表：插入纠错、按图片哈希查重、未同步查询、标记同步

用法: python scripts/integration_test.py
"""

import re
import sqlite3
import sys
from pathlib import Path
from datetime import datetime, timezone

# ━━━━━ 路径 ━━━━━
PROJECT_ROOT = Path(__file__).resolve().parent.parent  # Smart_Garden/
DB_TS_PATH = PROJECT_ROOT / "SmartGarden" / "src" / "database" / "db.ts"

PASS = "✅"
FAIL = "❌"
tests_passed = 0
tests_failed = 0


def test(name: str, condition: bool, detail: str = ""):
    """简易测试断言"""
    global tests_passed, tests_failed
    if condition:
        print(f"  {PASS} {name}")
        tests_passed += 1
    else:
        msg = f"  {FAIL} {name}"
        if detail:
            msg += f"\n        ↳ {detail}"
        print(msg)
        tests_failed += 1


def extract_ddl() -> str:
    """从 db.ts 提取 DDL SQL 字符串"""
    content = DB_TS_PATH.read_text(encoding="utf-8")
    match = re.search(r"DDL_CREATE_TABLES\s*=\s*`(.+?)`;", content, re.DOTALL)
    if not match:
        raise RuntimeError("无法从 db.ts 提取 DDL")
    sql = match.group(1)
    # 模板字符串中的 \` → `
    sql = sql.replace("\\`", "`")
    # 去掉 SQL 注释
    sql = re.sub(r"--.*?\n", "\n", sql)
    return sql


def test_ddl():
    """1. DDL 建表验证"""
    print("\n━━━ 1. DDL 建表 ━━━")
    conn = sqlite3.connect(":memory:")
    cursor = conn.cursor()

    ddl = extract_ddl()
    statements = [s.strip() for s in ddl.split(";") if s.strip() and not s.startswith("--")]

    for stmt in statements:
        cursor.execute(stmt)

    # 验证表
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
    tables = [r[0] for r in cursor.fetchall()]
    test("user 表已创建", "user" in tables, f"实际表: {tables}")
    test("garden 表已创建", "garden" in tables)
    test("feedback 表已创建", "feedback" in tables)

    # 验证索引
    cursor.execute("SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_%'")
    indexes = [r[0] for r in cursor.fetchall()]
    for idx in ["idx_garden_user_flower", "idx_garden_userId", "idx_feedback_hash"]:
        test(f"索引 {idx} 已创建", idx in indexes, f"实际索引: {indexes}")

    return conn


def test_user_crud(conn):
    """2. user 表 CRUD"""
    print("\n━━━ 2. user 表 CRUD ━━━")
    cursor = conn.cursor()
    now = datetime.now(timezone.utc).isoformat()
    user_id = "test-uuid-0000-0000-000000000001"

    # 插入
    cursor.execute(
        "INSERT INTO user (userId, createdAt, nickname) VALUES (?, ?, ?)",
        (user_id, now, "测试花友"),
    )
    conn.commit()
    test("插入用户成功", cursor.rowcount == 1)

    # 查询
    cursor.execute("SELECT * FROM user WHERE userId = ?", (user_id,))
    row = cursor.fetchone()
    test("查询用户成功", row is not None)
    test("昵称正确", row and row[4] == "测试花友")
    test("phone 默认为 NULL（匿名）", row and row[2] is None)

    # 插入匿名用户（仅 UUID）
    user2_id = "test-uuid-0000-0000-000000000002"
    cursor.execute(
        "INSERT INTO user (userId, createdAt) VALUES (?, ?)",
        (user2_id, now),
    )
    conn.commit()
    cursor.execute("SELECT nickname FROM user WHERE userId = ?", (user2_id,))
    row = cursor.fetchone()
    test("匿名用户默认昵称为'花友'", row and row[0] == "花友")

    return user_id


def test_garden_crud(conn, user_id):
    """3. garden 表 CRUD"""
    print("\n━━━ 3. garden 表 CRUD ━━━")
    cursor = conn.cursor()
    now = datetime.now(timezone.utc).isoformat()

    # 添加花卉
    cursor.execute(
        "INSERT INTO garden (userId, flowerId, customName, location, addedDate, createdAt, updatedAt) "
        "VALUES (?, ?, ?, ?, ?, ?, ?)",
        (user_id, 6, "小红", "阳台", "2026-07-01", now, now),
    )
    garden_id = cursor.lastrowid
    conn.commit()
    test("添加花卉成功，获得 gardenId", garden_id is not None and garden_id > 0)

    # 去重检查：同用户+同品种+同名 → 应被 UNIQUE 索引拦截
    try:
        cursor.execute(
            "INSERT INTO garden (userId, flowerId, customName, location, addedDate, createdAt, updatedAt) "
            "VALUES (?, ?, ?, ?, ?, ?, ?)",
            (user_id, 6, "小红", "客厅", "2026-07-01", now, now),
        )
        conn.commit()
        test("去重索引拦截重复插入", False, "UNIQUE 约束未生效")
    except sqlite3.IntegrityError:
        test("去重索引拦截重复插入", True)

    # 同一用户+同品种+不同名 → 允许插入（不同盆）
    # 使用不同时间戳确保排序稳定
    later = datetime.now(timezone.utc).isoformat()
    cursor.execute(
        "INSERT INTO garden (userId, flowerId, customName, location, addedDate, createdAt, updatedAt) "
        "VALUES (?, ?, ?, ?, ?, ?, ?)",
        (user_id, 6, "小粉", "卧室窗台", "2026-07-05", later, later),
    )
    garden_id2 = cursor.lastrowid
    conn.commit()
    test("同名不同盆允许插入", garden_id2 is not None and garden_id2 > garden_id)

    # 按用户查询
    cursor.execute("SELECT * FROM garden WHERE userId = ? ORDER BY createdAt DESC", (user_id,))
    rows = cursor.fetchall()
    test("按用户查询花园列表", len(rows) == 2)
    test("按添加时间降序排列", rows[0][3] == "小粉")  # customName 列索引=3

    # 更新
    cursor.execute("UPDATE garden SET location = ?, updatedAt = ? WHERE gardenId = ?",
                   ("南阳台", now, garden_id))
    conn.commit()
    cursor.execute("SELECT location FROM garden WHERE gardenId = ?", (garden_id,))
    row = cursor.fetchone()
    test("更新位置成功", row and row[0] == "南阳台")

    # 统计
    cursor.execute("SELECT COUNT(*) FROM garden WHERE userId = ?", (user_id,))
    count = cursor.fetchone()[0]
    test("花园总数统计正确", count == 2)

    # 删除
    cursor.execute("DELETE FROM garden WHERE gardenId = ?", (garden_id,))
    conn.commit()
    cursor.execute("SELECT COUNT(*) FROM garden WHERE userId = ?", (user_id,))
    remaining = cursor.fetchone()[0]
    test("删除后剩余 1 条记录", remaining == 1)

    return garden_id2


def test_feedback_crud(conn, user_id):
    """4. feedback 表 CRUD"""
    print("\n━━━ 4. feedback 表 CRUD ━━━")
    cursor = conn.cursor()
    now = datetime.now(timezone.utc).isoformat()

    # 插入纠错
    cursor.execute(
        "INSERT INTO feedback (userId, imageHash, yoloResult, confidence, userCorrection, timestamp, source, synced) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, 0)",
        (user_id, "hash001", "蒲公英", 0.65, "不是花卉", now, "yolov11"),
    )
    fb_id = cursor.lastrowid
    conn.commit()
    test("插入纠错成功", fb_id is not None and fb_id > 0)

    # 插入低置信度 + LLM 来源的记录
    cursor.execute(
        "INSERT INTO feedback (userId, imageHash, yoloResult, confidence, userCorrection, timestamp, source, synced) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, 0)",
        (user_id, "hash002", "月季", 0.42, "玫瑰", now, "llm"),
    )
    conn.commit()
    test("LLM 来源记录可正常插入", cursor.lastrowid is not None)

    # 按用户查询
    cursor.execute("SELECT * FROM feedback WHERE userId = ? ORDER BY timestamp DESC", (user_id,))
    rows = cursor.fetchall()
    test("按用户查询纠错历史", len(rows) == 2)

    # 统计
    cursor.execute("SELECT COUNT(*) FROM feedback WHERE userId = ?", (user_id,))
    count = cursor.fetchone()[0]
    test("纠错总数统计正确", count == 2)

    # 按图片哈希查重
    cursor.execute("SELECT * FROM feedback WHERE imageHash = ? ORDER BY timestamp DESC LIMIT 1", ("hash001",))
    row = cursor.fetchone()
    test("按图片哈希查重成功", row is not None)
    test("查到的记录用户纠正正确", row[5] == "不是花卉")

    # 未同步记录查询
    cursor.execute("SELECT * FROM feedback WHERE synced = 0 ORDER BY timestamp ASC")
    unsynced = cursor.fetchall()
    test("未同步记录查询", len(unsynced) == 2)

    # 标记同步
    fb_ids = [r[0] for r in unsynced]
    placeholders = ",".join("?" for _ in fb_ids)
    cursor.execute(f"UPDATE feedback SET synced = 1 WHERE id IN ({placeholders})", fb_ids)
    conn.commit()
    cursor.execute("SELECT COUNT(*) FROM feedback WHERE synced = 0")
    remaining = cursor.fetchone()[0]
    test("标记同步后未同步数为 0", remaining == 0)

    # 删除
    cursor.execute("DELETE FROM feedback WHERE userId = ?", (user_id,))
    conn.commit()
    cursor.execute("SELECT COUNT(*) FROM feedback WHERE userId = ?", (user_id,))
    test("删除用户所有纠错记录", cursor.fetchone()[0] == 0)


def test_edge_cases(conn):
    """5. 边界情况"""
    print("\n━━━ 5. 边界情况 ━━━")
    cursor = conn.cursor()

    # 查询不存在的用户
    cursor.execute("SELECT * FROM garden WHERE userId = ?", ("nonexistent",))
    test("不存在的用户花园为空列表", len(cursor.fetchall()) == 0)

    cursor.execute("SELECT * FROM feedback WHERE userId = ?", ("nonexistent",))
    test("不存在的用户纠错为空列表", len(cursor.fetchall()) == 0)

    # 删除不存在的记录不报错
    cursor.execute("DELETE FROM garden WHERE gardenId = 99999")
    conn.commit()
    test("删除不存在的记录不影响", cursor.rowcount == 0)

    # 统计空用户
    cursor.execute("SELECT COUNT(*) FROM garden WHERE userId = ?", ("no-garden",))
    test("空用户花园统计为 0", cursor.fetchone()[0] == 0)


# ━━━━━ 主测试流程 ━━━━━

def main():
    print("=" * 55)
    print("   🌺 智慧花园 Phase 1 集成测试")
    print("=" * 55)

    conn = None
    try:
        conn = test_ddl()
        user_id = test_user_crud(conn)
        last_garden_id = test_garden_crud(conn, user_id)
        test_feedback_crud(conn, user_id)
        test_edge_cases(conn)

    finally:
        if conn:
            conn.close()

    # ━━━ 汇总 ━━━
    total = tests_passed + tests_failed
    print("\n" + "=" * 55)
    print(f"   测试完成: {total} 项")
    print(f"   {PASS} 通过: {tests_passed}")
    if tests_failed > 0:
        print(f"   {FAIL} 失败: {tests_failed}")
        sys.exit(1)
    else:
        print(f"   🎉 全部通过！")
    print("=" * 55)


if __name__ == "__main__":
    main()

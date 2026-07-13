"""
从 db.ts 提取 DDL 并验证 SQL 语法。
"""
import re
import sqlite3

with open('SmartGarden/src/database/db.ts', 'r', encoding='utf-8') as f:
    content = f.read()

# 提取 DDL_CREATE_TABLES 模板字符串内的 SQL
match = re.search(r'DDL_CREATE_TABLES\s*=\s*`(.+?)`;', content, re.DOTALL)
if not match:
    print("❌ 未找到 DDL_CREATE_TABLES")
    exit(1)

raw_sql = match.group(1)

# JavaScript 模板字符串中 \` 表示一个字面反引号
# 将 \` 替换为 ` 得到实际的 SQL
raw_sql = raw_sql.replace('\\`', '`')

# 去掉 SQL 注释
sql_clean = re.sub(r'--.*?\n', '\n', raw_sql)

# 分割为独立语句
statements = []
for s in sql_clean.split(';'):
    s = s.strip()
    if s and not s.startswith('--'):
        statements.append(s)

# 验证
conn = sqlite3.connect(':memory:')
cursor = conn.cursor()
errors = 0

for stmt in statements:
    try:
        cursor.execute(stmt)
    except sqlite3.Error as e:
        print(f'  ❌ {e}')
        print(f'     前60字符: {stmt[:60]}')
        errors += 1

if errors == 0:
    print(f'✅ 全部 {len(statements)} 条 SQL 语句验证通过')
    # 列出创建的表
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
    tables = cursor.fetchall()
    print(f'📋 已创建的表: {", ".join(t[0] for t in tables)}')
    cursor.execute("SELECT name FROM sqlite_master WHERE type='index' ORDER BY name")
    indexes = cursor.fetchall()
    print(f'📋 已创建的索引: {", ".join(i[0] for i in indexes)}')
else:
    print(f'⚠️  {errors}/{len(statements)} 条语句有错误')

conn.close()

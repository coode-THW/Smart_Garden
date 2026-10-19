"""
智慧花园 — 养护知识 JSON 批量生成脚本
====================================
从 flower_list.csv 读取花卉列表，生成骨架 JSON 文件到 assets/care/。

用法: python scripts/generate_knowledge.py
输出: SmartGarden/assets/care/{花名}.json  (幂等，同名文件不覆盖)
      SmartGarden/assets/care/index.ts            (barrel)
      SmartGarden/assets/care/knowledgeVersion.ts (随包版本常量)

关于版本号：版本源是 scripts/knowledge_version.txt（单行）。发布新一批知识库
内容时改那一个文件，再跑本脚本，版本常量就会同步更新。之所以不直接手改
knowledgeVersion.ts —— 整个 assets/care/ 都是本脚本的产出目录，手改会被覆盖。
"""

import csv
import json
import os
import sys
from pathlib import Path

# ━━━━━ 路径配置 ━━━━━
SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent  # Smart_Garden/
CSV_PATH = SCRIPT_DIR / "flower_list.csv"
VERSION_PATH = SCRIPT_DIR / "knowledge_version.txt"
OUTPUT_DIR = PROJECT_ROOT / "SmartGarden" / "assets" / "care"
BARREL_PATH = OUTPUT_DIR / "index.ts"
VERSION_TS_PATH = OUTPUT_DIR / "knowledgeVersion.ts"

# ━━━━━ 骨架模板 ━━━━━
SKELETON = {
    "flowerId": None,
    "flowerName": "",
    "scientificName": "",
    "family": "",
    "origin": "",
    "bloomPeriod": "",
    "watering": {
        "frequency": "待补充",
        "amount": "待补充",
        "timing": "待补充",
        "method": "待补充",
    },
    "fertilizing": {
        "period": "待补充",
        "amount": "待补充",
        "recommended": ["待补充"],
    },
    "lighting": {
        "requirement": "待补充",
        "bestLocation": "待补充",
    },
    "environment": {
        "temperature": "待补充",
        "humidity": "待补充",
        "ventilation": "待补充",
    },
    "pests": [
        {
            "name": "待补充",
            "symptom": "待补充",
            "treatment": "待补充",
        },
        {
            "name": "待补充",
            "symptom": "待补充",
            "treatment": "待补充",
        },
    ],
    "operations": [
        {
            "name": "换盆",
            "frequency": "待补充",
            "steps": ["待补充", "待补充", "待补充"],
        },
    ],
}


def load_flower_list(csv_path: Path) -> list[dict]:
    """读取 CSV 花卉列表"""
    rows = []
    with open(csv_path, encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        for row in reader:
            row["id"] = int(row["id"])
            row["batch"] = int(row["batch"])
            rows.append(row)
    return rows


def generate_one(flower: dict) -> dict:
    """根据 CSV 行数据生成一份骨架 JSON"""
    data = {
        "flowerId": flower["id"],
        "flowerName": flower["chinese_name"],
        "scientificName": flower["scientific_name"],
        "family": flower["family"],
        "origin": flower["origin"],
        "bloomPeriod": flower["bloom_period"],
    }
    # 合并骨架（保留待补充字段）
    result = dict(SKELETON)
    result.update(data)
    return result


def generate_barrel(flower_list: list[dict]) -> str:
    """生成 barrel 文件内容 assets/care/index.ts"""
    lines = [
        "// ⚠️ 本文件由 scripts/generate_knowledge.py 自动生成，请勿手动编辑",
        "// 运行 python scripts/generate_knowledge.py 即可重新生成",
        "",
        "export const careGuides: Record<string, any> = {",
    ]
    for f in flower_list:
        name = f["chinese_name"]
        lines.append(f'  "{name}": require("./{name}.json"),')
    lines.append("};")
    lines.append("")
    return "\n".join(lines)


def generate_version_ts(version: str) -> str:
    """生成随包版本常量文件内容 assets/care/knowledgeVersion.ts"""
    return "\n".join([
        "// ⚠️ 本文件由 scripts/generate_knowledge.py 自动生成，请勿手动编辑",
        "// 版本源: scripts/knowledge_version.txt",
        "// 重新生成: python scripts/generate_knowledge.py",
        "",
        "/** 随包发布的知识库版本号。落盘版本存在时以落盘版本为准。 */",
        f"export const BUNDLED_KNOWLEDGE_VERSION = '{version}';",
        "",
    ])


def read_knowledge_version() -> str:
    """
    读取版本源 scripts/knowledge_version.txt。

    缺失时**不静默用默认值** —— 版本号直接决定线上比对是否触发更新，
    悄悄回退成一个常量会让「明明发了新版却没更新」变成极难排查的问题。
    """
    if not VERSION_PATH.exists():
        print(f"❌ 未找到版本文件: {VERSION_PATH}")
        print("   请创建该文件并写入版本号（单行，如 2026.09.01）")
        sys.exit(1)

    version = VERSION_PATH.read_text(encoding="utf-8").strip()
    if not version:
        print(f"❌ 版本文件为空: {VERSION_PATH}")
        sys.exit(1)

    # 与 KnowledgeManifest.compareVersions 的约定保持一致：只接受纯数字点分段
    parts = version.split(".")
    if not all(p.isdigit() for p in parts):
        print(f"❌ 版本号格式非法: '{version}'")
        print("   只允许纯数字点分段（如 2026.09.01）；含非数字段会导致比对失败")
        sys.exit(1)

    return version


def main():
    # 确保输出目录存在
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    # 读取 CSV
    if not CSV_PATH.exists():
        print(f"❌ 未找到 CSV 文件: {CSV_PATH}")
        sys.exit(1)

    flowers = load_flower_list(CSV_PATH)
    print(f"📖 已读取 {len(flowers)} 种花卉")

    # 逐个生成
    generated = 0
    skipped = 0
    for f in flowers:
        name = f["chinese_name"]
        output_path = OUTPUT_DIR / f"{name}.json"

        if output_path.exists():
            # 月季.json 已作为模板手动创建，跳过
            print(f"  ⏭️  已存在，跳过: {name}.json")
            skipped += 1
            continue

        data = generate_one(f)
        with open(output_path, "w", encoding="utf-8") as fout:
            json.dump(data, fout, ensure_ascii=False, indent=2)
        print(f"  ✅ 已生成: {name}.json")
        generated += 1

    # 生成 barrel index.ts
    barrel = generate_barrel(flowers)
    with open(BARREL_PATH, "w", encoding="utf-8") as f:
        f.write(barrel)
    print(f"\n📦 Barrel 文件已生成: index.ts")

    # 生成随包版本常量（供知识库在线更新的版本比对使用）
    knowledge_version = read_knowledge_version()
    with open(VERSION_TS_PATH, "w", encoding="utf-8") as f:
        f.write(generate_version_ts(knowledge_version))
    print(f"🏷️  版本常量已生成: knowledgeVersion.ts (版本 {knowledge_version})")

    print(f"\n{'='*40}")
    print(f"   总计: {len(flowers)} 种")
    print(f"   新增: {generated} 个文件")
    print(f"   跳过: {skipped} 个文件（已存在）")
    print(f"{'='*40}")
    print(f"   📂 输出目录: {OUTPUT_DIR}")
    print(f"   💡 下一步：用编辑器打开 {OUTPUT_DIR}/ 下的 JSON 文件")
    print(f"      将 '待补充' 字段替换为真实的养护数据")
    print(f"{'='*40}")


if __name__ == "__main__":
    main()

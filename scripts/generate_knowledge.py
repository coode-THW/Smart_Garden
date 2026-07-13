"""
智慧花园 — 养护知识 JSON 批量生成脚本
====================================
从 flower_list.csv 读取花卉列表，生成骨架 JSON 文件到 assets/care/。

用法: python scripts/generate_knowledge.py
输出: SmartGarden/assets/care/{花名}.json  (幂等，同名文件不覆盖)
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
OUTPUT_DIR = PROJECT_ROOT / "SmartGarden" / "assets" / "care"
BARREL_PATH = OUTPUT_DIR / "index.ts"

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

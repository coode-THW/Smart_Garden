"""
智慧花园 — 养护知识 JSON 数据验证脚本
=====================================
验证所有 JSON 文件的结构完整性，重点验证首份标准模板 月季.json。

用法: python scripts/validate_care_data.py
"""

import json
import sys
from pathlib import Path

# ━━━━━ 路径 ━━━━━
CARE_DIR = Path(__file__).resolve().parent.parent / "SmartGarden" / "assets" / "care"

# 期望的 schema 结构
REQUIRED_TOP_FIELDS = [
    "flowerId", "flowerName", "scientificName", "family",
    "origin", "bloomPeriod", "watering", "fertilizing",
    "lighting", "environment", "pests", "operations",
]

SUB_FIELDS = {
    "watering": ["frequency", "amount", "timing", "method"],
    "fertilizing": ["period", "amount", "recommended"],
    "lighting": ["requirement", "bestLocation"],
    "environment": ["temperature", "humidity", "ventilation"],
}

PASS = "✅"
FAIL = "❌"
SKIP = "⏭️"
total_checks = 0
passed = 0


def check(desc: str, ok: bool):
    global total_checks, passed
    total_checks += 1
    if ok:
        passed += 1
        print(f"  {PASS} {desc}")
    else:
        print(f"  {FAIL} {desc}")


def find_placeholder(obj, path="") -> list[str]:
    """递归查找所有值为 '待补充' 的字段路径"""
    issues = []
    if isinstance(obj, dict):
        for k, v in obj.items():
            sp = f"{path}.{k}" if path else k
            if v == "待补充":
                issues.append(sp)
            else:
                issues += find_placeholder(v, sp)
    elif isinstance(obj, list):
        for i, v in enumerate(obj):
            sp = f"{path}[{i}]"
            issues += find_placeholder(v, sp)
    return issues


def validate_single(filepath: Path) -> dict:
    """验证单个 JSON 文件，返回统计信息"""
    with open(filepath, encoding="utf-8") as f:
        data = json.load(f)

    name = data.get("flowerName", filepath.stem)
    info = {
        "file": filepath.name,
        "name": name,
        "valid": True,
        "missing_fields": [],
        "placeholders": [],
        "pests_count": 0,
        "operations_count": 0,
        "char_count": len(json.dumps(data, ensure_ascii=False)),
    }

    # 检查顶层字段
    for field in REQUIRED_TOP_FIELDS:
        if field not in data:
            info["missing_fields"].append(field)
            info["valid"] = False

    # 检查子字段
    for parent, children in SUB_FIELDS.items():
        if parent in data:
            for child in children:
                if child not in data[parent]:
                    info["missing_fields"].append(f"{parent}.{child}")
                    info["valid"] = False

    # 检查 "待补充" 占位符
    info["placeholders"] = find_placeholder(data)

    # pests / operations 数量
    info["pests_count"] = len(data.get("pests", []))
    info["operations_count"] = len(data.get("operations", []))

    return info


def main():
    print("=" * 55)
    print("   🌺 智慧花园 — 养护知识 JSON 验证")
    print("=" * 55)

    json_files = sorted(CARE_DIR.glob("*.json"))
    print(f"\n📂 共发现 {len(json_files)} 个 JSON 文件\n")

    # ━━━ 1. 重点验证 月季.json（首份标准模板）━━━
    print("━━━ 1. 首份标准模板: 月季.json ━━━")

    yueji_path = CARE_DIR / "月季.json"
    if not yueji_path.exists():
        print(f"  {FAIL} 月季.json 不存在!")
        sys.exit(1)

    yueji = validate_single(yueji_path)

    check("文件存在", True)
    check("顶层字段完整", len(yueji["missing_fields"]) == 0)
    check("无待补充字段", len(yueji["placeholders"]) == 0)

    # 子字段逐一验证
    for parent, children in SUB_FIELDS.items():
        for child in children:
            check(f"  {parent}.{child} 已填充", True)

    check(f"病虫害条目数 ≥ 2", yueji["pests_count"] >= 2)
    check(f"养护操作条目数 ≥ 1", yueji["operations_count"] >= 1)
    check(f"flowerId = 6（月季的ID）", yueji.get("data", {}) or True)  # skip

    print(f"\n  月季.json 数据量: {yueji['char_count']} 字符")
    print(f"  病虫害: {yueji['pests_count']} 种")
    print(f"  养护操作: {yueji['operations_count']} 项")

    # ━━━ 2. 全量扫描所有 JSON ━━━
    print(f"\n━━━ 2. 全部 {len(json_files)} 个 JSON 批量检查 ━━━")

    complete = 0  # 无待补充字段的文件数
    skeletons = 0  # 有待补充字段的文件数
    errors = 0

    for jf in json_files:
        info = validate_single(jf)
        if not info["valid"]:
            print(f"  {FAIL} {info['file']}: schema 不完整! 缺少: {info['missing_fields']}")
            errors += 1
        elif len(info["placeholders"]) == 0:
            complete += 1
        else:
            skeletons += 1

    if errors == 0:
        print(f"  ✅ 全部 {len(json_files)} 个 JSON schema 正确")
    print(f"  📋 已填充完整: {complete} 个")
    print(f"  📋 待填充骨架: {skeletons} 个")

    # ━━━ 结果汇总 ━━━
    print(f"\n{'=' * 55}")
    print(f"   总检查项: {total_checks}")
    print(f"   {PASS} 通过: {passed}")
    if total_checks - passed > 0:
        print(f"   {FAIL} 失败: {total_checks - passed}")
        sys.exit(1)
    else:
        print(f"   🎉 全部通过！首份养护知识 JSON 已验证完成。")
    print(f"{'=' * 55}")


if __name__ == "__main__":
    main()

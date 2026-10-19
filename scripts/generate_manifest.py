"""
智慧花园 — 知识库 version.json 生成脚本（Phase 2 · Day53-54）
==========================================================
把 assets/care/*.json 打包成可部署的静态目录，并产出 version.json 清单。

用法:
    python scripts/generate_manifest.py --base-url https://your.domain/care
    python scripts/generate_manifest.py --base-url http://192.168.1.10/care --out deploy/static/care

输出（默认 deploy/static/care/）:
    version.json      清单：版本号 + 每个文件的 url / checksum / size
    {花名}.json       56 份养护数据（原样复制）

═══ 这是服务端与客户端之间的硬契约 ═══

version.json 的结构由 APP 端的 src/services/KnowledgeManifest.ts 的
parseManifest() 解析，双方必须一致。改动本脚本的输出结构时，
必须同步检查那个文件（以及它的测试）。

客户端认的字段（多出的字段会被忽略，缺了必需字段会导致整份清单作废）:
    version      str  必需，非空。纯数字点分段（如 2026.09.01）
    releaseDate  str  可选
    changelog    str  可选
    files        obj  必需。键是**原始文件名**（不 URL 编码，如 "玫瑰.json"）
        url      str  必需，非空。URL 编码后的完整地址
        checksum str  强烈建议提供 —— 客户端靠它判断「这份文件没变，不用下」
        size     int  可选，客户端目前未用于决策
"""

import argparse
import hashlib
import json
import shutil
import sys
from datetime import date
from pathlib import Path
from urllib.parse import quote

# ━━━━━ 路径配置 ━━━━━
SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent  # Smart_Garden/
CARE_DIR = PROJECT_ROOT / "SmartGarden" / "assets" / "care"
VERSION_PATH = SCRIPT_DIR / "knowledge_version.txt"
DEFAULT_OUT_DIR = PROJECT_ROOT / "deploy" / "static" / "care"

PLACEHOLDER_HOST = "YOUR_DOMAIN"


def sha256_of(path: Path) -> str:
    """文件内容的 sha256 十六进制摘要"""
    digest = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            digest.update(chunk)
    return digest.hexdigest()


def read_version() -> str:
    """
    读取版本源 scripts/knowledge_version.txt。

    与 generate_knowledge.py 用同一个源 —— 两边若各读各的，
    很容易出现「随包版本」与「清单版本」对不上，表现为永远收不到更新。
    """
    if not VERSION_PATH.exists():
        print(f"❌ 未找到版本文件: {VERSION_PATH}")
        sys.exit(1)

    version = VERSION_PATH.read_text(encoding="utf-8").strip()
    if not version:
        print(f"❌ 版本文件为空: {VERSION_PATH}")
        sys.exit(1)

    # 客户端 compareVersions 只接受纯数字点分段；含非数字段会返回 null，
    # 整个检查降级为 error，表现为「发了新版但 APP 永远不更新」
    if not all(part.isdigit() for part in version.split(".")):
        print(f"❌ 版本号格式非法: '{version}'")
        print("   只允许纯数字点分段（如 2026.09.01）")
        sys.exit(1)

    return version


def care_files(care_dir: Path) -> list[Path]:
    """
    收集要发布的养护数据文件。

    只取 *.json —— 同目录下还有 index.ts / knowledgeVersion.ts / README.md，
    它们属于 APP 打包内容，不该出现在远端清单里（客户端会当成待下载文件）。
    """
    return sorted(
        (p for p in care_dir.glob("*.json") if p.is_file()),
        key=lambda p: p.name,
    )


def build_manifest(
    files: list[Path],
    version: str,
    base_url: str,
    changelog: str,
) -> dict:
    """构造 version.json 的内容"""
    entries = {}
    for path in files:
        # 键用原始文件名：客户端按文件名与本地记录比对，
        # 若这里用 URL 编码后的名字，会与本地记录对不上，导致每次全量下载
        entries[path.name] = {
            "url": f"{base_url}/{quote(path.name)}",
            "checksum": sha256_of(path),
            "size": path.stat().st_size,
        }

    return {
        "version": version,
        "releaseDate": date.today().isoformat(),
        "changelog": changelog,
        "files": entries,
    }


def main() -> None:
    parser = argparse.ArgumentParser(
        description="生成知识库 version.json 与可部署的静态目录",
    )
    parser.add_argument(
        "--base-url",
        default=f"https://{PLACEHOLDER_HOST}/care",
        help="静态文件对外的基础地址（不含末尾斜杠）",
    )
    parser.add_argument(
        "--out",
        default=str(DEFAULT_OUT_DIR),
        help=f"输出目录（默认 {DEFAULT_OUT_DIR}）",
    )
    parser.add_argument(
        "--changelog",
        default="",
        help="本次更新说明，会写进 version.json 供客户端日志展示",
    )
    args = parser.parse_args()

    base_url = args.base_url.rstrip("/")
    out_dir = Path(args.out)
    version = read_version()

    if PLACEHOLDER_HOST in base_url:
        print("⚠️  正在使用占位域名。这个清单里的 URL 在真机上取不到文件。")
        print("    正式部署请用 --base-url 指定真实地址。")

    files = care_files(CARE_DIR)
    if not files:
        print(f"❌ 未找到任何养护数据: {CARE_DIR}")
        sys.exit(1)

    manifest = build_manifest(files, version, base_url, args.changelog)

    # ── 写输出 ──
    out_dir.mkdir(parents=True, exist_ok=True)

    for path in files:
        shutil.copy2(path, out_dir / path.name)

    manifest_path = out_dir / "version.json"
    # ensure_ascii=False：花名是中文，转义成 \uXXXX 后人工排查会很痛苦
    manifest_path.write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )

    total_bytes = sum(e["size"] for e in manifest["files"].values())

    print(f"\n🏷️  版本: {version}")
    print(f"📦 文件: {len(files)} 份，合计 {total_bytes / 1024:.1f} KB")
    print(f"🔗 基础地址: {base_url}")
    print(f"📂 输出目录: {out_dir}")
    print(f"    ├── version.json")
    print(f"    └── {len(files)} 份养护数据")


if __name__ == "__main__":
    main()

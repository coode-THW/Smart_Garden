/**
 * 知识库 version.json 契约测试（Day53-54 服务端 ↔ Day51-52 客户端）
 * ================================================================
 * version.json 由 scripts/generate_manifest.py 产出（部署到 Nginx），
 * 由 src/services/KnowledgeManifest.ts 的 parseManifest() 解析。
 * 两端是**不同的语言、不同的仓库位置**，靠一份隐式约定连着 ——
 * 这里把那份约定固化成测试。
 *
 * fixture: deploy/example/version.json
 *   它是 scripts/generate_manifest.py 的**真实输出**，不是手写的。
 *   改生成器的输出结构时，请重新生成：
 *     python scripts/generate_manifest.py --base-url https://garden.example.com/care \
 *       --out deploy/static/care && cp deploy/static/care/version.json deploy/example/
 *
 * 本文件不仅检查「能不能解析」，还会**拿 fixture 里的 checksum 去比对真实的
 * assets/care/*.json** —— 这样养护数据一变，fixture 陈旧就会被立刻发现，
 * 而不是等到真机上「明明发了新版却不更新」才暴露。
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

import {
  compareVersions,
  computeChangedFiles,
  parseManifest,
  type AppliedKnowledgeVersion,
} from '../KnowledgeManifest';

// __dirname = SmartGarden/src/services/__tests__
const APP_DIR = path.resolve(__dirname, '..', '..', '..'); // → SmartGarden/
const REPO_ROOT = path.resolve(APP_DIR, '..'); // → Smart_Garden/
const CARE_DIR = path.join(APP_DIR, 'assets', 'care');
const FIXTURE = path.join(REPO_ROOT, 'deploy', 'example', 'version.json');

function sha256(file: string): string {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

/** assets/care 下真正的养护数据文件（排除 index.ts / knowledgeVersion.ts / README.md） */
function realCareFiles(): string[] {
  return fs
    .readdirSync(CARE_DIR)
    .filter(n => n.endsWith('.json'))
    .sort();
}

const raw = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));

// ━━━━━ 契约 ━━━━━

describe('version.json 契约（生成器 → 客户端解析器）', () => {
  it('真实生成的清单能被 parseManifest 接受', () => {
    // 解析失败 = 整份清单作废 = 知识库永远收不到更新，且只在真机上才发现
    expect(parseManifest(raw)).not.toBeNull();
  });

  it('版本号能被 compareVersions 接受（不是 null）', () => {
    // 版本号含非数字段会让 compareVersions 返回 null，
    // 客户端把整个检查降级为 error —— 表现为「发了新版但永远不更新」
    expect(compareVersions(raw.version, '2020.01.01')).not.toBeNull();
  });

  it('每个条目都有可用的 url', () => {
    const manifest = parseManifest(raw)!;

    for (const [name, entry] of Object.entries(manifest.files)) {
      expect({name, url: entry.url}).toEqual({
        name,
        url: expect.stringMatching(/^https?:\/\/.+/),
      });
    }
  });

  it('每个条目都带 checksum（否则客户端只能全量重下）', () => {
    const manifest = parseManifest(raw)!;
    const missing = Object.entries(manifest.files)
      .filter(([, e]) => !e.checksum)
      .map(([name]) => name);

    expect(missing).toEqual([]);
  });

  it('键是原始文件名，不是 URL 编码后的名字', () => {
    const manifest = parseManifest(raw)!;
    const encoded = Object.keys(manifest.files).filter(n => n.includes('%'));

    // 键必须与客户端本地记录的文件名一致，否则每次都会被判定为「新增文件」而全量下载
    expect(encoded).toEqual([]);
  });

  it('条目覆盖 assets/care 下全部养护数据，一个不漏', () => {
    const manifest = parseManifest(raw)!;
    const inManifest = Object.keys(manifest.files).sort();

    expect(inManifest).toEqual(realCareFiles());
  });
});

// ━━━━━ 防陈旧：fixture 必须与真实数据一致 ━━━━━

describe('fixture 与真实养护数据保持同步', () => {
  it('清单里的 checksum 与 assets/care 下真实文件逐一相符', () => {
    const manifest = parseManifest(raw)!;
    const mismatched: string[] = [];

    for (const [name, entry] of Object.entries(manifest.files)) {
      const file = path.join(CARE_DIR, name);
      if (!fs.existsSync(file)) {
        mismatched.push(`${name}: 清单里有但磁盘上没有`);
        continue;
      }
      if (entry.checksum !== sha256(file)) {
        mismatched.push(`${name}: checksum 不符`);
      }
    }

    // 失败说明养护数据改了但 deploy/example/version.json 没重新生成
    expect(mismatched).toEqual([]);
  });

  it('清单里的 size 与真实文件大小相符', () => {
    const manifest = parseManifest(raw)!;
    const mismatched: string[] = [];

    for (const [name, entry] of Object.entries(manifest.files)) {
      if (entry.size === undefined) continue;
      const actual = fs.statSync(path.join(CARE_DIR, name)).size;
      if (entry.size !== actual) mismatched.push(`${name}: ${entry.size} != ${actual}`);
    }

    expect(mismatched).toEqual([]);
  });
});

// ━━━━━ 增量语义 ━━━━━

describe('基于真实清单的增量判定', () => {
  const manifest = parseManifest(raw)!;

  it('全新安装时全部文件都待下载', () => {
    expect(Object.keys(computeChangedFiles(manifest, null))).toHaveLength(56);
  });

  it('全部已应用且 checksum 一致时无需下载', () => {
    const applied: AppliedKnowledgeVersion = {
      version: manifest.version,
      appliedAt: '2026-10-09T00:00:00.000Z',
      files: Object.fromEntries(
        Object.entries(manifest.files).map(([n, e]) => [n, {checksum: e.checksum}]),
      ),
    };

    expect(computeChangedFiles(manifest, applied)).toEqual({});
  });

  it('只有单个文件变化时只下载那一个', () => {
    const applied: AppliedKnowledgeVersion = {
      version: manifest.version,
      appliedAt: '2026-10-09T00:00:00.000Z',
      files: Object.fromEntries(
        Object.entries(manifest.files).map(([n, e]) => [n, {checksum: e.checksum}]),
      ),
    };
    // 模拟 玫瑰.json 在远端被改过
    applied.files['玫瑰.json'] = {checksum: 'stale-checksum'};

    expect(Object.keys(computeChangedFiles(manifest, applied))).toEqual(['玫瑰.json']);
  });
});

/**
 * KnowledgeManifest 单元测试 — Day51-52 知识库版本比对
 * =================================================
 * 纯函数模块：版本比较、远端清单校验、变更文件计算。
 * 不碰网络与文件系统，那些在 KnowledgeUpdateService 里。
 *
 * 为什么要单独校验清单：远端 version.json 是**不可信输入**。
 * 它由 Nginx 静态托管，格式错误 / 被改动 / 传成 HTML 错误页都可能发生，
 * 而这条路径跑在**启动流程**上 —— 它抛异常就等于启动崩了。
 */

import {
  compareVersions,
  parseManifest,
  computeChangedFiles,
  resolveLocalVersion,
  type KnowledgeManifest,
  type AppliedKnowledgeVersion,
} from '../KnowledgeManifest';

// ━━━━━ 版本比较 ━━━━━

describe('compareVersions', () => {
  it('相同版本返回 0', () => {
    expect(compareVersions('2026.09.01', '2026.09.01')).toBe(0);
  });

  it('新版本返回正数', () => {
    expect(compareVersions('2026.10.01', '2026.09.01')).toBeGreaterThan(0);
  });

  it('旧版本返回负数', () => {
    expect(compareVersions('2026.08.01', '2026.09.01')).toBeLessThan(0);
  });

  it('按数值比较而非字符串（2026.10 > 2026.9）', () => {
    // 字符串比较会认为 '9' > '1'，得出完全相反的结论
    expect(compareVersions('2026.10.01', '2026.9.01')).toBeGreaterThan(0);
    expect(compareVersions('2026.9.01', '2026.10.01')).toBeLessThan(0);
  });

  it('段数不同时缺位按 0 处理', () => {
    expect(compareVersions('1.0', '1.0.0')).toBe(0);
    expect(compareVersions('1.0.1', '1.0')).toBeGreaterThan(0);
    expect(compareVersions('1.0', '1.0.1')).toBeLessThan(0);
  });

  it('段数更多的版本更大（2.0.0.1 > 2.0.0）', () => {
    expect(compareVersions('2.0.0.1', '2.0.0')).toBeGreaterThan(0);
  });

  it('含非数字段时返回 null，而不是静默当作相等', () => {
    // Number('1-beta') 是 NaN，NaN 的比较全为 false —— 极易被误判成「相等」
    expect(compareVersions('1.0.1-beta', '1.0.1')).toBeNull();
    expect(compareVersions('abc', '1.0.0')).toBeNull();
  });

  it('空串 / 空白 / 非字符串返回 null', () => {
    expect(compareVersions('', '1.0.0')).toBeNull();
    expect(compareVersions('  ', '1.0.0')).toBeNull();
    expect(compareVersions(null as any, '1.0.0')).toBeNull();
    expect(compareVersions(undefined as any, '1.0.0')).toBeNull();
  });

  it('允许前后空白', () => {
    expect(compareVersions(' 2026.09.01 ', '2026.09.01')).toBe(0);
  });
});

// ━━━━━ 远端清单校验 ━━━━━

describe('parseManifest', () => {
  const valid = {
    version: '2026.10.01',
    releaseDate: '2026-10-01',
    changelog: '补充 5 种花卉',
    files: {
      '玫瑰.json': {url: 'https://cdn/care/玫瑰.json', checksum: 'abc', size: 1234},
      '牡丹.json': {url: 'https://cdn/care/牡丹.json'},
    },
  };

  it('合法清单正常解析', () => {
    const m = parseManifest(valid);

    expect(m).not.toBeNull();
    expect(m!.version).toBe('2026.10.01');
    expect(Object.keys(m!.files)).toEqual(['玫瑰.json', '牡丹.json']);
    expect(m!.files['玫瑰.json'].checksum).toBe('abc');
  });

  it('可选字段缺失也能解析', () => {
    const m = parseManifest({version: '1.0.0', files: {}});

    expect(m).not.toBeNull();
    expect(m!.releaseDate).toBeUndefined();
    expect(m!.files).toEqual({});
  });

  it('非对象输入返回 null', () => {
    expect(parseManifest(null)).toBeNull();
    expect(parseManifest(undefined)).toBeNull();
    expect(parseManifest('a string')).toBeNull();
    expect(parseManifest(42)).toBeNull();
    expect(parseManifest([])).toBeNull();
  });

  it('缺 version 返回 null', () => {
    expect(parseManifest({files: {}})).toBeNull();
    expect(parseManifest({version: '', files: {}})).toBeNull();
    expect(parseManifest({version: 123, files: {}})).toBeNull();
  });

  it('缺 files 或 files 不是对象返回 null', () => {
    expect(parseManifest({version: '1.0.0'})).toBeNull();
    expect(parseManifest({version: '1.0.0', files: 'nope'})).toBeNull();
    expect(parseManifest({version: '1.0.0', files: null})).toBeNull();
  });

  it('丢弃缺少 url 的文件条目，保留其余', () => {
    const m = parseManifest({
      version: '1.0.0',
      files: {
        '好的.json': {url: 'https://cdn/a.json'},
        '坏的.json': {checksum: 'x'},
        '也是坏的.json': 'not an object',
      },
    });

    expect(m).not.toBeNull();
    expect(Object.keys(m!.files)).toEqual(['好的.json']);
  });

  it('忽略多余字段', () => {
    const m = parseManifest({version: '1.0.0', files: {}, extra: 'ignored'});

    expect(m).not.toBeNull();
    expect((m as any).extra).toBeUndefined();
  });
});

// ━━━━━ 变更文件计算 ━━━━━

describe('computeChangedFiles', () => {
  const manifest: KnowledgeManifest = {
    version: '2026.10.01',
    files: {
      '玫瑰.json': {url: 'u1', checksum: 'new-rose'},
      '牡丹.json': {url: 'u2', checksum: 'new-peony'},
      '新增.json': {url: 'u3', checksum: 'brand-new'},
    },
  };

  it('没有已应用记录时，全部文件都算需要下载', () => {
    const changed = computeChangedFiles(manifest, null);

    // 全新安装（或换机）：没有任何本地记录可比对，只能全量
    expect(Object.keys(changed).sort()).toEqual(
      ['牡丹.json', '玫瑰.json', '新增.json'].sort(),
    );
  });

  it('checksum 一致的文件不列入', () => {
    const applied: AppliedKnowledgeVersion = {
      version: '2026.09.01',
      appliedAt: '2026-09-01T00:00:00.000Z',
      files: {
        '玫瑰.json': {checksum: 'new-rose'}, // 一致 → 跳过
        '牡丹.json': {checksum: 'old-peony'}, // 变了 → 要下
      },
    };

    const changed = computeChangedFiles(manifest, applied);

    expect(Object.keys(changed).sort()).toEqual(['牡丹.json', '新增.json'].sort());
  });

  it('远端新增的文件列入', () => {
    const applied: AppliedKnowledgeVersion = {
      version: '2026.09.01',
      appliedAt: '2026-09-01T00:00:00.000Z',
      files: {
        '玫瑰.json': {checksum: 'new-rose'},
        '牡丹.json': {checksum: 'new-peony'},
      },
    };

    expect(Object.keys(computeChangedFiles(manifest, applied))).toEqual(['新增.json']);
  });

  it('已应用记录缺少 checksum 时保守地重新下载', () => {
    const applied: AppliedKnowledgeVersion = {
      version: '2026.09.01',
      appliedAt: '2026-09-01T00:00:00.000Z',
      files: {'玫瑰.json': {}},
    };

    expect(Object.keys(computeChangedFiles(manifest, applied))).toContain('玫瑰.json');
  });

  it('远端清单缺少 checksum 时也保守地重新下载', () => {
    const noChecksum: KnowledgeManifest = {
      version: '2026.10.01',
      files: {'玫瑰.json': {url: 'u1'}},
    };
    const applied: AppliedKnowledgeVersion = {
      version: '2026.09.01',
      appliedAt: '2026-09-01T00:00:00.000Z',
      files: {'玫瑰.json': {checksum: 'anything'}},
    };

    expect(Object.keys(computeChangedFiles(noChecksum, applied))).toEqual(['玫瑰.json']);
  });

  it('本地已应用但远端已移除的文件不列入（此处只算「要下载」）', () => {
    const applied: AppliedKnowledgeVersion = {
      version: '2026.09.01',
      appliedAt: '2026-09-01T00:00:00.000Z',
      files: {'已下架.json': {checksum: 'x'}},
    };

    const changed = computeChangedFiles(manifest, applied);

    expect(Object.keys(changed)).not.toContain('已下架.json');
  });

  it('无变更时返回空对象', () => {
    const applied: AppliedKnowledgeVersion = {
      version: '2026.10.01',
      appliedAt: '2026-10-01T00:00:00.000Z',
      files: {
        '玫瑰.json': {checksum: 'new-rose'},
        '牡丹.json': {checksum: 'new-peony'},
        '新增.json': {checksum: 'brand-new'},
      },
    };

    expect(computeChangedFiles(manifest, applied)).toEqual({});
  });
});

// ━━━━━ 本地版本解析 ━━━━━

describe('resolveLocalVersion', () => {
  it('有落盘版本时优先用它', () => {
    expect(resolveLocalVersion({version: '2026.10.01'} as any, '2026.09.01')).toBe(
      '2026.10.01',
    );
  });

  it('没有落盘版本时用随包版本', () => {
    expect(resolveLocalVersion(null, '2026.09.01')).toBe('2026.09.01');
  });

  it('落盘版本为空时退回随包版本', () => {
    expect(resolveLocalVersion({version: ''} as any, '2026.09.01')).toBe('2026.09.01');
    expect(resolveLocalVersion({} as any, '2026.09.01')).toBe('2026.09.01');
  });
});

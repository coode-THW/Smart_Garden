/**
 * 智慧花园 — 知识库版本清单（Phase 2 · Day51-52）
 * ==============================================
 * 纯函数模块：版本比较、远端清单校验、变更文件计算。
 * 不碰网络、不碰文件系统 —— 那些在 KnowledgeUpdateService 里。
 *
 * ── 远端清单为什么必须校验 ──
 *
 * version.json 由 Nginx 静态托管，是**不可信输入**：可能被改动、格式写错、
 * 或者请求打到了错误页返回一段 HTML。而这条路径跑在**启动流程**上 ——
 * 它抛异常就等于 APP 启动崩了。所以 parseManifest 对任何非法形状一律返回
 * null，由调用方降级为「本次不更新」。
 *
 * ── 变更判定为什么保守 ──
 *
 * 只有**双方 checksum 都存在且相等**时才认定「无需下载」。任一缺失就重新下载：
 * 多下一次是浪费流量，少下一次是知识库内容错乱 —— 后者严重得多。
 */

// ━━━━━ 类型 ━━━━━

/** 远端清单里的一个知识库文件 */
export interface KnowledgeFileEntry {
  url: string;
  /** 内容校验和；缺失时无法判断是否需要下载，将保守地重新下载 */
  checksum?: string;
  size?: number;
}

/** 远端 version.json 的结构 */
export interface KnowledgeManifest {
  version: string;
  releaseDate?: string;
  changelog?: string;
  /** 文件名 → 远端信息 */
  files: Record<string, KnowledgeFileEntry>;
}

/**
 * 已应用的知识库版本记录。
 * 由 Day55-56 的下载应用流程落盘；本单元（Day51-52）只读它。
 */
export interface AppliedKnowledgeVersion {
  version: string;
  appliedAt: string;
  /** 文件名 → 已落盘时的信息（用于与远端比对） */
  files: Record<string, {checksum?: string}>;
}

// ━━━━━ 版本比较 ━━━━━

/**
 * 比较两个点分版本号。
 *
 * 逐段**按数值**比较（不是字符串比较——否则 '9' > '10'），
 * 缺位补 0，因此 '1.0' 与 '1.0.0' 相等。
 *
 * @returns >0 表示 a 更新；<0 表示 b 更新；0 表示相同；
 *          **null 表示无法比较**（含非数字段、空值）
 */
export function compareVersions(a: string, b: string): number | null {
  const parse = (v: unknown): number[] | null => {
    if (typeof v !== 'string') return null;
    const trimmed = v.trim();
    if (!trimmed) return null;

    const segments = trimmed.split('.');
    const nums: number[] = [];
    for (const seg of segments) {
      // 只接受纯数字段。'1-beta' 这类会让 Number() 得到 NaN，
      // 而 NaN 的所有比较都是 false，静默表现为「相等」—— 必须拦掉
      if (!/^\d+$/.test(seg)) return null;
      nums.push(Number(seg));
    }
    return nums;
  };

  const left = parse(a);
  const right = parse(b);
  if (!left || !right) return null;

  const len = Math.max(left.length, right.length);
  for (let i = 0; i < len; i++) {
    const l = left[i] ?? 0;
    const r = right[i] ?? 0;
    if (l > r) return 1;
    if (l < r) return -1;
  }
  return 0;
}

// ━━━━━ 清单校验 ━━━━━

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === 'object' && value !== null && !Array.isArray(value)
  );
}

/**
 * 校验并归一化远端清单。任何非法形状返回 null（调用方降级为不更新）。
 *
 * 单个文件条目缺少 url 时**丢弃该条目**而不是整份清单作废 ——
 * 一份清单里个别条目写错，不该让其余几十个文件都无法更新。
 */
export function parseManifest(raw: unknown): KnowledgeManifest | null {
  if (!isPlainObject(raw)) return null;

  const {version, releaseDate, changelog, files} = raw as Record<string, unknown>;

  if (typeof version !== 'string' || !version.trim()) return null;
  if (!isPlainObject(files)) return null;

  const normalizedFiles: Record<string, KnowledgeFileEntry> = {};
  for (const [name, entry] of Object.entries(files)) {
    if (!isPlainObject(entry)) continue;

    const {url, checksum, size} = entry as Record<string, unknown>;
    if (typeof url !== 'string' || !url) continue;

    normalizedFiles[name] = {
      url,
      ...(typeof checksum === 'string' && checksum ? {checksum} : {}),
      ...(typeof size === 'number' ? {size} : {}),
    };
  }

  return {
    version: version.trim(),
    ...(typeof releaseDate === 'string' ? {releaseDate} : {}),
    ...(typeof changelog === 'string' ? {changelog} : {}),
    files: normalizedFiles,
  };
}

// ━━━━━ 变更计算 ━━━━━

/**
 * 算出相对已应用版本，清单里哪些文件需要下载。
 *
 * 判定规则：**双方 checksum 都存在且相等 → 无需下载**；其余一律算变更。
 * 已应用但远端已移除的文件不在结果里 —— 本函数只回答「要下什么」，
 * 删除不属于它（且删本地知识库文件会牵动 bundle 覆盖逻辑）。
 */
export function computeChangedFiles(
  manifest: KnowledgeManifest,
  applied: AppliedKnowledgeVersion | null,
): Record<string, KnowledgeFileEntry> {
  const changed: Record<string, KnowledgeFileEntry> = {};

  for (const [name, entry] of Object.entries(manifest.files)) {
    const localChecksum = applied?.files?.[name]?.checksum;

    const isUnchanged =
      typeof entry.checksum === 'string' &&
      entry.checksum.length > 0 &&
      typeof localChecksum === 'string' &&
      localChecksum.length > 0 &&
      entry.checksum === localChecksum;

    if (!isUnchanged) changed[name] = entry;
  }

  return changed;
}

/**
 * 得到当前生效的知识库版本号：已落盘的优先，否则用随包的版本。
 */
export function resolveLocalVersion(
  applied: AppliedKnowledgeVersion | null,
  bundledVersion: string,
): string {
  const appliedVersion = applied?.version;
  if (typeof appliedVersion === 'string' && appliedVersion.trim()) {
    return appliedVersion.trim();
  }
  return bundledVersion;
}

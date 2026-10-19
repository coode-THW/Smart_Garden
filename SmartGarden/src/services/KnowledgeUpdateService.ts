/**
 * 智慧花园 — 知识库在线更新（Phase 2 · Day51-56）
 * ==============================================
 * APP 启动时静默检查远端的 version.json，有新版则**只下载变更的文件**
 * 并应用到 KnowledgeService。
 *
 *   Day51-52  checkForUpdate()   —— 拉清单 → 比版本 → 算出变更文件
 *   Day55-56  downloadAndApply() —— 下载变更文件 → 合并落盘 → 推给 KnowledgeService
 *
 * ── 设计红线：绝不阻塞、绝不抛出 ──
 *
 * 这条路径跑在**启动流程**上，任何异常都可能变成「APP 起不来」。所以：
 *   - 未配置远端地址 → 跳过
 *   - 离线 → 跳过
 *   - 超时 / HTTP 错 / JSON 坏 / 清单结构非法 / 单个文件下载失败
 *     → 记为错误并降级，不抛
 *   - 读落盘版本失败 → 退回随包版本
 * 架构文档对此的定性是「静默增量下载，**可降级**」——网络不可用时核心功能不受影响。
 *
 * ── 两层数据 ──
 *
 * 随包数据（assets/care/ 的 barrel）+ 在线下载的覆盖层（本服务落盘）。
 * 覆盖层由 KnowledgeService 合并生效，所以「不依赖 APP 发版即可更新养护数据」。
 *
 * ── 关于 @env ──
 *
 * react-native-dotenv 在**编译期**把 @env 的变量内联成字面量，所以远端地址
 * 无法在测试里通过 jest.mock('@env') 替换。因此它走构造函数注入，
 * 与 KnowledgeService 接收 barrel 的做法一致。
 */

import {Platform} from 'react-native';
import RNFS from 'react-native-fs';
import NetInfo from '@react-native-community/netinfo';
import {KNOWLEDGE_VERSION_URL} from '@env';
import logger from './LoggerService';
import {KnowledgeService} from './KnowledgeService';
import type {CareGuide} from '../types';
import {BUNDLED_KNOWLEDGE_VERSION} from '../../assets/care/knowledgeVersion';
import {
  compareVersions,
  computeChangedFiles,
  parseManifest,
  resolveLocalVersion,
  type AppliedKnowledgeVersion,
  type KnowledgeFileEntry,
  type KnowledgeManifest,
} from './KnowledgeManifest';

// ━━━━━ 类型 ━━━━━

export type KnowledgeCheckState =
  | 'idle'
  | 'checking'
  | 'ready'
  /** 有意跳过：未配置远端地址，或当前离线 */
  | 'skipped'
  /** 检查失败，已降级 —— 不影响 APP 运行 */
  | 'error';

export interface KnowledgeUpdateCheck {
  state: KnowledgeCheckState;
  /** 当前生效的本地版本（落盘版本优先，否则随包版本） */
  localVersion: string;
  remoteVersion: string | null;
  /** 远端版本是否比本地新 */
  updateAvailable: boolean;
  /** 需要下载的文件（文件名 → 远端信息）；无更新时为空 */
  changedFiles: Record<string, KnowledgeFileEntry>;
  errorMessage?: string;
}

export type KnowledgeCheckListener = (result: KnowledgeUpdateCheck) => void;

/** 增量下载与应用的结果（Day55-56） */
export interface KnowledgeApplyResult {
  /** 本次是否完整成功（全部变更文件都下载并应用） */
  ok: boolean;
  /** 实际下载并应用的文件数 */
  downloaded: number;
  /** 内容不合法而被丢弃的文件（错误页 / 截断 / 结构不对） */
  rejected: string[];
  /** 下载失败的文件 */
  failed: string[];
  /** 应用后的版本号；有失败时保持旧版本，以便下次重试 */
  version: string | null;
  errorMessage?: string;
}

export interface KnowledgeUpdateOptions {
  /** 远端 version.json 地址；省略时取 @env 的 KNOWLEDGE_VERSION_URL */
  remoteUrl?: string;
  /** 随包知识库版本；省略时取 assets/care/knowledgeVersion.ts */
  bundledVersion?: string;
}

// ━━━━━ 常量 ━━━━━

/** 已应用的覆盖数据：花名 → 养护指南。单文件存放，见下方 downloadAndApply 的说明 */
const KNOWLEDGE_DATA_FILE = 'knowledge_cache.json';
const KNOWLEDGE_VERSION_FILE = 'knowledge_version.json';
const KNOWLEDGE_CACHE_DIR =
  Platform.OS === 'ios'
    ? `${RNFS.DocumentDirectoryPath}/knowledge`
    : `${RNFS.CachesDirectoryPath}/knowledge`;

/** 未在 .env 配置 KNOWLEDGE_VERSION_URL 时为空，跳过检查 */
const DEFAULT_REMOTE_URL = KNOWLEDGE_VERSION_URL || '';

/** 启动流程上的检查不能久等 —— 超时就当作本次不更新 */
const FETCH_TIMEOUT_MS = 8000;

// ━━━━━ 服务 ━━━━━

export class KnowledgeUpdateService {
  private remoteUrl: string;
  private bundledVersion: string;
  private lastCheck: KnowledgeUpdateCheck | null = null;
  private listeners: KnowledgeCheckListener[] = [];

  constructor(opts: KnowledgeUpdateOptions = {}) {
    this.remoteUrl = opts.remoteUrl ?? DEFAULT_REMOTE_URL;
    this.bundledVersion = opts.bundledVersion ?? BUNDLED_KNOWLEDGE_VERSION;
  }

  /**
   * 静默检查知识库更新。
   *
   * **本方法永不 reject**：所有失败都转成 state='error' 的返回值。
   * 调用方可以直接 fire-and-forget，不需要 try/catch。
   */
  async checkForUpdate(): Promise<KnowledgeUpdateCheck> {
    let result: KnowledgeUpdateCheck;

    try {
      result = await this.run();
    } catch (e) {
      // 最后一道防线。run() 内部各步已各自降级，走到这里说明有预期外的疏漏 ——
      // 依然不能让启动流程看到异常
      const errorMessage = messageOf(e);
      logger.error('KnowledgeUpdateService', '知识库检查异常降级:', errorMessage);
      result = this.base('error', this.bundledVersion, {errorMessage});
    }

    this.lastCheck = result;
    this.notify(result);
    return result;
  }

  /** 最近一次检查结果；未检查过为 null */
  getLastCheck(): KnowledgeUpdateCheck | null {
    return this.lastCheck;
  }

  /** 订阅检查结果（返回退订函数） */
  addListener(listener: KnowledgeCheckListener): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  // ─── 主流程 ───

  private async run(): Promise<KnowledgeUpdateCheck> {
    const applied = await this.readAppliedVersion();
    const localVersion = resolveLocalVersion(applied, this.bundledVersion);

    // 1. 未配置远端 → 有意跳过
    if (!this.remoteUrl) {
      logger.info('KnowledgeUpdateService', '未配置远端地址，跳过知识库更新检查');
      return this.base('skipped', localVersion);
    }

    // 2. 离线 → 有意跳过（连探测都不值得）
    const online = await this.isOnline();
    if (online === null) {
      const errorMessage = '无法确定网络状态';
      logger.warn('KnowledgeUpdateService', errorMessage);
      return this.base('error', localVersion, {errorMessage});
    }
    if (!online) {
      logger.info('KnowledgeUpdateService', '当前离线，跳过知识库更新检查');
      return this.base('skipped', localVersion);
    }

    // 3. 拉远端清单
    let manifest: KnowledgeManifest;
    try {
      const response = await this.fetchWithTimeout(this.remoteUrl);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const parsed = parseManifest(await response.json());
      if (!parsed) {
        throw new Error('version.json 结构非法');
      }
      manifest = parsed;
    } catch (e) {
      const errorMessage = messageOf(e);
      logger.warn('KnowledgeUpdateService', '拉取知识库清单失败:', errorMessage);
      return this.base('error', localVersion, {errorMessage});
    }

    // 4. 比对版本
    const diff = compareVersions(manifest.version, localVersion);
    if (diff === null) {
      const errorMessage = `版本号无法比较: 远端 "${manifest.version}" vs 本地 "${localVersion}"`;
      logger.warn('KnowledgeUpdateService', errorMessage);
      return this.base('error', localVersion, {
        remoteVersion: manifest.version,
        errorMessage,
      });
    }

    const updateAvailable = diff > 0;
    const changedFiles = updateAvailable
      ? computeChangedFiles(manifest, applied)
      : {};

    logger.info(
      'KnowledgeUpdateService',
      updateAvailable
        ? `发现新版本 ${manifest.version}（本地 ${localVersion}），${Object.keys(changedFiles).length} 个文件待下载`
        : `知识库已是最新（${localVersion}）`,
    );

    return {
      state: 'ready',
      localVersion,
      remoteVersion: manifest.version,
      updateAvailable,
      changedFiles,
    };
  }

  // ─── 增量下载与应用（Day55-56） ───

  /**
   * 下载变更的养护数据并应用到知识库。
   *
   * 与 checkForUpdate 相同的红线：**永不 reject、绝不阻塞启动**。
   *
   * ── 几个刻意的设计 ──
   *
   * 1. **按清单逐文件增量下载，但合并成单文件落盘**。
   *    逐文件是为了只传变更的那几个（省流量）；合并成一个文件是因为
   *    KnowledgeService 启动时要用这些数据，读 56 个文件太慢，
   *    而且单文件写入不会有「版本记录写了、数据只写了一半」的中间态。
   *
   * 2. **写入顺序：先数据、后版本记录**。反过来的话，进程恰好在两次写入
   *    之间被杀，就会留下「版本说已更新、数据却是旧的」——下次检查还会
   *    认为已是最新，于是永久停在旧数据上。
   *
   * 3. **只要有一个文件没成功，版本号就不前进**。否则下次启动会认为
   *    「已是最新」而不再重试，失败的那个文件永远补不上。
   *    但成功的那几个仍会记录 checksum，所以重试时不会重复下载它们。
   *
   * 4. **内容只用 JSON 解析 + 关键字段来校验**，不做字节级 checksum 校验 ——
   *    React Native 没有内置 crypto，算 sha256 要引入原生依赖，为一个
   *    156KB 的公开数据引入原生模块不划算。这层校验能挡住错误页（返回
   *    HTML）、截断、结构损坏；清单里的 checksum 仍然用于**判断哪些文件
   *    需要下载**，那是它的主要用途。
   */
  async downloadAndApply(): Promise<KnowledgeApplyResult> {
    try {
      return await this.runApply();
    } catch (e) {
      const errorMessage = messageOf(e);
      logger.error('KnowledgeUpdateService', '下载应用异常降级:', errorMessage);
      return {
        ok: false,
        downloaded: 0,
        rejected: [],
        failed: [],
        version: null,
        errorMessage,
      };
    }
  }

  private async runApply(): Promise<KnowledgeApplyResult> {
    // 1. 先拿到一份可用的检查结果（没检查过就现查一次）
    let check = this.lastCheck;
    if (!check || check.state !== 'ready' || !check.updateAvailable) {
      check = await this.checkForUpdate();
    }

    const previousApplied = await this.readAppliedVersion();
    const fallbackVersion = previousApplied?.version ?? this.bundledVersion;

    if (check.state !== 'ready' || !check.updateAvailable) {
      return {
        ok: true,
        downloaded: 0,
        rejected: [],
        failed: [],
        version: fallbackVersion,
      };
    }

    const entries = Object.entries(check.changedFiles);

    // 2. 逐个下载并校验内容
    const downloadedGuides: Record<string, CareGuide> = {};
    const downloadedChecksums: Record<string, {checksum?: string}> = {};
    const rejected: string[] = [];
    const failed: string[] = [];

    for (const [name, entry] of entries) {
      let body: string;
      try {
        const response = await this.fetchWithTimeout(entry.url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        body = await response.text();
      } catch (e) {
        logger.warn('KnowledgeUpdateService', `下载 ${name} 失败:`, messageOf(e));
        failed.push(name);
        continue;
      }

      const guide = parseGuide(body);
      if (!guide) {
        logger.warn('KnowledgeUpdateService', `${name} 内容不合法，已丢弃`);
        rejected.push(name);
        continue;
      }

      // 键用 flowerName 而不是文件名：KnowledgeService 是按花名合并覆盖的，
      // 用文件名当键的话，一旦文件名与 flowerName 不一致，这条覆盖就永远
      // 命中不到，更新会静默失效
      downloadedGuides[guide.flowerName] = guide;
      downloadedChecksums[name] = {checksum: entry.checksum};
    }

    // 3. 一个都没成 → 什么都不写，避免留下半吊子状态
    if (Object.keys(downloadedGuides).length === 0) {
      return {
        ok: false,
        downloaded: 0,
        rejected,
        failed,
        version: fallbackVersion,
      };
    }

    // 4. 合并：读旧覆盖 + 新下载的
    const previousCache = await this.readCacheFile();
    const mergedCache = {...previousCache, ...downloadedGuides};

    const appliedFiles = {
      ...(previousApplied?.files ?? {}),
      ...downloadedChecksums,
    };

    const complete = failed.length === 0 && rejected.length === 0;
    const version = complete
      ? check.remoteVersion ?? check.localVersion
      : fallbackVersion;

    // 5. 先数据、后版本记录
    const wrote = await this.writeCache(mergedCache, {
      version,
      appliedAt: new Date().toISOString(),
      files: appliedFiles,
    });
    if (!wrote) {
      return {
        ok: false,
        downloaded: 0,
        rejected,
        failed: [...failed, ...rejected],
        version: fallbackVersion,
        errorMessage: '写入知识库缓存失败',
      };
    }

    // 6. 推给 KnowledgeService 生效
    KnowledgeService.getInstance().applyOverride(mergedCache);

    logger.info(
      'KnowledgeUpdateService',
      `知识库已更新: ${Object.keys(downloadedGuides).length} 份` +
        (complete ? ` → ${version}` : `（部分失败，版本仍为 ${version}）`),
    );

    return {
      ok: complete,
      downloaded: Object.keys(downloadedGuides).length,
      rejected,
      failed,
      version,
    };
  }

  /** 读取已落盘的覆盖数据；读不到返回空对象 */
  private async readCacheFile(): Promise<Record<string, CareGuide>> {
    try {
      const path = `${KNOWLEDGE_CACHE_DIR}/${KNOWLEDGE_DATA_FILE}`;
      if (!(await RNFS.exists(path))) return {};

      const parsed = JSON.parse(await RNFS.readFile(path, 'utf8'));
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
      return parsed as Record<string, CareGuide>;
    } catch (e) {
      logger.warn('KnowledgeUpdateService', '读取知识库缓存失败:', messageOf(e));
      return {};
    }
  }

  /** 写数据文件与版本记录；返回是否成功 */
  private async writeCache(
    guides: Record<string, CareGuide>,
    version: AppliedKnowledgeVersion,
  ): Promise<boolean> {
    try {
      if (!(await RNFS.exists(KNOWLEDGE_CACHE_DIR))) {
        await RNFS.mkdir(KNOWLEDGE_CACHE_DIR);
      }

      await RNFS.writeFile(
        `${KNOWLEDGE_CACHE_DIR}/${KNOWLEDGE_DATA_FILE}`,
        JSON.stringify(guides),
        'utf8',
      );
      await RNFS.writeFile(
        `${KNOWLEDGE_CACHE_DIR}/${KNOWLEDGE_VERSION_FILE}`,
        JSON.stringify(version),
        'utf8',
      );
      return true;
    } catch (e) {
      logger.error('KnowledgeUpdateService', '写入知识库缓存失败:', messageOf(e));
      return false;
    }
  }

  // ─── 各步骤：每个都不抛 ───

  /**
   * 读取已落盘的版本记录（Day55-56 下载应用后写入）。
   * 读不到、解析失败、结构不对 —— 一律返回 null，由调用方退回随包版本。
   *
   * 另外有一条**过时判断**：随包版本严格新于已应用版本时，说明 APP 升级后
   * 自带的数据已经比当初下载的覆盖层新 —— 此时必须忽略覆盖层，否则用户
   * 会一直停留在旧的下发数据上，直到远端版本再次超过它。
   */
  private async readAppliedVersion(): Promise<AppliedKnowledgeVersion | null> {
    try {
      const path = `${KNOWLEDGE_CACHE_DIR}/${KNOWLEDGE_VERSION_FILE}`;
      if (!(await RNFS.exists(path))) return null;

      const parsed = JSON.parse(await RNFS.readFile(path, 'utf8'));
      if (!parsed || typeof parsed.version !== 'string') {
        logger.warn('KnowledgeUpdateService', '落盘版本记录结构异常，退回随包版本');
        return null;
      }

      // 版本号无法比较时（含非数字段）**保留覆盖层** —— 宁可留着可用的
      // 下发数据，也不要因为一个格式问题就把用户退回旧数据
      const bundledVsApplied = compareVersions(this.bundledVersion, parsed.version);
      if (bundledVsApplied !== null && bundledVsApplied > 0) {
        logger.info(
          'KnowledgeUpdateService',
          `随包知识库(${this.bundledVersion})已新于下载的覆盖层(${parsed.version})，忽略覆盖`,
        );
        return null;
      }

      return parsed as AppliedKnowledgeVersion;
    } catch (e) {
      logger.warn('KnowledgeUpdateService', '读取落盘版本失败:', messageOf(e));
      return null;
    }
  }

  /**
   * 是否在线。
   * @returns true/false；**null 表示无法确定**（NetInfo 本身出错）
   */
  private async isOnline(): Promise<boolean | null> {
    try {
      const state = await NetInfo.fetch();
      // isInternetReachable 为 false 时，即使 isConnected 为 true 也不值得尝试
      return Boolean(state.isConnected) && state.isInternetReachable !== false;
    } catch (e) {
      logger.warn('KnowledgeUpdateService', 'NetInfo 查询失败:', messageOf(e));
      return null;
    }
  }

  private async fetchWithTimeout(url: string): Promise<any> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
      return await fetch(url, {signal: controller.signal});
    } finally {
      clearTimeout(timer);
    }
  }

  // ─── 内部工具 ───

  private base(
    state: KnowledgeCheckState,
    localVersion: string,
    extra: {
      remoteVersion?: string | null;
      errorMessage?: string;
      updateAvailable?: boolean;
    } = {},
  ): KnowledgeUpdateCheck {
    return {
      state,
      localVersion,
      remoteVersion: extra.remoteVersion ?? null,
      updateAvailable: extra.updateAvailable ?? false,
      changedFiles: {},
      ...(extra.errorMessage ? {errorMessage: extra.errorMessage} : {}),
    };
  }

  /** 通知订阅者；单个订阅者抛异常不影响其他订阅者与检查结果 */
  private notify(result: KnowledgeUpdateCheck): void {
    for (const listener of this.listeners) {
      try {
        listener(result);
      } catch (e) {
        logger.warn('KnowledgeUpdateService', '订阅者回调异常:', messageOf(e));
      }
    }
  }
}

// ━━━━━ 模块级辅助 ━━━━━

function messageOf(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}

/**
 * 校验并解析下载到的养护数据。
 *
 * 这是内容层的最后一道关：Nginx 配错、文件被截断、请求打到错误页返回 HTML，
 * 都会在这里被挡住。不做字节级 checksum 校验的原因见 downloadAndApply 的注释。
 *
 * @returns 合法时返回指南对象；否则 null（调用方记为 rejected）
 */
function parseGuide(body: string): CareGuide | null {
  try {
    const parsed = JSON.parse(body);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;

    // 至少要能当一份养护指南用：KnowledgeService 按花名索引，按 flowerId 查询
    if (typeof parsed.flowerName !== 'string' || !parsed.flowerName.trim()) {
      return null;
    }
    if (!Number.isInteger(parsed.flowerId) || parsed.flowerId < 1) return null;

    return parsed as CareGuide;
  } catch {
    return null;
  }
}

/** 默认单例（生产用）；测试直接 new 并注入配置 */
export const knowledgeUpdateService = new KnowledgeUpdateService();
export default knowledgeUpdateService;

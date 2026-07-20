/**
 * LoggerService — 智慧花园统一分级日志服务
 * =========================================
 *
 * 与架构文档 9.2 节日志规范保持一致。
 * 支持 DEBUG / INFO / WARN / ERROR 四级日志，
 * 按天滚动存储到本地文件（保留最近 7 天），
 * 并提供内存环形缓冲区供 UI 快速查看。
 *
 * 用法：
 *   import logger from '../services/LoggerService';
 *   logger.info('YoloService', '模型加载成功');
 *   logger.warn('LlmService', '请求超时，已切换备用模型');
 *   logger.error('DB', '数据库初始化失败', error);
 *   logger.debug('Preprocessor', '置信度数值:', confidence);
 *
 *   // 获取历史日志
 *   const recent = logger.getRecentLogs(50);
 *   const files = await logger.listLogFiles();
 */

import RNFS from 'react-native-fs';

// ━━━ 日志级别 ━━━

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

export const LOG_LEVEL_NAMES: Record<LogLevel, string> = {
  [LogLevel.DEBUG]: 'DEBUG',
  [LogLevel.INFO]: 'INFO ',
  [LogLevel.WARN]: 'WARN ',
  [LogLevel.ERROR]: 'ERROR',
};

// ━━━ 日志条目结构 ━━━

export interface LogEntry {
  timestamp: string; // ISO 8601
  level: LogLevel;
  tag: string; // 模块名, e.g. "YoloService"
  message: string; // 日志正文
}

// ━━━ 配置 ━━━

const LOG_DIR = `${RNFS.DocumentDirectoryPath}/logs`;
/** 内存保留最多日志条数 */
const MAX_MEMORY_ENTRIES = 500;
/** 文件保留天数 */
const LOG_RETENTION_DAYS = 7;
/** 开发模式默认 DEBUG，生产模式默认 INFO */
const DEFAULT_LOG_LEVEL = __DEV__ ? LogLevel.DEBUG : LogLevel.INFO;

// ━━━ LoggerService ━━━

class LoggerService {
  private static instance: LoggerService;
  private minLevel: LogLevel = DEFAULT_LOG_LEVEL;
  private buffer: LogEntry[] = [];
  private initialized = false;

  static getInstance(): LoggerService {
    if (!LoggerService.instance) {
      LoggerService.instance = new LoggerService();
    }
    return LoggerService.instance;
  }

  /**
   * 初始化日志服务：创建日志目录，清理过期文件。
   * 在 App 启动时调用一次即可。
   */
  async init(): Promise<void> {
    if (this.initialized) return;
    try {
      await RNFS.mkdir(LOG_DIR);
      await this.cleanOldFiles();
      this.initialized = true;
      this.info('Logger', `日志服务已初始化 (${LOG_DIR})`);
    } catch (error) {
      // 初始化失败则退化为控制台输出，不阻断 APP
      console.warn('[Logger] 日志目录创建失败，将仅输出到控制台:', error);
    }
  }

  /**
   * 设置最小日志级别（低于此级别的日志不输出不存储）。
   */
  setLevel(level: LogLevel): void {
    this.minLevel = level;
    this.info('Logger', `日志级别已设为 ${LOG_LEVEL_NAMES[level].trim()}`);
  }

  /**
   * 获取当前日志级别。
   */
  getLevel(): LogLevel {
    return this.minLevel;
  }

  /**
   * 日志服务是否已就绪。
   */
  get isReady(): boolean {
    return this.initialized;
  }

  // ─── 四级日志方法 ───

  debug(tag: string, ...args: any[]): void {
    this.log(LogLevel.DEBUG, tag, args);
  }

  info(tag: string, ...args: any[]): void {
    this.log(LogLevel.INFO, tag, args);
  }

  warn(tag: string, ...args: any[]): void {
    this.log(LogLevel.WARN, tag, args);
  }

  error(tag: string, ...args: any[]): void {
    this.log(LogLevel.ERROR, tag, args);
  }

  // ─── 核心日志方法 ───

  private log(level: LogLevel, tag: string, args: any[]): void {
    if (level < this.minLevel) return;

    const message = args
      .map((a) =>
        typeof a === 'object'
          ? a instanceof Error
            ? `${a.message}${a.stack ? '\n' + a.stack : ''}`
            : this.formatObject(a)
          : String(a),
      )
      .join(' ');
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      tag,
      message,
    };

    // 写入内存缓冲区（环形队列）
    this.buffer.push(entry);
    if (this.buffer.length > MAX_MEMORY_ENTRIES) {
      this.buffer = this.buffer.slice(-MAX_MEMORY_ENTRIES);
    }

    // 控制台输出（保留原 console 行为以便开发调试）
    this.consoleOutput(entry);

    // 写文件（异步，不 await 以免阻塞调用方）
    if (this.initialized) {
      this.writeToFile(entry).catch(() => {});
    }
  }

  // ─── 控制台输出格式 ───

  private consoleOutput(entry: LogEntry): void {
    const formatted = this.format(entry);
    switch (entry.level) {
      case LogLevel.DEBUG:
        console.debug(formatted);
        break;
      case LogLevel.INFO:
        console.log(formatted);
        break;
      case LogLevel.WARN:
        console.warn(formatted);
        break;
      case LogLevel.ERROR:
        console.error(formatted);
        break;
    }
  }

  // ─── 格式化 ───

  private format(entry: LogEntry): string {
    const time = this.formatTimestamp(entry.timestamp);
    const levelName = LOG_LEVEL_NAMES[entry.level];
    return `[${time}] [${levelName}] [${entry.tag}] ${entry.message}`;
  }

  private formatTimestamp(iso: string): string {
    // "2026-07-20T10:30:45.123Z" → "2026-07-20 10:30:45.123"
    return iso.replace('T', ' ').replace('Z', '');
  }

  private formatObject(obj: object): string {
    try {
      return JSON.stringify(obj, null, 0);
    } catch {
      return String(obj);
    }
  }

  // ─── 日期文件名 ───

  private getLogFileName(date: Date = new Date()): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${LOG_DIR}/app.${y}-${m}-${d}.log`;
  }

  // ─── 文件写入 ───

  private async writeToFile(entry: LogEntry): Promise<void> {
    try {
      const line = this.format(entry) + '\n';
      const filePath = this.getLogFileName();
      await RNFS.appendFile(filePath, line, 'utf8');
    } catch (error) {
      // 文件写入失败不阻塞业务逻辑，仅控制台警告
      console.warn('[Logger] 文件写入失败:', error);
    }
  }

  // ─── 读取日志 ───

  /**
   * 获取今天的完整日志文本。
   */
  async getTodayLog(): Promise<string> {
    try {
      const filePath = this.getLogFileName();
      const exists = await RNFS.exists(filePath);
      return exists ? await RNFS.readFile(filePath, 'utf8') : '(今日暂无日志)';
    } catch {
      return '';
    }
  }

  /**
   * 获取最近 N 条内存日志。
   */
  getRecentLogs(count: number = 50): LogEntry[] {
    return this.buffer.slice(-count);
  }

  /**
   * 获取所有可用日志文件列表（按日期降序）。
   */
  async listLogFiles(): Promise<
    { name: string; path: string; size: number; date: string }[]
  > {
    try {
      const exists = await RNFS.exists(LOG_DIR);
      if (!exists) return [];
      const files = await RNFS.readDir(LOG_DIR);
      return files
        .filter((f) => f.name.startsWith('app.') && f.name.endsWith('.log'))
        .map((f) => ({
          name: f.name,
          path: f.path,
          size: f.size,
          date: f.name.replace('app.', '').replace('.log', ''),
        }))
        .sort((a, b) => b.date.localeCompare(a.date));
    } catch {
      return [];
    }
  }

  /**
   * 读取指定日志文件内容。
   */
  async readLogFile(fileName: string): Promise<string> {
    try {
      const filePath = `${LOG_DIR}/${fileName}`;
      const exists = await RNFS.exists(filePath);
      return exists ? await RNFS.readFile(filePath, 'utf8') : '';
    } catch {
      return '';
    }
  }

  /**
   * 获取日志文件总大小（字节）。
   */
  async getTotalLogSize(): Promise<number> {
    try {
      const files = await this.listLogFiles();
      return files.reduce((sum, f) => sum + f.size, 0);
    } catch {
      return 0;
    }
  }

  // ─── 日志管理 ───

  /**
   * 清理 7 天前的过期日志文件，返回删除的文件数。
   */
  async cleanOldFiles(): Promise<number> {
    try {
      const exists = await RNFS.exists(LOG_DIR);
      if (!exists) return 0;

      const files = await RNFS.readDir(LOG_DIR);
      const now = new Date();
      let removed = 0;

      for (const file of files) {
        if (!file.name.startsWith('app.') || !file.name.endsWith('.log'))
          continue;

        const dateStr = file.name.replace('app.', '').replace('.log', '');
        const fileDate = new Date(dateStr);
        const diffDays = Math.floor(
          (now.getTime() - fileDate.getTime()) / (1000 * 60 * 60 * 24),
        );

        if (diffDays >= LOG_RETENTION_DAYS) {
          await RNFS.unlink(file.path);
          removed++;
        }
      }

      if (removed > 0) {
        this.info('Logger', `已清理 ${removed} 个过期日志文件`);
      }
      return removed;
    } catch {
      return 0;
    }
  }

  /**
   * 清除所有日志文件和内存缓冲区。
   */
  async clearAll(): Promise<void> {
    this.buffer = [];
    try {
      const exists = await RNFS.exists(LOG_DIR);
      if (exists) {
        await RNFS.unlink(LOG_DIR);
        await RNFS.mkdir(LOG_DIR);
      }
      this.info('Logger', '所有日志已清除');
    } catch {
      // ignore
    }
  }

  /**
   * 导出内存日志到指定路径（用于分享/反馈）。
   */
  async exportLogs(destPath: string): Promise<string> {
    const content = this.buffer
      .map((e) => this.format(e))
      .join('\n');
    const header = [
      '# 智慧花园日志导出',
      `# 导出时间: ${new Date().toISOString()}`,
      `# 日志级别: ${LOG_LEVEL_NAMES[this.minLevel].trim()}`,
      `# 内存条目: ${this.buffer.length}`,
      '',
    ].join('\n');
    await RNFS.writeFile(destPath, header + content, 'utf8');
    return destPath;
  }
}

const logger = LoggerService.getInstance();
export default logger;

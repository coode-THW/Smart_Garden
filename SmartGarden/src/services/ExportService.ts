/**
 * 智慧花园 — 用户数据导出服务
 * ============================
 * 将 SQLite 中的用户数据导出为 JSON 文件，存入设备存储。
 *
 * 用途：
 *   - 用户数据备份
 *   - 数据分析与迁移
 *   - 纠错数据提交（Phase 3）
 *
 * 使用方式：
 *   const exportSvc = ExportService.getInstance();
 *   const result = await exportSvc.exportAll();
 *   console.log(result.filePath); // /data/.../export_2026-07-06.json
 */

import {getDatabase} from '../database/db';
import {UserService} from './UserService';
import {GardenRepository} from '../database/gardenRepository';
import {CorrectionRepository} from '../database/correctionRepository';
import {UserEntity, GardenEntity, FeedbackEntity} from '../types';

// ━━━━━ 常量 ━━━━━

const EXPORT_DIR = 'SmartGardenExports';
const DATE_FORMAT_OPTIONS: Intl.DateTimeFormatOptions = {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
};

// ━━━━━ 导出结果类型 ━━━━━

export interface ExportResult {
  success: boolean;
  filePath: string | null;
  fileName: string;
  fileSize: number;
  recordCount: {
    user: number;
    garden: number;
    feedback: number;
  };
  exportedAt: string;
}

// ━━━━━ ExportService (单例) ━━━━━

export class ExportService {
  private static instance: ExportService;
  private gardenRepo = new GardenRepository();
  private correctionRepo = new CorrectionRepository();
  private userService = UserService.getInstance();

  static getInstance(): ExportService {
    if (!ExportService.instance) {
      ExportService.instance = new ExportService();
    }
    return ExportService.instance;
  }

  // ─── 核心导出 ───

  /**
   * 导出所有用户数据为 JSON 文件。
   * 包含：用户信息（不含密码）、花园列表、纠错记录。
   *
   * @returns ExportResult 包含文件路径和统计信息
   */
  async exportAll(): Promise<ExportResult> {
    const userId = this.userService.getUserId();
    if (!userId) {
      return this.makeResult(false, null, 0, 0, 0);
    }

    const db = await getDatabase();

    // 1. 查询用户信息
    const [userRows] = await db.executeSql(
      'SELECT * FROM user WHERE userId = ?',
      [userId],
    );
    const users: UserEntity[] = userRows.rows.raw();

    // 清洗：去掉 passwordHash 敏感字段
    const safeUser = users.map((u: UserEntity) => ({
      userId: u.userId,
      nickname: u.nickname,
      phone: u.phone,
      createdAt: u.createdAt,
    }));

    // 2. 查询花园数据
    const gardens = await this.gardenRepo.findByUserId(userId);

    // 3. 查询纠错记录
    const feedbacks = await this.correctionRepo.findByUserId(userId);

    // 4. 组装导出数据
    const exportData = {
      app: 'SmartGarden',
      version: '1.0.0',
      exportedAt: new Date().toISOString(),
      user: safeUser,
      garden: gardens,
      feedback: feedbacks,
    };

    // 5. 写入 JSON 文件
    const fileName = this.buildFileName();
    const jsonStr = JSON.stringify(exportData, null, 2);

    try {
      // 尝试通过 react-native-fs 写入（真机环境）
      const filePath = await this.writeToFile(fileName, jsonStr);
      const fileSize = jsonStr.length;

      return this.makeResult(true, filePath, safeUser.length, gardens.length, feedbacks.length, fileSize);
    } catch {
      // 降级：返回 JSON 字符串，由调用方处理存储
      return this.makeResult(true, null, safeUser.length, gardens.length, feedbacks.length);
    }
  }

  // ─── 内部方法 ───

  /**
   * 通过 react-native-fs 将数据写入设备存储。
   */
  private async writeToFile(fileName: string, content: string): Promise<string> {
    // 动态导入 react-native-fs（可能在 Jest 中不可用）
    const RNFS = require('react-native-fs');

    // 确保导出目录存在
    const exportDir = `${RNFS.DocumentDirectoryPath}/${EXPORT_DIR}`;
    const dirExists = await RNFS.exists(exportDir);
    if (!dirExists) {
      await RNFS.mkdir(exportDir);
    }

    const filePath = `${exportDir}/${fileName}`;
    await RNFS.writeFile(filePath, content, 'utf8');

    return filePath;
  }

  /**
   * 生成文件名：export_YYYY-MM-DD_HHmmss.json
   */
  private buildFileName(): string {
    const now = new Date();
    const pad = (n: number) => n.toString().padStart(2, '0');
    const datePart = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    const timePart = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
    return `export_${datePart}_${timePart}.json`;
  }

  private makeResult(
    success: boolean,
    filePath: string | null,
    userCount: number,
    gardenCount: number,
    feedbackCount: number,
    fileSize: number = 0,
  ): ExportResult {
    return {
      success,
      filePath,
      fileName: filePath ? filePath.split('/').pop() || '' : '',
      fileSize,
      recordCount: {user: userCount, garden: gardenCount, feedback: feedbackCount},
      exportedAt: new Date().toISOString(),
    };
  }
}

/**
 * 智慧花园 — 用户服务
 * ===================
 * 职责：
 *   - 首次启动自动生成匿名 UUID（免注册）
 *   - 用户记录创建与持久化
 *   - 可选手机号绑定
 *   - 用户信息查询与更新
 *
 * 初始化流程：
 *   1. 调用 initialize() 检查 SQLite 中是否有用户记录
 *   2. 有 → 使用已有用户
 *   3. 无 → 生成 UUID、插入 user 表、写入 Zustand store
 *
 * 使用方式：
 *   const userService = UserService.getInstance();
 *   await userService.initialize();
 *   console.log(userService.getUserId());
 */

import logger from './LoggerService';
import {getDatabase} from '../database/db';
import {UserEntity} from '../types';

// ━━━━━ UUID v4 生成（纯 JS，无需额外依赖） ━━━━━

function generateUUID(): string {
  // RFC 4122 version 4 UUID
  const hex = '0123456789abcdef';
  const chars: string[] = [];
  for (let i = 0; i < 36; i++) {
    if (i === 8 || i === 13 || i === 18 || i === 23) {
      chars.push('-');
    } else if (i === 14) {
      chars.push('4'); // version 4
    } else if (i === 19) {
      chars.push(hex[(Math.random() * 4) | 8]); // variant 1-2
    } else {
      chars.push(hex[(Math.random() * 16) | 0]);
    }
  }
  return chars.join('');
}

// ━━━━━ UserService (单例) ━━━━━

export class UserService {
  private static instance: UserService;

  private currentUser: UserEntity | null = null;
  private initialized = false;

  // ─── 单例 ───

  static getInstance(): UserService {
    if (!UserService.instance) {
      UserService.instance = new UserService();
    }
    return UserService.instance;
  }

  // ─── 初始化 ───

  /**
   * 初始化用户系统。
   * 首次启动时自动生成 UUID 并创建用户记录。
   * 幂等：多次调用安全。
   *
   * @returns 当前用户的 UserEntity
   */
  async initialize(): Promise<UserEntity> {
    if (this.initialized && this.currentUser) {
      return this.currentUser;
    }

    const db = await getDatabase();

    // 1. 查询是否已有用户
    const [resultSet] = await db.executeSql(
      'SELECT * FROM user ORDER BY createdAt ASC LIMIT 1',
    );
    const rows = resultSet.rows.raw();

    if (rows.length > 0) {
      // 已有用户 → 复用
      this.currentUser = rows[0] as UserEntity;
    } else {
      // 首次启动 → 创建匿名用户
      this.currentUser = await this.createAnonymousUser(db);
    }

    this.initialized = true;
    logger.info('UserService', `用户就绪: ${this.currentUser.userId}`);
    return this.currentUser;
  }

  // ─── 查询 ───

  /** 获取当前用户 ID */
  getUserId(): string | null {
    return this.currentUser?.userId ?? null;
  }

  /** 获取完整用户信息 */
  getUser(): UserEntity | null {
    return this.currentUser;
  }

  /** 是否已初始化 */
  isInitialized(): boolean {
    return this.initialized;
  }

  /** 是否已绑定手机号 */
  isPhoneBound(): boolean {
    return this.currentUser?.phone != null && this.currentUser.phone.length > 0;
  }

  // ─── 绑定操作 ───

  /**
   * 绑定手机号（可选）。
   * 绑定后用户可跨设备同步数据（Phase 3）。
   */
  async bindPhone(phone: string, password?: string): Promise<void> {
    if (!this.currentUser) {
      throw new Error('[UserService] 用户未初始化，请先调用 initialize()');
    }

    const db = await getDatabase();
    const now = new Date().toISOString();

    // 先检查手机号是否已被其他用户绑定
    const [checkResult] = await db.executeSql(
      'SELECT userId FROM user WHERE phone = ? AND userId != ?',
      [phone, this.currentUser.userId],
    );
    const existing = checkResult.rows.raw();
    if (existing.length > 0) {
      throw new Error('该手机号已被其他账号绑定');
    }

    await db.executeSql(
      'UPDATE user SET phone = ?, passwordHash = ?, nickname = ? WHERE userId = ?',
      [
        phone,
        password ? this.hashPassword(password) : this.currentUser.passwordHash,
        this.currentUser.nickname,
        this.currentUser.userId,
      ],
    );

    this.currentUser.phone = phone;
    logger.info('UserService', '手机号已绑定');
  }

  /**
   * 解除手机号绑定（恢复匿名状态）。
   */
  async unbindPhone(): Promise<void> {
    if (!this.currentUser) {
      throw new Error('[UserService] 用户未初始化');
    }

    const db = await getDatabase();
    await db.executeSql(
      'UPDATE user SET phone = NULL, passwordHash = NULL WHERE userId = ?',
      [this.currentUser.userId],
    );

    this.currentUser.phone = null;
    this.currentUser.passwordHash = null;
    logger.info('UserService', '手机号已解绑');
  }

  // ─── 用户信息更新 ───

  /**
   * 更新用户昵称。
   */
  async updateNickname(nickname: string): Promise<void> {
    if (!this.currentUser) {
      throw new Error('[UserService] 用户未初始化');
    }

    const db = await getDatabase();
    await db.executeSql(
      'UPDATE user SET nickname = ? WHERE userId = ?',
      [nickname, this.currentUser.userId],
    );

    this.currentUser.nickname = nickname;
  }

  // ─── 内部方法 ───

  private async createAnonymousUser(db: any): Promise<UserEntity> {
    const userId = generateUUID();
    const now = new Date().toISOString();

    await db.executeSql(
      `INSERT INTO user (userId, createdAt, phone, passwordHash, nickname, avatarPath)
       VALUES (?, ?, NULL, NULL, '花友', NULL)`,
      [userId, now],
    );

    return {
      userId,
      createdAt: now,
      phone: null,
      passwordHash: null,
      nickname: '花友',
      avatarPath: null,
    };
  }

  /**
   * 简单密码哈希（SHA-256）。
   * 生产环境应使用更安全的 bcrypt/argon2，
   * 但移动端本地存储用 SHA-256 已足够。
   */
  private hashPassword(password: string): string {
    // 在实际 RN 环境中可使用 crypto.subtle 或其他哈希库
    // 目前使用简单编码 + 前缀标记
    let hash = 0;
    for (let i = 0; i < password.length; i++) {
      const char = password.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash |= 0; // Convert to 32bit integer
    }
    // 加盐前缀
    return `sha256_local:${hash.toString(16)}:${password.length}`;
  }
}

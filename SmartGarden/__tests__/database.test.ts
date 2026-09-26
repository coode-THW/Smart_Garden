/**
 * 智慧花园 — 数据库仓库集成测试
 * ==============================
 * 通过 mock getDatabase() 模拟 SQLite 执行，验证所有 CRUD 逻辑。
 *
 * 运行: npx jest __tests__/database.test.ts
 */

import {GardenRepository} from '../src/database/gardenRepository';
import {CorrectionRepository} from '../src/database/correctionRepository';
import {ReminderRepository} from '../src/database/reminderRepository';
import {mockDb} from './helpers/mockDatabase';

// ━━━━━ Mock 数据库引擎 ━━━━━
// 内存版 SQLite 在 ./helpers/mockDatabase.ts（提醒调度集成测试共用）

// Mock db 模块
jest.mock('../src/database/db', () => ({
  getDatabase: jest.fn(() =>
    Promise.resolve({
      executeSql: (sql: string, params?: any[]) => mockDb.executeSql(sql, params),
      close: () => {},
    }),
  ),
  getDDL: () => '',
}));

// ━━━━━ 测试 ━━━━━

const UUID = 'test-uuid-0001';

function seedUser() {
  mockDb.reset();
  mockDb.seed('user', [
    {
      userId: UUID,
      createdAt: '2026-07-01T00:00:00.000Z',
      phone: null,
      passwordHash: null,
      nickname: '花友',
      avatarPath: null,
    },
  ]);
}

describe('GardenRepository', () => {
  let repo: GardenRepository;

  beforeEach(() => {
    seedUser();
    repo = new GardenRepository();
  });

  describe('add()', () => {
    test('添加花卉返回 gardenId', async () => {
      const id = await repo.add({userId: UUID, flowerId: 6, customName: '小红'});
      expect(id).toBe(1);
    });

    test('添加多条记录 ID 递增', async () => {
      const id1 = await repo.add({userId: UUID, flowerId: 6});
      const id2 = await repo.add({userId: UUID, flowerId: 3});
      expect(id2).toBe(id1 + 1);
    });
  });

  describe('findByUserId()', () => {
    test('空花园返回空数组', async () => {
      const list = await repo.findByUserId(UUID);
      expect(list).toEqual([]);
    });

    test('返回用户的所有花卉（按时间降序）', async () => {
      await repo.add({userId: UUID, flowerId: 6, customName: '小红'});
      // 略微延迟确保排序稳定
      await new Promise<void>(r => setTimeout(() => r(), 5));
      await repo.add({userId: UUID, flowerId: 3, customName: '小黄'});
      const list = await repo.findByUserId(UUID);
      expect(list.length).toBe(2);
      // createdAt DESC, 所以小黄（后添加）在第一个
      expect(list[0].customName).toBe('小黄');
    });
  });

  describe('findById()', () => {
    test('按 ID 查询成功', async () => {
      const id = await repo.add({userId: UUID, flowerId: 6});
      const found = await repo.findById(id);
      expect(found).not.toBeNull();
      expect(found!.flowerId).toBe(6);
    });

    test('不存在的 ID 返回 null', async () => {
      const found = await repo.findById(999);
      expect(found).toBeNull();
    });
  });

  describe('countByUserId()', () => {
    test('空花园统计为 0', async () => {
      const count = await repo.countByUserId(UUID);
      expect(count).toBe(0);
    });

    test('添加后统计正确', async () => {
      await repo.add({userId: UUID, flowerId: 6});
      await repo.add({userId: UUID, flowerId: 3});
      expect(await repo.countByUserId(UUID)).toBe(2);
    });
  });

  describe('update()', () => {
    test('更新位置成功', async () => {
      const id = await repo.add({userId: UUID, flowerId: 6});
      const ok = await repo.update(id, {location: '南阳台'});
      expect(ok).toBe(true);
    });

    test('无更新字段返回 false', async () => {
      const id = await repo.add({userId: UUID, flowerId: 6});
      const ok = await repo.update(id, {});
      expect(ok).toBe(false);
    });
  });

  describe('delete()', () => {
    test('删除后记录消失', async () => {
      const id = await repo.add({userId: UUID, flowerId: 6});
      expect(await repo.delete(id)).toBe(true);
      expect(await repo.findById(id)).toBeNull();
    });

    test('删除不存在的记录返回 false', async () => {
      expect(await repo.delete(999)).toBe(false);
    });
  });
});

describe('CorrectionRepository', () => {
  let repo: CorrectionRepository;

  beforeEach(() => {
    seedUser();
    repo = new CorrectionRepository();
  });

  describe('add()', () => {
    test('插入纠错返回 id', async () => {
      const id = await repo.add({
        userId: UUID,
        imageHash: 'abc123',
        yoloResult: '蒲公英',
        confidence: 0.65,
        userCorrection: '不是花卉',
      });
      expect(id).toBe(1);
    });

    test('LLM 来源记录正常插入', async () => {
      const id = await repo.add({
        userId: UUID,
        imageHash: 'def456',
        yoloResult: '月季',
        confidence: 0.42,
        userCorrection: '玫瑰',
        source: 'llm',
      });
      expect(id).toBe(1);
    });
  });

  describe('查询', () => {
    test('按用户查询纠错历史', async () => {
      await repo.add({userId: UUID, imageHash: 'h1', yoloResult: 'x', confidence: 0.5, userCorrection: 'y'});
      const list = await repo.findByUserId(UUID);
      expect(list.length).toBe(1);
    });

    test('不存在的 id 返回 null', async () => {
      const found = await repo.findById(999);
      expect(found).toBeNull();
    });
  });

  describe('同步管理', () => {
    test('新记录默认未同步', async () => {
      await repo.add({userId: UUID, imageHash: 'h1', yoloResult: 'x', confidence: 0.5, userCorrection: 'y'});
      const unsynced = await repo.findUnsynced();
      expect(unsynced.length).toBe(1);
    });

    test('标记同步后未同步为 0', async () => {
      await repo.add({userId: UUID, imageHash: 'h1', yoloResult: 'x', confidence: 0.5, userCorrection: 'y'});
      const affected = await repo.markSynced([1]);
      expect(affected).toBe(1);
    });
  });

  describe('边界', () => {
    test('空数组标记同步返回 0', async () => {
      expect(await repo.markSynced([])).toBe(0);
    });

    test('不存在的用户纠错为空列表', async () => {
      const list = await repo.findByUserId('nonexistent');
      expect(list).toEqual([]);
    });
  });
});

// ━━━━━ Phase 2 提醒仓库 ━━━━━

describe('ReminderRepository', () => {
  let repo: ReminderRepository;

  /** 插入一条基准提醒，返回 reminderId */
  async function seedReminder(overrides: Record<string, any> = {}) {
    return repo.add({
      userId: UUID,
      gardenId: 1,
      type: 'water',
      frequency: 'daily',
      time: '08:00',
      nextRemindTime: '2026-09-22T08:00:00',
      createdAt: '2026-09-21T02:00:00.000Z',
      updatedAt: '2026-09-21T02:00:00.000Z',
      ...overrides,
    });
  }

  beforeEach(() => {
    seedUser();
    repo = new ReminderRepository();
  });

  describe('add()', () => {
    test('新增提醒返回 reminderId', async () => {
      expect(await seedReminder()).toBe(1);
    });

    test('多条提醒 ID 递增', async () => {
      const id1 = await seedReminder();
      const id2 = await seedReminder({type: 'fertilize'});
      expect(id2).toBe(id1 + 1);
    });

    test('新建提醒默认启用，且无通知 ID、从未触发', async () => {
      const id = await seedReminder();

      const saved = await repo.findById(id);

      expect(saved).not.toBeNull();
      expect(saved!.enabled).toBe(1);
      expect(saved!.notificationId).toBeNull();
      expect(saved!.lastTriggeredAt).toBeNull();
    });

    test('排期字段与调度时间完整落库', async () => {
      const id = await seedReminder({
        frequency: 'weekly',
        daysOfWeek: '2,4,6',
        nextRemindTime: '2026-09-22T08:00:00',
      });

      const saved = await repo.findById(id);

      expect(saved!.daysOfWeek).toBe('2,4,6');
      expect(saved!.nextRemindTime).toBe('2026-09-22T08:00:00');
    });
  });

  describe('addMany() — 批量事务', () => {
    /** 记录本仓库发出的语句类型，并可选地在第 N 条 INSERT 上抛错 */
    function traceStatements(failOnInsert?: number) {
      const original = mockDb.executeSql.bind(mockDb);
      const statements: string[] = [];
      let inserts = 0;

      jest.spyOn(mockDb, 'executeSql').mockImplementation(async (sql, params) => {
        const kind = sql.trim().split(/\s+/)[0].toUpperCase();
        statements.push(kind);
        if (kind === 'INSERT' && ++inserts === failOnInsert) {
          throw new Error('boom');
        }
        return original(sql, params);
      });

      return statements;
    }

    afterEach(() => jest.restoreAllMocks());

    const item = (overrides: Record<string, any> = {}) => ({
      userId: UUID,
      gardenId: 1,
      type: 'water',
      frequency: 'daily',
      time: '08:00',
      nextRemindTime: '2026-09-22T08:00:00',
      createdAt: '2026-09-21T02:00:00.000Z',
      updatedAt: '2026-09-21T02:00:00.000Z',
      ...overrides,
    });

    test('空数组不发出任何语句', async () => {
      const statements = traceStatements();

      expect(await repo.addMany([])).toEqual([]);
      expect(statements).toEqual([]);
    });

    test('返回按入参顺序的自增 ID', async () => {
      const ids = await repo.addMany([
        item(),
        item({type: 'fertilize'}),
        item({type: 'check'}),
      ]);

      expect(ids).toEqual([1, 2, 3]);
    });

    test('多条记录都真正落库', async () => {
      await repo.addMany([item(), item({type: 'check'})]);

      const list = await repo.findByUserId(UUID);
      expect(list.length).toBe(2);
      expect(list.map((r: any) => r.type).sort()).toEqual(['check', 'water']);
    });

    test('包裹在 BEGIN / COMMIT 之间，且 COMMIT 在最后', async () => {
      const statements = traceStatements();

      await repo.addMany([item(), item()]);

      expect(statements).toEqual(['BEGIN', 'INSERT', 'INSERT', 'COMMIT']);
    });

    test('中途失败应发出 ROLLBACK 并把错误抛出去', async () => {
      const statements = traceStatements(2); // 第 2 条 INSERT 失败

      await expect(repo.addMany([item(), item()])).rejects.toThrow('boom');

      expect(statements).toEqual(['BEGIN', 'INSERT', 'INSERT', 'ROLLBACK']);
    });

    test('add() 单条也走同一事务路径', async () => {
      const statements = traceStatements();

      expect(await seedReminder()).toBe(1);
      expect(statements).toEqual(['BEGIN', 'INSERT', 'COMMIT']);
    });
  });

  describe('查询', () => {
    test('按 id 查询成功', async () => {
      const id = await seedReminder();

      const found = await repo.findById(id);

      expect(found).not.toBeNull();
      expect(found!.reminderId).toBe(id);
    });

    test('不存在的 id 返回 null', async () => {
      expect(await repo.findById(999)).toBeNull();
    });

    test('按用户查询返回该用户全部提醒', async () => {
      await seedReminder();
      await seedReminder({type: 'fertilize'});
      await seedReminder({userId: 'other-user'});

      const list = await repo.findByUserId(UUID);

      expect(list.length).toBe(2);
    });

    test('不存在的用户返回空列表', async () => {
      expect(await repo.findByUserId('nonexistent')).toEqual([]);
    });

    test('按花园查询只返回该花园的提醒', async () => {
      await seedReminder({gardenId: 1});
      await seedReminder({gardenId: 1, type: 'fertilize'});
      await seedReminder({gardenId: 2, type: 'check'});

      const list = await repo.findByGardenId(UUID, 1);

      expect(list.length).toBe(2);
      expect(list.every((r: any) => r.gardenId === 1)).toBe(true);
    });

    test('统计用户提醒数量', async () => {
      await seedReminder();
      await seedReminder();
      await seedReminder({userId: 'other-user'});

      expect(await repo.countByUserId(UUID)).toBe(2);
    });
  });

  describe('findDue()', () => {
    const NOW = '2026-09-21T10:00:00';

    test('只返回排期已到的提醒', async () => {
      await seedReminder({nextRemindTime: '2026-09-21T08:00:00'}); // 已过
      await seedReminder({nextRemindTime: '2026-09-21T20:00:00'}); // 未到
      await seedReminder({nextRemindTime: '2026-09-25T08:00:00'}); // 未到

      const due = await repo.findDue(UUID, NOW);

      expect(due).toHaveLength(1);
      expect(due[0].nextRemindTime).toBe('2026-09-21T08:00:00');
    });

    test('排期时刻与 now 相等也算到期（边界）', async () => {
      await seedReminder({nextRemindTime: '2026-09-21T10:00:00'});

      expect(await repo.findDue(UUID, NOW)).toHaveLength(1);
    });

    test('停用的提醒即使过期也不返回', async () => {
      await seedReminder({nextRemindTime: '2026-09-01T08:00:00', enabled: 0});

      expect(await repo.findDue(UUID, NOW)).toEqual([]);
    });

    test('按排期升序返回（最该处理的排最前）', async () => {
      await seedReminder({nextRemindTime: '2026-09-20T08:00:00', type: 'check'});
      await seedReminder({nextRemindTime: '2026-09-18T08:00:00', type: 'water'});
      await seedReminder({nextRemindTime: '2026-09-19T08:00:00', type: 'fertilize'});

      const due = await repo.findDue(UUID, NOW);

      expect(due.map((r: any) => r.nextRemindTime)).toEqual([
        '2026-09-18T08:00:00',
        '2026-09-19T08:00:00',
        '2026-09-20T08:00:00',
      ]);
    });

    test('只返回该用户的提醒', async () => {
      await seedReminder({nextRemindTime: '2026-09-21T08:00:00'});
      await seedReminder({
        userId: 'other-user',
        nextRemindTime: '2026-09-20T08:00:00',
      });

      const mine = await repo.findDue(UUID, NOW);
      const theirs = await repo.findDue('other-user', NOW);

      expect(mine).toHaveLength(1);
      expect(mine[0].userId).toBe(UUID);
      expect(theirs).toHaveLength(1);
      expect(theirs[0].userId).toBe('other-user');
    });

    test('没有到期提醒时返回空数组', async () => {
      await seedReminder({nextRemindTime: '2030-01-01T08:00:00'});

      expect(await repo.findDue(UUID, NOW)).toEqual([]);
    });
  });

  describe('update()', () => {
    test('更新单个字段后回读生效', async () => {
      const id = await seedReminder();

      const ok = await repo.update(id, {time: '20:00'});

      expect(ok).toBe(true);
      expect((await repo.findById(id))!.time).toBe('20:00');
    });

    test('多字段更新同时生效', async () => {
      const id = await seedReminder();

      await repo.update(id, {
        nextRemindTime: '2026-09-22T20:00:00',
        notificationId: 'notif-abc',
      });

      const saved = await repo.findById(id);
      expect(saved!.nextRemindTime).toBe('2026-09-22T20:00:00');
      expect(saved!.notificationId).toBe('notif-abc');
    });

    test('可停用提醒（enabled = 0 不被当作空值丢弃）', async () => {
      const id = await seedReminder();

      const ok = await repo.update(id, {enabled: 0});

      expect(ok).toBe(true);
      expect((await repo.findById(id))!.enabled).toBe(0);
    });

    test('未传的字段保持原值', async () => {
      const id = await seedReminder({title: '给月季浇水'});

      await repo.update(id, {time: '20:00'});

      const saved = await repo.findById(id);
      expect(saved!.title).toBe('给月季浇水');
      expect(saved!.type).toBe('water');
    });

    test('无更新字段返回 false', async () => {
      const id = await seedReminder();
      expect(await repo.update(id, {})).toBe(false);
    });

    test('白名单外的列被忽略（无法越权改 userId）', async () => {
      const id = await seedReminder();

      const ok = await repo.update(id, {userId: 'hacked'} as any);

      expect(ok).toBe(false);
      expect((await repo.findById(id))!.userId).toBe(UUID);
    });

    test('更新不存在的记录返回 false', async () => {
      expect(await repo.update(999, {time: '20:00'})).toBe(false);
    });
  });

  describe('delete()', () => {
    test('删除后记录消失', async () => {
      const id = await seedReminder();

      expect(await repo.delete(id)).toBe(true);
      expect(await repo.findById(id)).toBeNull();
    });

    test('删除不存在的记录返回 false', async () => {
      expect(await repo.delete(999)).toBe(false);
    });

    test('按花园删除只影响该花园的提醒', async () => {
      await seedReminder({gardenId: 1});
      await seedReminder({gardenId: 1});
      await seedReminder({gardenId: 2});

      const affected = await repo.deleteByGardenId(UUID, 1);

      expect(affected).toBe(2);
      expect((await repo.findByUserId(UUID)).length).toBe(1);
    });

    test('按用户删除清空该用户全部提醒，不影响他人', async () => {
      await seedReminder();
      await seedReminder();
      await seedReminder({userId: 'other-user'});

      const affected = await repo.deleteByUserId(UUID);

      expect(affected).toBe(2);
      expect((await repo.findByUserId(UUID)).length).toBe(0);
      expect((await repo.findByUserId('other-user')).length).toBe(1);
    });
  });
});

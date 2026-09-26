/**
 * ReminderService 单元测试 — Day41-42 基础 CRUD
 * =============================================
 * 固定系统时间为 2026-09-21（周一）10:00，使 nextRemindTime 计算可确定断言。
 * 星期约定：ISO 8601，1=周一 … 7=周日（与架构文档 "每周二/四/六" → 2,4,6 一致）。
 */

import type {CareGuide} from '../../types';

const FIXED_NOW = '2026-09-21T10:00:00'; // 周一 10:00

// ━━━━━ 测试替身 ━━━━━

function buildRepoMock() {
  return {
    add: jest.fn(),
    // 模拟 AUTOINCREMENT：按入参顺序发号
    addMany: jest.fn(async (items: any[]) => items.map((_, i) => i + 1)),
    findById: jest.fn().mockResolvedValue(null),
    findByUserId: jest.fn().mockResolvedValue([]),
    findByGardenId: jest.fn().mockResolvedValue([]),
    findDue: jest.fn().mockResolvedValue([]),
    countByUserId: jest.fn().mockResolvedValue(0),
    update: jest.fn().mockResolvedValue(true),
    delete: jest.fn().mockResolvedValue(true),
    deleteByGardenId: jest.fn().mockResolvedValue(0),
  };
}

// ━━━━━ 测试套件 ━━━━━

describe('ReminderService', () => {
  let service: any;
  let repo: ReturnType<typeof buildRepoMock>;
  let userService: {getUserId: jest.Mock};

  beforeEach(() => {
    jest.useFakeTimers({now: new Date(FIXED_NOW)});
    jest.resetModules();

    repo = buildRepoMock();
    repo.add.mockImplementation(async (params: any) => {
      return 1;
    });

    userService = {getUserId: jest.fn().mockReturnValue('test-user-id')};

    // 注意：doMock 的路径相对**本测试文件**解析（src/services/__tests__/）
    jest.doMock('../../database/reminderRepository', () => ({
      ReminderRepository: jest.fn().mockReturnValue(repo),
    }));
    jest.doMock('../UserService', () => ({
      UserService: {getInstance: jest.fn().mockReturnValue(userService)},
    }));

    const ReminderServiceClass = require('../ReminderService').ReminderService;
    (ReminderServiceClass as any).instance = undefined;
    service = ReminderServiceClass.getInstance();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // ───────────────────────────────────────────
  // create — 参数校验
  // ───────────────────────────────────────────

  describe('create — 参数校验', () => {
    it('用户未初始化时应返回错误且不写库', async () => {
      userService.getUserId.mockReturnValue(null);

      const resp = await service.create({
        gardenId: 1,
        type: 'water',
        frequency: 'daily',
        time: '08:00',
      });

      expect(resp.code).not.toBe(0);
      expect(resp.data).toBeNull();
      expect(repo.add).not.toHaveBeenCalled();
    });

    it('gardenId 缺失时应返回 INVALID_PARAM 且不写库', async () => {
      const resp = await service.create({
        gardenId: 0,
        type: 'water',
        frequency: 'daily',
        time: '08:00',
      });

      expect(resp.code).toBe(1001);
      expect(repo.add).not.toHaveBeenCalled();
    });

    it('非法 type 应返回 INVALID_PARAM 且不写库', async () => {
      const resp = await service.create({
        gardenId: 1,
        type: 'sunbathing' as any,
        frequency: 'daily',
        time: '08:00',
      });

      expect(resp.code).toBe(1001);
      expect(repo.add).not.toHaveBeenCalled();
    });

    it('非法 frequency 应返回 INVALID_PARAM 且不写库', async () => {
      const resp = await service.create({
        gardenId: 1,
        type: 'water',
        frequency: 'yearly' as any,
        time: '08:00',
      });

      expect(resp.code).toBe(1001);
      expect(repo.add).not.toHaveBeenCalled();
    });

    it('非法 time 格式应返回 INVALID_PARAM 且不写库', async () => {
      const resp = await service.create({
        gardenId: 1,
        type: 'water',
        frequency: 'daily',
        time: '8点',
      });

      expect(resp.code).toBe(1001);
      expect(repo.add).not.toHaveBeenCalled();
    });

    it('超出范围的 time（25:00）应返回 INVALID_PARAM', async () => {
      const resp = await service.create({
        gardenId: 1,
        type: 'water',
        frequency: 'daily',
        time: '25:00',
      });

      expect(resp.code).toBe(1001);
      expect(repo.add).not.toHaveBeenCalled();
    });

    it('weekly 缺少 daysOfWeek 应返回 INVALID_PARAM 且不写库', async () => {
      const resp = await service.create({
        gardenId: 1,
        type: 'water',
        frequency: 'weekly',
        time: '08:00',
      });

      expect(resp.code).toBe(1001);
      expect(repo.add).not.toHaveBeenCalled();
    });

    it('weekly 的 daysOfWeek 含越界星期（8）应返回 INVALID_PARAM', async () => {
      const resp = await service.create({
        gardenId: 1,
        type: 'water',
        frequency: 'weekly',
        daysOfWeek: [2, 8],
        time: '08:00',
      });

      expect(resp.code).toBe(1001);
      expect(repo.add).not.toHaveBeenCalled();
    });

    it('monthly 缺少 dayOfMonth 应返回 INVALID_PARAM 且不写库', async () => {
      const resp = await service.create({
        gardenId: 1,
        type: 'fertilize',
        frequency: 'monthly',
        time: '09:00',
      });

      expect(resp.code).toBe(1001);
      expect(repo.add).not.toHaveBeenCalled();
    });

    it('monthly 的 dayOfMonth 越界（32）应返回 INVALID_PARAM', async () => {
      const resp = await service.create({
        gardenId: 1,
        type: 'fertilize',
        frequency: 'monthly',
        dayOfMonth: 32,
        time: '09:00',
      });

      expect(resp.code).toBe(1001);
      expect(repo.add).not.toHaveBeenCalled();
    });
  });

  // ───────────────────────────────────────────
  // create — nextRemindTime 基础计算
  // ───────────────────────────────────────────

  describe('create — nextRemindTime 计算', () => {
    it('daily：今日时间点已过 → 顺延到明日同点', async () => {
      repo.findById.mockResolvedValue({reminderId: 1});

      await service.create({
        gardenId: 1,
        type: 'water',
        frequency: 'daily',
        time: '08:00', // 现在 10:00，已过
      });

      expect(repo.add).toHaveBeenCalledWith(
        expect.objectContaining({nextRemindTime: '2026-09-22T08:00:00'}),
      );
    });

    it('daily：今日时间点未到 → 就在今日同点', async () => {
      await service.create({
        gardenId: 1,
        type: 'water',
        frequency: 'daily',
        time: '20:00', // 现在 10:00，未到
      });

      expect(repo.add).toHaveBeenCalledWith(
        expect.objectContaining({nextRemindTime: '2026-09-21T20:00:00'}),
      );
    });

    it('weekly：应落在 daysOfWeek 指定的下一个日期（周二/四/六 → 周二）', async () => {
      await service.create({
        gardenId: 1,
        type: 'water',
        frequency: 'weekly',
        daysOfWeek: [2, 4, 6],
        time: '08:00',
      });

      expect(repo.add).toHaveBeenCalledWith(
        expect.objectContaining({
          daysOfWeek: '2,4,6',
          nextRemindTime: '2026-09-22T08:00:00', // 周二
        }),
      );
    });

    it('weekly：今日匹配但时间点已过 → 顺延到下周同一星期', async () => {
      await service.create({
        gardenId: 1,
        type: 'water',
        frequency: 'weekly',
        daysOfWeek: [1], // 周一
        time: '08:00', // 已过
      });

      expect(repo.add).toHaveBeenCalledWith(
        expect.objectContaining({nextRemindTime: '2026-09-28T08:00:00'}),
      );
    });

    it('weekly：今日匹配且时间点未到 → 就在今日', async () => {
      await service.create({
        gardenId: 1,
        type: 'water',
        frequency: 'weekly',
        daysOfWeek: [1], // 周一
        time: '20:00', // 未到
      });

      expect(repo.add).toHaveBeenCalledWith(
        expect.objectContaining({nextRemindTime: '2026-09-21T20:00:00'}),
      );
    });

    it('monthly：本月日期已过 → 顺延到下月同日', async () => {
      await service.create({
        gardenId: 1,
        type: 'fertilize',
        frequency: 'monthly',
        dayOfMonth: 1, // 9月1日已过
        time: '09:00',
      });

      expect(repo.add).toHaveBeenCalledWith(
        expect.objectContaining({
          dayOfMonth: 1,
          nextRemindTime: '2026-10-01T09:00:00',
        }),
      );
    });

    it('monthly：本月日期未到 → 就在本月同日', async () => {
      await service.create({
        gardenId: 1,
        type: 'fertilize',
        frequency: 'monthly',
        dayOfMonth: 25,
        time: '09:00',
      });

      expect(repo.add).toHaveBeenCalledWith(
        expect.objectContaining({nextRemindTime: '2026-09-25T09:00:00'}),
      );
    });

    it('daily + 间隔 10 天（「每10天1次」）：今日已过则推到第 10 天', async () => {
      await service.create({
        gardenId: 1,
        type: 'water',
        frequency: 'daily',
        intervalValue: 10,
        time: '08:00', // 现在 10:00，今日已过
      });

      expect(repo.add).toHaveBeenCalledWith(
        expect.objectContaining({
          intervalValue: 10,
          nextRemindTime: '2026-10-01T08:00:00', // 09-21 + 10 天
        }),
      );
    });

    it('daily + 间隔 10 天：今日时刻未到则就在今日', async () => {
      await service.create({
        gardenId: 1,
        type: 'water',
        frequency: 'daily',
        intervalValue: 10,
        time: '20:00',
      });

      expect(repo.add).toHaveBeenCalledWith(
        expect.objectContaining({nextRemindTime: '2026-09-21T20:00:00'}),
      );
    });

    it('创建时应默认启用，并把 userId 与 createdAt 落库', async () => {
      await service.create({
        gardenId: 7,
        type: 'water',
        frequency: 'daily',
        time: '08:00',
      });

      expect(repo.add).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'test-user-id',
          gardenId: 7,
          type: 'water',
          frequency: 'daily',
          enabled: 1,
          notificationId: null,
          lastTriggeredAt: null,
        }),
      );
      const written = repo.add.mock.calls[0][0];
      expect(written.createdAt).toBeTruthy();
      expect(written.updatedAt).toBeTruthy();
    });
  });

  // ───────────────────────────────────────────
  // create — 返回值
  // ───────────────────────────────────────────

  describe('create — 返回值', () => {
    it('成功后应返回创建的完整记录', async () => {
      repo.findById.mockResolvedValue({
        reminderId: 42,
        userId: 'test-user-id',
        gardenId: 1,
        type: 'water',
        frequency: 'daily',
        time: '08:00',
        nextRemindTime: '2026-09-22T08:00:00',
        enabled: 1,
      });

      const resp = await service.create({
        gardenId: 1,
        type: 'water',
        frequency: 'daily',
        time: '08:00',
      });

      expect(resp.code).toBe(0);
      expect(resp.data).not.toBeNull();
      expect(resp.data.reminderId).toBe(42);
      expect(resp.data.nextRemindTime).toBe('2026-09-22T08:00:00');
    });
  });

  // ───────────────────────────────────────────
  // 查询
  // ───────────────────────────────────────────

  describe('查询', () => {
    it('getById 应返回对应记录', async () => {
      repo.findById.mockResolvedValue({reminderId: 5, type: 'water'});

      const found = await service.getById(5);

      expect(found).not.toBeNull();
      expect(found.reminderId).toBe(5);
    });

    it('getById 未找到应返回 null', async () => {
      repo.findById.mockResolvedValue(null);

      expect(await service.getById(999)).toBeNull();
    });

    it('listByUser 应返回当前用户的全部提醒', async () => {
      repo.findByUserId.mockResolvedValue([
        {reminderId: 1},
        {reminderId: 2},
      ]);

      const list = await service.listByUser();

      expect(repo.findByUserId).toHaveBeenCalledWith('test-user-id');
      expect(list).toHaveLength(2);
    });

    it('用户未初始化时 listByUser 应返回空数组', async () => {
      userService.getUserId.mockReturnValue(null);

      expect(await service.listByUser()).toEqual([]);
      expect(repo.findByUserId).not.toHaveBeenCalled();
    });

    it('listByGarden 应返回指定花园的提醒', async () => {
      repo.findByGardenId.mockResolvedValue([{reminderId: 3, gardenId: 9}]);

      const list = await service.listByGarden(9);

      expect(repo.findByGardenId).toHaveBeenCalledWith('test-user-id', 9);
      expect(list).toHaveLength(1);
    });

    it('count 应返回当前用户的提醒总数', async () => {
      repo.countByUserId.mockResolvedValue(4);

      expect(await service.count()).toBe(4);
      expect(repo.countByUserId).toHaveBeenCalledWith('test-user-id');
    });
  });

  // ───────────────────────────────────────────
  // 更新
  // ───────────────────────────────────────────

  describe('update', () => {
    it('修改 time 后应重算 nextRemindTime', async () => {
      repo.findById
        .mockResolvedValueOnce({
          reminderId: 1,
          userId: 'test-user-id',
          type: 'water',
          frequency: 'daily',
          time: '08:00',
          daysOfWeek: null,
          dayOfMonth: null,
          enabled: 1,
        })
        .mockResolvedValueOnce({reminderId: 1, time: '20:00'});

      await service.update(1, {time: '20:00'});

      expect(repo.update).toHaveBeenCalledWith(
        1,
        expect.objectContaining({
          time: '20:00',
          nextRemindTime: '2026-09-21T20:00:00',
        }),
      );
    });

    it('修改 weekly 的 daysOfWeek 后应重算 nextRemindTime', async () => {
      repo.findById.mockResolvedValue({
        reminderId: 1,
        userId: 'test-user-id',
        type: 'water',
        frequency: 'weekly',
        time: '08:00',
        daysOfWeek: '2,4,6',
        dayOfMonth: null,
        enabled: 1,
      });

      await service.update(1, {daysOfWeek: [3]}); // 周三

      expect(repo.update).toHaveBeenCalledWith(
        1,
        expect.objectContaining({
          daysOfWeek: '3',
          nextRemindTime: '2026-09-23T08:00:00',
        }),
      );
    });

    it('停用提醒时不应改动 nextRemindTime', async () => {
      repo.findById.mockResolvedValue({
        reminderId: 1,
        userId: 'test-user-id',
        type: 'water',
        frequency: 'daily',
        time: '08:00',
        daysOfWeek: null,
        dayOfMonth: null,
        enabled: 1,
        nextRemindTime: '2026-09-22T08:00:00',
      });

      await service.update(1, {enabled: 0});

      const patch = repo.update.mock.calls[0][1];
      expect(patch.enabled).toBe(0);
      expect(patch.nextRemindTime).toBeUndefined();
    });

    it('仅更新 title/note 时不应触发重算', async () => {
      repo.findById.mockResolvedValue({
        reminderId: 1,
        userId: 'test-user-id',
        type: 'water',
        frequency: 'daily',
        time: '08:00',
        daysOfWeek: null,
        dayOfMonth: null,
        enabled: 1,
      });

      await service.update(1, {title: '给月季浇水'});

      const patch = repo.update.mock.calls[0][1];
      expect(patch.title).toBe('给月季浇水');
      expect(patch.nextRemindTime).toBeUndefined();
    });

    it('记录不存在时应返回 false 且不写库', async () => {
      repo.findById.mockResolvedValue(null);

      expect(await service.update(999, {time: '20:00'})).toBe(false);
      expect(repo.update).not.toHaveBeenCalled();
    });

    it('非法 time 应返回 false 且不写库', async () => {
      repo.findById.mockResolvedValue({
        reminderId: 1,
        frequency: 'daily',
        time: '08:00',
      });

      expect(await service.update(1, {time: '99:99'})).toBe(false);
      expect(repo.update).not.toHaveBeenCalled();
    });
  });

  // ───────────────────────────────────────────
  // 删除
  // ───────────────────────────────────────────

  describe('delete', () => {
    it('删除成功应返回 ok', async () => {
      repo.findById.mockResolvedValue(reminderEntity());
      repo.delete.mockResolvedValue(true);

      const result = await service.delete(1);

      expect(result.ok).toBe(true);
      expect(repo.delete).toHaveBeenCalledWith(1);
    });

    it('删除不存在的记录应返回 ok=false 且不删库', async () => {
      repo.findById.mockResolvedValue(null);

      const result = await service.delete(999);

      expect(result.ok).toBe(false);
      expect(repo.delete).not.toHaveBeenCalled();
    });

    it('删除时应把待取消的通知 ID 交出来', async () => {
      repo.findById.mockResolvedValue(reminderEntity({notificationId: 'notif-abc'}));
      repo.delete.mockResolvedValue(true);

      const result = await service.delete(1);

      expect(result.cancelledNotificationId).toBe('notif-abc');
    });

    it('没有注册过通知时 ID 为 null', async () => {
      repo.findById.mockResolvedValue(reminderEntity({notificationId: null}));
      repo.delete.mockResolvedValue(true);

      expect((await service.delete(1)).cancelledNotificationId).toBeNull();
    });
  });

  // ───────────────────────────────────────────
  // 批量创建（Day43-44）
  // ───────────────────────────────────────────

  describe('createBatch — 参数校验', () => {
    it('gardenId 非法应返回 INVALID_PARAM 且不写库', async () => {
      const resp = await service.createBatch(0, [
        {type: 'water', frequency: 'daily', time: '08:00'},
      ]);

      expect(resp.code).toBe(1001);
      expect(repo.addMany).not.toHaveBeenCalled();
    });

    it('规格列表为空应返回 INVALID_PARAM 且不写库', async () => {
      const resp = await service.createBatch(1, []);

      expect(resp.code).toBe(1001);
      expect(repo.addMany).not.toHaveBeenCalled();
    });

    it('用户未初始化应返回错误且不写库', async () => {
      userService.getUserId.mockReturnValue(null);

      const resp = await service.createBatch(1, [
        {type: 'water', frequency: 'daily', time: '08:00'},
      ]);

      expect(resp.code).not.toBe(0);
      expect(repo.addMany).not.toHaveBeenCalled();
    });

    it('任一规格非法则整批拒绝（原子性前置检查）', async () => {
      const resp = await service.createBatch(1, [
        {type: 'water', frequency: 'daily', time: '08:00'},
        {type: 'water', frequency: 'weekly', time: '08:00'}, // 缺 daysOfWeek
      ]);

      expect(resp.code).toBe(1001);
      expect(repo.addMany).not.toHaveBeenCalled();
    });

    it('任一规格时间非法则整批拒绝', async () => {
      const resp = await service.createBatch(1, [
        {type: 'water', frequency: 'daily', time: '25:00'},
      ]);

      expect(resp.code).toBe(1001);
      expect(repo.addMany).not.toHaveBeenCalled();
    });
  });

  describe('createBatch — 原子写入', () => {
    it('应一次事务写入全部规格', async () => {
      repo.findByGardenId.mockResolvedValue([]);
      repo.addMany.mockResolvedValue([10, 11, 12]);
      repo.findByGardenId
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          {reminderId: 10, type: 'water'},
          {reminderId: 11, type: 'fertilize'},
          {reminderId: 12, type: 'check'},
        ]);

      const resp = await service.createBatch(7, [
        {type: 'water', frequency: 'daily', time: '08:00'},
        {type: 'fertilize', frequency: 'monthly', dayOfMonth: 1, time: '09:00'},
        {type: 'check', frequency: 'monthly', dayOfMonth: 1, time: '10:00'},
      ]);

      expect(repo.addMany).toHaveBeenCalledTimes(1);
      const written = repo.addMany.mock.calls[0][0];
      expect(written).toHaveLength(3);
      expect(resp.code).toBe(0);
      expect(resp.data.created).toHaveLength(3);
    });

    it('每条规格都应带上 userId / gardenId / enabled 与算好的 nextRemindTime', async () => {
      repo.findByGardenId.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

      await service.createBatch(7, [
        {type: 'water', frequency: 'daily', time: '08:00'},
      ]);

      const [written] = repo.addMany.mock.calls[0][0];
      expect(written).toMatchObject({
        userId: 'test-user-id',
        gardenId: 7,
        type: 'water',
        time: '08:00',
        enabled: 1,
        nextRemindTime: '2026-09-22T08:00:00', // 现在周一 10:00，08:00 已过
      });
    });

    it('规格里的 daysOfWeek 数组应序列化为逗号字符串', async () => {
      repo.findByGardenId.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

      await service.createBatch(7, [
        {type: 'water', frequency: 'weekly', daysOfWeek: [2, 4, 6], time: '08:00'},
      ]);

      const [written] = repo.addMany.mock.calls[0][0];
      expect(written.daysOfWeek).toBe('2,4,6');
    });
  });

  describe('createBatch — 跳过已存在', () => {
    it('同花园已存在的类型不应重复创建', async () => {
      // 已有一条 water（reminderId 1），本批只新建 fertilize（拿到 reminderId 2）
      repo.addMany.mockResolvedValue([2]);
      repo.findByGardenId
        .mockResolvedValueOnce([{reminderId: 1, type: 'water'}])
        .mockResolvedValueOnce([
          {reminderId: 1, type: 'water'},
          {reminderId: 2, type: 'fertilize'},
        ]);

      const resp = await service.createBatch(7, [
        {type: 'water', frequency: 'daily', time: '08:00'},
        {type: 'fertilize', frequency: 'monthly', dayOfMonth: 1, time: '09:00'},
      ]);

      const written = repo.addMany.mock.calls[0][0];
      expect(written).toHaveLength(1);
      expect(written[0].type).toBe('fertilize');
      expect(resp.data.skipped).toEqual(['water']);
      expect(resp.data.created).toHaveLength(1);
      expect(resp.data.created[0].type).toBe('fertilize');
    });

    it('全部已存在时不写库且返回空 created', async () => {
      repo.findByGardenId.mockResolvedValue([{reminderId: 1, type: 'water'}]);

      const resp = await service.createBatch(7, [
        {type: 'water', frequency: 'daily', time: '08:00'},
      ]);

      expect(repo.addMany).not.toHaveBeenCalled();
      expect(resp.code).toBe(0);
      expect(resp.data.created).toEqual([]);
      expect(resp.data.skipped).toEqual(['water']);
    });

    it('其他花园的同类型提醒不影响本花园', async () => {
      // findByGardenId 按 (userId, gardenId) 过滤，其他花园不会出现在结果里
      repo.findByGardenId.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

      await service.createBatch(8, [
        {type: 'water', frequency: 'daily', time: '08:00'},
      ]);

      expect(repo.findByGardenId).toHaveBeenCalledWith('test-user-id', 8);
      expect(repo.addMany).toHaveBeenCalled();
    });

    it('同一次调用里重复的类型应去重，只创建一条', async () => {
      repo.findByGardenId.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

      await service.createBatch(7, [
        {type: 'water', frequency: 'daily', time: '08:00'},
        {type: 'water', frequency: 'weekly', daysOfWeek: [1], time: '20:00'},
      ]);

      const written = repo.addMany.mock.calls[0][0];
      expect(written).toHaveLength(1);
      expect(written[0].time).toBe('08:00'); // 先到者胜
    });
  });

  describe('createFromCareGuide — 一键设置提醒', () => {
    const guide: CareGuide = {
      flowerId: 6,
      flowerName: '月季',
      scientificName: 'Rosa chinensis',
      family: '蔷薇科',
      origin: '中国',
      bloomPeriod: '5-10月',
      watering: {
        frequency: '春秋每周2次，夏季每周3次，冬季每周1次',
        amount: '浇透',
        timing: '早晚',
        method: '盆土浇灌',
      },
      fertilizing: {
        period: '生长期（4-9月）每月施1次，冬季停肥',
        amount: '稀薄液肥',
        recommended: ['复合肥'],
      },
      lighting: {requirement: '全日照', bestLocation: '南阳台'},
      environment: {temperature: '15-26℃', humidity: '60%', ventilation: '良好'},
      pests: [{name: '红蜘蛛', symptom: '叶片发黄', treatment: '喷药'}],
      operations: [{name: '修剪', frequency: '花后修剪', steps: ['剪除残花']}],
    };

    it('应解析养护指南并批量创建三类提醒', async () => {
      repo.findByGardenId.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

      await service.createFromCareGuide(7, guide, {month: 6});

      const written = repo.addMany.mock.calls[0][0];
      expect(written.map((w: any) => w.type).sort()).toEqual([
        'check',
        'fertilize',
        'water',
      ]);
    });

    it('冬季停肥时只创建浇水与检查', async () => {
      repo.findByGardenId.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

      await service.createFromCareGuide(7, guide, {month: 1});

      const written = repo.addMany.mock.calls[0][0];
      expect(written.map((w: any) => w.type).sort()).toEqual(['check', 'water']);
    });

    it('应用解析出的排期（夏季每周3次 → 周二/四/六）', async () => {
      repo.findByGardenId.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

      await service.createFromCareGuide(7, guide, {month: 6});

      const water = repo.addMany.mock.calls[0][0].find((w: any) => w.type === 'water');
      expect(water).toMatchObject({frequency: 'weekly', daysOfWeek: '2,4,6'});
    });
  });

  // ───────────────────────────────────────────
  // 启用 / 停用 / 删除（Day47-48）
  // ───────────────────────────────────────────

  describe('disable', () => {
    it('应置 enabled=0 并交出待取消的通知 ID', async () => {
      repo.findById.mockResolvedValue(reminderEntity({notificationId: 'notif-abc'}));
      repo.update.mockResolvedValue(true);

      const result = await service.disable(1);

      expect(result.ok).toBe(true);
      expect(result.enabled).toBe(0);
      expect(result.cancelledNotificationId).toBe('notif-abc');
      expect(repo.update).toHaveBeenCalledWith(1, {
        enabled: 0,
        notificationId: null, // 库里的陈旧 ID 一并清空，避免被重复取消
      });
    });

    it('没有注册过通知时 ID 为 null，且不写 notificationId', async () => {
      repo.findById.mockResolvedValue(reminderEntity({notificationId: null}));
      repo.update.mockResolvedValue(true);

      const result = await service.disable(1);

      expect(result.cancelledNotificationId).toBeNull();
      expect(repo.update).toHaveBeenCalledWith(1, {enabled: 0});
    });

    it('停用不应改动排期', async () => {
      repo.findById.mockResolvedValue(reminderEntity());
      repo.update.mockResolvedValue(true);

      await service.disable(1);

      expect(repo.update.mock.calls[0][1].nextRemindTime).toBeUndefined();
    });

    it('记录不存在时 ok=false 且不写库', async () => {
      repo.findById.mockResolvedValue(null);

      const result = await service.disable(999);

      expect(result.ok).toBe(false);
      expect(repo.update).not.toHaveBeenCalled();
    });
  });

  describe('enable', () => {
    it('停用→启用应重算排期到未来', async () => {
      repo.findById.mockResolvedValue(
        reminderEntity({enabled: 0, nextRemindTime: '2026-03-02T08:00:00'}),
      );
      repo.update.mockResolvedValue(true);

      const result = await service.enable(1);

      expect(result.ok).toBe(true);
      expect(result.enabled).toBe(1);
      expect(repo.update).toHaveBeenCalledWith(
        1,
        expect.objectContaining({enabled: 1, nextRemindTime: '2026-09-22T08:00:00'}),
      );
    });

    it('启用不产生待取消的通知', async () => {
      repo.findById.mockResolvedValue(reminderEntity({enabled: 0}));
      repo.update.mockResolvedValue(true);

      expect((await service.enable(1)).cancelledNotificationId).toBeNull();
    });

    it('本来就启用时不重算排期', async () => {
      repo.findById.mockResolvedValue(reminderEntity({enabled: 1}));
      repo.update.mockResolvedValue(true);

      await service.enable(1);

      expect(repo.update.mock.calls[0][1].nextRemindTime).toBeUndefined();
    });

    it('记录不存在时 ok=false', async () => {
      repo.findById.mockResolvedValue(null);

      expect((await service.enable(999)).ok).toBe(false);
    });
  });

  describe('toggle', () => {
    it('启用中的提醒应被停用', async () => {
      repo.findById.mockResolvedValue(reminderEntity({enabled: 1}));
      repo.update.mockResolvedValue(true);

      const result = await service.toggle(1);

      expect(result.enabled).toBe(0);
      expect(repo.update).toHaveBeenCalledWith(1, {enabled: 0});
    });

    it('停用中的提醒应被启用', async () => {
      repo.findById.mockResolvedValue(reminderEntity({enabled: 0}));
      repo.update.mockResolvedValue(true);

      const result = await service.toggle(1);

      expect(result.enabled).toBe(1);
      expect(repo.update).toHaveBeenCalledWith(
        1,
        expect.objectContaining({enabled: 1}),
      );
    });

    it('记录不存在时 ok=false', async () => {
      repo.findById.mockResolvedValue(null);

      expect((await service.toggle(999)).ok).toBe(false);
    });
  });

  describe('deleteByGarden', () => {
    it('应删除该花园的提醒并交出全部待取消的通知 ID', async () => {
      repo.findByGardenId.mockResolvedValue([
        reminderEntity({reminderId: 1, notificationId: 'n1'}),
        reminderEntity({reminderId: 2, notificationId: null}),
        reminderEntity({reminderId: 3, notificationId: 'n3'}),
      ]);
      repo.deleteByGardenId = jest.fn().mockResolvedValue(3);

      const result = await service.deleteByGarden(7);

      expect(repo.deleteByGardenId).toHaveBeenCalledWith('test-user-id', 7);
      expect(result.removed).toBe(3);
      expect(result.cancelledNotificationIds).toEqual(['n1', 'n3']);
    });

    it('该花园没有提醒时不写库', async () => {
      repo.findByGardenId.mockResolvedValue([]);
      repo.deleteByGardenId = jest.fn().mockResolvedValue(0);

      const result = await service.deleteByGarden(7);

      expect(result).toEqual({removed: 0, cancelledNotificationIds: []});
      expect(repo.deleteByGardenId).not.toHaveBeenCalled();
    });

    it('用户未初始化时返回空结果', async () => {
      userService.getUserId.mockReturnValue(null);

      expect(await service.deleteByGarden(7)).toEqual({
        removed: 0,
        cancelledNotificationIds: [],
      });
    });
  });

  // ───────────────────────────────────────────
  // 列表视图（Day47-48）
  // ───────────────────────────────────────────

  describe('listView', () => {
    /** 模拟 UI 手上已有的花园花名表 */
    const flowerNameOf = (gardenId: number) =>
      ({7: '月季', 8: '向日葵'} as Record<number, string>)[gardenId] ?? null;

    it('应给出展示所需的派生字段', async () => {
      repo.findByUserId.mockResolvedValue([
        reminderEntity({
          reminderId: 1,
          gardenId: 7,
          type: 'water',
          frequency: 'weekly',
          daysOfWeek: '2,4,6',
          time: '08:00',
          nextRemindTime: '2026-09-24T08:00:00',
        }),
      ]);

      const [view] = await service.listView({flowerNameOf});

      expect(view).toMatchObject({
        reminderId: 1,
        gardenId: 7,
        flowerName: '月季',
        type: 'water',
        typeLabel: '浇水',
        scheduleText: '每周二/四/六 08:00',
        nextRemindTime: '2026-09-24T08:00:00',
        enabled: 1,
      });
      expect(view.dueInfo.status).toBe('upcoming');
    });

    it('逾期提醒的 dueInfo 应反映出来', async () => {
      repo.findByUserId.mockResolvedValue([
        reminderEntity({nextRemindTime: '2026-09-19T08:00:00'}),
      ]);

      const [view] = await service.listView({flowerNameOf});

      expect(view.dueInfo.status).toBe('due');
      expect(view.dueInfo.missedCount).toBe(3);
    });

    it('未知花园的花名降级为 null 而不是报错', async () => {
      repo.findByUserId.mockResolvedValue([reminderEntity({gardenId: 999})]);

      const [view] = await service.listView({flowerNameOf});

      expect(view.flowerName).toBeNull();
    });

    it('未传解析器时花名为 null', async () => {
      repo.findByUserId.mockResolvedValue([reminderEntity({gardenId: 7})]);

      const [view] = await service.listView();

      expect(view.flowerName).toBeNull();
    });

    it('可按花园筛选', async () => {
      repo.findByGardenId.mockResolvedValue([reminderEntity({gardenId: 8})]);

      const views = await service.listView({gardenId: 8, flowerNameOf});

      expect(repo.findByGardenId).toHaveBeenCalledWith('test-user-id', 8);
      expect(views).toHaveLength(1);
    });

    it('可按启用状态筛选', async () => {
      repo.findByUserId.mockResolvedValue([
        reminderEntity({reminderId: 1, enabled: 1}),
        reminderEntity({reminderId: 2, enabled: 0}),
        reminderEntity({reminderId: 3, enabled: 0}),
      ]);

      const disabled = await service.listView({enabled: 0, flowerNameOf});

      expect(disabled.map((v: any) => v.reminderId)).toEqual([2, 3]);
    });

    it('用户未初始化时返回空数组且不查库', async () => {
      userService.getUserId.mockReturnValue(null);

      expect(await service.listView()).toEqual([]);
      expect(repo.findByUserId).not.toHaveBeenCalled();
    });
  });

  // ───────────────────────────────────────────
  // 调度（Day45-46）
  // ───────────────────────────────────────────

  /** 构造一条可直接喂给调度逻辑的提醒实体 */
  function reminderEntity(overrides: Record<string, any> = {}) {
    return {
      reminderId: 1,
      userId: 'test-user-id',
      gardenId: 7,
      type: 'water',
      frequency: 'daily',
      intervalValue: null,
      daysOfWeek: null,
      dayOfMonth: null,
      time: '08:00',
      nextRemindTime: '2026-09-21T08:00:00',
      notificationId: null,
      lastTriggeredAt: null,
      title: null,
      note: null,
      enabled: 1,
      createdAt: '2026-09-01T00:00:00.000Z',
      updatedAt: '2026-09-01T00:00:00.000Z',
      ...overrides,
    };
  }

  describe('listDue', () => {
    it('返回仓库给出的到期提醒', async () => {
      repo.findDue.mockResolvedValue([reminderEntity({reminderId: 3})]);

      const due = await service.listDue();

      expect(repo.findDue).toHaveBeenCalledWith('test-user-id', expect.any(String));
      expect(due).toHaveLength(1);
      expect(due[0].reminderId).toBe(3);
    });

    it('用户未初始化时返回空数组且不查库', async () => {
      userService.getUserId.mockReturnValue(null);

      expect(await service.listDue()).toEqual([]);
      expect(repo.findDue).not.toHaveBeenCalled();
    });
  });

  describe('getDueInfo', () => {
    it('应透传调度引擎的判定结果', () => {
      const info = service.getDueInfo(reminderEntity());

      expect(info.status).toBe('due');
      expect(info.nextAfter).toBe('2026-09-22T08:00:00');
    });

    it('排期在未来时返回 upcoming', () => {
      const info = service.getDueInfo(
        reminderEntity({nextRemindTime: '2026-09-30T08:00:00'}),
      );

      expect(info.status).toBe('upcoming');
    });
  });

  describe('markTriggered', () => {
    it('应记录 lastTriggeredAt 并把排期推进一格', async () => {
      repo.findById
        .mockResolvedValueOnce(reminderEntity())
        .mockResolvedValueOnce(reminderEntity({lastTriggeredAt: '2026-09-21T10:00:00'}));

      const updated = await service.markTriggered(1, new Date('2026-09-21T10:00:00'));

      expect(repo.update).toHaveBeenCalledWith(1, {
        lastTriggeredAt: '2026-09-21T10:00:00',
        nextRemindTime: '2026-09-22T08:00:00',
      });
      expect(updated).not.toBeNull();
    });

    it('提前触发（通知早到几秒）也应消耗掉本次排期', async () => {
      repo.findById.mockResolvedValue(reminderEntity()); // 排期 08:00
      repo.update.mockResolvedValue(true);

      // 07:59:58 就调用了 markTriggered
      await service.markTriggered(1, new Date('2026-09-21T07:59:58'));

      expect(repo.update).toHaveBeenCalledWith(
        1,
        expect.objectContaining({nextRemindTime: '2026-09-22T08:00:00'}),
      );
    });

    it('逾期多次时沿原网格回推，不重置网格', async () => {
      // 每 10 天浇水，网格锚在 09-11：09-11 → 09-21 → 10-01
      repo.findById.mockResolvedValue(
        reminderEntity({
          intervalValue: 10,
          nextRemindTime: '2026-09-11T08:00:00',
        }),
      );
      repo.update.mockResolvedValue(true);

      await service.markTriggered(1, new Date('2026-09-25T10:00:00'));

      // 正确：回到原网格点 10-01；若错误地以「现在」为锚点则会是 10-05
      expect(repo.update).toHaveBeenCalledWith(
        1,
        expect.objectContaining({nextRemindTime: '2026-10-01T08:00:00'}),
      );
    });

    it('记录不存在时返回 null 且不写库', async () => {
      repo.findById.mockResolvedValue(null);

      expect(await service.markTriggered(999)).toBeNull();
      expect(repo.update).not.toHaveBeenCalled();
    });

    it('不改动 notificationId（通知生命周期归调用方管理）', async () => {
      repo.findById.mockResolvedValue(
        reminderEntity({notificationId: 'notif-abc'}),
      );

      await service.markTriggered(1, new Date('2026-09-21T10:00:00'));

      const patch = repo.update.mock.calls[0][1];
      expect(patch.notificationId).toBeUndefined();
    });
  });

  describe('markTriggeredMany', () => {
    /** 只有 `existing` 里的 id 能查到记录（markTriggered 每条会查两次：处理前 + 回读） */
    function onlyExisting(existing: number[]) {
      repo.findById.mockImplementation(async (id: number) =>
        existing.includes(id) ? reminderEntity({reminderId: id}) : null,
      );
    }

    it('应逐条处理并返回实际更新条数', async () => {
      onlyExisting([1, 2]);
      repo.update.mockResolvedValue(true);

      const count = await service.markTriggeredMany([1, 2], new Date('2026-09-21T10:00:00'));

      expect(count).toBe(2);
    });

    it('其中一条不存在不应影响其他条', async () => {
      onlyExisting([1, 3]);
      repo.update.mockResolvedValue(true);

      const count = await service.markTriggeredMany([1, 999, 3]);

      expect(count).toBe(2);
    });

    it('写入失败的那条不计入', async () => {
      onlyExisting([1, 2]);
      repo.update.mockResolvedValueOnce(false).mockResolvedValueOnce(true);

      expect(await service.markTriggeredMany([1, 2])).toBe(1);
    });

    it('空数组返回 0', async () => {
      expect(await service.markTriggeredMany([])).toBe(0);
    });
  });

  describe('setNotificationId', () => {
    it('应写入系统通知 ID', async () => {
      repo.update.mockResolvedValue(true);

      expect(await service.setNotificationId(1, 'notif-abc')).toBe(true);
      expect(repo.update).toHaveBeenCalledWith(1, {notificationId: 'notif-abc'});
    });

    it('传 null 表示清除', async () => {
      repo.update.mockResolvedValue(true);

      await service.setNotificationId(1, null);

      expect(repo.update).toHaveBeenCalledWith(1, {notificationId: null});
    });
  });

  describe('reschedule', () => {
    it('应把排期重算到下一个未来网格点', async () => {
      // 停用很久后留给下的过期排期
      repo.findById
        .mockResolvedValueOnce(
          reminderEntity({nextRemindTime: '2026-03-02T08:00:00', enabled: 0}),
        )
        .mockResolvedValueOnce(reminderEntity({nextRemindTime: '2026-09-22T08:00:00'}));

      const updated = await service.reschedule(1, new Date('2026-09-21T10:00:00'));

      expect(repo.update).toHaveBeenCalledWith(
        1,
        expect.objectContaining({nextRemindTime: '2026-09-22T08:00:00'}),
      );
      expect(updated).not.toBeNull();
    });

    it('记录不存在时返回 null 且不写库', async () => {
      repo.findById.mockResolvedValue(null);

      expect(await service.reschedule(999)).toBeNull();
      expect(repo.update).not.toHaveBeenCalled();
    });
  });

  describe('update — 重新启用时重算排期', () => {
    it('enabled 0→1 应重算 nextRemindTime 到未来', async () => {
      repo.findById
        .mockResolvedValueOnce(
          reminderEntity({enabled: 0, nextRemindTime: '2026-03-02T08:00:00'}),
        )
        .mockResolvedValueOnce(reminderEntity({enabled: 1}));

      await service.update(1, {enabled: 1});

      expect(repo.update).toHaveBeenCalledWith(
        1,
        expect.objectContaining({enabled: 1, nextRemindTime: '2026-09-22T08:00:00'}),
      );
    });

    it('本来就启用的提醒再次传 enabled:1 不应重算', async () => {
      repo.findById.mockResolvedValue(reminderEntity({enabled: 1}));

      await service.update(1, {enabled: 1});

      expect(repo.update.mock.calls[0][1].nextRemindTime).toBeUndefined();
    });

    it('停用（1→0）不应重算', async () => {
      repo.findById.mockResolvedValue(reminderEntity({enabled: 1}));

      await service.update(1, {enabled: 0});

      expect(repo.update).toHaveBeenCalledWith(1, {enabled: 0});
    });

    it('重新启用同时改时间时，以新时间为准', async () => {
      repo.findById
        .mockResolvedValueOnce(
          reminderEntity({enabled: 0, nextRemindTime: '2026-03-02T08:00:00'}),
        )
        .mockResolvedValueOnce(reminderEntity({enabled: 1}));

      await service.update(1, {enabled: 1, time: '20:00'});

      expect(repo.update).toHaveBeenCalledWith(
        1,
        expect.objectContaining({time: '20:00', nextRemindTime: '2026-09-21T20:00:00'}),
      );
    });
  });
});

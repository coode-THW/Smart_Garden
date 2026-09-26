/**
 * GardenService 单元测试 — Day47-48 移除花园时的提醒级联清理
 * ========================================================
 * 背景：reminder.gardenId 的外键**没有被强制执行**（SQLite 默认
 * foreign_keys = OFF，db.ts 也没开）。所以删掉花园记录不会自动带走
 * 它的提醒 —— 这些"孤儿提醒"会继续按时弹通知，用户却已经找不到那盆花了。
 * 必须在服务层显式级联。
 *
 * 注意 `jest.doMock` 的路径相对**本测试文件**解析。
 */

describe('GardenService.removeFromGarden', () => {
  let service: any;
  let gardenRepo: any;
  let reminderService: any;

  const GARDEN = {
    gardenId: 7,
    userId: 'test-user-id',
    flowerId: 6,
    customName: '小红',
    location: null,
    addedDate: '2026-09-01',
    photoPath: null,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
  };

  beforeEach(() => {
    jest.resetModules();

    gardenRepo = {
      findById: jest.fn().mockResolvedValue(GARDEN),
      delete: jest.fn().mockResolvedValue(true),
      add: jest.fn(),
      findByUserId: jest.fn().mockResolvedValue([]),
      findByUserAndFlower: jest.fn().mockResolvedValue([]),
      countByUserId: jest.fn().mockResolvedValue(0),
      update: jest.fn().mockResolvedValue(true),
      deleteByUserId: jest.fn().mockResolvedValue(0),
    };

    reminderService = {
      deleteByGarden: jest
        .fn()
        .mockResolvedValue({removed: 0, cancelledNotificationIds: []}),
    };

    jest.doMock('../../database/gardenRepository', () => ({
      GardenRepository: jest.fn().mockReturnValue(gardenRepo),
    }));
    jest.doMock('../KnowledgeService', () => ({
      KnowledgeService: {
        getInstance: jest.fn().mockReturnValue({
          getCareGuide: jest.fn().mockReturnValue({code: 0, data: null}),
          initialize: jest.fn(),
        }),
      },
    }));
    jest.doMock('../UserService', () => ({
      UserService: {
        getInstance: jest.fn().mockReturnValue({
          getUserId: jest.fn().mockReturnValue('test-user-id'),
        }),
      },
    }));
    jest.doMock('../ReminderService', () => ({
      ReminderService: {getInstance: jest.fn().mockReturnValue(reminderService)},
    }));

    const GardenServiceClass = require('../GardenService').GardenService;
    (GardenServiceClass as any).instance = undefined;
    service = GardenServiceClass.getInstance();
  });

  it('删除花园时应一并清理它的提醒', async () => {
    reminderService.deleteByGarden.mockResolvedValue({
      removed: 3,
      cancelledNotificationIds: ['n1', 'n3'],
    });

    const result = await service.removeFromGarden(7);

    expect(reminderService.deleteByGarden).toHaveBeenCalledWith(7);
    expect(gardenRepo.delete).toHaveBeenCalledWith(7);
    expect(result.removed).toBe(true);
    expect(result.remindersRemoved).toBe(3);
  });

  it('应把待取消的通知 ID 交给调用方', async () => {
    reminderService.deleteByGarden.mockResolvedValue({
      removed: 2,
      cancelledNotificationIds: ['n1', 'n2'],
    });

    const result = await service.removeFromGarden(7);

    // 不取消的话，删掉的提醒照旧会弹
    expect(result.cancelledNotificationIds).toEqual(['n1', 'n2']);
  });

  it('没有提醒时不报错，返回空的通知列表', async () => {
    reminderService.deleteByGarden.mockResolvedValue({
      removed: 0,
      cancelledNotificationIds: [],
    });

    const result = await service.removeFromGarden(7);

    expect(result.removed).toBe(true);
    expect(result.remindersRemoved).toBe(0);
    expect(result.cancelledNotificationIds).toEqual([]);
  });

  it('花园不存在时不应产生任何副作用', async () => {
    gardenRepo.findById.mockResolvedValue(null);

    const result = await service.removeFromGarden(999);

    expect(result.removed).toBe(false);
    expect(reminderService.deleteByGarden).not.toHaveBeenCalled();
    expect(gardenRepo.delete).not.toHaveBeenCalled();
  });

  it('花园行删除失败时应如实返回 removed=false', async () => {
    gardenRepo.delete.mockResolvedValue(false);

    const result = await service.removeFromGarden(7);

    expect(result.removed).toBe(false);
  });

  it('先删提醒再删花园行（避免留下孤儿提醒）', async () => {
    const order: string[] = [];
    reminderService.deleteByGarden.mockImplementation(async () => {
      order.push('reminders');
      return {removed: 1, cancelledNotificationIds: []};
    });
    gardenRepo.delete.mockImplementation(async () => {
      order.push('garden');
      return true;
    });

    await service.removeFromGarden(7);

    expect(order).toEqual(['reminders', 'garden']);
  });
});

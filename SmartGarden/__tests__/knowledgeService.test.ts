/**
 * 智慧花园 — KnowledgeService 单元测试
 * ====================================
 * 测试知识库查询服务的核心逻辑：
 *   - 初始化缓存
 *   - 按 ID / 名称查询
 *   - 错误处理
 *   - 边界情况
 *
 * 运行: npx jest __tests__/knowledgeService.test.ts
 */

import {KnowledgeService} from '../src/services/KnowledgeService';
import {CareGuide} from '../src/types';

// ━━━━━ 模拟 barrel 数据 ━━━━━

const mockGuides: Record<string, CareGuide> = {
  月季: {
    flowerId: 6,
    flowerName: '月季',
    scientificName: 'Rosa chinensis',
    family: '蔷薇科蔷薇属',
    origin: '中国',
    bloomPeriod: '4-9月',
    watering: {
      frequency: '每周2-3次',
      amount: '浇透水',
      timing: '早晨或傍晚',
      method: '从盆边缓慢浇灌',
    },
    fertilizing: {
      period: '生长期每月1次',
      amount: '复合肥10-15克/次',
      recommended: ['NPK 15-15-15'],
    },
    lighting: {
      requirement: '每天至少4小时阳光',
      bestLocation: '南向阳台',
    },
    environment: {
      temperature: '15-25°C',
      humidity: '50-70%',
      ventilation: '良好',
    },
    pests: [{name: '蚜虫', symptom: '叶片卷曲', treatment: '喷洒吡虫啉'}],
    operations: [{name: '换盆', frequency: '每年春季', steps: ['脱盆', '修剪', '栽种']}],
  },
  玫瑰: {
    flowerId: 3,
    flowerName: '玫瑰',
    scientificName: 'Rosa rugosa',
    family: '蔷薇科蔷薇属',
    origin: '中国东北',
    bloomPeriod: '5-7月',
    watering: {
      frequency: '每周2-3次',
      amount: '浇透水',
      timing: '早晨',
      method: '从盆边浇灌',
    },
    fertilizing: {
      period: '生长期每月1次',
      amount: '复合肥10克/次',
      recommended: ['NPK 15-15-15'],
    },
    lighting: {
      requirement: '充足阳光',
      bestLocation: '向阳处',
    },
    environment: {
      temperature: '15-25°C',
      humidity: '50-70%',
      ventilation: '良好',
    },
    pests: [{name: '黑斑病', symptom: '叶片黑斑', treatment: '多菌灵'}],
    operations: [{name: '修剪', frequency: '冬季', steps: ['剪枯枝', '整形']}],
  },
};

// ━━━━━ 测试套件 ━━━━━

describe('KnowledgeService', () => {
  let service: KnowledgeService;

  beforeEach(() => {
    service = new KnowledgeService(mockGuides);
  });

  // ─── 初始化 ───

  describe('initialize()', () => {
    test('initialize 后 count 正确', () => {
      service.initialize();
      expect(service.count).toBe(2);
    });

    test('initialize 幂等', () => {
      service.initialize();
      service.initialize(); // 第二次不应报错
      expect(service.count).toBe(2);
    });
  });

  // ─── 按 ID 查询 ───

  describe('getCareGuide()', () => {
    test('按 ID 6 查到月季', () => {
      const resp = service.getCareGuide(6);
      expect(resp.code).toBe(0);
      expect(resp.data?.flowerName).toBe('月季');
    });

    test('按 ID 3 查到玫瑰', () => {
      const resp = service.getCareGuide(3);
      expect(resp.code).toBe(0);
      expect(resp.data?.flowerName).toBe('玫瑰');
    });

    test('不存在的 ID 返回 4001', () => {
      const resp = service.getCareGuide(999);
      expect(resp.code).toBe(4001);
      expect(resp.data).toBeNull();
    });

    test('非法 ID（0）返回 1001', () => {
      const resp = service.getCareGuide(0);
      expect(resp.code).toBe(1001);
    });

    test('非法 ID（负数）返回 1001', () => {
      const resp = service.getCareGuide(-1);
      expect(resp.code).toBe(1001);
    });
  });

  // ─── 按名称查询 ───

  describe('getCareGuideByName()', () => {
    test('按名称查到月季', () => {
      const resp = service.getCareGuideByName('月季');
      expect(resp.code).toBe(0);
      expect(resp.data?.flowerId).toBe(6);
    });

    test('不存在的名称返回 4001', () => {
      const resp = service.getCareGuideByName('不存在的花');
      expect(resp.code).toBe(4001);
      expect(resp.data).toBeNull();
    });

    test('空名称返回 1001', () => {
      const resp = service.getCareGuideByName('');
      expect(resp.code).toBe(1001);
    });

    test('空格名称返回 1001', () => {
      const resp = service.getCareGuideByName('  ');
      expect(resp.code).toBe(1001);
    });
  });

  // ─── 列表查询 ───

  describe('列表查询', () => {
    test('getAllFlowerNames 返回所有花名', () => {
      const names = service.getAllFlowerNames();
      expect(names).toContain('月季');
      expect(names).toContain('玫瑰');
      expect(names.length).toBe(2);
    });

    test('getAllGuides 按 ID 升序排列', () => {
      const guides = service.getAllGuides();
      expect(guides.length).toBe(2);
      expect(guides[0].flowerId).toBe(3); // 玫瑰 ID=3
      expect(guides[1].flowerId).toBe(6); // 月季 ID=6
    });
  });

  // ─── 重置 ───

  describe('reset()', () => {
    test('reset 后 count 为 0', () => {
      service.initialize();
      service.reset();
      expect(service.count).toBe(0);
    });
  });

  // ─── 在线更新的覆盖层（Day55-56） ───

  describe('applyOverride()', () => {
    /** 「下载来的」月季：同名同 id，但浇花频率变了 */
    const downloaded = {
      ...mockGuides.月季,
      watering: {...mockGuides.月季.watering, frequency: '夏季每天1次'},
    };

    test('覆盖后按名查询返回新数据', () => {
      service.applyOverride({月季: downloaded});
      service.initialize();

      expect(service.getCareGuideByName('月季').data?.watering.frequency).toBe(
        '夏季每天1次',
      );
    });

    test('覆盖后按 id 查询也返回新数据', () => {
      service.applyOverride({月季: downloaded});
      service.initialize();

      expect(service.getCareGuide(6).data?.watering.frequency).toBe('夏季每天1次');
    });

    test('未覆盖的花卉不受影响（是合并，不是替换）', () => {
      service.applyOverride({月季: downloaded});
      service.initialize();

      expect(service.getCareGuideByName('玫瑰').code).toBe(0);
      expect(service.count).toBe(2);
    });

    test('initialize 之前设置的覆盖，initialize 后生效', () => {
      service.applyOverride({月季: downloaded});
      expect(service.count).toBe(0); // 还没初始化

      service.initialize();

      expect(service.getCareGuide(6).data?.watering.frequency).toBe('夏季每天1次');
    });

    test('initialize 之后设置的覆盖立即生效（重建缓存）', () => {
      service.initialize();
      expect(service.getCareGuideByName('月季').data?.watering.frequency).toBe(
        '每周2-3次',
      );

      service.applyOverride({月季: downloaded});

      expect(service.getCareGuideByName('月季').data?.watering.frequency).toBe(
        '夏季每天1次',
      );
    });

    test('覆盖改变了 flowerId 时不残留旧 id 条目', () => {
      service.applyOverride({月季: {...downloaded, flowerId: 99}});
      service.initialize();

      expect(service.getCareGuide(99).code).toBe(0);
      // 旧的 id 6 不该还能查到 —— 否则会出现「同一份数据两个 id」的幽灵条目
      expect(service.getCareGuide(6).code).not.toBe(0);
      expect(service.count).toBe(2);
    });

    test('覆盖可以引入随包数据里没有的新品种', () => {
      const newFlower = {...mockGuides.月季, flowerName: '新花', flowerId: 77};
      service.applyOverride({新花: newFlower});
      service.initialize();

      expect(service.count).toBe(3);
      expect(service.getCareGuide(77).code).toBe(0);
    });

    test('传空对象可清除覆盖，回到纯随包数据', () => {
      service.applyOverride({月季: downloaded});
      service.initialize();
      expect(service.getCareGuide(6).data?.watering.frequency).toBe('夏季每天1次');

      service.applyOverride({});

      expect(service.getCareGuide(6).data?.watering.frequency).toBe('每周2-3次');
    });

    test('reset 后重新 initialize 仍应用覆盖', () => {
      service.applyOverride({月季: downloaded});
      service.initialize();
      service.reset();
      service.initialize();

      expect(service.getCareGuide(6).data?.watering.frequency).toBe('夏季每天1次');
    });

    test('覆盖不改变 getKnowledge() 之外的查询接口行为', () => {
      // getAllFlowerNames / getAllGuides 也应看到覆盖后的数据
      service.applyOverride({新花: {...mockGuides.月季, flowerName: '新花', flowerId: 77}});
      service.initialize();

      expect(service.getAllFlowerNames()).toContain('新花');
      expect(service.getAllGuides().map(g => g.flowerId).sort((a, b) => a - b)).toEqual([
        3, 6, 77,
      ]);
    });
  });
});

/**
 * ReminderPrefill 单元测试 — Day43-44 预填规则解析
 * ===============================================
 * 用例文本全部取自 assets/care/ 的真实养护 JSON，而非理想化的示例串。
 *
 * 关键背景：真实数据是「按季节分段」的——
 *   "春秋每周2次，夏季每周3次，冬季每周1次"
 * 架构文档里的 "每周2-3次" 只是其中一段，解析前必须先选季节。
 */

import {
  parseFrequencyText,
  weekdaysForCount,
  buildPrefilledReminders,
} from '../ReminderPrefill';
import type {CareGuide} from '../../types';

// ━━━━━ 星期展开 ━━━━━

describe('weekdaysForCount', () => {
  it('每周3次应展开为周二/四/六（架构文档给定示例）', () => {
    expect(weekdaysForCount(3)).toEqual([2, 4, 6]);
  });

  it('每周1次只落在一天', () => {
    expect(weekdaysForCount(1)).toHaveLength(1);
  });

  it('每周2次应间隔分布', () => {
    expect(weekdaysForCount(2)).toEqual([2, 5]);
  });

  it('每周7次覆盖整周且无重复', () => {
    const days = weekdaysForCount(7);
    expect([...days].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('超过 7 次时封顶为 7 天', () => {
    expect(weekdaysForCount(10)).toHaveLength(7);
  });
});

// ━━━━━ 季节分段选择 ━━━━━

describe('parseFrequencyText — 季节分段', () => {
  const 万年青浇水 = '春秋每周2次，夏季每周3次，冬季每周1次';

  it('4 月（春季）取「春秋每周2次」', () => {
    const r = parseFrequencyText(万年青浇水, 4);
    expect(r).toMatchObject({kind: 'schedule', frequency: 'weekly'});
    expect((r as any).daysOfWeek).toHaveLength(2);
  });

  it('7 月（夏季）取「夏季每周3次」', () => {
    const r = parseFrequencyText(万年青浇水, 7);
    expect((r as any).daysOfWeek).toEqual([2, 4, 6]);
  });

  it('1 月（冬季）取「冬季每周1次」', () => {
    const r = parseFrequencyText(万年青浇水, 1);
    expect((r as any).daysOfWeek).toHaveLength(1);
  });

  it('10 月（秋季）命中「春秋」段', () => {
    const r = parseFrequencyText(万年青浇水, 10);
    expect((r as any).daysOfWeek).toHaveLength(2);
  });

  it('无季节前缀的文本全年适用', () => {
    const r = parseFrequencyText('每周2-3次（夏季高温每天1-2次）', 9);
    expect(r).toMatchObject({kind: 'schedule', frequency: 'weekly'});
    expect((r as any).daysOfWeek).toHaveLength(3);
  });
});

// ━━━━━ 频率句式 ━━━━━

describe('parseFrequencyText — 频率句式', () => {
  it('「每周N次」取上限次数（每周2-3次 → 3 天）', () => {
    const r = parseFrequencyText('每周2-3次', 6);
    expect(r).toMatchObject({kind: 'schedule', frequency: 'weekly'});
    expect((r as any).daysOfWeek).toEqual([2, 4, 6]);
  });

  it('「每天1次」→ daily，不带间隔', () => {
    expect(parseFrequencyText('每天1次', 7)).toMatchObject({
      kind: 'schedule',
      frequency: 'daily',
      intervalValue: 1,
    });
  });

  it('「每天1-2次」→ daily', () => {
    expect(parseFrequencyText('每天1-2次', 7)).toMatchObject({
      kind: 'schedule',
      frequency: 'daily',
    });
  });

  it('「每10天1次」→ daily，间隔 10 天', () => {
    expect(parseFrequencyText('每10天1次', 6)).toMatchObject({
      kind: 'schedule',
      frequency: 'daily',
      intervalValue: 10,
    });
  });

  it('「每7-10天1次」→ 取区间中值（向下取整）', () => {
    expect(parseFrequencyText('每7-10天1次', 6)).toMatchObject({
      kind: 'schedule',
      frequency: 'daily',
      intervalValue: 8,
    });
  });

  it('「每2周施1次」→ weekly，间隔 2 周', () => {
    const r = parseFrequencyText('生长期（4-9月）每2周施1次', 6);
    expect(r).toMatchObject({
      kind: 'schedule',
      frequency: 'weekly',
      intervalValue: 2,
    });
  });

  it('「每月施1次」→ monthly，1 号', () => {
    expect(parseFrequencyText('生长期（4-9月）每月施1次', 6)).toMatchObject({
      kind: 'schedule',
      frequency: 'monthly',
      dayOfMonth: 1,
    });
  });

  it('「每月1-2次」→ monthly', () => {
    expect(parseFrequencyText('冬季每月1-2次', 1)).toMatchObject({
      kind: 'schedule',
      frequency: 'monthly',
    });
  });

  it('「每2-3周1次」→ weekly，取区间中值', () => {
    const r = parseFrequencyText('夏季每2-3周1次（半休眠）', 7);
    expect(r).toMatchObject({
      kind: 'schedule',
      frequency: 'weekly',
      intervalValue: 2,
    });
  });
});

// ━━━━━ 括号处理 ━━━━━

describe('parseFrequencyText — 括号与限定语', () => {
  it('剥离限定性括号后仍能解析', () => {
    expect(parseFrequencyText('夏季每周1次或更少（高温半休眠期控水防烂根）', 7)).toMatchObject({
      kind: 'schedule',
      frequency: 'weekly',
    });
  });

  it('括号内含月份区间时作为适用窗口（生长期 4-9 月）', () => {
    const 发财树施肥 = '生长期（5-9月）每月施1次，冬季停肥';
    expect(parseFrequencyText(发财树施肥, 6)).toMatchObject({kind: 'schedule'});
    expect(parseFrequencyText(发财树施肥, 1)).toEqual({kind: 'none'});
  });

  it('月份区间外的季节段应被排除', () => {
    // 6 月不属于 4-9 月之外那段，不应命中「冬季停肥」
    const r = parseFrequencyText('生长期（4-9月）每月施1次，冬季停肥', 11);
    expect(r).toEqual({kind: 'none'});
  });
});

// ━━━━━ 真实数据回归（在 54 份养护 JSON 全量跑测中发现的失败用例） ━━━━━

describe('parseFrequencyText — 真实数据回归', () => {
  it('括号内的逗号不应切断分句（太阳花）', () => {
    const text = '春秋每周1-2次，夏季每周2-3次（盛花旺季蒸发大，视盆土干透而定）';
    // 括号里的「，」若被当作分句分隔符，夏季这段就会被截断
    expect(parseFrequencyText(text, 7)).toMatchObject({
      kind: 'schedule',
      frequency: 'weekly',
    });
    expect((parseFrequencyText(text, 7) as any).daysOfWeek).toHaveLength(3);
  });

  it('末尾无法量化的补充说明不应劫持通年回退（玫瑰）', () => {
    const text = '生长期（3-10月）每月施1次，花期前增施磷钾肥';
    // 4 月在生长期内 → 每月
    expect(parseFrequencyText(text, 4)).toMatchObject({
      kind: 'schedule',
      frequency: 'monthly',
    });
    // 1 月在生长期外 → 该月不施肥，而不是解析失败
    expect(parseFrequencyText(text, 1)).toEqual({kind: 'none'});
  });

  it('同一文本里可解析的通年分句仍应被采用（铜钱草）', () => {
    expect(parseFrequencyText('半土半水：保持水位；土培：每天1次', 7)).toMatchObject({
      kind: 'schedule',
      frequency: 'daily',
    });
  });

  it('「早晚各1次」应识别为 daily（杜鹃）', () => {
    expect(parseFrequencyText('春秋每日或隔日1次，夏季早晚各1次，冬季每周1-2次', 7)).toMatchObject({
      kind: 'schedule',
      frequency: 'daily',
    });
  });

  it('「停水」与「控水」应视为该季节无需操作（芍药/紫藤/鸢尾）', () => {
    const 芍药 = '春秋每周1-2次，夏季每周2-3次，冬季休眠停水';
    expect(parseFrequencyText(芍药, 1)).toEqual({kind: 'none'});
    expect(parseFrequencyText(芍药, 7)).toMatchObject({kind: 'schedule'});

    const 紫藤 = '春秋每周1-2次，夏季每周2-3次，冬季控水';
    expect(parseFrequencyText(紫藤, 12)).toEqual({kind: 'none'});
  });

  it('季节分句无量化频率时该季节不给提醒（牡丹）', () => {
    const 牡丹 = '春季每周1-2次，夏季每周2-3次，秋季逐渐减少，冬季休眠控水（盆土过干时少量补水）';
    expect(parseFrequencyText(牡丹, 5)).toMatchObject({kind: 'schedule'});
    expect(parseFrequencyText(牡丹, 10)).toEqual({kind: 'none'}); // 秋季逐渐减少
    expect(parseFrequencyText(牡丹, 1)).toEqual({kind: 'none'}); // 冬季休眠控水
  });

  it('「每N-M月1次」应识别为按月提醒并带间隔（迷迭香）', () => {
    expect(parseFrequencyText('生长期（4-9月）每2-3月施1次缓释肥', 6)).toMatchObject({
      kind: 'schedule',
      frequency: 'monthly',
      dayOfMonth: 1,
      intervalValue: 2,
    });
  });

  it('指定月份的「追N次」应识别为按月提醒（桂花/山茶花/紫藤）', () => {
    const 桂花 = '春季萌芽后（3月）追1次，夏季（6月）追1次，秋季开花前（8月）追1次';
    expect(parseFrequencyText(桂花, 6)).toMatchObject({
      kind: 'schedule',
      frequency: 'monthly',
    });
    expect(parseFrequencyText(桂花, 11)).toEqual({kind: 'none'});
  });

  it('「全年施N次：花前（3月）…」应识别为按月提醒（牡丹/芍药）', () => {
    expect(parseFrequencyText('全年施3次肥：花前（3月）花后（6月）入冬前（10月）', 3)).toMatchObject({
      kind: 'schedule',
      frequency: 'monthly',
    });
    expect(parseFrequencyText('全年施3次肥：花前（3月）花后（6月）入冬前（10月）', 12)).toEqual({
      kind: 'none',
    });
  });

  it('「不需施肥」应视为无需操作（水仙）', () => {
    expect(
      parseFrequencyText('水培不需施肥（球茎储存足够养分），土培花后追施1次', 7),
    ).toEqual({kind: 'none'});
  });
});

// ━━━━━ 无需提醒 ━━━━━

describe('parseFrequencyText — 无需提醒', () => {
  it('「冬季停肥」→ none', () => {
    expect(parseFrequencyText('冬季停肥', 1)).toEqual({kind: 'none'});
  });

  it('「夏季冬季停肥」→ none', () => {
    expect(parseFrequencyText('春秋生长期每月施1次稀薄液肥，夏季冬季停肥', 7)).toEqual({
      kind: 'none',
    });
  });

  it('「休眠期停肥」→ none', () => {
    expect(parseFrequencyText('生长期（3-9月）每2周施1次，休眠期停肥', 12)).toEqual({
      kind: 'none',
    });
  });

  it('「冬季每月1次或不浇」仍应给出每月提醒（有频率表达式）', () => {
    expect(parseFrequencyText('冬季每月1次或不浇', 1)).toMatchObject({
      kind: 'schedule',
      frequency: 'monthly',
    });
  });
});

// ━━━━━ 无法解析 ━━━━━

describe('parseFrequencyText — 无法解析', () => {
  it('空文本返回 null', () => {
    expect(parseFrequencyText('', 6)).toBeNull();
  });

  it('纯描述文字返回 null', () => {
    expect(parseFrequencyText('见干见湿', 6)).toBeNull();
  });
});

// ━━━━━ 三份提醒的组装 ━━━━━

describe('buildPrefilledReminders', () => {
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

  it('生成 浇水/施肥/检查 三类提醒', () => {
    const specs = buildPrefilledReminders(guide, {month: 6});

    expect(specs.map(s => s.type).sort()).toEqual(['check', 'fertilize', 'water']);
  });

  it('光照不生成提醒', () => {
    const specs = buildPrefilledReminders(guide, {month: 6});
    expect(specs.find((s: any) => s.type === 'light')).toBeUndefined();
  });

  it('三类提醒使用不同默认时间', () => {
    const specs = buildPrefilledReminders(guide, {month: 6});
    const timeOf = (t: string) => specs.find(s => s.type === t)!.time;

    expect(timeOf('water')).toBe('08:00');
    expect(timeOf('fertilize')).toBe('09:00');
    expect(timeOf('check')).toBe('10:00');
  });

  it('浇水的星期应随月份（季节）变化', () => {
    const june = buildPrefilledReminders(guide, {month: 6});
    const jan = buildPrefilledReminders(guide, {month: 1});

    const waterJune = june.find(s => s.type === 'water')!;
    const waterJan = jan.find(s => s.type === 'water')!;

    expect(waterJune.daysOfWeek).toHaveLength(3); // 夏季每周3次
    expect(waterJan.daysOfWeek).toHaveLength(1); // 冬季每周1次
  });

  it('冬季停肥时不应生成施肥提醒', () => {
    const specs = buildPrefilledReminders(guide, {month: 1});

    expect(specs.find(s => s.type === 'fertilize')).toBeUndefined();
    expect(specs.find(s => s.type === 'water')).toBeDefined();
  });

  it('可覆盖默认时间', () => {
    const specs = buildPrefilledReminders(guide, {month: 6, time: '07:30'});
    expect(specs.every(s => s.time === '07:30')).toBe(true);
  });

  it('无病虫害信息时不生成检查提醒', () => {
    const noPests = {...guide, pests: []};
    const specs = buildPrefilledReminders(noPests, {month: 6});
    expect(specs.find(s => s.type === 'check')).toBeUndefined();
  });

  it('施肥提醒带上花名，便于通知展示', () => {
    const specs = buildPrefilledReminders(guide, {month: 6});
    expect(specs.find(s => s.type === 'fertilize')!.title).toContain('月季');
  });
});

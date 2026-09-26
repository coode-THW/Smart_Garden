/**
 * ReminderFormatter 单元测试 — Day47-48 列表展示
 * =============================================
 * 这是 ReminderPrefill（文本 → 规则）的逆向：规则 → 人类可读文本。
 * 两者共用同一套星期/频率约定，所以这里也用 ISO 星期编号（1=周一 … 7=周日）。
 */

import {describeSchedule, REMINDER_TYPE_LABELS} from '../ReminderFormatter';

describe('REMINDER_TYPE_LABELS', () => {
  it('四种提醒类型都有中文标签', () => {
    expect(REMINDER_TYPE_LABELS).toEqual({
      water: '浇水',
      fertilize: '施肥',
      pest: '除虫',
      check: '检查',
    });
  });
});

describe('describeSchedule — daily', () => {
  it('每天', () => {
    expect(describeSchedule({frequency: 'daily', time: '08:00'})).toBe('每天 08:00');
  });

  it('间隔 1 天等同于每天', () => {
    expect(
      describeSchedule({frequency: 'daily', time: '08:00', intervalValue: 1}),
    ).toBe('每天 08:00');
  });

  it('每 10 天', () => {
    expect(
      describeSchedule({frequency: 'daily', time: '08:00', intervalValue: 10}),
    ).toBe('每 10 天 08:00');
  });

  it('间隔值非法时退回每天', () => {
    expect(
      describeSchedule({frequency: 'daily', time: '08:00', intervalValue: 0}),
    ).toBe('每天 08:00');
  });
});

describe('describeSchedule — weekly', () => {
  it('每周二/四/六（架构文档示例）', () => {
    expect(
      describeSchedule({frequency: 'weekly', time: '08:00', daysOfWeek: [2, 4, 6]}),
    ).toBe('每周二/四/六 08:00');
  });

  it('单天', () => {
    expect(
      describeSchedule({frequency: 'weekly', time: '09:00', daysOfWeek: [7]}),
    ).toBe('每周日 09:00');
  });

  it('乱序输入也按星期顺序输出', () => {
    expect(
      describeSchedule({frequency: 'weekly', time: '08:00', daysOfWeek: [6, 1, 4]}),
    ).toBe('每周一/四/六 08:00');
  });

  it('每 2 周', () => {
    expect(
      describeSchedule({
        frequency: 'weekly',
        time: '08:00',
        daysOfWeek: [2],
        intervalValue: 2,
      }),
    ).toBe('每 2 周周二 08:00');
  });

  it('没有星期时不应崩，降级为「每周」', () => {
    expect(describeSchedule({frequency: 'weekly', time: '08:00'})).toBe('每周 08:00');
  });
});

describe('describeSchedule — monthly', () => {
  it('每月 1 日', () => {
    expect(
      describeSchedule({frequency: 'monthly', time: '09:00', dayOfMonth: 1}),
    ).toBe('每月 1 日 09:00');
  });

  it('每月 15 日', () => {
    expect(
      describeSchedule({frequency: 'monthly', time: '09:00', dayOfMonth: 15}),
    ).toBe('每月 15 日 09:00');
  });

  it('每 3 个月', () => {
    expect(
      describeSchedule({
        frequency: 'monthly',
        time: '09:00',
        dayOfMonth: 1,
        intervalValue: 3,
      }),
    ).toBe('每 3 个月 1 日 09:00');
  });

  it('缺少日期时默认 1 日', () => {
    expect(describeSchedule({frequency: 'monthly', time: '09:00'})).toBe(
      '每月 1 日 09:00',
    );
  });
});

/**
 * ReminderScheduler 单元测试 — Day45-46 调度逻辑
 * =============================================
 * 基准时刻 2026-09-21（周一）10:00。参考日历：
 *   09-21 周一  09-22 周二  09-24 周四  09-26 周六  09-28 周一
 *   09-29 周二  10-01 周四  10-06 周二  11-01 周日
 *
 * 核心不变式：**从已排期时刻推进不漂移**。
 * 排期必须沿网格前进（上次时刻 + N 天/周/月），而不是每次从「现在」重算——
 * 否则 APP 每重启一次，浇水时间就会往后飘一次。
 */

import {
  nextOccurrence,
  computeNextRemindTime,
  resolveDue,
  parseLocalDateTime,
  walkForward,
} from '../ReminderScheduler';
import type {ReminderEntity} from '../../types';

const NOW = new Date('2026-09-21T10:00:00'); // 周一 10:00

function local(d: Date): string {
  return (
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-` +
    `${String(d.getDate()).padStart(2, '0')}T` +
    `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:00`
  );
}

const at = (s: string) => new Date(s);

// ━━━━━ 解析本地时间 ━━━━━

describe('parseLocalDateTime', () => {
  it('应把本地时间字符串解析回同一时刻', () => {
    const parsed = parseLocalDateTime('2026-09-21T08:00:00');
    expect(parsed).not.toBeNull();
    expect(local(parsed!)).toBe('2026-09-21T08:00:00');
  });

  it('非法字符串返回 null', () => {
    expect(parseLocalDateTime('')).toBeNull();
    expect(parseLocalDateTime('not-a-date')).toBeNull();
  });
});

// ━━━━━ 首次排期（from 不在网格上） ━━━━━

describe('nextOccurrence — 首次排期', () => {
  it('daily：今日时刻未到 → 就在今日', () => {
    const next = nextOccurrence({frequency: 'daily', time: '20:00'}, NOW);
    expect(local(next)).toBe('2026-09-21T20:00:00');
  });

  it('daily：今日时刻已过 → 顺延到明日', () => {
    const next = nextOccurrence({frequency: 'daily', time: '08:00'}, NOW);
    expect(local(next)).toBe('2026-09-22T08:00:00');
  });

  it('weekly：周二/四/六 → 下一个周二', () => {
    const next = nextOccurrence(
      {frequency: 'weekly', time: '08:00', daysOfWeek: [2, 4, 6]},
      NOW,
    );
    expect(local(next)).toBe('2026-09-22T08:00:00');
  });

  it('weekly：今日匹配但时刻已过 → 顺延下周同一星期', () => {
    const next = nextOccurrence(
      {frequency: 'weekly', time: '08:00', daysOfWeek: [1]},
      NOW,
    );
    expect(local(next)).toBe('2026-09-28T08:00:00');
  });

  it('monthly：本月日期已过 → 下月同日', () => {
    const next = nextOccurrence(
      {frequency: 'monthly', time: '09:00', dayOfMonth: 1},
      NOW,
    );
    expect(local(next)).toBe('2026-10-01T09:00:00');
  });
});

// ━━━━━ 网格推进（from 在网格上）不漂移 ━━━━━

describe('nextOccurrence — 网格推进', () => {
  it('daily 间隔 1：从已排期点推进一天', () => {
    const next = nextOccurrence(
      {frequency: 'daily', time: '08:00'},
      at('2026-09-21T08:00:00'),
    );
    expect(local(next)).toBe('2026-09-22T08:00:00');
  });

  it('daily 间隔 10：连续推进三次恰好 +30 天（不漂移）', () => {
    const schedule = {frequency: 'daily' as const, time: '08:00', intervalValue: 10};
    let cursor = at('2026-09-11T08:00:00');

    cursor = nextOccurrence(schedule, cursor); // +10 → 09-21
    expect(local(cursor)).toBe('2026-09-21T08:00:00');
    cursor = nextOccurrence(schedule, cursor); // +10 → 10-01
    expect(local(cursor)).toBe('2026-10-01T08:00:00');
    cursor = nextOccurrence(schedule, cursor); // +10 → 10-11
    expect(local(cursor)).toBe('2026-10-11T08:00:00');
  });

  it('weekly 一周多次：周二 → 同一周的周四（不是下周）', () => {
    const next = nextOccurrence(
      {frequency: 'weekly', time: '08:00', daysOfWeek: [2, 4, 6]},
      at('2026-09-22T08:00:00'), // 周二
    );
    expect(local(next)).toBe('2026-09-24T08:00:00'); // 周四
  });

  it('weekly 一周多次：周六 → 下一个周二', () => {
    const next = nextOccurrence(
      {frequency: 'weekly', time: '08:00', daysOfWeek: [2, 4, 6]},
      at('2026-09-26T08:00:00'), // 周六
    );
    expect(local(next)).toBe('2026-09-29T08:00:00'); // 下周二
  });

  it('weekly 间隔 2：跳过一周（周二 → 两周后的周二）', () => {
    const next = nextOccurrence(
      {frequency: 'weekly', time: '08:00', daysOfWeek: [2], intervalValue: 2},
      at('2026-09-22T08:00:00'), // 周二
    );
    expect(local(next)).toBe('2026-10-06T08:00:00'); // +14 天
  });

  it('weekly 间隔 2：一周内多天时，仍走完本周剩余的天', () => {
    const next = nextOccurrence(
      {frequency: 'weekly', time: '08:00', daysOfWeek: [2, 4], intervalValue: 2},
      at('2026-09-22T08:00:00'), // 周二
    );
    expect(local(next)).toBe('2026-09-24T08:00:00'); // 本周周四（同一活跃周）
  });

  it('monthly 间隔 1：从已排期点推进一个月', () => {
    const next = nextOccurrence(
      {frequency: 'monthly', time: '09:00', dayOfMonth: 1},
      at('2026-09-01T09:00:00'),
    );
    expect(local(next)).toBe('2026-10-01T09:00:00');
  });

  it('monthly 间隔 2：跳过一个月', () => {
    const next = nextOccurrence(
      {frequency: 'monthly', time: '09:00', dayOfMonth: 1, intervalValue: 2},
      at('2026-09-01T09:00:00'),
    );
    expect(local(next)).toBe('2026-11-01T09:00:00');
  });

  it('monthly：31 号在小月钳制到当月最后一天', () => {
    const next = nextOccurrence(
      {frequency: 'monthly', time: '09:00', dayOfMonth: 31},
      at('2026-01-31T09:00:00'),
    );
    expect(local(next)).toBe('2026-02-28T09:00:00');
  });
});

// ━━━━━ computeNextRemindTime 字符串包装 ━━━━━

describe('computeNextRemindTime', () => {
  it('返回本地时间字符串，且严格晚于 from', () => {
    const result = computeNextRemindTime({frequency: 'daily', time: '08:00'}, NOW);
    expect(result).toBe('2026-09-22T08:00:00');
  });

  it('省略 from 时以当前时间为基准', () => {
    const result = computeNextRemindTime({frequency: 'daily', time: '08:00'});
    expect(parseLocalDateTime(result)!.getTime()).toBeGreaterThan(Date.now());
  });
});

// ━━━━━ 长期仿真：不漂移 ━━━━━

describe('长期推进仿真', () => {
  /** 本地日期差（天），跨夏令时安全 */
  function dayDiff(from: Date, to: Date): number {
    const a = new Date(from.getFullYear(), from.getMonth(), from.getDate()).getTime();
    const b = new Date(to.getFullYear(), to.getMonth(), to.getDate()).getTime();
    return Math.round((b - a) / 86400000);
  }

  it('daily 连续推进 400 次，时刻始终停在 08:00', () => {
    const schedule = {frequency: 'daily' as const, time: '08:00'};
    let cursor = at('2026-09-21T08:00:00');
    const start = new Date(cursor);

    for (let i = 0; i < 400; i++) {
      cursor = nextOccurrence(schedule, cursor);
      expect(cursor.getHours()).toBe(8);
      expect(cursor.getMinutes()).toBe(0);
    }

    // 400 天后仍落在同一天时刻（用本地日期比较，避开夏令时）
    const expected = new Date(2026, 8, 21 + 400, 8, 0, 0, 0);
    expect(cursor.getFullYear()).toBe(expected.getFullYear());
    expect(cursor.getMonth()).toBe(expected.getMonth());
    expect(cursor.getDate()).toBe(expected.getDate());
    expect(dayDiff(start, cursor)).toBe(400);
  });

  it('daily 间隔 10 天长期推进，每次都恰好 +10 天', () => {
    const schedule = {
      frequency: 'daily' as const,
      time: '08:00',
      intervalValue: 10,
    };
    let cursor = at('2026-09-11T08:00:00');

    for (let i = 0; i < 36; i++) {
      const before = new Date(cursor);
      cursor = nextOccurrence(schedule, cursor);
      expect(dayDiff(before, cursor)).toBe(10);
      expect(cursor.getHours()).toBe(8);
    }
  });

  it('weekly 周二/四/六 长期循环，严格按 4,6,2 轮转', () => {
    const schedule = {
      frequency: 'weekly' as const,
      time: '08:00',
      daysOfWeek: [2, 4, 6],
    };
    let cursor = at('2026-09-22T08:00:00'); // 周二

    const seen: number[] = [];
    for (let i = 0; i < 60; i++) {
      cursor = nextOccurrence(schedule, cursor);
      seen.push(cursor.getDay() === 0 ? 7 : cursor.getDay());
      expect(cursor.getHours()).toBe(8);
    }

    expect(seen.slice(0, 6)).toEqual([4, 6, 2, 4, 6, 2]);
  });

  it('逾期一年后补发一次，排期仍落在原网格上', () => {
    const schedule = {
      frequency: 'daily' as const,
      time: '08:00',
      intervalValue: 10,
    };
    const gridStart = at('2026-09-11T08:00:00');
    const now = at('2027-09-21T10:00:00'); // 一年后

    const {next} = walkForward(schedule, gridStart, now);

    expect(dayDiff(gridStart, next) % 10).toBe(0); // 仍在 10 天网格上
    expect(next.getTime()).toBeGreaterThan(now.getTime());
  });

  it('weekly 逾期一年后补发一次，仍落在原星期上', () => {
    const schedule = {
      frequency: 'weekly' as const,
      time: '08:00',
      daysOfWeek: [2, 4, 6],
    };
    const gridStart = at('2026-09-22T08:00:00'); // 周二
    const now = at('2027-09-21T10:00:00');

    const {next} = walkForward(schedule, gridStart, now);

    expect([2, 4, 6]).toContain(next.getDay() === 0 ? 7 : next.getDay());
    expect(next.getTime()).toBeGreaterThan(now.getTime());
  });
});

// ━━━━━ 到期判定 ━━━━━

describe('resolveDue', () => {
  const base: ReminderEntity = {
    reminderId: 1,
    userId: 'u1',
    gardenId: 1,
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
  };

  it('停用的提醒不参与调度', () => {
    expect(resolveDue({...base, enabled: 0}, NOW)).toMatchObject({
      status: 'disabled',
      missedCount: 0,
    });
  });

  it('排期还在未来 → upcoming', () => {
    expect(
      resolveDue({...base, nextRemindTime: '2026-09-22T08:00:00'}, NOW),
    ).toMatchObject({status: 'upcoming', missedCount: 0, nextAfter: null});
  });

  it('刚好到点算到期', () => {
    expect(resolveDue(base, NOW)).toMatchObject({status: 'due', missedCount: 1});
  });

  it('排期时刻与 now 完全相等时算到期（边界）', () => {
    const tie = {...base, nextRemindTime: '2026-09-21T10:00:00'}; // == NOW
    const info = resolveDue(tie, NOW);

    expect(info.status).toBe('due');
    expect(info.missedCount).toBe(1);
    expect(info.nextAfter).toBe('2026-09-22T08:00:00');
  });

  it('数据损坏的 nextRemindTime 不会让提醒永久卡死', () => {
    const broken = {...base, nextRemindTime: 'garbage'};
    const info = resolveDue(broken, NOW);

    expect(info.status).toBe('due');
    expect(parseLocalDateTime(info.nextAfter!)!.getTime()).toBeGreaterThan(
      NOW.getTime(),
    );
  });

  it('逾期一次：给出逾期起点与回网格后的下一次', () => {
    const info = resolveDue(base, NOW);

    expect(info.overdueSince).toBe('2026-09-21T08:00:00');
    expect(info.nextAfter).toBe('2026-09-22T08:00:00');
  });

  it('逾期多次时统计错过次数（09-19 起共 3 次）', () => {
    const info = resolveDue({...base, nextRemindTime: '2026-09-19T08:00:00'}, NOW);

    expect(info.missedCount).toBe(3); // 09-19 / 09-20 / 09-21
    expect(info.nextAfter).toBe('2026-09-22T08:00:00');
  });

  it('回网格后的下一次严格晚于 now', () => {
    const info = resolveDue({...base, nextRemindTime: '2026-09-19T08:00:00'}, NOW);

    expect(parseLocalDateTime(info.nextAfter!)!.getTime()).toBeGreaterThan(
      NOW.getTime(),
    );
  });

  it('逾期很久也不会陷入死循环（每天一次，逾期一年）', () => {
    const info = resolveDue({...base, nextRemindTime: '2025-09-21T08:00:00'}, NOW);

    expect(info.missedCount).toBeGreaterThan(300);
    expect(info.nextAfter).toBe('2026-09-22T08:00:00');
  });

  it('周提醒逾期：按星期网格回推', () => {
    const weekly = {
      ...base,
      frequency: 'weekly' as const,
      daysOfWeek: '2,4,6',
      nextRemindTime: '2026-09-15T08:00:00', // 上周二
    };

    const info = resolveDue(weekly, NOW);

    expect(info.missedCount).toBe(3); // 09-15 / 09-17 / 09-19
    expect(info.nextAfter).toBe('2026-09-22T08:00:00');
  });
});

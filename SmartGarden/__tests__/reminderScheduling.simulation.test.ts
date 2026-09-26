/**
 * 提醒调度全链路仿真 — Day49-50
 * =============================
 * 「模拟 20 条提醒，验证通知准时触发」。
 *
 * 覆盖范围说明（诚实起见）：
 *   ✅ 真实代码：ReminderRepository（真实 SQL，经 __tests__/helpers 的内存 SQLite）、
 *      ReminderService（listDue / markTriggeredMany / 排期推进）、ReminderScheduler
 *   ⛔ 未覆盖：系统级通知投递。react-native-push-notification 尚未集成、
 *      也没有 NotificationService，所以「点了通知真的弹出来」无法在此验证。
 *      本文件验证的是**通知该在什么时刻触发**——即调度层是否准时、是否漏发/重发。
 *
 * 仿真方式：把时钟按小时推进，每步走一遍真实流水线
 *   listDue(now) → 记录触发 → markTriggeredMany(ids, now)
 * 然后检查每条提醒的触发序列：时刻对不对、间隔稳不稳、有没有重复或漏掉。
 */

import {ReminderService} from '../src/services/ReminderService';
import {mockDb} from './helpers/mockDatabase';
import type {ReminderFrequency, ReminderType} from '../src/types';

jest.mock('../src/database/db', () => ({
  getDatabase: jest.fn(() =>
    Promise.resolve({
      executeSql: (sql: string, params?: any[]) => mockDb.executeSql(sql, params),
      close: () => {},
    }),
  ),
  getDDL: () => '',
}));

const USER_ID = 'sim-user';

jest.mock('../src/services/UserService', () => ({
  UserService: {
    getInstance: () => ({getUserId: () => 'sim-user'}),
  },
}));

jest.setTimeout(30000);

// ━━━━━ 时间工具 ━━━━━

const T0 = new Date(2026, 8, 21, 0, 0, 0); // 2026-09-21 周一 00:00
const T_END = new Date(2026, 11, 31, 23, 0, 0); // 2026-12-31 23:00（约 102 天）

function localDateTime(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return (
    `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T` +
    `${p(d.getHours())}:${p(d.getMinutes())}:00`
  );
}

/** 自 T0 起的天数 */
function dayIndex(d: Date): number {
  const a = new Date(T0.getFullYear(), T0.getMonth(), T0.getDate()).getTime();
  const b = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  return Math.round((b - a) / 86400000);
}

/** 自 T0 所在的 ISO 周起算的周序号（T0 是周一） */
function weekIndex(d: Date): number {
  return Math.floor(dayIndex(d) / 7);
}

/** 自 2026-09 起算的月序号 */
function monthIndex(d: Date): number {
  return (d.getFullYear() - 2026) * 12 + (d.getMonth() - 8);
}

function isoWeekday(d: Date): number {
  const w = d.getDay();
  return w === 0 ? 7 : w;
}

function timeOfDay(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}`;
}

// ━━━━━ 20 条提醒的配置 ━━━━━

interface Spec {
  gardenId: number;
  type: ReminderType;
  frequency: ReminderFrequency;
  time: string;
  daysOfWeek?: number[];
  dayOfMonth?: number;
  intervalValue?: number;
  enabled?: 0 | 1;
}

const SPECS: Spec[] = [
  // 1-5：每日类
  {gardenId: 1, type: 'water', frequency: 'daily', time: '07:00'},
  {gardenId: 1, type: 'fertilize', frequency: 'daily', time: '08:00', intervalValue: 3},
  {gardenId: 1, type: 'check', frequency: 'daily', time: '09:00', intervalValue: 10},
  {gardenId: 2, type: 'water', frequency: 'daily', time: '20:00'},
  {gardenId: 2, type: 'pest', frequency: 'daily', time: '21:00'},

  // 6-10：每周类
  {gardenId: 2, type: 'water', frequency: 'weekly', time: '08:00', daysOfWeek: [2, 4, 6]},
  {gardenId: 3, type: 'fertilize', frequency: 'weekly', time: '09:00', daysOfWeek: [1]},
  {gardenId: 3, type: 'check', frequency: 'weekly', time: '10:00', daysOfWeek: [7]},
  {gardenId: 3, type: 'water', frequency: 'weekly', time: '18:00', daysOfWeek: [3], intervalValue: 2},
  {gardenId: 4, type: 'pest', frequency: 'weekly', time: '19:00', daysOfWeek: [5, 6]},

  // 11-14：每月类
  {gardenId: 4, type: 'fertilize', frequency: 'monthly', time: '09:00', dayOfMonth: 1},
  {gardenId: 4, type: 'check', frequency: 'monthly', time: '10:00', dayOfMonth: 15},
  {gardenId: 5, type: 'water', frequency: 'monthly', time: '08:00', dayOfMonth: 28},
  {gardenId: 5, type: 'fertilize', frequency: 'monthly', time: '09:00', dayOfMonth: 5, intervalValue: 2},

  // 15-18：跨花园重复同类，验证隔离
  {gardenId: 5, type: 'water', frequency: 'daily', time: '06:00'},
  {gardenId: 6, type: 'water', frequency: 'daily', time: '06:00'},
  {gardenId: 6, type: 'check', frequency: 'weekly', time: '17:00', daysOfWeek: [1, 3, 5]},
  {gardenId: 6, type: 'fertilize', frequency: 'monthly', time: '11:00', dayOfMonth: 20},

  // 19-20：停用 —— 必须一次都不触发
  {gardenId: 7, type: 'water', frequency: 'daily', time: '08:00', enabled: 0},
  {gardenId: 7, type: 'fertilize', frequency: 'weekly', time: '09:00', daysOfWeek: [1, 4], enabled: 0},
];

// ━━━━━ 仿真 ━━━━━

interface Trigger {
  reminderId: number;
  specIndex: number;
  /** 触发时该提醒原定的排期时刻（= 本次应触发的时刻） */
  scheduledFor: string;
  /** 触发被观察到的时刻 */
  firedAt: string;
}

describe('20 条提醒的调度仿真（2026-09-21 → 2026-12-31）', () => {
  let service: ReminderService;
  let triggers: Trigger[];
  let idToSpecIndex: Map<number, number>;

  beforeAll(async () => {
    mockDb.reset();
    mockDb.seed('user', [
      {
        userId: USER_ID,
        createdAt: '2026-09-01T00:00:00.000Z',
        phone: null,
        passwordHash: null,
        nickname: '花友',
        avatarPath: null,
      },
    ]);

    service = ReminderService.getInstance();
    triggers = [];
    idToSpecIndex = new Map();

    // 建立 20 条提醒
    for (let i = 0; i < SPECS.length; i++) {
      const spec = SPECS[i];
      // 注入 T0：让 20 条提醒都从仿真起点开始排期，而不是真实的墙钟时间
      const created = await service.create(
        {
          gardenId: spec.gardenId,
          type: spec.type,
          frequency: spec.frequency,
          time: spec.time,
          daysOfWeek: spec.daysOfWeek,
          dayOfMonth: spec.dayOfMonth,
          intervalValue: spec.intervalValue,
        },
        T0,
      );
      if (created.code !== 0 || !created.data?.reminderId) {
        throw new Error(`第 ${i} 条提醒创建失败: ${created.message}`);
      }
      idToSpecIndex.set(created.data.reminderId, i);

      if (spec.enabled === 0) {
        await service.disable(created.data.reminderId);
      }
    }

    // 按小时推进时钟，每一步走一遍真实流水线
    for (let t = new Date(T0); t <= T_END; t = new Date(t.getTime() + 3600000)) {
      const now = new Date(t);
      const due = await service.listDue(now);
      if (due.length === 0) continue;

      for (const reminder of due) {
        triggers.push({
          reminderId: reminder.reminderId!,
          specIndex: idToSpecIndex.get(reminder.reminderId!)!,
          scheduledFor: reminder.nextRemindTime,
          firedAt: localDateTime(now),
        });
      }

      await service.markTriggeredMany(
        due.map(r => r.reminderId!),
        now,
      );
    }
  });

  // ─── 基本健全性 ───

  it('20 条提醒全部建立成功', () => {
    expect(SPECS).toHaveLength(20);
    expect(idToSpecIndex.size).toBe(20);
  });

  it('触发总量达到预期量级（防止断言在空跑上通过）', () => {
    // 手算量级：3 条每日 + 2 条每3/10天 + 2 条其他每日 ≈ 555 次，
    // 加上每周类约 154 次、每月类约 14 次，合计 700 上下
    expect(triggers.length).toBeGreaterThan(600);

    const perReminder = new Set(triggers.map(t => t.reminderId));
    // 18 条启用的提醒都应至少触发过一次
    expect(perReminder.size).toBe(18);
  });

  // ─── 准时 ───

  it('每条触发都发生在该提醒设定的时刻上', () => {
    const wrong: string[] = [];

    for (const trig of triggers) {
      const spec = SPECS[trig.specIndex];
      const d = new Date(trig.scheduledFor);

      if (timeOfDay(d) !== spec.time) {
        wrong.push(`#${trig.reminderId} 排期 ${trig.scheduledFor} 不在 ${spec.time}`);
      }
      if (spec.frequency === 'weekly' && !spec.daysOfWeek!.includes(isoWeekday(d))) {
        wrong.push(`#${trig.reminderId} 排期 ${trig.scheduledFor} 星期不在 ${spec.daysOfWeek}`);
      }
      if (spec.frequency === 'monthly' && d.getDate() !== spec.dayOfMonth) {
        wrong.push(`#${trig.reminderId} 排期 ${trig.scheduledFor} 日期不是 ${spec.dayOfMonth}`);
      }
    }

    expect(wrong).toEqual([]);
  });

  it('触发被观察到的时刻不早于排期时刻，且不超过一个 tick（1 小时）', () => {
    const early: string[] = [];
    const late: string[] = [];

    for (const trig of triggers) {
      const scheduled = new Date(trig.scheduledFor).getTime();
      const fired = new Date(trig.firedAt).getTime();
      const lagMs = fired - scheduled;

      if (lagMs < 0) early.push(`#${trig.reminderId} ${trig.firedAt} < ${trig.scheduledFor}`);
      // 允许等于一个 tick：排期 08:00 的提醒会在 08:00 这一拍被发现
      if (lagMs > 3600000) late.push(`#${trig.reminderId} 迟到 ${lagMs / 3600000} 小时`);
    }

    expect(early).toEqual([]);
    expect(late).toEqual([]);
  });

  // ─── 不漏发 / 不重发 ───

  it('同一条提醒不会在同一时刻被触发两次', () => {
    const seen = new Set<string>();
    const dupes: string[] = [];

    for (const trig of triggers) {
      const key = `${trig.reminderId}@${trig.scheduledFor}`;
      if (seen.has(key)) dupes.push(key);
      seen.add(key);
    }

    expect(dupes).toEqual([]);
  });

  it('每条提醒的触发时刻严格递增', () => {
    const byReminder = groupByReminder();
    const bad: string[] = [];

    for (const [reminderId, list] of byReminder) {
      for (let i = 1; i < list.length; i++) {
        if (list[i] <= list[i - 1]) {
          bad.push(`#${reminderId}: ${list[i - 1]} → ${list[i]}`);
        }
      }
    }

    expect(bad).toEqual([]);
  });

  // ─── 不漂移：间隔严格符合频率 ───

  it('每日类提醒的相邻间隔恰好等于设定的天数', () => {
    const bad: string[] = [];

    for (const [reminderId, list] of groupByReminder()) {
      const spec = SPECS[idToSpecIndex.get(reminderId)!];
      if (spec.frequency !== 'daily') continue;

      const step = spec.intervalValue ?? 1;
      for (let i = 1; i < list.length; i++) {
        const gap = dayIndex(new Date(list[i])) - dayIndex(new Date(list[i - 1]));
        if (gap !== step) bad.push(`#${reminderId}: 间隔 ${gap} 天，期望 ${step} 天`);
      }
    }

    expect(bad).toEqual([]);
  });

  it('每周类提醒：同周内走完剩余星期，跨周时恰好跳过 N 周', () => {
    const bad: string[] = [];

    for (const [reminderId, list] of groupByReminder()) {
      const spec = SPECS[idToSpecIndex.get(reminderId)!];
      if (spec.frequency !== 'weekly') continue;

      const stepWeeks = spec.intervalValue ?? 1;
      for (let i = 1; i < list.length; i++) {
        const prev = new Date(list[i - 1]);
        const cur = new Date(list[i]);
        const weekGap = weekIndex(cur) - weekIndex(prev);

        if (weekGap === 0) {
          // 同一个活跃周内：星期必须递增
          if (isoWeekday(cur) <= isoWeekday(prev)) {
            bad.push(`#${reminderId}: 同周内星期未递增 ${list[i - 1]} → ${list[i]}`);
          }
        } else if (weekGap !== stepWeeks) {
          bad.push(`#${reminderId}: 跨周 ${weekGap} 周，期望 ${stepWeeks} 周`);
        }
      }
    }

    expect(bad).toEqual([]);
  });

  it('每月类提醒恰好相隔 N 个月', () => {
    const bad: string[] = [];

    for (const [reminderId, list] of groupByReminder()) {
      const spec = SPECS[idToSpecIndex.get(reminderId)!];
      if (spec.frequency !== 'monthly') continue;

      const stepMonths = spec.intervalValue ?? 1;
      for (let i = 1; i < list.length; i++) {
        const gap =
          monthIndex(new Date(list[i])) - monthIndex(new Date(list[i - 1]));
        if (gap !== stepMonths) bad.push(`#${reminderId}: 相隔 ${gap} 月，期望 ${stepMonths} 月`);
      }
    }

    expect(bad).toEqual([]);
  });

  // ─── 停用 ───

  it('停用的提醒一次都没有触发', () => {
    const disabledIds = new Set(
      SPECS.map((s, i) => (s.enabled === 0 ? i : -1)).filter(i => i >= 0),
    );

    const fired = triggers.filter(t => disabledIds.has(t.specIndex));

    expect(disabledIds.size).toBe(2);
    expect(fired).toEqual([]);
  });

  // ─── 触发次数与频率吻合 ───

  it('每日提醒的触发次数与跨度天数吻合', () => {
    const spanDays = dayIndex(T_END) - dayIndex(T0) + 1; // 含首尾
    const byReminder = groupByReminder();

    for (const [reminderId, list] of byReminder) {
      const spec = SPECS[idToSpecIndex.get(reminderId)!];
      if (spec.frequency !== 'daily' || spec.enabled === 0) continue;

      const step = spec.intervalValue ?? 1;
      // 每 step 天一次，落在 [0, spanDays-1] 天内的网格点数
      const expected = Math.floor((spanDays - 1) / step) + 1;
      expect({id: reminderId, count: list.length}).toEqual({
        id: reminderId,
        count: expected,
      });
    }
  });

  it('跨花园的同类提醒互不干扰（各自独立触发）', () => {
    // SPECS[14] (garden 5) 与 SPECS[15] (garden 6) 配置完全相同，都是 06:00 每日
    const g5 = triggers.filter(t => t.specIndex === 14);
    const g6 = triggers.filter(t => t.specIndex === 15);

    expect(g5.length).toBeGreaterThan(0);
    expect(g5.map(t => t.scheduledFor)).toEqual(g6.map(t => t.scheduledFor));
  });

  // ─── 排期始终在未来 ───

  it('仿真结束时所有启用提醒的下次排期仍在未来', async () => {
    const all = await service.listByUser();
    const stale = all
      .filter(r => r.enabled === 1)
      .filter(r => new Date(r.nextRemindTime).getTime() <= T_END.getTime());

    expect(stale.map(r => `${r.reminderId}: ${r.nextRemindTime}`)).toEqual([]);
  });

  /** 按提醒分组，返回其排期时刻（升序记录顺序即时间顺序） */
  function groupByReminder(): Map<number, string[]> {
    const map = new Map<number, string[]>();
    for (const trig of triggers) {
      const list = map.get(trig.reminderId) ?? [];
      list.push(trig.scheduledFor);
      map.set(trig.reminderId, list);
    }
    return map;
  }
});

// ━━━━━ APP 未运行期间的补发与回网格 ━━━━━

/**
 * 上面那段仿真里，时钟是连着走的，每次发现到期时「当前时刻」恰好落在排期点上，
 * 于是「沿原网格推进」和「以当前时刻为锚点重算」结果相同 —— 那样验不出漂移。
 *
 * 这一段刻意制造**停机间隔**，让两者分叉：停机期间错过的排期点会把「现在」
 * 推离原网格，此时只有从**存储的排期点**出发推进才能回到原网格。
 */
describe('APP 停机后的补发与回网格', () => {
  const DAY = 86400000;

  function at(day: number, hour: number, minute = 0): Date {
    return new Date(2026, 8, 21 + day, hour, minute, 0, 0);
  }

  it('每 10 天浇水：停机 20 天后只补发一次，并回到原网格', async () => {
    mockDb.reset();
    mockDb.seed('user', [
      {
        userId: USER_ID,
        createdAt: '2026-09-01T00:00:00.000Z',
        phone: null,
        passwordHash: null,
        nickname: '花友',
        avatarPath: null,
      },
    ]);

    const service = ReminderService.getInstance();
    // 网格锚定在 day 0：0 → 10 → 20 → 30 …
    const created = await service.create(
      {
        gardenId: 1,
        type: 'water',
        frequency: 'daily',
        time: '08:00',
        intervalValue: 10,
      },
      at(0, 0),
    );
    const id = created.data!.reminderId!;

    const fired: {day: number; scheduledFor: string}[] = [];

    async function tick(from: Date, to: Date, stepMs: number) {
      for (let t = new Date(from); t <= to; t = new Date(t.getTime() + stepMs)) {
        const now = new Date(t);
        const due = await service.listDue(now);
        if (due.length === 0) continue;
        for (const r of due) {
          fired.push({day: dayIndex(now), scheduledFor: r.nextRemindTime});
        }
        await service.markTriggeredMany(
          due.map(r => r.reminderId!),
          now,
        );
      }
    }

    // 第一段：正常运行时触发一次（day 0）
    await tick(at(0, 0), at(5, 0), DAY / 24);
    expect(fired.map(f => f.day)).toEqual([0]);

    // 停机：day 5 → day 25，期间错过 day 10 与 day 20 两次排期
    await tick(at(25, 0), at(35, 0), DAY / 24);

    // 恰好三次触发：day 0、恢复当天的那次补发、以及回到网格的 day 30
    expect(fired.map(f => f.day)).toEqual([0, 25, 30]);

    // 补发的那次带出的是**最早**未处理的那次排期（day 10），不是最近一次
    expect(fired[1].scheduledFor).toBe(localDateTime(at(10, 8)));

    // 关键不变式：带出的排期时刻始终落在原网格上。
    // 注意要看 scheduledFor 而不是触发当天 —— 补发必然发生在恢复那天（day 25），
    // 那天本来就不在网格上；在网格上的是它对应/推进到的排期点。
    for (const f of fired) {
      expect(dayIndex(new Date(f.scheduledFor)) % 10).toBe(0);
    }
    // 恢复后推进到的是原网格的 day 30，而不是从「现在」重算出的 day 35
    expect(fired[fired.length - 1].day).toBe(30);
    expect(fired[fired.length - 1].scheduledFor).toBe(localDateTime(at(30, 8)));
  });

  it('停机期间错过的多次只补发一次（不叠加通知）', async () => {
    mockDb.reset();
    mockDb.seed('user', [
      {
        userId: USER_ID,
        createdAt: '2026-09-01T00:00:00.000Z',
        phone: null,
        passwordHash: null,
        nickname: '花友',
        avatarPath: null,
      },
    ]);

    const service = ReminderService.getInstance();
    await service.create(
      {gardenId: 1, type: 'water', frequency: 'daily', time: '08:00'},
      at(0, 0),
    );

    // 直接跳到 day 10 12:00 才发现
    const now = at(10, 12);
    const due = await service.listDue(now);

    expect(due).toHaveLength(1);
    // 一次 listDue 只产出一次触发，而不是把逾期拆成十来条通知
    expect(due[0].nextRemindTime).toBe(localDateTime(at(0, 8)));

    const info = service.getDueInfo(due[0], now);
    // day 0 08:00 起至 day 10 08:00，共 11 个排期点已过去
    expect(info.missedCount).toBe(11);
    // 补发后回到未来：day 11 08:00
    expect(info.nextAfter).toBe(localDateTime(at(11, 8)));
  });
});

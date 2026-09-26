/**
 * 智慧花园 — 提醒调度引擎（Phase 2 · Day45-46）
 * =============================================
 * 纯函数模块：只做时间推算，不碰数据库、不发通知。
 *
 * ── 核心不变式：网格推进，不漂移 ──
 *
 * 排期点必须沿「上一次排期 + N 天/周/月」这条网格前进。若每次都从「现在」
 * 重算，APP 每重启一次网格就往后飘一次 —— 每天 08:00 的提醒会在几天内
 * 漂到中午。因此推进时传入的基准是**上一次排期时刻**（在网格上），
 * 而不是当前时间。
 *
 * ── 间隔语义 ──
 *
 * intervalValue 的单位跟随 frequency：
 *   daily   + N → 每 N 天的网格点
 *   weekly  + N → 每 N 周的网格点（以 ISO 周为一格，周内可含多天）
 *   monthly + N → 每 N 月的网格点
 * 省略时按 1 处理。
 *
 * ── 逾期策略（Day45-46 决定） ──
 *
 * 补发一次再回网格：逾期只提醒一次，之后把排期推到**严格晚于当前时刻**的
 * 下一个网格点。用户不会漏掉「该浇水了」，也不会被补发的十几条通知轰炸。
 *
 * 时间约定：nextRemindTime 为本地时间 'YYYY-MM-DDTHH:mm:ss'，
 * 与系统通知按本地时区触发保持一致。
 */

import type {ReminderEntity, ReminderFrequency} from '../types';

// ━━━━━ 类型 ━━━━━

/** 调度规则 */
export interface ReminderSchedule {
  frequency: ReminderFrequency;
  /** HH:mm */
  time: string;
  /** 周提醒的星期（ISO 8601：1=周一 … 7=周日） */
  daysOfWeek?: number[] | null;
  /** 月提醒的日期 */
  dayOfMonth?: number | null;
  /**
   * 间隔单位数（frequency 为单位）：daily = 每 N 天，weekly = 每 N 周。
   * 省略或非法时按 1 处理。
   */
  intervalValue?: number | null;
}

/** 一条提醒的到期判定结果 */
export interface DueInfo {
  status: 'upcoming' | 'due' | 'disabled';
  /** 逾期起点：提醒原定的那次时间（仅 status='due' 时有值） */
  overdueSince: string | null;
  /** 从逾期起点到 now 为止一共错过了几次 */
  missedCount: number;
  /** 处理完这次触发后应写入的下一次排期（严格晚于 now） */
  nextAfter: string | null;
}

/** 沿网格回溯的步数上限，防止损坏数据导致死循环 */
const MAX_WALK = 1000;

// ━━━━━ 时间基础操作 ━━━━━

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** 格式化为本地时间 'YYYY-MM-DDTHH:mm:ss' */
export function formatLocalDateTime(d: Date): string {
  return (
    `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}` +
    `T${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`
  );
}

/** 解析本地时间 'YYYY-MM-DDTHH:mm:ss'；非法输入返回 null */
export function parseLocalDateTime(value: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(
    value ?? '',
  );
  if (!m) return null;

  const [, y, mo, d, h, mi, s] = m.map(Number) as unknown as number[];
  const date = new Date(y, mo - 1, d, h, mi, s ?? 0, 0);
  if (Number.isNaN(date.getTime())) return null;

  // 拒绝 2026-13-45 这类会被 Date 静默进位的输入
  if (date.getMonth() !== mo - 1 || date.getDate() !== d) return null;

  return date;
}

/** ISO 8601 星期编号：1=周一 … 7=周日 */
function isoWeekday(d: Date): number {
  const w = d.getDay(); // 0=周日
  return w === 0 ? 7 : w;
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** 当周周一（ISO 周的第一天） */
function startOfIsoWeek(d: Date): Date {
  const day = startOfDay(d);
  return addDays(day, -(isoWeekday(day) - 1));
}

function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

function atTime(d: Date, hours: number, minutes: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), hours, minutes, 0, 0);
}

/** 把库里的 "2,4,6" 还原为 [2,4,6] */
export function parseStoredDaysOfWeek(stored: string | null | undefined): number[] {
  if (!stored) return [];
  return stored
    .split(',')
    .map(s => Number(s.trim()))
    .filter(n => Number.isInteger(n) && n >= 1 && n <= 7);
}

/** 从实体还原调度规则 */
export function toSchedule(reminder: ReminderEntity): ReminderSchedule {
  return {
    frequency: reminder.frequency,
    time: reminder.time,
    daysOfWeek: parseStoredDaysOfWeek(reminder.daysOfWeek),
    dayOfMonth: reminder.dayOfMonth,
    intervalValue: reminder.intervalValue,
  };
}

// ━━━━━ 下一次排期 ━━━━━

/**
 * 计算严格晚于 `from` 的下一个排期点。
 *
 * `from` 在网格上时即为「网格推进」（不漂移）；`from` 不在网格上时
 * （如首次设置、逾期回网格）即为「以 from 所在的天/周/月为锚点取下一个网格点」。
 *
 * @returns 下一次排期时刻；保证 > from
 */
export function nextOccurrence(schedule: ReminderSchedule, from: Date): Date {
  const [hours, minutes] = schedule.time.split(':').map(Number);
  const today = startOfDay(from);
  const step = Math.max(1, Math.floor(schedule.intervalValue ?? 1));

  if (schedule.frequency === 'daily') {
    for (let k = 0; k <= 1; k++) {
      const candidate = atTime(addDays(today, k * step), hours, minutes);
      if (candidate > from) return candidate;
    }
    return atTime(addDays(today, 2 * step), hours, minutes);
  }

  if (schedule.frequency === 'weekly') {
    const days = schedule.daysOfWeek ?? [];
    if (days.length === 0) {
      // 理论上不会出现（Service 校验保证周提醒必有星期），保守兜底为一周后
      return atTime(addDays(today, 7 * step), hours, minutes);
    }

    const anchorMonday = startOfIsoWeek(from);
    for (let k = 0; k <= 60; k++) {
      const weekMonday = addDays(anchorMonday, k * step * 7);
      for (let d = 0; d < 7; d++) {
        const day = addDays(weekMonday, d);
        if (!days.includes(isoWeekday(day))) continue;
        const candidate = atTime(day, hours, minutes);
        if (candidate > from) return candidate;
      }
    }
    return atTime(addDays(today, 7 * step), hours, minutes);
  }

  // monthly
  const targetDay = schedule.dayOfMonth ?? 1;
  for (let k = 0; k <= 24; k++) {
    const monthStart = new Date(from.getFullYear(), from.getMonth() + k * step, 1);
    // new Date(y, m + 1, 0) = 当月最后一天，用于钳制 2 月 30/31 号这类日期
    const lastDayOfMonth = new Date(
      monthStart.getFullYear(),
      monthStart.getMonth() + 1,
      0,
    ).getDate();
    const day = Math.min(targetDay, lastDayOfMonth);
    const candidate = atTime(
      new Date(monthStart.getFullYear(), monthStart.getMonth(), day),
      hours,
      minutes,
    );
    if (candidate > from) return candidate;
  }
  return atTime(addDays(today, 1), hours, minutes);
}

/**
 * 计算严格晚于 `from` 的下一次排期，返回本地时间字符串。
 * @param from 基准时刻，默认当前时间
 */
export function computeNextRemindTime(
  schedule: ReminderSchedule,
  from: Date = new Date(),
): string {
  return formatLocalDateTime(nextOccurrence(schedule, from));
}

// ━━━━━ 网格前进 ━━━━━

/**
 * 从 `start` 沿网格前进，直到严格晚于 `now`。
 *
 * 与 `nextOccurrence(schedule, now)` 的区别：后者以 now 所在的天/周/月为锚点，
 * 会**重置网格**；本函数从 `start` 出发连续推进，保住原有网格。
 * 「每 10 天浇一次」的网格锚在 09-11 时，逾期到 09-25 应回到 10-01，
 * 而不是以 09-25 为锚点漂到 10-05。
 *
 * 至少前进一步 —— 这样即使通知早到几秒（start 仍晚于 now），
 * 本次排期也会被正确消耗掉，不会重复触发。
 *
 * @returns next = 第一个严格晚于 now 的网格点；steps = 消耗掉的排期次数
 */
export function walkForward(
  schedule: ReminderSchedule,
  start: Date,
  now: Date,
): {next: Date; steps: number} {
  let cursor = start;
  let steps = 0;

  do {
    cursor = nextOccurrence(schedule, cursor);
    steps++;
  } while (cursor <= now && steps < MAX_WALK);

  return {next: cursor, steps};
}

// ━━━━━ 到期判定 ━━━━━

/**
 * 判定一条提醒当前的状态。
 *
 * 逾期时沿网格从 nextRemindTime 走到现在，统计错过次数，
 * 并给出「补发一次后应回填的下一次排期」（严格晚于 now）。
 */
export function resolveDue(reminder: ReminderEntity, now: Date): DueInfo {
  if (!reminder.enabled) {
    return {status: 'disabled', overdueSince: null, missedCount: 0, nextAfter: null};
  }

  const schedule = toSchedule(reminder);
  const next = parseLocalDateTime(reminder.nextRemindTime);

  if (!next) {
    // 数据损坏：当作已到期，按基准重算排期，避免这条提醒永久卡死
    return {
      status: 'due',
      overdueSince: reminder.nextRemindTime ?? null,
      missedCount: 0,
      nextAfter: computeNextRemindTime(schedule, now),
    };
  }

  if (next > now) {
    return {status: 'upcoming', overdueSince: null, missedCount: 0, nextAfter: null};
  }

  // 从存储的排期点沿网格走到未来：steps 恰好等于错过的次数
  const {next: after, steps} = walkForward(schedule, next, now);

  return {
    status: 'due',
    overdueSince: reminder.nextRemindTime,
    missedCount: steps,
    nextAfter: formatLocalDateTime(after),
  };
}

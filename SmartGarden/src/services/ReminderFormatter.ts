/**
 * 智慧花园 — 提醒展示格式化（Phase 2 · Day47-48）
 * ==============================================
 * ReminderPrefill（中文文本 → 调度规则）的**逆向**：把调度规则还原成
 * 人类可读的中文描述，供提醒列表直接渲染。
 *
 *   {frequency:'weekly', daysOfWeek:[2,4,6], time:'08:00'} → '每周二/四/六 08:00'
 *   {frequency:'daily',  intervalValue:10,  time:'08:00'} → '每 10 天 08:00'
 *
 * 纯函数，不碰数据库。星期编号沿用 ISO 8601（1=周一 … 7=周日），
 * 与 ReminderPrefill / ReminderScheduler 保持一致。
 *
 * 注意：这里只做「规则 → 文本」的单向翻译，不做节流/去重之类的调度判断。
 */

import type {ReminderType} from '../types';
import type {ReminderSchedule} from './ReminderScheduler';

// ━━━━━ 常量 ━━━━━

/** 提醒类型的中文标签 */
export const REMINDER_TYPE_LABELS: Record<ReminderType, string> = {
  water: '浇水',
  fertilize: '施肥',
  pest: '除虫',
  check: '检查',
};

/** ISO 星期 → 中文 */
const WEEKDAY_LABELS: Record<number, string> = {
  1: '周一',
  2: '周二',
  3: '周三',
  4: '周四',
  5: '周五',
  6: '周六',
  7: '周日',
};

// ━━━━━ 内部辅助 ━━━━━

/** 合法的间隔单位数，非法值一律按 1 处理 */
function normalizeInterval(value: number | null | undefined): number {
  const n = Math.floor(value ?? 1);
  return Number.isFinite(n) && n >= 1 ? n : 1;
}

/**
 * 展开星期：'周二/四/六'
 * 首个保留「周」前缀，其余去掉，避免出现「周二/周四/周六」的啰嗦写法。
 */
function describeWeekdays(days: number[] | null | undefined): string {
  const valid = [...new Set(days ?? [])]
    .filter(d => Number.isInteger(d) && d >= 1 && d <= 7)
    .sort((a, b) => a - b);

  if (valid.length === 0) return '';

  return valid
    .map((d, i) => (i === 0 ? WEEKDAY_LABELS[d] : WEEKDAY_LABELS[d].slice(1)))
    .join('/');
}

// ━━━━━ 公开 API ━━━━━

/**
 * 把调度规则描述成中文文本。
 *
 * - daily  + 间隔 1  → '每天 08:00'
 * - daily  + 间隔 10 → '每 10 天 08:00'
 * - weekly + [2,4,6] → '每周二/四/六 08:00'
 * - weekly + 间隔 2  → '每 2 周周二 08:00'
 * - monthly + 1 日   → '每月 1 日 09:00'
 * - monthly + 间隔 3 → '每 3 个月 1 日 09:00'
 */
export function describeSchedule(schedule: ReminderSchedule): string {
  const {frequency, time} = schedule;
  const interval = normalizeInterval(schedule.intervalValue);

  if (frequency === 'daily') {
    return interval === 1 ? `每天 ${time}` : `每 ${interval} 天 ${time}`;
  }

  if (frequency === 'weekly') {
    const days = describeWeekdays(schedule.daysOfWeek);

    // 间隔为 1 时前缀只留「每」，否则会拼出「每周周二/四/六」
    if (!days) return `${interval === 1 ? '每周' : `每 ${interval} 周`} ${time}`;
    return `${interval === 1 ? '每' : `每 ${interval} 周`}${days} ${time}`;
  }

  // monthly
  const prefix = interval === 1 ? '每月' : `每 ${interval} 个月`;
  const day = schedule.dayOfMonth ?? 1;
  return `${prefix} ${day} 日 ${time}`;
}

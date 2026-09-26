/**
 * 智慧花园 — 预填规则解析（Phase 2 · Day43-44）
 * ============================================
 * 把养护指南里的**中文频率文本**翻译成可调度的提醒规则。
 *
 * 真实数据形态（assets/care/ 54 份 JSON）比架构文档的示例复杂得多：
 *   1. 按季节分段："春秋每周2次，夏季每周3次，冬季每周1次"
 *      → 必须先按当前月份选段，文档里的 "每周2-3次" 只是其中一段
 *   2. 季节可以用季节字（春秋/夏季/冬季）表示，也可以用月份区间表示
 *      "生长期（4-9月）每月施1次，冬季停肥"
 *   3. 区间值："每周2-3次"（次数区间）、"每7-10天1次"（间隔区间）
 *   4. 显式无需操作："冬季停肥"、"冬季每月1次或不浇"
 *   5. 限定性括号："（高温半休眠期控水防烂根）" —— 应剥离，不是适用窗口
 *
 * 设计约定：
 *   - 次数区间（每周2-3次）取**上限**——与架构文档 "每周2-3次 → 周二/四/六" 一致
 *   - 间隔区间（每7-10天1次）取**中值向下取整**——文档未规定，取中性值
 *   - 括号内含「N月」或「N-M月」时视为适用窗口，否则视为限定语剥离
 *   - 分句都不覆盖当前月份 → 「该月无需操作」，而非「解析失败」
 *
 * 不生成提醒：光照（lighting）——架构文档 5.5.1 明确「光照不需要提醒」
 */

import type {CareGuide, ReminderFrequency, ReminderType} from '../types';

// ━━━━━ 常量 ━━━━━

/** 三类提醒的默认时间（架构文档 5.5.1 预览页示例） */
export const DEFAULT_REMINDER_TIMES: Record<string, string> = {
  water: '08:00',
  fertilize: '09:00',
  check: '10:00',
};

/** 季节字 → 覆盖月份 */
const SEASON_MONTHS: Record<string, number[]> = {
  春: [3, 4, 5],
  夏: [6, 7, 8],
  秋: [9, 10, 11],
  冬: [12, 1, 2],
};

/** 周提醒起始星期：周二（与架构文档示例一致） */
const WEEK_START = 2;

/** 分句分隔符（全角/半角逗号、顿号、分号） */
const CLAUSE_SEPARATORS = /[，,、;；]/;

/** 数字区间连接符 */
const RANGE_DASH = '[-–—~]';

/** 表示「该季节无需此项操作」的措辞 */
const NO_OP_WORDS = /停\s*(肥|施|水)|不浇|不需|无需|无须|控水/;

// ━━━━━ 导出类型 ━━━━━

/** 成功解析出的调度规则 */
export interface ScheduleSpec {
  kind: 'schedule';
  frequency: ReminderFrequency;
  /** 周提醒的星期（ISO 8601：1=周一 … 7=周日） */
  daysOfWeek?: number[];
  /** 月提醒的日期 */
  dayOfMonth?: number;
  /** 间隔单位数（frequency 为单位）：daily=每 N 天，weekly=每 N 周 */
  intervalValue: number;
}

/** 该季节明确无需操作（停肥 / 不浇） */
export interface NoReminderSpec {
  kind: 'none';
}

/**
 * 解析结果：
 *   schedule — 可调度的规则
 *   none     — 该月份无需提醒
 *   null     — 无法解析
 */
export type FrequencyParseResult = ScheduleSpec | NoReminderSpec | null;

/** 供批量创建使用的一条提醒规格（不含 gardenId / userId） */
export interface ReminderSpec {
  type: ReminderType;
  frequency: ReminderFrequency;
  time: string;
  daysOfWeek?: number[];
  dayOfMonth?: number;
  intervalValue?: number;
  title?: string;
}

// ━━━━━ 星期展开 ━━━━━

/**
 * 把「每周 N 次」展开成具体星期。
 *
 * 起始周二，步长 floor(7/N)，因此：
 *   N=1 → [2]         N=2 → [2,5]        N=3 → [2,4,6]（文档给定示例）
 *   N=7 → [1..7]      超过 7 次封顶为 7 天
 */
export function weekdaysForCount(count: number): number[] {
  const n = Math.max(1, Math.min(7, Math.floor(count)));
  const step = Math.max(1, Math.floor(7 / n));

  const days = new Set<number>();
  for (let i = 0; i < n; i++) {
    // 0-based 位置换算回 ISO 星期
    days.add(((WEEK_START - 1 + i * step) % 7) + 1);
  }
  return [...days].sort((a, b) => a - b);
}

// ━━━━━ 分句与季节选择 ━━━━━

function rangeOf(from: number, to: number): number[] {
  const months: number[] = [];
  for (let m = from; m <= to; m++) months.push(m);
  return months;
}

/**
 * 推断某个分句适用的月份。
 * @returns 月份数组；null 表示通年适用；空数组表示无法判断
 */
function applicableMonths(clause: string): number[] | null {
  // 括号内的月份区间优先：「生长期（4-9月）」
  const rangeMatch = clause.match(
    new RegExp(`[（(]\\s*(\\d{1,2})\\s*${RANGE_DASH}\\s*(\\d{1,2})\\s*月\\s*[）)]`),
  );
  if (rangeMatch) return rangeOf(Number(rangeMatch[1]), Number(rangeMatch[2]));

  const singleMatch = clause.match(/[（(]\s*(\d{1,2})\s*月\s*[）)]/);
  if (singleMatch) return [Number(singleMatch[1])];

  // 开头的季节字：「春秋每周2次」「冬季停肥」
  const seasonMatch = clause.match(/^\s*((?:[春夏秋冬]季?)+)/);
  if (seasonMatch) {
    const months = new Set<number>();
    for (const ch of seasonMatch[1]) {
      const monthsOfSeason = SEASON_MONTHS[ch];
      if (monthsOfSeason) monthsOfSeason.forEach(m => months.add(m));
    }
    if (months.size > 0) return [...months].sort((a, b) => a - b);
  }

  return null; // 通年
}

/**
 * 按分句分隔符切分文本，但**不切断括号内部**。
 *
 * 真实数据里有 "夏季每周2-3次（盛花旺季蒸发大，视盆土干透而定）"，
 * 括号内的全角逗号若参与切分，会把这段拦腰截断。
 */
function splitClauses(text: string): string[] {
  const clauses: string[] = [];
  let depth = 0;
  let current = '';

  for (const ch of text) {
    if (ch === '（' || ch === '(') depth++;
    else if (ch === '）' || ch === ')') depth = Math.max(0, depth - 1);

    if (depth === 0 && CLAUSE_SEPARATORS.test(ch)) {
      if (current.trim()) clauses.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  if (current.trim()) clauses.push(current.trim());

  return clauses;
}

// ━━━━━ 频率表达式解析 ━━━━━

/** 间隔区间的取值策略：中值向下取整（文档未规定，取中性值） */
function midInterval(from: number, to: number): number {
  return Math.floor((from + to) / 2);
}

/** 剥离所有括号及其内容（限定语，不是适用窗口） */
function stripParentheticals(text: string): string {
  return text.replace(/[（(][^）)]*[）)]/g, ' ');
}

function parseExpression(clause: string): FrequencyParseResult {
  const body = stripParentheticals(clause);

  // ── 每 N-M 天 1 次 / 每 N 天 1 次 ──
  let m = body.match(new RegExp(`每\\s*(\\d+)\\s*${RANGE_DASH}\\s*(\\d+)\\s*天`));
  if (m) {
    return {
      kind: 'schedule',
      frequency: 'daily',
      intervalValue: midInterval(Number(m[1]), Number(m[2])),
    };
  }
  m = body.match(/每\s*(\d+)\s*天/);
  if (m) {
    return {kind: 'schedule', frequency: 'daily', intervalValue: Number(m[1])};
  }

  // ── 每 N-M 周 1 次 / 每 N 周 1 次 ──
  m = body.match(new RegExp(`每\\s*(\\d+)\\s*${RANGE_DASH}\\s*(\\d+)\\s*周`));
  if (m) {
    return {
      kind: 'schedule',
      frequency: 'weekly',
      intervalValue: midInterval(Number(m[1]), Number(m[2])),
      daysOfWeek: weekdaysForCount(1),
    };
  }
  m = body.match(/每\s*(\d+)\s*周/);
  if (m) {
    return {
      kind: 'schedule',
      frequency: 'weekly',
      intervalValue: Number(m[1]),
      daysOfWeek: weekdaysForCount(1),
    };
  }

  // ── 每 N-M 月 1 次 / 每 N 月 1 次（如「每2-3月施1次缓释肥」） ──
  m = body.match(new RegExp(`每\\s*(\\d+)\\s*${RANGE_DASH}\\s*(\\d+)\\s*月`));
  if (m) {
    return {
      kind: 'schedule',
      frequency: 'monthly',
      dayOfMonth: 1,
      intervalValue: midInterval(Number(m[1]), Number(m[2])),
    };
  }
  m = body.match(/每\s*(\d+)\s*月/);
  if (m) {
    return {
      kind: 'schedule',
      frequency: 'monthly',
      dayOfMonth: 1,
      intervalValue: Number(m[1]),
    };
  }

  // ── 每天 / 每日 N 次 ──
  if (/每\s*[天日]/.test(body)) {
    return {kind: 'schedule', frequency: 'daily', intervalValue: 1};
  }

  // ── 早晚各 1 次（一天多次，但提醒模型只有单个时间点） ──
  if (/早晚/.test(body)) {
    return {kind: 'schedule', frequency: 'daily', intervalValue: 1};
  }

  // ── 每周 N-M 次 / 每周 N 次（取上限次数） ──
  m = body.match(new RegExp(`每周\\s*(\\d+)\\s*${RANGE_DASH}\\s*(\\d+)\\s*次`));
  if (m) {
    return {
      kind: 'schedule',
      frequency: 'weekly',
      intervalValue: 1,
      daysOfWeek: weekdaysForCount(Number(m[2])),
    };
  }
  m = body.match(/每周\s*(\d+)\s*次/);
  if (m) {
    return {
      kind: 'schedule',
      frequency: 'weekly',
      intervalValue: 1,
      daysOfWeek: weekdaysForCount(Number(m[1])),
    };
  }
  if (/每周/.test(body)) {
    return {
      kind: 'schedule',
      frequency: 'weekly',
      intervalValue: 1,
      daysOfWeek: weekdaysForCount(1),
    };
  }

  // ── 每月 N 次 / 每月 N-M 次（架构文档：「每月1次」→ 每月 1 号） ──
  if (/每月/.test(body)) {
    return {
      kind: 'schedule',
      frequency: 'monthly',
      dayOfMonth: 1,
      intervalValue: 1,
    };
  }

  // ── 明确无需操作（停水 / 控水 / 不浇 / 不需施肥…） ──
  // 注意顺序：上面可量化的频率优先，因此
  // 「夏季每周1次或更少（高温半休眠期控水防烂根）」仍解析为每周
  if (NO_OP_WORDS.test(body)) {
    return {kind: 'none'};
  }

  // ── 兜底：指定月份内的「追 N 次」「施 N 次」→ 该月提醒一次 ──
  // 如「花后（5月）追肥1次」「全年施3次肥：花前（3月）…」
  m = body.match(/(\d+)\s*次/);
  if (m) {
    return {
      kind: 'schedule',
      frequency: 'monthly',
      dayOfMonth: 1,
      intervalValue: 1,
    };
  }

  return null;
}

// ━━━━━ 公开 API ━━━━━

/**
 * 解析一条中文频率文本，得出适用于指定月份的调度规则。
 *
 * 候选分句的尝试顺序：
 *   1. 覆盖当前月份的季节分句，**月份范围最窄者优先**（更具体者胜）
 *   2. 未限定季节的通年分句
 * 遇到第一个能解析出结果（schedule 或 none）的分句即返回。
 *
 * 全部候选都无法量化时：只要存在季节分句，就判定「该月无需操作」而非解析失败——
 * 真实数据里 "秋季逐渐减少"、"冬季控水" 这类定性描述量化不了，
 * 此时不该凭空造一个频率，也不该把整段判为不可用。
 *
 * @param text  频率文本，如 "春秋每周2次，夏季每周3次，冬季每周1次"
 * @param month 当前月份 1-12，用于选择季节分段
 * @returns schedule / none / null（确实无法解析）
 */
export function parseFrequencyText(
  text: string,
  month: number,
): FrequencyParseResult {
  if (!text || !text.trim()) return null;

  const clauses = splitClauses(text);
  if (clauses.length === 0) return null;

  const annotated = clauses.map(clause => ({
    months: applicableMonths(clause),
    result: parseExpression(clause),
  }));

  const seasonal = annotated
    .filter(a => a.months !== null)
    .sort((a, b) => a.months!.length - b.months!.length);
  const yearRound = annotated.filter(a => a.months === null);

  for (const a of seasonal) {
    if (a.months!.includes(month) && a.result) return a.result;
  }
  for (const a of yearRound) {
    if (a.result) return a.result;
  }

  return seasonal.length > 0 ? {kind: 'none'} : null;
}

/**
 * 依据养护指南生成「一键设置提醒」的预填规格。
 *
 * 规则（架构文档 5.5.1 预填规则表）：
 *   - watering.frequency    → type=water
 *   - fertilizing.period    → type=fertilize
 *   - pests 非空            → type=check（无明确周期时默认每月）
 *   - lighting              → 不生成提醒
 *
 * @param guide 养护指南
 * @param opts  month 覆盖当前月份（默认取系统月份）；time 覆盖三类默认时间
 */
export function buildPrefilledReminders(
  guide: CareGuide,
  opts: {month?: number; time?: string} = {},
): ReminderSpec[] {
  const month = opts.month ?? new Date().getMonth() + 1;
  const specs: ReminderSpec[] = [];

  const push = (
    type: ReminderType,
    result: FrequencyParseResult,
    defaultTime: string,
    label: string,
  ) => {
    if (!result || result.kind !== 'schedule') return;
    specs.push({
      type,
      frequency: result.frequency,
      time: opts.time ?? defaultTime,
      daysOfWeek: result.daysOfWeek,
      dayOfMonth: result.dayOfMonth,
      intervalValue: result.intervalValue,
      title: `${guide.flowerName} ${label}`,
    });
  };

  push(
    'water',
    parseFrequencyText(guide.watering?.frequency ?? '', month),
    DEFAULT_REMINDER_TIMES.water,
    '浇水',
  );

  push(
    'fertilize',
    parseFrequencyText(guide.fertilizing?.period ?? '', month),
    DEFAULT_REMINDER_TIMES.fertilize,
    '施肥',
  );

  // 检查：有病虫害信息才值得提醒；无明确周期时默认每月 1 号
  if (guide.pests && guide.pests.length > 0) {
    specs.push({
      type: 'check',
      frequency: 'monthly',
      time: opts.time ?? DEFAULT_REMINDER_TIMES.check,
      dayOfMonth: 1,
      intervalValue: 1,
      title: `${guide.flowerName} 检查`,
    });
  }

  return specs;
}

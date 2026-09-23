/**
 * ReminderRuleParser — 自然语言频率 → 结构化提醒规则解析器
 *
 * 输入：养护指南 JSON 中的 frequency 字段（如 "每周2-3次"、
 *       "春秋每周2-3次，夏季每天1次，冬季每周1-2次"）
 * 输出：可被 ReminderService 消费的结构化提醒规则数组
 *
 * 设计思路：
 *  1. 按逗号切分季节分句 → 每个分句对应一个季节规则
 *  2. 每个分句内，先识别季节前缀 → 再提取频率数值
 *  3. 频率数值映射为周期类型 + 间隔天数
 *  4. 标注 confidence，低置信度时提醒 UI 让用户手动确认
 */

// ━━━ 类型 ━━━

export type Season = 'spring' | 'summer' | 'autumn' | 'winter' | 'yearRound';
export type PeriodType =
  | 'daily'
  | 'weekly'
  | 'everyNDays'
  | 'monthly'
  | 'yearly'
  | 'irregular';

export interface ReminderRule {
  /** 适用季节 */
  season: Season;
  /** 周期类型 */
  periodType: PeriodType;
  /** 间隔天数（daily=1, weekly=7, everyNDays=N, monthly=30, yearly=365） */
  intervalDays: number;
  /** 每周第几天（仅 weekly 时有值，0=周一 … 6=周日） */
  weekdays?: number[];
  /** 每月第几天（仅 monthly 时有值） */
  monthDays?: number[];
  /** 原文本片段（用于 UI 展示） */
  rawText: string;
  /** 解析置信度 0-1，低于 0.7 时 UI 应提示用户确认 */
  confidence: number;
}

export interface ReminderTask {
  /** 任务类型：浇水 / 施肥 / 检查 */
  taskType: 'water' | 'fertilize' | 'check';
  /** 花卉名称 */
  flowerName: string;
  /** 解析后的提醒规则（可能有多条，对应不同季节） */
  rules: ReminderRule[];
}

// ━━━ 工具函数 ━━━

/** 把 "2-3" 范围转成中位数，把 "2" 转成 2 */
function medianRange(text: string): number {
  const parts = text.split(/[-~到]/);
  if (parts.length === 1) return parseInt(parts[0], 10);
  const a = parseInt(parts[0], 10);
  const b = parseInt(parts[1], 10);
  return Math.round((a + b) / 2);
}

/** 根据每周次数生成均匀分布的星期数组 */
function distributeWeekdays(count: number): number[] {
  // 0=周一 … 6=周日，均匀分布
  if (count <= 0) return [];
  if (count >= 7) return [0, 1, 2, 3, 4, 5, 6];
  const step = 7 / count;
  const result: number[] = [];
  for (let i = 0; i < count; i++) {
    result.push(Math.round(i * step));
  }
  return result;
}

/** 把中文季节词映射到 Season 枚举 */
function matchSeasons(text: string): Season[] | null {
  /** 跨季节组合词 → 展开为具体季节 */
  const crossSeasonMap: Record<string, Season[]> = {
    春秋: ['spring', 'autumn'],
    春夏: ['spring', 'summer'],
    秋冬: ['autumn', 'winter'],
    冬夏: ['winter', 'summer'],
    全年: ['yearRound'],
  };

  if (text in crossSeasonMap) return crossSeasonMap[text];
  if (text === '春') return ['spring'];
  if (text === '夏') return ['summer'];
  if (text === '秋') return ['autumn'];
  if (text === '冬') return ['winter'];
  return null;
}

// ━━━ 核心解析 ━━━

/**
 * 从一个分句中提取频率数值和周期类型
 *
 * 支持的格式（按优先级从高到低匹配）：
 *   - "每天1次" / "每日1次" / "早晚各1次"    → daily
 *   - "每周2-3次" / "每周1次"               → weekly
 *   - "每2周1次" / "每2-3周1次"              → everyNDays (14/21天)
 *   - "每7-10天1次" / "每10-15天1次"         → everyNDays
 *   - "每月1次" / "每月1-2次"                → monthly
 *   - "每2年1次" / "每年1次"                 → yearly
 */
function parseFrequencyClause(clause: string): ReminderRule[] {
  const rawClause = clause.trim();
  // 先剥掉括号里的补充说明（不影响频率判断）
  const cleaned = rawClause.replace(/[（(][^)）]*[)）]/g, '').trim();

  // 识别季节前缀 → 可能是 ['spring', 'autumn'] 这种跨季节
  let seasons: Season[] = ['yearRound'];
  let afterSeasonText = cleaned;

  const seasonMatch = cleaned.match(/^(春秋|春夏|秋冬|冬夏|全年|春|夏|秋|冬)/);
  if (seasonMatch) {
    const matched = seasonMatch[1];
    seasons = matchSeasons(matched) ?? ['yearRound'];
    afterSeasonText = cleaned.substring(matched.length).trim();
    afterSeasonText = afterSeasonText.replace(/^季/, '').trim();
  }

  // 内部函数：构建基础规则（不含 season）
  const buildBaseRule = (
    periodType: PeriodType,
    intervalDays: number,
    extra: Partial<ReminderRule> = {},
  ): Omit<ReminderRule, 'season'> => ({
    periodType,
    intervalDays,
    rawText: rawClause,
    confidence: 1.0,
    ...extra,
  });

  let base: Omit<ReminderRule, 'season'> | null = null;

  // ── 1. 每天/每日 ──
  if (/每天|每日/.test(afterSeasonText)) {
    base = buildBaseRule('daily', 1);
  }

  // ── 2. 每周 N 次 ──
  const weeklyMatch = afterSeasonText.match(
    /每周\s*(\d)\s*[-~到至]?\s*(\d)?\s*次/,
  );
  if (weeklyMatch) {
    const count = weeklyMatch[2]
      ? medianRange(`${weeklyMatch[1]}-${weeklyMatch[2]}`)
      : parseInt(weeklyMatch[1], 10);
    base = buildBaseRule('weekly', 7, {
      weekdays: distributeWeekdays(count),
    });
  }

  // ── 3. 每 N 周 1 次 ──
  const everyWeeksMatch = afterSeasonText.match(
    /每\s*(\d)\s*[-~到至]?\s*(\d)?\s*周\s*1?\s*次/,
  );
  if (everyWeeksMatch) {
    const weeks = everyWeeksMatch[2]
      ? medianRange(`${everyWeeksMatch[1]}-${everyWeeksMatch[2]}`)
      : parseInt(everyWeeksMatch[1], 10);
    base = buildBaseRule('everyNDays', weeks * 7, { confidence: 0.95 });
  }

  // ── 4. 每 N 天 1 次 ──
  const everyDaysMatch = afterSeasonText.match(
    /每\s*(\d+)\s*[-~到至]?\s*(\d+)?\s*天\s*1?\s*次/,
  );
  if (everyDaysMatch) {
    const days = everyDaysMatch[2]
      ? medianRange(`${everyDaysMatch[1]}-${everyDaysMatch[2]}`)
      : parseInt(everyDaysMatch[1], 10);
    base = buildBaseRule('everyNDays', days);
  }

  // ── 5. 每月 N 次 ──
  const monthlyMatch = afterSeasonText.match(
    /每月\s*(\d)\s*[-~到至]?\s*(\d)?\s*次/,
  );
  if (monthlyMatch) {
    const count = monthlyMatch[2]
      ? medianRange(`${monthlyMatch[1]}-${monthlyMatch[2]}`)
      : parseInt(monthlyMatch[1], 10);
    const interval = Math.round(30 / count);
    base = buildBaseRule('monthly', interval, { confidence: 0.9 });
  }

  // ── 6. 每年 / 每 N 年 ──
  const yearlyMatch = afterSeasonText.match(
    /每\s*(\d)\s*[-~到至]?\s*(\d)?\s*年/,
  );
  if (yearlyMatch) {
    const years = yearlyMatch[2]
      ? medianRange(`${yearlyMatch[1]}-${yearlyMatch[2]}`)
      : parseInt(yearlyMatch[1], 10);
    base = buildBaseRule('yearly', years * 365, { confidence: 0.85 });
  } else if (/每年/.test(afterSeasonText)) {
    base = buildBaseRule('yearly', 365, { confidence: 0.85 });
  }

  // ── 7. 无法识别 ──
  if (!base) {
    base = buildBaseRule('irregular', 0, { confidence: 0.3 });
  }

  // 按 seasons 展开成多条规则
  return seasons.map(season => ({ ...base!, season }));
}

// ━━━ 公开 API ━━━

/**
 * 解析 watering.frequency 文本 → 多条分季节提醒规则
 *
 * @param frequencyText 养护 JSON 中的 frequency 字段值
 * @returns 结构化提醒规则数组（空数组 = 无法解析）
 *
 * @example
 *   parseWateringFrequency("春秋每周2-3次，夏季每天1次，冬季每周1-2次")
 *   → [
 *       { season:'spring',   periodType:'weekly', intervalDays:7, weekdays:[0,2,4], confidence:1.0 },
 *       { season:'summer',   periodType:'daily',  intervalDays:1, confidence:1.0 },
 *       { season:'winter',   periodType:'weekly', intervalDays:7, weekdays:[0,3],   confidence:1.0 },
 *     ]
 *
 *   parseWateringFrequency("每周2-3次")
 *   → [
 *       { season:'yearRound', periodType:'weekly', intervalDays:7, weekdays:[0,2,4], confidence:1.0 },
 *     ]
 */
export function parseWateringFrequency(frequencyText: string): ReminderRule[] {
  if (!frequencyText || typeof frequencyText !== 'string') return [];

  // 按中文逗号、顿号、英文逗号切分季节分句
  const clauses = frequencyText
    .split(/[，、,]/)
    .map(s => s.trim())
    .filter(s => s.length > 0);

  const rules: ReminderRule[] = [];
  for (const clause of clauses) {
    const clauseRules = parseFrequencyClause(clause);
    rules.push(...clauseRules);
  }

  return rules;
}

/**
 * 一键从养护指南 JSON 构建完整的浇水提醒任务
 *
 * @param flowerName 花卉名称
 * @param wateringFrequency 养护 JSON watering.frequency 值
 * @returns 可直接传给 ReminderService 的任务对象
 */
export function buildWateringTask(
  flowerName: string,
  wateringFrequency: string,
): ReminderTask {
  return {
    taskType: 'water',
    flowerName,
    rules: parseWateringFrequency(wateringFrequency),
  };
}

/**
 * 根据当前月份筛选出应该生效的季节规则
 *
 * @param rules parseWateringFrequency 的输出
 * @param month 当前月份 1-12
 * @returns 适用规则（yearRound 规则始终包含）
 */
export function filterActiveRules(
  rules: ReminderRule[],
  month: number = new Date().getMonth() + 1,
): ReminderRule[] {
  const seasonOfMonth = ((): Season => {
    // 气象学季节划分
    if ([3, 4, 5].includes(month)) return 'spring';
    if ([6, 7, 8].includes(month)) return 'summer';
    if ([9, 10, 11].includes(month)) return 'autumn';
    return 'winter';
  })();

  return rules.filter(
    r => r.season === 'yearRound' || r.season === seasonOfMonth,
  );
}

/**
 * 计算某条规则的下次提醒日期
 *
 * @param rule 解析后的提醒规则
 * @param fromDate 基准日期（默认今天）
 * @returns 下次提醒的 Date 对象；irregular 类型返回 null
 */
export function computeNextReminder(
  rule: ReminderRule,
  fromDate: Date = new Date(),
): Date | null {
  if (rule.periodType === 'irregular' || rule.intervalDays <= 0) return null;

  const next = new Date(fromDate);

  if (
    rule.periodType === 'weekly' &&
    rule.weekdays &&
    rule.weekdays.length > 0
  ) {
    // 找下一个匹配的星期
    for (let i = 1; i <= 8; i++) {
      const candidate = new Date(fromDate);
      candidate.setDate(fromDate.getDate() + i);
      const jsDow = candidate.getDay(); // 0=周日 … 6=周六
      // 我们的 weekdays: 0=周一 … 6=周日 → 转换
      const normalizedDow = (jsDow + 6) % 7;
      if (rule.weekdays.includes(normalizedDow)) return candidate;
    }
    return null;
  }

  // 其他类型：直接加 intervalDays
  next.setDate(fromDate.getDate() + rule.intervalDays);
  return next;
}

// ━━━ 调试 / 导出 ━━━

/** 把 ReminderRule 转成可读中文（用于 UI 显示和日志） */
export function ruleToHumanText(rule: ReminderRule): string {
  const seasonMap: Record<Season, string> = {
    spring: '春季',
    summer: '夏季',
    autumn: '秋季',
    winter: '冬季',
    yearRound: '全年',
  };
  const seasonLabel = seasonMap[rule.season];

  let freqText = '';
  switch (rule.periodType) {
    case 'daily':
      freqText = '每天';
      break;
    case 'weekly':
      freqText = `每 ${rule.intervalDays} 天`;
      break;
    case 'everyNDays':
      freqText = `每 ${rule.intervalDays} 天`;
      break;
    case 'monthly':
      freqText = `约每 ${rule.intervalDays} 天`;
      break;
    case 'yearly':
      freqText = `每 ${rule.intervalDays / 365} 年`;
      break;
    default:
      freqText = '参考原文';
  }

  return `[${seasonLabel}] ${freqText}（置信 ${Math.round(
    rule.confidence * 100,
  )}%）`;
}

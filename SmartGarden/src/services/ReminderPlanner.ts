/**
 * ReminderPlanner — 养护提醒计划构建器（Phase 2 第 5 单元）
 *
 * ⚠️ 本文件原名为 ReminderService.ts（见 git 历史 9886dba），已改名以让出该路径。
 *
 * 原因：按开发线路图，`ReminderService.ts` 是 **C 行**的交付物
 * （「实现 ReminderService.ts 基础 CRUD」→ 现已包含 CRUD + 调度 + 持久化）。
 * 本文件是**无状态**的提醒计划构建器，只负责「养护指南 → 可展示的提醒计划」，
 * 不落库、不排期。两者职责不同，故并存并把本文件改名为 ReminderPlanner，
 * 其导出的 `ReminderSchedule` 类型也一并改名 `ReminderPlan`，
 * 以免与 C 行调度层的 `ReminderSchedule`（调度规则）撞名。
 *
 * 功能逻辑未做改动，仅重命名路径与符号。原作者的解析/计划设计保持不变。
 *
 * 职责：
 *   1. 从养护指南 JSON 的 frequency 字段解析出结构化提醒规则
 *   2. 根据规则计算下次提醒日期
 *   3. 提供一键设置提醒的入口（供 B 的提醒 UI 调用）
 *
 * 依赖：ReminderRuleParser（解析器，已完成）
 * 被依赖：B 的 ReminderScreen / ReminderModal
 *
 * TODO（待与 A/B 对齐）：本文件的解析路径与 C 行的 ReminderPrefill 功能重叠，
 * 需要决定统一到哪一份，再接线到 ReminderService 的持久化流程。
 */

import {
  parseWateringFrequency,
  buildWateringTask,
  filterActiveRules,
  computeNextReminder,
  ruleToHumanText,
  type ReminderRule,
  type ReminderTask,
  type Season,
} from './ReminderRuleParser';
import logger from './LoggerService';
import { KnowledgeService } from './KnowledgeService';

// ━━━ 类型 ━━━

export interface ReminderPlan {
  taskType: 'water' | 'fertilize' | 'check';
  flowerName: string;
  /** 适用当前季节的规则 */
  activeRules: ReminderRule[];
  /** 每条规则对应的下次提醒日期 */
  nextReminders: Array<{
    rule: ReminderRule;
    nextDate: Date | null;
  }>;
  /** 是否有低置信度规则（需要用户确认） */
  needsUserConfirmation: boolean;
}

// ━━━ 服务类 ━━━

class ReminderPlannerService {
  /**
   * 一键构建某盆花的浇水提醒计划
   *
   * 典型调用场景：用户在识别结果页点「一键设置浇水提醒」
   *
   * @param flowerName 花卉中文名（需能在知识库中查到）
   * @returns 提醒计划（含下次提醒日期数组）；查不到养护指南时返回 null
   */
  async buildWateringSchedule(
    flowerName: string,
  ): Promise<ReminderPlan | null> {
    // 1. 从知识库拿到 watering.frequency
    const resp = KnowledgeService.getInstance().getCareGuideByName(flowerName);
    if (resp.code !== 0 || !resp.data) {
      logger.warn('ReminderPlanner', `知识库中未找到 ${flowerName} 的养护数据`);
      return null;
    }

    const frequency = resp.data.watering?.frequency;
    if (!frequency) {
      logger.warn('ReminderPlanner', `${flowerName} 缺少 watering.frequency`);
      return null;
    }

    // 2. 解析 frequency 文本
    const allRules = parseWateringFrequency(frequency);
    if (allRules.length === 0) {
      logger.warn('ReminderPlanner', `frequency 无法解析: "${frequency}"`);
      return null;
    }

    // 3. 筛选当前季节适用的规则
    const activeRules = filterActiveRules(allRules);

    // 4. 计算每条规则的下次提醒日期
    const nextReminders = activeRules.map(rule => ({
      rule,
      nextDate: computeNextReminder(rule),
    }));

    // 5. 判断是否需要用户确认（存在低置信度或 irregular 规则）
    const needsUserConfirmation = activeRules.some(
      r => r.confidence < 0.7 || r.periodType === 'irregular',
    );

    logger.info(
      'ReminderPlanner',
      `构建浇水提醒: ${flowerName}`,
      `| 原文: "${frequency}"`,
      `| 规则数: ${activeRules.length}`,
      `| 需确认: ${needsUserConfirmation}`,
    );

    return {
      taskType: 'water',
      flowerName,
      activeRules,
      nextReminders,
      needsUserConfirmation,
    };
  }

  /**
   * 把提醒计划转成 UI 可直接渲染的日期字符串数组
   * （供 B 的提醒预览页使用）
   */
  scheduleToDisplayDates(schedule: ReminderPlan): string[] {
    const fmt = (d: Date) =>
      `${d.getMonth() + 1}月${d.getDate()}日（周${
        '日一二三四五六'[d.getDay()]
      }）`;

    return schedule.nextReminders
      .filter(r => r.nextDate !== null)
      .map(r => `${ruleToHumanText(r.rule)} → ${fmt(r.nextDate!)}`);
  }

  /**
   * 快速测试：直接把 frequency 字符串解析成规则数组（不查知识库）
   * 用于 UI 预览 frequency 解析结果
   */
  previewFrequency(frequencyText: string, month?: number): ReminderRule[] {
    const allRules = parseWateringFrequency(frequencyText);
    return filterActiveRules(allRules, month);
  }

  /** 当前月份对应的季节（供 UI 显示用） */
  currentSeason(): Season {
    const m = new Date().getMonth() + 1;
    if ([3, 4, 5].includes(m)) return 'spring';
    if ([6, 7, 8].includes(m)) return 'summer';
    if ([9, 10, 11].includes(m)) return 'autumn';
    return 'winter';
  }
}

export const ReminderPlanner = new ReminderPlannerService();
export default ReminderPlanner;

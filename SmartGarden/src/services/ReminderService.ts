/**
 * ReminderService — 养护提醒服务（Phase 2 第 5 单元交付物）
 *
 * 职责：
 *   1. 从养护指南 JSON 的 frequency 字段解析出结构化提醒规则
 *   2. 根据规则计算下次提醒日期
 *   3. 提供一键设置提醒的入口（供 B 的提醒 UI 调用）
 *
 * 依赖：ReminderRuleParser（解析器，已完成）
 * 被依赖：B 的 ReminderScreen / ReminderModal
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

export interface ReminderSchedule {
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

class ReminderServiceSingleton {
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
  ): Promise<ReminderSchedule | null> {
    // 1. 从知识库拿到 watering.frequency
    const resp = KnowledgeService.getInstance().getCareGuideByName(flowerName);
    if (resp.code !== 0 || !resp.data) {
      logger.warn('ReminderService', `知识库中未找到 ${flowerName} 的养护数据`);
      return null;
    }

    const frequency = resp.data.watering?.frequency;
    if (!frequency) {
      logger.warn('ReminderService', `${flowerName} 缺少 watering.frequency`);
      return null;
    }

    // 2. 解析 frequency 文本
    const allRules = parseWateringFrequency(frequency);
    if (allRules.length === 0) {
      logger.warn('ReminderService', `frequency 无法解析: "${frequency}"`);
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
      'ReminderService',
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
   * 把 ReminderSchedule 转成 UI 可直接渲染的日期字符串数组
   * （供 B 的提醒预览页使用）
   */
  scheduleToDisplayDates(schedule: ReminderSchedule): string[] {
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

export const ReminderService = new ReminderServiceSingleton();
export default ReminderService;

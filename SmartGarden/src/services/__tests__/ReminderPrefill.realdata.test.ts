/**
 * ReminderPrefill 真实数据全量测试
 * ================================
 * 对 assets/care/ 的全部养护 JSON 逐月在位跑一遍解析，断言**没有一份指南解析失败**。
 *
 * 为什么要有这一层：单元测试的用例是人挑的，覆盖不到真实数据的措辞多样性。
 * 这个文件曾经一次性暴露 108/648 处失败（"秋季逐渐减少"、"冬季控水"、
 * "每2-3月施1次"、"花后（5月）追肥1次"、括号内逗号截断分句等）。
 *
 * 断言策略：解析结果必须是 schedule 或 none，**不允许 null**。
 * 团队新增养护 JSON 时若引入没覆盖的措辞，这里会失败并指名道姓地报出
 * 是哪份指南的哪段文本——这是刻意的：静默地不产生提醒，比测试失败糟糕得多。
 */

import {careGuides} from '../../../assets/care';
import {parseFrequencyText, buildPrefilledReminders} from '../ReminderPrefill';
import type {CareGuide} from '../../types';

const guides = Object.values(careGuides) as CareGuide[];
const MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

describe('ReminderPrefill — 真实数据全量', () => {
  it('养护数据非空', () => {
    expect(guides.length).toBeGreaterThan(0);
  });

  it('浇水的每一条频率文本在每个月份都能解析', () => {
    const failures: string[] = [];

    for (const guide of guides) {
      for (const month of MONTHS) {
        const result = parseFrequencyText(guide.watering?.frequency ?? '', month);
        if (result === null) {
          failures.push(`${guide.flowerName} / ${month}月: ${guide.watering?.frequency}`);
        }
      }
    }

    expect(failures).toEqual([]);
  });

  it('施肥的每一条周期文本在每个月份都能解析', () => {
    const failures: string[] = [];

    for (const guide of guides) {
      for (const month of MONTHS) {
        const result = parseFrequencyText(guide.fertilizing?.period ?? '', month);
        if (result === null) {
          failures.push(`${guide.flowerName} / ${month}月: ${guide.fertilizing?.period}`);
        }
      }
    }

    expect(failures).toEqual([]);
  });

  it('每份指南在每个月份都至少能生成一条提醒', () => {
    const failures: string[] = [];

    for (const guide of guides) {
      for (const month of MONTHS) {
        const specs = buildPrefilledReminders(guide, {month});
        if (specs.length === 0) {
          failures.push(`${guide.flowerName} / ${month}月`);
        }
      }
    }

    expect(failures).toEqual([]);
  });

  it('生成的每条规格都满足 create() 的校验前提', () => {
    // 预填结果最终会喂给 ReminderService.createBatch，
    // 这里提前把关，避免出现「周提醒却没有星期」这类无法调度的规格
    const problems: string[] = [];

    for (const guide of guides) {
      for (const month of MONTHS) {
        for (const spec of buildPrefilledReminders(guide, {month})) {
          if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(spec.time)) {
            problems.push(`${guide.flowerName}: 非法时间 ${spec.time}`);
          }
          if (spec.frequency === 'weekly' && !spec.daysOfWeek?.length) {
            problems.push(`${guide.flowerName}: 周提醒缺少星期`);
          }
          if (spec.frequency === 'monthly' && !spec.dayOfMonth) {
            problems.push(`${guide.flowerName}: 月提醒缺少日期`);
          }
        }
      }
    }

    expect(problems).toEqual([]);
  });
});

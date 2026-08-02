/**
 * WeatherCareService — 天气养护建议服务
 * ==============================================
 * 基于天气数据 + 植物养护指南，通过 LLM 生成养护调整建议。
 * 支持离线规则兜底（LLM 不可用时使用预设规则）。
 *
 * 由 A（AI 工程师）在 Day 2-3 实现。
 */

import type {
  CityInfo,
  WeatherData,
  WeatherAdvice,
  WeatherAdjustment,
} from '../types/weather';
import type { CareGuide } from '../types';
import {
  LLM_PRIMARY_URL,
  LLM_SECONDARY_URL,
  LLM_TIMEOUT_MS,
  LLM_MODEL_NAME,
  LLM_SECONDARY_MODEL,
  LLM_TEMPERATURE,
  LLM_PRIMARY_KEY_ENV,
  LLM_SECONDARY_KEY_ENV,
} from '../constants';
import { QWEN_API_KEY, DOUBAO_API_KEY } from '@env';
import { KnowledgeService } from './KnowledgeService';
import NetworkService from './NetworkService';
import logger from './LoggerService';

// ━━━━━ 类型 ━━━━━

interface LlmApiConfig {
  url: string;
  model: string;
  apiKey: string;
}

// ━━━━━ 天气状况中文映射 ━━━━━

const CONDITION_MAP: Record<string, string> = {
  clear: '晴朗',
  cloudy: '多云',
  overcast: '阴天',
  rain: '降雨',
  drizzle: '毛毛雨',
  thunderstorm: '雷暴',
  snow: '降雪',
  fog: '有雾',
  windy: '大风',
};

// ━━━━━ WeatherCareService ━━━━━

class WeatherCareService {
  private static instance: WeatherCareService;

  static getInstance(): WeatherCareService {
    if (!WeatherCareService.instance) {
      WeatherCareService.instance = new WeatherCareService();
    }
    return WeatherCareService.instance;
  }

  /**
   * 获取某植物在当前天气下的养护调整建议。
   * 流程：检查网络 → 在线调 LLM → LLM 失败则规则兜底
   *
   * @param city 城市信息
   * @param flowerId 植物 ID
   * @param weather 当前天气数据
   * @returns WeatherAdvice 或 null
   */
  async getAdviceForPlant(
    city: CityInfo,
    flowerId: number,
    weather: WeatherData,
  ): Promise<WeatherAdvice | null> {
    try {
      // 1. 获取植物养护指南
      const knowledgeService = KnowledgeService.getInstance();
      const response = knowledgeService.getCareGuide(flowerId);

      if (response.code !== 0 || !response.data) {
        logger.warn(
          'WeatherCareService',
          `未找到花卉养护指南: flowerId=${flowerId}`,
        );
        return null;
      }

      const guide = response.data;

      // 2. 检查网络状态
      const isOnline = NetworkService.getInstance().isOnline();

      if (!isOnline) {
        // 离线：直接使用规则兜底
        logger.info('WeatherCareService', '离线状态，使用规则兜底');
        return this.generateFallbackAdvice(weather, guide);
      }

      // 3. 在线：尝试调用 LLM
      const advice = await this.callLLMForAdvice(weather, guide);

      if (advice) {
        return advice;
      }

      // 4. LLM 失败：降级到规则兜底
      logger.warn('WeatherCareService', 'LLM 调用失败，使用规则兜底');
      return this.generateFallbackAdvice(weather, guide);
    } catch (error) {
      logger.error(
        'WeatherCareService',
        `getAdviceForPlant 异常: flowerId=${flowerId}`,
        error instanceof Error ? error.message : String(error),
      );
      return null;
    }
  }

  /**
   * 获取首页每日小贴士（不需要植物信息，仅天气 → LLM）。
   *
   * @param city 城市信息
   * @param weather 当前天气数据
   * @returns 小贴士文本，失败返回空字符串
   */
  async getDailyTip(city: CityInfo, weather: WeatherData): Promise<string> {
    try {
      const isOnline = NetworkService.getInstance().isOnline();

      if (!isOnline) {
        return this.generateFallbackTip(weather);
      }

      const tip = await this.callLLMForTip(city, weather);
      return tip || this.generateFallbackTip(weather);
    } catch (error) {
      logger.error(
        'WeatherCareService',
        'getDailyTip 异常',
        error instanceof Error ? error.message : String(error),
      );
      return this.generateFallbackTip(weather);
    }
  }

  // ━━━━━ LLM 调用 ━━━━━

  /**
   * 调用 LLM 获取养护调整建议。
   *
   * @param weather 当前天气
   * @param guide 植物养护指南
   * @returns WeatherAdvice 或 null
   */
  private async callLLMForAdvice(
    weather: WeatherData,
    guide: CareGuide,
  ): Promise<WeatherAdvice | null> {
    const prompt = this.buildAdvicePrompt(weather, guide);

    const configs = [this.getApiConfig(false), this.getApiConfig(true)];

    for (let attempt = 0; attempt < configs.length; attempt++) {
      const config = configs[attempt];

      try {
        logger.info(
          'WeatherCareService',
          `调用 LLM (${attempt === 0 ? 'primary' : 'secondary'})`,
          `模型: ${config.model}`,
        );

        const rawResponse = await this.callLLMText(config, prompt);
        const advice = this.parseAdviceResponse(rawResponse);

        if (advice) {
          logger.info(
            'WeatherCareService',
            'LLM 建议生成成功',
            `调整项: ${advice.adjustments.length}`,
          );
          return advice;
        }
      } catch (error) {
        logger.warn(
          'WeatherCareService',
          `LLM 调用失败 (${attempt === 0 ? 'primary' : 'secondary'})`,
          error instanceof Error ? error.message : String(error),
        );

        // 主模型失败，尝试备用模型
        if (attempt === 0) {
          const secondaryKey = this.getApiKey(LLM_SECONDARY_KEY_ENV);
          if (!secondaryKey) {
            logger.info('WeatherCareService', '备用模型 API Key 未配置');
            break;
          }
        }
      }
    }

    return null;
  }

  /**
   * 调用 LLM 获取每日小贴士。
   *
   * @param city 城市信息
   * @param weather 当前天气
   * @returns 小贴士文本或空字符串
   */
  private async callLLMForTip(
    city: CityInfo,
    weather: WeatherData,
  ): Promise<string> {
    const prompt = this.buildTipPrompt(city, weather);

    const configs = [this.getApiConfig(false), this.getApiConfig(true)];

    for (let attempt = 0; attempt < configs.length; attempt++) {
      const config = configs[attempt];

      try {
        const rawResponse = await this.callLLMText(config, prompt);
        const tip = this.parseTipResponse(rawResponse);

        if (tip) {
          return tip;
        }
      } catch (error) {
        logger.warn(
          'WeatherCareService',
          `getDailyTip LLM 调用失败 (${
            attempt === 0 ? 'primary' : 'secondary'
          })`,
          error instanceof Error ? error.message : String(error),
        );

        if (attempt === 0) {
          const secondaryKey = this.getApiKey(LLM_SECONDARY_KEY_ENV);
          if (!secondaryKey) break;
        }
      }
    }

    return '';
  }

  /**
   * 调用 LLM 文本 API（通用方法）。
   *
   * @param config API 配置
   * @param prompt 提示词
   * @returns LLM 原始响应文本
   */
  private async callLLMText(
    config: LlmApiConfig,
    prompt: string,
  ): Promise<string> {
    if (!config.apiKey) {
      throw new Error('LLM API Key 未配置');
    }

    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
    };

    const body = {
      model: config.model,
      messages: [
        {
          role: 'user',
          content: [{ type: 'text', text: prompt }],
        },
      ],
      temperature: LLM_TEMPERATURE,
      max_tokens: 1024,
    };

    const response = await Promise.race([
      fetch(config.url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      }),
      this.createTimeoutPromise(),
    ]);

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      throw new Error(
        `LLM API 错误: ${response.status} ${errorText.slice(0, 200)}`,
      );
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || '';
  }

  // ━━━━━ Prompt 构建 ━━━━━

  /**
   * 构建养护调整建议的 Prompt。
   */
  private buildAdvicePrompt(weather: WeatherData, guide: CareGuide): string {
    const conditionText = CONDITION_MAP[weather.condition] || weather.condition;
    const forecastText = weather.forecast3Day
      .map(
        f =>
          `${f.date}: ${f.tempMin}~${f.tempMax}°C, 降水${f.precipitation}mm, ${
            CONDITION_MAP[f.condition] || f.condition
          }`,
      )
      .join('\n');

    const precipTotal =
      weather.precipitation +
      weather.forecast3Day.reduce((s, f) => s + f.precipitation, 0);

    return `你是住在${weather.city}的园艺养护专家。请根据当地实际天气，对"${guide.flowerName}"给出自然贴心的养护调整建议。

【${weather.city}天气】当前${weather.temperature}°C（${weather.tempMin}~${weather.tempMax}°C），${conditionText}
湿度${weather.humidity}%，风速${weather.windSpeed}km/h
今日降水${weather.precipitation}mm，近3天累计降水${precipTotal}mm
未来3天预报：
${forecastText}

【${guide.flowerName}常规养护】
浇水：${guide.watering.frequency} | ${guide.watering.amount}
施肥：${guide.fertilizing.period} | ${guide.fertilizing.amount}
光照：${guide.lighting.requirement} | 宜放：${guide.lighting.bestLocation}
环境：${guide.environment.temperature} | 湿度${guide.environment.humidity} | ${guide.environment.ventilation}

请以口语化、自然的语气给出建议，像朋友提醒一样。每条建议用具体数字（温度、降水量）说明原因。

返回JSON（不要Markdown，双引号）：
{"dailyTip":"≤25字，如"今天降雨5mm，建议跳过浇水"","adjustments":[{"category":"water|temperature|humidity|light|fertilize|wind","icon":"water|thermometer|water-percent|white-balance-sunny|sprout|weather-windy","title":"四字标题","advice":"用具体数字的自然语言建议，如"近3天累计降水15mm，本周可减少浇水至1次，注意盆底排水避免烂根"，≤80字","severity":"warning|info|success"}]}

判断规则：
- 近3天降水>0 → "最近降水Xmm，可适当减少浇水量" / "未来有雨，建议雨后排水防涝"
- 温度>30°C → "当前X°C超过适宜温度，建议遮阴或移至半阴处"
- 温度<5°C → "当前X°C偏低，建议入室保暖"
- 湿度>70% → "湿度偏高X%，加强通风预防白粉病"
- 湿度<30% → "空气干燥X%，可向叶面喷雾增湿"
- 风速>30km/h → "风力较大，移至避风处"
- 给出2-4条即可，无问题则返回空数组，dailyTip写"天气适宜，按常规养护"`;
  }

  /**
   * 构建每日小贴士的 Prompt。
   */
  private buildTipPrompt(city: CityInfo, weather: WeatherData): string {
    const conditionText = CONDITION_MAP[weather.condition] || weather.condition;

    return `你是一个园艺小贴士专家。根据当前天气，生成一条简短的养护建议。

【天气】城市：${city.name} | 当前${weather.temperature}°C | 湿度${weather.humidity}% | ${conditionText}
今日温度：${weather.tempMin}°C ~ ${weather.tempMax}°C

请返回一条不超过25字的中文养护小贴士，直接返回文本，不要 JSON 格式。`;
  }

  // ━━━━━ 响应解析 ━━━━━

  /**
   * 解析 LLM 返回的养护建议 JSON。
   */
  private parseAdviceResponse(rawText: string): WeatherAdvice | null {
    try {
      const cleanText = rawText
        .replace(/```json\s*/g, '')
        .replace(/\s*```/g, '')
        .trim();

      const jsonMatch = cleanText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        logger.warn('WeatherCareService', 'LLM 响应中未找到 JSON');
        return null;
      }

      const jsonStr = jsonMatch[0];
      const parsed = JSON.parse(jsonStr);

      // 验证并规范化调整项
      const adjustments = (parsed.adjustments || []).map(
        (adj: WeatherAdjustment) => this.normalizeAdjustment(adj),
      );

      return {
        dailyTip: parsed.dailyTip || '',
        adjustments: adjustments.filter(
          (a: WeatherAdjustment | null) => a !== null,
        ) as WeatherAdjustment[],
        generatedAt: new Date().toISOString(),
      };
    } catch (error) {
      logger.warn(
        'WeatherCareService',
        'JSON 解析失败',
        error instanceof Error ? error.message : String(error),
      );
      return null;
    }
  }

  /**
   * 解析 LLM 返回的小贴士文本。
   */
  private parseTipResponse(rawText: string): string {
    let tip = rawText.trim();

    // 如果 LLM 返回了 JSON，尝试提取文本
    if (tip.startsWith('{')) {
      try {
        const parsed = JSON.parse(tip);
        if (parsed.dailyTip || parsed.tip || parsed.text) {
          tip = parsed.dailyTip || parsed.tip || parsed.text;
        }
      } catch {
        // 忽略 JSON 解析错误，使用原始文本
      }
    }

    // 限制长度
    if (tip.length > 50) {
      tip = tip.slice(0, 50) + '...';
    }

    return tip;
  }

  /**
   * 规范化调整项，确保所有必填字段存在。
   */
  private normalizeAdjustment(
    adj: WeatherAdjustment,
  ): WeatherAdjustment | null {
    if (!adj || !adj.category) return null;

    const validCategories = [
      'water',
      'temperature',
      'humidity',
      'light',
      'fertilize',
      'wind',
    ];
    if (!validCategories.includes(adj.category)) return null;

    return {
      category: adj.category,
      icon: adj.icon || this.getDefaultIcon(adj.category),
      title: adj.title || this.getDefaultTitle(adj.category),
      advice: (adj.advice || '').slice(0, 80),
      severity: adj.severity || 'info',
    };
  }

  private getDefaultIcon(category: string): string {
    const iconMap: Record<string, string> = {
      water: 'water',
      temperature: 'thermometer',
      humidity: 'water-percent',
      light: 'white-balance-sunny',
      fertilize: 'sprout',
      wind: 'weather-windy',
    };
    return iconMap[category] || 'info';
  }

  private getDefaultTitle(category: string): string {
    const titleMap: Record<string, string> = {
      water: '浇水调整',
      temperature: '温度管理',
      humidity: '湿度调节',
      light: '光照调整',
      fertilize: '施肥建议',
      wind: '防风提示',
    };
    return titleMap[category] || '养护建议';
  }

  // ━━━━━ 离线规则兜底 ━━━━━

  /**
   * 根据天气数据和植物养护指南，生成基础养护建议。
   * 用于离线或 LLM 调用失败时的兜底。
   */
  private generateFallbackAdvice(
    weather: WeatherData,
    _guide: CareGuide,
  ): WeatherAdvice {
    const adjustments: WeatherAdjustment[] = [];

    // 计算未来3天累计降水
    const forecastPrecip = weather.forecast3Day.reduce(
      (s, f) => s + f.precipitation,
      0,
    );
    const totalPrecip = weather.precipitation + forecastPrecip;

    // 规则 1：近3天有降水 → 减少浇水
    if (
      weather.precipitation > 0 ||
      forecastPrecip > 0 ||
      weather.condition === 'rain' ||
      weather.condition === 'drizzle' ||
      weather.condition === 'thunderstorm'
    ) {
      const precipRef = totalPrecip > 0 ? `近3天累计降水${totalPrecip}mm` : '';
      const action = forecastPrecip > 0
        ? '未来有降雨预报，建议减少浇水频率，注意雨后及时排水'
        : '最近有降雨，可适当减少浇水量，注意盆土排水防烂根';
      adjustments.push({
        category: 'water',
        icon: 'water',
        title: '浇水调整',
        advice: [precipRef, action].filter(Boolean).join('，'),
        severity: 'warning',
      });
    }

    // 规则 2：高温预警
    if (weather.temperature > 30) {
      adjustments.push({
        category: 'temperature',
        icon: 'thermometer',
        title: '高温预警',
        advice: `当前${weather.temperature}°C，建议将盆栽移至半阴处或室内，避免正午阳光直射，适当增加浇水量`,
        severity: 'warning',
      });
    } else if (weather.tempMax > 33) {
      adjustments.push({
        category: 'temperature',
        icon: 'thermometer',
        title: '防暑提醒',
        advice: `今日最高${weather.tempMax}°C，中午时段注意遮阴，避免暴晒导致叶片灼伤`,
        severity: 'info',
      });
    }

    // 规则 3：低温防冻
    if (weather.temperature < 5) {
      adjustments.push({
        category: 'temperature',
        icon: 'thermometer',
        title: '防冻提醒',
        advice: `当前仅${weather.temperature}°C，建议将植物移至室内温暖处，避免室外受冻`,
        severity: 'warning',
      });
    } else if (weather.tempMin < 8 && weather.temperature < 10) {
      adjustments.push({
        category: 'temperature',
        icon: 'thermometer',
        title: '降温预警',
        advice: `近期最低温度${weather.tempMin}°C，昼夜温差大，晚间注意关窗防寒`,
        severity: 'info',
      });
    }

    // 规则 4：湿度过高
    if (weather.humidity > 70) {
      adjustments.push({
        category: 'humidity',
        icon: 'water-percent',
        title: '防病提醒',
        advice: `当前湿度${weather.humidity}%，易引发白粉病和根腐，请加强通风，避免叶片积水`,
        severity: 'warning',
      });
    }

    // 规则 5：湿度过低
    if (weather.humidity < 30) {
      adjustments.push({
        category: 'humidity',
        icon: 'water-percent',
        title: '干燥提醒',
        advice: `空气湿度仅${weather.humidity}%，可向叶面喷雾增加湿度，或放置水盘在盆栽旁`,
        severity: 'info',
      });
    }

    // 规则 6：大风预警
    if (weather.windSpeed > 30) {
      adjustments.push({
        category: 'wind',
        icon: 'weather-windy',
        title: '防风提醒',
        advice: `当前风速${weather.windSpeed}km/h，建议将室外盆栽移至避风处，防止倒伏`,
        severity: 'warning',
      });
    }

    // 规则 7：晴朗干燥 + 高温 → 增加浇水
    if (
      weather.condition === 'clear' &&
      weather.temperature > 20 &&
      weather.precipitation === 0 &&
      forecastPrecip === 0
    ) {
      adjustments.push({
        category: 'water',
        icon: 'water',
        title: '补水提醒',
        advice: `近期无降雨，温度${weather.temperature}°C蒸发较快，请按时浇水保持土壤湿润`,
        severity: 'info',
      });
    }

    // 如果没有触发任何规则
    if (adjustments.length === 0) {
      adjustments.push({
        category: 'light',
        icon: 'white-balance-sunny',
        title: '适宜生长',
        advice: `当前${weather.temperature}°C，${CONDITION_MAP[weather.condition]}，天气条件适宜植物生长`,
        severity: 'success',
      });
    }

    // 限制最多 4 条建议
    const limitedAdjustments = adjustments.slice(0, 4);

    return {
      dailyTip: this.generateFallbackTip(weather),
      adjustments: limitedAdjustments,
      generatedAt: new Date().toISOString(),
    };
  }

  /**
   * 生成兜底小贴士。
   */
  private generateFallbackTip(weather: WeatherData): string {
    const precip3Day =
      weather.precipitation +
      weather.forecast3Day.reduce((s, f) => s + f.precipitation, 0);

    if (precip3Day > 10) {
      return `近3天降雨${precip3Day}mm，可减少浇水`;
    }
    if (weather.temperature > 33) {
      return `${weather.temperature}°C高温，注意遮阴降温`;
    }
    if (weather.temperature > 30) {
      return '天气炎热，注意遮阴降温';
    }
    if (weather.temperature < 5) {
      return `仅${weather.temperature}°C，注意防寒保暖`;
    }
    if (weather.humidity > 70) {
      return '湿度偏高，注意通风防病';
    }
    if (weather.humidity < 30) {
      return '空气干燥，适当增加湿度';
    }
    if (weather.condition === 'rain' || weather.condition === 'drizzle') {
      return '有雨天气，减少浇水注意排水';
    }
    if (weather.windSpeed > 30) {
      return '风力较大，注意防风保护';
    }
    return '天气适宜，按常规养护即可';
  }

  // ━━━━━ API 配置辅助 ━━━━━

  private getApiKey(keyName: string): string {
    const envKeys: Record<string, string | undefined> = {
      QWEN_API_KEY,
      DOUBAO_API_KEY,
    };

    const result = envKeys[keyName] || '';
    if (!result) {
      logger.warn('WeatherCareService', `API Key "${keyName}" 未配置`);
    }
    return result;
  }

  private getApiConfig(useSecondary: boolean): LlmApiConfig {
    const apiKey = useSecondary
      ? this.getApiKey(LLM_SECONDARY_KEY_ENV)
      : this.getApiKey(LLM_PRIMARY_KEY_ENV);

    return {
      url: useSecondary ? LLM_SECONDARY_URL : LLM_PRIMARY_URL,
      model: useSecondary ? LLM_SECONDARY_MODEL : LLM_MODEL_NAME,
      apiKey,
    };
  }

  private createTimeoutPromise(): Promise<never> {
    return new Promise((_, reject) => {
      setTimeout(() => reject(new Error('LLM 请求超时')), LLM_TIMEOUT_MS);
    });
  }
}

export default WeatherCareService;

/**
 * WeatherService — 天气数据获取服务
 * ===========================================
 * 调用 Open-Meteo 免费天气 API，获取实时天气和 3 天预报。
 * 支持 WMO 天气码 → 业务天气状况枚举映射。
 *
 * 由 A（AI 工程师）在 Day 1 实现。
 */

import type { CityInfo, WeatherData, WeatherCondition } from '../types/weather';
import {
  WEATHER_API_URL,
  WEATHER_API_TIMEOUT_MS,
  WEATHER_TIMEZONE,
  WEATHER_FORECAST_DAYS,
} from '../constants';
import logger from './LoggerService';

// ━━━━━ 类型 ━━━━━

interface OpenMeteoResponse {
  current: {
    temperature_2m: number;
    relative_humidity_2m: number;
    weather_code: number;
    wind_speed_10m: number;
  };
  daily: {
    time: string[];
    temperature_2m_max: number[];
    temperature_2m_min: number[];
    precipitation_sum: number[];
    weather_code: number[];
  };
}

// ━━━━━ WeatherService ━━━━━

class WeatherService {
  private static instance: WeatherService;

  static getInstance(): WeatherService {
    if (!WeatherService.instance) {
      WeatherService.instance = new WeatherService();
    }
    return WeatherService.instance;
  }

  /**
   * 获取指定城市的天气数据。
   * 调用 Open-Meteo API，解析并返回 WeatherData。
   * @param city 城市信息（包含经纬度）
   * @returns WeatherData 或 null（网络错误/API 异常）
   */
  async fetchWeather(city: CityInfo): Promise<WeatherData | null> {
    try {
      const url = this.buildApiUrl(city);
      logger.info('WeatherService', `获取天气: ${city.name}`, `URL: ${url}`);

      const response = await this.fetchWithTimeout(url);

      if (!response.ok) {
        logger.warn(
          'WeatherService',
          `天气 API 请求失败: ${response.status}`,
          city.name,
        );
        return null;
      }

      const data = (await response.json()) as OpenMeteoResponse;
      const weatherData = this.parseResponse(city, data);

      logger.info(
        'WeatherService',
        `天气获取成功: ${city.name}`,
        `${weatherData.temperature}°C, ${weatherData.condition}, 湿度${weatherData.humidity}%`,
      );

      return weatherData;
    } catch (error) {
      logger.error(
        'WeatherService',
        `天气获取异常: ${city.name}`,
        error instanceof Error ? error.message : String(error),
      );
      return null;
    }
  }

  // ━━━━━ 私有方法 ━━━━━

  /**
   * 构建 Open-Meteo API 请求 URL。
   */
  private buildApiUrl(city: CityInfo): string {
    const params = new URLSearchParams({
      latitude: String(city.latitude),
      longitude: String(city.longitude),
      current:
        'temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m',
      daily:
        'temperature_2m_max,temperature_2m_min,precipitation_sum,weather_code',
      forecast_days: String(WEATHER_FORECAST_DAYS),
      timezone: WEATHER_TIMEZONE,
    });
    return `${WEATHER_API_URL}?${params.toString()}`;
  }

  /**
   * 带超时的 fetch 请求。
   */
  private async fetchWithTimeout(url: string): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(),
      WEATHER_API_TIMEOUT_MS,
    );

    try {
      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);
      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      // 检查是否为 AbortError（跨平台兼容）
      const err = error as { name?: string; message?: string };
      if (err?.name === 'AbortError' || err?.message?.includes('abort')) {
        throw new Error('天气 API 请求超时');
      }
      throw error;
    }
  }

  /**
   * 解析 Open-Meteo API 响应为 WeatherData。
   */
  private parseResponse(city: CityInfo, data: OpenMeteoResponse): WeatherData {
    const { current, daily } = data;

    // 解析未来 3 天预报
    const forecast3Day = daily.time.map((date, index) => ({
      date,
      tempMax: daily.temperature_2m_max[index],
      tempMin: daily.temperature_2m_min[index],
      precipitation: daily.precipitation_sum[index],
      condition: this.mapWMOCode(daily.weather_code[index]),
    }));

    return {
      city: city.name,
      temperature: current.temperature_2m,
      tempMax: daily.temperature_2m_max[0] ?? current.temperature_2m,
      tempMin: daily.temperature_2m_min[0] ?? current.temperature_2m,
      humidity: current.relative_humidity_2m,
      condition: this.mapWMOCode(current.weather_code),
      windSpeed: current.wind_speed_10m,
      precipitation: daily.precipitation_sum[0] ?? 0,
      forecast3Day,
      updatedAt: new Date().toISOString(),
    };
  }

  /**
   * WMO 天气码 → WeatherCondition 映射。
   * 参考: https://open-meteo.com/en/docs
   *
   * 码值范围说明：
   *   0       → clear（晴）
   *   1-3     → cloudy（多云）
   *   45-48   → fog（雾）
   *   51-57   → drizzle（毛毛雨）
   *   61-67   → rain（雨）
   *   71-77   → snow（雪）
   *   80-82   → rain（阵雨）
   *   85-86   → snow（阵雪）
   *   95      → thunderstorm（雷暴）
   *   96, 99  → thunderstorm（雷暴伴冰雹）
   */
  private mapWMOCode(code: number): WeatherCondition {
    if (code === 0) return 'clear';
    if (code >= 1 && code <= 3) return 'cloudy';
    if (code >= 45 && code <= 48) return 'fog';
    if (code >= 51 && code <= 57) return 'drizzle';
    if (code >= 61 && code <= 67) return 'rain';
    if (code >= 71 && code <= 77) return 'snow';
    if (code >= 80 && code <= 82) return 'rain';
    if (code >= 85 && code <= 86) return 'snow';
    if (code >= 95 && code <= 99) return 'thunderstorm';
    return 'cloudy'; // 默认多云
  }
}

export default WeatherService;

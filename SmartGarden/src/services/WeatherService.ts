/**
 * WeatherService — 天气数据获取服务（存根）
 * ===========================================
 * Day 1 最小实现，Day 2 由 A 完整实现。
 *
 * 接口签名（供 Store / 组件参考）：
 *   fetchWeather(city: CityInfo): Promise<WeatherData | null>
 */

import type { CityInfo, WeatherData } from '../types/weather';

export interface IWeatherService {
  fetchWeather(city: CityInfo): Promise<WeatherData | null>;
}

const WeatherService: { getInstance(): IWeatherService } = {
  getInstance: () => ({
    fetchWeather: async (_city: CityInfo) => null,
  }),
};

export default WeatherService;

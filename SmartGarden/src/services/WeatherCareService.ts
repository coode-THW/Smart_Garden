/**
 * WeatherCareService — 天气养护建议服务（存根）
 * ==============================================
 * Day 1 最小实现，Day 2 由 A 完整实现。
 *
 * 接口签名（供 Store / 组件参考）：
 *   getAdviceForPlant(city, flowerId, weather): Promise<WeatherAdvice | null>
 *   getDailyTip(city, weather): Promise<string>
 */

import type { CityInfo, WeatherData, WeatherAdvice } from '../types/weather';

export interface IWeatherCareService {
  getAdviceForPlant(
    city: CityInfo,
    flowerId: number,
    weather: WeatherData,
  ): Promise<WeatherAdvice | null>;
  getDailyTip(city: CityInfo, weather: WeatherData): Promise<string>;
}

const WeatherCareService: { getInstance(): IWeatherCareService } = {
  getInstance: () => ({
    getAdviceForPlant: async (_city: CityInfo, _flowerId: number, _weather: WeatherData) => null,
    getDailyTip: async (_city: CityInfo, _weather: WeatherData) => '',
  }),
};

export default WeatherCareService;

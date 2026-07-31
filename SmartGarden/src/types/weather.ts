/**
 * 天气养护调整功能 — 类型定义
 * =============================
 * 由 A（AI 工程师）在 Day 1 定义。
 */

// 天气状况枚举
export type WeatherCondition =
  | 'clear' | 'cloudy' | 'overcast'
  | 'rain' | 'drizzle' | 'thunderstorm'
  | 'snow' | 'fog' | 'windy';

// 城市信息
export interface CityInfo {
  name: string;        // "北京"
  latitude: number;    // 39.9042
  longitude: number;   // 116.4074
}

// Open-Meteo 返回的天气数据（经 WeatherService 解析后）
export interface WeatherData {
  city: string;
  temperature: number;      // 当前温度 °C
  tempMax: number;          // 今日最高
  tempMin: number;          // 今日最低
  humidity: number;         // 湿度 %
  condition: WeatherCondition;
  windSpeed: number;        // 风速 km/h
  precipitation: number;    // 今日降水量 mm
  forecast3Day: Array<{     // 未来3天
    date: string;
    tempMax: number;
    tempMin: number;
    precipitation: number;
    condition: WeatherCondition;
  }>;
  updatedAt: string;        // ISO 时间戳
}

// LLM 生成的养护调整建议
export interface WeatherAdvice {
  dailyTip: string;                     // 首页小贴士（≤25字）
  adjustments: WeatherAdjustment[];     // 养护调整列表
  generatedAt: string;
}

export interface WeatherAdjustment {
  category: 'water' | 'temperature' | 'humidity' | 'light' | 'fertilize' | 'wind';
  icon: string;          // Material Design 图标名
  title: string;         // 四字标题
  advice: string;        // 详细建议，≤50字
  severity: 'warning' | 'info' | 'success';
}

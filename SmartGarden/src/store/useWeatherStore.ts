/**
 * useWeatherStore — 天气养护状态管理
 * ====================================
 * 职责：
 *   - 城市选择与持久化
 *   - Open-Meteo 天气数据获取与 1h TTL 缓存
 *   - 每日 AI 养护小贴士
 *   - 每植物天气养护建议（6h TTL + LLM + 规则兜底）
 *   - 离线状态检测与自动恢复（Day 3）
 *
 * 消费方（B 的组件）：
 *   - WeatherCard        → selectedCity, weatherData, dailyTip, isLoading, isOffline, fetchWeather
 *   - CityPickerModal    → selectedCity, selectCity
 *   - WeatherAdvisedCare → selectedCity, getAdvice, isOffline
 *
 * 依赖：
 *   - WeatherService.fetchWeather(city) → WeatherData | null
 *   - WeatherCareService.getAdviceForPlant(...) → WeatherAdvice
 *   - WeatherCareService.getDailyTip(...) → string
 *   - NetworkService — 在线/离线检测
 *
 * 缓存策略：
 *   - 天气数据: TTL = 1h (3600000ms)
 *   - 养护建议: TTL = 6h (21600000ms)，key = `${city}:${flowerId}`
 *   - 离线时：始终返回缓存数据，不做网络请求
 */

import {create} from 'zustand';
import Geolocation from '@react-native-community/geolocation';
import type {CityInfo, WeatherData, WeatherAdvice} from '../types/weather';
import {CHINESE_CITIES} from '../data/chineseCities';
import WeatherService from '../services/WeatherService';
import WeatherCareService from '../services/WeatherCareService';
import NetworkService from '../services/NetworkService';
import logger from '../services/LoggerService';

// ━━━━━ 常量 ━━━━━

/** 天气数据过期时间：1 小时 */
export const WEATHER_TTL = 3600000;

/** 养护建议过期时间：6 小时 */
export const ADVICE_TTL = 21600000;

// ━━━━━ 类型 ━━━━━

export interface WeatherState {
  /** 当前选中的城市 */
  selectedCity: CityInfo | null;
  /** 最新天气数据 */
  weatherData: WeatherData | null;
  /** AI 生成的每日养护小贴士 */
  dailyTip: string;
  /**
   * 养护建议缓存 Map
   * key 格式: `${cityName}:${flowerId}`，如 "北京:3"
   */
  adviceMap: Record<string, WeatherAdvice>;
  /** 网络请求进行中 */
  isLoading: boolean;
  /** 上次成功获取天气的时间戳 (Date.now()) */
  lastFetchAt: number | null;
  /** 用户友好的错误信息，null = 无错误 */
  error: string | null;
  /** 设备是否离线（由 NetworkService 驱动） */
  isOffline: boolean;

  // ─── Actions ───

  /** 选择城市（同一城市不重复清除已有天气数据） */
  selectCity: (city: CityInfo) => void;
  /** 获取当前城市的天气 + 每日小贴士（离线时跳过） */
  fetchWeather: () => Promise<void>;
  /**
   * 获取某植物在当前天气下的养护调整建议
   * 离线时：返回缓存数据（即使已过 TTL）
   */
  getAdvice: (flowerId: number, flowerName: string) => Promise<WeatherAdvice | null>;
  /** 清除天气数据+小贴士+建议缓存（保留城市选择） */
  clearCache: () => void;
  /** 初始化网络监控（App 启动时调用一次） */
  initNetworkMonitoring: () => () => void;
  /** GPS 自动定位，匹配最近城市并自动选中 */
  autoLocate: () => Promise<void>;
}

// ━━━━━ 初始状态 ━━━━━

const initialState: Omit<
  WeatherState,
  | 'selectCity'
  | 'fetchWeather'
  | 'getAdvice'
  | 'clearCache'
  | 'initNetworkMonitoring'
  | 'autoLocate'
> = {
  selectedCity: null,
  weatherData: null,
  dailyTip: '',
  adviceMap: {},
  isLoading: false,
  lastFetchAt: null,
  error: null,
  isOffline: false,
};

// ━━━━━ 服务单例 ━━━━━

const weatherService = WeatherService.getInstance();
const weatherCareService = WeatherCareService.getInstance();
const networkService = NetworkService.getInstance();

// ━━━━━ 工具函数 ━━━━━

/**
 * 将秒数转为可读的中文时长字符串。
 * 用于 "缓存于 XX分钟前" 的展示。
 *
 * 用法（B 的组件中）：
 *   import { formatTimeAgo } from '../store/useWeatherStore';
 *   const ago = formatTimeAgo(lastFetchAt);
 */
export function formatTimeAgo(lastFetchAt: number | null): string {
  if (!lastFetchAt) return '';
  const seconds = Math.floor((Date.now() - lastFetchAt) / 1000);
  if (seconds < 60) return '刚刚';
  if (seconds < 3600) {
    const mins = Math.floor(seconds / 60);
    return `${mins}分钟前`;
  }
  if (seconds < 86400) {
    const hours = Math.floor(seconds / 3600);
    return `${hours}小时前`;
  }
  const days = Math.floor(seconds / 86400);
  return `${days}天前`;
}

// ━━━━━ Store ━━━━━

export const useWeatherStore = create<WeatherState>()((set, get) => ({
  ...initialState,

  // ─── 城市选择 ───

  selectCity: (city: CityInfo) => {
    const current = get().selectedCity;
    if (
      current?.name === city.name &&
      current?.latitude === city.latitude &&
      current?.longitude === city.longitude
    ) {
      set({ selectedCity: city });
      return;
    }
    set({
      selectedCity: city,
      weatherData: null,
      dailyTip: '',
      error: null,
    });
  },

  // ─── 获取天气 ───

  fetchWeather: async () => {
    const { selectedCity, isLoading, isOffline } = get();
    if (!selectedCity) return;
    if (isLoading) return;

    // 离线时跳过网络请求（保留缓存数据，设置错误提示）
    if (isOffline) {
      set({ error: '当前处于离线状态，显示的是缓存数据' });
      return;
    }

    set({ isLoading: true, error: null });

    try {
      const data = await weatherService.fetchWeather(selectedCity);

      if (!data) {
        // 返回 null → 网络异常，检查是否真的离线
        const online = networkService.isOnline();
        if (!online) {
          set({
            isLoading: false,
            isOffline: true,
            error: '网络已断开，显示的是缓存数据',
          });
        } else {
          set({
            isLoading: false,
            error: '获取天气失败，请稍后重试',
          });
        }
        return;
      }

      set({
        weatherData: data,
        lastFetchAt: Date.now(),
        isLoading: false,
        error: null,
      });

      // 获取每日小贴士（独立 try-catch，失败不阻塞天气展示）
      try {
        const tip = await weatherCareService.getDailyTip(selectedCity, data);
        set({ dailyTip: tip ?? '' });
      } catch {
        set({ dailyTip: '' });
      }
    } catch {
      // fetch 抛异常 → 可能是网络问题
      const online = networkService.isOnline();
      set({
        isLoading: false,
        isOffline: !online,
        error: online ? '获取天气失败，请稍后重试' : '网络已断开，显示的是缓存数据',
      });
    }
  },

  // ─── 获取养护建议 ───

  getAdvice: async (flowerId: number, _flowerName: string) => {
    const { selectedCity, weatherData, lastFetchAt, adviceMap, isOffline } = get();
    if (!selectedCity) return null;

    const cacheKey = `${selectedCity.name}:${flowerId}`;

    // 1. 检查 adviceMap 缓存（离线时即使过期也返回缓存）
    const cached = adviceMap[cacheKey];
    if (cached) {
      const age = Date.now() - new Date(cached.generatedAt).getTime();
      if (age < ADVICE_TTL || isOffline) {
        return cached;
      }
    }

    // 2. 离线且无缓存 → 无法获取新建议
    if (isOffline) return cached ?? null;

    // 3. 检查天气数据是否过期（1h TTL）
    let weather = weatherData;
    const isWeatherExpired =
      !weather || !lastFetchAt || Date.now() - lastFetchAt > WEATHER_TTL;

    if (isWeatherExpired) {
      await get().fetchWeather();
      weather = get().weatherData;
      if (!weather) return cached ?? null;
    }

    // 至此 weather 一定非 null（isWeatherExpired=false 时有值，true 时已 guard）
    /* eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion */
    const safeWeather = weather!;

    // 4. 调用 WeatherCareService（LLM + 规则兜底）
    try {
      const advice = await weatherCareService.getAdviceForPlant(
        selectedCity,
        flowerId,
        safeWeather,
      );

      if (advice) {
        set((state) => ({
          adviceMap: {
            ...state.adviceMap,
            [cacheKey]: advice,
          },
        }));
      }

      return advice;
    } catch {
      return cached ?? null;
    }
  },

  // ─── 清除缓存 ───

  clearCache: () => {
    set({
      weatherData: null,
      dailyTip: '',
      adviceMap: {},
      lastFetchAt: null,
    });
  },

  // ─── 网络监控初始化 ───

  initNetworkMonitoring: () => {
    // 启动 NetworkService
    networkService.init();

    // 订阅网络状态变化
    const unsubscribe = networkService.addListener((online) => {
      const prev = get().isOffline;

      if (online && prev) {
        // 从离线 → 在线：自动刷新天气
        logger.info('WeatherStore', '网络恢复，自动刷新天气数据');
        set({ isOffline: false, error: null });
        get().fetchWeather();
      } else if (!online && !prev) {
        // 从在线 → 离线
        const { lastFetchAt } = get();
        set({
          isOffline: true,
          error: lastFetchAt
            ? '网络已断开，显示的是缓存数据'
            : '网络已断开',
        });
        logger.info('WeatherStore', '检测到离线');
      }
    });

    // 先同步一次当前状态
    const online = networkService.isOnline();
    if (!online) {
      set({ isOffline: true });
    }

    return unsubscribe;
  },

  // ─── GPS 自动定位 ───

  autoLocate: async () => {
    const { selectedCity } = get();
    if (selectedCity) return; // 已有手动选择，不覆盖

    try {
      const position = await new Promise<{coords: {latitude: number; longitude: number}}>(
        (resolve, reject) => {
          Geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: false,
            timeout: 10000,
            maximumAge: 3600000, // 1h 缓存
          });
        },
      );

      const { latitude, longitude } = position.coords;
      logger.info('WeatherStore', `GPS 定位成功: ${latitude}, ${longitude}`);

      // 找最近城市
      let nearest: CityInfo | null = null;
      let minDist = Infinity;
      for (const city of CHINESE_CITIES) {
        const dist =
          (city.latitude - latitude) ** 2 + (city.longitude - longitude) ** 2;
        if (dist < minDist) {
          minDist = dist;
          nearest = city;
        }
      }

      if (nearest) {
        logger.info('WeatherStore', `自动定位选中: ${nearest.name}`);
        get().selectCity(nearest);
        get().fetchWeather();
      }
    } catch (err) {
      logger.info('WeatherStore', 'GPS 定位失败，等待手动选择城市');
    }
  },
}));

// Mock geolocation（原生模块，Jest 环境无原生实现）
jest.mock('@react-native-community/geolocation', () => ({
  // 测试环境无定位：调用 error 回调，避免 autoLocate 的 Promise 永不 settle
  getCurrentPosition: jest.fn((_success, error) =>
    error && error({code: 2, message: 'Mock: no location in test environment'}),
  ),
  watchPosition: jest.fn(),
  clearWatch: jest.fn(),
  requestAuthorization: jest.fn(),
  setRNConfiguration: jest.fn(),
}));

/**
 * useWeatherStore 状态管理测试 — Day 3 离线状态版
 * ==============================================
 * 覆盖场景：
 *   - 初始状态（含 isOffline）
 *   - 城市选择
 *   - 天气获取（正常/错误/并发）
 *   - 离线行为（跳过请求/返回缓存/错误消息）
 *   - 养护建议（正常/离线返回过期缓存）
 *   - 缓存 TTL
 *   - formatTimeAgo 工具函数
 *   - 清理缓存
 *   - 类型完整性
 *
 * 角色: C（全栈工程师）
 */

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Mock 依赖服务
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const mockWeatherData = {
  city: '北京',
  temperature: 32,
  tempMax: 35,
  tempMin: 26,
  humidity: 45,
  condition: 'clear' as const,
  windSpeed: 12,
  precipitation: 0,
  forecast3Day: [
    { date: '2026-07-28', tempMax: 34, tempMin: 25, precipitation: 0, condition: 'clear' as const },
    { date: '2026-07-29', tempMax: 33, tempMin: 24, precipitation: 1.2, condition: 'rain' as const },
    { date: '2026-07-30', tempMax: 31, tempMin: 23, precipitation: 5.8, condition: 'rain' as const },
  ],
  updatedAt: '2026-07-28T08:00:00.000Z',
};

const mockAdvice = {
  dailyTip: '今天炎热，注意遮阴浇水',
  adjustments: [
    {
      category: 'temperature' as const,
      icon: 'thermometer',
      title: '高温预警',
      advice: '当前温度较高，请注意遮阴降温，避免阳光直射',
      severity: 'warning' as const,
    },
    {
      category: 'water' as const,
      icon: 'water',
      title: '浇水调整',
      advice: '气温高蒸发快，建议早晚各浇水一次',
      severity: 'info' as const,
    },
  ],
  generatedAt: '2026-07-28T08:00:00.000Z',
};

const mockCityBeijing = { name: '北京', latitude: 39.9042, longitude: 116.4074 };
const mockCityShanghai = { name: '上海', latitude: 31.2304, longitude: 121.4737 };

const mockFetchWeather = jest.fn();
const mockGetAdviceForPlant = jest.fn();
const mockGetDailyTip = jest.fn();

// NetworkService mock
const mockNetworkIsOnline = jest.fn(() => true);
const mockNetworkAddListener = jest.fn(() => jest.fn());
const mockNetworkInit = jest.fn();

jest.mock('../services/WeatherService', () => ({
  __esModule: true,
  default: {
    getInstance: () => ({
      fetchWeather: (...args: any[]) => mockFetchWeather(...args),
    }),
  },
}));

jest.mock('../services/WeatherCareService', () => ({
  __esModule: true,
  default: {
    getInstance: () => ({
      getAdviceForPlant: (...args: any[]) => mockGetAdviceForPlant(...args),
      getDailyTip: (...args: any[]) => mockGetDailyTip(...args),
    }),
  },
}));

jest.mock('../services/NetworkService', () => {
  const mockModule = {
    __esModule: true,
    default: {
      getInstance: () => ({
        isOnline: (...args: any[]) => (mockNetworkIsOnline as any)(...args),
        addListener: (...args: any[]) => (mockNetworkAddListener as any)(...args),
        init: (...args: any[]) => (mockNetworkInit as any)(...args),
      }),
    },
  };
  return mockModule;
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 导入被测 store
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { useWeatherStore, WEATHER_TTL, ADVICE_TTL, formatTimeAgo } from './useWeatherStore';

describe('useWeatherStore', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // 默认在线
    mockNetworkIsOnline.mockReturnValue(true);
    useWeatherStore.setState({
      selectedCity: null,
      weatherData: null,
      dailyTip: '',
      adviceMap: {},
      isLoading: false,
      lastFetchAt: null,
      error: null,
      isOffline: false,
    });
  });

  // ═══════════════════════════════════════════
  // 1. 初始状态
  // ═══════════════════════════════════════════

  describe('初始状态', () => {
    it('selectedCity 应为 null', () => {
      expect(useWeatherStore.getState().selectedCity).toBeNull();
    });

    it('weatherData 应为 null', () => {
      expect(useWeatherStore.getState().weatherData).toBeNull();
    });

    it('dailyTip 应为空字符串', () => {
      expect(useWeatherStore.getState().dailyTip).toBe('');
    });

    it('adviceMap 应为空对象', () => {
      expect(useWeatherStore.getState().adviceMap).toEqual({});
    });

    it('isLoading 应为 false', () => {
      expect(useWeatherStore.getState().isLoading).toBe(false);
    });

    it('lastFetchAt 应为 null', () => {
      expect(useWeatherStore.getState().lastFetchAt).toBeNull();
    });

    it('error 应为 null', () => {
      expect(useWeatherStore.getState().error).toBeNull();
    });

    it('isOffline 应为 false', () => {
      expect(useWeatherStore.getState().isOffline).toBe(false);
    });
  });

  // ═══════════════════════════════════════════
  // 2. TTL 常量
  // ═══════════════════════════════════════════

  describe('TTL 常量', () => {
    it('WEATHER_TTL = 1h', () => {
      expect(WEATHER_TTL).toBe(3600000);
    });

    it('ADVICE_TTL = 6h', () => {
      expect(ADVICE_TTL).toBe(21600000);
    });
  });

  // ═══════════════════════════════════════════
  // 3. selectCity
  // ═══════════════════════════════════════════

  describe('selectCity', () => {
    it('选择城市应更新 selectedCity', () => {
      useWeatherStore.getState().selectCity(mockCityBeijing);
      expect(useWeatherStore.getState().selectedCity).toEqual(mockCityBeijing);
    });

    it('切换城市应更新 selectedCity', () => {
      useWeatherStore.getState().selectCity(mockCityBeijing);
      useWeatherStore.getState().selectCity(mockCityShanghai);
      expect(useWeatherStore.getState().selectedCity).toEqual(mockCityShanghai);
    });

    it('切换城市应清除旧 weatherData', () => {
      useWeatherStore.setState({ weatherData: mockWeatherData });
      useWeatherStore.getState().selectCity(mockCityBeijing);
      expect(useWeatherStore.getState().weatherData).toBeNull();
    });

    it('选择同一城市不应清除数据', () => {
      useWeatherStore.setState({
        selectedCity: mockCityBeijing,
        weatherData: mockWeatherData,
        dailyTip: '今天炎热',
      });
      useWeatherStore.getState().selectCity(mockCityBeijing);
      expect(useWeatherStore.getState().weatherData).toEqual(mockWeatherData);
      expect(useWeatherStore.getState().dailyTip).toBe('今天炎热');
    });

    it('同名不同坐标视为不同城市', () => {
      const bj2 = { name: '北京', latitude: 39.9, longitude: 116.4 };
      useWeatherStore.setState({ selectedCity: mockCityBeijing, weatherData: mockWeatherData });
      useWeatherStore.getState().selectCity(bj2);
      expect(useWeatherStore.getState().weatherData).toBeNull();
    });
  });

  // ═══════════════════════════════════════════
  // 4. fetchWeather — 正常流程
  // ═══════════════════════════════════════════

  describe('fetchWeather 正常流程', () => {
    beforeEach(() => {
      mockFetchWeather.mockResolvedValue(mockWeatherData);
      mockGetDailyTip.mockResolvedValue('今天炎热，注意遮阴浇水');
    });

    it('未选城市时不应发起请求', async () => {
      await useWeatherStore.getState().fetchWeather();
      expect(mockFetchWeather).not.toHaveBeenCalled();
    });

    it('调用 WeatherService.fetchWeather', async () => {
      useWeatherStore.getState().selectCity(mockCityBeijing);
      await useWeatherStore.getState().fetchWeather();
      expect(mockFetchWeather).toHaveBeenCalledWith(mockCityBeijing);
    });

    it('更新 weatherData', async () => {
      useWeatherStore.getState().selectCity(mockCityBeijing);
      await useWeatherStore.getState().fetchWeather();
      expect(useWeatherStore.getState().weatherData).toEqual(mockWeatherData);
    });

    it('更新 lastFetchAt', async () => {
      useWeatherStore.getState().selectCity(mockCityBeijing);
      await useWeatherStore.getState().fetchWeather();
      expect(useWeatherStore.getState().lastFetchAt).not.toBeNull();
    });

    it('获取每日小贴士', async () => {
      useWeatherStore.getState().selectCity(mockCityBeijing);
      await useWeatherStore.getState().fetchWeather();
      expect(useWeatherStore.getState().dailyTip).toBe('今天炎热，注意遮阴浇水');
    });
  });

  // ═══════════════════════════════════════════
  // 5. fetchWeather — 错误处理
  // ═══════════════════════════════════════════

  describe('fetchWeather 错误处理', () => {
    it('返回 null 设 error', async () => {
      mockFetchWeather.mockResolvedValue(null);
      useWeatherStore.getState().selectCity(mockCityBeijing);
      await useWeatherStore.getState().fetchWeather();
      expect(useWeatherStore.getState().error).toBeTruthy();
    });

    it('异常设 error', async () => {
      mockFetchWeather.mockRejectedValue(new Error('fail'));
      useWeatherStore.getState().selectCity(mockCityBeijing);
      await useWeatherStore.getState().fetchWeather();
      expect(useWeatherStore.getState().error).toBeTruthy();
    });

    it('getDailyTip 失败不阻塞天气更新', async () => {
      mockFetchWeather.mockResolvedValue(mockWeatherData);
      mockGetDailyTip.mockRejectedValue(new Error('LLM down'));
      useWeatherStore.getState().selectCity(mockCityBeijing);
      await useWeatherStore.getState().fetchWeather();
      expect(useWeatherStore.getState().weatherData).toEqual(mockWeatherData);
      expect(useWeatherStore.getState().dailyTip).toBe('');
    });
  });

  // ═══════════════════════════════════════════
  // 6. fetchWeather — 离线行为
  // ═══════════════════════════════════════════

  describe('fetchWeather 离线行为', () => {
    beforeEach(() => {
      useWeatherStore.getState().selectCity(mockCityBeijing);
    });

    it('isOffline=true 时跳过请求', async () => {
      useWeatherStore.setState({ isOffline: true });
      await useWeatherStore.getState().fetchWeather();
      expect(mockFetchWeather).not.toHaveBeenCalled();
    });

    it('isOffline=true 时设错误提示', async () => {
      useWeatherStore.setState({ isOffline: true, weatherData: mockWeatherData });
      await useWeatherStore.getState().fetchWeather();
      const state = useWeatherStore.getState();
      expect(state.error).toContain('离线');
      // 缓存数据不受影响
      expect(state.weatherData).toEqual(mockWeatherData);
    });

    it('fetch 返回 null + 离线检测 → 标记离线', async () => {
      mockFetchWeather.mockResolvedValue(null);
      mockNetworkIsOnline.mockReturnValue(false);
      useWeatherStore.setState({ weatherData: mockWeatherData });

      await useWeatherStore.getState().fetchWeather();

      const state = useWeatherStore.getState();
      expect(state.isOffline).toBe(true);
      expect(state.error).toContain('断开');
      // 缓存数据保留
      expect(state.weatherData).toEqual(mockWeatherData);
    });

    it('fetch 返回 null + 在线 → 不标记离线', async () => {
      mockFetchWeather.mockResolvedValue(null);
      mockNetworkIsOnline.mockReturnValue(true); // 在线但接口挂了

      await useWeatherStore.getState().fetchWeather();

      const state = useWeatherStore.getState();
      expect(state.isOffline).toBe(false);
      expect(state.error).not.toContain('离线');
    });

    it('fetch 异常 + 离线检测 → 标记离线', async () => {
      mockFetchWeather.mockRejectedValue(new Error('Network error'));
      mockNetworkIsOnline.mockReturnValue(false);

      await useWeatherStore.getState().fetchWeather();

      expect(useWeatherStore.getState().isOffline).toBe(true);
    });
  });

  // ═══════════════════════════════════════════
  // 7. getAdvice — 养护建议
  // ═══════════════════════════════════════════

  describe('getAdvice', () => {
    beforeEach(() => {
      mockFetchWeather.mockResolvedValue(mockWeatherData);
      mockGetDailyTip.mockResolvedValue('提示');
    });

    it('未选城市返回 null', async () => {
      const r = await useWeatherStore.getState().getAdvice(3, '玫瑰');
      expect(r).toBeNull();
    });

    it('无天气时先取天气再请求建议', async () => {
      mockGetAdviceForPlant.mockResolvedValue(mockAdvice);
      useWeatherStore.getState().selectCity(mockCityBeijing);
      await useWeatherStore.getState().getAdvice(3, '玫瑰');
      expect(mockFetchWeather).toHaveBeenCalled();
      expect(mockGetAdviceForPlant).toHaveBeenCalled();
    });

    it('已有未过期天气时不重复获取', async () => {
      mockGetAdviceForPlant.mockResolvedValue(mockAdvice);
      useWeatherStore.setState({
        selectedCity: mockCityBeijing,
        weatherData: mockWeatherData,
        lastFetchAt: Date.now() - 1000,
      });
      await useWeatherStore.getState().getAdvice(3, '玫瑰');
      expect(mockFetchWeather).not.toHaveBeenCalled();
    });

    it('天气过期（>1h）应重新获取', async () => {
      mockFetchWeather.mockResolvedValue(mockWeatherData);
      mockGetAdviceForPlant.mockResolvedValue(mockAdvice);
      useWeatherStore.setState({
        selectedCity: mockCityBeijing,
        weatherData: mockWeatherData,
        lastFetchAt: Date.now() - WEATHER_TTL - 1,
      });
      await useWeatherStore.getState().getAdvice(3, '玫瑰');
      expect(mockFetchWeather).toHaveBeenCalled();
    });

    it('成功获取建议存入 adviceMap', async () => {
      mockGetAdviceForPlant.mockResolvedValue(mockAdvice);
      useWeatherStore.getState().selectCity(mockCityBeijing);
      await useWeatherStore.getState().getAdvice(3, '玫瑰');
      expect(useWeatherStore.getState().adviceMap['北京:3']).toBeDefined();
    });

    it('不同植物分别缓存', async () => {
      mockGetAdviceForPlant.mockResolvedValue(mockAdvice);
      useWeatherStore.getState().selectCity(mockCityBeijing);
      await useWeatherStore.getState().getAdvice(3, '玫瑰');
      await useWeatherStore.getState().getAdvice(5, '郁金香');
      expect(useWeatherStore.getState().adviceMap['北京:3']).toBeDefined();
      expect(useWeatherStore.getState().adviceMap['北京:5']).toBeDefined();
    });
  });

  // ═══════════════════════════════════════════
  // 8. getAdvice — 离线行为
  // ═══════════════════════════════════════════

  describe('getAdvice 离线行为', () => {
    it('离线且有缓存 → 返回过期缓存（即使超 6h）', async () => {
      useWeatherStore.setState({
        selectedCity: mockCityBeijing,
        isOffline: true,
        adviceMap: {
          '北京:3': {
            ...mockAdvice,
            generatedAt: new Date(Date.now() - 10 * 3600000).toISOString(), // 10h前，已过TTL
          },
        },
      });

      const result = await useWeatherStore.getState().getAdvice(3, '玫瑰');

      expect(result).toEqual(useWeatherStore.getState().adviceMap['北京:3']);
      // 离线不发起请求
      expect(mockGetAdviceForPlant).not.toHaveBeenCalled();
    });

    it('离线且无缓存 → 返回 null', async () => {
      useWeatherStore.setState({
        selectedCity: mockCityBeijing,
        isOffline: true,
        adviceMap: {},
      });

      const result = await useWeatherStore.getState().getAdvice(3, '玫瑰');

      expect(result).toBeNull();
      expect(mockGetAdviceForPlant).not.toHaveBeenCalled();
    });

    it('在线但天气刷新失败 → 返回过期缓存', async () => {
      mockFetchWeather.mockResolvedValue(null);
      useWeatherStore.setState({
        selectedCity: mockCityBeijing,
        weatherData: mockWeatherData,
        lastFetchAt: Date.now() - WEATHER_TTL - 1,
        adviceMap: {
          '北京:3': {
            ...mockAdvice,
            generatedAt: new Date(Date.now() - 10 * 3600000).toISOString(),
          },
        },
      });

      const result = await useWeatherStore.getState().getAdvice(3, '玫瑰');

      // 天气刷新失败，返回过期缓存
      expect(result).not.toBeNull();
    });

    it('在线且无缓存 → 正常请求', async () => {
      mockGetAdviceForPlant.mockResolvedValue(mockAdvice);
      useWeatherStore.setState({
        selectedCity: mockCityBeijing,
        weatherData: mockWeatherData,
        lastFetchAt: Date.now() - 1000,
        isOffline: false,
        adviceMap: {},
      });

      await useWeatherStore.getState().getAdvice(3, '玫瑰');

      expect(mockGetAdviceForPlant).toHaveBeenCalled();
    });
  });

  // ═══════════════════════════════════════════
  // 9. formatTimeAgo
  // ═══════════════════════════════════════════

  describe('formatTimeAgo', () => {
    it('null → 空字符串', () => {
      expect(formatTimeAgo(null)).toBe('');
    });

    it('< 60s → "刚刚"', () => {
      const ts = Date.now() - 30000;
      expect(formatTimeAgo(ts)).toBe('刚刚');
    });

    it('1min ~ 59min → "X分钟前"', () => {
      const ts = Date.now() - 5 * 60000;
      expect(formatTimeAgo(ts)).toBe('5分钟前');
    });

    it('1h ~ 23h → "X小时前"', () => {
      const ts = Date.now() - 3 * 3600000;
      expect(formatTimeAgo(ts)).toBe('3小时前');
    });

    it('≥ 24h → "X天前"', () => {
      const ts = Date.now() - 2 * 86400000;
      expect(formatTimeAgo(ts)).toBe('2天前');
    });
  });

  // ═══════════════════════════════════════════
  // 10. clearCache
  // ═══════════════════════════════════════════

  describe('clearCache', () => {
    it('清 weatherData/dailyTip/adviceMap/lastFetchAt', () => {
      useWeatherStore.setState({
        weatherData: mockWeatherData,
        dailyTip: '提示',
        adviceMap: { '北京:3': mockAdvice },
        lastFetchAt: Date.now(),
      });
      useWeatherStore.getState().clearCache();
      const s = useWeatherStore.getState();
      expect(s.weatherData).toBeNull();
      expect(s.dailyTip).toBe('');
      expect(s.adviceMap).toEqual({});
      expect(s.lastFetchAt).toBeNull();
    });

    it('不清 selectedCity', () => {
      useWeatherStore.setState({ selectedCity: mockCityBeijing });
      useWeatherStore.getState().clearCache();
      expect(useWeatherStore.getState().selectedCity).toEqual(mockCityBeijing);
    });

    it('不清 isOffline', () => {
      useWeatherStore.setState({ isOffline: true });
      useWeatherStore.getState().clearCache();
      expect(useWeatherStore.getState().isOffline).toBe(true);
    });
  });

  // ═══════════════════════════════════════════
  // 11. 缓存逻辑 — 边界条件
  // ═══════════════════════════════════════════

  describe('缓存逻辑 — 边界条件', () => {
    it('天气数据刚好在 TTL 边界不应过期', async () => {
      // 精确 1h 前（3600000ms），刚好在边界上
      useWeatherStore.setState({
        selectedCity: mockCityBeijing,
        weatherData: mockWeatherData,
        lastFetchAt: Date.now() - WEATHER_TTL, // 正好 1h
      });

      mockGetAdviceForPlant.mockResolvedValue(mockAdvice);

      await useWeatherStore.getState().getAdvice(3, '玫瑰');

      // 刚好在边界，不过期，不重新获取
      expect(mockFetchWeather).not.toHaveBeenCalled();
    });

    it('天气数据刚好超过 TTL 边界应过期', async () => {
      // 1h + 1ms 前
      useWeatherStore.setState({
        selectedCity: mockCityBeijing,
        weatherData: mockWeatherData,
        lastFetchAt: Date.now() - WEATHER_TTL - 1,
      });

      mockFetchWeather.mockResolvedValue(mockWeatherData);
      mockGetAdviceForPlant.mockResolvedValue(mockAdvice);

      await useWeatherStore.getState().getAdvice(3, '玫瑰');

      // 超过边界，重新获取
      expect(mockFetchWeather).toHaveBeenCalled();
    });

    it('养护建议刚好在 ADVICE_TTL 边界不应过期', async () => {
      useWeatherStore.setState({
        selectedCity: mockCityBeijing,
        weatherData: mockWeatherData,
        lastFetchAt: Date.now() - 1000,
        adviceMap: {
          '北京:3': {
            ...mockAdvice,
            generatedAt: new Date(Date.now() - ADVICE_TTL + 1000).toISOString(), // 差 1s 到 6h
          },
        },
      });

      await useWeatherStore.getState().getAdvice(3, '玫瑰');

      // 未到 TTL，命中缓存
      expect(mockGetAdviceForPlant).not.toHaveBeenCalled();
    });

    it('养护建议刚好超过 ADVICE_TTL 边界应过期', async () => {
      useWeatherStore.setState({
        selectedCity: mockCityBeijing,
        weatherData: mockWeatherData,
        lastFetchAt: Date.now() - 1000,
        adviceMap: {
          '北京:3': {
            ...mockAdvice,
            generatedAt: new Date(Date.now() - ADVICE_TTL - 1000).toISOString(), // 超 1s
          },
        },
      });

      mockGetAdviceForPlant.mockResolvedValue(mockAdvice);

      await useWeatherStore.getState().getAdvice(3, '玫瑰');

      // 超过边界，重新请求
      expect(mockGetAdviceForPlant).toHaveBeenCalled();
    });
  });

  // ═══════════════════════════════════════════
  // 12. 缓存逻辑 — adviceMap 跨城市切换
  // ═══════════════════════════════════════════

  describe('缓存逻辑 — adviceMap 跨城市切换', () => {
    it('切换城市后原城市缓存保留', async () => {
      mockGetAdviceForPlant.mockResolvedValue(mockAdvice);

      // 在北京获取玫瑰的建议
      useWeatherStore.setState({
        selectedCity: mockCityBeijing,
        weatherData: mockWeatherData,
        lastFetchAt: Date.now() - 1000,
      });
      await useWeatherStore.getState().getAdvice(3, '玫瑰');

      // 切换到上海
      useWeatherStore.getState().selectCity(mockCityShanghai);

      // 北京的缓存仍在
      const state = useWeatherStore.getState();
      expect(state.adviceMap['北京:3']).toBeDefined();
    });

    it('切回原城市后缓存仍可命中（未超 TTL）', async () => {
      // 注意：mockAdvice.generatedAt 是固定日期 2026-07-28（可能是 2 天前）
      // 需要生成 fresh 的 generatedAt
      const freshAdvice = {
        ...mockAdvice,
        generatedAt: new Date().toISOString(),
      };
      mockGetAdviceForPlant.mockResolvedValue(freshAdvice);

      // 在北京获取玫瑰的建议
      useWeatherStore.setState({
        selectedCity: mockCityBeijing,
        weatherData: mockWeatherData,
        lastFetchAt: Date.now() - 1000,
      });
      await useWeatherStore.getState().getAdvice(3, '玫瑰');

      // 切换到上海再切回北京
      useWeatherStore.getState().selectCity(mockCityShanghai);
      useWeatherStore.getState().selectCity(mockCityBeijing);

      // 切回后 weatherData 被清（北京→上海→北京两次切换导致）
      const midState = useWeatherStore.getState();
      expect(midState.weatherData).toBeNull();
      expect(midState.adviceMap['北京:3']).toBeDefined(); // adviceMap 跨城市保留

      // 重新获取天气后，应命中缓存（不重新请求 getAdviceForPlant）
      mockGetAdviceForPlant.mockClear();
      mockFetchWeather.mockResolvedValue(mockWeatherData);
      useWeatherStore.setState({ weatherData: mockWeatherData, lastFetchAt: Date.now() });
      await useWeatherStore.getState().getAdvice(3, '玫瑰');
      // 缓存命中，不应重新请求 LLM
      expect(mockGetAdviceForPlant).not.toHaveBeenCalled();
    });
  });

  // ═══════════════════════════════════════════
  // 13. 缓存逻辑 — 并发 getAdvice
  // ═══════════════════════════════════════════

  describe('缓存逻辑 — 并发 getAdvice', () => {
    it('多个并发的 getAdvice 各自正常返回', async () => {
      const makeAdvice = (name: string): typeof mockAdvice => ({
        ...mockAdvice,
        adjustments: [{ ...mockAdvice.adjustments[0], title: name }],
      });

      mockGetAdviceForPlant.mockImplementation(
        (city: any, flowerId: number) =>
          Promise.resolve(makeAdvice(`花${flowerId}`)),
      );

      useWeatherStore.setState({
        selectedCity: mockCityBeijing,
        weatherData: mockWeatherData,
        lastFetchAt: Date.now() - 1000,
      });

      // 同时请求 5 种花
      const results = await Promise.all([
        useWeatherStore.getState().getAdvice(1, '雏菊'),
        useWeatherStore.getState().getAdvice(2, '蒲公英'),
        useWeatherStore.getState().getAdvice(3, '玫瑰'),
        useWeatherStore.getState().getAdvice(4, '向日葵'),
        useWeatherStore.getState().getAdvice(5, '郁金香'),
      ]);

      // 全部有结果
      expect(results).toHaveLength(5);
      results.forEach(r => {
        expect(r).not.toBeNull();
      });

      // adviceMap 应有 5 条缓存
      const map = useWeatherStore.getState().adviceMap;
      expect(Object.keys(map)).toHaveLength(5);
      expect(map['北京:1']).toBeDefined();
      expect(map['北京:5']).toBeDefined();
    });
  });

  // ═══════════════════════════════════════════
  // 14. 类型完整性
  // ═══════════════════════════════════════════

  describe('类型完整性', () => {
    it('WeatherCondition 9 种值', () => {
      const valid: Array<'clear' | 'cloudy' | 'overcast' | 'rain' | 'drizzle' | 'thunderstorm' | 'snow' | 'fog' | 'windy'> = [
        'clear', 'cloudy', 'overcast', 'rain', 'drizzle',
        'thunderstorm', 'snow', 'fog', 'windy',
      ];
      valid.forEach(v => {
        expect({ ...mockWeatherData, condition: v }.condition).toBe(v);
      });
    });

    it('category 6 种值', () => {
      const cats: Array<'water' | 'temperature' | 'humidity' | 'light' | 'fertilize' | 'wind'> = [
        'water', 'temperature', 'humidity', 'light', 'fertilize', 'wind',
      ];
      cats.forEach(v => {
        expect({ category: v, icon: 'water', title: 't', advice: 'a', severity: 'info' as const }.category).toBe(v);
      });
    });

    it('severity 3 种值', () => {
      const sev: Array<'warning' | 'info' | 'success'> = ['warning', 'info', 'success'];
      sev.forEach(v => {
        expect({ category: 'water' as const, icon: 'water', title: 't', advice: 'a', severity: v }.severity).toBe(v);
      });
    });
  });
});

/**
 * 中国主要城市经纬度数据
 *
 * 覆盖全国主要气候区，用于天气查询
 * 接口 CityInfo 定义在 src/types/weather.ts（A 负责）
 */

import type {CityInfo} from '../types/weather';

export const CHINESE_CITIES: CityInfo[] = [
  // ━━ 华北 ━━
  {name: '北京', latitude: 39.9042, longitude: 116.4074},
  {name: '天津', latitude: 39.3434, longitude: 117.3616},
  {name: '石家庄', latitude: 38.0428, longitude: 114.5149},
  {name: '太原', latitude: 37.8706, longitude: 112.5489},
  {name: '呼和浩特', latitude: 40.8424, longitude: 111.749},

  // ━━ 东北 ━━
  {name: '沈阳', latitude: 41.8057, longitude: 123.4315},
  {name: '大连', latitude: 38.914, longitude: 121.6147},
  {name: '长春', latitude: 43.8171, longitude: 125.3235},
  {name: '哈尔滨', latitude: 45.8038, longitude: 126.535},

  // ━━ 华东 ━━
  {name: '上海', latitude: 31.2304, longitude: 121.4737},
  {name: '南京', latitude: 32.0603, longitude: 118.7969},
  {name: '杭州', latitude: 30.2741, longitude: 120.1551},
  {name: '合肥', latitude: 31.8206, longitude: 117.2272},
  {name: '福州', latitude: 26.0745, longitude: 119.2965},
  {name: '厦门', latitude: 24.4798, longitude: 118.0894},
  {name: '济南', latitude: 36.6512, longitude: 117.1201},
  {name: '青岛', latitude: 36.0671, longitude: 120.3826},

  // ━━ 华中 ━━
  {name: '郑州', latitude: 34.7466, longitude: 113.6254},
  {name: '武汉', latitude: 30.5928, longitude: 114.3055},
  {name: '长沙', latitude: 28.2282, longitude: 112.9388},

  // ━━ 华南 ━━
  {name: '广州', latitude: 23.1291, longitude: 113.2644},
  {name: '深圳', latitude: 22.5431, longitude: 114.0579},
  {name: '南宁', latitude: 22.817, longitude: 108.3665},
  {name: '海口', latitude: 20.044, longitude: 110.1999},

  // ━━ 西南 ━━
  {name: '重庆', latitude: 29.4316, longitude: 106.9123},
  {name: '成都', latitude: 30.5728, longitude: 104.0668},
  {name: '贵阳', latitude: 26.647, longitude: 106.6302},
  {name: '昆明', latitude: 25.0389, longitude: 102.7183},
  {name: '拉萨', latitude: 29.65, longitude: 91.1},

  // ━━ 西北 ━━
  {name: '西安', latitude: 34.3416, longitude: 108.9398},
  {name: '兰州', latitude: 36.0611, longitude: 103.8343},
  {name: '西宁', latitude: 36.6171, longitude: 101.7785},
  {name: '银川', latitude: 38.4872, longitude: 106.2309},
  {name: '乌鲁木齐', latitude: 43.8256, longitude: 87.6168},
];

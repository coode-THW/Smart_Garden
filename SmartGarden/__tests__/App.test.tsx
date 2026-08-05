/**
 * @format
 * 智慧花园 — 根组件测试
 * =====================
 * onnxruntime-react-native 是原生模块，在 Jest 中需要 mock。
 */

// Mock geolocation（原生模块）
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

// Mock netinfo（原生模块）
jest.mock('@react-native-community/netinfo', () => ({
  fetch: jest.fn().mockResolvedValue({
    isConnected: true,
    isInternetReachable: true,
  }),
  addEventListener: jest.fn(),
  configure: jest.fn(),
}));

// Mock onnxruntime-react-native（原生模块）
jest.mock('onnxruntime-react-native', () => ({
  InferenceSession: {
    create: jest.fn().mockResolvedValue({
      run: jest.fn().mockResolvedValue({
        output: {data: new Float32Array([0.1, 0.2, 0.3, 0.2, 0.2]), dims: [1, 5]},
      }),
    }),
  },
  Tensor: jest.fn().mockImplementation(
    (type: string, data: any, dims?: number[]) => ({type, data, dims}),
  ),
}));

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';

// --- Mock native modules (no native bindings in Jest) ---

jest.mock('react-native-quick-sqlite', () => ({
  open: jest.fn(() => ({
    execute: jest.fn(() => ({rows: []})),
    executeAsync: jest.fn(() => ({rows: {_array: [], length: 0}})),
    close: jest.fn(),
  })),
}));

jest.mock('onnxruntime-react-native', () => ({
  InferenceSession: {
    create: jest.fn(),
  },
  Tensor: jest.fn(),
}));

jest.mock('react-native-fs', () => ({
  mkdir: jest.fn(),
  moveFile: jest.fn(),
  copyFile: jest.fn(),
  pathForBundle: jest.fn(),
  pathForGroup: jest.fn(),
  getFSInfo: jest.fn(),
  getAllExternalFilesDirs: jest.fn(),
  unlink: jest.fn(),
  exists: jest.fn(),
  stopDownload: jest.fn(),
  resumeDownload: jest.fn(),
  isResumable: jest.fn(),
  stopUpload: jest.fn(),
  completeHandlerIOS: jest.fn(),
  readDir: jest.fn(),
  readDirAssets: jest.fn(),
  existsAssets: jest.fn(),
  readdir: jest.fn(),
  setReadable: jest.fn(),
  stat: jest.fn(),
  readFile: jest.fn(),
  read: jest.fn(),
  readFileAssets: jest.fn(),
  hash: jest.fn(),
  copyFileAssets: jest.fn(),
  copyFileAssetsIOS: jest.fn(),
  copyAssetsVideoIOS: jest.fn(),
  write: jest.fn(),
  writeFile: jest.fn(),
  appendFile: jest.fn(),
  moveFileAssets: jest.fn(),
  downloadFile: jest.fn(),
  uploadFiles: jest.fn(),
  touch: jest.fn(),
  MainBundlePath: '/mock',
  CachesDirectoryPath: '/mock',
  DocumentDirectoryPath: '/mock',
  ExternalDirectoryPath: '/mock',
  TemporaryDirectoryPath: '/mock',
  LibraryDirectoryPath: '/mock',
  PicturesDirectoryPath: '/mock',
}));

jest.mock('react-native-image-picker', () => ({
  launchCamera: jest.fn(),
  launchImageLibrary: jest.fn(),
}));

jest.mock('react-native-image-resizer', () => ({
  createResizedImage: jest.fn(),
}));

jest.mock('react-native-vision-camera', () => ({
  Camera: ({children}: {children: React.ReactNode}) => children,
  useCameraDevice: jest.fn(() => null),
  useCameraPermission: jest.fn(() => ({hasPermission: true, requestPermission: jest.fn()})),
  useFrameProcessor: jest.fn(),
}));

jest.mock('react-native-paper', () => {
  const {Text, View} = require('react-native');
  return {
    Provider: ({children}: {children: React.ReactNode}) => children,
    DefaultTheme: {colors: {}},
    Button: (props: any) => <View {...props} />,
    Icon: (props: any) => <Text {...props} />,
    useTheme: () => ({
      colors: {primary: '#4caf50', accent: '#03dac4'},
    }),
  };
});

// --- Mock react-navigation ---

jest.mock('@react-navigation/native-stack', () => ({
  createNativeStackNavigator: () => ({
    Navigator: ({children}: {children: React.ReactNode}) => children,
    Screen: () => null,
  }),
}));

jest.mock('@react-navigation/bottom-tabs', () => ({
  createBottomTabNavigator: () => ({
    Navigator: ({children}: {children: React.ReactNode}) => children,
    Screen: () => null,
  }),
}));

jest.mock('@react-navigation/native', () => ({
  NavigationContainer: ({children}: {children: React.ReactNode}) => children,
  DefaultTheme: {colors: {}},
  DarkTheme: {colors: {}},
  useNavigation: () => ({navigate: jest.fn()}),
}));

// --- Mock asset files ---

jest.mock('../assets/yolov11n-flower.onnx', () => 'mocked-onnx-path', {virtual: true});

// Mock WelcomeScreen：其内部有 Animated.loop 无限动画，
// 会让 async act() 的渲染稳定等待永不收敛，故替换为轻量组件
jest.mock('../src/screens/WelcomeScreen', () => 'WelcomeScreen');

// Mock fetch：测试环境无网络，统一返回 404，让启动期异步
// （模型版本检查/天气/网络探测）在测试内正常结束，避免
// 测试结束后才 settle 触发 "Cannot log after tests are done"
(globalThis as any).fetch = jest.fn().mockResolvedValue({
  ok: false,
  status: 404,
});

// --- Import app ---

import App from '../App';

test('renders correctly', async () => {
  await ReactTestRenderer.act(() => {
    ReactTestRenderer.create(<App />);
  });
});

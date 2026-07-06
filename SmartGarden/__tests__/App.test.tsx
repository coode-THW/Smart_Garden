/**
 * @format
 * 智慧花园 — 根组件测试
 * =====================
 * onnxruntime-react-native 是原生模块，在 Jest 中需要 mock。
 */

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

// --- Import app ---

import App from '../App';

test('renders correctly', async () => {
  await ReactTestRenderer.act(() => {
    ReactTestRenderer.create(<App />);
  });
});

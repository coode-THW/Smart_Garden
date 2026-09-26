module.exports = {
  preset: '@react-native/jest-preset',
  moduleNameMapper: {
    '\\.onnx$': '<rootDir>/__mocks__/fileMock.js',
  },
  // __tests__/helpers/ 是共享测试工具，不是测试用例本身
  // （否则默认 testMatch 会把它当测试文件跑，报「no tests」）
  testPathIgnorePatterns: ['/node_modules/', '/__tests__/helpers/'],
  transformIgnorePatterns: [
    'node_modules/(?!(' +
      '@react-native|' +
      'react-native|' +
      '@react-navigation|' +
      'react-native-.*|' +
      '@react-native-community|' +
      '@react-native-paper|' +
      'react-native-paper|' +
      'react-native-safe-area-context|' +
      'react-native-screens|' +
      'react-native-vector-icons|' +
      'react-native-quick-sqlite|' +
      'onnxruntime-react-native' +
      ')/)',
  ],
};

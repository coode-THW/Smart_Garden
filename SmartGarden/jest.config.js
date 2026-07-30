module.exports = {
  preset: '@react-native/jest-preset',
  moduleNameMapper: {
    '\\.onnx$': '<rootDir>/__mocks__/fileMock.js',
  },
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

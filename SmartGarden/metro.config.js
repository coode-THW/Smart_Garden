const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */
const defaultConfig = getDefaultConfig(__dirname);

const config = {
  resolver: {
    assetExts: [...defaultConfig.resolver.assetExts, 'onnx'],
    blockList: [/\.cxx\/.*/],
  },
  watcher: {
    watchman: { deferStates: ['hg.update'] },
  },
  watchFolders: [__dirname],
  resetCache: true,
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);

/**
 * SmartGarden — 智慧花园 APP 入口
 *
 * 底部标签导航: 首页 / 识别 / 花园
 * 花卉拍照识别 · YOLOv11 ONNX 本地推理
 */

import React from 'react';
import {StatusBar, useColorScheme} from 'react-native';
import {Provider as PaperProvider, DefaultTheme} from 'react-native-paper';
import {
  NavigationContainer,
  DefaultTheme as NavigationDefaultTheme,
  DarkTheme as NavigationDarkTheme,
} from '@react-navigation/native';
import RootNavigator from './src/navigation/RootNavigator';

const paperTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: '#4caf50',
    accent: '#03dac4',
  },
};

function App(): React.JSX.Element {
  const isDarkMode = useColorScheme() === 'dark';
  const navigationTheme = isDarkMode
    ? NavigationDarkTheme
    : NavigationDefaultTheme;

  return (
    <PaperProvider theme={paperTheme}>
      <NavigationContainer theme={navigationTheme}>
        <StatusBar
          barStyle={isDarkMode ? 'light-content' : 'dark-content'}
        />
        <RootNavigator />
      </NavigationContainer>
    </PaperProvider>
  );
}

export default App;

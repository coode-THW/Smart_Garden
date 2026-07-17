/**
 * SmartGarden — 智慧花园 APP 入口
 *
 * 启动流程：显示欢迎页（4页引导+模型加载进度）→ 进入主界面
 */

import React, {useEffect, useState} from 'react';
import {StatusBar, useColorScheme} from 'react-native';
import {Provider as PaperProvider, DefaultTheme} from 'react-native-paper';
import {
  NavigationContainer,
  DefaultTheme as NavigationDefaultTheme,
  DarkTheme as NavigationDarkTheme,
} from '@react-navigation/native';
import RootNavigator from './src/navigation/RootNavigator';
import WelcomeScreen from './src/screens/WelcomeScreen';
import YoloService from './src/services/YoloService';
import {UserService} from './src/services/UserService';
import {COLORS} from './src/constants';

const paperTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: COLORS.forest,
    secondary: COLORS.earth,
  },
};

// ━━━ 根组件 ━━━

function App(): React.JSX.Element {
  const isDarkMode = useColorScheme() === 'dark';
  const navigationTheme = isDarkMode
    ? NavigationDarkTheme
    : NavigationDefaultTheme;

  const [showWelcome, setShowWelcome] = useState(true);
  const [progress, setProgress] = useState(0);
  const [isModelReady, setIsModelReady] = useState(false);

  // — 启动时预加载模型 + 初始化用户 —
  useEffect(() => {
    Promise.all([
      YoloService.getInstance().loadModel(pct => setProgress(pct)),
      UserService.getInstance().initialize(),
    ])
      .then(() => {
        setIsModelReady(true);
      })
      .catch(() => {
        // 加载失败也允许进入（识别页会显示错误）
        setIsModelReady(true);
      });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleEnterApp = () => {
    setShowWelcome(false);
  };

  return (
    <PaperProvider theme={paperTheme}>
      <NavigationContainer theme={navigationTheme}>
        <StatusBar
          barStyle={isDarkMode ? 'light-content' : 'dark-content'}
          backgroundColor={isDarkMode ? COLORS.bgDark : COLORS.bg}
        />
        <RootNavigator />
      </NavigationContainer>

      {/* 欢迎页覆盖层 */}
      {showWelcome && (
        <WelcomeScreen
          progress={progress}
          isReady={isModelReady}
          onEnterApp={handleEnterApp}
        />
      )}
    </PaperProvider>
  );
}

export default App;

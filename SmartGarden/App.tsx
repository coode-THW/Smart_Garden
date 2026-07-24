/**
 * SmartGarden — 智慧花园 APP 入口
 *
 * 启动流程：显示欢迎页（4页引导+模型加载进度）→ 进入主界面
 *
 * Phase 1 第4单元优化：
 * - 模型版本检查和更新
 * - 启动预加载超时处理
 * - 详细的加载状态管理
 */

import './src/setupEnv'; // ⚠️ 必须最先：注入 .env API Key 到 globalThis

import React, { useEffect, useState } from 'react';
import { StatusBar, useColorScheme } from 'react-native';
import { Provider as PaperProvider, DefaultTheme } from 'react-native-paper';
import {
  NavigationContainer,
  DefaultTheme as NavigationDefaultTheme,
  DarkTheme as NavigationDarkTheme,
} from '@react-navigation/native';
import RootNavigator from './src/navigation/RootNavigator';
import WelcomeScreen from './src/screens/WelcomeScreen';
import YoloService from './src/services/YoloService';
import { UserService } from './src/services/UserService';
import ModelUpdateService from './src/services/ModelUpdateService';
import { COLORS } from './src/constants';
import logger from './src/services/LoggerService';

const paperTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: COLORS.forest,
    secondary: COLORS.earth,
  },
};

const PRELOAD_TIMEOUT_MS = 20000;

async function checkModelUpdateInBackground(): Promise<void> {
  try {
    const updateService = ModelUpdateService.getInstance();
    const updateInfo = await updateService.checkForUpdate();
    if (updateInfo) {
      logger.info('App', `发现模型更新: ${updateInfo.version}`);
      logger.info('App', `更新说明: ${updateInfo.changelog}`);
    }
  } catch (e) {
    logger.debug('App', '后台检查模型更新失败（可能是测试环境）:', e);
  }
}

function App(): React.JSX.Element {
  const isDarkMode = useColorScheme() === 'dark';
  const navigationTheme = isDarkMode
    ? NavigationDarkTheme
    : NavigationDefaultTheme;

  const [showWelcome, setShowWelcome] = useState(true);
  const [progress, setProgress] = useState(0);
  const [isModelReady, setIsModelReady] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState<string>('');

  useEffect(() => {
    logger.init();

    const startTime = Date.now();
    let timeoutId: ReturnType<typeof setTimeout>;

    const timeoutPromise = new Promise<void>(resolve => {
      timeoutId = setTimeout(() => {
        logger.warn(
          'App',
          `预加载超时（${PRELOAD_TIMEOUT_MS}ms），跳过剩余任务`,
        );
        resolve();
      }, PRELOAD_TIMEOUT_MS);
    });

    const initPromise = (async () => {
      setLoadingStatus('初始化用户...');
      await UserService.getInstance().initialize();

      setLoadingStatus('检查模型更新...');
      await ModelUpdateService.getInstance().initialize();
      checkModelUpdateInBackground();

      setLoadingStatus('加载AI模型...');
      await YoloService.getInstance().loadModel(
        pct => setProgress(pct),
        PRELOAD_TIMEOUT_MS,
      );

      const loadTime = Date.now() - startTime;
      logger.info('App', `启动预加载完成 (${loadTime}ms)`);
    })();

    Promise.race([initPromise, timeoutPromise])
      .then(() => {
        clearTimeout(timeoutId);
        setIsModelReady(true);
        logger.info('App', '启动预加载完成');
      })
      .catch(error => {
        clearTimeout(timeoutId);
        logger.error('App', '启动预加载失败:', error);
        setIsModelReady(true);
      });

    return () => {
      clearTimeout(timeoutId);
    };
  }, []);

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

      {showWelcome && (
        <WelcomeScreen
          progress={progress}
          isReady={isModelReady}
          onEnterApp={handleEnterApp}
          statusText={loadingStatus}
        />
      )}
    </PaperProvider>
  );
}

export default App;

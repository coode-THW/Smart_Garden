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
import knowledgeUpdateService from './src/services/KnowledgeUpdateService';
import { COLORS } from './src/constants';
import logger from './src/services/LoggerService';
import { useWeatherStore } from './src/store/useWeatherStore';

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

/**
 * 后台检查并应用知识库在线更新（Day51-56）。
 *
 * 静默、不阻塞启动：`checkForUpdate` 与 `downloadAndApply` 都保证
 * **永不 reject**，所有失败（离线 / 未配置地址 / 超时 / 清单非法 /
 * 单个文件下载失败）都转成带错误信息的返回值。这里只记日志，不打扰用户。
 *
 * 先检查再决定要不要下载 —— 大多数启动都没有新版，不该白下几十个文件。
 */
async function checkKnowledgeUpdateInBackground(): Promise<void> {
  const check = await knowledgeUpdateService.checkForUpdate();

  if (!check.updateAvailable) {
    logger.debug(
      'App',
      `知识库检查: ${check.state}（本地 ${check.localVersion}）`,
    );
    return;
  }

  logger.info(
    'App',
    `知识库有新版 ${check.remoteVersion}（本地 ${check.localVersion}），` +
      `${Object.keys(check.changedFiles).length} 个文件待下载`,
  );

  // downloadAndApply 内部会复用上面这次检查的结果，不会重复拉清单
  const applied = await knowledgeUpdateService.downloadAndApply();

  if (applied.ok) {
    logger.info('App', `知识库已更新至 ${applied.version}（${applied.downloaded} 份）`);
  } else {
    // 失败不是异常情况：下次启动会自动重试（版本号没前进，不会被判定为已最新）
    logger.warn(
      'App',
      `知识库更新未完成（成功 ${applied.downloaded} 份` +
        `${applied.failed.length ? `，失败 ${applied.failed.length}` : ''}` +
        `${applied.rejected.length ? `，内容非法 ${applied.rejected.length}` : ''}），` +
        `下次启动重试`,
    );
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

      // 知识库在线更新检查：后台跑，不 await —— 网络慢不能拖慢启动。
      // 不设 loadingStatus：它是并行发生的，写进进度文案反而误导
      checkKnowledgeUpdateInBackground();

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

  // ━━ GPS 自动定位（不阻塞启动流程） ━━
  const autoLocate = useWeatherStore(s => s.autoLocate);

  useEffect(() => {
    autoLocate();
  }, [autoLocate]);

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

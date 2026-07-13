/**
 * SmartGarden — 智慧花园 APP 入口
 *
 * 启动流程：显示启动画面 → 预加载 ONNX 模型 → 淡入主界面
 */

import React, {useEffect, useRef, useState} from 'react';
import {
  Animated,
  StatusBar,
  StyleSheet,
  Text,
  useColorScheme,
  View,
} from 'react-native';
import {Provider as PaperProvider, DefaultTheme} from 'react-native-paper';
import {
  NavigationContainer,
  DefaultTheme as NavigationDefaultTheme,
  DarkTheme as NavigationDarkTheme,
} from '@react-navigation/native';
import RootNavigator from './src/navigation/RootNavigator';
import { testOnnxMinimal } from './src/services/test_onnx_minimal';
import { testRandomTensorPreprocessing } from './src/services/test_preprocessor';
import YoloService from './src/services/YoloService';

const paperTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: '#A3B899',
    secondary: '#CD5C5C',
  },
};

// ━━━ 启动画面 ━━━

function SplashScreen({progress}: {progress: number}) {
  const isDark = useColorScheme() === 'dark';
  const bg = isDark ? '#1E1E1C' : '#F9F8F4';
  const textColor = isDark ? '#E4E0D8' : '#2D2D2A';

  const barWidth = Math.min(progress, 100);

  return (
    <View style={[styles.splash, {backgroundColor: bg}]}>
      <Text style={styles.splashIcon}>🌿</Text>
      <Text style={[styles.splashTitle, {color: textColor}]}>智慧花园</Text>
      <Text style={styles.splashSub}>Smart Garden</Text>

      <View style={styles.progressTrack}>
        <View
          style={[styles.progressBar, {width: `${barWidth}%`}]}
        />
      </View>
      <Text style={styles.splashHint}>AI 引擎初始化中…</Text>
    </View>
  );
}

// ━━━ 根组件 ━━━

function App(): React.JSX.Element {
  const isDarkMode = useColorScheme() === 'dark';
  const navigationTheme = isDarkMode
    ? NavigationDarkTheme
    : NavigationDefaultTheme;

  // 应用启动时执行测试
  useEffect(() => {
    console.log('\n========== SmartGarden 启动测试 ==========');

    // Test 1: ONNX 推理最小示例
    testOnnxMinimal()
      .then(() => console.log('\n✅ ONNX 测试完成'))
      .catch(e => console.error('\n❌ ONNX 测试失败:', e));

    // Test 2: 随机数据预处理验证
    try {
      testRandomTensorPreprocessing();
      console.log('✅ 预处理测试完成');
    } catch (e) {
      console.error('❌ 预处理测试失败:', e);
    }

    console.log('========== 启动测试结束 ==========');
  }, []);

  const [isReady, setIsReady] = useState(false);
  const [progress, setProgress] = useState(0);
  const fadeAnim = useRef(new Animated.Value(1)).current;

  // — 启动时预加载模型 —
  useEffect(() => {
    YoloService.getInstance()
      .loadModel(pct => setProgress(pct))
      .then(() => {
        // 淡出启动画面
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 350,
          useNativeDriver: true,
        }).start(() => setIsReady(true));
      })
      .catch(() => {
        // 加载失败也进入主界面（识别页会显示错误）
        setIsReady(true);
      });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <PaperProvider theme={paperTheme}>
      <NavigationContainer theme={navigationTheme}>
        <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
        <RootNavigator />
      </NavigationContainer>

      {/* 启动覆盖层 */}
      {!isReady && (
        <Animated.View
          style={[styles.overlay, {opacity: fadeAnim}]}
          pointerEvents="none">
          <SplashScreen progress={progress} />
        </Animated.View>
      )}
    </PaperProvider>
  );
}

// ━━━ 样式 ━━━

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFill,
    zIndex: 999,
  },
  splash: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  splashIcon: {fontSize: 64, marginBottom: 16},
  splashTitle: {
    fontSize: 28,
    fontWeight: '600',
    marginBottom: 4,
  },
  splashSub: {
    fontSize: 13,
    color: '#A3B899',
    letterSpacing: 4,
    marginBottom: 48,
  },
  progressTrack: {
    width: '80%',
    maxWidth: 240,
    height: 4,
    backgroundColor: '#E0DCD4',
    borderRadius: 2,
    overflow: 'hidden',
    marginBottom: 12,
  },
  progressBar: {
    height: '100%',
    backgroundColor: '#A3B899',
    borderRadius: 2,
  },
  splashHint: {
    fontSize: 12,
    color: '#A0A89A',
  },
});

export default App;

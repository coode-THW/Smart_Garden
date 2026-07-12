/**
 * SmartGarden — 智慧花园 APP 入口
 *
 * 底部标签导航: 首页 / 识别 / 花园
 * 花卉拍照识别 · YOLOv11 ONNX 本地推理
 */

import React, { useEffect } from 'react';
import { StatusBar, useColorScheme } from 'react-native';
import { Provider as PaperProvider, DefaultTheme } from 'react-native-paper';
import {
  NavigationContainer,
  DefaultTheme as NavigationDefaultTheme,
  DarkTheme as NavigationDarkTheme,
} from '@react-navigation/native';
import RootNavigator from './src/navigation/RootNavigator';
import { testOnnxMinimal } from './src/services/test_onnx_minimal';
import { testRandomTensorPreprocessing } from './src/services/test_preprocessor';

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

  return (
    <PaperProvider theme={paperTheme}>
      <NavigationContainer theme={navigationTheme}>
        <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
        <RootNavigator />
      </NavigationContainer>
    </PaperProvider>
  );
}

export default App;

/**
 * NeumorphView — 新拟态容器
 *
 * 双 View 叠加模拟新拟态双影效果：
 *   外层 → 右下暗影（深度）
 *   内层 → 左上亮影（高光）
 *
 * 卡片与背景同色是新拟态核心原则。
 */

import React from 'react';
import {StyleSheet, View, type ViewStyle} from 'react-native';
import {COLORS, NEU_LEVEL, RADIUS} from '../constants';

type Level = keyof typeof NEU_LEVEL;

interface Props {
  level?: Level;
  style?: ViewStyle;
  bg?: string;
  radius?: number;
  children: React.ReactNode;
}

function NeumorphView({
  level = 'l2',
  style,
  bg = COLORS.bg,
  radius = RADIUS.lg,
  children,
}: Props): React.JSX.Element {
  const {lightOffset, darkOffset, blur} = NEU_LEVEL[level];

  const outer: ViewStyle = {
    backgroundColor: bg,
    borderRadius: radius,
    // 右下暗影
    shadowColor: '#000',
    shadowOffset: darkOffset,
    shadowOpacity: 0.08,
    shadowRadius: blur,
    elevation: level === 'l1' ? 2 : level === 'l2' ? 4 : 8,
  };

  const inner: ViewStyle = {
    backgroundColor: bg,
    borderRadius: radius,
    // 左上亮影
    shadowColor: COLORS.lightShadow,
    shadowOffset: lightOffset,
    shadowOpacity: 0.9,
    shadowRadius: blur,
    elevation: 0,
  };

  return (
    <View style={[outer, style]}>
      <View style={inner}>
        <View style={[styles.content, {borderRadius: radius - 1}]}>
          {children}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    overflow: 'hidden',
  },
});

export default NeumorphView;

/**
 * ButtonGroup — 按钮组容器
 *
 * 自动处理按钮的水平/垂直排列，保证在小屏幕上不溢出
 * 支持均匀分布、居中对齐、自动换行
 */

import React from 'react';
import {StyleSheet, View, type ViewStyle} from 'react-native';
import {SPACING} from '../constants';

interface Props {
  children: React.ReactNode;
  align?: 'left' | 'center' | 'stretch';
  wrap?: boolean;
  vertical?: boolean;
  style?: ViewStyle;
  gap?: number;
}

function ButtonGroup({
  children,
  align = 'center',
  wrap = true,
  vertical = false,
  style,
  gap = 10,
}: Props): React.JSX.Element {
  const alignStyle = vertical
    ? align === 'stretch'
      ? {alignItems: 'stretch' as const}
      : {alignItems: align === 'center' ? 'center' as const : 'flex-start' as const}
    : align === 'stretch'
      ? {justifyContent: 'space-between' as const}
      : align === 'center'
        ? {justifyContent: 'center' as const}
        : {justifyContent: 'flex-start' as const};

  return (
    <View
      style={[
        styles.container,
        vertical ? styles.vertical : styles.horizontal,
        wrap && !vertical && styles.wrap,
        {gap},
        alignStyle,
        style,
      ]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  horizontal: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  vertical: {
    flexDirection: 'column',
  },
  wrap: {
    flexWrap: 'wrap',
  },
});

export default ButtonGroup;

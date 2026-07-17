/**
 * DesignCard — 有机自然主义风格卡片
 *
 * 替代 NeumorphView，使用精致阴影 + 纯白卡片 + 圆角
 * 营造层次感和材质感。
 */

import React from 'react';
import {StyleSheet, View, type ViewStyle} from 'react-native';
import {COLORS, RADIUS, SHADOWS} from '../constants';

interface Props {
  style?: ViewStyle;
  bg?: string;
  radius?: number;
  shadow?: 'card' | 'cardHover' | 'modal' | 'none';
  padding?: number;
  children: React.ReactNode;
}

function DesignCard({
  style,
  bg = COLORS.card,
  radius = RADIUS.xl,
  shadow = 'card',
  padding = 0,
  children,
}: Props): React.JSX.Element {
  const shadowStyle = shadow === 'none' ? {} : SHADOWS[shadow];

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: bg,
          borderRadius: radius,
          padding: padding,
        },
        shadowStyle,
        style,
      ]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    overflow: 'hidden',
  },
});

export default DesignCard;

/**
 * DesignCard — 有机自然主义风格卡片
 *
 * 精致阴影 + 圆角 + 可选细边框
 * 营造层次感和材质感。支持 none/light/card/hover/modal 五档阴影。
 */

import React from 'react';
import {StyleSheet, View, type ViewStyle, useColorScheme} from 'react-native';
import {COLORS, RADIUS, SHADOWS} from '../constants';

interface Props {
  style?: ViewStyle;
  bg?: string;
  radius?: number;
  shadow?: 'none' | 'card' | 'cardHover' | 'modal' | 'button' | 'floating';
  padding?: number;
  bordered?: boolean;
  children: React.ReactNode;
}

function DesignCard({
  style,
  bg,
  radius = RADIUS.xl,
  shadow = 'card',
  padding = 0,
  bordered = false,
  children,
}: Props): React.JSX.Element {
  const isDark = useColorScheme() === 'dark';
  const shadowStyle = shadow === 'none' ? {} : SHADOWS[shadow] || SHADOWS.card;
  const backgroundColor = bg ?? (isDark ? COLORS.cardDark : COLORS.card);
  const borderColor = isDark ? COLORS.borderDark : COLORS.border;

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor,
          borderRadius: radius,
          padding: padding,
        },
        bordered && {
          borderWidth: StyleSheet.hairlineWidth,
          borderColor,
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

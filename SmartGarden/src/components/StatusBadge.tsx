/**
 * StatusBadge — 状态胶囊标签
 *
 * 用于标记植物状态：健康、需浇水、新芽等
 * 自动适配暗色模式
 */

import React from 'react';
import {StyleSheet, Text, View, useColorScheme} from 'react-native';
import {COLORS, RADIUS, TYPOGRAPHY} from '../constants';

export type BadgeVariant = 'success' | 'warning' | 'error' | 'info' | 'default';

interface Props {
  text: string;
  variant?: BadgeVariant;
  style?: object;
}

const LIGHT_VARIANTS: Record<BadgeVariant, {bg: string; text: string}> = {
  success: {bg: COLORS.successLight, text: COLORS.success},
  warning: {bg: COLORS.warningLight, text: COLORS.warning},
  error: {bg: COLORS.errorLight, text: COLORS.error},
  info: {bg: COLORS.infoLight, text: COLORS.info},
  default: {bg: '#F0EDE8', text: COLORS.textSecondary},
};

const DARK_VARIANTS: Record<BadgeVariant, {bg: string; text: string}> = {
  success: {bg: COLORS.success + '25', text: '#7FC8A0'},
  warning: {bg: COLORS.warning + '25', text: '#E8C060'},
  error: {bg: COLORS.error + '25', text: '#E89090'},
  info: {bg: COLORS.info + '25', text: '#7AB0E8'},
  default: {bg: COLORS.borderDark, text: COLORS.textSecondaryDark},
};

function StatusBadge({text, variant = 'default', style}: Props): React.JSX.Element {
  const isDark = useColorScheme() === 'dark';
  const variants = isDark ? DARK_VARIANTS : LIGHT_VARIANTS;
  const colors = variants[variant];
  return (
    <View style={[styles.badge, {backgroundColor: colors.bg}, style]}>
      <Text style={[styles.text, {color: colors.text}]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: RADIUS.pill,
    alignSelf: 'flex-start',
  },
  text: {
    ...TYPOGRAPHY.buttonSmall,
    fontSize: 11,
    fontWeight: '600',
  },
});

export default StatusBadge;

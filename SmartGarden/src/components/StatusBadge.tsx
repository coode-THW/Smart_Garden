/**
 * StatusBadge — 状态胶囊标签
 *
 * 用于标记植物状态：健康、需浇水、新芽等
 */

import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {COLORS, RADIUS, TYPOGRAPHY} from '../constants';

export type BadgeVariant = 'success' | 'warning' | 'error' | 'info' | 'default';

interface Props {
  text: string;
  variant?: BadgeVariant;
  style?: object;
}

const VARIANT_STYLES: Record<BadgeVariant, {bg: string; text: string}> = {
  success: {bg: '#E8F5E9', text: COLORS.forest},
  warning: {bg: '#FFF8E1', text: '#F57F17'},
  error: {bg: '#FFEBEE', text: COLORS.error},
  info: {bg: '#E3F2FD', text: COLORS.info},
  default: {bg: '#F5F5F5', text: COLORS.textSecondary},
};

function StatusBadge({text, variant = 'default', style}: Props): React.JSX.Element {
  const colors = VARIANT_STYLES[variant];
  return (
    <View style={[styles.badge, {backgroundColor: colors.bg}, style]}>
      <Text style={[styles.text, {color: colors.text}]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: RADIUS.pill,
    alignSelf: 'flex-start',
  },
  text: {
    ...TYPOGRAPHY.buttonSmall,
    fontSize: 11,
  },
});

export default StatusBadge;

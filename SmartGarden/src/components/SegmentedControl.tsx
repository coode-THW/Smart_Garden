/**
 * SegmentedControl — 分段控制器
 *
 * 用于页面内 tab 切换，有机自然主义风格
 * 自适应宽度，支持等分布局
 */

import React from 'react';
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useColorScheme,
} from 'react-native';
import {Icon} from 'react-native-paper';
import {COLORS, RADIUS, SPACING, TYPOGRAPHY} from '../constants';

interface Segment {
  key: string;
  label: string;
  icon?: string;
}

interface Props {
  segments: Segment[];
  activeKey: string;
  onChange: (key: string) => void;
  fullWidth?: boolean;
}

function SegmentedControl({
  segments,
  activeKey,
  onChange,
  fullWidth = true,
}: Props): React.JSX.Element {
  const isDark = useColorScheme() === 'dark';

  const trackBg = isDark ? 'rgba(255,255,255,0.05)' : COLORS.bgSecondary;
  const activeBg = isDark ? COLORS.forestDark : COLORS.card;
  const activeText = isDark ? COLORS.sageLight : COLORS.forest;
  const inactiveText = isDark ? COLORS.textSecondaryDark : COLORS.textSecondary;
  const borderColor = isDark ? 'transparent' : COLORS.border;

  return (
    <View
      style={[
        styles.track,
        {backgroundColor: trackBg},
        fullWidth && styles.fullWidth,
      ]}>
      {segments.map(seg => {
        const active = seg.key === activeKey;
        return (
          <TouchableOpacity
            key={seg.key}
            activeOpacity={0.8}
            onPress={() => onChange(seg.key)}
            style={[
              styles.segment,
              active && [
                styles.activeSegment,
                {
                  backgroundColor: activeBg,
                  borderColor,
                },
              ],
              fullWidth && styles.segmentFlex,
            ]}>
            {seg.icon && (
              <Icon
                source={seg.icon}
                size={15}
                color={active ? activeText : inactiveText}
              />
            )}
            <Text
              style={[
                styles.label,
                {color: active ? activeText : inactiveText},
                active && styles.activeLabel,
              ]}>
              {seg.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    borderRadius: RADIUS.lg,
    padding: 3,
    gap: 2,
  },
  fullWidth: {},
  segment: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.lg,
    borderRadius: RADIUS.md,
    gap: 5,
  },
  segmentFlex: {
    flex: 1,
  },
  activeSegment: {
    borderWidth: StyleSheet.hairlineWidth,
    shadowColor: '#2D5A3D',
    shadowOffset: {width: 0, height: 1},
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  label: {
    ...TYPOGRAPHY.buttonSmall,
    fontSize: 13,
    fontWeight: '500',
  },
  activeLabel: {
    fontWeight: '600',
  },
});

export default SegmentedControl;

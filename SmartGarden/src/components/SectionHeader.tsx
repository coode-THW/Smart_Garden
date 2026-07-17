/**
 * SectionHeader — 杂志编辑风格区块标题
 *
 * 英文小标签 + 中文大标题的非对称组合
 * 营造编辑感和层次感。
 */

import React from 'react';
import {StyleSheet, Text, View, type ViewStyle} from 'react-native';
import {COLORS, SPACING, TYPOGRAPHY} from '../constants';

interface Props {
  label: string;
  title: string;
  labelColor?: string;
  titleColor?: string;
  style?: ViewStyle;
  rightElement?: React.ReactNode;
}

function SectionHeader({
  label,
  title,
  labelColor = COLORS.sageDark,
  titleColor = COLORS.text,
  style,
  rightElement,
}: Props): React.JSX.Element {
  return (
    <View style={[styles.container, style]}>
      <View style={styles.textBlock}>
        <Text style={[styles.label, {color: labelColor}]}>{label.toUpperCase()}</Text>
        <Text style={[styles.title, {color: titleColor}]}>{title}</Text>
      </View>
      {rightElement && <View style={styles.right}>{rightElement}</View>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginBottom: SPACING.lg,
  },
  textBlock: {
    flex: 1,
  },
  label: {
    ...TYPOGRAPHY.label,
    marginBottom: SPACING.xs,
  },
  title: {
    ...TYPOGRAPHY.h2,
  },
  right: {
    marginLeft: SPACING.md,
    marginBottom: SPACING.xs,
  },
});

export default SectionHeader;

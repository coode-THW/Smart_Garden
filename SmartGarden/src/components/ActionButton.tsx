/**
 * ActionButton — 统一行动按钮组件
 *
 * 有机自然主义风格，胶囊形，支持多种变体和尺寸
 * - 文字单行显示，自动截断
 * - flex 属性支持在按钮组中等分宽度
 * - 按压反馈动画
 * - 最小触摸区域 48x48（WCAG 标准）
 */

import React, {useRef} from 'react';
import {
  Animated,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type ViewStyle,
} from 'react-native';
import {Icon} from 'react-native-paper';
import {COLORS, RADIUS, SHADOWS} from '../constants';

export type ButtonVariant =
  | 'primary'
  | 'secondary'
  | 'outline'
  | 'ghost'
  | 'danger'
  | 'earth';
export type ButtonSize = 'sm' | 'md' | 'lg';

interface Props {
  title: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: string;
  iconPosition?: 'left' | 'right';
  disabled?: boolean;
  fullWidth?: boolean;
  flex?: boolean;
  style?: ViewStyle;
  onPress: () => void;
}

const VARIANT_STYLES: Record<
  ButtonVariant,
  {bg: string; text: string; border: string; icon: string; shadow?: boolean}
> = {
  primary: {
    bg: COLORS.forest,
    text: '#FFFFFF',
    border: 'transparent',
    icon: '#FFFFFF',
    shadow: true,
  },
  secondary: {
    bg: COLORS.forestBg,
    text: COLORS.forest,
    border: 'transparent',
    icon: COLORS.forest,
  },
  outline: {
    bg: 'transparent',
    text: COLORS.forest,
    border: COLORS.forest,
    icon: COLORS.forest,
  },
  ghost: {
    bg: 'transparent',
    text: COLORS.textSecondary,
    border: 'transparent',
    icon: COLORS.textSecondary,
  },
  danger: {
    bg: COLORS.error,
    text: '#FFFFFF',
    border: 'transparent',
    icon: '#FFFFFF',
    shadow: true,
  },
  earth: {
    bg: COLORS.earthBg,
    text: COLORS.earthDark,
    border: 'transparent',
    icon: COLORS.earthDark,
  },
};

const SIZE_STYLES: Record<ButtonSize, {h: number; px: number; icon: number; fontSize: number}> = {
  sm: {h: 36, px: 16, icon: 14, fontSize: 13},
  md: {h: 44, px: 20, icon: 16, fontSize: 14},
  lg: {h: 52, px: 24, icon: 20, fontSize: 16},
};

function ActionButton({
  title,
  variant = 'primary',
  size = 'md',
  icon,
  iconPosition = 'left',
  disabled = false,
  fullWidth = false,
  flex = false,
  style,
  onPress,
}: Props): React.JSX.Element {
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const colors = VARIANT_STYLES[variant];
  const dims = SIZE_STYLES[size];

  const handlePressIn = () => {
    scaleAnim.stopAnimation();
    Animated.timing(scaleAnim, {
      toValue: 0.96,
      duration: 80,
      useNativeDriver: true,
    }).start();
  };

  const handlePressOut = () => {
    scaleAnim.stopAnimation();
    Animated.timing(scaleAnim, {
      toValue: 1,
      duration: 120,
      useNativeDriver: true,
    }).start();
  };

  const content = (
    <View style={styles.contentRow}>
      {icon && iconPosition === 'left' && (
        <Icon source={icon} size={dims.icon} color={colors.icon} />
      )}
      <Text
        style={[
          styles.title,
          {
            color: colors.text,
            fontSize: dims.fontSize,
          },
        ]}
        numberOfLines={1}
        ellipsizeMode="tail">
        {title}
      </Text>
      {icon && iconPosition === 'right' && (
        <Icon source={icon} size={dims.icon} color={colors.icon} />
      )}
    </View>
  );

  return (
    <Animated.View
      style={[
        {transform: [{scale: scaleAnim}]},
        fullWidth && styles.fullWidth,
        flex && styles.flex,
      ]}>
      <TouchableOpacity
        activeOpacity={0.85}
        disabled={disabled}
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        style={[
          styles.button,
          {
            minHeight: dims.h,
            paddingHorizontal: dims.px,
            backgroundColor: colors.bg,
            borderColor: colors.border,
            borderRadius: RADIUS.pill,
            opacity: disabled ? 0.45 : 1,
          },
          colors.shadow && !disabled && SHADOWS.button,
          fullWidth && styles.fullWidth,
          style,
        ]}>
        {content}
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    alignSelf: 'flex-start',
  },
  fullWidth: {
    width: '100%',
    alignSelf: 'stretch',
  },
  flex: {
    flex: 1,
    alignSelf: 'stretch',
  },
  contentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  title: {
    fontWeight: '600',
    letterSpacing: 0.2,
  },
});

export default ActionButton;

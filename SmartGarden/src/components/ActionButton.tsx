/**
 * ActionButton — 统一行动按钮组件
 *
 * 有机自然主义风格，胶囊形，支持多种变体和尺寸
 * 解决按钮在小屏幕上显示不全的问题：
 *  - 文字单行显示，自动截断
 *  - 合理的 minWidth 保证文字可见
 *  - 按压反馈动画
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
  {bg: string; text: string; border: string; icon: string}
> = {
  primary: {
    bg: COLORS.forest,
    text: '#FFFFFF',
    border: 'transparent',
    icon: '#FFFFFF',
  },
  secondary: {
    bg: COLORS.sage + '18',
    text: COLORS.forest,
    border: COLORS.sage + '40',
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
  },
  earth: {
    bg: COLORS.earth + '15',
    text: COLORS.earth,
    border: COLORS.earth + '30',
    icon: COLORS.earth,
  },
};

const SIZE_STYLES: Record<ButtonSize, {h: number; px: number; icon: number}> = {
  sm: {h: 32, px: 14, icon: 14},
  md: {h: 40, px: 18, icon: 16},
  lg: {h: 48, px: 22, icon: 18},
};

function ActionButton({
  title,
  variant = 'primary',
  size = 'md',
  icon,
  iconPosition = 'left',
  disabled = false,
  fullWidth = false,
  style,
  onPress,
}: Props): React.JSX.Element {
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const colors = VARIANT_STYLES[variant];
  const dims = SIZE_STYLES[size];

  const handlePressIn = () => {
    Animated.timing(scaleAnim, {
      toValue: 0.96,
      duration: 80,
      useNativeDriver: true,
    }).start();
  };

  const handlePressOut = () => {
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
            fontSize: size === 'sm' ? 13 : size === 'md' ? 14 : 15,
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
        fullWidth && {width: '100%'},
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
          variant === 'primary' && SHADOWS.card,
          fullWidth && {width: '100%'},
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
    minWidth: 72,
    alignSelf: 'flex-start',
  },
  contentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  title: {
    fontWeight: '600',
    letterSpacing: 0.2,
  },
});

export default ActionButton;

import React from 'react';
import {View, Text, StyleSheet, ViewStyle, useColorScheme} from 'react-native';
import {COLORS} from '../constants';

interface Props {
  name: string;
  size?: number;
  style?: ViewStyle;
}

/** 10 种柔和配色循环（基于名称哈希，更自然） */
const PALETTE = [
  {bg: '#E8F5E9', text: '#2E7D32'}, // 嫩绿
  {bg: '#FFF3E0', text: '#E65100'}, // 暖橙
  {bg: '#FCE4EC', text: '#C2185B'}, // 粉红
  {bg: '#FFF8E1', text: '#F57F17'}, // 金黄
  {bg: '#E3F2FD', text: '#1565C0'}, // 天蓝
  {bg: '#F3E5F5', text: '#6A1B9A'}, // 薰衣草
  {bg: '#EFEBE9', text: '#4E342E'}, // 摩卡
  {bg: '#E0F7FA', text: '#00695C'}, // 青竹
  {bg: '#FFFDE7', text: '#827717'}, // 橄榄
  {bg: '#FBE9E7', text: '#BF360C'}, // 珊瑚
];

function hash(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

/**
 * 花卉头像 — 根据名称首字+哈希生成柔和彩色圆形
 */
const FlowerAvatar: React.FC<Props> = ({name, size = 40, style}) => {
  const isDark = useColorScheme() === 'dark';
  const idx = hash(name) % PALETTE.length;
  const palette = PALETTE[idx];

  const bg = isDark ? adjustForDark(palette.bg) : palette.bg;
  const text = isDark ? palette.text : palette.text;

  const fontSize = size * 0.42;
  const initial = name ? name.charAt(0) : '?';

  return (
    <View
      style={[
        styles.circle,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: bg,
        },
        style,
      ]}
    >
      <Text style={[styles.initial, {color: text, fontSize, lineHeight: fontSize + 2}]}>
        {initial}
      </Text>
    </View>
  );
};

/** 将浅色背景调整为暗色模式可用版本（加深+降低饱和） */
function adjustForDark(hex: string): string {
  // 将浅色调暗，转为柔和的深色版本
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  // 降亮 75%，保留色相
  const factor = 0.25;
  const nr = Math.round(r * factor + 20);
  const ng = Math.round(g * factor + 20);
  const nb = Math.round(b * factor + 20);
  return `rgb(${nr},${ng},${nb})`;
}

const styles = StyleSheet.create({
  circle: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  initial: {
    fontWeight: '600',
    includeFontPadding: false,
    textAlign: 'center',
  },
});

export default FlowerAvatar;

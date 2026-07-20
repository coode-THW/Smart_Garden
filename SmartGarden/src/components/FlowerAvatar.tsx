/**
 * FlowerAvatar — 植物头像组件
 *
 * 用彩色圆形背景 + 植物名称首字替代 emoji
 * 根据植物名哈希分配固定颜色，保证一致性。
 */

import React from 'react';
import {StyleSheet, Text, View} from 'react-native';

interface Props {
  name?: string;
  size?: number;
  style?: object;
}

/** 植物色系 — 自然、温暖的配色 */
const PALETTE = [
  {bg: '#E8F5E9', text: '#2D5A3D'}, // 浅绿/深绿
  {bg: '#FFF3E0', text: '#8B7355'}, // 浅橙/泥土
  {bg: '#E3F2FD', text: '#3B7DD8'}, // 浅蓝/蓝色
  {bg: '#FCE4EC', text: '#C2185B'}, // 浅粉/玫红
  {bg: '#F3E5F5', text: '#7B1FA2'}, // 浅紫/紫色
  {bg: '#E0F7FA', text: '#006064'}, // 浅青/青色
  {bg: '#FFF8E1', text: '#F57F17'}, // 浅黄/深黄
  {bg: '#E8EAF6', text: '#303F9F'}, // 浅靛/靛色
  {bg: '#F1F8E9', text: '#558B2F'}, // 浅 lime/深 lime
  {bg: '#FBE9E7', text: '#BF360C'}, // 浅红/深红
];

function hashName(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash << 5) - hash + name.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function FlowerAvatar({name = '', size = 48, style}: Props): React.JSX.Element {
  const displayName = name.trim();
  const initial = displayName.charAt(0) || '植';
  const palette = PALETTE[hashName(displayName) % PALETTE.length];

  return (
    <View
      style={[
        styles.avatar,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: palette.bg,
        },
        style,
      ]}>
      <Text style={[styles.initial, {fontSize: size * 0.45, color: palette.text}]}>
        {initial}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  initial: {
    fontWeight: '700',
  },
});

export default FlowerAvatar;

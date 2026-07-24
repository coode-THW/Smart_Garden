import React from 'react';
import {Text} from 'react-native';

const EMOJI_MAP: Record<string, string> = {
  'camera': '📷',
  'camera-outline': '📷',
  'camera-enhance': '📷',
  'flower': '🌻',
  'flower-outline': '🌻',
  'flower-tulip-outline': '🌻',
  'home': '🏠',
  'home-variant-outline': '🏠',
  'leaf': '🌿',
  'book-open-variant': '📋',
  'book-open-page-variant': '📋',
  'chevron-right': '›',
  'chevron-left': '‹',
  'plus': '+',
  'map-marker-outline': '📍',
  'water': '💧',
  'sprout': '🌱',
  'white-balance-sunny': '☀️',
  'thermometer': '🌡️',
  'alert-circle': '⚠️',
  'magnify': '🔍',
  'information': 'ℹ️',
  'information-outline': 'ℹ️',
  'arrow-right': '→',
  'cog': '⚙️',
  'shield-check': '🛡️',
  'star': '⭐',
};

interface Props {
  source: string;
  size?: number;
  color?: string;
}

export default function Icon({source, size = 24, color}: Props) {
  const emoji = EMOJI_MAP[source] ?? '●';
  return <Text style={{fontSize: size, color}}>{emoji}</Text>;
}

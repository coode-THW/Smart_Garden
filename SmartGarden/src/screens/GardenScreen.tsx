/**
 * GardenScreen — 我的花园 · 新拟态风格
 */

import React from 'react';
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useColorScheme,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { MainTabParamList } from '../navigation/types';
import NeumorphView from '../components/NeumorphView';
import { COLORS, RADIUS } from '../constants';

type Nav = BottomTabNavigationProp<MainTabParamList>;

const COMING_FEATURES = [
  { icon: '🔔', label: '养护提醒' },
  { icon: '📝', label: '生长日记' },
  { icon: '💧', label: '浇水日程' },
  { icon: '📸', label: '拍照记录' },
];

function GardenScreen(): React.JSX.Element {
  const isDark = useColorScheme() === 'dark';
  const navigation = useNavigation<Nav>();

  const textColor = isDark ? COLORS.textDark : COLORS.text;
  const secondaryColor = isDark
    ? COLORS.textSecondaryDark
    : COLORS.textSecondary;
  const pageBg = isDark ? COLORS.bgDark : COLORS.bg;

  return (
    <View style={[styles.page, { backgroundColor: pageBg }]}>
      {/* ━━ 标题 ━━ */}
      <Text style={styles.label}>MY GARDEN</Text>
      <Text style={[styles.title, { color: textColor }]}>我的花园</Text>

      {/* ━━ 空状态 ━━ */}
      <View style={styles.emptyState}>
        {/* 内凹图框（L1 浅凸反转感） */}
        <NeumorphView level="l1" bg={pageBg} radius={RADIUS.xl}>
          <View style={styles.emptyIconWrap}>
            <Text style={styles.emptyIcon}>🌿</Text>
          </View>
        </NeumorphView>

        <Text style={[styles.emptyTitle, { color: textColor }]}>
          还没有添加植物
        </Text>
        <Text style={[styles.emptyHint, { color: secondaryColor }]}>
          识别花卉后可以收藏到这里{'\n'}打造属于你的数字花园
        </Text>

        {/* CTA 按钮：深凸 neumorphic */}
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => navigation.navigate('Recognize')}
        >
          <NeumorphView level="l3" bg={pageBg} radius={RADIUS.pill}>
            <View style={styles.ctaInner}>
              <Text style={styles.ctaIcon}>📷</Text>
              <Text style={[styles.ctaText, { color: textColor }]}>
                开始识别
              </Text>
            </View>
          </NeumorphView>
        </TouchableOpacity>
      </View>

      {/* ━━ 即将支持 ━━ */}
      <NeumorphView level="l1" bg={pageBg}>
        <View style={styles.comingInner}>
          <Text style={[styles.comingTitle, { color: secondaryColor }]}>
            即将支持
          </Text>
          <View style={styles.comingRow}>
            {COMING_FEATURES.map((f, i) => (
              <View key={i} style={styles.comingItem}>
                <Text style={styles.comingIcon}>{f.icon}</Text>
                <Text style={[styles.comingLabel, { color: secondaryColor }]}>
                  {f.label}
                </Text>
              </View>
            ))}
          </View>
        </View>
      </NeumorphView>
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 72,
    paddingBottom: 24,
  },
  label: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 3,
    color: COLORS.primary,
    marginBottom: 6,
  },
  title: { fontSize: 22, fontWeight: '600', marginBottom: 36 },

  // ── 空状态 ──
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingBottom: 40,
    gap: 16,
  },
  emptyIconWrap: {
    width: 88,
    height: 88,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyIcon: { fontSize: 40 },
  emptyTitle: { fontSize: 18, fontWeight: '600' },
  emptyHint: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 8,
  },

  // CTA
  ctaInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 36,
    gap: 8,
  },
  ctaIcon: { fontSize: 18 },
  ctaText: { fontSize: 16, fontWeight: '600' },

  // ── 即将支持 ──
  comingInner: { padding: 20 },
  comingTitle: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 1,
    marginBottom: 14,
  },
  comingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  comingItem: { alignItems: 'center', gap: 6 },
  comingIcon: { fontSize: 20 },
  comingLabel: { fontSize: 11 },
});

export default GardenScreen;

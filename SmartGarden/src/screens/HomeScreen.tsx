/**
 * HomeScreen — 首页 · 新拟态风格
 */

import React from 'react';
import {
  Alert,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useColorScheme,
} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import type {BottomTabNavigationProp} from '@react-navigation/bottom-tabs';
import type {MainTabParamList} from '../navigation/types';
import NeumorphView from '../components/NeumorphView';
import {COLORS, RADIUS} from '../constants';

type Nav = BottomTabNavigationProp<MainTabParamList>;

const FEATURES = [
  {icon: '📷', title: '拍照识别', desc: '拍摄花卉，AI 秒级识别', action: 'Recognize'},
  {icon: '🌻', title: '我的花园', desc: '收藏花卉，查看养护档案', action: 'Garden'},
  {icon: '📋', title: '养护百科', desc: '50+ 品种科学养护知识', action: 'knowledge'},
] as const;

function HomeScreen(): React.JSX.Element {
  const isDark = useColorScheme() === 'dark';
  const navigation = useNavigation<Nav>();

  const textColor = isDark ? COLORS.textDark : COLORS.text;
  const secondaryColor = isDark ? COLORS.textSecondaryDark : COLORS.textSecondary;
  const pageBg = isDark ? COLORS.bgDark : COLORS.bg;

  const handlePress = (action: string) => {
    if (action === 'knowledge') {
      Alert.alert('养护百科', '知识库即将上线，敬请期待！');
    } else {
      navigation.navigate(action as keyof MainTabParamList);
    }
  };

  return (
    <View style={[styles.page, {backgroundColor: pageBg}]}>
      {/* ━━ Hero ━━ */}
      <View style={styles.hero}>
        <Text style={styles.heroLabel}>PLANT CARE</Text>
        <Text style={[styles.heroTitle, {color: textColor}]}>智慧花园</Text>
        <Text style={[styles.heroSub, {color: secondaryColor}]}>
          拍照识花 · 科学养护 · 离线优先
        </Text>
      </View>

      {/* ━━ 功能卡片 ━━ */}
      <View style={styles.cardList}>
        {FEATURES.map((f, i) => (
          <TouchableOpacity
            key={i}
            activeOpacity={0.85}
            onPress={() => handlePress(f.action)}>
            <NeumorphView level="l2" bg={pageBg}>
              <View style={styles.cardInner}>
                <Text style={styles.cardIcon}>{f.icon}</Text>
                <View style={styles.cardBody}>
                  <Text style={[styles.cardTitle, {color: textColor}]}>
                    {f.title}
                  </Text>
                  <Text style={[styles.cardDesc, {color: secondaryColor}]}>
                    {f.desc}
                  </Text>
                </View>
                <Text style={[styles.cardArrow, {color: secondaryColor}]}>
                  ›
                </Text>
              </View>
            </NeumorphView>
          </TouchableOpacity>
        ))}
      </View>

      {/* ━━ 底部 ━━ */}
      <View style={styles.footer}>
        <Text style={[styles.footerText, {color: secondaryColor}]}>
          v1.0 · 离线优先 · 隐私安全 · YOLOv11 ONNX
        </Text>
      </View>
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

  // ── Hero ──
  hero: {alignItems: 'center', marginBottom: 36},
  heroLabel: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 3,
    color: COLORS.primary,
    marginBottom: 10,
  },
  heroTitle: {fontSize: 28, fontWeight: '600', marginBottom: 8},
  heroSub: {fontSize: 14, letterSpacing: 0.5},

  // ── 卡片 ──
  cardList: {flex: 1, gap: 14},
  cardInner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
  },
  cardIcon: {fontSize: 30, marginRight: 14},
  cardBody: {flex: 1},
  cardTitle: {fontSize: 16, fontWeight: '600', marginBottom: 4},
  cardDesc: {fontSize: 13, lineHeight: 18},
  cardArrow: {fontSize: 22, marginLeft: 6},

  // ── 底部 ──
  footer: {alignItems: 'center', paddingTop: 20},
  footerText: {fontSize: 11},
});

export default HomeScreen;

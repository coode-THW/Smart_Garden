/**
 * WeatherAdvisedCare — 花园详情中每株植物的天气养护调整
 *
 * Props: flowerId + flowerName
 * 注意：本组件不自带外层 margin/padding，由父组件控制布局间距
 */

import React, {useEffect, useState} from 'react';
import {ActivityIndicator, StyleSheet, Text, View, useColorScheme} from 'react-native';
import {Icon} from 'react-native-paper';
import {useWeatherStore, formatTimeAgo} from '../store/useWeatherStore';
import {COLORS, RADIUS, SPACING, TYPOGRAPHY} from '../constants';
import DesignCard from './DesignCard';
import type {WeatherAdvice, WeatherAdjustment} from '../types/weather';

interface Props {
  flowerId: number;
  flowerName: string;
}

const SEVERITY_COLORS: Record<
  WeatherAdjustment['severity'],
  {border: string; icon: string}
> = {
  warning: {border: COLORS.warning, icon: COLORS.warning},
  info: {border: COLORS.info, icon: COLORS.info},
  success: {border: COLORS.success, icon: COLORS.success},
};

function WeatherAdvisedCare({flowerId, flowerName}: Props): React.JSX.Element {
  const isDark = useColorScheme() === 'dark';
  const {selectedCity, getAdvice, weatherData, isOffline, lastFetchAt} =
    useWeatherStore();
  const [advice, setAdvice] = useState<WeatherAdvice | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cardBg = isDark ? COLORS.cardDark : COLORS.card;
  const textColor = isDark ? COLORS.textDark : COLORS.text;
  const secondaryColor = isDark ? COLORS.textSecondaryDark : COLORS.textSecondary;
  const borderColor = isDark ? COLORS.borderDark : COLORS.border;

  useEffect(() => {
    if (!selectedCity || !flowerId) {return;}

    let cancelled = false;
    setLoading(true);
    setError(null);

    getAdvice(flowerId, flowerName)
      .then(result => {
        if (cancelled) {return;}
        setAdvice(result);
        setLoading(false);
      })
      .catch(err => {
        if (cancelled) {return;}
        setError(err?.message ?? '获取建议失败');
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedCity, flowerId, flowerName, getAdvice]);

  // 未选城市
  if (!selectedCity) {
    return (
      <DesignCard shadow="card" padding={SPACING.lg} radius={RADIUS.xl} bg={cardBg}>
        <Text style={[styles.centerText, {color: secondaryColor}]}>
          请先在首页设置城市以获取天气养护建议
        </Text>
      </DesignCard>
    );
  }

  // 加载中
  if (loading) {
    return (
      <DesignCard shadow="card" padding={SPACING.lg} radius={RADIUS.xl} bg={cardBg}>
        <View style={styles.centerContent}>
          <ActivityIndicator size="small" color={COLORS.forest} />
          <Text style={[styles.centerText, {color: secondaryColor, marginTop: SPACING.sm}]}>
            正在生成养护调整建议...
          </Text>
        </View>
      </DesignCard>
    );
  }

  // 错误
  if (error) {
    return (
      <DesignCard shadow="card" padding={SPACING.lg} radius={RADIUS.xl} bg={cardBg}>
        <Text style={[styles.centerText, {color: COLORS.error}]}>{error}</Text>
      </DesignCard>
    );
  }

  // 无需调整
  if (!advice || advice.adjustments.length === 0) {
    return (
      <DesignCard shadow="card" padding={SPACING.lg} radius={RADIUS.xl} bg={cardBg}>
        <View style={styles.centerContent}>
          <Icon source="check-circle-outline" size={28} color={COLORS.success} />
          <Text style={[styles.goodText, {color: COLORS.success}]}>
            当前天气适宜，无需额外调整
          </Text>
        </View>
      </DesignCard>
    );
  }

  // 调整建议列表
  return (
    <DesignCard shadow="card" padding={0} radius={RADIUS.xl} bg={cardBg}>
      <View style={[styles.cardHeader, {borderBottomColor: borderColor}]}>
        <View style={styles.cardHeaderRow}>
          <Icon source="weather-partly-cloudy" size={18} color={COLORS.forest} />
          <Text style={[styles.cardTitle, {color: textColor}]}>天气养护调整</Text>
          {weatherData && (
            <Text style={[styles.cardSubtitle, {color: secondaryColor}]}>
              {selectedCity.name} {weatherData.temperature}°C
            </Text>
          )}
        </View>
        {isOffline && (
          <Text style={[styles.offlineText, {color: COLORS.warning}]}>
            离线模式 · 缓存于 {formatTimeAgo(lastFetchAt)}
          </Text>
        )}
      </View>

      {advice.adjustments.map((adj, i) => {
        const sev = SEVERITY_COLORS[adj.severity] ?? SEVERITY_COLORS.info;
        return (
          <View
            key={`${adj.category}-${i}`}
            style={[
              styles.adjustmentItem,
              {borderLeftColor: sev.border},
              i < advice.adjustments.length - 1 && {borderBottomColor: borderColor, borderBottomWidth: StyleSheet.hairlineWidth},
            ]}>
            <Icon source={adj.icon} size={20} color={sev.icon} />
            <View style={styles.adjustmentText}>
              <Text style={[styles.adjustmentTitle, {color: textColor}]}>{adj.title}</Text>
              <Text style={[styles.adjustmentAdvice, {color: secondaryColor}]}>{adj.advice}</Text>
            </View>
          </View>
        );
      })}
    </DesignCard>
  );
}

const styles = StyleSheet.create({
  centerContent: {alignItems: 'center', paddingVertical: SPACING.sm},
  centerText: {...TYPOGRAPHY.bodySmall, textAlign: 'center'},
  goodText: {...TYPOGRAPHY.bodySmall, textAlign: 'center', marginTop: SPACING.sm, fontWeight: '500'},
  cardHeader: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.lg,
    paddingBottom: SPACING.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  cardHeaderRow: {flexDirection: 'row', alignItems: 'center', gap: SPACING.sm},
  cardTitle: {...TYPOGRAPHY.h3, fontSize: 16},
  cardSubtitle: {...TYPOGRAPHY.bodySmall, marginLeft: 'auto'},
  offlineText: {...TYPOGRAPHY.bodySmall, marginTop: SPACING.xs, fontSize: 11},
  adjustmentItem: {
    flexDirection: 'row',
    borderLeftWidth: 3,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
    gap: SPACING.md,
    alignItems: 'flex-start',
  },
  adjustmentText: {flex: 1},
  adjustmentTitle: {fontSize: 14, fontWeight: '600', marginBottom: 2},
  adjustmentAdvice: {...TYPOGRAPHY.bodySmall, fontSize: 12, lineHeight: 18},
});

export default WeatherAdvisedCare;

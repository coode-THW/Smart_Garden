/**
 * WeatherAdvisedCare — 花园详情中每株植物的天气养护调整
 *
 * Props: flowerId + flowerName
 * 从 useWeatherStore 读 selectedCity 和 getAdvice
 * 五种状态：noCity / loading / loaded / noAdvice / offline(缓存)
 */

import React, {useEffect, useState} from 'react';
import {ActivityIndicator, Text, View, useColorScheme} from 'react-native';
import {useWeatherStore} from '../store/useWeatherStore';
import {COLORS, RADIUS, SHADOWS, SPACING, TYPOGRAPHY} from '../constants';
import DesignCard from './DesignCard';
import Icon from './Icon';
import type {WeatherAdvice, WeatherAdjustment} from '../types/weather';

interface Props {
  flowerId: number;
  flowerName: string;
}

/** severity → 左侧色条颜色 + 图标色 */
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
  const {selectedCity, getAdvice, weatherData} = useWeatherStore();
  const [advice, setAdvice] = useState<WeatherAdvice | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cardBg = isDark ? COLORS.cardDark : COLORS.card;
  const textColor = isDark ? COLORS.textDark : COLORS.text;
  const secondaryColor = isDark ? COLORS.textSecondaryDark : COLORS.textSecondary;
  const borderColor = isDark ? COLORS.borderDark : COLORS.border;

  useEffect(() => {
    if (!selectedCity || !flowerId) return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    getAdvice(flowerId, flowerName)
      .then(result => {
        if (cancelled) return;
        setAdvice(result);
        setLoading(false);
      })
      .catch(err => {
        if (cancelled) return;
        setError(err?.message ?? '获取建议失败');
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedCity, flowerId, flowerName, getAdvice]);

  // ━━ 未选城市 ━━
  if (!selectedCity) {
    return (
      <View style={{paddingHorizontal: SPACING.lg, marginTop: SPACING.lg}}>
        <DesignCard shadow="card" padding={SPACING.lg} radius={RADIUS.xl}>
          <Text
            style={{
              ...TYPOGRAPHY.bodySmall,
              color: secondaryColor,
              textAlign: 'center',
            }}
          >
            请先在首页设置城市以获取天气养护建议
          </Text>
        </DesignCard>
      </View>
    );
  }

  // ━━ 加载中 ━━
  if (loading) {
    return (
      <View style={{paddingHorizontal: SPACING.lg, marginTop: SPACING.lg}}>
        <DesignCard shadow="card" padding={SPACING.lg} radius={RADIUS.xl}>
          <View style={{alignItems: 'center', paddingVertical: SPACING.md}}>
            <ActivityIndicator size="small" color={COLORS.forest} />
            <Text
              style={{
                ...TYPOGRAPHY.bodySmall,
                color: secondaryColor,
                marginTop: SPACING.sm,
              }}
            >
              正在生成养护调整建议...
            </Text>
          </View>
        </DesignCard>
      </View>
    );
  }

  // ━━ 错误 ━━
  if (error) {
    return (
      <View style={{paddingHorizontal: SPACING.lg, marginTop: SPACING.lg}}>
        <DesignCard shadow="card" padding={SPACING.lg} radius={RADIUS.xl}>
          <Text
            style={{
              ...TYPOGRAPHY.bodySmall,
              color: COLORS.error,
              textAlign: 'center',
            }}
          >
            {error}
          </Text>
        </DesignCard>
      </View>
    );
  }

  // ━━ 数据就绪 ━━
  if (!advice || advice.adjustments.length === 0) {
    return (
      <View style={{paddingHorizontal: SPACING.lg, marginTop: SPACING.lg}}>
        <DesignCard shadow="card" padding={SPACING.lg} radius={RADIUS.xl}>
          <View style={{alignItems: 'center', paddingVertical: SPACING.sm}}>
            <Icon source="check-circle" size={28} color={COLORS.success} />
            <Text
              style={{
                ...TYPOGRAPHY.body,
                color: COLORS.success,
                marginTop: SPACING.sm,
                textAlign: 'center',
              }}
            >
              当前天气适宜，无需额外调整
            </Text>
          </View>
        </DesignCard>
      </View>
    );
  }

  // ━━ 调整建议列表 ━━
  return (
    <View style={{paddingHorizontal: SPACING.lg, marginTop: SPACING.lg}}>
      <DesignCard shadow="card" padding={0} radius={RADIUS.xl}>
        {/* Header */}
        <View
          style={{
            paddingHorizontal: SPACING.lg,
            paddingTop: SPACING.lg,
            paddingBottom: SPACING.md,
            borderBottomWidth: 1,
            borderBottomColor: borderColor,
          }}
        >
          <View style={{flexDirection: 'row', alignItems: 'center'}}>
            <Text style={{fontSize: 18, marginRight: SPACING.sm}}>🌤️</Text>
            <Text style={{...TYPOGRAPHY.h3, color: textColor}}>
              天气养护调整
            </Text>
            {weatherData && (
              <Text
                style={{
                  ...TYPOGRAPHY.bodySmall,
                  color: secondaryColor,
                  marginLeft: SPACING.sm,
                }}
              >
                · {selectedCity.name} {weatherData.temperature}°C
              </Text>
            )}
          </View>
        </View>

        {/* Adjustment items */}
        {advice.adjustments.map((adj, i) => {
          const sev = SEVERITY_COLORS[adj.severity] ?? SEVERITY_COLORS.info;
          return (
            <View
              key={`${adj.category}-${i}`}
              style={{
                flexDirection: 'row',
                borderLeftWidth: 4,
                borderLeftColor: sev.border,
                paddingVertical: SPACING.md,
                paddingHorizontal: SPACING.lg,
                borderBottomWidth:
                  i < advice.adjustments.length - 1 ? 1 : 0,
                borderBottomColor: borderColor,
              }}
            >
              <Icon
                source={adj.icon}
                size={22}
                color={sev.icon}
              />
              <View style={{flex: 1}}>
                <Text
                  style={{
                    fontSize: TYPOGRAPHY.h3.fontSize,
                    fontWeight: '600',
                    color: textColor,
                    marginBottom: 2,
                  }}
                >
                  {adj.title}
                </Text>
                <Text
                  style={{
                    ...TYPOGRAPHY.bodySmall,
                    color: secondaryColor,
                    lineHeight: 20,
                  }}
                >
                  {adj.advice}
                </Text>
              </View>
            </View>
          );
        })}
      </DesignCard>
    </View>
  );
}

export default WeatherAdvisedCare;

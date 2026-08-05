/**
 * WeatherCard — 首页天气卡片
 *
 * 无 Props，从 useWeatherStore 读状态
 * 四种状态：noCity / loading / loaded / error
 *
 * 注意：本组件不自带外层 padding/margin，由父组件控制布局间距
 */

import React, {useCallback, useState} from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useColorScheme,
} from 'react-native';
import {Icon} from 'react-native-paper';
import {useWeatherStore} from '../store/useWeatherStore';
import {COLORS, RADIUS, SPACING, TYPOGRAPHY} from '../constants';
import DesignCard from './DesignCard';
import StatusBadge from './StatusBadge';
import CityPickerModal from './CityPickerModal';
import type {WeatherCondition} from '../types/weather';

/** 天气状况 → 图标 + 中文 */
const WEATHER_DISPLAY: Record<
  WeatherCondition,
  {icon: string; label: string}
> = {
  clear: {icon: 'weather-sunny', label: '晴朗'},
  cloudy: {icon: 'weather-partly-cloudy', label: '多云'},
  overcast: {icon: 'weather-cloudy', label: '阴天'},
  rain: {icon: 'weather-rainy', label: '降雨'},
  drizzle: {icon: 'weather-partly-rainy', label: '小雨'},
  thunderstorm: {icon: 'weather-lightning-rainy', label: '雷暴'},
  snow: {icon: 'weather-snowy', label: '降雪'},
  fog: {icon: 'weather-fog', label: '雾'},
  windy: {icon: 'weather-windy', label: '大风'},
};

function WeatherCard(): React.JSX.Element {
  const isDark = useColorScheme() === 'dark';
  const {selectedCity, weatherData, dailyTip, isLoading, error, fetchWeather} =
    useWeatherStore();
  const [cityPickerOpen, setCityPickerOpen] = useState(false);

  const cardBg = isDark ? COLORS.cardDark : COLORS.card;
  const textColor = isDark ? COLORS.textDark : COLORS.text;
  const secondaryColor = isDark
    ? COLORS.textSecondaryDark
    : COLORS.textSecondary;

  const handleRetry = useCallback(() => {
    if (selectedCity) {fetchWeather();}
  }, [selectedCity, fetchWeather]);

  // ━━ 未选城市 ━━
  if (!selectedCity) {
    return (
      <>
        <DesignCard shadow="card" padding={SPACING.xl} radius={RADIUS.xl} bg={cardBg}>
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => setCityPickerOpen(true)}
            style={styles.centerContent}>
            <View style={[styles.weatherIconWrap, {backgroundColor: isDark ? COLORS.forest + '20' : COLORS.forestBg}]}>
              <Icon source="weather-partly-cloudy" size={32} color={COLORS.forest} />
            </View>
            <Text style={[styles.hintText, {color: secondaryColor}]}>
              选择城市以查看天气养护建议
            </Text>
            <Text style={[styles.linkText, {color: COLORS.forest}]}>
              选择城市 →
            </Text>
          </TouchableOpacity>
        </DesignCard>
        <CityPickerModal
          visible={cityPickerOpen}
          onClose={() => setCityPickerOpen(false)}
        />
      </>
    );
  }

  // ━━ 加载中 ━━
  if (isLoading) {
    return (
      <DesignCard shadow="card" padding={SPACING.xl} radius={RADIUS.xl} bg={cardBg}>
        <View style={styles.centerContent}>
          <ActivityIndicator size="small" color={COLORS.forest} />
          <Text style={[styles.hintText, {color: secondaryColor, marginTop: SPACING.sm}]}>
            正在获取天气...
          </Text>
        </View>
      </DesignCard>
    );
  }

  // ━━ 错误 ━━
  if (error || !weatherData) {
    return (
      <DesignCard shadow="card" padding={SPACING.xl} radius={RADIUS.xl} bg={cardBg}>
        <View style={styles.centerContent}>
          <View style={[styles.weatherIconWrap, {backgroundColor: isDark ? COLORS.error + '20' : COLORS.errorLight}]}>
            <Icon source="cloud-off-outline" size={28} color={COLORS.error} />
          </View>
          <Text style={[styles.hintText, {color: COLORS.error}]}>
            无法获取天气数据
          </Text>
          <TouchableOpacity
            onPress={handleRetry}
            activeOpacity={0.7}
            style={styles.retryBtn}>
            <Text style={styles.retryBtnText}>重试</Text>
          </TouchableOpacity>
        </View>
      </DesignCard>
    );
  }

  // ━━ 数据就绪 ━━
  const display = WEATHER_DISPLAY[weatherData.condition] ?? {
    icon: 'weather-partly-cloudy',
    label: '未知',
  };

  return (
    <>
      <Text style={[styles.sectionLabel, {color: isDark ? COLORS.sage : COLORS.sageDark}]}>
        TODAY'S WEATHER
      </Text>
      <DesignCard shadow="card" padding={SPACING.xl} radius={RADIUS.xl} bg={cardBg}>
        {/* 天气概览行 */}
        <View style={styles.overviewRow}>
          <View style={styles.overviewLeft}>
            <View style={[styles.weatherIconWrap, {backgroundColor: isDark ? COLORS.forest + '20' : COLORS.forestBg, width: 52, height: 52}]}>
              <Icon source={display.icon} size={28} color={COLORS.forest} />
            </View>
            <View>
              <Text style={[styles.weatherLabel, {color: textColor}]}>
                {display.label}
              </Text>
              <Text style={[styles.weatherMeta, {color: secondaryColor}]}>
                {weatherData.city} · {weatherData.tempMax}° / {weatherData.tempMin}°
              </Text>
            </View>
          </View>
          <StatusBadge text={`${weatherData.temperature}°C`} variant="info" />
        </View>

        {/* 详情行 */}
        <View style={[styles.detailRow, {borderTopColor: isDark ? COLORS.dividerDark : COLORS.divider}]}>
          <View style={styles.detailItem}>
            <Icon source="water-percent" size={14} color={secondaryColor} />
            <Text style={[styles.detailText, {color: secondaryColor}]}>
              {weatherData.humidity}%
            </Text>
          </View>
          <View style={styles.detailItem}>
            <Icon source="weather-windy" size={14} color={secondaryColor} />
            <Text style={[styles.detailText, {color: secondaryColor}]}>
              {weatherData.windSpeed}km/h
            </Text>
          </View>
          {weatherData.precipitation > 0 && (
            <View style={styles.detailItem}>
              <Icon source="water-outline" size={14} color={COLORS.info} />
              <Text style={[styles.detailText, {color: COLORS.info}]}>
                {weatherData.precipitation}mm
              </Text>
            </View>
          )}
        </View>

        {/* 养护小贴士 */}
        {dailyTip ? (
          <View style={[styles.tipBox, {backgroundColor: isDark ? COLORS.forest + '20' : COLORS.forestBg}]}>
            <View style={styles.tipHeader}>
              <Icon source="lightbulb-outline" size={14} color={COLORS.forest} />
              <Text style={[styles.tipLabel, {color: COLORS.forest}]}>
                今日养护
              </Text>
            </View>
            <Text style={[styles.tipText, {color: textColor}]} numberOfLines={2}>
              {dailyTip}
            </Text>
          </View>
        ) : null}

        {/* 切换城市 */}
        <TouchableOpacity
          activeOpacity={0.6}
          onPress={() => setCityPickerOpen(true)}
          style={styles.switchCityBtn}>
          <Text style={[styles.switchCityText, {color: COLORS.forest}]}>
            切换城市
          </Text>
          <Icon source="chevron-right" size={14} color={COLORS.forest} />
        </TouchableOpacity>
      </DesignCard>

      <CityPickerModal
        visible={cityPickerOpen}
        onClose={() => setCityPickerOpen(false)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  centerContent: {
    alignItems: 'center',
    paddingVertical: SPACING.md,
  },
  weatherIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  hintText: {
    ...TYPOGRAPHY.body,
    textAlign: 'center',
    marginBottom: SPACING.sm,
  },
  linkText: {
    ...TYPOGRAPHY.bodySmall,
    fontWeight: '600',
  },
  retryBtn: {
    marginTop: SPACING.md,
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.forest,
  },
  retryBtnText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 13,
  },
  sectionLabel: {
    ...TYPOGRAPHY.label,
    marginBottom: SPACING.sm,
  },
  overviewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.md,
  },
  overviewLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },
  weatherLabel: {
    ...TYPOGRAPHY.h3,
    fontSize: 18,
    marginBottom: 2,
  },
  weatherMeta: {
    ...TYPOGRAPHY.bodySmall,
  },
  detailRow: {
    flexDirection: 'row',
    gap: SPACING.lg,
    marginBottom: SPACING.md,
    paddingTop: SPACING.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  detailItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  detailText: {
    ...TYPOGRAPHY.bodySmall,
    fontSize: 12,
  },
  tipBox: {
    backgroundColor: COLORS.forestBg,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
  },
  tipHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    marginBottom: SPACING.xs,
  },
  tipLabel: {
    ...TYPOGRAPHY.label,
    fontSize: 10,
    letterSpacing: 1.5,
  },
  tipText: {
    ...TYPOGRAPHY.bodySmall,
    lineHeight: 19,
  },
  switchCityBtn: {
    alignSelf: 'flex-end',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingVertical: SPACING.xs,
  },
  switchCityText: {
    fontSize: 12,
    fontWeight: '600',
  },
});

export default WeatherCard;

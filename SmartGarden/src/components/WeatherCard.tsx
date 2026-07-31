/**
 * WeatherCard — 首页天气卡片
 *
 * 无 Props，从 useWeatherStore 读状态
 * 四种状态：noCity / loading / loaded / error
 */

import React, {useCallback, useState} from 'react';
import {
  ActivityIndicator,
  Text,
  TouchableOpacity,
  View,
  useColorScheme,
} from 'react-native';
import {useWeatherStore} from '../store/useWeatherStore';
import {COLORS, RADIUS, SHADOWS, SPACING, TYPOGRAPHY} from '../constants';
import DesignCard from './DesignCard';
import StatusBadge from './StatusBadge';
import CityPickerModal from './CityPickerModal';
import type {WeatherCondition} from '../types/weather';

/** 天气状况 → emoji + 中文 */
const WEATHER_DISPLAY: Record<WeatherCondition, {emoji: string; label: string}> =
  {
    clear: {emoji: '☀️', label: '晴朗'},
    cloudy: {emoji: '⛅', label: '多云'},
    overcast: {emoji: '☁️', label: '阴天'},
    rain: {emoji: '🌧️', label: '降雨'},
    drizzle: {emoji: '🌦️', label: '小雨'},
    thunderstorm: {emoji: '⛈️', label: '雷暴'},
    snow: {emoji: '❄️', label: '降雪'},
    fog: {emoji: '🌫️', label: '雾'},
    windy: {emoji: '💨', label: '大风'},
  };

function WeatherCard(): React.JSX.Element {
  const isDark = useColorScheme() === 'dark';
  const {selectedCity, weatherData, dailyTip, isLoading, error, fetchWeather} =
    useWeatherStore();
  const [cityPickerOpen, setCityPickerOpen] = useState(false);

  const cardBg = isDark ? COLORS.cardDark : COLORS.card;
  const textColor = isDark ? COLORS.textDark : COLORS.text;
  const secondaryColor = isDark ? COLORS.textSecondaryDark : COLORS.textSecondary;

  const handleRetry = useCallback(() => {
    if (selectedCity) fetchWeather();
  }, [selectedCity, fetchWeather]);

  // ━━ 未选城市 ━━
  if (!selectedCity) {
    return (
      <View style={{paddingHorizontal: SPACING.lg, marginBottom: SPACING.lg}}>
        <DesignCard shadow="card" padding={SPACING.xl} radius={RADIUS.xl}>
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => setCityPickerOpen(true)}
            style={{alignItems: 'center', paddingVertical: SPACING.md}}
          >
            <Text style={{fontSize: 36, marginBottom: SPACING.md}}>🌤️</Text>
            <Text
              style={{
                ...TYPOGRAPHY.body,
                color: secondaryColor,
                textAlign: 'center',
              }}
            >
              选择城市以查看天气养护建议
            </Text>
          </TouchableOpacity>
        </DesignCard>
        <CityPickerModal
          visible={cityPickerOpen}
          onClose={() => setCityPickerOpen(false)}
        />
      </View>
    );
  }

  // ━━ 加载中 ━━
  if (isLoading) {
    return (
      <View style={{paddingHorizontal: SPACING.lg, marginBottom: SPACING.lg}}>
        <DesignCard shadow="card" padding={SPACING.xl} radius={RADIUS.xl}>
          <View style={{alignItems: 'center', paddingVertical: SPACING.lg}}>
            <ActivityIndicator size="large" color={COLORS.forest} />
            <Text
              style={{
                ...TYPOGRAPHY.bodySmall,
                color: secondaryColor,
                marginTop: SPACING.md,
              }}
            >
              正在获取天气...
            </Text>
          </View>
        </DesignCard>
      </View>
    );
  }

  // ━━ 错误 ━━
  if (error || !weatherData) {
    return (
      <View style={{paddingHorizontal: SPACING.lg, marginBottom: SPACING.lg}}>
        <DesignCard shadow="card" padding={SPACING.xl} radius={RADIUS.xl}>
          <View style={{alignItems: 'center', paddingVertical: SPACING.md}}>
            <Text style={{fontSize: 36, marginBottom: SPACING.sm}}>⚠️</Text>
            <Text
              style={{
                ...TYPOGRAPHY.body,
                color: COLORS.error,
                textAlign: 'center',
              }}
            >
              无法获取天气数据
            </Text>
            <Text
              style={{
                ...TYPOGRAPHY.bodySmall,
                color: secondaryColor,
                textAlign: 'center',
                marginTop: SPACING.xs,
              }}
            >
              {error || '请检查网络后重试'}
            </Text>
            <TouchableOpacity
              onPress={handleRetry}
              activeOpacity={0.6}
              style={{
                marginTop: SPACING.lg,
                paddingHorizontal: SPACING.xl,
                paddingVertical: SPACING.sm,
                borderRadius: RADIUS.pill,
                backgroundColor: COLORS.forest,
              }}
            >
              <Text style={{color: '#FFFFFF', fontWeight: '600'}}>重试</Text>
            </TouchableOpacity>
          </View>
        </DesignCard>
      </View>
    );
  }

  // ━━ 数据就绪 ━━
  const display = WEATHER_DISPLAY[weatherData.condition] ?? {
    emoji: '🌤️',
    label: '未知',
  };

  return (
    <View style={{paddingHorizontal: SPACING.lg, marginBottom: SPACING.lg}}>
      <View style={{marginBottom: SPACING.sm}}>
        <Text
          style={{
            ...TYPOGRAPHY.label,
            color: isDark ? COLORS.sage : COLORS.sageDark,
          }}
        >
          TODAY'S WEATHER
        </Text>
      </View>

      <DesignCard shadow="card" padding={SPACING.xl} radius={RADIUS.xl}>
        {/* 天气概览行 */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: SPACING.md,
          }}
        >
          <View style={{flexDirection: 'row', alignItems: 'center'}}>
            <Text style={{fontSize: 48, marginRight: SPACING.md}}>
              {display.emoji}
            </Text>
            <View>
              <Text style={{...TYPOGRAPHY.h2, color: textColor}}>
                {display.label}
              </Text>
              <Text style={{...TYPOGRAPHY.body, color: secondaryColor}}>
                {weatherData.city} · {weatherData.tempMax}° /{' '}
                {weatherData.tempMin}°
              </Text>
            </View>
          </View>
          <StatusBadge text={`${weatherData.temperature}°C`} variant="info" />
        </View>

        {/* 详情行 */}
        <View
          style={{
            flexDirection: 'row',
            gap: SPACING.lg,
            marginBottom: SPACING.md,
          }}
        >
          <Text style={{...TYPOGRAPHY.bodySmall, color: secondaryColor}}>
            湿度 {weatherData.humidity}%
          </Text>
          <Text style={{...TYPOGRAPHY.bodySmall, color: secondaryColor}}>
            风速 {weatherData.windSpeed} km/h
          </Text>
          {weatherData.precipitation > 0 && (
            <Text style={{...TYPOGRAPHY.bodySmall, color: COLORS.info}}>
              降水 {weatherData.precipitation}mm
            </Text>
          )}
        </View>

        {/* 分割线 */}
        <View
          style={{
            height: 1,
            backgroundColor: isDark ? COLORS.dividerDark : COLORS.divider,
            marginBottom: SPACING.md,
          }}
        />

        {/* 养护小贴士 */}
        {dailyTip ? (
          <View>
            <Text
              style={{
                ...TYPOGRAPHY.label,
                color: COLORS.forest,
                marginBottom: SPACING.xs,
              }}
            >
              💡 今日养护小贴士
            </Text>
            <Text
              style={{
                ...TYPOGRAPHY.bodySmall,
                color: textColor,
                lineHeight: 20,
              }}
            >
              {dailyTip}
            </Text>
          </View>
        ) : null}

        {/* 切换城市 */}
        <TouchableOpacity
          activeOpacity={0.6}
          onPress={() => setCityPickerOpen(true)}
          style={{
            alignSelf: 'flex-end',
            marginTop: SPACING.md,
            paddingVertical: SPACING.xs,
            paddingHorizontal: SPACING.sm,
          }}
        >
          <Text style={{fontSize: 13, color: COLORS.forest}}>切换城市 ▸</Text>
        </TouchableOpacity>
      </DesignCard>

      <CityPickerModal
        visible={cityPickerOpen}
        onClose={() => setCityPickerOpen(false)}
      />
    </View>
  );
}

export default WeatherCard;

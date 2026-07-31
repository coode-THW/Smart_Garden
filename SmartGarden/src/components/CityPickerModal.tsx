/**
 * CityPickerModal — 城市选择弹窗
 *
 * Props: visible + onClose
 * 从 useWeatherStore 读 selectedCity / selectCity
 * FlatList 渲染 CHINESE_CITIES，顶部 TextInput 实时过滤
 */

import React, {useCallback, useMemo, useState} from 'react';
import {
  FlatList,
  Modal,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useColorScheme,
} from 'react-native';
import {CHINESE_CITIES} from '../data/chineseCities';
import {useWeatherStore} from '../store/useWeatherStore';
import {COLORS, RADIUS, SPACING, TYPOGRAPHY} from '../constants';
import type {CityInfo} from '../types/weather';

interface Props {
  visible: boolean;
  onClose: () => void;
}

function CityPickerModal({visible, onClose}: Props): React.JSX.Element {
  const isDark = useColorScheme() === 'dark';
  const {selectedCity, selectCity} = useWeatherStore();
  const [search, setSearch] = useState('');

  const pageBg = isDark ? COLORS.bgDark : COLORS.bg;
  const cardBg = isDark ? COLORS.cardDark : COLORS.card;
  const textColor = isDark ? COLORS.textDark : COLORS.text;
  const secondaryColor = isDark ? COLORS.textSecondaryDark : COLORS.textSecondary;
  const borderColor = isDark ? COLORS.borderDark : COLORS.border;

  const filtered = useMemo(() => {
    if (!search.trim()) return CHINESE_CITIES;
    const q = search.trim();
    return CHINESE_CITIES.filter(c => c.name.includes(q));
  }, [search]);

  const handleSelect = useCallback(
    (city: CityInfo) => {
      selectCity(city);
      setSearch('');
      onClose();
    },
    [selectCity, onClose],
  );

  const renderCity = useCallback(
    ({item}: {item: CityInfo}) => {
      const isSelected = selectedCity?.name === item.name;
      return (
        <TouchableOpacity
          activeOpacity={0.6}
          onPress={() => handleSelect(item)}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            height: 48,
            paddingHorizontal: SPACING.lg,
            backgroundColor: isSelected
              ? isDark
                ? COLORS.forest + '20'
                : COLORS.bgSecondary
              : 'transparent',
            borderBottomWidth: 1,
            borderBottomColor: borderColor,
          }}
        >
          <Text
            style={{
              flex: 1,
              fontSize: TYPOGRAPHY.body.fontSize,
              fontWeight: isSelected ? '600' : '400',
              color: isSelected ? COLORS.forest : textColor,
            }}
          >
            {item.name}
          </Text>
          {isSelected && (
            <Text style={{fontSize: 16, color: COLORS.forest}}>✓</Text>
          )}
        </TouchableOpacity>
      );
    },
    [selectedCity, isDark, textColor, borderColor, handleSelect],
  );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={{flex: 1, backgroundColor: pageBg}}>
        {/* ━━ Header ━━ */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingHorizontal: SPACING.lg,
            paddingVertical: SPACING.md,
            borderBottomWidth: 1,
            borderBottomColor: borderColor,
          }}
        >
          <Text
            style={{
              ...TYPOGRAPHY.h3,
              color: textColor,
            }}
          >
            选择城市
          </Text>
          <TouchableOpacity onPress={onClose} activeOpacity={0.6}>
            <Text style={{fontSize: 15, color: COLORS.forest}}>关闭</Text>
          </TouchableOpacity>
        </View>

        {/* ━━ Search ━━ */}
        <View style={{paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md}}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              backgroundColor: cardBg,
              borderRadius: RADIUS.pill,
              paddingHorizontal: SPACING.lg,
              borderWidth: 1,
              borderColor,
            }}
          >
            <Text style={{fontSize: 16, marginRight: SPACING.sm}}>🔍</Text>
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="搜索城市..."
              placeholderTextColor={secondaryColor}
              style={{
                flex: 1,
                height: 44,
                fontSize: TYPOGRAPHY.body.fontSize,
                color: textColor,
              }}
              autoFocus={false}
              clearButtonMode="while-editing"
            />
          </View>
        </View>

        {/* ━━ City List ━━ */}
        <FlatList
          data={filtered}
          keyExtractor={item => item.name}
          renderItem={renderCity}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            <View
              style={{
                alignItems: 'center',
                paddingVertical: SPACING.huge,
              }}
            >
              <Text style={{fontSize: 15, color: secondaryColor}}>
                未找到匹配城市
              </Text>
            </View>
          }
        />
      </View>
    </Modal>
  );
}

export default CityPickerModal;

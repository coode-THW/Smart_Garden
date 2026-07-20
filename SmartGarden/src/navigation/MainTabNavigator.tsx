/**
 * MainTabNavigator — 底部标签导航
 *
 * Organic/Natural 风格：精致标签栏，激活态森林绿高亮
 */

import React from 'react';
import {StyleSheet, View, useColorScheme} from 'react-native';
import {createBottomTabNavigator} from '@react-navigation/bottom-tabs';
import {Icon} from 'react-native-paper';

import HomeScreen from '../screens/HomeScreen';
import RecognizeScreen from '../screens/RecognizeScreen';
import GardenScreen from '../screens/GardenScreen';
import {COLORS, RADIUS, SHADOWS, TYPOGRAPHY} from '../constants';

import type {MainTabParamList} from './types';

const Tab = createBottomTabNavigator<MainTabParamList>();

function MainTabNavigator(): React.JSX.Element {
  const isDark = useColorScheme() === 'dark';

  const activeColor = COLORS.forest;
  const inactiveColor = isDark ? COLORS.textMutedDark : COLORS.textMuted;

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: activeColor,
        tabBarInactiveTintColor: inactiveColor,
        tabBarStyle: {
          backgroundColor: isDark ? COLORS.cardDark : COLORS.card,
          borderTopColor: isDark ? COLORS.borderDark : COLORS.border,
          borderTopWidth: 1,
          ...SHADOWS.top,
          height: 64,
          paddingBottom: 8,
          paddingTop: 8,
        },
        tabBarLabelStyle: {
          ...TYPOGRAPHY.buttonSmall,
          fontSize: 11,
          marginTop: 2,
        },
        tabBarItemStyle: {
          paddingVertical: 4,
        },
      }}>
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{
          tabBarLabel: '首页',
          tabBarIcon: ({color, size, focused}) => (
            <View style={[styles.iconWrap, focused && styles.iconWrapActive]}>
              <Icon source="home-variant-outline" size={size} color={color} />
            </View>
          ),
        }}
      />
      <Tab.Screen
        name="Recognize"
        component={RecognizeScreen}
        options={{
          tabBarLabel: '识别',
          tabBarIcon: ({color, size, focused}) => (
            <View style={[styles.iconWrap, focused && styles.iconWrapActive]}>
              <Icon source="camera-outline" size={size} color={color} />
            </View>
          ),
        }}
      />
      <Tab.Screen
        name="Garden"
        component={GardenScreen}
        options={{
          tabBarLabel: '花园',
          tabBarIcon: ({color, size, focused}) => (
            <View style={[styles.iconWrap, focused && styles.iconWrapActive]}>
              <Icon source="flower-tulip-outline" size={size} color={color} />
            </View>
          ),
        }}
      />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  iconWrap: {
    padding: 4,
    borderRadius: RADIUS.md,
  },
  iconWrapActive: {
    backgroundColor: COLORS.sage + '20',
  },
});

export default MainTabNavigator;

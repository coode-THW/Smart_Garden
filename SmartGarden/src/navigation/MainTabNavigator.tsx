/**
 * MainTabNavigator — bottom tab bar with Home / Recognize / Garden
 */

import React from 'react';
import {StyleSheet, useColorScheme} from 'react-native';
import {createBottomTabNavigator} from '@react-navigation/bottom-tabs';
import {Icon} from 'react-native-paper';

import HomeScreen from '../screens/HomeScreen';
import RecognizeScreen from '../screens/RecognizeScreen';
import GardenScreen from '../screens/GardenScreen';
import {COLORS} from '../constants';

import type {MainTabParamList} from './types';

const Tab = createBottomTabNavigator<MainTabParamList>();

function MainTabNavigator(): React.JSX.Element {
  const isDark = useColorScheme() === 'dark';

  const pageBg = isDark ? COLORS.bgDark : COLORS.bg;

  const tabBarStyle = {
    backgroundColor: pageBg,
    borderTopColor: 'transparent',
    borderTopWidth: 0,
    // 新拟态浮起：底部栏上沿加亮影 + 暗影
    shadowColor: '#000',
    shadowOffset: {width: 0, height: -4},
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 8,
    height: 60,
    paddingBottom: 6,
    paddingTop: 6,
  };

  const activeColor = COLORS.primary;
  const inactiveColor = isDark ? '#5A5A55' : '#A0A89A';

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: activeColor,
        tabBarInactiveTintColor: inactiveColor,
        tabBarStyle,
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '700' as const,
          marginTop: 2,
        },
      }}>
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{
          tabBarLabel: '首页',
          tabBarIcon: ({color, size}) => (
            <Icon source="home" size={size} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="Recognize"
        component={RecognizeScreen}
        options={{
          tabBarLabel: '识别',
          tabBarIcon: ({color, size}) => (
            <Icon source="camera" size={size} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="Garden"
        component={GardenScreen}
        options={{
          tabBarLabel: '花园',
          tabBarIcon: ({color, size}) => (
            <Icon source="flower" size={size} color={color} />
          ),
        }}
      />
    </Tab.Navigator>
  );
}

export default MainTabNavigator;

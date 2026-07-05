/**
 * MainTabNavigator — bottom tab bar with Home / Recognize / Garden
 */

import React from 'react';
import {useColorScheme} from 'react-native';
import {createBottomTabNavigator} from '@react-navigation/bottom-tabs';
import {Icon} from 'react-native-paper';

import HomeScreen from '../screens/HomeScreen';
import RecognizeScreen from '../screens/RecognizeScreen';
import GardenScreen from '../screens/GardenScreen';

import type {MainTabParamList} from './types';

const Tab = createBottomTabNavigator<MainTabParamList>();

function MainTabNavigator(): React.JSX.Element {
  const isDarkMode = useColorScheme() === 'dark';

  const tabBarStyle = {
    backgroundColor: isDarkMode ? '#1a1a2e' : '#ffffff',
    borderTopColor: isDarkMode ? '#333333' : '#e0e0e0',
    borderTopWidth: 1,
  };

  const activeColor = '#4caf50';
  const inactiveColor = isDarkMode ? '#888888' : '#999999';

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: activeColor,
        tabBarInactiveTintColor: inactiveColor,
        tabBarStyle,
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: '600' as const,
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

/**
 * RootNavigator — root native-stack navigator
 *
 * Currently wraps MainTabNavigator only.
 * Add detail screens (CareGuide, Reminder, Settings) here later.
 */

import React from 'react';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import MainTabNavigator from './MainTabNavigator';
import type {RootStackParamList} from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();

function RootNavigator(): React.JSX.Element {
  return (
    <Stack.Navigator screenOptions={{headerShown: false}}>
      <Stack.Screen name="MainTabs" component={MainTabNavigator} />
    </Stack.Navigator>
  );
}

export default RootNavigator;

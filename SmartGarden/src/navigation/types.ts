/**
 * Navigation type definitions for SmartGarden
 *
 * RootStackParamList  — root native-stack screens
 * MainTabParamList    — bottom tab screens
 */

import type {NavigatorScreenParams} from '@react-navigation/native';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import type {BottomTabScreenProps} from '@react-navigation/bottom-tabs';

// ━━━ Root Stack ━━━

export type RootStackParamList = {
  MainTabs: NavigatorScreenParams<MainTabParamList>;
  // Future detail screens (add as needed):
  // CareGuide: { flowerName: string; confidence: number };
  // Reminder: { flowerName: string };
  // Settings: undefined;
};

// ━━━ Bottom Tabs ━━━

export type MainTabParamList = {
  Home: undefined;
  Recognize: undefined;
  Garden: undefined;
};

// ━━━ Screen Prop Helpers ━━━

export type HomeScreenProps = BottomTabScreenProps<MainTabParamList, 'Home'>;
export type RecognizeScreenProps = BottomTabScreenProps<MainTabParamList, 'Recognize'>;
export type GardenScreenProps = BottomTabScreenProps<MainTabParamList, 'Garden'>;

export type RootStackScreenProps<T extends keyof RootStackParamList> =
  NativeStackScreenProps<RootStackParamList, T>;

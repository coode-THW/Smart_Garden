/**
 * HomeScreen — 首页
 *
 * Placeholder for future home dashboard with:
 * - Quick-recognition entry
 * - Recent recognition history
 * - Garden summary
 */

import React from 'react';
import {StyleSheet, Text, View, useColorScheme} from 'react-native';
import {Icon} from 'react-native-paper';

function HomeScreen(): React.JSX.Element {
  const isDarkMode = useColorScheme() === 'dark';
  const bg = isDarkMode ? '#1a1a2e' : '#f0f4f3';
  const textColor = isDarkMode ? '#e0e0e0' : '#333333';

  return (
    <View style={[styles.container, {backgroundColor: bg}]}>
      <Text style={[styles.title, {color: textColor}]}>🌿 智慧花园</Text>
      <View style={styles.placeholder}>
        <Icon source="flower-tulip" size={64} color="#4caf50" />
        <Text style={[styles.placeholderText, {color: textColor}]}>
          欢迎使用智慧花园
        </Text>
        <Text style={[styles.subText, {color: textColor}]}>
          拍照识别花卉，管理您的花园
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1, paddingTop: 60, paddingHorizontal: 20},
  title: {
    fontSize: 22,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 40,
  },
  placeholder: {flex: 1, justifyContent: 'center', alignItems: 'center'},
  placeholderText: {fontSize: 18, fontWeight: '600', marginTop: 16},
  subText: {
    fontSize: 14,
    marginTop: 8,
    opacity: 0.6,
    textAlign: 'center',
  },
});

export default HomeScreen;

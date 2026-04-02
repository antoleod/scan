import React from 'react';
import { StyleSheet, View } from 'react-native';

export const APP_LAYOUT_MAX_WIDTH = 1420;

export function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <View style={styles.outer}>
      <View style={styles.inner}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  outer: {
    width: '100%',
    alignItems: 'center',
    flex: 1,
  },
  inner: {
    width: '92%',
    maxWidth: APP_LAYOUT_MAX_WIDTH,
    flex: 1,
  },
});

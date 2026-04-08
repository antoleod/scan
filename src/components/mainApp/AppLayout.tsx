import React from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';

export const APP_LAYOUT_MAX_WIDTH = 1200;

export function AppLayout({ children }: { children: React.ReactNode }) {
  const { width } = useWindowDimensions();
  const isDesktop = width >= 1024;

  return (
    <View style={styles.outer}>
      <View
        style={[
          styles.inner,
          {
            paddingHorizontal: isDesktop ? 24 : 12,
          },
        ]}
      >
        {children}
      </View>
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
    width: '100%',
    maxWidth: APP_LAYOUT_MAX_WIDTH,
    flex: 1,
  },
});

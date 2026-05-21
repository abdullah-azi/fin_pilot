import { ReactNode } from 'react';
import { SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';

import { palette, screenTopClearance, spacing, typography } from '@/constants/theme';

type ScreenProps = {
  title: string;
  subtitle?: string;
  children: ReactNode;
};

export function Screen({ title, subtitle, children }: ScreenProps) {
  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={styles.title}>{title}</Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        </View>
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: palette.background,
  },
  content: {
    padding: spacing.lg,
    paddingTop: spacing.xxl + 4 + screenTopClearance,
    gap: spacing.md,
  },
  header: {
    gap: spacing.xs,
    marginBottom: spacing.xs,
  },
  title: {
    color: palette.text,
    ...typography.title,
  },
  subtitle: {
    color: palette.textMuted,
    ...typography.body,
  },
});

import { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { palette, radius, shadows, spacing, typography } from '@/constants/theme';

type SectionCardProps = {
  title: string;
  children: ReactNode;
  tone?: 'default' | 'success' | 'warning' | 'danger';
};

export function SectionCard({
  title,
  children,
  tone = 'default',
}: SectionCardProps) {
  return (
    <View style={[styles.card, toneStyles[tone]]}>
      <Text style={styles.title}>{title}</Text>
      <View style={styles.body}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderColor: palette.border,
    borderRadius: radius.xl,
    borderWidth: 1,
    padding: spacing.lg,
    ...shadows.card,
    backgroundColor: palette.surface,
  },
  title: {
    color: palette.text,
    ...typography.sectionTitle,
    marginBottom: spacing.sm,
  },
  body: {
    gap: spacing.sm,
  },
});

const toneStyles = StyleSheet.create({
  default: {
    backgroundColor: palette.surface,
  },
  success: {
    backgroundColor: '#F2FBF7',
  },
  warning: {
    backgroundColor: '#FFF8EB',
  },
  danger: {
    backgroundColor: '#FFF3F1',
  },
});

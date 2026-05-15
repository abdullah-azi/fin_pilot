import { Link } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { MetricRow } from '@/components/ui/MetricRow';
import { Screen } from '@/components/ui/Screen';
import { SectionCard } from '@/components/ui/SectionCard';
import { palette, spacing } from '@/constants/theme';

export default function DashboardScreen() {
  return (
    <Screen
      title="Dashboard"
      subtitle="Your balance, spending pace, and quick actions should live here."
    >
      <SectionCard title="This month at a glance">
        <MetricRow label="Available cash" value="$2,450" />
        <MetricRow label="Spent so far" value="$820" />
        <MetricRow label="Savings progress" value="43%" />
      </SectionCard>

      <SectionCard title="AI snapshot" tone="success">
        <Text style={styles.copy}>
          You are spending below your monthly average and staying on track with your savings goal.
        </Text>
      </SectionCard>

      <View style={styles.actions}>
        <Link href="/add-transaction" asChild>
          <Pressable style={styles.primaryButton}>
            <Text style={styles.primaryButtonText}>Add transaction</Text>
          </Pressable>
        </Link>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  copy: {
    color: palette.text,
    fontSize: 15,
    lineHeight: 22,
  },
  actions: {
    marginTop: spacing.xs,
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: palette.teal,
    borderRadius: 18,
    paddingVertical: spacing.md,
  },
  primaryButtonText: {
    color: palette.surface,
    fontSize: 16,
    fontWeight: '700',
  },
});


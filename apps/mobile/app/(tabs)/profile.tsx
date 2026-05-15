import { Pressable, StyleSheet, Text } from 'react-native';

import { MetricRow } from '@/components/ui/MetricRow';
import { Screen } from '@/components/ui/Screen';
import { SectionCard } from '@/components/ui/SectionCard';
import { palette, spacing } from '@/constants/theme';
import { useAuth } from '@/providers/AuthProvider';

export default function ProfileScreen() {
  const { isSubmitting, logout, user } = useAuth();

  return (
    <Screen
      title="Profile"
      subtitle="Settings belong here so the bottom tabs stay focused on daily use."
    >
      <SectionCard title="Account">
        <MetricRow label="Email" value={user?.email ?? 'Not available'} />
        <MetricRow label="Name" value={user?.full_name ?? 'Add your name'} />
        <MetricRow label="Currency" value={user?.currency ?? 'USD'} />
        <MetricRow label="Region" value={user?.country ?? 'Not set'} />
      </SectionCard>

      <SectionCard title="Settings placeholder">
        <Text style={{ color: palette.text, fontSize: 15, lineHeight: 22 }}>
          Add notification preferences, AI provider settings, profile details, and security options
          here.
        </Text>
      </SectionCard>

      <Pressable disabled={isSubmitting} onPress={() => void logout()} style={styles.logoutButton}>
        <Text style={styles.logoutButtonText}>{isSubmitting ? 'Signing out...' : 'Sign out'}</Text>
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  logoutButton: {
    alignItems: 'center',
    backgroundColor: palette.coral,
    borderRadius: 18,
    marginTop: spacing.xs,
    paddingVertical: spacing.md,
  },
  logoutButtonText: {
    color: palette.surface,
    fontSize: 16,
    fontWeight: '700',
  },
});

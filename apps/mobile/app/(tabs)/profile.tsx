import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useIsFocused } from '@react-navigation/native';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import type { AuthUser } from '@/lib/api/auth';
import { authPalette, typography } from '@/constants/theme';
import { ApiError } from '@/lib/api/client';
import { listSavingsGoals } from '@/lib/api/savings-goals';
import { getTransactionHistory, type Transaction } from '@/lib/api/transactions';
import { getCurrentUserProfile, updateCurrentUser } from '@/lib/api/users';
import { useAuth } from '@/providers/AuthProvider';

const COLORS = authPalette;

type ProfileStats = {
  activeGoals: number;
  streakDays: number;
  transactionsCount: number;
};

export default function ProfileScreen() {
  const { getValidAccessToken, isSubmitting, logout, user } = useAuth();
  const isFocused = useIsFocused();
  const [profileUser, setProfileUser] = useState<AuthUser | null>(user);
  const [stats, setStats] = useState<ProfileStats>({
    activeGoals: 0,
    streakDays: 0,
    transactionsCount: 0,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdatingNotifications, setIsUpdatingNotifications] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setProfileUser(user);
  }, [user]);

  useEffect(() => {
    if (isFocused) {
      void loadProfileData();
    }
  }, [isFocused]);

  const initials = useMemo(() => getInitials(profileUser?.full_name, profileUser?.email), [profileUser]);
  const notificationsEnabled = profileUser?.preferences?.notifications_enabled ?? true;

  async function loadProfileData() {
    setIsLoading(true);
    setError(null);

    try {
      const accessToken = await getValidAccessToken();
      if (!accessToken) {
        throw new Error('Your session expired. Please log in again.');
      }

      const [userResult, transactionsResult, goalsResult] = await Promise.all([
        getCurrentUserProfile(accessToken),
        getTransactionHistory(accessToken, 'limit=100&offset=0'),
        listSavingsGoals(accessToken),
      ]);

      setProfileUser(userResult);
      setStats({
        activeGoals: goalsResult.filter((goal) => goal.status === 'active').length,
        streakDays: calculateTransactionStreakDays(transactionsResult.items),
        transactionsCount: transactionsResult.summary.total_count,
      });
    } catch (caughtError) {
      if (caughtError instanceof ApiError) {
        setError(caughtError.message);
      } else {
        setError(caughtError instanceof Error ? caughtError.message : 'Could not load profile.');
      }
    } finally {
      setIsLoading(false);
    }
  }

  async function handleNotificationsToggle() {
    const nextValue = !notificationsEnabled;
    const previousUser = profileUser;

    setIsUpdatingNotifications(true);
    setError(null);
    setProfileUser((current) =>
      current
        ? {
            ...current,
            preferences: current.preferences
              ? { ...current.preferences, notifications_enabled: nextValue }
              : null,
          }
        : current,
    );

    try {
      const accessToken = await getValidAccessToken();
      if (!accessToken) {
        throw new Error('Your session expired. Please log in again.');
      }

      const updated = await updateCurrentUser(accessToken, {
        preferences: {
          notifications_enabled: nextValue,
        },
      });
      setProfileUser(updated);
    } catch (caughtError) {
      setProfileUser(previousUser);
      setError(caughtError instanceof Error ? caughtError.message : 'Could not update notifications.');
    } finally {
      setIsUpdatingNotifications(false);
    }
  }

  function showComingSoon(title: string) {
    Alert.alert(title, 'This setting needs more backend support and will be wired later.');
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <View style={styles.avatarRing}>
            <Text style={styles.avatarInitials}>{initials}</Text>
            <View style={styles.avatarEdit}>
              <FontAwesome color="#FFFFFF" name="pencil" size={10} />
            </View>
          </View>

          <View style={styles.heroTextWrap}>
            <Text style={styles.profileName}>{profileUser?.full_name ?? 'FinPilot User'}</Text>
            <Text style={styles.profileEmail}>{profileUser?.email ?? 'No email available'}</Text>
          </View>

          <View style={styles.profileStats}>
            <StatCell label="transactions" value={String(stats.transactionsCount)} />
            <StatCell label="goals" value={String(stats.activeGoals)} />
            <StatCell label="streak" value={`${stats.streakDays}d`} />
          </View>
        </View>

        <View style={styles.body}>
          {isLoading ? (
            <View style={styles.stateCard}>
              <ActivityIndicator color={COLORS.violet} />
            </View>
          ) : null}

          {error ? (
            <View style={styles.errorCard}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          <SectionLabel label="ACCOUNT" />
          <View style={styles.group}>
            <SettingRow
              background="#1A1525"
              icon="user"
              iconColor={COLORS.violet}
              onPress={() => showComingSoon('Personal info')}
              subtitle="Name, email, phone"
              title="Personal info"
            />
            <SettingRow
              background="#1F1A0E"
              icon="money"
              iconColor={COLORS.amber}
              onPress={() => showComingSoon('Currency & region')}
              rightValue={profileUser?.currency ?? 'USD'}
              subtitle={`${profileUser?.currency ?? 'USD'} · ${profileUser?.country ?? 'Not set'}`}
              title="Currency & region"
            />
            <SettingRow
              background="#0D1A12"
              icon="calendar"
              iconColor={COLORS.green}
              onPress={() => showComingSoon('Month start date')}
              rightValue="1st"
              subtitle="When your budget cycle resets"
              title="Month start date"
            />
          </View>

          <SectionLabel label="CATEGORIES" />
          <View style={styles.group}>
            <SettingRow
              background="#131520"
              icon="th-large"
              iconColor="#6366F1"
              onPress={() => showComingSoon('Manage categories')}
              subtitle="Add, rename or hide categories"
              title="Manage categories"
            />
            <SettingRow
              background="#1F1A0E"
              icon="bullseye"
              iconColor={COLORS.amber}
              onPress={() => showComingSoon('Budget limits')}
              subtitle="Set max spend per category"
              title="Budget limits"
            />
          </View>

          <SectionLabel label="PREFERENCES" />
          <View style={styles.group}>
            <SettingRow
              background="#1A1525"
              icon="android"
              iconColor={COLORS.violet}
              onPress={() => showComingSoon('AI suggestions')}
              subtitle="Proactive spending tips"
              title="AI suggestions"
              trailing={
                <ValuePill label="Soon" tone="violet" />
              }
            />
            <SettingRow
              background="#161616"
              icon="moon-o"
              iconColor="#888888"
              onPress={() => showComingSoon('Appearance')}
              rightValue="Dark"
              subtitle="Theme preference"
              title="Appearance"
            />
            <SettingRow
              background="#131520"
              icon="language"
              iconColor="#6366F1"
              onPress={() => showComingSoon('Language')}
              rightValue="English"
              subtitle="App display language"
              title="Language"
            />
          </View>

          <SectionLabel label="NOTIFICATIONS" />
          <View style={styles.group}>
            <SettingRow
              background="#1F1A0E"
              icon="bell"
              iconColor={COLORS.amber}
              subtitle="Warn when nearing budget limit"
              title="Spending alerts"
              trailing={
                <SettingToggle
                  disabled={isUpdatingNotifications}
                  on={notificationsEnabled}
                  onPress={() => void handleNotificationsToggle()}
                />
              }
            />
            <SettingRow
              background="#1A1525"
              icon="android"
              iconColor={COLORS.violet}
              onPress={() => showComingSoon('AI weekly digest')}
              subtitle="Summary every Sunday"
              title="AI weekly digest"
              trailing={<ValuePill label="Soon" tone="violet" />}
            />
            <SettingRow
              background="#0D1A12"
              icon="bank"
              iconColor={COLORS.green}
              onPress={() => showComingSoon('Savings reminders')}
              subtitle="Monthly contribution nudge"
              title="Savings reminders"
              trailing={<ValuePill label="Soon" tone="green" />}
            />
            <SettingRow
              background="#161616"
              icon="tag"
              iconColor="#777777"
              onPress={() => showComingSoon('Promotions')}
              subtitle="App news and offers"
              title="Promotions"
              trailing={<ValuePill label="Off" tone="muted" />}
            />
          </View>

          <SectionLabel label="SECURITY" />
          <View style={styles.group}>
            <SettingRow
              background="#131520"
              icon="unlock-alt"
              iconColor="#6366F1"
              onPress={() => showComingSoon('Biometric unlock')}
              subtitle="Face ID / fingerprint"
              title="Biometric unlock"
              trailing={<ValuePill label="Soon" tone="violet" />}
            />
            <SettingRow
              background="#1A1525"
              icon="lock"
              iconColor={COLORS.violet}
              onPress={() => showComingSoon('Change password')}
              subtitle="Password update flow"
              title="Change password"
            />
            <SettingRow
              background="#161616"
              icon="shield"
              iconColor="#888888"
              onPress={() => showComingSoon('Two-factor auth')}
              subtitle="Extra login protection"
              title="Two-factor auth"
              trailing={<ValuePill label="Off" tone="green" />}
            />
          </View>

          <SectionLabel label="DATA" />
          <View style={styles.group}>
            <SettingRow
              background="#131520"
              icon="download"
              iconColor="#6366F1"
              onPress={() => showComingSoon('Export all data')}
              subtitle="Download as CSV or PDF"
              title="Export all data"
            />
            <SettingRow
              background="#161616"
              icon="info-circle"
              iconColor="#777777"
              onPress={() => showComingSoon('Privacy policy')}
              subtitle="How we use your data"
              title="Privacy policy"
            />
          </View>

          <SectionLabel label="DANGER ZONE" />
          <View style={styles.group}>
            <DangerRow
              icon="trash"
              onPress={() => showComingSoon('Delete all transactions')}
              title="Delete all transactions"
            />
            <DangerRow
              icon="user-times"
              onPress={() => showComingSoon('Delete account')}
              title="Delete account"
            />
          </View>

          <Pressable disabled={isSubmitting} onPress={() => void logout()} style={styles.signOutButton}>
            <FontAwesome color="#666666" name="sign-out" size={15} />
            <Text style={styles.signOutText}>{isSubmitting ? 'Signing out...' : 'Sign out'}</Text>
          </Pressable>

          <Text style={styles.versionText}>FinPilot v1.0.0 · Built in Pakistan</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function SectionLabel({ label }: { label: string }) {
  return <Text style={styles.sectionLabel}>{label}</Text>;
}

function StatCell({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statCell}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function SettingRow({
  background,
  icon,
  iconColor,
  onPress,
  rightValue,
  subtitle,
  title,
  trailing,
}: {
  background: string;
  icon: React.ComponentProps<typeof FontAwesome>['name'];
  iconColor: string;
  onPress?: () => void;
  rightValue?: string;
  subtitle: string;
  title: string;
  trailing?: React.ReactNode;
}) {
  return (
    <Pressable disabled={!onPress} onPress={onPress} style={styles.settingRow}>
      <View style={[styles.settingIcon, { backgroundColor: background }]}>
        <FontAwesome color={iconColor} name={icon} size={15} />
      </View>
      <View style={styles.settingText}>
        <Text style={styles.settingTitle}>{title}</Text>
        <Text style={styles.settingSubtitle}>{subtitle}</Text>
      </View>
      <View style={styles.settingRight}>
        {trailing ?? (rightValue ? <Text style={styles.settingValue}>{rightValue}</Text> : null)}
        {onPress ? <FontAwesome color="#444444" name="chevron-right" size={14} /> : null}
      </View>
    </Pressable>
  );
}

function DangerRow({
  icon,
  onPress,
  title,
}: {
  icon: React.ComponentProps<typeof FontAwesome>['name'];
  onPress: () => void;
  title: string;
}) {
  return (
    <Pressable onPress={onPress} style={styles.dangerRow}>
      <View style={styles.dangerIcon}>
        <FontAwesome color={COLORS.danger} name={icon} size={15} />
      </View>
      <Text style={styles.dangerTitle}>{title}</Text>
      <FontAwesome color="#444444" name="chevron-right" size={14} />
    </Pressable>
  );
}

function ValuePill({ label, tone }: { label: string; tone: 'green' | 'muted' | 'violet' }) {
  return (
    <View
      style={[
        styles.valuePill,
        tone === 'violet' ? styles.valuePillViolet : null,
        tone === 'green' ? styles.valuePillGreen : null,
        tone === 'muted' ? styles.valuePillMuted : null,
      ]}
    >
      <Text
        style={[
          styles.valuePillText,
          tone === 'violet' ? styles.valuePillTextViolet : null,
          tone === 'green' ? styles.valuePillTextGreen : null,
          tone === 'muted' ? styles.valuePillTextMuted : null,
        ]}
      >
        {label}
      </Text>
    </View>
  );
}

function SettingToggle({
  disabled,
  on,
  onPress,
}: {
  disabled?: boolean;
  on: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={[styles.toggle, on ? styles.toggleOn : styles.toggleOff, disabled ? styles.toggleDisabled : null]}
    >
      <View style={[styles.toggleThumb, on ? styles.toggleThumbOn : styles.toggleThumbOff]} />
    </Pressable>
  );
}

function getInitials(fullName?: string | null, email?: string | null) {
  if (fullName?.trim()) {
    const parts = fullName.trim().split(/\s+/).slice(0, 2);
    return parts.map((part) => part[0]?.toUpperCase() ?? '').join('');
  }

  return (email?.[0] ?? 'F').toUpperCase();
}

function calculateTransactionStreakDays(transactions: Transaction[]) {
  if (transactions.length === 0) {
    return 0;
  }

  const uniqueDates = Array.from(new Set(transactions.map((transaction) => transaction.transaction_date))).sort(
    (left, right) => right.localeCompare(left),
  );

  let streak = 0;
  let cursor = new Date();

  for (const dateKey of uniqueDates) {
    const expectedKey = cursor.toISOString().slice(0, 10);

    if (dateKey !== expectedKey) {
      if (streak === 0) {
        const yesterday = new Date(cursor);
        yesterday.setDate(cursor.getDate() - 1);
        const yesterdayKey = yesterday.toISOString().slice(0, 10);

        if (dateKey !== yesterdayKey) {
          break;
        }

        cursor = yesterday;
      } else {
        break;
      }
    }

    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }

  return streak;
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#0E0E0E',
  },
  content: {
    paddingBottom: 20,
  },
  hero: {
    backgroundColor: '#161616',
    borderBottomWidth: 0.5,
    borderBottomColor: '#1E1E1E',
    paddingTop: 28,
    paddingHorizontal: 20,
    paddingBottom: 18,
    alignItems: 'center',
    gap: 10,
  },
  avatarRing: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 2,
    borderColor: COLORS.violet,
    backgroundColor: '#1A1525',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  avatarInitials: {
    color: '#9B72F5',
    fontSize: 24,
    fontWeight: '500',
  },
  avatarEdit: {
    position: 'absolute',
    right: -1,
    bottom: -1,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: COLORS.violet,
    borderWidth: 1.5,
    borderColor: '#0E0E0E',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroTextWrap: {
    alignItems: 'center',
  },
  profileName: {
    color: '#F0F0F0',
    fontSize: 15,
    fontWeight: '500',
    marginBottom: 2,
  },
  profileEmail: {
    color: '#555555',
    fontSize: 11,
  },
  profileStats: {
    width: '100%',
    flexDirection: 'row',
    backgroundColor: '#1E1E1E',
    borderRadius: 10,
    borderWidth: 0.5,
    borderColor: '#272727',
    overflow: 'hidden',
  },
  statCell: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
    borderRightWidth: 0.5,
    borderRightColor: '#272727',
  },
  statValue: {
    color: '#F0F0F0',
    fontSize: 13,
    fontWeight: '500',
    marginBottom: 1,
  },
  statLabel: {
    color: '#555555',
    fontSize: 9,
  },
  body: {
    paddingHorizontal: 14,
    paddingTop: 14,
  },
  stateCard: {
    backgroundColor: '#161616',
    borderRadius: 12,
    borderWidth: 0.5,
    borderColor: '#272727',
    paddingVertical: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  errorCard: {
    backgroundColor: 'rgba(240,106,99,0.12)',
    borderRadius: 10,
    borderWidth: 0.5,
    borderColor: 'rgba(240,106,99,0.3)',
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
  },
  errorText: {
    color: COLORS.danger,
    ...typography.caption,
  },
  sectionLabel: {
    color: '#555555',
    fontSize: 10,
    letterSpacing: 0.5,
    marginBottom: 6,
    paddingHorizontal: 2,
  },
  group: {
    backgroundColor: '#161616',
    borderRadius: 12,
    borderWidth: 0.5,
    borderColor: '#272727',
    overflow: 'hidden',
    marginBottom: 10,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 13,
    paddingVertical: 11,
    borderBottomWidth: 0.5,
    borderBottomColor: '#1E1E1E',
  },
  settingIcon: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingText: {
    flex: 1,
  },
  settingTitle: {
    color: '#DDDDDD',
    fontSize: 12,
    fontWeight: '500',
    marginBottom: 1,
  },
  settingSubtitle: {
    color: '#555555',
    fontSize: 10,
  },
  settingRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  settingValue: {
    color: '#555555',
    fontSize: 11,
  },
  valuePill: {
    borderRadius: 20,
    borderWidth: 0.5,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  valuePillViolet: {
    backgroundColor: '#1A1525',
    borderColor: 'rgba(124,58,237,0.35)',
  },
  valuePillGreen: {
    backgroundColor: '#0D1A12',
    borderColor: 'rgba(34,197,94,0.35)',
  },
  valuePillMuted: {
    backgroundColor: '#161616',
    borderColor: '#272727',
  },
  valuePillText: {
    fontSize: 9,
    fontWeight: '500',
  },
  valuePillTextViolet: {
    color: '#9B72F5',
  },
  valuePillTextGreen: {
    color: '#22C55E',
  },
  valuePillTextMuted: {
    color: '#777777',
  },
  toggle: {
    width: 36,
    height: 20,
    borderRadius: 10,
    position: 'relative',
  },
  toggleOn: {
    backgroundColor: COLORS.violet,
  },
  toggleOff: {
    backgroundColor: '#272727',
  },
  toggleDisabled: {
    opacity: 0.65,
  },
  toggleThumb: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    position: 'absolute',
    top: 2,
  },
  toggleThumbOn: {
    left: 18,
  },
  toggleThumbOff: {
    left: 2,
  },
  dangerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 13,
    paddingVertical: 11,
    borderBottomWidth: 0.5,
    borderBottomColor: '#1E1E1E',
  },
  dangerIcon: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: '#1A100E',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dangerTitle: {
    flex: 1,
    color: COLORS.danger,
    fontSize: 12,
    fontWeight: '500',
  },
  signOutButton: {
    backgroundColor: '#161616',
    borderRadius: 12,
    borderWidth: 0.5,
    borderColor: '#272727',
    minHeight: 50,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
  },
  signOutText: {
    color: '#555555',
    fontSize: 13,
    fontWeight: '500',
  },
  versionText: {
    color: '#333333',
    textAlign: 'center',
    fontSize: 10,
    marginBottom: 20,
  },
});

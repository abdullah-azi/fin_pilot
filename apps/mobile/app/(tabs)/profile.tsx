import FontAwesome from '@expo/vector-icons/FontAwesome';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { useIsFocused } from '@react-navigation/native';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Buffer } from 'buffer';

import type { AuthUser } from '@/lib/api/auth';
import { authPalette, typography } from '@/constants/theme';
import { ApiError } from '@/lib/api/client';
import { fetchReportExport } from '@/lib/api/insights';
import { listSavingsGoals } from '@/lib/api/savings-goals';
import {
  backfillUncategorizedTransactions as backfillUncategorizedTransactionsRequest,
  deleteAllTransactions as deleteAllTransactionsRequest,
  getTransactionHistory,
  type Transaction,
} from '@/lib/api/transactions';
import {
  changeCurrentUserPassword,
  deleteCurrentUser,
  deleteCurrentUserProfileImage,
  getCurrentUserProfile,
  resolveProfileImageUrl,
  updateCurrentUser,
  uploadCurrentUserProfileImage,
} from '@/lib/api/users';
import { useAuth } from '@/providers/AuthProvider';

const COLORS = authPalette;
const COUNTRY_TO_CURRENCY: Record<string, string> = {
  Europe: 'EUR',
  Pakistan: 'PKR',
  Qatar: 'QAR',
  USA: 'USD',
};
const COUNTRY_OPTIONS = Object.keys(COUNTRY_TO_CURRENCY);
const CURRENCY_OPTIONS = Object.values(COUNTRY_TO_CURRENCY);
const APPEARANCE_OPTIONS = ['dark', 'system', 'light'] as const;
const LANGUAGE_OPTIONS = ['English', 'Urdu'] as const;

type ProfileStats = {
  activeGoals: number;
  streakDays: number;
  transactionsCount: number;
};

type PreferenceToggleKey =
  | 'ai_suggestions_enabled'
  | 'biometric_enabled'
  | 'notifications_enabled'
  | 'promotions_enabled'
  | 'savings_reminders_enabled'
  | 'weekly_digest_enabled';

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
  const [updatingPreferenceKey, setUpdatingPreferenceKey] = useState<PreferenceToggleKey | null>(null);
  const [isEditingPersonalInfo, setIsEditingPersonalInfo] = useState(false);
  const [isEditingCurrencyRegion, setIsEditingCurrencyRegion] = useState(false);
  const [isEditingMonthStartDay, setIsEditingMonthStartDay] = useState(false);
  const [isEditingAppearance, setIsEditingAppearance] = useState(false);
  const [isEditingLanguage, setIsEditingLanguage] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [isSavingPersonalInfo, setIsSavingPersonalInfo] = useState(false);
  const [isSavingCurrencyRegion, setIsSavingCurrencyRegion] = useState(false);
  const [isSavingMonthStartDay, setIsSavingMonthStartDay] = useState(false);
  const [isSavingAppearance, setIsSavingAppearance] = useState(false);
  const [isSavingLanguage, setIsSavingLanguage] = useState(false);
  const [isSavingPassword, setIsSavingPassword] = useState(false);
  const [isUploadingProfileImage, setIsUploadingProfileImage] = useState(false);
  const [isExportingData, setIsExportingData] = useState<'csv' | 'pdf' | null>(null);
  const [isBackfillingTransactions, setIsBackfillingTransactions] = useState(false);
  const [isDeletingTransactions, setIsDeletingTransactions] = useState(false);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [personalInfoDraft, setPersonalInfoDraft] = useState({
    email: '',
    full_name: '',
    phone: '',
  });
  const [currencyRegionDraft, setCurrencyRegionDraft] = useState({
    country: 'Pakistan',
    currency: 'PKR',
  });
  const [monthStartDraft, setMonthStartDraft] = useState(1);
  const [appearanceDraft, setAppearanceDraft] = useState<(typeof APPEARANCE_OPTIONS)[number]>('dark');
  const [languageDraft, setLanguageDraft] = useState<(typeof LANGUAGE_OPTIONS)[number]>('English');
  const [passwordDraft, setPasswordDraft] = useState({
    confirm_password: '',
    current_password: '',
    new_password: '',
  });
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
  const preferences = profileUser?.preferences;
  const notificationsEnabled = preferences?.notifications_enabled ?? true;
  const aiSuggestionsEnabled = preferences?.ai_suggestions_enabled ?? true;
  const weeklyDigestEnabled = preferences?.weekly_digest_enabled ?? true;
  const savingsRemindersEnabled = preferences?.savings_reminders_enabled ?? true;
  const promotionsEnabled = preferences?.promotions_enabled ?? false;
  const biometricEnabled = preferences?.biometric_enabled ?? false;
  const monthStartDay = preferences?.month_start_day ?? 1;
  const appearance = preferences?.appearance ?? 'dark';
  const language = preferences?.language ?? 'English';
  const profileImageUri = resolveProfileImageUrl(profileUser?.profile_image_url);

  useEffect(() => {
    if (!profileUser) {
      return;
    }

    setPersonalInfoDraft({
      email: profileUser.email,
      full_name: profileUser.full_name ?? '',
      phone: profileUser.phone ?? '',
    });
    setCurrencyRegionDraft({
      country: profileUser.country ?? inferCountryFromCurrency(profileUser.currency),
      currency: profileUser.currency ?? 'PKR',
    });
    setMonthStartDraft(profileUser.preferences?.month_start_day ?? 1);
    setAppearanceDraft(normalizeAppearance(profileUser.preferences?.appearance));
    setLanguageDraft(normalizeLanguage(profileUser.preferences?.language));
  }, [profileUser]);

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

  async function handlePreferenceToggle(field: PreferenceToggleKey, nextValue: boolean) {
    const previousUser = profileUser;

    setUpdatingPreferenceKey(field);
    setError(null);
    setProfileUser((current) =>
      current
        ? {
            ...current,
            preferences: current.preferences
              ? { ...current.preferences, [field]: nextValue }
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
        preferences: buildPreferencePatch(field, nextValue),
      });
      setProfileUser(updated);
    } catch (caughtError) {
      setProfileUser(previousUser);
      setError(caughtError instanceof Error ? caughtError.message : 'Could not update this preference.');
    } finally {
      setUpdatingPreferenceKey(null);
    }
  }

  async function handleSavePersonalInfo() {
    setIsSavingPersonalInfo(true);
    setError(null);

    try {
      const accessToken = await getValidAccessToken();
      if (!accessToken) {
        throw new Error('Your session expired. Please log in again.');
      }

      const updated = await updateCurrentUser(accessToken, {
        email: personalInfoDraft.email.trim(),
        full_name: personalInfoDraft.full_name.trim() || null,
        phone: personalInfoDraft.phone.trim() || null,
      });
      setProfileUser(updated);
      setIsEditingPersonalInfo(false);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Could not update personal info.');
    } finally {
      setIsSavingPersonalInfo(false);
    }
  }

  async function handleSaveCurrencyRegion() {
    setIsSavingCurrencyRegion(true);
    setError(null);

    try {
      const accessToken = await getValidAccessToken();
      if (!accessToken) {
        throw new Error('Your session expired. Please log in again.');
      }

      const updated = await updateCurrentUser(accessToken, {
        country: currencyRegionDraft.country,
        currency: currencyRegionDraft.currency,
        preferences: {
          default_currency: currencyRegionDraft.currency,
        },
      });
      setProfileUser(updated);
      setIsEditingCurrencyRegion(false);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Could not update currency and region.');
    } finally {
      setIsSavingCurrencyRegion(false);
    }
  }

  async function handleSaveMonthStartDay() {
    setIsSavingMonthStartDay(true);
    setError(null);

    try {
      const accessToken = await getValidAccessToken();
      if (!accessToken) {
        throw new Error('Your session expired. Please log in again.');
      }

      const updated = await updateCurrentUser(accessToken, {
        preferences: {
          month_start_day: monthStartDraft,
        },
      });
      setProfileUser(updated);
      setIsEditingMonthStartDay(false);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Could not update month start day.');
    } finally {
      setIsSavingMonthStartDay(false);
    }
  }

  async function handleSaveAppearance() {
    setIsSavingAppearance(true);
    setError(null);

    try {
      const accessToken = await getValidAccessToken();
      if (!accessToken) {
        throw new Error('Your session expired. Please log in again.');
      }

      const updated = await updateCurrentUser(accessToken, {
        preferences: {
          appearance: appearanceDraft,
        },
      });
      setProfileUser(updated);
      setIsEditingAppearance(false);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Could not update appearance.');
    } finally {
      setIsSavingAppearance(false);
    }
  }

  async function handleSaveLanguage() {
    setIsSavingLanguage(true);
    setError(null);

    try {
      const accessToken = await getValidAccessToken();
      if (!accessToken) {
        throw new Error('Your session expired. Please log in again.');
      }

      const updated = await updateCurrentUser(accessToken, {
        preferences: {
          language: languageDraft,
        },
      });
      setProfileUser(updated);
      setIsEditingLanguage(false);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Could not update language.');
    } finally {
      setIsSavingLanguage(false);
    }
  }

  async function handleSavePassword() {
    setIsSavingPassword(true);
    setError(null);

    try {
      if (passwordDraft.new_password !== passwordDraft.confirm_password) {
        throw new Error('New password and confirmation do not match.');
      }

      const accessToken = await getValidAccessToken();
      if (!accessToken) {
        throw new Error('Your session expired. Please log in again.');
      }

      await changeCurrentUserPassword(accessToken, {
        current_password: passwordDraft.current_password,
        new_password: passwordDraft.new_password,
      });
      setPasswordDraft({
        confirm_password: '',
        current_password: '',
        new_password: '',
      });
      setIsChangingPassword(false);
      Alert.alert('Password changed', 'Your password has been updated.');
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Could not change password.');
    } finally {
      setIsSavingPassword(false);
    }
  }

  async function handleExportData(format: 'csv' | 'pdf') {
    setIsExportingData(format);
    setError(null);

    try {
      const accessToken = await getValidAccessToken();
      if (!accessToken) {
        throw new Error('Your session expired. Please log in again.');
      }

      const canShare = await Sharing.isAvailableAsync();
      if (!canShare) {
        throw new Error('Native file sharing is not available on this device.');
      }

      const exported = await fetchReportExport(accessToken, format, 12);
      const fileName = extractFileName(exported.contentDisposition) ?? `finpilot-export-12m.${format}`;
      const cacheDirectory = FileSystem.cacheDirectory;
      if (!cacheDirectory) {
        throw new Error('Local file storage is not available on this device.');
      }

      const fileUri = `${cacheDirectory}${fileName}`;
      if (typeof exported.data === 'string') {
        await FileSystem.writeAsStringAsync(fileUri, exported.data, {
          encoding: FileSystem.EncodingType.UTF8,
        });
      } else {
        const base64 = Buffer.from(exported.data).toString('base64');
        await FileSystem.writeAsStringAsync(fileUri, base64, {
          encoding: FileSystem.EncodingType.Base64,
        });
      }

      await Sharing.shareAsync(fileUri, {
        dialogTitle: format === 'pdf' ? 'Share PDF export' : 'Share CSV export',
        mimeType: exported.contentType,
        UTI: format === 'pdf' ? 'com.adobe.pdf' : 'public.comma-separated-values-text',
      });
    } catch (caughtError) {
      const message = caughtError instanceof Error ? caughtError.message : 'Could not export data.';
      setError(message);
      Alert.alert('Export failed', message);
    } finally {
      setIsExportingData(null);
    }
  }

  function openExportOptions() {
    Alert.alert('Export all data', 'Choose the format for your latest 12-month export.', [
      {
        text: 'CSV',
        onPress: () => void handleExportData('csv'),
      },
      {
        text: 'PDF',
        onPress: () => void handleExportData('pdf'),
      },
      {
        text: 'Cancel',
        style: 'cancel',
      },
    ]);
  }

  function confirmDeleteAllTransactions() {
    Alert.alert(
      'Delete all transactions',
      'This will remove all income and expense history from your account. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete all',
          style: 'destructive',
          onPress: () => void handleDeleteAllTransactions(),
        },
      ],
    );
  }

  function confirmBackfillUncategorizedTransactions() {
    Alert.alert(
      'Backfill uncategorized history',
      'This will apply the current category rules to transactions that still do not have a category.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Backfill',
          onPress: () => void handleBackfillUncategorizedTransactions(),
        },
      ],
    );
  }

  async function handleDeleteAllTransactions() {
    setIsDeletingTransactions(true);
    setError(null);

    try {
      const accessToken = await getValidAccessToken();
      if (!accessToken) {
        throw new Error('Your session expired. Please log in again.');
      }

      const result = await deleteAllTransactionsRequest(accessToken);
      await loadProfileData();
      Alert.alert(
        'Transactions deleted',
        result.deleted_count === 1 ? '1 transaction was removed.' : `${result.deleted_count} transactions were removed.`,
      );
    } catch (caughtError) {
      const message =
        caughtError instanceof Error ? caughtError.message : 'Could not delete your transactions right now.';
      setError(message);
      Alert.alert('Delete failed', message);
    } finally {
      setIsDeletingTransactions(false);
    }
  }

  async function handleBackfillUncategorizedTransactions() {
    setIsBackfillingTransactions(true);
    setError(null);

    try {
      const accessToken = await getValidAccessToken();
      if (!accessToken) {
        throw new Error('Your session expired. Please log in again.');
      }

      const result = await backfillUncategorizedTransactionsRequest(accessToken);
      await loadProfileData();
      Alert.alert(
        'Backfill complete',
        result.updated_count === 0
          ? 'No uncategorized transactions matched the current rules.'
          : `${result.updated_count} of ${result.scanned_count} uncategorized transactions were recategorized.`,
      );
    } catch (caughtError) {
      const message =
        caughtError instanceof Error ? caughtError.message : 'Could not backfill your transactions right now.';
      setError(message);
      Alert.alert('Backfill failed', message);
    } finally {
      setIsBackfillingTransactions(false);
    }
  }

  function confirmDeleteAccount() {
    Alert.alert(
      'Delete account',
      'This will permanently delete your FinPilot account and all related data. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete account',
          style: 'destructive',
          onPress: () => void handleDeleteAccount(),
        },
      ],
    );
  }

  async function handleDeleteAccount() {
    setIsDeletingAccount(true);
    setError(null);

    try {
      const accessToken = await getValidAccessToken();
      if (!accessToken) {
        throw new Error('Your session expired. Please log in again.');
      }

      await deleteCurrentUser(accessToken);
      await logout();
      router.replace('/(auth)/index' as never);
    } catch (caughtError) {
      const message = caughtError instanceof Error ? caughtError.message : 'Could not delete your account.';
      setError(message);
      Alert.alert('Delete failed', message);
    } finally {
      setIsDeletingAccount(false);
    }
  }

  function openPersonalInfoEditor() {
    if (!profileUser) {
      return;
    }

    setPersonalInfoDraft({
      email: profileUser.email,
      full_name: profileUser.full_name ?? '',
      phone: profileUser.phone ?? '',
    });
    setIsEditingPersonalInfo(true);
  }

  function openCurrencyRegionEditor() {
    setCurrencyRegionDraft({
      country: profileUser?.country ?? inferCountryFromCurrency(profileUser?.currency ?? 'PKR'),
      currency: profileUser?.currency ?? 'PKR',
    });
    setIsEditingCurrencyRegion(true);
  }

  function handleCountryPick(country: string) {
    setCurrencyRegionDraft({
      country,
      currency: COUNTRY_TO_CURRENCY[country] ?? currencyRegionDraft.currency,
    });
  }

  function handleCurrencyPick(currency: string) {
    setCurrencyRegionDraft({
      country: inferCountryFromCurrency(currency),
      currency,
    });
  }

  async function handleProfileImagePress() {
    if (profileImageUri) {
      Alert.alert('Profile image', 'Choose what you want to do.', [
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => void handleDeleteProfileImage(),
        },
        {
          text: 'Replace',
          onPress: () => void handlePickProfileImage(),
        },
        { text: 'Cancel', style: 'cancel' },
      ]);
      return;
    }

    await handlePickProfileImage();
  }

  async function handlePickProfileImage() {
    setError(null);
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        throw new Error('Photo library permission is required to upload a profile image.');
      }

      const picked = await ImagePicker.launchImageLibraryAsync({
        allowsEditing: true,
        aspect: [1, 1],
        mediaTypes: ['images'],
        quality: 0.85,
      });

      if (picked.canceled) {
        return;
      }

      const asset = picked.assets[0];
      if (!asset?.uri) {
        throw new Error('Could not read the selected image.');
      }

      const accessToken = await getValidAccessToken();
      if (!accessToken) {
        throw new Error('Your session expired. Please log in again.');
      }

      setIsUploadingProfileImage(true);
      const uploaded = await uploadCurrentUserProfileImage(accessToken, {
        mimeType: asset.mimeType,
        name: asset.fileName ?? `profile-${Date.now()}.jpg`,
        uri: asset.uri,
      });
      setProfileUser((current) =>
        current
          ? {
              ...current,
              profile_image_url: uploaded.profile_image_url,
            }
          : current,
      );
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Could not upload profile image.');
    } finally {
      setIsUploadingProfileImage(false);
    }
  }

  async function handleDeleteProfileImage() {
    setError(null);
    try {
      const accessToken = await getValidAccessToken();
      if (!accessToken) {
        throw new Error('Your session expired. Please log in again.');
      }

      setIsUploadingProfileImage(true);
      await deleteCurrentUserProfileImage(accessToken);
      setProfileUser((current) =>
        current
          ? {
              ...current,
              profile_image_url: null,
            }
          : current,
      );
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Could not remove profile image.');
    } finally {
      setIsUploadingProfileImage(false);
    }
  }

  function showComingSoon(title: string) {
    Alert.alert(title, 'This setting needs more backend support and will be wired later.');
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <Pressable onPress={() => void handleProfileImagePress()} style={styles.avatarPressable}>
            <View style={styles.avatarRing}>
              {profileImageUri ? (
                <Image source={{ uri: profileImageUri }} style={styles.avatarImage} />
              ) : (
                <Text style={styles.avatarInitials}>{initials}</Text>
              )}
              <View style={styles.avatarEdit}>
                {isUploadingProfileImage ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <FontAwesome color="#FFFFFF" name="camera" size={10} />
                )}
              </View>
            </View>
          </Pressable>

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
              onPress={openPersonalInfoEditor}
              subtitle={profileUser?.phone ? `${profileUser.email} · ${profileUser.phone}` : profileUser?.email ?? 'Name, email, phone'}
              title="Personal info"
            />
            <SettingRow
              background="#1F1A0E"
              icon="money"
              iconColor={COLORS.amber}
              onPress={openCurrencyRegionEditor}
              rightValue={profileUser?.currency ?? 'USD'}
              subtitle={`${profileUser?.currency ?? 'USD'} · ${profileUser?.country ?? 'Not set'}`}
              title="Currency & region"
            />
            <SettingRow
              background="#0D1A12"
              icon="calendar"
              iconColor={COLORS.green}
              onPress={() => setIsEditingMonthStartDay(true)}
              rightValue={formatMonthStartDay(monthStartDay)}
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
              onPress={() => router.push('/category-settings' as never)}
              subtitle="Add, rename or hide categories"
              title="Manage categories"
            />
            <SettingRow
              background="#1F1A0E"
              icon="bullseye"
              iconColor={COLORS.amber}
              onPress={() => router.push('/category-settings' as never)}
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
              subtitle="Proactive spending tips"
              title="AI suggestions"
              trailing={
                <SettingToggle
                  disabled={updatingPreferenceKey === 'ai_suggestions_enabled'}
                  on={aiSuggestionsEnabled}
                  onPress={() => void handlePreferenceToggle('ai_suggestions_enabled', !aiSuggestionsEnabled)}
                />
              }
            />
            <SettingRow
              background="#161616"
              icon="moon-o"
              iconColor="#888888"
              onPress={() => setIsEditingAppearance(true)}
              rightValue={capitalizeLabel(appearance)}
              subtitle="Theme preference"
              title="Appearance"
            />
            <SettingRow
              background="#131520"
              icon="language"
              iconColor="#6366F1"
              onPress={() => setIsEditingLanguage(true)}
              rightValue={language}
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
                  disabled={updatingPreferenceKey === 'notifications_enabled'}
                  on={notificationsEnabled}
                  onPress={() => void handlePreferenceToggle('notifications_enabled', !notificationsEnabled)}
                />
              }
            />
            <SettingRow
              background="#1A1525"
              icon="android"
              iconColor={COLORS.violet}
              subtitle="Summary every Sunday"
              title="AI weekly digest"
              trailing={
                <SettingToggle
                  disabled={updatingPreferenceKey === 'weekly_digest_enabled'}
                  on={weeklyDigestEnabled}
                  onPress={() => void handlePreferenceToggle('weekly_digest_enabled', !weeklyDigestEnabled)}
                />
              }
            />
            <SettingRow
              background="#0D1A12"
              icon="bank"
              iconColor={COLORS.green}
              subtitle="Monthly contribution nudge"
              title="Savings reminders"
              trailing={
                <SettingToggle
                  disabled={updatingPreferenceKey === 'savings_reminders_enabled'}
                  on={savingsRemindersEnabled}
                  onPress={() => void handlePreferenceToggle('savings_reminders_enabled', !savingsRemindersEnabled)}
                />
              }
            />
            <SettingRow
              background="#161616"
              icon="tag"
              iconColor="#777777"
              subtitle="App news and offers"
              title="Promotions"
              trailing={
                <SettingToggle
                  disabled={updatingPreferenceKey === 'promotions_enabled'}
                  on={promotionsEnabled}
                  onPress={() => void handlePreferenceToggle('promotions_enabled', !promotionsEnabled)}
                />
              }
            />
          </View>

          <SectionLabel label="SECURITY" />
          <View style={styles.group}>
            <SettingRow
              background="#131520"
              icon="unlock-alt"
              iconColor="#6366F1"
              subtitle="Face ID / fingerprint"
              title="Biometric unlock"
              trailing={
                <SettingToggle
                  disabled={updatingPreferenceKey === 'biometric_enabled'}
                  on={biometricEnabled}
                  onPress={() => void handlePreferenceToggle('biometric_enabled', !biometricEnabled)}
                />
              }
            />
            <SettingRow
              background="#1A1525"
              icon="lock"
              iconColor={COLORS.violet}
              onPress={() => setIsChangingPassword(true)}
              subtitle="Password update flow"
              title="Change password"
            />
            <SettingRow
              background="#161616"
              icon="shield"
              iconColor="#888888"
              onPress={() => showComingSoon('Two-factor auth')}
              rightValue="Coming soon"
              subtitle="Extra login protection"
              title="Two-factor auth"
            />
          </View>

          <SectionLabel label="DATA" />
          <View style={styles.group}>
            <SettingRow
              background="#131520"
              icon="download"
              iconColor="#6366F1"
              onPress={openExportOptions}
              rightValue={isExportingData ? isExportingData.toUpperCase() : undefined}
              subtitle="Download as CSV or PDF"
              title="Export all data"
            />
            <SettingRow
              background="#1A1525"
              icon="upload"
              iconColor={COLORS.violet}
              onPress={() => router.push('/import-csv' as never)}
              subtitle="Upload a bank or wallet statement"
              title="Import statement CSV"
            />
            <SettingRow
              background="#131520"
              icon="history"
              iconColor="#6366F1"
              onPress={() => router.push('/import-history' as never)}
              subtitle="Review previous statement imports"
              title="Import history"
            />
            <SettingRow
              background="#0D1A12"
              icon="refresh"
              iconColor={COLORS.green}
              onPress={confirmBackfillUncategorizedTransactions}
              rightValue={isBackfillingTransactions ? 'RUNNING' : undefined}
              subtitle="Apply current rules to uncategorized transactions"
              title="Backfill uncategorized history"
            />
            <SettingRow
              background="#161616"
              icon="info-circle"
              iconColor="#777777"
              onPress={() => showComingSoon('Privacy policy')}
              rightValue="Coming soon"
              subtitle="How we use your data"
              title="Privacy policy"
            />
          </View>

          <SectionLabel label="DANGER ZONE" />
          <View style={styles.group}>
            <DangerRow
              icon="trash"
              onPress={confirmDeleteAllTransactions}
              title="Delete all transactions"
            />
            <DangerRow
              icon="user-times"
              onPress={confirmDeleteAccount}
              title="Delete account"
            />
          </View>

          <Pressable disabled={isSubmitting || isDeletingAccount} onPress={() => void logout()} style={styles.signOutButton}>
            <FontAwesome color="#666666" name="sign-out" size={15} />
            <Text style={styles.signOutText}>{isSubmitting || isDeletingAccount ? 'Signing out...' : 'Sign out'}</Text>
          </Pressable>

          <Text style={styles.versionText}>FinPilot v1.0.0 · Built in Pakistan</Text>
        </View>
      </ScrollView>

      <Modal animationType="slide" onRequestClose={() => setIsEditingPersonalInfo(false)} transparent visible={isEditingPersonalInfo}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Personal info</Text>
              <Pressable onPress={() => setIsEditingPersonalInfo(false)} style={styles.modalCloseButton}>
                <FontAwesome color="#888888" name="close" size={15} />
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={styles.modalContent}>
              <FieldLabel label="Full name" />
              <TextInput
                onChangeText={(value) => setPersonalInfoDraft((current) => ({ ...current, full_name: value }))}
                placeholder="Your name"
                placeholderTextColor="#5F6370"
                style={styles.input}
                value={personalInfoDraft.full_name}
              />
              <FieldLabel label="Email" />
              <TextInput
                autoCapitalize="none"
                keyboardType="email-address"
                onChangeText={(value) => setPersonalInfoDraft((current) => ({ ...current, email: value }))}
                placeholder="you@example.com"
                placeholderTextColor="#5F6370"
                style={styles.input}
                value={personalInfoDraft.email}
              />
              <FieldLabel label="Phone" />
              <TextInput
                keyboardType="phone-pad"
                onChangeText={(value) => setPersonalInfoDraft((current) => ({ ...current, phone: value }))}
                placeholder="+92..."
                placeholderTextColor="#5F6370"
                style={styles.input}
                value={personalInfoDraft.phone}
              />
              <View style={styles.modalActionRow}>
                <Pressable onPress={() => setIsEditingPersonalInfo(false)} style={styles.modalSecondaryButton}>
                  <Text style={styles.modalSecondaryButtonText}>Cancel</Text>
                </Pressable>
                <Pressable
                  disabled={isSavingPersonalInfo}
                  onPress={() => void handleSavePersonalInfo()}
                  style={[styles.modalPrimaryButton, isSavingPersonalInfo ? styles.modalButtonBusy : null]}
                >
                  {isSavingPersonalInfo ? (
                    <ActivityIndicator color="#FFFFFF" size="small" />
                  ) : (
                    <Text style={styles.modalPrimaryButtonText}>Save</Text>
                  )}
                </Pressable>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal animationType="slide" onRequestClose={() => setIsEditingCurrencyRegion(false)} transparent visible={isEditingCurrencyRegion}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Currency & region</Text>
              <Pressable onPress={() => setIsEditingCurrencyRegion(false)} style={styles.modalCloseButton}>
                <FontAwesome color="#888888" name="close" size={15} />
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={styles.modalContent}>
              <FieldLabel label="Country" />
              <View style={styles.optionGrid}>
                {COUNTRY_OPTIONS.map((country) => (
                  <SelectionPill
                    active={currencyRegionDraft.country === country}
                    key={country}
                    label={country}
                    onPress={() => handleCountryPick(country)}
                  />
                ))}
              </View>
              <FieldLabel label="Currency" />
              <View style={styles.optionGrid}>
                {CURRENCY_OPTIONS.map((currency) => (
                  <SelectionPill
                    active={currencyRegionDraft.currency === currency}
                    key={currency}
                    label={currency}
                    onPress={() => handleCurrencyPick(currency)}
                  />
                ))}
              </View>
              <View style={styles.modalPreviewCard}>
                <Text style={styles.modalPreviewLabel}>Selection</Text>
                <Text style={styles.modalPreviewValue}>
                  {currencyRegionDraft.country} · {currencyRegionDraft.currency}
                </Text>
              </View>
              <View style={styles.modalActionRow}>
                <Pressable onPress={() => setIsEditingCurrencyRegion(false)} style={styles.modalSecondaryButton}>
                  <Text style={styles.modalSecondaryButtonText}>Cancel</Text>
                </Pressable>
                <Pressable
                  disabled={isSavingCurrencyRegion}
                  onPress={() => void handleSaveCurrencyRegion()}
                  style={[styles.modalPrimaryButton, isSavingCurrencyRegion ? styles.modalButtonBusy : null]}
                >
                  {isSavingCurrencyRegion ? (
                    <ActivityIndicator color="#FFFFFF" size="small" />
                  ) : (
                    <Text style={styles.modalPrimaryButtonText}>Save</Text>
                  )}
                </Pressable>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal animationType="slide" onRequestClose={() => setIsEditingMonthStartDay(false)} transparent visible={isEditingMonthStartDay}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Month start date</Text>
              <Pressable onPress={() => setIsEditingMonthStartDay(false)} style={styles.modalCloseButton}>
                <FontAwesome color="#888888" name="close" size={15} />
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={styles.modalContent}>
              <FieldLabel label="Choose the day your budget cycle resets" />
              <View style={styles.optionGrid}>
                {Array.from({ length: 31 }, (_, index) => index + 1).map((day) => (
                  <SelectionPill
                    active={monthStartDraft === day}
                    key={day}
                    label={String(day)}
                    onPress={() => setMonthStartDraft(day)}
                  />
                ))}
              </View>
              <View style={styles.modalPreviewCard}>
                <Text style={styles.modalPreviewLabel}>Current selection</Text>
                <Text style={styles.modalPreviewValue}>{formatMonthStartDay(monthStartDraft)}</Text>
              </View>
              <View style={styles.modalActionRow}>
                <Pressable onPress={() => setIsEditingMonthStartDay(false)} style={styles.modalSecondaryButton}>
                  <Text style={styles.modalSecondaryButtonText}>Cancel</Text>
                </Pressable>
                <Pressable
                  disabled={isSavingMonthStartDay}
                  onPress={() => void handleSaveMonthStartDay()}
                  style={[styles.modalPrimaryButton, isSavingMonthStartDay ? styles.modalButtonBusy : null]}
                >
                  {isSavingMonthStartDay ? (
                    <ActivityIndicator color="#FFFFFF" size="small" />
                  ) : (
                    <Text style={styles.modalPrimaryButtonText}>Save</Text>
                  )}
                </Pressable>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal animationType="slide" onRequestClose={() => setIsEditingAppearance(false)} transparent visible={isEditingAppearance}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Appearance</Text>
              <Pressable onPress={() => setIsEditingAppearance(false)} style={styles.modalCloseButton}>
                <FontAwesome color="#888888" name="close" size={15} />
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={styles.modalContent}>
              <FieldLabel label="Choose the app theme preference" />
              <View style={styles.optionGrid}>
                {APPEARANCE_OPTIONS.map((option) => (
                  <SelectionPill
                    active={appearanceDraft === option}
                    key={option}
                    label={capitalizeLabel(option)}
                    onPress={() => setAppearanceDraft(option)}
                  />
                ))}
              </View>
              <View style={styles.modalPreviewCard}>
                <Text style={styles.modalPreviewLabel}>Current selection</Text>
                <Text style={styles.modalPreviewValue}>{capitalizeLabel(appearanceDraft)}</Text>
              </View>
              <View style={styles.modalActionRow}>
                <Pressable onPress={() => setIsEditingAppearance(false)} style={styles.modalSecondaryButton}>
                  <Text style={styles.modalSecondaryButtonText}>Cancel</Text>
                </Pressable>
                <Pressable
                  disabled={isSavingAppearance}
                  onPress={() => void handleSaveAppearance()}
                  style={[styles.modalPrimaryButton, isSavingAppearance ? styles.modalButtonBusy : null]}
                >
                  {isSavingAppearance ? (
                    <ActivityIndicator color="#FFFFFF" size="small" />
                  ) : (
                    <Text style={styles.modalPrimaryButtonText}>Save</Text>
                  )}
                </Pressable>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal animationType="slide" onRequestClose={() => setIsEditingLanguage(false)} transparent visible={isEditingLanguage}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Language</Text>
              <Pressable onPress={() => setIsEditingLanguage(false)} style={styles.modalCloseButton}>
                <FontAwesome color="#888888" name="close" size={15} />
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={styles.modalContent}>
              <FieldLabel label="Choose the display language" />
              <View style={styles.optionGrid}>
                {LANGUAGE_OPTIONS.map((option) => (
                  <SelectionPill
                    active={languageDraft === option}
                    key={option}
                    label={option}
                    onPress={() => setLanguageDraft(option)}
                  />
                ))}
              </View>
              <View style={styles.modalPreviewCard}>
                <Text style={styles.modalPreviewLabel}>Current selection</Text>
                <Text style={styles.modalPreviewValue}>{languageDraft}</Text>
              </View>
              <View style={styles.modalActionRow}>
                <Pressable onPress={() => setIsEditingLanguage(false)} style={styles.modalSecondaryButton}>
                  <Text style={styles.modalSecondaryButtonText}>Cancel</Text>
                </Pressable>
                <Pressable
                  disabled={isSavingLanguage}
                  onPress={() => void handleSaveLanguage()}
                  style={[styles.modalPrimaryButton, isSavingLanguage ? styles.modalButtonBusy : null]}
                >
                  {isSavingLanguage ? (
                    <ActivityIndicator color="#FFFFFF" size="small" />
                  ) : (
                    <Text style={styles.modalPrimaryButtonText}>Save</Text>
                  )}
                </Pressable>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal animationType="slide" onRequestClose={() => setIsChangingPassword(false)} transparent visible={isChangingPassword}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Change password</Text>
              <Pressable onPress={() => setIsChangingPassword(false)} style={styles.modalCloseButton}>
                <FontAwesome color="#888888" name="close" size={15} />
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={styles.modalContent}>
              <FieldLabel label="Current password" />
              <TextInput
                onChangeText={(value) => setPasswordDraft((current) => ({ ...current, current_password: value }))}
                placeholder="Current password"
                placeholderTextColor="#5F6370"
                secureTextEntry
                style={styles.input}
                value={passwordDraft.current_password}
              />
              <FieldLabel label="New password" />
              <TextInput
                onChangeText={(value) => setPasswordDraft((current) => ({ ...current, new_password: value }))}
                placeholder="New password"
                placeholderTextColor="#5F6370"
                secureTextEntry
                style={styles.input}
                value={passwordDraft.new_password}
              />
              <FieldLabel label="Confirm new password" />
              <TextInput
                onChangeText={(value) => setPasswordDraft((current) => ({ ...current, confirm_password: value }))}
                placeholder="Confirm new password"
                placeholderTextColor="#5F6370"
                secureTextEntry
                style={styles.input}
                value={passwordDraft.confirm_password}
              />
              <View style={styles.modalActionRow}>
                <Pressable onPress={() => setIsChangingPassword(false)} style={styles.modalSecondaryButton}>
                  <Text style={styles.modalSecondaryButtonText}>Cancel</Text>
                </Pressable>
                <Pressable
                  disabled={isSavingPassword}
                  onPress={() => void handleSavePassword()}
                  style={[styles.modalPrimaryButton, isSavingPassword ? styles.modalButtonBusy : null]}
                >
                  {isSavingPassword ? (
                    <ActivityIndicator color="#FFFFFF" size="small" />
                  ) : (
                    <Text style={styles.modalPrimaryButtonText}>Update</Text>
                  )}
                </Pressable>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
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

function FieldLabel({ label }: { label: string }) {
  return <Text style={styles.fieldLabel}>{label}</Text>;
}

function SelectionPill({
  active,
  label,
  onPress,
}: {
  active: boolean;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={[styles.selectionPill, active ? styles.selectionPillActive : null]}>
      <Text style={[styles.selectionPillText, active ? styles.selectionPillTextActive : null]}>{label}</Text>
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

function buildPreferencePatch(field: PreferenceToggleKey, nextValue: boolean) {
  switch (field) {
    case 'ai_suggestions_enabled':
      return { ai_suggestions_enabled: nextValue };
    case 'biometric_enabled':
      return { biometric_enabled: nextValue };
    case 'notifications_enabled':
      return { notifications_enabled: nextValue };
    case 'promotions_enabled':
      return { promotions_enabled: nextValue };
    case 'savings_reminders_enabled':
      return { savings_reminders_enabled: nextValue };
    case 'weekly_digest_enabled':
      return { weekly_digest_enabled: nextValue };
    default:
      return {};
  }
}

function extractFileName(contentDisposition: string | null) {
  if (!contentDisposition) {
    return null;
  }

  const match = contentDisposition.match(/filename=\"([^\"]+)\"/i);
  return match?.[1] ?? null;
}

function normalizeAppearance(value: string | null | undefined): (typeof APPEARANCE_OPTIONS)[number] {
  if (value === 'light' || value === 'system') {
    return value;
  }

  return 'dark';
}

function normalizeLanguage(value: string | null | undefined): (typeof LANGUAGE_OPTIONS)[number] {
  if (value === 'Urdu') {
    return 'Urdu';
  }

  return 'English';
}

function formatMonthStartDay(value: number) {
  if (value === 1) return '1st';
  if (value === 2) return '2nd';
  if (value === 3) return '3rd';
  return `${value}th`;
}

function capitalizeLabel(value: string) {
  if (!value) {
    return value;
  }

  return value[0].toUpperCase() + value.slice(1);
}

function inferCountryFromCurrency(currency: string) {
  switch (currency.toUpperCase()) {
    case 'PKR':
      return 'Pakistan';
    case 'USD':
      return 'USA';
    case 'EUR':
      return 'Europe';
    case 'QAR':
      return 'Qatar';
    default:
      return 'Pakistan';
  }
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
  avatarPressable: {
    borderRadius: 40,
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
    overflow: 'hidden',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
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
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    maxHeight: '86%',
    backgroundColor: '#111116',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 0.5,
    borderColor: '#23232B',
    overflow: 'hidden',
  },
  modalHeader: {
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: '#1E1E1E',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  modalTitle: {
    color: '#F0F0F0',
    fontSize: 15,
    fontWeight: '600',
  },
  modalCloseButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#191922',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalContent: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 24,
  },
  fieldLabel: {
    color: '#A7A9B2',
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 8,
    marginTop: 4,
  },
  input: {
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 0.5,
    borderColor: '#2C2C33',
    backgroundColor: '#16161A',
    color: '#F0F0F0',
    paddingHorizontal: 13,
    fontSize: 13,
    marginBottom: 10,
  },
  optionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 10,
  },
  selectionPill: {
    borderRadius: 999,
    borderWidth: 0.5,
    borderColor: '#2C2C33',
    backgroundColor: '#16161A',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  selectionPillActive: {
    backgroundColor: '#1A1525',
    borderColor: '#3D2F6A',
  },
  selectionPillText: {
    color: '#8C909B',
    fontSize: 11,
    fontWeight: '500',
  },
  selectionPillTextActive: {
    color: '#9B72F5',
  },
  modalPreviewCard: {
    backgroundColor: '#16161A',
    borderRadius: 12,
    borderWidth: 0.5,
    borderColor: '#2C2C33',
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginTop: 6,
    marginBottom: 10,
  },
  modalPreviewLabel: {
    color: '#8C909B',
    fontSize: 10,
    marginBottom: 3,
  },
  modalPreviewValue: {
    color: '#F0F0F0',
    fontSize: 12,
    fontWeight: '500',
  },
  modalActionRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
  },
  modalSecondaryButton: {
    flex: 1,
    minHeight: 46,
    borderRadius: 13,
    borderWidth: 0.5,
    borderColor: '#2C2C33',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalSecondaryButtonText: {
    color: '#8C909B',
    fontSize: 12,
    fontWeight: '600',
  },
  modalPrimaryButton: {
    flex: 1,
    minHeight: 46,
    borderRadius: 13,
    backgroundColor: COLORS.violet,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalPrimaryButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  modalButtonBusy: {
    opacity: 0.8,
  },
});

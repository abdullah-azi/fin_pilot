import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useIsFocused } from '@react-navigation/native';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { authPalette, screenTopClearance, typography } from '@/constants/theme';
import { ApiError } from '@/lib/api/client';
import { getDashboardSummary, type DashboardSummaryResponse, type DashboardTransaction } from '@/lib/api/dashboard';
import { useAuth } from '@/providers/AuthProvider';

const COLORS = authPalette;

export default function DashboardScreen() {
  const { getValidAccessToken, user } = useAuth();
  const isFocused = useIsFocused();
  const [dashboard, setDashboard] = useState<DashboardSummaryResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isFocused) {
      void loadDashboard();
    }
  }, [isFocused]);

  const initials = useMemo(() => getInitials(user?.full_name, user?.email), [user?.email, user?.full_name]);
  const firstName = useMemo(() => getFirstName(user?.full_name, user?.email), [user?.email, user?.full_name]);
  const currencyCode = (user?.currency ?? 'PKR').toUpperCase();

  async function loadDashboard() {
    setIsLoading(true);
    setError(null);

    try {
      const accessToken = await getValidAccessToken();
      if (!accessToken) {
        throw new Error('Your session expired. Please log in again.');
      }

      const result = await getDashboardSummary(accessToken);
      setDashboard(result);
    } catch (caughtError) {
      if (caughtError instanceof ApiError) {
        setError(caughtError.message);
      } else {
        setError(caughtError instanceof Error ? caughtError.message : 'Could not load dashboard.');
      }
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <View style={styles.heroTop}>
            <View>
              <Text style={styles.greeting}>Good morning,</Text>
              <Text style={styles.userName}>{firstName}</Text>
            </View>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{initials}</Text>
            </View>
          </View>

          <Text style={styles.balanceLabel}>
            Net balance · {dashboard?.month_label ?? 'This month'}
          </Text>
          <Text style={styles.balanceValue}>
            {formatMoney(dashboard?.summary.net ?? '0', currencyCode)}
          </Text>

          <View style={styles.statGrid}>
            <StatCard
              icon="arrow-down"
              iconColor={COLORS.green}
              label="Income"
              value={formatMoney(dashboard?.summary.total_income ?? '0', currencyCode)}
              valueColor={COLORS.green}
            />
            <StatCard
              icon="arrow-up"
              iconColor={COLORS.amber}
              label="Spent"
              value={formatMoney(dashboard?.summary.total_expense ?? '0', currencyCode)}
              valueColor={COLORS.amber}
            />
          </View>
        </View>

        <View style={styles.body}>
          <Pressable onPress={() => router.push('/(tabs)/ask-ai')} style={styles.aiCard}>
            <View style={styles.aiIcon}>
              <FontAwesome color="#FFFFFF" name="android" size={15} />
            </View>
            <View style={styles.aiCopy}>
              <Text style={styles.aiTitle}>Ask FinPilot</Text>
              <Text style={styles.aiSubtitle}>Can I afford this right now?</Text>
            </View>
            <FontAwesome color="rgba(255,255,255,0.55)" name="chevron-right" size={14} />
          </Pressable>

          <Pressable onPress={() => router.push('/add-transaction')} style={styles.addTransactionCard}>
            <View style={styles.addTransactionIcon}>
              <FontAwesome color="#FFFFFF" name="plus" size={14} />
            </View>
            <View style={styles.addTransactionCopy}>
              <Text style={styles.addTransactionTitle}>Add transaction</Text>
              <Text style={styles.addTransactionSubtitle}>Log income or expense right away</Text>
            </View>
            <FontAwesome color="#777777" name="chevron-right" size={13} />
          </Pressable>

          {isLoading ? (
            <View style={styles.stateCard}>
              <ActivityIndicator color={COLORS.violet} />
            </View>
          ) : null}

          {error ? (
            <View style={[styles.stateCard, styles.errorCard]}>
              <Text style={styles.errorText}>{error}</Text>
              <Pressable onPress={() => void loadDashboard()} style={styles.retryButton}>
                <Text style={styles.retryButtonText}>Retry</Text>
              </Pressable>
            </View>
          ) : null}

          {!isLoading && !error ? (
            <>
              <SectionHeader
                actionLabel="See all"
                onPress={() => router.push('/(tabs)/insights')}
                title="Spending this month"
              />
              <View style={styles.spendingGrid}>
                {dashboard?.top_categories.length ? (
                  dashboard.top_categories.slice(0, 4).map((category) => (
                    <SpendCard
                      key={`${category.category_id ?? category.name}`}
                      currencyCode={currencyCode}
                      icon={category.icon}
                      iconColor={category.color ?? COLORS.violet}
                      label={category.name}
                      percentage={Number(category.percentage)}
                      value={category.total_amount}
                    />
                  ))
                ) : (
                  <EmptyInlineCard copy="Your top spending categories will appear here once you add some expenses." />
                )}
              </View>

              <View style={styles.goalCard}>
                {dashboard?.active_goal ? (
                  <Pressable
                    onPress={() => router.push('/(tabs)/insights/savings-goals')}
                    style={styles.goalPressable}
                  >
                    <View style={styles.goalTop}>
                      <Text style={styles.goalLabel}>
                        <FontAwesome color={COLORS.green} name="money" size={11} /> Savings goal ·{' '}
                        {dashboard.active_goal.name}
                      </Text>
                      <Text style={styles.goalProgress}>
                        {Math.round(Number(dashboard.active_goal.progress_percentage))}%
                      </Text>
                    </View>
                    <View style={styles.goalBarTrack}>
                      <View
                        style={[
                          styles.goalBarFill,
                          {
                            width: `${Math.max(
                              6,
                              Math.min(100, Number(dashboard.active_goal.progress_percentage)),
                            )}%`,
                          },
                        ]}
                      />
                    </View>
                    <View style={styles.goalFooterRow}>
                      <Text style={styles.goalSubtext}>
                        {formatMoney(dashboard.active_goal.current_amount, currencyCode)} saved of{' '}
                        {formatMoney(dashboard.active_goal.target_amount, currencyCode)} target
                      </Text>
                      <Text style={styles.goalLink}>Open</Text>
                    </View>
                  </Pressable>
                ) : (
                  <Pressable
                    onPress={() => router.push('/(tabs)/insights/savings-goals?create=1')}
                    style={styles.goalPressable}
                  >
                    <Text style={styles.goalLabel}>Savings goal</Text>
                    <Text style={styles.goalSubtext}>
                      Create your first savings goal to track progress here.
                    </Text>
                    <View style={styles.goalEmptyCta}>
                      <FontAwesome color={COLORS.violetBright} name="plus" size={12} />
                      <Text style={styles.goalEmptyCtaText}>Create savings goal</Text>
                    </View>
                  </Pressable>
                )}
              </View>

              <View style={styles.insightCard}>
                <FontAwesome color={COLORS.violet} name="lightbulb-o" size={16} style={styles.insightIcon} />
                <Text style={styles.insightText}>{dashboard?.insight ?? 'Keep logging expenses to unlock monthly insight cards.'}</Text>
              </View>

              <SectionHeader
                actionLabel="See all"
                onPress={() => router.push('/(tabs)/history')}
                title="Recent transactions"
              />

              <View style={styles.transactionList}>
                {dashboard?.recent_transactions.length ? (
                  dashboard.recent_transactions.map((transaction, index) => (
                    <TransactionRow
                      key={transaction.id}
                      currencyCode={currencyCode}
                      isLast={index === dashboard.recent_transactions.length - 1}
                      transaction={transaction}
                    />
                  ))
                ) : (
                  <EmptyInlineCard copy="Your latest transactions will show up here after you add income or expenses." />
                )}
              </View>
            </>
          ) : null}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function SectionHeader({
  actionLabel,
  onPress,
  title,
}: {
  actionLabel: string;
  onPress: () => void;
  title: string;
}) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <Pressable onPress={onPress}>
        <Text style={styles.sectionLink}>{actionLabel}</Text>
      </Pressable>
    </View>
  );
}

function StatCard({
  icon,
  iconColor,
  label,
  value,
  valueColor,
}: {
  icon: React.ComponentProps<typeof FontAwesome>['name'];
  iconColor: string;
  label: string;
  value: string;
  valueColor: string;
}) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statLabel}>
        <FontAwesome color={iconColor} name={icon} size={9} /> {label}
      </Text>
      <Text style={[styles.statValue, { color: valueColor }]}>{value}</Text>
    </View>
  );
}

function SpendCard({
  currencyCode,
  icon,
  iconColor,
  label,
  percentage,
  value,
}: {
  currencyCode: string;
  icon: string | null;
  iconColor: string;
  label: string;
  percentage: number;
  value: string;
}) {
  return (
    <View style={styles.spendCard}>
      <FontAwesome color={iconColor} name={mapCategoryIcon(icon)} size={15} style={styles.spendIcon} />
      <Text numberOfLines={2} style={styles.spendLabel}>
        {label}
      </Text>
      <Text style={styles.spendAmount}>{formatMoney(value, currencyCode)}</Text>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { backgroundColor: iconColor, width: `${Math.max(10, Math.min(100, percentage))}%` }]} />
      </View>
    </View>
  );
}

function TransactionRow({
  currencyCode,
  isLast,
  transaction,
}: {
  currencyCode: string;
  isLast: boolean;
  transaction: DashboardTransaction;
}) {
  const isIncome = transaction.type === 'income';
  const iconColor = isIncome ? COLORS.green : transaction.category?.color ?? COLORS.amber;

  return (
    <View style={[styles.transactionRow, !isLast ? styles.transactionRowBorder : null]}>
      <View
        style={[
          styles.transactionIcon,
          { backgroundColor: getTransactionIconBackground(transaction) },
        ]}
      >
        <FontAwesome color={iconColor} name={getTransactionIconName(transaction)} size={13} />
      </View>

      <View style={styles.transactionInfo}>
        <Text numberOfLines={1} style={styles.transactionTitle}>
          {transaction.title}
        </Text>
        <Text numberOfLines={1} style={styles.transactionCaption}>
          {buildTransactionSubtitle(transaction)}
        </Text>
      </View>

      <Text style={[styles.transactionAmount, isIncome ? styles.amountIncome : styles.amountExpense]}>
        {isIncome ? '+' : '−'}
        {formatMoney(transaction.amount, currencyCode)}
      </Text>
    </View>
  );
}

function EmptyInlineCard({ copy }: { copy: string }) {
  return (
    <View style={styles.emptyInlineCard}>
      <Text style={styles.emptyInlineText}>{copy}</Text>
    </View>
  );
}

function getFirstName(fullName?: string | null, email?: string | null) {
  if (fullName?.trim()) {
    return fullName.trim().split(/\s+/)[0];
  }

  if (email?.trim()) {
    return email.split('@')[0];
  }

  return 'there';
}

function getInitials(fullName?: string | null, email?: string | null) {
  if (fullName?.trim()) {
    const parts = fullName.trim().split(/\s+/).slice(0, 2);
    return parts.map((part) => part[0]?.toUpperCase() ?? '').join('');
  }

  return (email?.[0] ?? 'F').toUpperCase();
}

function formatMoney(value: string, currencyCode: string) {
  const numeric = Number(value);
  const prefix = currencyCode === 'PKR' ? 'Rs ' : `${currencyCode} `;

  if (!Number.isFinite(numeric)) {
    return `${prefix}0`;
  }

  return `${prefix}${Math.round(Math.abs(numeric)).toLocaleString('en-US')}`;
}

function buildTransactionSubtitle(transaction: DashboardTransaction) {
  const dateLabel = formatTransactionDateLabel(transaction.transaction_date);
  const categoryLabel = transaction.category?.name ?? (transaction.type === 'income' ? 'Income' : 'Expense');
  return `${categoryLabel} · ${dateLabel}`;
}

function formatTransactionDateLabel(value: string) {
  const target = new Date(`${value}T00:00:00`);
  const today = new Date();
  const todayKey = toCalendarKey(today);
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const yesterdayKey = toCalendarKey(yesterday);

  if (value === todayKey) {
    return 'Today';
  }

  if (value === yesterdayKey) {
    return 'Yesterday';
  }

  return target.toLocaleDateString('en-US', {
    day: 'numeric',
    month: 'short',
  });
}

function toCalendarKey(value: Date) {
  return value.toISOString().slice(0, 10);
}

function mapCategoryIcon(icon: string | null | undefined): React.ComponentProps<typeof FontAwesome>['name'] {
  switch (icon) {
    case 'shopping-basket':
      return 'shopping-cart';
    case 'car':
      return 'car';
    case 'tv':
      return 'television';
    case 'heartbeat':
      return 'heart';
    case 'wrench':
      return 'wrench';
    case 'book':
      return 'book';
    case 'briefcase':
      return 'briefcase';
    case 'line-chart':
      return 'line-chart';
    case 'shopping-bag':
      return 'shopping-bag';
    default:
      return 'tag';
  }
}

function getTransactionIconName(transaction: DashboardTransaction): React.ComponentProps<typeof FontAwesome>['name'] {
  if (transaction.type === 'income') {
    if (transaction.category?.icon === 'briefcase') {
      return 'briefcase';
    }
    if (transaction.category?.icon === 'line-chart') {
      return 'line-chart';
    }
    return 'money';
  }

  return mapCategoryIcon(transaction.category?.icon);
}

function getTransactionIconBackground(transaction: DashboardTransaction) {
  if (transaction.type === 'income') {
    return '#0D1A12';
  }

  switch (transaction.category?.icon) {
    case 'shopping-basket':
      return '#1F1A0E';
    case 'car':
      return '#13131F';
    case 'heartbeat':
      return '#1A100E';
    case 'tv':
      return '#14131A';
    default:
      return '#161616';
  }
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#0E0E0E',
  },
  content: {
    paddingBottom: 24,
  },
  hero: {
    backgroundColor: '#161616',
    borderBottomWidth: 0.5,
    borderBottomColor: '#272727',
    paddingTop: 34 + screenTopClearance,
    paddingHorizontal: 18,
    paddingBottom: 22,
  },
  heroTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 18,
  },
  greeting: {
    color: '#555555',
    fontSize: 11,
    marginBottom: 2,
  },
  userName: {
    color: '#F0F0F0',
    fontSize: 15,
    fontWeight: '500',
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#222222',
    borderWidth: 0.5,
    borderColor: '#383838',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: '#777777',
    fontSize: 11,
    fontWeight: '500',
  },
  balanceLabel: {
    color: '#555555',
    fontSize: 10,
    marginBottom: 3,
    letterSpacing: 0.4,
  },
  balanceValue: {
    color: '#FFFFFF',
    fontSize: 30,
    fontWeight: '500',
    marginBottom: 16,
    letterSpacing: -0.5,
  },
  statGrid: {
    flexDirection: 'row',
    gap: 8,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#1E1E1E',
    borderRadius: 10,
    borderWidth: 0.5,
    borderColor: '#2A2A2A',
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  statLabel: {
    color: '#555555',
    fontSize: 10,
    marginBottom: 2,
  },
  statValue: {
    fontSize: 13,
    fontWeight: '500',
  },
  body: {
    paddingHorizontal: 14,
    paddingTop: 14,
  },
  aiCard: {
    backgroundColor: COLORS.violet,
    borderRadius: 13,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 13,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  aiIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  aiCopy: {
    flex: 1,
  },
  aiTitle: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '500',
    marginBottom: 1,
  },
  aiSubtitle: {
    color: 'rgba(255,255,255,0.62)',
    fontSize: 10,
  },
  addTransactionCard: {
    backgroundColor: '#161616',
    borderRadius: 13,
    borderWidth: 0.5,
    borderColor: '#272727',
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 13,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  addTransactionIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.green,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addTransactionCopy: {
    flex: 1,
  },
  addTransactionTitle: {
    color: '#F0F0F0',
    fontSize: 12,
    fontWeight: '500',
    marginBottom: 1,
  },
  addTransactionSubtitle: {
    color: '#666666',
    fontSize: 10,
  },
  stateCard: {
    backgroundColor: '#161616',
    borderRadius: 12,
    borderWidth: 0.5,
    borderColor: '#272727',
    paddingVertical: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 13,
  },
  errorCard: {
    paddingHorizontal: 14,
    alignItems: 'flex-start',
  },
  errorText: {
    color: COLORS.danger,
    marginBottom: 12,
    ...typography.caption,
  },
  retryButton: {
    minHeight: 34,
    paddingHorizontal: 14,
    borderRadius: 18,
    backgroundColor: '#1A1525',
    alignItems: 'center',
    justifyContent: 'center',
  },
  retryButtonText: {
    color: '#9B72F5',
    fontSize: 11,
    fontWeight: '600',
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 9,
  },
  sectionTitle: {
    color: '#BBBBBB',
    fontSize: 12,
    fontWeight: '500',
  },
  sectionLink: {
    color: '#555555',
    fontSize: 10,
  },
  spendingGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
    marginBottom: 13,
  },
  spendCard: {
    width: '48.8%',
    backgroundColor: '#161616',
    borderRadius: 11,
    borderWidth: 0.5,
    borderColor: '#272727',
    paddingHorizontal: 11,
    paddingVertical: 10,
  },
  spendIcon: {
    marginBottom: 5,
  },
  spendLabel: {
    color: '#555555',
    fontSize: 9,
    marginBottom: 2,
    minHeight: 22,
  },
  spendAmount: {
    color: '#E8E8E8',
    fontSize: 13,
    fontWeight: '500',
    marginBottom: 7,
  },
  progressTrack: {
    height: 3,
    backgroundColor: '#272727',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: 3,
    borderRadius: 2,
  },
  goalCard: {
    backgroundColor: '#161616',
    borderRadius: 11,
    borderWidth: 0.5,
    borderColor: '#272727',
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 13,
  },
  goalPressable: {
    gap: 0,
  },
  goalTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  goalLabel: {
    color: '#CCCCCC',
    fontSize: 11,
    fontWeight: '500',
  },
  goalProgress: {
    color: COLORS.green,
    fontSize: 11,
    fontWeight: '500',
  },
  goalBarTrack: {
    height: 5,
    backgroundColor: '#272727',
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 5,
  },
  goalBarFill: {
    height: 5,
    borderRadius: 3,
    backgroundColor: COLORS.green,
  },
  goalSubtext: {
    color: '#555555',
    fontSize: 9,
  },
  goalFooterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  goalLink: {
    color: COLORS.violetBright,
    fontSize: 10,
    fontWeight: '500',
  },
  goalEmptyCta: {
    alignSelf: 'flex-start',
    marginTop: 10,
    minHeight: 30,
    borderRadius: 16,
    borderWidth: 0.5,
    borderColor: '#3D2F6A',
    backgroundColor: '#1A1525',
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  goalEmptyCtaText: {
    color: COLORS.violetBright,
    fontSize: 10,
    fontWeight: '500',
  },
  insightCard: {
    backgroundColor: '#1A1625',
    borderRadius: 11,
    borderWidth: 0.5,
    borderColor: '#3D2F6A',
    paddingHorizontal: 13,
    paddingVertical: 11,
    marginBottom: 13,
    flexDirection: 'row',
    gap: 9,
    alignItems: 'flex-start',
  },
  insightIcon: {
    marginTop: 1,
  },
  insightText: {
    flex: 1,
    color: '#9B8CC4',
    fontSize: 10,
    lineHeight: 15.5,
  },
  transactionList: {
    backgroundColor: '#161616',
    borderRadius: 12,
    borderWidth: 0.5,
    borderColor: '#272727',
    overflow: 'hidden',
    marginBottom: 13,
  },
  transactionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  transactionRowBorder: {
    borderBottomWidth: 0.5,
    borderBottomColor: '#1E1E1E',
  },
  transactionIcon: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  transactionInfo: {
    flex: 1,
    minWidth: 0,
  },
  transactionTitle: {
    color: '#DDDDDD',
    fontSize: 11,
    fontWeight: '500',
    marginBottom: 1,
  },
  transactionCaption: {
    color: '#555555',
    fontSize: 9,
  },
  transactionAmount: {
    fontSize: 12,
    fontWeight: '500',
  },
  amountIncome: {
    color: COLORS.green,
  },
  amountExpense: {
    color: '#EF4444',
  },
  emptyInlineCard: {
    width: '100%',
    backgroundColor: '#161616',
    borderRadius: 11,
    borderWidth: 0.5,
    borderColor: '#272727',
    paddingHorizontal: 12,
    paddingVertical: 14,
  },
  emptyInlineText: {
    color: '#555555',
    fontSize: 10,
    lineHeight: 15,
  },
});

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
  TextInput,
  View,
} from 'react-native';

import { authPalette, screenTopClearance, typography } from '@/constants/theme';
import { getCategories, type Category } from '@/lib/api/categories';
import { ApiError } from '@/lib/api/client';
import { listTransactions, type Transaction, type TransactionType } from '@/lib/api/transactions';
import { useAuth } from '@/providers/AuthProvider';

type TypeFilter = 'all' | 'expense' | 'income';
type PeriodFilter = 'all' | 'thisMonth' | 'lastMonth';
type TransactionGroup = {
  dateKey: string;
  items: Transaction[];
  label: string;
};

const COLORS = authPalette;

export default function HistoryScreen() {
  const { getValidAccessToken, user } = useAuth();
  const isFocused = useIsFocused();
  const [categories, setCategories] = useState<Category[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>('all');
  const [sortAscending, setSortAscending] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isFocused) {
      void loadHistory();
    }
  }, [isFocused]);

  const categoryById = useMemo(() => {
    return new Map(categories.map((category) => [category.id, category]));
  }, [categories]);

  const filteredTransactions = useMemo(() => {
    const normalizedSearch = searchQuery.trim().toLowerCase();
    const base = transactions.filter((transaction) => {
      const category = transaction.category_id ? categoryById.get(transaction.category_id) : null;

      if (typeFilter !== 'all' && transaction.type !== typeFilter) {
        return false;
      }

      if (!matchesPeriodFilter(transaction.transaction_date, periodFilter)) {
        return false;
      }

      if (!normalizedSearch) {
        return true;
      }

      const searchable = [
        transaction.title,
        transaction.note ?? '',
        category?.name ?? '',
        transaction.type,
        transaction.income_frequency ? formatFrequencyLabel(transaction.income_frequency) : '',
      ]
        .join(' ')
        .toLowerCase();

      return searchable.includes(normalizedSearch);
    });

    return [...base].sort((left, right) => {
      const leftDate = `${left.transaction_date}T${left.created_at}`;
      const rightDate = `${right.transaction_date}T${right.created_at}`;

      if (sortAscending) {
        return leftDate.localeCompare(rightDate);
      }

      return rightDate.localeCompare(leftDate);
    });
  }, [categoryById, periodFilter, searchQuery, sortAscending, transactions, typeFilter]);

  const groupedTransactions = useMemo(
    () => groupTransactionsByDate(filteredTransactions),
    [filteredTransactions],
  );

  const summaryTransactions = useMemo(() => {
    return transactions.filter((transaction) => {
      if (typeFilter !== 'all' && transaction.type !== typeFilter) {
        return false;
      }

      const effectivePeriod = periodFilter === 'all' ? 'thisMonth' : periodFilter;
      return matchesPeriodFilter(transaction.transaction_date, effectivePeriod);
    });
  }, [periodFilter, transactions, typeFilter]);

  const monthSummary = useMemo(() => buildMonthSummary(summaryTransactions), [summaryTransactions]);

  const activeFilterLabel = useMemo(
    () => buildActiveFilterLabel({ periodFilter, searchQuery, typeFilter }),
    [periodFilter, searchQuery, typeFilter],
  );

  const categoryFocusSummary = useMemo(() => {
    if (!searchQuery.trim() || filteredTransactions.length === 0) {
      return null;
    }

    const categoryNames = new Set(
      filteredTransactions
        .map((transaction) => transaction.category_id ? categoryById.get(transaction.category_id)?.name : null)
        .filter((name): name is string => Boolean(name)),
    );

    if (categoryNames.size !== 1) {
      return null;
    }

    const categoryName = Array.from(categoryNames)[0];
    const total = filteredTransactions.reduce((sum, transaction) => {
      if (transaction.type !== 'expense') {
        return sum;
      }

      return sum + Number(transaction.amount);
    }, 0);
    const visibleOutflow = filteredTransactions.reduce((sum, transaction) => {
      if (transaction.type !== 'expense') {
        return sum;
      }

      return sum + Number(transaction.amount);
    }, 0);

    return {
      categoryName,
      count: filteredTransactions.length,
      progress:
        visibleOutflow > 0 ? Math.min(1, total / visibleOutflow) : 0,
      total,
    };
  }, [categoryById, filteredTransactions, searchQuery]);

  const currencyCode = (user?.currency ?? 'PKR').toUpperCase();

  async function loadHistory() {
    setIsLoading(true);
    setError(null);

    try {
      const accessToken = await getValidAccessToken();
      if (!accessToken) {
        throw new Error('Your session expired. Please log in again.');
      }

      const [categoryResult, transactionResult] = await Promise.all([
        getCategories(accessToken),
        listTransactions(accessToken),
      ]);

      setCategories(categoryResult);
      setTransactions(transactionResult);
    } catch (caughtError) {
      if (caughtError instanceof ApiError) {
        setError(caughtError.message);
      } else {
        setError(caughtError instanceof Error ? caughtError.message : 'Could not load history.');
      }
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <Text style={styles.headerTitle}>History</Text>
          <View style={styles.headerIcons}>
            <Pressable onPress={() => setSortAscending((current) => !current)}>
              <FontAwesome
                color={sortAscending ? COLORS.violet : '#555555'}
                name={sortAscending ? 'sort-amount-asc' : 'sort-amount-desc'}
                size={18}
              />
            </Pressable>
            <Pressable onPress={() => {
              setSearchQuery('');
              setTypeFilter('all');
              setPeriodFilter('all');
            }}>
              <FontAwesome
                color={searchQuery || typeFilter !== 'all' || periodFilter !== 'all' ? COLORS.violet : '#555555'}
                name="sliders"
                size={18}
              />
            </Pressable>
          </View>
        </View>

        <View style={[styles.searchBar, searchQuery ? styles.searchBarActive : null]}>
          <FontAwesome color={searchQuery ? COLORS.violet : '#444444'} name="search" size={14} />
          <TextInput
            placeholder="Search transactions..."
            placeholderTextColor="#3A3A3A"
            selectionColor={COLORS.violet}
            style={styles.searchInput}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll}>
          <View style={styles.filterRow}>
            <FilterChip active={typeFilter === 'all'} label="All" onPress={() => setTypeFilter('all')} />
            <FilterChip
              active={typeFilter === 'expense'}
              label="Expenses"
              tone="expense"
              onPress={() => setTypeFilter(typeFilter === 'expense' ? 'all' : 'expense')}
            />
            <FilterChip
              active={typeFilter === 'income'}
              label="Income"
              tone="income"
              onPress={() => setTypeFilter(typeFilter === 'income' ? 'all' : 'income')}
            />
            <FilterChip
              active={periodFilter === 'thisMonth'}
              label="This month"
              onPress={() => setPeriodFilter(periodFilter === 'thisMonth' ? 'all' : 'thisMonth')}
            />
            <FilterChip
              active={periodFilter === 'lastMonth'}
              label="Last month"
              onPress={() => setPeriodFilter(periodFilter === 'lastMonth' ? 'all' : 'lastMonth')}
            />
          </View>
        </ScrollView>
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        {activeFilterLabel ? (
          <View style={styles.filterNotice}>
            <FontAwesome color={typeFilter === 'expense' ? COLORS.danger : COLORS.violet} name="filter" size={13} />
            <Text style={styles.filterNoticeText}>{activeFilterLabel}</Text>
          </View>
        ) : null}

        {!searchQuery ? (
          <View style={styles.summaryCard}>
            <SummaryMetric label="Total in" tone="income" value={formatSignedCurrency(monthSummary.income, currencyCode)} />
            <View style={styles.summaryDivider} />
            <SummaryMetric label="Net" value={formatSignedCurrency(monthSummary.net, currencyCode)} />
            <View style={styles.summaryDivider} />
            <SummaryMetric label="Total out" align="right" tone="expense" value={formatSignedCurrency(-monthSummary.expense, currencyCode)} />
          </View>
        ) : null}

        {isLoading ? (
          <View style={styles.stateCard}>
            <ActivityIndicator color={COLORS.violet} />
          </View>
        ) : null}

        {error ? (
          <View style={[styles.stateCard, styles.errorCard]}>
            <Text style={styles.errorText}>{error}</Text>
            <Pressable onPress={() => void loadHistory()} style={styles.retryButton}>
              <Text style={styles.retryButtonText}>Retry</Text>
            </Pressable>
          </View>
        ) : null}

        {!isLoading && !error && groupedTransactions.length === 0 ? (
          <View style={styles.stateCard}>
            <Text style={styles.emptyTitle}>No transactions yet</Text>
            <Text style={styles.emptyText}>
              Add income or expenses first, then your history will show up here with filters and grouped dates.
            </Text>
          </View>
        ) : null}

        {!isLoading && !error
          ? groupedTransactions.map((group) => (
              <View key={group.dateKey}>
                <Text style={styles.dateLabel}>{group.label}</Text>
                <View style={styles.groupCard}>
                  {group.items.map((transaction, index) => {
                    const category = transaction.category_id ? categoryById.get(transaction.category_id) : null;
                    const subtitle = buildTransactionSubtitle(transaction, category);
                    const amount = Number(transaction.amount);
                    const isIncome = transaction.type === 'income';

                    return (
                      <View key={transaction.id} style={[styles.transactionRow, index === group.items.length - 1 ? null : styles.transactionRowBorder]}>
                        <View
                          style={[
                            styles.transactionIcon,
                            { backgroundColor: getTransactionIconBackground(transaction, category) },
                          ]}
                        >
                          <FontAwesome
                            color={getTransactionIconColor(transaction, category)}
                            name={getTransactionIconName(transaction, category)}
                            size={14}
                          />
                        </View>

                        <View style={styles.transactionInfo}>
                          <Text numberOfLines={1} style={styles.transactionTitle}>
                            {transaction.title}
                          </Text>
                          <Text numberOfLines={1} style={styles.transactionSubtitle}>
                            {subtitle}
                          </Text>
                        </View>

                        <View style={styles.transactionRight}>
                          <Text style={[styles.transactionAmount, isIncome ? styles.incomeAmount : styles.expenseAmount]}>
                            {isIncome ? '+' : '-'}
                            {formatCompactCurrency(amount, currencyCode)}
                          </Text>
                          <Text style={styles.transactionTime}>{formatTransactionTime(transaction.created_at)}</Text>
                        </View>
                      </View>
                    );
                  })}
                </View>
              </View>
            ))
          : null}

        {!isLoading && !error && categoryFocusSummary ? (
          <Pressable onPress={() => router.push('/(tabs)/ask-ai')} style={styles.categorySummaryCard}>
            <View style={styles.categorySummaryRow}>
              <Text style={styles.categorySummaryMeta}>
                {categoryFocusSummary.count} transactions · {categoryFocusSummary.categoryName}
              </Text>
              <Text style={styles.categorySummaryValue}>
                -{formatCompactCurrency(categoryFocusSummary.total, currencyCode)}
              </Text>
            </View>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${Math.max(8, categoryFocusSummary.progress * 100)}%` }]} />
            </View>
            <View style={styles.categorySummaryRow}>
              <Text style={styles.categorySummaryHint}>
                {Math.round(categoryFocusSummary.progress * 100)}% of visible outflow
              </Text>
              <Text style={styles.askAiHint}>Ask AI ↗</Text>
            </View>
          </Pressable>
        ) : null}

        {!isLoading && !error && filteredTransactions.length > 0 ? (
          <View style={styles.loadMore}>
            <Text style={styles.loadMoreText}>Load earlier transactions</Text>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function FilterChip({
  active,
  label,
  onPress,
  tone = 'default',
}: {
  active: boolean;
  label: string;
  onPress: () => void;
  tone?: 'default' | 'expense' | 'income';
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.filterChip,
        active && tone === 'default' ? styles.filterChipActive : null,
        active && tone === 'expense' ? styles.filterChipExpenseActive : null,
        active && tone === 'income' ? styles.filterChipIncomeActive : null,
      ]}
    >
      <Text
        style={[
          styles.filterChipText,
          active && tone === 'default' ? styles.filterChipTextActive : null,
          active && tone === 'expense' ? styles.filterChipExpenseTextActive : null,
          active && tone === 'income' ? styles.filterChipIncomeTextActive : null,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function SummaryMetric({
  align = 'left',
  label,
  tone = 'default',
  value,
}: {
  align?: 'left' | 'center' | 'right';
  label: string;
  tone?: 'default' | 'expense' | 'income';
  value: string;
}) {
  return (
    <View style={[styles.summaryMetric, align === 'center' ? styles.summaryMetricCenter : null, align === 'right' ? styles.summaryMetricRight : null]}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text
        style={[
          styles.summaryValue,
          tone === 'income' ? styles.summaryValueIncome : null,
          tone === 'expense' ? styles.summaryValueExpense : null,
        ]}
      >
        {value}
      </Text>
    </View>
  );
}

function buildMonthSummary(transactions: Transaction[]) {
  return transactions.reduce(
    (summary, transaction) => {
      const amount = Number(transaction.amount);

      if (transaction.type === 'income') {
        summary.income += amount;
        summary.net += amount;
      } else {
        summary.expense += amount;
        summary.net -= amount;
      }

      return summary;
    },
    { expense: 0, income: 0, net: 0 },
  );
}

function buildActiveFilterLabel({
  periodFilter,
  searchQuery,
  typeFilter,
}: {
  periodFilter: PeriodFilter;
  searchQuery: string;
  typeFilter: TypeFilter;
}) {
  const parts: string[] = [];

  if (typeFilter === 'expense') {
    parts.push('expenses');
  } else if (typeFilter === 'income') {
    parts.push('income');
  } else {
    parts.push('all transactions');
  }

  if (searchQuery.trim()) {
    parts.push(`matching "${searchQuery.trim()}"`);
  }

  if (periodFilter === 'thisMonth') {
    parts.push('this month');
  } else if (periodFilter === 'lastMonth') {
    parts.push('last month');
  }

  if (parts.length <= 1 && parts[0] === 'all transactions') {
    return null;
  }

  return `Showing ${parts.join(' · ')}`;
}

function buildTransactionSubtitle(transaction: Transaction, category: Category | null | undefined) {
  if (transaction.type === 'income') {
    const parts = [category?.name ?? 'Income'];

    if (transaction.income_frequency) {
      parts.push(formatFrequencyLabel(transaction.income_frequency));
    }

    return parts.join(' · ');
  }

  return category?.name ?? 'Expense';
}

function groupTransactionsByDate(transactions: Transaction[]): TransactionGroup[] {
  const groups = new Map<string, Transaction[]>();

  transactions.forEach((transaction) => {
    const existing = groups.get(transaction.transaction_date) ?? [];
    existing.push(transaction);
    groups.set(transaction.transaction_date, existing);
  });

  return Array.from(groups.entries()).map(([dateKey, items]) => ({
    dateKey,
    items,
    label: formatDateGroupLabel(dateKey),
  }));
}

function formatDateGroupLabel(dateKey: string) {
  const today = new Date();
  const todayKey = toCalendarDate(today);
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const yesterdayKey = toCalendarDate(yesterday);
  const monthDay = formatMonthDay(dateKey);

  if (dateKey === todayKey) {
    return `TODAY — ${monthDay}`;
  }

  if (dateKey === yesterdayKey) {
    return `YESTERDAY — ${monthDay}`;
  }

  return monthDay;
}

function formatMonthDay(dateKey: string) {
  const date = new Date(`${dateKey}T00:00:00`);

  return date.toLocaleDateString('en-US', {
    day: 'numeric',
    month: 'short',
  }).toUpperCase();
}

function formatTransactionTime(value: string) {
  const date = new Date(value);

  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });
}

function matchesPeriodFilter(dateKey: string, periodFilter: PeriodFilter) {
  if (periodFilter === 'all') {
    return true;
  }

  const targetDate = new Date(`${dateKey}T00:00:00`);
  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();

  if (periodFilter === 'thisMonth') {
    return targetDate.getMonth() === currentMonth && targetDate.getFullYear() === currentYear;
  }

  const lastMonthDate = new Date(currentYear, currentMonth - 1, 1);
  return (
    targetDate.getMonth() === lastMonthDate.getMonth() &&
    targetDate.getFullYear() === lastMonthDate.getFullYear()
  );
}

function toCalendarDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function formatFrequencyLabel(frequency: string) {
  switch (frequency) {
    case 'once':
      return 'One-time';
    case 'hourly':
      return 'Hourly';
    case 'daily':
      return 'Daily';
    case 'monthly':
      return 'Monthly';
    case 'yearly':
      return 'Yearly';
    default:
      return frequency;
  }
}

function formatSignedCurrency(value: number, currencyCode: string) {
  const sign = value > 0 ? '+' : value < 0 ? '-' : '';
  const formatted = formatCompactCurrency(value, currencyCode);

  if (!sign) {
    return formatted;
  }

  return `${sign}${formatted}`;
}

function formatCompactCurrency(value: number, currencyCode: string) {
  const rounded = Math.round(Math.abs(value));
  const prefix = currencyCode === 'PKR' ? 'Rs ' : `${currencyCode} `;
  return `${prefix}${rounded.toLocaleString('en-US')}`;
}

function getTransactionIconName(
  transaction: Transaction,
  category: Category | null | undefined,
): React.ComponentProps<typeof FontAwesome>['name'] {
  if (transaction.type === 'income') {
    switch (category?.name) {
      case 'Salary':
        return 'briefcase';
      case 'Freelance':
        return 'line-chart';
      case 'Investment':
        return 'bank';
      default:
        return 'money';
    }
  }

  switch (category?.icon) {
    case 'shopping-basket':
      return 'shopping-cart';
    case 'car':
      return 'car';
    case 'heartbeat':
      return 'heart';
    case 'tv':
      return 'television';
    case 'wrench':
      return 'wrench';
    case 'shopping-bag':
      return 'shopping-bag';
    case 'book':
      return 'book';
    case 'utensils':
      return 'cutlery';
    case 'film':
      return 'film';
    case 'file-text-o':
      return 'file-text-o';
    default:
      return 'ellipsis-h';
  }
}

function getTransactionIconColor(transaction: Transaction, category: Category | null | undefined) {
  if (transaction.type === 'income') {
    return COLORS.green;
  }

  return category?.color ?? '#F59E0B';
}

function getTransactionIconBackground(transaction: Transaction, category: Category | null | undefined) {
  if (transaction.type === 'income') {
    return '#131A14';
  }

  switch (category?.icon) {
    case 'shopping-basket':
    case 'utensils':
      return '#1F1A0E';
    case 'car':
      return '#131520';
    case 'heartbeat':
      return '#1A100E';
    case 'tv':
      return '#13131F';
    case 'wrench':
    case 'shopping-bag':
      return '#14131A';
    case 'book':
      return '#131A14';
    default:
      return '#161616';
  }
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#0E0E0E',
  },
  header: {
    paddingHorizontal: 18,
    paddingTop: 34 + screenTopClearance,
    paddingBottom: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: '#1E1E1E',
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  headerTitle: {
    color: '#F0F0F0',
    fontSize: 16,
    fontWeight: '500',
  },
  headerIcons: {
    flexDirection: 'row',
    gap: 12,
  },
  searchBar: {
    minHeight: 42,
    borderRadius: 22,
    borderWidth: 0.5,
    borderColor: '#2E2E2E',
    backgroundColor: '#161616',
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  searchBarActive: {
    borderColor: COLORS.violet,
  },
  searchInput: {
    flex: 1,
    color: '#E0E0E0',
    fontSize: 12,
    paddingVertical: 0,
  },
  filterScroll: {
    marginHorizontal: -2,
  },
  filterRow: {
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 2,
  },
  filterChip: {
    paddingHorizontal: 11,
    minHeight: 30,
    borderRadius: 20,
    borderWidth: 0.5,
    borderColor: '#272727',
    backgroundColor: '#161616',
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterChipActive: {
    backgroundColor: '#1A1525',
    borderColor: COLORS.violet,
  },
  filterChipExpenseActive: {
    backgroundColor: '#1A0F0F',
    borderColor: COLORS.danger,
  },
  filterChipIncomeActive: {
    backgroundColor: '#0D1A12',
    borderColor: COLORS.green,
  },
  filterChipText: {
    fontSize: 10,
    fontWeight: '500',
    color: '#555555',
  },
  filterChipTextActive: {
    color: '#9B72F5',
  },
  filterChipExpenseTextActive: {
    color: '#A05050',
  },
  filterChipIncomeTextActive: {
    color: '#4A8C5C',
  },
  body: {
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 18,
  },
  filterNotice: {
    backgroundColor: '#1A0F0F',
    borderRadius: 10,
    borderWidth: 0.5,
    borderColor: '#3D1A1A',
    paddingHorizontal: 12,
    paddingVertical: 9,
    marginBottom: 13,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  filterNoticeText: {
    flex: 1,
    color: '#A05050',
    ...typography.caption,
  },
  summaryCard: {
    backgroundColor: '#161616',
    borderRadius: 12,
    borderWidth: 0.5,
    borderColor: '#272727',
    paddingHorizontal: 13,
    paddingVertical: 10,
    marginBottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
  },
  summaryMetric: {
    flex: 1,
  },
  summaryMetricCenter: {
    alignItems: 'center',
  },
  summaryMetricRight: {
    alignItems: 'flex-end',
  },
  summaryLabel: {
    color: '#555555',
    fontSize: 10,
    marginBottom: 2,
  },
  summaryValue: {
    color: '#F0F0F0',
    fontSize: 13,
    fontWeight: '500',
  },
  summaryValueIncome: {
    color: COLORS.green,
  },
  summaryValueExpense: {
    color: '#EF4444',
  },
  summaryDivider: {
    width: 0.5,
    alignSelf: 'stretch',
    backgroundColor: '#272727',
    marginHorizontal: 12,
  },
  stateCard: {
    backgroundColor: '#161616',
    borderRadius: 12,
    borderWidth: 0.5,
    borderColor: '#272727',
    paddingHorizontal: 16,
    paddingVertical: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  errorCard: {
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
  emptyTitle: {
    color: '#F0F0F0',
    marginBottom: 6,
    ...typography.bodyStrong,
  },
  emptyText: {
    color: '#555555',
    textAlign: 'center',
    ...typography.caption,
  },
  dateLabel: {
    color: '#555555',
    fontSize: 10,
    letterSpacing: 0.45,
    marginBottom: 7,
  },
  groupCard: {
    backgroundColor: '#161616',
    borderRadius: 12,
    borderWidth: 0.5,
    borderColor: '#272727',
    overflow: 'hidden',
    marginBottom: 10,
  },
  transactionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  transactionRowBorder: {
    borderBottomWidth: 0.5,
    borderBottomColor: '#1E1E1E',
  },
  transactionIcon: {
    width: 32,
    height: 32,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  transactionInfo: {
    flex: 1,
    minWidth: 0,
  },
  transactionTitle: {
    color: '#DDDDDD',
    fontSize: 12,
    fontWeight: '500',
    marginBottom: 1,
  },
  transactionSubtitle: {
    color: '#555555',
    fontSize: 10,
  },
  transactionRight: {
    alignItems: 'flex-end',
  },
  transactionAmount: {
    fontSize: 12,
    fontWeight: '500',
    marginBottom: 1,
  },
  incomeAmount: {
    color: COLORS.green,
  },
  expenseAmount: {
    color: '#EF4444',
  },
  transactionTime: {
    color: '#444444',
    fontSize: 9,
  },
  categorySummaryCard: {
    backgroundColor: '#161616',
    borderRadius: 11,
    borderWidth: 0.5,
    borderColor: '#272727',
    paddingHorizontal: 13,
    paddingVertical: 11,
    marginBottom: 10,
  },
  categorySummaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  categorySummaryMeta: {
    color: '#555555',
    fontSize: 10,
  },
  categorySummaryValue: {
    color: '#EF4444',
    fontSize: 13,
    fontWeight: '500',
  },
  progressTrack: {
    height: 3,
    borderRadius: 2,
    backgroundColor: '#272727',
    marginTop: 6,
    marginBottom: 5,
    overflow: 'hidden',
  },
  progressFill: {
    height: 3,
    borderRadius: 2,
    backgroundColor: '#F59E0B',
  },
  categorySummaryHint: {
    color: '#555555',
    fontSize: 9,
  },
  askAiHint: {
    color: COLORS.violet,
    fontSize: 9,
  },
  loadMore: {
    alignItems: 'center',
    paddingTop: 4,
    paddingBottom: 8,
  },
  loadMoreText: {
    color: '#555555',
    fontSize: 11,
  },
});

import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useIsFocused } from '@react-navigation/native';
import { router } from 'expo-router';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  SafeAreaView,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Buffer } from 'buffer';

import { authPalette, screenTopClearance, typography } from '@/constants/theme';
import { ApiError } from '@/lib/api/client';
import {
  fetchReportExport,
  getReportSummary,
  type InsightCategoryAnalytics,
  type InsightMonthlyCashflowPoint,
  type ReportSummaryResponse,
  type ReportSummaryTransaction,
} from '@/lib/api/insights';
import { useAuth } from '@/providers/AuthProvider';

const COLORS = authPalette;
const RANGE_OPTIONS = [4, 6, 12] as const;

type SortMode = 'amount' | 'delta';

export default function ReportsScreen() {
  const { getValidAccessToken, user } = useAuth();
  const isFocused = useIsFocused();
  const [months, setMonths] = useState<(typeof RANGE_OPTIONS)[number]>(4);
  const [report, setReport] = useState<ReportSummaryResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [sortMode, setSortMode] = useState<SortMode>('amount');
  const [isExporting, setIsExporting] = useState<'csv' | 'email' | 'pdf' | 'share' | null>(null);

  useEffect(() => {
    if (isFocused) {
      void loadReport(months);
    }
  }, [isFocused, months]);

  const currencyCode = (user?.currency ?? 'PKR').toUpperCase();
  const monthRows = report?.monthly_overview ?? [];
  const currentMonth = monthRows.find((item) => item.is_current) ?? monthRows[monthRows.length - 1] ?? null;
  const incomeRetentionPct = useMemo(() => {
    if (!report) {
      return { retained: 0, spent: 0 };
    }

    const income = Number(report.total_income) || 0;
    const expense = Number(report.total_expense) || 0;
    if (income <= 0) {
      return { retained: 0, spent: 0 };
    }

    const spent = Math.min(100, (expense / income) * 100);
    return {
      retained: Math.max(0, 100 - spent),
      spent,
    };
  }, [report]);
  const peakIncome = useMemo(
    () => Math.max(...monthRows.map((item) => Number(item.total_income) || 0), 1),
    [monthRows],
  );
  const peakExpense = useMemo(
    () => Math.max(...monthRows.map((item) => Number(item.total_expense) || 0), 1),
    [monthRows],
  );
  const sortedCategories = useMemo(() => {
    const categories = [...(report?.category_table ?? [])];
    if (sortMode === 'delta') {
      return categories.sort((left, right) => {
        const leftDelta = Math.abs(Number(left.delta_percentage ?? '0'));
        const rightDelta = Math.abs(Number(right.delta_percentage ?? '0'));
        return rightDelta - leftDelta;
      });
    }

    return categories.sort((left, right) => Number(right.total_amount) - Number(left.total_amount));
  }, [report?.category_table, sortMode]);

  async function loadReport(nextMonths: number) {
    setIsLoading(true);
    setError(null);

    try {
      const accessToken = await getValidAccessToken();
      if (!accessToken) {
        throw new Error('Your session expired. Please log in again.');
      }

      const result = await getReportSummary(accessToken, nextMonths);
      setReport(result);
    } catch (caughtError) {
      if (caughtError instanceof ApiError) {
        setError(caughtError.message);
      } else {
        setError(caughtError instanceof Error ? caughtError.message : 'Could not load reports.');
      }
    } finally {
      setIsLoading(false);
    }
  }

  async function handleFileExport(format: 'csv' | 'pdf') {
    setIsExporting(format);
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

      const exported = await fetchReportExport(accessToken, format, months);
      const fileName =
        extractFileName(exported.contentDisposition) ??
        `finpilot-report-${months === 12 ? '1y' : `${months}m`}.${format}`;
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
        dialogTitle: format === 'pdf' ? 'Share PDF report' : 'Share CSV report',
        mimeType: exported.contentType,
        UTI: format === 'pdf' ? 'com.adobe.pdf' : 'public.comma-separated-values-text',
      });
    } catch (caughtError) {
      const message = caughtError instanceof Error ? caughtError.message : `Could not export ${format.toUpperCase()}.`;
      setError(message);
      Alert.alert('Export failed', message);
    } finally {
      setIsExporting(null);
    }
  }

  async function handleShareSummary() {
    if (!report) {
      return;
    }

    setIsExporting('share');
    try {
      await Share.share({
        message: buildShareSummary(report, currencyCode),
      });
    } catch (caughtError) {
      const message = caughtError instanceof Error ? caughtError.message : 'Could not open share sheet.';
      setError(message);
      Alert.alert('Share failed', message);
    } finally {
      setIsExporting(null);
    }
  }

  async function handleEmailSummary() {
    if (!report) {
      return;
    }

    setIsExporting('email');
    try {
      const subject = encodeURIComponent(`FinPilot report - ${report.period_label}`);
      const body = encodeURIComponent(buildEmailSummary(report, currencyCode));
      const url = `mailto:?subject=${subject}&body=${body}`;
      const supported = await Linking.canOpenURL(url);
      if (!supported) {
        throw new Error('No email app is configured on this device.');
      }

      await Linking.openURL(url);
    } catch (caughtError) {
      const message = caughtError instanceof Error ? caughtError.message : 'Could not open email composer.';
      setError(message);
      Alert.alert('Email failed', message);
    } finally {
      setIsExporting(null);
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <View style={styles.headerTop}>
            <Text style={styles.headerTitle}>Reports</Text>
            <View style={styles.headerIcons}>
              <Pressable onPress={() => void handleFileExport('pdf')} style={styles.headerIconButton}>
                <FontAwesome color={isExporting === 'pdf' ? COLORS.violet : '#555555'} name="download" size={16} />
              </Pressable>
              <Pressable onPress={() => void handleShareSummary()} style={styles.headerIconButton}>
                <FontAwesome color={isExporting === 'share' ? COLORS.violet : '#555555'} name="share-alt" size={16} />
              </Pressable>
            </View>
          </View>
          <View style={styles.periodRow}>
            {monthRows.map((item) => (
              <View
                key={item.month_key}
                style={[styles.periodChip, item.is_current ? styles.periodChipSelected : null]}
              >
                <Text style={[styles.periodChipText, item.is_current ? styles.periodChipTextSelected : null]}>
                  {item.month_label}
                </Text>
              </View>
            ))}
            {RANGE_OPTIONS.map((option) => (
              <Pressable
                key={option}
                onPress={() => setMonths(option)}
                style={[styles.periodChip, months === option ? styles.periodChipSelected : null]}
              >
                <Text style={[styles.periodChipText, months === option ? styles.periodChipTextSelected : null]}>
                  {option === 12 ? '1Y' : `${option}M`}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={styles.body}>
          {isLoading ? (
            <View style={styles.stateCard}>
              <ActivityIndicator color={COLORS.violet} />
            </View>
          ) : null}

          {error ? (
            <View style={[styles.stateCard, styles.errorCard]}>
              <Text style={styles.errorText}>{error}</Text>
              <Pressable onPress={() => void loadReport(months)} style={styles.retryButton}>
                <Text style={styles.retryButtonText}>Retry</Text>
              </Pressable>
            </View>
          ) : null}

          {!isLoading && !error && report ? (
            <>
              <View style={styles.netHero}>
                <Text style={styles.netMonth}>{report.period_label.toUpperCase()} - NET SAVED</Text>
                <Text style={[styles.netAmount, Number(report.net_saved) < 0 ? styles.netAmountNegative : null]}>
                  {Number(report.net_saved) >= 0 ? '+' : ''}
                  {formatMoney(report.net_saved, currencyCode)}
                </Text>

                <View style={styles.netRow}>
                  <View style={styles.netCol}>
                    <Text style={styles.netLabel}>
                      <FontAwesome color={COLORS.green} name="arrow-down" size={10} /> Total income
                    </Text>
                    <Text style={[styles.netVal, styles.netValIncome]}>
                      {formatMoney(report.total_income, currencyCode)}
                    </Text>
                    <Text style={styles.netSub}>Tracked in your income stream</Text>
                  </View>
                  <View style={styles.netDivider} />
                  <View style={styles.netCol}>
                    <Text style={styles.netLabel}>
                      <FontAwesome color={COLORS.danger} name="arrow-up" size={10} /> Total spent
                    </Text>
                    <Text style={[styles.netVal, styles.netValExpense]}>
                      {formatMoney(report.total_expense, currencyCode)}
                    </Text>
                    <Text style={styles.netSub}>Across {report.transaction_count} transactions</Text>
                  </View>
                </View>

                <View style={styles.netBarRow}>
                  <View style={[styles.netBarIn, { flex: incomeRetentionPct.retained || 0.01 }]} />
                  <View style={[styles.netBarOut, { flex: incomeRetentionPct.spent || 0.01 }]} />
                </View>
                <View style={styles.netBarLabels}>
                  <Text style={styles.retainedText}>{incomeRetentionPct.retained.toFixed(1)}% retained</Text>
                  <Text style={styles.spentText}>{incomeRetentionPct.spent.toFixed(1)}% spent</Text>
                </View>
              </View>

              <SectionHead title="Income vs expense" />
              <View style={styles.chartCard}>
                <View style={styles.chartLegend}>
                  <LegendDot color={COLORS.green} label="Income" />
                  <LegendDot color={COLORS.danger} label="Expenses" />
                </View>
                <View style={styles.barGroupChart}>
                  {monthRows.map((item) => (
                    <CashflowBarGroup
                      key={item.month_key}
                      item={item}
                      peakExpense={peakExpense}
                      peakIncome={peakIncome}
                    />
                  ))}
                  <ProjectedGroup />
                </View>
              </View>

              <View style={styles.savingsRateCard}>
                <View>
                  <Text style={styles.savingsRateLabel}>Savings rate this month</Text>
                  <Text style={styles.savingsRateValue}>
                    {Number(report.savings_rate).toFixed(1)}%
                    <Text style={styles.savingsRateDelta}>
                      {' '}
                      {formatSavingsRateDelta(report.savings_rate_delta)}
                    </Text>
                  </Text>
                </View>
                <View style={styles.savingsRateRing}>
                  <Text style={styles.savingsRateRingText}>{Math.round(Number(report.savings_rate))}%</Text>
                </View>
              </View>

              <SectionHead actionLabel="Full year" title="Month breakdown" />
              <View style={styles.monthCards}>
                {monthRows.length ? (
                  monthRows
                    .slice()
                    .reverse()
                    .map((item) => (
                      <MonthBreakdownCard
                        key={`${item.month_key}-card`}
                        currencyCode={currencyCode}
                        item={item}
                        maxExpense={peakExpense}
                        maxIncome={peakIncome}
                      />
                    ))
                ) : (
                  <EmptyBlock copy="Month-by-month report cards will appear here after you log transactions." />
                )}
              </View>

              <SectionHead
                actionLabel={sortMode === 'amount' ? 'Sort ↑↓' : 'Sort by delta'}
                onPress={() => setSortMode((current) => (current === 'amount' ? 'delta' : 'amount'))}
                title="Spending by category"
              />
              <View style={styles.categoryTable}>
                <View style={styles.tableHeader}>
                  <Text style={[styles.tableHeaderLabel, styles.tableHeaderCategory]}>CATEGORY</Text>
                  <Text style={styles.tableHeaderLabel}>AMOUNT</Text>
                  <Text style={styles.tableHeaderLabel}>VS LAST</Text>
                </View>
                {sortedCategories.length ? (
                  sortedCategories.map((item, index) => (
                    <CategoryTableRow
                      key={`${item.category_id ?? item.name}-table`}
                      currencyCode={currencyCode}
                      isLast={index === sortedCategories.length - 1}
                      item={item}
                    />
                  ))
                ) : (
                  <EmptyTableRow copy="No category spending to report yet." />
                )}
              </View>

              <SectionHead actionLabel="All" title="Largest transactions" />
              <View style={styles.transactionsCard}>
                {report.largest_transactions.length ? (
                  report.largest_transactions.map((transaction, index) => (
                    <LargestTransactionRow
                      key={transaction.id}
                      currencyCode={currencyCode}
                      isLast={index === report.largest_transactions.length - 1}
                      transaction={transaction}
                    />
                  ))
                ) : (
                  <EmptyBlock copy="Your largest transactions will appear here once you log more activity." />
                )}
              </View>

              <SectionHead title="Export report" />
              <View style={styles.exportRow}>
                <ExportButton
                  busy={isExporting === 'pdf'}
                  icon="file-pdf-o"
                  label="PDF"
                  onPress={() => void handleFileExport('pdf')}
                />
                <ExportButton
                  busy={isExporting === 'csv'}
                  icon="table"
                  label="CSV"
                  onPress={() => void handleFileExport('csv')}
                />
                <ExportButton
                  busy={isExporting === 'share'}
                  icon="share-alt"
                  label="Share"
                  onPress={() => void handleShareSummary()}
                />
                <ExportButton
                  busy={isExporting === 'email'}
                  icon="envelope-o"
                  label="Email"
                  onPress={() => void handleEmailSummary()}
                />
              </View>

              <Pressable onPress={() => router.push('/(tabs)/ask-ai')} style={styles.askAiCard}>
                <View style={styles.askAiLeft}>
                  <FontAwesome color={COLORS.violet} name="android" size={16} />
                  <Text style={styles.askAiText}>Ask AI about this month&apos;s report</Text>
                </View>
                <FontAwesome color={COLORS.violet} name="chevron-right" size={13} />
              </Pressable>
            </>
          ) : null}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function SectionHead({
  actionLabel,
  onPress,
  title,
}: {
  actionLabel?: string;
  onPress?: () => void;
  title: string;
}) {
  return (
    <View style={styles.sectionHead}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {actionLabel ? (
        <Pressable disabled={!onPress} onPress={onPress}>
          <Text style={styles.sectionLink}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <Text style={styles.legendLabel}>{label}</Text>
    </View>
  );
}

function CashflowBarGroup({
  item,
  peakExpense,
  peakIncome,
}: {
  item: InsightMonthlyCashflowPoint;
  peakExpense: number;
  peakIncome: number;
}) {
  const incomeHeight = Math.max(12, Math.round(((Number(item.total_income) || 0) / peakIncome) * 56));
  const expenseHeight = Math.max(12, Math.round(((Number(item.total_expense) || 0) / peakExpense) * 56));

  return (
    <View style={styles.barMonthGroup}>
      <View style={styles.barPair}>
        <View style={[styles.barIn, item.is_current ? styles.barInCurrent : styles.barFaded, { height: incomeHeight }]} />
        <View style={[styles.barOut, item.is_current ? styles.barOutCurrent : styles.barFaded, { height: expenseHeight }]} />
      </View>
      <Text style={[styles.barMonthLabel, item.is_current ? styles.barMonthLabelCurrent : null]}>
        {item.month_label}
      </Text>
    </View>
  );
}

function ProjectedGroup() {
  return (
    <View style={styles.barMonthGroup}>
      <View style={styles.barPair}>
        <View style={[styles.barProjected, { height: 20 }]} />
        <View style={[styles.barProjected, { height: 14 }]} />
      </View>
      <Text style={styles.barMonthLabel}>Next</Text>
    </View>
  );
}

function MonthBreakdownCard({
  currencyCode,
  item,
  maxExpense,
  maxIncome,
}: {
  currencyCode: string;
  item: InsightMonthlyCashflowPoint;
  maxExpense: number;
  maxIncome: number;
}) {
  const incomeWidth = maxIncome > 0 ? Math.max(10, (Number(item.total_income) / maxIncome) * 100) : 10;
  const expenseWidth = maxExpense > 0 ? Math.max(10, (Number(item.total_expense) / maxExpense) * 100) : 10;

  return (
    <View style={styles.monthCard}>
      <View style={styles.monthCardTop}>
        <Text style={styles.monthCardMonth}>{item.month_label}</Text>
        <Text style={[styles.monthCardNet, Number(item.net) >= 0 ? styles.monthCardNetPositive : styles.monthCardNetNegative]}>
          {Number(item.net) >= 0 ? '+' : ''}
          {formatMoney(item.net, currencyCode)}
        </Text>
      </View>
      <View style={styles.monthBars}>
        <MonthMetricBar
          color={COLORS.green}
          label="In"
          value={formatCompactNumber(item.total_income)}
          width={incomeWidth}
        />
        <MonthMetricBar
          color={COLORS.danger}
          label="Out"
          value={formatCompactNumber(item.total_expense)}
          width={expenseWidth}
        />
      </View>
    </View>
  );
}

function MonthMetricBar({
  color,
  label,
  value,
  width,
}: {
  color: string;
  label: string;
  value: string;
  width: number;
}) {
  return (
    <View style={styles.monthBarRow}>
      <Text style={[styles.monthBarLabel, { color }]}>{label}</Text>
      <View style={styles.monthBarBg}>
        <View style={[styles.monthBarFill, { backgroundColor: color, width: `${Math.min(100, width)}%` }]} />
      </View>
      <Text style={[styles.monthBarValue, { color }]}>{value}</Text>
    </View>
  );
}

function CategoryTableRow({
  currencyCode,
  isLast,
  item,
}: {
  currencyCode: string;
  isLast: boolean;
  item: InsightCategoryAnalytics;
}) {
  const color = item.color ?? getFallbackCategoryColor(item.name);
  const delta = Number(item.delta_percentage ?? '0');
  const deltaStyle =
    item.trend_direction === 'down'
      ? styles.deltaDown
      : item.trend_direction === 'up'
        ? styles.deltaUp
        : styles.deltaFlat;

  return (
    <View style={[styles.tableRow, !isLast ? styles.tableRowDivider : null]}>
      <View style={styles.tableCategoryWrap}>
        <View style={[styles.tableDot, { backgroundColor: color }]} />
        <Text style={styles.tableCategoryName}>{item.name}</Text>
      </View>
      <Text style={styles.tableAmount}>{formatCompactNumber(item.total_amount)}</Text>
      <Text style={[styles.tableDelta, deltaStyle]}>
        {item.trend_direction === 'flat' || Math.abs(delta) < 0.5
          ? '→ 0%'
          : `${item.trend_direction === 'down' ? '↓' : '↑'} ${Math.abs(delta).toFixed(0)}%`}
      </Text>
    </View>
  );
}

function EmptyTableRow({ copy }: { copy: string }) {
  return (
    <View style={styles.emptyTableRow}>
      <Text style={styles.emptyCopy}>{copy}</Text>
    </View>
  );
}

function LargestTransactionRow({
  currencyCode,
  isLast,
  transaction,
}: {
  currencyCode: string;
  isLast: boolean;
  transaction: ReportSummaryTransaction;
}) {
  const color = transaction.category?.color ?? getFallbackCategoryColor(transaction.category?.name ?? transaction.title);
  return (
    <View style={[styles.transactionRow, !isLast ? styles.transactionRowDivider : null]}>
      <View style={[styles.transactionIcon, { backgroundColor: getIconBackground(color) }]}>
        <FontAwesome color={color} name={mapCategoryIcon(transaction.category?.icon)} size={14} />
      </View>
      <View style={styles.transactionMeta}>
        <Text numberOfLines={1} style={styles.transactionTitle}>
          {transaction.title}
        </Text>
        <Text style={styles.transactionSub}>
          {(transaction.category?.name ?? 'Uncategorized')} · {formatShortDate(transaction.transaction_date)}
        </Text>
      </View>
      <Text style={styles.transactionAmount}>
        {transaction.type === 'expense' ? '-' : '+'}
        {formatMoney(transaction.amount, currencyCode)}
      </Text>
    </View>
  );
}

function ExportButton({
  busy,
  icon,
  label,
  onPress,
}: {
  busy: boolean;
  icon: React.ComponentProps<typeof FontAwesome>['name'];
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable disabled={busy} onPress={onPress} style={[styles.exportButton, busy ? styles.exportButtonBusy : null]}>
      {busy ? (
        <ActivityIndicator color={COLORS.violet} size="small" />
      ) : (
        <FontAwesome color={COLORS.violet} name={icon} size={18} />
      )}
      <Text style={styles.exportLabel}>{label}</Text>
    </Pressable>
  );
}

function EmptyBlock({ copy }: { copy: string }) {
  return (
    <View style={styles.emptyBlock}>
      <Text style={styles.emptyCopy}>{copy}</Text>
    </View>
  );
}

function extractFileName(contentDisposition: string | null) {
  if (!contentDisposition) {
    return null;
  }

  const match = contentDisposition.match(/filename="([^"]+)"/i);
  return match?.[1] ?? null;
}

function buildShareSummary(report: ReportSummaryResponse, currencyCode: string) {
  const topCategory = report.category_table[0];
  return [
    `FinPilot report - ${report.period_label}`,
    `Net saved: ${formatMoney(report.net_saved, currencyCode)}`,
    `Income: ${formatMoney(report.total_income, currencyCode)}`,
    `Expenses: ${formatMoney(report.total_expense, currencyCode)}`,
    `Savings rate: ${Number(report.savings_rate).toFixed(1)}%`,
    topCategory ? `Top category: ${topCategory.name} (${formatMoney(topCategory.total_amount, currencyCode)})` : null,
  ]
    .filter(Boolean)
    .join('\n');
}

function buildEmailSummary(report: ReportSummaryResponse, currencyCode: string) {
  const biggest = report.largest_transactions[0];
  return [
    `FinPilot report for ${report.period_label}`,
    '',
    `Net saved: ${formatMoney(report.net_saved, currencyCode)}`,
    `Total income: ${formatMoney(report.total_income, currencyCode)}`,
    `Total expenses: ${formatMoney(report.total_expense, currencyCode)}`,
    `Savings rate: ${Number(report.savings_rate).toFixed(1)}%`,
    biggest ? `Largest transaction: ${biggest.title} (${formatMoney(biggest.amount, currencyCode)})` : null,
  ]
    .filter(Boolean)
    .join('\n');
}

function formatSavingsRateDelta(value: string | null) {
  if (!value || !Number.isFinite(Number(value))) {
    return 'vs prior month unavailable';
  }

  const numeric = Number(value);
  if (Math.abs(numeric) < 0.1) {
    return 'vs last month stable';
  }

  return `${numeric > 0 ? '↑' : '↓'} vs ${Math.abs(numeric).toFixed(1)} pts last mo`;
}

function formatMoney(value: string | number, currencyCode: string) {
  const numeric = typeof value === 'number' ? value : Number(value);
  const symbol = getCurrencySymbol(currencyCode);

  if (!Number.isFinite(numeric)) {
    return currencyCode === 'USD' ? `${symbol}0` : `${symbol} 0`;
  }

  const amount = Math.round(numeric).toLocaleString('en-US');
  return currencyCode === 'USD' ? `${symbol}${amount}` : `${symbol} ${amount}`;
}

function formatCompactNumber(value: string | number) {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) {
    return '0';
  }

  return Math.round(numeric).toLocaleString('en-US');
}

function formatShortDate(value: string) {
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleDateString('en-US', {
    day: 'numeric',
    month: 'short',
  });
}

function getCurrencySymbol(currencyCode: string) {
  switch (currencyCode.toUpperCase()) {
    case 'PKR':
      return 'Rs';
    case 'USD':
      return '$';
    case 'EUR':
      return 'EUR';
    case 'QAR':
      return 'QAR';
    default:
      return currencyCode.toUpperCase();
  }
}

function mapCategoryIcon(icon: string | null | undefined): React.ComponentProps<typeof FontAwesome>['name'] {
  switch (icon) {
    case 'briefcase':
      return 'briefcase';
    case 'laptop':
      return 'laptop';
    case 'line-chart':
      return 'line-chart';
    case 'shopping-basket':
      return 'shopping-basket';
    case 'car':
      return 'car';
    case 'shopping-bag':
      return 'shopping-bag';
    case 'heartbeat':
      return 'heartbeat';
    case 'tv':
      return 'television';
    case 'wrench':
      return 'wrench';
    case 'book':
      return 'book';
    case 'utensils':
      return 'cutlery';
    case 'bus':
      return 'bus';
    default:
      return 'tag';
  }
}

function getFallbackCategoryColor(name: string) {
  const normalized = name.toLowerCase();
  if (normalized.includes('food') || normalized.includes('grocery')) {
    return COLORS.amber;
  }
  if (normalized.includes('transport')) {
    return '#6366F1';
  }
  if (normalized.includes('health')) {
    return COLORS.danger;
  }
  if (normalized.includes('subscription')) {
    return COLORS.violet;
  }
  if (normalized.includes('education')) {
    return COLORS.green;
  }
  return '#888888';
}

function getIconBackground(color: string) {
  if (color === COLORS.amber) {
    return '#1F1A0E';
  }
  if (color === '#6366F1') {
    return '#131520';
  }
  if (color === COLORS.danger) {
    return '#1A100E';
  }
  if (color === COLORS.violet) {
    return '#13131F';
  }
  if (color === COLORS.green) {
    return '#0D1A12';
  }
  return '#161616';
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#0E0E0E',
  },
  content: {
    paddingBottom: 24,
  },
  header: {
    paddingHorizontal: 18,
    paddingTop: 28 + screenTopClearance,
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
    fontSize: 16,
    fontWeight: '500',
    color: '#F0F0F0',
  },
  headerIcons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerIconButton: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  periodRow: {
    flexDirection: 'row',
    gap: 5,
    flexWrap: 'wrap',
  },
  periodChip: {
    minWidth: 30,
    borderRadius: 8,
    borderWidth: 0.5,
    borderColor: '#272727',
    backgroundColor: '#161616',
    paddingHorizontal: 8,
    paddingVertical: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  periodChipSelected: {
    backgroundColor: '#1A1525',
    borderColor: COLORS.violet,
  },
  periodChipText: {
    color: '#555555',
    fontSize: 10,
    fontWeight: '500',
  },
  periodChipTextSelected: {
    color: '#9B72F5',
  },
  body: {
    paddingHorizontal: 14,
    paddingTop: 14,
  },
  netHero: {
    backgroundColor: '#161616',
    borderWidth: 0.5,
    borderColor: '#272727',
    borderRadius: 13,
    paddingHorizontal: 15,
    paddingVertical: 14,
    marginBottom: 13,
  },
  netMonth: {
    color: '#555555',
    fontSize: 10,
    marginBottom: 4,
    letterSpacing: 0.4,
  },
  netAmount: {
    fontSize: 28,
    fontWeight: '500',
    color: COLORS.green,
    marginBottom: 12,
    letterSpacing: -0.5,
  },
  netAmountNegative: {
    color: COLORS.danger,
  },
  netRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    marginBottom: 10,
  },
  netCol: {
    flex: 1,
    paddingHorizontal: 10,
  },
  netDivider: {
    width: 0.5,
    backgroundColor: '#272727',
  },
  netLabel: {
    color: '#555555',
    fontSize: 9,
    marginBottom: 2,
  },
  netVal: {
    fontSize: 13,
    fontWeight: '500',
  },
  netValIncome: {
    color: COLORS.green,
  },
  netValExpense: {
    color: COLORS.danger,
  },
  netSub: {
    color: '#555555',
    fontSize: 9,
    marginTop: 2,
  },
  netBarRow: {
    flexDirection: 'row',
    height: 5,
    borderRadius: 3,
    overflow: 'hidden',
    gap: 2,
  },
  netBarIn: {
    backgroundColor: COLORS.green,
    borderRadius: 3,
  },
  netBarOut: {
    backgroundColor: COLORS.danger,
    borderRadius: 3,
  },
  netBarLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  retainedText: {
    color: '#4A8C5C',
    fontSize: 9,
  },
  spentText: {
    color: '#A05050',
    fontSize: 9,
  },
  sectionHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  sectionTitle: {
    color: '#BBBBBB',
    fontSize: 12,
    fontWeight: '500',
  },
  sectionLink: {
    color: COLORS.violet,
    fontSize: 10,
  },
  chartCard: {
    backgroundColor: '#161616',
    borderWidth: 0.5,
    borderColor: '#272727',
    borderRadius: 12,
    paddingHorizontal: 13,
    paddingVertical: 12,
    marginBottom: 13,
  },
  chartLegend: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 10,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  legendDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  legendLabel: {
    color: '#888888',
    fontSize: 10,
  },
  barGroupChart: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 4,
    height: 80,
  },
  barMonthGroup: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  barPair: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 2,
    flex: 1,
    width: '100%',
  },
  barIn: {
    flex: 1,
    borderTopLeftRadius: 3,
    borderTopRightRadius: 3,
    backgroundColor: COLORS.green,
  },
  barOut: {
    flex: 1,
    borderTopLeftRadius: 3,
    borderTopRightRadius: 3,
    backgroundColor: COLORS.danger,
  },
  barFaded: {
    opacity: 0.4,
  },
  barInCurrent: {
    opacity: 1,
  },
  barOutCurrent: {
    opacity: 1,
  },
  barProjected: {
    flex: 1,
    borderRadius: 3,
    borderWidth: 0.5,
    borderStyle: 'dashed',
    borderColor: '#2E2E2E',
    alignSelf: 'flex-end',
  },
  barMonthLabel: {
    color: '#555555',
    fontSize: 8,
  },
  barMonthLabelCurrent: {
    color: '#9B72F5',
    fontWeight: '500',
  },
  savingsRateCard: {
    backgroundColor: '#0D1A12',
    borderWidth: 0.5,
    borderColor: '#1A3D22',
    borderRadius: 11,
    paddingHorizontal: 13,
    paddingVertical: 10,
    marginBottom: 13,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  savingsRateLabel: {
    color: '#555555',
    fontSize: 10,
    marginBottom: 2,
  },
  savingsRateValue: {
    color: COLORS.green,
    fontSize: 18,
    fontWeight: '500',
  },
  savingsRateDelta: {
    color: '#4A8C5C',
    fontSize: 10,
    fontWeight: '400',
  },
  savingsRateRing: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 3,
    borderColor: COLORS.green,
    alignItems: 'center',
    justifyContent: 'center',
  },
  savingsRateRingText: {
    color: COLORS.green,
    fontSize: 11,
    fontWeight: '500',
  },
  monthCards: {
    gap: 7,
    marginBottom: 13,
  },
  monthCard: {
    backgroundColor: '#161616',
    borderWidth: 0.5,
    borderColor: '#272727',
    borderRadius: 11,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  monthCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 7,
  },
  monthCardMonth: {
    color: '#DDDDDD',
    fontSize: 12,
    fontWeight: '500',
  },
  monthCardNet: {
    fontSize: 12,
    fontWeight: '500',
  },
  monthCardNetPositive: {
    color: COLORS.green,
  },
  monthCardNetNegative: {
    color: COLORS.danger,
  },
  monthBars: {
    gap: 4,
  },
  monthBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  monthBarLabel: {
    width: 28,
    fontSize: 9,
  },
  monthBarBg: {
    flex: 1,
    height: 3,
    borderRadius: 2,
    backgroundColor: '#272727',
  },
  monthBarFill: {
    height: 3,
    borderRadius: 2,
  },
  monthBarValue: {
    width: 54,
    textAlign: 'right',
    fontSize: 9,
    fontWeight: '500',
  },
  categoryTable: {
    backgroundColor: '#161616',
    borderWidth: 0.5,
    borderColor: '#272727',
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 13,
  },
  tableHeader: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 0.5,
    borderBottomColor: '#272727',
  },
  tableHeaderCategory: {
    flex: 1,
    textAlign: 'left',
  },
  tableHeaderLabel: {
    width: 72,
    color: '#555555',
    fontSize: 9,
    fontWeight: '500',
    textAlign: 'right',
    letterSpacing: 0.4,
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  tableRowDivider: {
    borderBottomWidth: 0.5,
    borderBottomColor: '#1E1E1E',
  },
  tableCategoryWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  tableDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  tableCategoryName: {
    color: '#DDDDDD',
    fontSize: 11,
  },
  tableAmount: {
    width: 72,
    color: COLORS.danger,
    fontSize: 11,
    fontWeight: '500',
    textAlign: 'right',
  },
  tableDelta: {
    width: 72,
    fontSize: 10,
    textAlign: 'right',
  },
  deltaUp: {
    color: COLORS.danger,
  },
  deltaDown: {
    color: COLORS.green,
  },
  deltaFlat: {
    color: '#888888',
  },
  emptyTableRow: {
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  transactionsCard: {
    backgroundColor: '#161616',
    borderWidth: 0.5,
    borderColor: '#272727',
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 13,
  },
  transactionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  transactionRowDivider: {
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
  transactionMeta: {
    flex: 1,
  },
  transactionTitle: {
    color: '#DDDDDD',
    fontSize: 11,
    fontWeight: '500',
    marginBottom: 1,
  },
  transactionSub: {
    color: '#555555',
    fontSize: 9,
  },
  transactionAmount: {
    color: COLORS.danger,
    fontSize: 12,
    fontWeight: '500',
  },
  exportRow: {
    flexDirection: 'row',
    gap: 7,
    marginBottom: 16,
  },
  exportButton: {
    flex: 1,
    backgroundColor: '#161616',
    borderWidth: 0.5,
    borderColor: '#272727',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    minHeight: 64,
  },
  exportButtonBusy: {
    opacity: 0.75,
  },
  exportLabel: {
    color: '#888888',
    fontSize: 10,
  },
  askAiCard: {
    backgroundColor: '#1A1525',
    borderRadius: 10,
    borderWidth: 0.5,
    borderColor: '#3D2F6A',
    paddingHorizontal: 13,
    paddingVertical: 10,
    marginBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  askAiLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  askAiText: {
    color: '#9B72F5',
    fontSize: 11,
  },
  stateCard: {
    backgroundColor: '#161616',
    borderRadius: 12,
    borderWidth: 0.5,
    borderColor: '#272727',
    paddingVertical: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  errorCard: {
    alignItems: 'flex-start',
    paddingHorizontal: 14,
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
  emptyBlock: {
    backgroundColor: '#161616',
    borderWidth: 0.5,
    borderColor: '#272727',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 16,
  },
  emptyCopy: {
    color: '#555555',
    fontSize: 10,
    lineHeight: 15,
  },
});

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
import Svg, { Circle } from 'react-native-svg';

import { authPalette, screenTopClearance, typography } from '@/constants/theme';
import { ApiError } from '@/lib/api/client';
import {
  getSpendingAnalysis,
  type InsightCard,
  type InsightCategoryAnalytics,
  type InsightMonthlySpendPoint,
  type SpendingAnalysisResponse,
} from '@/lib/api/insights';
import { useAuth } from '@/providers/AuthProvider';

const COLORS = authPalette;
const DONUT_SIZE = 92;
const DONUT_RADIUS = 34;
const DONUT_CIRCUMFERENCE = 2 * Math.PI * DONUT_RADIUS;
const RANGE_OPTIONS = [4, 6, 12] as const;

export default function SpendingAnalysisScreen() {
  const { getValidAccessToken, user } = useAuth();
  const isFocused = useIsFocused();
  const [months, setMonths] = useState<(typeof RANGE_OPTIONS)[number]>(4);
  const [analysis, setAnalysis] = useState<SpendingAnalysisResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isFocused) {
      void loadAnalysis(months);
    }
  }, [isFocused, months]);

  const currencyCode = (user?.currency ?? 'PKR').toUpperCase();
  const donutSlices = useMemo(() => buildDonutSlices(analysis?.category_breakdown ?? []), [analysis?.category_breakdown]);
  const categoryRows = analysis?.category_breakdown.slice(0, 5) ?? [];
  const trendRows = analysis?.monthly_trend ?? [];
  const trendPeak = useMemo(
    () => Math.max(...trendRows.map((item) => Number(item.total_amount) || 0), 1),
    [trendRows],
  );
  const currentMonthLabel = useMemo(
    () => trendRows.find((item) => item.is_current)?.month_label ?? analysis?.period_label.split(' ')[0] ?? 'Now',
    [analysis?.period_label, trendRows],
  );
  const currentTrend = useMemo(
    () => trendRows.find((item) => item.is_current) ?? trendRows[trendRows.length - 1] ?? null,
    [trendRows],
  );
  const previousTrend = useMemo(() => {
    if (!currentTrend) {
      return null;
    }

    const currentIndex = trendRows.findIndex((item) => item.month_key === currentTrend.month_key);
    if (currentIndex <= 0) {
      return null;
    }

    return trendRows[currentIndex - 1];
  }, [currentTrend, trendRows]);
  const trendDelta = useMemo(() => {
    if (!currentTrend || !previousTrend) {
      return null;
    }

    const currentAmount = Number(currentTrend.total_amount);
    const previousAmount = Number(previousTrend.total_amount);
    if (!previousAmount) {
      return null;
    }

    return ((currentAmount - previousAmount) / previousAmount) * 100;
  }, [currentTrend, previousTrend]);

  async function loadAnalysis(nextMonths: number) {
    setIsLoading(true);
    setError(null);

    try {
      const accessToken = await getValidAccessToken();
      if (!accessToken) {
        throw new Error('Your session expired. Please log in again.');
      }

      const result = await getSpendingAnalysis(accessToken, nextMonths);
      setAnalysis(result);
    } catch (caughtError) {
      if (caughtError instanceof ApiError) {
        setError(caughtError.message);
      } else {
        setError(caughtError instanceof Error ? caughtError.message : 'Could not load spending analysis.');
      }
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <View style={styles.headerTop}>
            <Text style={styles.headerTitle}>Spending analysis</Text>
            <Pressable onPress={() => router.push('/(tabs)/ask-ai')} style={styles.headerAction}>
              <FontAwesome color="#555555" name="share-alt" size={16} />
            </Pressable>
          </View>
          <View style={styles.periodRow}>
            {trendRows.map((item) => (
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
              <Pressable onPress={() => void loadAnalysis(months)} style={styles.retryButton}>
                <Text style={styles.retryButtonText}>Retry</Text>
              </Pressable>
            </View>
          ) : null}

          {!isLoading && !error && analysis ? (
            <>
              <View style={styles.donutSection}>
                <View style={styles.donutWrap}>
                  <Svg height={DONUT_SIZE} viewBox={`0 0 ${DONUT_SIZE} ${DONUT_SIZE}`} width={DONUT_SIZE}>
                    <Circle
                      cx={DONUT_SIZE / 2}
                      cy={DONUT_SIZE / 2}
                      fill="none"
                      r={DONUT_RADIUS}
                      stroke="#272727"
                      strokeWidth={12}
                    />
                    {donutSlices.map((slice) => (
                      <Circle
                        key={slice.key}
                        cx={DONUT_SIZE / 2}
                        cy={DONUT_SIZE / 2}
                        fill="none"
                        r={DONUT_RADIUS}
                        stroke={slice.color}
                        strokeDasharray={`${slice.dash} ${DONUT_CIRCUMFERENCE}`}
                        strokeDashoffset={slice.offset}
                        strokeLinecap="butt"
                        strokeWidth={12}
                        transform={`rotate(-90 ${DONUT_SIZE / 2} ${DONUT_SIZE / 2})`}
                      />
                    ))}
                  </Svg>
                  <View style={styles.donutCenter}>
                    <Text style={styles.donutTotal}>{formatCompactMoney(analysis.total_spent, currencyCode)}</Text>
                    <Text style={styles.donutLabel}>total</Text>
                  </View>
                </View>

                <View style={styles.legend}>
                  {categoryRows.length ? (
                    categoryRows.map((item) => (
                      <View key={`${item.category_id ?? item.name}-legend`} style={styles.legendRow}>
                        <View
                          style={[
                            styles.legendDot,
                            { backgroundColor: item.color ?? getFallbackCategoryColor(item.name) },
                          ]}
                        />
                        <Text numberOfLines={1} style={styles.legendName}>
                          {item.name}
                        </Text>
                        <Text style={styles.legendPct}>{Math.round(Number(item.percentage))}%</Text>
                        <Text style={styles.legendAmt}>
                          {formatCompactMoney(item.total_amount, currencyCode)}
                        </Text>
                      </View>
                    ))
                  ) : (
                    <Text style={styles.emptyCopy}>Add some expenses to unlock category breakdowns.</Text>
                  )}
                </View>
              </View>

              <SectionHead actionLabel="Current month" title="By category" />
              <View style={styles.categoryList}>
                {categoryRows.length ? (
                  categoryRows.map((item, index) => (
                    <CategoryRow
                      key={`${item.category_id ?? item.name}-row`}
                      currencyCode={currencyCode}
                      item={item}
                      maxPercent={Number(categoryRows[0]?.percentage ?? 0)}
                      isLast={index === categoryRows.length - 1}
                    />
                  ))
                ) : (
                  <EmptyBlock copy="Your category bars will appear here once you start tracking expenses." />
                )}
              </View>

              <SectionHead title="Monthly trend" />
              <View style={styles.trendCard}>
                <View style={styles.trendChart}>
                  {trendRows.map((item) => {
                    const amount = Number(item.total_amount) || 0;
                    const height = Math.max(12, Math.round((amount / trendPeak) * 58));
                    return (
                      <View key={item.month_key} style={styles.barCol}>
                        <View style={item.is_current ? styles.barCurrentMarker : null}>
                          <View
                            style={[
                              styles.barStack,
                              item.is_current ? styles.barStackCurrent : styles.barStackPast,
                              { height },
                            ]}
                          />
                        </View>
                        <Text style={[styles.barMonth, item.is_current ? styles.barMonthCurrent : null]}>
                          {item.month_label}
                        </Text>
                      </View>
                    );
                  })}
                </View>
                <View style={styles.trendFooter}>
                  <Text style={styles.trendCaption}>
                    {currentMonthLabel} is {trendDelta && trendDelta > 0 ? 'tracking above' : 'being compared with'} your recent spending trend.
                  </Text>
                  <Text
                    style={[
                      styles.trendDelta,
                      trendDelta && trendDelta > 0 ? styles.trendDeltaUp : styles.trendDeltaDown,
                    ]}
                  >
                    {formatTrendDelta(trendDelta)}
                  </Text>
                </View>
              </View>

              <SectionHead title="Spending behavior" />
              <View style={styles.behaviorCard}>
                <View style={styles.behaviorTop}>
                  <Text style={styles.behaviorLabel}>This month&apos;s pattern</Text>
                  <View style={styles.behaviorBadge}>
                    <Text style={styles.behaviorBadgeText}>{analysis.behavior.label}</Text>
                  </View>
                </View>
                <View style={styles.scoreRow}>
                  {buildBehaviorSegments(analysis.behavior.score).map((tone, index) => (
                    <View
                      key={`score-${index}`}
                      style={[
                        styles.scoreSeg,
                        tone === 'good' ? styles.scoreSegGood : null,
                        tone === 'warn' ? styles.scoreSegWarn : null,
                        tone === 'bad' ? styles.scoreSegBad : null,
                      ]}
                    />
                  ))}
                </View>
                <View style={styles.scoreLabels}>
                  <Text style={styles.scoreLabel}>Disciplined</Text>
                  <Text style={styles.scoreLabel}>Moderate</Text>
                  <Text style={styles.scoreLabel}>Impulsive</Text>
                </View>

                <View style={styles.behaviorStats}>
                  <BehaviorMetric label="planned buys" tone="good" value={analysis.behavior.planned_buys} />
                  <BehaviorDivider />
                  <BehaviorMetric label="impulse buys" tone="warn" value={analysis.behavior.impulse_buys} />
                  <BehaviorDivider />
                  <BehaviorMetric label="overspent days" tone="bad" value={analysis.behavior.overspent_days} />
                </View>
              </View>

              <View style={styles.insightsHeader}>
                <Text style={styles.sectionTitle}>AI insights</Text>
                <View style={styles.poweredBadge}>
                  <FontAwesome color={COLORS.violet} name="android" size={11} />
                  <Text style={styles.poweredBadgeText}>powered</Text>
                </View>
              </View>

              <View style={styles.insightList}>
                {analysis.insights.length ? (
                  analysis.insights.map((item, index) => (
                    <InsightRow key={`${item.title}-${index}`} item={item} />
                  ))
                ) : (
                  <EmptyBlock copy="Log more transactions to unlock FinPilot insight cards." />
                )}
              </View>

              <Pressable onPress={() => router.push('/(tabs)/ask-ai')} style={styles.askAiCard}>
                <View style={styles.askAiLeft}>
                  <FontAwesome color={COLORS.violet} name="android" size={16} />
                  <Text style={styles.askAiText}>Ask AI about your spending</Text>
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
  title,
}: {
  actionLabel?: string;
  title: string;
}) {
  return (
    <View style={styles.sectionHead}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {actionLabel ? <Text style={styles.sectionLink}>{actionLabel}</Text> : null}
    </View>
  );
}

function CategoryRow({
  currencyCode,
  isLast,
  item,
  maxPercent,
}: {
  currencyCode: string;
  isLast: boolean;
  item: InsightCategoryAnalytics;
  maxPercent: number;
}) {
  const color = item.color ?? getFallbackCategoryColor(item.name);
  const pct = Number(item.percentage) || 0;
  const normalizedWidth = maxPercent > 0 ? Math.max(16, (pct / maxPercent) * 100) : 16;
  const deltaLabel = formatDeltaLabel(item.delta_percentage, item.trend_direction);

  return (
    <View style={[styles.categoryRow, !isLast ? styles.categoryRowDivider : null]}>
      <View style={[styles.categoryIcon, { backgroundColor: getIconBackground(color) }]}>
        <FontAwesome color={color} name={mapCategoryIcon(item.icon)} size={13} />
      </View>
      <View style={styles.categoryInfo}>
        <Text style={styles.categoryName}>{item.name}</Text>
        <View style={styles.categoryBarBg}>
          <View
            style={[
              styles.categoryBarFill,
              {
                backgroundColor: color,
                width: `${Math.min(100, normalizedWidth)}%`,
              },
            ]}
          />
        </View>
      </View>
      <View style={styles.categoryRight}>
        <Text style={styles.categoryAmt}>{formatMoney(item.total_amount, currencyCode)}</Text>
        <Text style={styles.categoryPct}>{deltaLabel}</Text>
      </View>
    </View>
  );
}

function BehaviorMetric({
  label,
  tone,
  value,
}: {
  label: string;
  tone: 'bad' | 'good' | 'warn';
  value: number;
}) {
  return (
    <View style={styles.behaviorMetric}>
      <Text
        style={[
          styles.behaviorMetricValue,
          tone === 'good' ? styles.metricGood : null,
          tone === 'warn' ? styles.metricWarn : null,
          tone === 'bad' ? styles.metricBad : null,
        ]}
      >
        {value}
      </Text>
      <Text style={styles.behaviorMetricLabel}>{label}</Text>
    </View>
  );
}

function BehaviorDivider() {
  return <View style={styles.behaviorDivider} />;
}

function InsightRow({ item }: { item: InsightCard }) {
  const toneStyles =
    item.severity === 'good'
      ? {
          card: styles.insightCardGood,
          color: COLORS.green,
          copy: styles.insightDescGood,
          icon: 'check-circle',
        }
      : item.severity === 'bad'
        ? {
            card: styles.insightCardBad,
            color: '#EF4444',
            copy: styles.insightDescBad,
            icon: 'fire',
          }
        : {
            card: styles.insightCardWarn,
            color: COLORS.amber,
            copy: styles.insightDescWarn,
            icon: 'clock-o',
          };

  return (
    <View style={[styles.insightCard, toneStyles.card]}>
      <FontAwesome color={toneStyles.color} name={toneStyles.icon as React.ComponentProps<typeof FontAwesome>['name']} size={15} />
      <View style={styles.insightBody}>
        <Text style={[styles.insightTitle, { color: toneStyles.color }]}>{item.title}</Text>
        <Text style={[styles.insightDesc, toneStyles.copy]}>{item.description}</Text>
      </View>
    </View>
  );
}

function EmptyBlock({ copy }: { copy: string }) {
  return (
    <View style={styles.emptyBlock}>
      <Text style={styles.emptyCopy}>{copy}</Text>
    </View>
  );
}

function buildDonutSlices(categories: InsightCategoryAnalytics[]) {
  let offset = 0;
  return categories.slice(0, 5).map((item) => {
    const percentage = Math.max(0, Number(item.percentage) || 0);
    const dash = (percentage / 100) * DONUT_CIRCUMFERENCE;
    const slice = {
      key: `${item.category_id ?? item.name}-slice`,
      color: item.color ?? getFallbackCategoryColor(item.name),
      dash,
      offset: -offset,
    };
    offset += dash;
    return slice;
  });
}

function buildBehaviorSegments(score: number) {
  const normalized = Math.max(0, Math.min(8, Math.round(score / 12.5)));
  return Array.from({ length: 8 }, (_, index) => {
    if (index >= normalized) {
      return 'empty' as const;
    }

    if (index <= 2) {
      return 'good' as const;
    }

    if (index <= 4) {
      return 'warn' as const;
    }

    return 'bad' as const;
  });
}

function formatTrendDelta(delta: number | null) {
  if (delta === null || !Number.isFinite(delta)) {
    return 'No prior month';
  }

  if (Math.abs(delta) < 0.5) {
    return 'Same';
  }

  return `${delta > 0 ? '↑' : '↓'} ${Math.abs(delta).toFixed(0)}%`;
}

function formatDeltaLabel(delta: string | null, trendDirection: string) {
  if (delta === null || !Number.isFinite(Number(delta))) {
    return 'No prior month';
  }

  const numeric = Number(delta);
  if (trendDirection === 'flat' || Math.abs(numeric) < 0.5) {
    return '→ same';
  }

  return `${trendDirection === 'down' ? '↓' : '↑'} ${Math.abs(numeric).toFixed(0)}% vs last mo`;
}

function mapCategoryIcon(icon: string | null | undefined): React.ComponentProps<typeof FontAwesome>['name'] {
  switch (icon) {
    case 'utensils':
      return 'cutlery';
    case 'shopping-basket':
      return 'shopping-basket';
    case 'bus':
      return 'bus';
    case 'car':
      return 'car';
    case 'heartbeat':
      return 'heart-o';
    case 'television':
      return 'tv';
    case 'graduation-cap':
      return 'graduation-cap';
    case 'bolt':
      return 'bolt';
    case 'tshirt':
      return 'shopping-bag';
    case 'gamepad':
      return 'gamepad';
    case 'home':
      return 'home';
    default:
      return 'pie-chart';
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
    return '#EF4444';
  }
  if (normalized.includes('subscription')) {
    return COLORS.violet;
  }
  return '#2E2E2E';
}

function getIconBackground(color: string) {
  if (color === COLORS.amber) {
    return '#1F1A0E';
  }
  if (color === '#6366F1') {
    return '#131520';
  }
  if (color === '#EF4444') {
    return '#1A100E';
  }
  if (color === COLORS.violet) {
    return '#13131F';
  }
  return '#1A1A1A';
}

function formatMoney(value: string, currencyCode: string) {
  const numeric = Number(value);
  const prefix = currencyCode === 'PKR' ? 'Rs ' : `${currencyCode} `;

  if (!Number.isFinite(numeric)) {
    return `${prefix}0`;
  }

  return `${prefix}${Math.round(numeric).toLocaleString('en-US')}`;
}

function formatCompactMoney(value: string, currencyCode: string) {
  const numeric = Number(value);
  const prefix = currencyCode === 'PKR' ? 'Rs ' : `${currencyCode} `;

  if (!Number.isFinite(numeric)) {
    return `${prefix}0`;
  }

  if (numeric >= 100000) {
    return `${prefix}${(numeric / 100000).toFixed(2).replace(/\.00$/, '')}L`;
  }

  return `${prefix}${Math.round(numeric).toLocaleString('en-US')}`;
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
    color: '#F0F0F0',
    fontSize: 16,
    fontWeight: '500',
  },
  headerAction: {
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
  donutSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginBottom: 14,
  },
  donutWrap: {
    width: DONUT_SIZE,
    height: DONUT_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  donutCenter: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  donutTotal: {
    color: '#F0F0F0',
    fontSize: 13,
    fontWeight: '500',
  },
  donutLabel: {
    color: '#555555',
    fontSize: 9,
  },
  legend: {
    flex: 1,
    gap: 5,
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendName: {
    color: '#BBBBBB',
    fontSize: 10,
    flex: 1,
  },
  legendPct: {
    color: '#DDDDDD',
    fontSize: 10,
    fontWeight: '500',
  },
  legendAmt: {
    color: '#555555',
    fontSize: 9,
  },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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
  categoryList: {
    backgroundColor: '#161616',
    borderRadius: 12,
    borderWidth: 0.5,
    borderColor: '#272727',
    overflow: 'hidden',
    marginBottom: 13,
  },
  categoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  categoryRowDivider: {
    borderBottomWidth: 0.5,
    borderBottomColor: '#1E1E1E',
  },
  categoryIcon: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryInfo: {
    flex: 1,
  },
  categoryName: {
    color: '#DDDDDD',
    fontSize: 11,
    fontWeight: '500',
    marginBottom: 4,
  },
  categoryBarBg: {
    height: 3,
    borderRadius: 2,
    backgroundColor: '#272727',
  },
  categoryBarFill: {
    height: 3,
    borderRadius: 2,
  },
  categoryRight: {
    alignItems: 'flex-end',
  },
  categoryAmt: {
    color: '#EF4444',
    fontSize: 12,
    fontWeight: '500',
    marginBottom: 1,
  },
  categoryPct: {
    color: '#555555',
    fontSize: 9,
  },
  trendCard: {
    backgroundColor: '#161616',
    borderRadius: 12,
    borderWidth: 0.5,
    borderColor: '#272727',
    paddingHorizontal: 13,
    paddingVertical: 12,
    marginBottom: 13,
  },
  trendChart: {
    height: 70,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 6,
    marginTop: 10,
    marginBottom: 6,
  },
  barCol: {
    flex: 1,
    alignItems: 'center',
    gap: 3,
  },
  barCurrentMarker: {
    position: 'relative',
    alignItems: 'center',
  },
  barStack: {
    width: '100%',
    borderTopLeftRadius: 4,
    borderTopRightRadius: 4,
  },
  barStackPast: {
    backgroundColor: '#272727',
  },
  barStackCurrent: {
    backgroundColor: COLORS.violet,
  },
  barMonth: {
    color: '#555555',
    fontSize: 9,
  },
  barMonthCurrent: {
    color: '#9B72F5',
    fontWeight: '500',
  },
  trendFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  trendCaption: {
    color: '#555555',
    fontSize: 9,
    flex: 1,
  },
  trendDelta: {
    fontSize: 10,
    fontWeight: '500',
  },
  trendDeltaUp: {
    color: '#EF4444',
  },
  trendDeltaDown: {
    color: COLORS.green,
  },
  behaviorCard: {
    backgroundColor: '#161616',
    borderRadius: 12,
    borderWidth: 0.5,
    borderColor: '#272727',
    paddingHorizontal: 13,
    paddingVertical: 12,
    marginBottom: 13,
  },
  behaviorTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  behaviorLabel: {
    color: '#BBBBBB',
    fontSize: 11,
    fontWeight: '500',
  },
  behaviorBadge: {
    borderRadius: 20,
    borderWidth: 0.5,
    borderColor: '#F59E0B44',
    backgroundColor: '#1F1A0E',
    paddingHorizontal: 9,
    paddingVertical: 3,
  },
  behaviorBadgeText: {
    color: COLORS.amber,
    fontSize: 10,
    fontWeight: '500',
  },
  scoreRow: {
    flexDirection: 'row',
    gap: 3,
    marginBottom: 6,
  },
  scoreSeg: {
    flex: 1,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#272727',
  },
  scoreSegGood: {
    backgroundColor: COLORS.green,
  },
  scoreSegWarn: {
    backgroundColor: COLORS.amber,
  },
  scoreSegBad: {
    backgroundColor: '#EF4444',
  },
  scoreLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  scoreLabel: {
    color: '#555555',
    fontSize: 9,
  },
  behaviorStats: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 0.5,
    borderTopColor: '#272727',
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  behaviorMetric: {
    flex: 1,
    alignItems: 'center',
  },
  behaviorMetricValue: {
    fontSize: 18,
    fontWeight: '500',
    marginBottom: 2,
  },
  metricGood: {
    color: COLORS.green,
  },
  metricWarn: {
    color: COLORS.amber,
  },
  metricBad: {
    color: '#EF4444',
  },
  behaviorMetricLabel: {
    color: '#555555',
    fontSize: 9,
    textAlign: 'center',
  },
  behaviorDivider: {
    width: 0.5,
    backgroundColor: '#272727',
  },
  insightsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  poweredBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  poweredBadgeText: {
    color: COLORS.violet,
    fontSize: 10,
  },
  insightList: {
    gap: 7,
    marginBottom: 13,
  },
  insightCard: {
    borderRadius: 10,
    borderWidth: 0.5,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    gap: 9,
    alignItems: 'flex-start',
  },
  insightCardWarn: {
    backgroundColor: '#1F1A0E',
    borderColor: '#3D2F0D',
  },
  insightCardBad: {
    backgroundColor: '#1A0F0F',
    borderColor: '#3D1A1A',
  },
  insightCardGood: {
    backgroundColor: '#0D1A12',
    borderColor: '#1A3D22',
  },
  insightBody: {
    flex: 1,
  },
  insightTitle: {
    fontSize: 11,
    fontWeight: '500',
    marginBottom: 2,
  },
  insightDesc: {
    fontSize: 10,
    lineHeight: 15,
  },
  insightDescWarn: {
    color: '#7A5C1E',
  },
  insightDescBad: {
    color: '#7A3A3A',
  },
  insightDescGood: {
    color: '#4A8C5C',
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

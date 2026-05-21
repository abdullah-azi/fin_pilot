import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useIsFocused } from '@react-navigation/native';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
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
import { getImportHistory, type ImportHistoryItem } from '@/lib/api/imports';
import { useAuth } from '@/providers/AuthProvider';

const COLORS = authPalette;

export default function ImportHistoryScreen() {
  const { getValidAccessToken } = useAuth();
  const isFocused = useIsFocused();
  const [items, setItems] = useState<ImportHistoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isFocused) {
      void loadHistory();
    }
  }, [isFocused]);

  async function loadHistory() {
    setIsLoading(true);
    setError(null);

    try {
      const accessToken = await getValidAccessToken();
      if (!accessToken) {
        throw new Error('Your session expired. Please log in again.');
      }

      const response = await getImportHistory(accessToken);
      setItems(response.items);
    } catch (caughtError) {
      if (caughtError instanceof ApiError) {
        setError(caughtError.message);
      } else {
        setError(caughtError instanceof Error ? caughtError.message : 'Could not load import history.');
      }
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.closeButton}>
            <FontAwesome color="#888888" name="close" size={16} />
          </Pressable>
          <Text style={styles.headerTitle}>Import history</Text>
          <Text style={styles.headerCopy}>See what got imported, when it happened, and how many rows were skipped.</Text>
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
              <Pressable onPress={() => void loadHistory()} style={styles.retryButton}>
                <Text style={styles.retryButtonText}>Retry</Text>
              </Pressable>
            </View>
          ) : null}

          {!isLoading && !error && !items.length ? (
            <View style={styles.emptyCard}>
              <FontAwesome color={COLORS.violet} name="history" size={18} />
              <Text style={styles.emptyTitle}>No imports yet</Text>
              <Text style={styles.emptyCopy}>Your CSV statement imports will appear here after the first confirmed import.</Text>
            </View>
          ) : null}

          {!isLoading && !error && items.length ? (
            items.map((item) => (
              <View key={item.id} style={styles.batchCard}>
                <View style={styles.batchTop}>
                  <View style={styles.batchFileWrap}>
                    <Text numberOfLines={1} style={styles.batchFile}>
                      {item.source_name ?? 'CSV import'}
                    </Text>
                    <Text style={styles.batchDate}>{formatTimestamp(item.created_at)}</Text>
                  </View>
                  <View style={styles.batchStatus}>
                    <Text style={styles.batchImported}>{item.imported_count} imported</Text>
                  </View>
                </View>

                <View style={styles.metricsRow}>
                  <MiniMetric label="Parsed" value={String(item.original_parsed_count)} />
                  <MiniMetric label="Requested" value={String(item.requested_count)} />
                  <MiniMetric label="Ignored" value={String(item.ignored_count)} />
                  <MiniMetric label="Duplicates" value={String(item.skipped_duplicate_count)} />
                </View>

                <View style={styles.rangeCard}>
                  <Text style={styles.rangeLabel}>Transaction date range</Text>
                  <Text style={styles.rangeValue}>
                    {item.transaction_date_from && item.transaction_date_to
                      ? `${formatShortDate(item.transaction_date_from)} to ${formatShortDate(item.transaction_date_to)}`
                      : 'Not available'}
                  </Text>
                </View>
              </View>
            ))
          ) : null}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.miniMetric}>
      <Text style={styles.miniMetricValue}>{value}</Text>
      <Text style={styles.miniMetricLabel}>{label}</Text>
    </View>
  );
}

function formatTimestamp(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleDateString('en-US', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
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

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  content: {
    paddingBottom: 24,
  },
  header: {
    paddingHorizontal: 18,
    paddingTop: 28 + screenTopClearance,
    paddingBottom: 14,
    borderBottomWidth: 0.5,
    borderBottomColor: '#1E1E1E',
  },
  closeButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: COLORS.surface,
    borderWidth: 0.5,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  headerTitle: {
    color: COLORS.text,
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 6,
  },
  headerCopy: {
    color: COLORS.textMuted,
    ...typography.caption,
  },
  body: {
    paddingHorizontal: 14,
    paddingTop: 14,
    gap: 12,
  },
  stateCard: {
    backgroundColor: '#161616',
    borderRadius: 12,
    borderWidth: 0.5,
    borderColor: '#272727',
    paddingVertical: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorCard: {
    backgroundColor: 'rgba(240,106,99,0.12)',
    borderRadius: 12,
    borderWidth: 0.5,
    borderColor: 'rgba(240,106,99,0.28)',
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 10,
  },
  errorText: {
    color: COLORS.danger,
    ...typography.caption,
  },
  retryButton: {
    minHeight: 34,
    alignSelf: 'flex-start',
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
  emptyCard: {
    backgroundColor: '#161616',
    borderRadius: 16,
    borderWidth: 0.5,
    borderColor: '#272727',
    paddingHorizontal: 16,
    paddingVertical: 22,
    alignItems: 'center',
  },
  emptyTitle: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: '600',
    marginTop: 10,
    marginBottom: 5,
  },
  emptyCopy: {
    color: COLORS.textMuted,
    textAlign: 'center',
    ...typography.caption,
  },
  batchCard: {
    backgroundColor: '#161616',
    borderRadius: 16,
    borderWidth: 0.5,
    borderColor: '#272727',
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  batchTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 12,
  },
  batchFileWrap: {
    flex: 1,
  },
  batchFile: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 4,
  },
  batchDate: {
    color: COLORS.textSoft,
    fontSize: 10,
  },
  batchStatus: {
    borderRadius: 999,
    backgroundColor: '#0D1A12',
    borderWidth: 0.5,
    borderColor: '#1B4B2B',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  batchImported: {
    color: COLORS.green,
    fontSize: 10,
    fontWeight: '600',
  },
  metricsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  miniMetric: {
    flex: 1,
    backgroundColor: '#111116',
    borderRadius: 12,
    borderWidth: 0.5,
    borderColor: '#23232B',
    paddingHorizontal: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  miniMetricValue: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 2,
  },
  miniMetricLabel: {
    color: COLORS.textSoft,
    fontSize: 9,
  },
  rangeCard: {
    backgroundColor: '#111116',
    borderRadius: 12,
    borderWidth: 0.5,
    borderColor: '#23232B',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  rangeLabel: {
    color: COLORS.textSoft,
    fontSize: 10,
    marginBottom: 3,
  },
  rangeValue: {
    color: COLORS.text,
    fontSize: 11,
    fontWeight: '500',
  },
});

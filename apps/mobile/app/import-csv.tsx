import FontAwesome from '@expo/vector-icons/FontAwesome';
import * as DocumentPicker from 'expo-document-picker';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { authPalette, typography } from '@/constants/theme';
import { getCategories, type Category } from '@/lib/api/categories';
import { ApiError } from '@/lib/api/client';
import {
  confirmCSVImport,
  previewCSVImport,
  type CSVImportConfirmResponse,
  type CSVImportPreviewResponse,
  type CSVImportPreviewRow,
} from '@/lib/api/imports';
import { getTransactionHistory, type Transaction } from '@/lib/api/transactions';
import { useAuth } from '@/providers/AuthProvider';

const COLORS = authPalette;

type EditableImportRow = CSVImportPreviewRow;

type RowDraft = {
  amount: string;
  category_id: string | null;
  note: string;
  row_index: number;
  title: string;
  transaction_date: string;
  type: 'expense' | 'income';
};

export default function ImportCSVScreen() {
  const { getValidAccessToken, user } = useAuth();
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const [preview, setPreview] = useState<CSVImportPreviewResponse | null>(null);
  const [editableRows, setEditableRows] = useState<EditableImportRow[]>([]);
  const [ignoredRows, setIgnoredRows] = useState<EditableImportRow[]>([]);
  const [existingTransactions, setExistingTransactions] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [editingRowIndex, setEditingRowIndex] = useState<number | null>(null);
  const [selectedFingerprints, setSelectedFingerprints] = useState<string[]>([]);
  const [isBulkCategoryModalOpen, setIsBulkCategoryModalOpen] = useState(false);
  const [isPreConfirmOpen, setIsPreConfirmOpen] = useState(false);
  const [draft, setDraft] = useState<RowDraft | null>(null);
  const [result, setResult] = useState<CSVImportConfirmResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [isPicking, setIsPicking] = useState(false);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);

  const currencyCode = (user?.currency ?? 'PKR').toUpperCase();
  const categoryOptions = useMemo(
    () =>
      categories
        .filter((category) => !category.is_hidden)
        .sort((left, right) => left.effective_name.localeCompare(right.effective_name)),
    [categories],
  );
  const draftCategories = useMemo(() => {
    if (!draft) {
      return [];
    }

    return categoryOptions.filter((category) => category.type === draft.type || category.type === 'both');
  }, [categoryOptions, draft]);
  const selectedRows = useMemo(
    () => editableRows.filter((row) => selectedFingerprints.includes(row.fingerprint)),
    [editableRows, selectedFingerprints],
  );
  const duplicateInfo = useMemo(() => {
    const inFileCounts = new Map<string, number>();
    const existingKeys = new Set(existingTransactions.map((transaction) => buildLikelyDuplicateKey(transaction)));

    for (const row of editableRows) {
      const key = buildLikelyDuplicateKey(row);
      inFileCounts.set(key, (inFileCounts.get(key) ?? 0) + 1);
    }

    return new Map(
      editableRows.map((row) => {
        const key = buildLikelyDuplicateKey(row);
        const isInFileDuplicate = (inFileCounts.get(key) ?? 0) > 1;
        const matchesExisting = existingKeys.has(key);

        let kind: 'existing' | 'file' | 'both' | null = null;
        if (isInFileDuplicate && matchesExisting) {
          kind = 'both';
        } else if (isInFileDuplicate) {
          kind = 'file';
        } else if (matchesExisting) {
          kind = 'existing';
        }

        return [row.fingerprint, kind] as const;
      }),
    );
  }, [editableRows, existingTransactions]);
  const duplicateRows = useMemo(
    () => editableRows.filter((row) => duplicateInfo.get(row.fingerprint)),
    [duplicateInfo, editableRows],
  );
  const allActiveRowsLookDuplicate = editableRows.length > 0 && duplicateRows.length === editableRows.length;
  const bulkCategoryOptions = useMemo(() => {
    if (!selectedRows.length) {
      return [];
    }

    const selectedTypes = Array.from(new Set(selectedRows.map((row) => row.type)));
    return categoryOptions.filter((category) => {
      if (category.type === 'both') {
        return true;
      }

      if (selectedTypes.length > 1) {
        return false;
      }

      return category.type === selectedTypes[0];
    });
  }, [categoryOptions, selectedRows]);

  async function handlePickCSV() {
    setIsPicking(true);
    setError(null);

    try {
      const picked = await DocumentPicker.getDocumentAsync({
        copyToCacheDirectory: true,
        multiple: false,
        type: [
          'text/csv',
          'text/comma-separated-values',
          'application/vnd.ms-excel',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        ],
      });

      if (picked.canceled) {
        return;
      }

      const file = picked.assets[0];
      const fileName = file?.name?.toLowerCase() ?? '';
      if (!fileName.endsWith('.csv') && !fileName.endsWith('.xlsx')) {
        throw new Error('Please choose a .csv or .xlsx statement file.');
      }

      const accessToken = await getValidAccessToken();
      if (!accessToken) {
        throw new Error('Your session expired. Please log in again.');
      }

      setSelectedFileName(file.name);
      setPreview(null);
      setEditableRows([]);
      setIgnoredRows([]);
      setSelectedFingerprints([]);
      setResult(null);
      setEditingRowIndex(null);
      setDraft(null);
      setIsPreviewing(true);

      const [nextPreview, nextCategories, recentTransactions] = await Promise.all([
        previewCSVImport(accessToken, {
          mimeType: file.mimeType,
          name: file.name,
          uri: file.uri,
        }),
        getCategories(accessToken),
        getTransactionHistory(accessToken, 'limit=100&offset=0'),
      ]);

      setPreview(nextPreview);
      setEditableRows(nextPreview.rows);
      setIgnoredRows([]);
      setCategories(nextCategories);
      setExistingTransactions(recentTransactions.items);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Could not read that statement file.');
    } finally {
      setIsPicking(false);
      setIsPreviewing(false);
    }
  }

  async function executeConfirmImport() {
    if (!editableRows.length || !preview) {
      return;
    }

    setIsConfirming(true);
    setError(null);

    try {
      const accessToken = await getValidAccessToken();
      if (!accessToken) {
        throw new Error('Your session expired. Please log in again.');
      }

      const confirmed = await confirmCSVImport(accessToken, {
        original_parsed_count: preview.parsed_count,
        rows: editableRows.map((row) => ({
          amount: row.amount,
          category_id: row.category_id,
          fingerprint: row.fingerprint,
          note: row.note,
          row_index: row.row_index,
          title: row.title,
          transaction_date: row.transaction_date,
          type: row.type,
        })),
        source_name: preview.source_name,
      });

      setResult(confirmed);
      setIsPreConfirmOpen(false);
      Alert.alert(
        'Import complete',
        `${confirmed.imported_count} transaction${confirmed.imported_count === 1 ? '' : 's'} imported.${
          confirmed.skipped_duplicate_count
            ? ` ${confirmed.skipped_duplicate_count} duplicate${confirmed.skipped_duplicate_count === 1 ? ' was' : 's were'} skipped.`
            : ''
        }`,
      );
    } catch (caughtError) {
      if (caughtError instanceof ApiError) {
        setError(caughtError.message);
      } else {
        setError(caughtError instanceof Error ? caughtError.message : 'Could not confirm CSV import.');
      }
    } finally {
      setIsConfirming(false);
    }
  }

  function handleImportAnother() {
    setSelectedFileName(null);
    setPreview(null);
    setEditableRows([]);
    setIgnoredRows([]);
    setExistingTransactions([]);
    setSelectedFingerprints([]);
    setResult(null);
    setError(null);
    setDraft(null);
    setEditingRowIndex(null);
    setIsPreConfirmOpen(false);
  }

  function openPreConfirm() {
    if (!editableRows.length) {
      setError('There are no active rows left to import.');
      return;
    }

    setError(null);
    setIsPreConfirmOpen(true);
  }

  function openEditRow(row: EditableImportRow, index: number) {
    setEditingRowIndex(index);
    setDraftError(null);
    setDraft({
      amount: row.amount,
      category_id: row.category_id,
      note: row.note ?? '',
      row_index: row.row_index,
      title: row.title,
      transaction_date: row.transaction_date,
      type: row.type,
    });
  }

  function closeEditor() {
    setEditingRowIndex(null);
    setDraft(null);
    setDraftError(null);
  }

  function saveDraft() {
    if (editingRowIndex === null || !draft) {
      return;
    }

    const normalizedTitle = draft.title.trim();
    const normalizedDate = draft.transaction_date.trim();
    const amountValue = Number(draft.amount);

    if (!normalizedTitle) {
      setDraftError('Title is required.');
      return;
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(normalizedDate)) {
      setDraftError('Date must be in YYYY-MM-DD format.');
      return;
    }

    if (!Number.isFinite(amountValue) || amountValue <= 0) {
      setDraftError('Amount must be greater than zero.');
      return;
    }

    const nextCategory = categories.find((category) => category.id === draft.category_id) ?? null;

    setEditableRows((current) =>
      current.map((row, index) =>
        index === editingRowIndex
          ? {
              ...row,
              amount: amountValue.toFixed(2),
              category_id: draft.category_id,
              category_name: nextCategory?.effective_name ?? null,
              note: draft.note.trim() ? draft.note.trim() : null,
              title: normalizedTitle,
              transaction_date: normalizedDate,
              type: draft.type,
            }
          : row,
      ),
    );

    closeEditor();
  }

  function toggleRowSelection(fingerprint: string) {
    setSelectedFingerprints((current) =>
      current.includes(fingerprint) ? current.filter((item) => item !== fingerprint) : [...current, fingerprint],
    );
  }

  function selectAllRows() {
    setSelectedFingerprints(editableRows.map((row) => row.fingerprint));
  }

  function clearSelection() {
    setSelectedFingerprints([]);
  }

  function applyBulkCategory(categoryId: string | null) {
    const nextCategory = categories.find((category) => category.id === categoryId) ?? null;
    setEditableRows((current) =>
      current.map((row) =>
        selectedFingerprints.includes(row.fingerprint)
          ? {
              ...row,
              category_id: categoryId,
              category_name: nextCategory?.effective_name ?? null,
            }
          : row,
      ),
    );
    setIsBulkCategoryModalOpen(false);
    clearSelection();
  }

  function applyBulkType(type: 'expense' | 'income') {
    setEditableRows((current) =>
      current.map((row) => {
        if (!selectedFingerprints.includes(row.fingerprint)) {
          return row;
        }

        const currentCategory =
          row.category_id !== null ? categories.find((category) => category.id === row.category_id) ?? null : null;
        const categoryStillValid =
          currentCategory !== null && (currentCategory.type === 'both' || currentCategory.type === type);

        return {
          ...row,
          category_id: categoryStillValid ? row.category_id : null,
          category_name: categoryStillValid ? row.category_name : null,
          type,
        };
      }),
    );
    clearSelection();
  }

  function ignoreSelectedRows() {
    if (!selectedFingerprints.length) {
      return;
    }

    setIgnoredRows((current) => [
      ...current,
      ...editableRows.filter((row) => selectedFingerprints.includes(row.fingerprint)),
    ]);
    setEditableRows((current) => current.filter((row) => !selectedFingerprints.includes(row.fingerprint)));
    clearSelection();
  }

  function restoreIgnoredRow(fingerprint: string) {
    const restored = ignoredRows.find((row) => row.fingerprint === fingerprint);
    if (!restored) {
      return;
    }

    setEditableRows((current) =>
      [...current, restored].sort((left, right) => left.row_index - right.row_index),
    );
    setIgnoredRows((current) => current.filter((row) => row.fingerprint !== fingerprint));
  }

  function restoreAllIgnoredRows() {
    if (!ignoredRows.length) {
      return;
    }

    setEditableRows((current) =>
      [...current, ...ignoredRows].sort((left, right) => left.row_index - right.row_index),
    );
    setIgnoredRows([]);
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.closeButton}>
            <FontAwesome color="#888888" name="close" size={16} />
          </Pressable>
          <Text style={styles.headerTitle}>Import statement CSV</Text>
          <Text style={styles.headerCopy}>
            Upload a bank or wallet CSV/XLSX, review what FinPilot found, edit any row that looks off, then confirm.
          </Text>
        </View>

        <View style={styles.body}>
          <View style={styles.heroCard}>
            <View style={styles.heroIcon}>
              <FontAwesome color={COLORS.violet} name="upload" size={20} />
            </View>
            <Text style={styles.heroTitle}>Bring your transactions in faster</Text>
            <Text style={styles.heroCopy}>
              FinPilot previews parsed rows, suggests likely categories, and lets you fix individual rows before
              import.
            </Text>
            <Pressable
              disabled={isPicking || isPreviewing || isConfirming}
              onPress={() => void handlePickCSV()}
              style={[styles.pickButton, isPicking || isPreviewing ? styles.pickButtonBusy : null]}
            >
              {isPicking || isPreviewing ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <FontAwesome color="#FFFFFF" name="file-text-o" size={14} />
              )}
              <Text style={styles.pickButtonText}>{preview ? 'Choose another file' : 'Choose CSV or XLSX'}</Text>
            </Pressable>
            {selectedFileName ? <Text style={styles.fileName}>Selected: {selectedFileName}</Text> : null}
          </View>

          {error ? (
            <View style={styles.errorCard}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          {preview ? (
            <>
              <View style={styles.summaryGrid}>
                <MetricCard label="Parsed rows" tone="violet" value={String(editableRows.length)} />
                <MetricCard label="Skipped rows" tone="amber" value={String(preview.skipped_count)} />
                <MetricCard
                  label="Ignored rows"
                  tone="green"
                  value={String(ignoredRows.length)}
                />
              </View>

              <View style={styles.sourceCard}>
                <Text style={styles.sourceLabel}>Source file</Text>
                <Text style={styles.sourceValue}>{preview.source_name ? trimMiddle(preview.source_name, 42) : 'CSV import'}</Text>
              </View>

              {duplicateRows.length ? (
                <View style={styles.duplicateSummaryCard}>
                  <View style={styles.duplicateSummaryHead}>
                    <FontAwesome color={COLORS.amber} name="clone" size={14} />
                    <Text style={styles.duplicateSummaryTitle}>Likely duplicates found</Text>
                  </View>
                  <Text style={styles.duplicateSummaryCopy}>
                    {duplicateRows.length} row{duplicateRows.length === 1 ? ' looks' : 's look'} similar to another CSV row
                    or an existing transaction. Review them or bulk-ignore before import.
                  </Text>
                  {allActiveRowsLookDuplicate ? (
                    <Text style={styles.duplicateSummaryEmphasis}>
                      All active rows look like duplicates. This usually means this statement was already imported into
                      this account.
                    </Text>
                  ) : null}
                </View>
              ) : null}

              <View style={styles.sectionCard}>
                <Text style={styles.sectionTitle}>Detected columns</Text>
                <View style={styles.chipRow}>
                  {preview.detected_columns.map((column) => (
                    <View key={column} style={styles.columnChip}>
                      <Text style={styles.columnChipText}>{column}</Text>
                    </View>
                  ))}
                </View>
              </View>

              <View style={styles.sectionCard}>
                <View style={styles.sectionHead}>
                  <Text style={styles.sectionTitle}>Review rows</Text>
                  <Text style={styles.sectionMeta}>Select rows for bulk actions or edit individually</Text>
                </View>
                <View style={styles.bulkToolbar}>
                  <Text style={styles.bulkToolbarCopy}>
                    {selectedFingerprints.length ? `${selectedFingerprints.length} selected` : 'No rows selected'}
                  </Text>
                  <View style={styles.bulkToolbarActions}>
                    <Pressable onPress={selectAllRows} style={styles.bulkMiniButton}>
                      <Text style={styles.bulkMiniButtonText}>Select all</Text>
                    </Pressable>
                    <Pressable onPress={clearSelection} style={styles.bulkMiniButton}>
                      <Text style={styles.bulkMiniButtonText}>Clear</Text>
                    </Pressable>
                  </View>
                </View>
                {selectedFingerprints.length ? (
                  <View style={styles.bulkActionRow}>
                    <Pressable onPress={() => applyBulkType('expense')} style={styles.bulkTypeExpenseButton}>
                      <FontAwesome color={COLORS.danger} name="arrow-up" size={12} />
                      <Text style={styles.bulkTypeExpenseText}>Mark expense</Text>
                    </Pressable>
                    <Pressable onPress={() => applyBulkType('income')} style={styles.bulkTypeIncomeButton}>
                      <FontAwesome color={COLORS.green} name="arrow-down" size={12} />
                      <Text style={styles.bulkTypeIncomeText}>Mark income</Text>
                    </Pressable>
                  </View>
                ) : null}
                {selectedFingerprints.length ? (
                  <View style={styles.bulkActionRow}>
                    <Pressable onPress={() => setIsBulkCategoryModalOpen(true)} style={styles.bulkActionButton}>
                      <FontAwesome color={COLORS.violet} name="tag" size={12} />
                      <Text style={styles.bulkActionButtonText}>Apply category</Text>
                    </Pressable>
                    <Pressable onPress={ignoreSelectedRows} style={styles.bulkActionDangerButton}>
                      <FontAwesome color={COLORS.danger} name="eye-slash" size={12} />
                      <Text style={styles.bulkActionDangerText}>Ignore selected</Text>
                    </Pressable>
                  </View>
                ) : null}
                {editableRows.map((row, index) => (
                  <PreviewRowCard
                    currencyCode={currencyCode}
                    duplicateKind={duplicateInfo.get(row.fingerprint) ?? null}
                    isSelected={selectedFingerprints.includes(row.fingerprint)}
                    key={row.fingerprint}
                    onEdit={() => openEditRow(row, index)}
                    onToggleSelect={() => toggleRowSelection(row.fingerprint)}
                    row={row}
                  />
                ))}
              </View>

              {ignoredRows.length ? (
                <View style={styles.sectionCard}>
                  <View style={styles.sectionHead}>
                    <Text style={styles.sectionTitle}>Ignored rows</Text>
                    <Pressable onPress={restoreAllIgnoredRows}>
                      <Text style={styles.sectionLink}>Restore all</Text>
                    </Pressable>
                  </View>
                  {ignoredRows.map((row) => (
                    <View key={row.fingerprint} style={styles.ignoredRowCard}>
                      <View style={styles.ignoredRowText}>
                        <Text numberOfLines={1} style={styles.ignoredRowTitle}>
                          {row.title}
                        </Text>
                        <Text style={styles.ignoredRowMeta}>
                          Row {row.row_index} · {formatShortDate(row.transaction_date)}
                        </Text>
                      </View>
                      <Pressable onPress={() => restoreIgnoredRow(row.fingerprint)} style={styles.restoreButton}>
                        <Text style={styles.restoreButtonText}>Restore</Text>
                      </Pressable>
                    </View>
                  ))}
                </View>
              ) : null}

              {preview.skipped_rows.length ? (
                <View style={styles.sectionCard}>
                  <View style={styles.sectionHead}>
                    <Text style={styles.sectionTitle}>Skipped rows</Text>
                    <Text style={styles.sectionMeta}>{preview.skipped_rows.length} issue(s)</Text>
                  </View>
                  {preview.skipped_rows.slice(0, 8).map((row) => (
                    <View key={`${row.row_index}-${row.reason}`} style={styles.skippedRow}>
                      <Text style={styles.skippedTitle}>Row {row.row_index}</Text>
                      <Text style={styles.skippedReason}>{row.reason}</Text>
                    </View>
                  ))}
                </View>
              ) : null}

              <Pressable
                disabled={isConfirming || result !== null}
                onPress={openPreConfirm}
                style={[styles.confirmButton, isConfirming || result ? styles.confirmButtonBusy : null]}
              >
                {isConfirming ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <FontAwesome color="#FFFFFF" name="check" size={14} />
                )}
                <Text style={styles.confirmButtonText}>
                  {result ? 'Import completed' : `Confirm import (${editableRows.length})`}
                </Text>
              </Pressable>
            </>
          ) : null}

          {result ? (
            <View style={styles.resultCard}>
              <Text style={styles.resultTitle}>Import complete</Text>
              <Text style={styles.resultCopy}>
                Imported {result.imported_count} transaction{result.imported_count === 1 ? '' : 's'}
                {result.skipped_duplicate_count
                  ? ` and skipped ${result.skipped_duplicate_count} duplicate${result.skipped_duplicate_count === 1 ? '' : 's'}.`
                  : '.'}
              </Text>
              <View style={styles.resultActions}>
                <Pressable onPress={handleImportAnother} style={styles.secondaryButton}>
                  <Text style={styles.secondaryButtonText}>Import another</Text>
                </Pressable>
                <Pressable onPress={() => router.replace('/(tabs)/history')} style={styles.primaryButton}>
                  <Text style={styles.primaryButtonText}>View history</Text>
                </Pressable>
              </View>
            </View>
          ) : null}
        </View>
      </ScrollView>

      <Modal animationType="slide" onRequestClose={closeEditor} transparent visible={draft !== null}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Edit imported row</Text>
              <Pressable onPress={closeEditor} style={styles.modalCloseButton}>
                <FontAwesome color="#888888" name="close" size={15} />
              </Pressable>
            </View>

            {draft ? (
              <ScrollView contentContainerStyle={styles.modalContent}>
                <FieldLabel label="Type" />
                <View style={styles.typeToggleRow}>
                  <TypeToggle
                    active={draft.type === 'expense'}
                    label="Expense"
                    onPress={() => setDraft((current) => (current ? { ...current, category_id: null, type: 'expense' } : current))}
                    tone="expense"
                  />
                  <TypeToggle
                    active={draft.type === 'income'}
                    label="Income"
                    onPress={() => setDraft((current) => (current ? { ...current, category_id: null, type: 'income' } : current))}
                    tone="income"
                  />
                </View>

                <FieldLabel label="Title" />
                <TextInput
                  onChangeText={(value) => setDraft((current) => (current ? { ...current, title: value } : current))}
                  placeholder="Transaction title"
                  placeholderTextColor="#5F6370"
                  style={styles.input}
                  value={draft.title}
                />

                <View style={styles.doubleFieldRow}>
                  <View style={styles.doubleFieldCol}>
                    <FieldLabel label="Amount" />
                    <TextInput
                      keyboardType="decimal-pad"
                      onChangeText={(value) => setDraft((current) => (current ? { ...current, amount: value } : current))}
                      placeholder="0.00"
                      placeholderTextColor="#5F6370"
                      style={styles.input}
                      value={draft.amount}
                    />
                  </View>
                  <View style={styles.doubleFieldCol}>
                    <FieldLabel label="Date" />
                    <TextInput
                      autoCapitalize="none"
                      onChangeText={(value) =>
                        setDraft((current) => (current ? { ...current, transaction_date: value } : current))
                      }
                      placeholder="YYYY-MM-DD"
                      placeholderTextColor="#5F6370"
                      style={styles.input}
                      value={draft.transaction_date}
                    />
                  </View>
                </View>

                <FieldLabel label="Category" />
                <View style={styles.categoryGrid}>
                  <CategoryPill
                    active={draft.category_id === null}
                    label="Uncategorized"
                    onPress={() => setDraft((current) => (current ? { ...current, category_id: null } : current))}
                  />
                  {draftCategories.map((category) => (
                    <CategoryPill
                      active={draft.category_id === category.id}
                      key={category.id}
                      label={category.effective_name}
                      onPress={() =>
                        setDraft((current) => (current ? { ...current, category_id: category.id } : current))
                      }
                    />
                  ))}
                </View>

                <FieldLabel label="Note" />
                <TextInput
                  multiline
                  onChangeText={(value) => setDraft((current) => (current ? { ...current, note: value } : current))}
                  placeholder="Optional note"
                  placeholderTextColor="#5F6370"
                  style={[styles.input, styles.noteInput]}
                  textAlignVertical="top"
                  value={draft.note}
                />

                {draftError ? (
                  <View style={styles.draftErrorCard}>
                    <Text style={styles.draftErrorText}>{draftError}</Text>
                  </View>
                ) : null}

                <View style={styles.modalActionRow}>
                  <Pressable onPress={closeEditor} style={styles.modalSecondaryButton}>
                    <Text style={styles.modalSecondaryButtonText}>Cancel</Text>
                  </Pressable>
                  <Pressable onPress={saveDraft} style={styles.modalPrimaryButton}>
                    <Text style={styles.modalPrimaryButtonText}>Save row</Text>
                  </Pressable>
                </View>
              </ScrollView>
            ) : null}
          </View>
        </View>
      </Modal>

      <Modal
        animationType="slide"
        onRequestClose={() => setIsPreConfirmOpen(false)}
        transparent
        visible={isPreConfirmOpen}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.summarySheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Final import review</Text>
              <Pressable onPress={() => setIsPreConfirmOpen(false)} style={styles.modalCloseButton}>
                <FontAwesome color="#888888" name="close" size={15} />
              </Pressable>
            </View>

            <ScrollView contentContainerStyle={styles.summarySheetContent}>
              <View style={styles.preConfirmHero}>
                <Text style={styles.preConfirmHeroTitle}>Check the import before it lands in FinPilot</Text>
                <Text style={styles.preConfirmHeroCopy}>
                  You can still go back to edit rows, ignore duplicates, or restore ignored items.
                </Text>
              </View>

              <View style={styles.summaryGrid}>
                <MetricCard label="Will import" tone="violet" value={String(editableRows.length)} />
                <MetricCard label="Ignored" tone="green" value={String(ignoredRows.length)} />
                <MetricCard label="Duplicates left" tone="amber" value={String(duplicateRows.length)} />
              </View>

              <View style={styles.summarySection}>
                <Text style={styles.summarySectionTitle}>Import summary</Text>
                <SummaryLine label="Source file" value={preview?.source_name ? trimMiddle(preview.source_name, 30) : 'CSV import'} />
                <SummaryLine label="Active rows" value={String(editableRows.length)} />
                <SummaryLine label="Ignored rows" value={String(ignoredRows.length)} />
                <SummaryLine label="Parsing skipped rows" value={String(preview?.skipped_rows.length ?? 0)} />
                <SummaryLine label="Likely duplicates" value={String(duplicateRows.length)} />
              </View>

              <View style={styles.summarySection}>
                <Text style={styles.summarySectionTitle}>Likely duplicates still active</Text>
                {duplicateRows.length ? (
                  duplicateRows.slice(0, 6).map((row) => (
                    <View key={`duplicate-${row.fingerprint}`} style={styles.summaryListCard}>
                      <Text numberOfLines={1} style={styles.summaryListTitle}>
                        {row.title}
                      </Text>
                      <Text style={styles.summaryListMeta}>
                        {formatShortDate(row.transaction_date)} · {formatMoney(row.amount, currencyCode)} ·{' '}
                        {getDuplicateLabel(duplicateInfo.get(row.fingerprint) ?? 'file')}
                      </Text>
                    </View>
                  ))
                ) : (
                  <Text style={styles.summaryEmptyCopy}>No likely duplicates remain in the active import list.</Text>
                )}
              </View>

              <View style={styles.summarySection}>
                <Text style={styles.summarySectionTitle}>Rows skipped during parsing</Text>
                {preview?.skipped_rows.length ? (
                  preview.skipped_rows.slice(0, 5).map((row) => (
                    <View key={`skipped-preview-${row.row_index}-${row.reason}`} style={styles.summaryListCard}>
                      <Text style={styles.summaryListTitle}>Row {row.row_index}</Text>
                      <Text style={styles.summaryListMeta}>{row.reason}</Text>
                    </View>
                  ))
                ) : (
                  <Text style={styles.summaryEmptyCopy}>No rows were skipped during CSV parsing.</Text>
                )}
              </View>

              <View style={styles.summaryActionRow}>
                <Pressable onPress={() => setIsPreConfirmOpen(false)} style={styles.modalSecondaryButton}>
                  <Text style={styles.modalSecondaryButtonText}>Back to review</Text>
                </Pressable>
                <Pressable
                  disabled={isConfirming}
                  onPress={() => void executeConfirmImport()}
                  style={[styles.modalPrimaryButton, isConfirming ? styles.confirmButtonBusy : null]}
                >
                  {isConfirming ? (
                    <ActivityIndicator color="#FFFFFF" size="small" />
                  ) : (
                    <Text style={styles.modalPrimaryButtonText}>Import now</Text>
                  )}
                </Pressable>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal
        animationType="fade"
        onRequestClose={() => setIsBulkCategoryModalOpen(false)}
        transparent
        visible={isBulkCategoryModalOpen}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.bulkCategorySheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Apply category to selected rows</Text>
              <Pressable onPress={() => setIsBulkCategoryModalOpen(false)} style={styles.modalCloseButton}>
                <FontAwesome color="#888888" name="close" size={15} />
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={styles.bulkCategoryContent}>
              <CategoryPill active={false} label="Uncategorized" onPress={() => applyBulkCategory(null)} />
              {bulkCategoryOptions.map((category) => (
                <CategoryPill
                  active={false}
                  key={category.id}
                  label={category.effective_name}
                  onPress={() => applyBulkCategory(category.id)}
                />
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function MetricCard({
  label,
  tone,
  value,
}: {
  label: string;
  tone: 'amber' | 'green' | 'violet';
  value: string;
}) {
  return (
    <View
      style={[
        styles.metricCard,
        tone === 'violet' ? styles.metricCardViolet : null,
        tone === 'amber' ? styles.metricCardAmber : null,
        tone === 'green' ? styles.metricCardGreen : null,
      ]}
    >
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
    </View>
  );
}

function PreviewRowCard({
  currencyCode,
  duplicateKind,
  isSelected,
  onEdit,
  onToggleSelect,
  row,
}: {
  currencyCode: string;
  duplicateKind: 'both' | 'existing' | 'file' | null;
  isSelected: boolean;
  onEdit: () => void;
  onToggleSelect: () => void;
  row: CSVImportPreviewRow;
}) {
  return (
    <View
      style={[
        styles.rowCard,
        isSelected ? styles.rowCardSelected : null,
        duplicateKind ? styles.rowCardDuplicate : null,
      ]}
    >
      <View style={styles.rowTop}>
        <Pressable onPress={onToggleSelect} style={[styles.selectBubble, isSelected ? styles.selectBubbleActive : null]}>
          {isSelected ? <FontAwesome color="#FFFFFF" name="check" size={11} /> : null}
        </Pressable>
        <View style={styles.rowTitleWrap}>
          <Text numberOfLines={1} style={styles.rowTitle}>
            {row.title}
          </Text>
          <Text style={styles.rowMeta}>
            {formatShortDate(row.transaction_date)}
            {row.category_name ? ` · ${row.category_name}` : ''}
          </Text>
        </View>
        <Text style={[styles.rowAmount, row.type === 'income' ? styles.rowAmountIncome : styles.rowAmountExpense]}>
          {row.type === 'income' ? '+' : '-'}
          {formatMoney(row.amount, currencyCode)}
        </Text>
      </View>
      {row.note ? <Text style={styles.rowNote}>{row.note}</Text> : null}
      {duplicateKind ? (
        <View style={styles.duplicatePill}>
          <FontAwesome color={COLORS.amber} name="clone" size={10} />
          <Text style={styles.duplicatePillText}>{getDuplicateLabel(duplicateKind)}</Text>
        </View>
      ) : null}
      <View style={styles.rowActions}>
        <TypeBadge type={row.type} />
        <View style={styles.rowActionRight}>
          <Pressable onPress={onEdit} style={styles.editRowButton}>
            <FontAwesome color={COLORS.violet} name="pencil" size={11} />
            <Text style={styles.editRowButtonText}>Edit</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function TypeBadge({ type }: { type: 'expense' | 'income' }) {
  return (
    <View style={[styles.typeBadge, type === 'income' ? styles.typeBadgeIncome : styles.typeBadgeExpense]}>
      <Text style={[styles.typeBadgeText, type === 'income' ? styles.typeBadgeIncomeText : styles.typeBadgeExpenseText]}>
        {type === 'income' ? 'Income' : 'Expense'}
      </Text>
    </View>
  );
}

function TypeToggle({
  active,
  label,
  onPress,
  tone,
}: {
  active: boolean;
  label: string;
  onPress: () => void;
  tone: 'expense' | 'income';
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.typeToggle,
        active ? (tone === 'income' ? styles.typeToggleIncomeActive : styles.typeToggleExpenseActive) : null,
      ]}
    >
      <Text
        style={[
          styles.typeToggleText,
          active ? (tone === 'income' ? styles.typeToggleIncomeText : styles.typeToggleExpenseText) : null,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function CategoryPill({
  active,
  label,
  onPress,
}: {
  active: boolean;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={[styles.categoryPill, active ? styles.categoryPillActive : null]}>
      <Text style={[styles.categoryPillText, active ? styles.categoryPillTextActive : null]}>{label}</Text>
    </Pressable>
  );
}

function FieldLabel({ label }: { label: string }) {
  return <Text style={styles.fieldLabel}>{label}</Text>;
}

function SummaryLine({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.summaryLine}>
      <Text style={styles.summaryLineLabel}>{label}</Text>
      <Text numberOfLines={1} style={styles.summaryLineValue}>
        {value}
      </Text>
    </View>
  );
}

function trimMiddle(value: string, maxLength: number) {
  if (value.length <= maxLength) {
    return value;
  }

  const start = value.slice(0, Math.max(5, Math.floor((maxLength - 3) / 2)));
  const end = value.slice(-Math.max(4, Math.ceil((maxLength - 3) / 2)));
  return `${start}...${end}`;
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

function formatMoney(value: string | number, currencyCode: string) {
  const numeric = typeof value === 'number' ? value : Number(value);
  const symbol = getCurrencySymbol(currencyCode);

  if (!Number.isFinite(numeric)) {
    return currencyCode === 'USD' ? `${symbol}0` : `${symbol} 0`;
  }

  const amount = Math.round(numeric).toLocaleString('en-US');
  return currencyCode === 'USD' ? `${symbol}${amount}` : `${symbol} ${amount}`;
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

function buildLikelyDuplicateKey(transaction: Pick<Transaction, 'amount' | 'title' | 'transaction_date' | 'type'>) {
  return [
    transaction.type,
    normalizeMoney(transaction.amount),
    normalizeText(transaction.title),
    transaction.transaction_date,
  ].join('|');
}

function normalizeMoney(value: string | number) {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) {
    return '0.00';
  }

  return numeric.toFixed(2);
}

function normalizeText(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function getDuplicateLabel(kind: 'both' | 'existing' | 'file') {
  switch (kind) {
    case 'both':
      return 'Matches current history and another CSV row';
    case 'existing':
      return 'Matches a recent transaction in your history';
    case 'file':
      return 'Repeated inside this CSV file';
    default:
      return 'Likely duplicate';
  }
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  content: {
    paddingBottom: 28,
  },
  header: {
    paddingHorizontal: 18,
    paddingTop: 28,
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
  heroCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    borderWidth: 0.5,
    borderColor: COLORS.border,
    paddingHorizontal: 16,
    paddingVertical: 16,
    alignItems: 'flex-start',
  },
  heroIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: '#1A1525',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  heroTitle: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 6,
  },
  heroCopy: {
    color: COLORS.textMuted,
    ...typography.caption,
    marginBottom: 14,
  },
  pickButton: {
    minHeight: 46,
    borderRadius: 14,
    backgroundColor: COLORS.violet,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    alignSelf: 'stretch',
  },
  pickButtonBusy: {
    opacity: 0.8,
  },
  pickButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
  fileName: {
    color: COLORS.textSoft,
    fontSize: 11,
    marginTop: 10,
  },
  errorCard: {
    backgroundColor: 'rgba(240,106,99,0.12)',
    borderRadius: 12,
    borderWidth: 0.5,
    borderColor: 'rgba(240,106,99,0.28)',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  errorText: {
    color: COLORS.danger,
    ...typography.caption,
  },
  summaryGrid: {
    flexDirection: 'row',
    gap: 8,
  },
  metricCard: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 0.5,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  metricCardViolet: {
    backgroundColor: '#1A1525',
    borderColor: '#3D2F6A',
  },
  metricCardAmber: {
    backgroundColor: '#1F1A0E',
    borderColor: '#5A4517',
  },
  metricCardGreen: {
    backgroundColor: '#0D1A12',
    borderColor: '#1B4B2B',
  },
  metricLabel: {
    color: COLORS.textSoft,
    fontSize: 10,
    marginBottom: 5,
  },
  metricValue: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: '600',
  },
  sourceCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    borderWidth: 0.5,
    borderColor: COLORS.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  sourceLabel: {
    color: COLORS.textSoft,
    fontSize: 10,
    marginBottom: 4,
  },
  sourceValue: {
    color: COLORS.text,
    fontSize: 12,
    fontWeight: '500',
  },
  duplicateSummaryCard: {
    backgroundColor: '#1F1A0E',
    borderRadius: 14,
    borderWidth: 0.5,
    borderColor: '#5A4517',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  duplicateSummaryHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  duplicateSummaryTitle: {
    color: '#F6D084',
    fontSize: 12,
    fontWeight: '600',
  },
  duplicateSummaryCopy: {
    color: '#D6C08F',
    fontSize: 10,
    lineHeight: 15,
  },
  duplicateSummaryEmphasis: {
    color: '#F6D084',
    fontSize: 10,
    lineHeight: 15,
    fontWeight: '700',
    marginTop: 8,
  },
  sectionCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    borderWidth: 0.5,
    borderColor: COLORS.border,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  sectionHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  sectionTitle: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: '600',
  },
  sectionMeta: {
    color: COLORS.textSoft,
    fontSize: 10,
  },
  sectionLink: {
    color: COLORS.violet,
    fontSize: 10,
    fontWeight: '600',
  },
  bulkToolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
    gap: 10,
  },
  bulkToolbarCopy: {
    flex: 1,
    color: COLORS.textSoft,
    fontSize: 10,
  },
  bulkToolbarActions: {
    flexDirection: 'row',
    gap: 6,
  },
  bulkMiniButton: {
    minHeight: 28,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: '#191922',
    borderWidth: 0.5,
    borderColor: '#2C2C33',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bulkMiniButtonText: {
    color: '#9A9EAA',
    fontSize: 10,
    fontWeight: '600',
  },
  bulkActionRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  bulkActionButton: {
    flex: 1,
    minHeight: 34,
    borderRadius: 12,
    backgroundColor: '#1A1525',
    borderWidth: 0.5,
    borderColor: '#3D2F6A',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  bulkActionButtonText: {
    color: '#9B72F5',
    fontSize: 11,
    fontWeight: '600',
  },
  bulkActionDangerButton: {
    flex: 1,
    minHeight: 34,
    borderRadius: 12,
    backgroundColor: '#1A100E',
    borderWidth: 0.5,
    borderColor: 'rgba(240,106,99,0.28)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  bulkActionDangerText: {
    color: COLORS.danger,
    fontSize: 11,
    fontWeight: '600',
  },
  bulkTypeExpenseButton: {
    flex: 1,
    minHeight: 34,
    borderRadius: 12,
    backgroundColor: '#1A100E',
    borderWidth: 0.5,
    borderColor: 'rgba(240,106,99,0.28)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  bulkTypeExpenseText: {
    color: COLORS.danger,
    fontSize: 11,
    fontWeight: '600',
  },
  bulkTypeIncomeButton: {
    flex: 1,
    minHeight: 34,
    borderRadius: 12,
    backgroundColor: '#0D1A12',
    borderWidth: 0.5,
    borderColor: '#1B4B2B',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  bulkTypeIncomeText: {
    color: COLORS.green,
    fontSize: 11,
    fontWeight: '600',
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
  },
  columnChip: {
    borderRadius: 999,
    backgroundColor: COLORS.surfaceRaised,
    borderWidth: 0.5,
    borderColor: COLORS.border,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  columnChipText: {
    color: COLORS.textMuted,
    fontSize: 10,
  },
  rowCard: {
    backgroundColor: '#111116',
    borderRadius: 12,
    borderWidth: 0.5,
    borderColor: '#23232B',
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 8,
  },
  rowCardSelected: {
    borderColor: '#5C46A5',
    backgroundColor: '#14141B',
  },
  rowCardDuplicate: {
    borderColor: '#6D5320',
  },
  rowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  selectBubble: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 0.5,
    borderColor: '#3A3D48',
    backgroundColor: '#191922',
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectBubbleActive: {
    backgroundColor: COLORS.violet,
    borderColor: COLORS.violet,
  },
  rowTitleWrap: {
    flex: 1,
  },
  rowTitle: {
    color: COLORS.text,
    fontSize: 12,
    fontWeight: '500',
    marginBottom: 2,
  },
  rowMeta: {
    color: COLORS.textSoft,
    fontSize: 10,
  },
  rowAmount: {
    fontSize: 12,
    fontWeight: '600',
  },
  rowAmountIncome: {
    color: COLORS.green,
  },
  rowAmountExpense: {
    color: COLORS.danger,
  },
  rowNote: {
    color: COLORS.textMuted,
    fontSize: 10,
    marginTop: 7,
  },
  duplicatePill: {
    marginTop: 9,
    alignSelf: 'flex-start',
    borderRadius: 999,
    backgroundColor: '#1F1A0E',
    borderWidth: 0.5,
    borderColor: '#5A4517',
    paddingHorizontal: 10,
    paddingVertical: 5,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  duplicatePillText: {
    color: '#F6D084',
    fontSize: 9,
    fontWeight: '600',
  },
  rowActions: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rowActionRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  typeBadge: {
    borderRadius: 999,
    borderWidth: 0.5,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  typeBadgeExpense: {
    backgroundColor: '#1A100E',
    borderColor: 'rgba(240,106,99,0.28)',
  },
  typeBadgeIncome: {
    backgroundColor: '#0D1A12',
    borderColor: '#1B4B2B',
  },
  typeBadgeText: {
    fontSize: 10,
    fontWeight: '600',
  },
  typeBadgeExpenseText: {
    color: COLORS.danger,
  },
  typeBadgeIncomeText: {
    color: COLORS.green,
  },
  editRowButton: {
    minHeight: 30,
    paddingHorizontal: 11,
    borderRadius: 999,
    backgroundColor: '#1A1525',
    borderWidth: 0.5,
    borderColor: '#3D2F6A',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  editRowButtonText: {
    color: '#9B72F5',
    fontSize: 10,
    fontWeight: '600',
  },
  ignoredRowCard: {
    backgroundColor: '#16161A',
    borderRadius: 12,
    borderWidth: 0.5,
    borderColor: '#2C2C33',
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  ignoredRowText: {
    flex: 1,
  },
  ignoredRowTitle: {
    color: COLORS.text,
    fontSize: 11,
    fontWeight: '500',
    marginBottom: 2,
  },
  ignoredRowMeta: {
    color: COLORS.textSoft,
    fontSize: 10,
  },
  restoreButton: {
    minHeight: 30,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: '#191922',
    borderWidth: 0.5,
    borderColor: '#2C2C33',
    alignItems: 'center',
    justifyContent: 'center',
  },
  restoreButtonText: {
    color: '#9A9EAA',
    fontSize: 10,
    fontWeight: '600',
  },
  skippedRow: {
    borderRadius: 10,
    backgroundColor: '#1A100E',
    borderWidth: 0.5,
    borderColor: 'rgba(240,106,99,0.22)',
    paddingHorizontal: 11,
    paddingVertical: 10,
    marginBottom: 8,
  },
  skippedTitle: {
    color: COLORS.danger,
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 3,
  },
  skippedReason: {
    color: '#D8A39F',
    fontSize: 10,
    lineHeight: 15,
  },
  confirmButton: {
    minHeight: 48,
    borderRadius: 14,
    backgroundColor: COLORS.violet,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 2,
  },
  confirmButtonBusy: {
    opacity: 0.8,
  },
  confirmButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
  resultCard: {
    backgroundColor: '#0D1A12',
    borderRadius: 16,
    borderWidth: 0.5,
    borderColor: '#1B4B2B',
    paddingHorizontal: 15,
    paddingVertical: 15,
  },
  resultTitle: {
    color: COLORS.green,
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 5,
  },
  resultCopy: {
    color: '#B8D8C1',
    ...typography.caption,
    marginBottom: 14,
  },
  resultActions: {
    flexDirection: 'row',
    gap: 8,
  },
  secondaryButton: {
    flex: 1,
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 0.5,
    borderColor: '#355241',
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: {
    color: '#B8D8C1',
    fontSize: 12,
    fontWeight: '600',
  },
  primaryButton: {
    flex: 1,
    minHeight: 44,
    borderRadius: 12,
    backgroundColor: COLORS.green,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    color: '#07110B',
    fontSize: 12,
    fontWeight: '700',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'flex-end',
  },
  summarySheet: {
    maxHeight: '84%',
    backgroundColor: '#111116',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 0.5,
    borderColor: '#23232B',
    overflow: 'hidden',
  },
  summarySheetContent: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 24,
    gap: 12,
  },
  preConfirmHero: {
    backgroundColor: '#16161A',
    borderRadius: 14,
    borderWidth: 0.5,
    borderColor: '#2C2C33',
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  preConfirmHeroTitle: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 5,
  },
  preConfirmHeroCopy: {
    color: COLORS.textMuted,
    fontSize: 10,
    lineHeight: 15,
  },
  summarySection: {
    backgroundColor: '#16161A',
    borderRadius: 14,
    borderWidth: 0.5,
    borderColor: '#2C2C33',
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  summarySectionTitle: {
    color: COLORS.text,
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 10,
  },
  summaryLine: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 8,
  },
  summaryLineLabel: {
    color: COLORS.textSoft,
    fontSize: 10,
  },
  summaryLineValue: {
    flex: 1,
    textAlign: 'right',
    color: COLORS.text,
    fontSize: 10,
    fontWeight: '500',
  },
  summaryListCard: {
    backgroundColor: '#111116',
    borderRadius: 12,
    borderWidth: 0.5,
    borderColor: '#23232B',
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 8,
  },
  summaryListTitle: {
    color: COLORS.text,
    fontSize: 11,
    fontWeight: '500',
    marginBottom: 3,
  },
  summaryListMeta: {
    color: COLORS.textMuted,
    fontSize: 10,
    lineHeight: 15,
  },
  summaryEmptyCopy: {
    color: COLORS.textSoft,
    fontSize: 10,
    lineHeight: 15,
  },
  summaryActionRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  modalSheet: {
    maxHeight: '88%',
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
    color: COLORS.text,
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
  typeToggleRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 6,
  },
  typeToggle: {
    flex: 1,
    minHeight: 42,
    borderRadius: 12,
    borderWidth: 0.5,
    borderColor: '#2C2C33',
    backgroundColor: '#16161A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  typeToggleExpenseActive: {
    backgroundColor: '#1A100E',
    borderColor: 'rgba(240,106,99,0.35)',
  },
  typeToggleIncomeActive: {
    backgroundColor: '#0D1A12',
    borderColor: '#1B4B2B',
  },
  typeToggleText: {
    color: '#8C909B',
    fontSize: 12,
    fontWeight: '600',
  },
  typeToggleExpenseText: {
    color: COLORS.danger,
  },
  typeToggleIncomeText: {
    color: COLORS.green,
  },
  input: {
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 0.5,
    borderColor: '#2C2C33',
    backgroundColor: '#16161A',
    color: COLORS.text,
    paddingHorizontal: 13,
    fontSize: 13,
    marginBottom: 10,
  },
  noteInput: {
    minHeight: 84,
    paddingTop: 12,
  },
  doubleFieldRow: {
    flexDirection: 'row',
    gap: 10,
  },
  doubleFieldCol: {
    flex: 1,
  },
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 10,
  },
  categoryPill: {
    borderRadius: 999,
    borderWidth: 0.5,
    borderColor: '#2C2C33',
    backgroundColor: '#16161A',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  categoryPillActive: {
    backgroundColor: '#1A1525',
    borderColor: '#3D2F6A',
  },
  categoryPillText: {
    color: '#8C909B',
    fontSize: 11,
    fontWeight: '500',
  },
  categoryPillTextActive: {
    color: '#9B72F5',
  },
  draftErrorCard: {
    backgroundColor: 'rgba(240,106,99,0.12)',
    borderRadius: 12,
    borderWidth: 0.5,
    borderColor: 'rgba(240,106,99,0.28)',
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 6,
  },
  draftErrorText: {
    color: COLORS.danger,
    ...typography.caption,
  },
  modalActionRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
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
  bulkCategorySheet: {
    marginHorizontal: 16,
    marginBottom: 24,
    backgroundColor: '#111116',
    borderRadius: 20,
    borderWidth: 0.5,
    borderColor: '#23232B',
    overflow: 'hidden',
  },
  bulkCategoryContent: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 18,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
});

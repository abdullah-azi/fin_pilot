import FontAwesome from '@expo/vector-icons/FontAwesome';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { Screen } from '@/components/ui/Screen';
import { SectionCard } from '@/components/ui/SectionCard';
import { getCategories, type Category } from '@/lib/api/categories';
import { ApiError } from '@/lib/api/client';
import {
  createTransaction,
  type CreateTransactionPayload,
  type TransactionType,
} from '@/lib/api/transactions';
import { useAuth } from '@/providers/AuthProvider';
import { palette, radius, spacing, typography } from '@/constants/theme';

type FormState = {
  amount: string;
  categoryId: string | null;
  note: string;
  title: string;
  transactionDate: string;
  type: TransactionType;
};

const TODAY = new Date().toISOString().slice(0, 10);

export default function AddTransactionScreen() {
  const { getValidAccessToken } = useAuth();
  const [categories, setCategories] = useState<Category[]>([]);
  const [form, setForm] = useState<FormState>({
    amount: '',
    categoryId: null,
    note: '',
    title: '',
    transactionDate: TODAY,
    type: 'expense',
  });
  const [isCategoryPickerOpen, setIsCategoryPickerOpen] = useState(false);
  const [isLoadingCategories, setIsLoadingCategories] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const filteredCategories = useMemo(
    () =>
      categories.filter((category) => {
        if (category.type === 'both') {
          return true;
        }

        return category.type === form.type;
      }),
    [categories, form.type],
  );

  const selectedCategory =
    filteredCategories.find((category) => category.id === form.categoryId) ??
    categories.find((category) => category.id === form.categoryId) ??
    null;

  useEffect(() => {
    void loadCategories();
  }, []);

  useEffect(() => {
    if (selectedCategory && (selectedCategory.type === form.type || selectedCategory.type === 'both')) {
      return;
    }

    const firstMatch = filteredCategories[0] ?? null;
    setForm((current) => ({
      ...current,
      categoryId: firstMatch?.id ?? null,
    }));
  }, [filteredCategories, form.type, selectedCategory]);

  async function loadCategories() {
    setIsLoadingCategories(true);
    setError(null);

    try {
      const accessToken = await getValidAccessToken();
      if (!accessToken) {
        throw new Error('Your session expired. Please log in again.');
      }

      const result = await getCategories(accessToken);
      setCategories(result);
      setForm((current) => ({
        ...current,
        categoryId: current.categoryId ?? result[0]?.id ?? null,
      }));
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Could not load categories.');
    } finally {
      setIsLoadingCategories(false);
    }
  }

  function updateForm<K extends keyof FormState>(field: K, value: FormState[K]) {
    setError(null);
    setSuccessMessage(null);
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  async function handleSubmit() {
    const validationError = validateForm(form);
    if (validationError) {
      setError(validationError);
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const accessToken = await getValidAccessToken();
      if (!accessToken) {
        throw new Error('Your session expired. Please log in again.');
      }

      const payload: CreateTransactionPayload = {
        amount: Number(form.amount),
        category_id: form.categoryId,
        note: form.note.trim() || null,
        title: form.title.trim(),
        transaction_date: form.transactionDate,
        type: form.type,
      };

      await createTransaction(accessToken, payload);

      setSuccessMessage(`${form.type === 'income' ? 'Income' : 'Expense'} saved.`);
      setForm({
        amount: '',
        categoryId: filteredCategories[0]?.id ?? categories[0]?.id ?? null,
        note: '',
        title: '',
        transactionDate: TODAY,
        type: form.type,
      });
    } catch (caughtError) {
      if (caughtError instanceof ApiError) {
        setError(caughtError.message);
      } else {
        setError(caughtError instanceof Error ? caughtError.message : 'Could not save transaction.');
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Screen
      title="Add Transaction"
      subtitle="Log income and spending with real categories from your account."
    >
      <SectionCard title="Entry Type">
        <View style={styles.typeRow}>
          <TypeChip
            active={form.type === 'expense'}
            icon="arrow-circle-up"
            label="Expense"
            tone="expense"
            onPress={() => updateForm('type', 'expense')}
          />
          <TypeChip
            active={form.type === 'income'}
            icon="arrow-circle-down"
            label="Income"
            tone="income"
            onPress={() => updateForm('type', 'income')}
          />
        </View>
      </SectionCard>

      <SectionCard title="Transaction Details">
        <FormField
          keyboardType="decimal-pad"
          label="Amount"
          placeholder="0.00"
          value={form.amount}
          onChangeText={(value) => updateForm('amount', value.replace(/[^0-9.]/g, ''))}
        />
        <FormField
          label="Title"
          placeholder={form.type === 'expense' ? 'Groceries' : 'Salary'}
          value={form.title}
          onChangeText={(value) => updateForm('title', value)}
        />
        <FormField
          autoCapitalize="none"
          label="Date"
          placeholder="YYYY-MM-DD"
          value={form.transactionDate}
          onChangeText={(value) => updateForm('transactionDate', value)}
        />

        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Category</Text>
          <Pressable
            disabled={isLoadingCategories}
            onPress={() => setIsCategoryPickerOpen(true)}
            style={styles.selector}
          >
            <View style={styles.selectorContent}>
              {selectedCategory?.color ? (
                <View style={[styles.categoryDot, { backgroundColor: selectedCategory.color }]} />
              ) : null}
              <Text style={selectedCategory ? styles.selectorValue : styles.selectorPlaceholder}>
                {isLoadingCategories
                  ? 'Loading categories...'
                  : selectedCategory?.name ?? 'Choose a category'}
              </Text>
            </View>
            <FontAwesome color={palette.gray500} name="chevron-down" size={14} />
          </Pressable>
        </View>

        <FormField
          label="Note"
          multiline
          placeholder="Optional note"
          value={form.note}
          onChangeText={(value) => updateForm('note', value)}
        />

        {error ? (
          <View style={[styles.banner, styles.errorBanner]}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        {successMessage ? (
          <View style={[styles.banner, styles.successBanner]}>
            <Text style={styles.successText}>{successMessage}</Text>
          </View>
        ) : null}

        <View style={styles.actions}>
          <Pressable disabled={isSubmitting} onPress={handleSubmit} style={styles.primaryButton}>
            {isSubmitting ? (
              <ActivityIndicator color={palette.surface} />
            ) : (
              <Text style={styles.primaryButtonText}>Save transaction</Text>
            )}
          </Pressable>
          <Pressable onPress={() => router.back()} style={styles.secondaryButton}>
            <Text style={styles.secondaryButtonText}>Back</Text>
          </Pressable>
        </View>
      </SectionCard>

      <CategoryPickerModal
        categories={filteredCategories}
        selectedCategoryId={form.categoryId}
        visible={isCategoryPickerOpen}
        onClose={() => setIsCategoryPickerOpen(false)}
        onSelect={(categoryId) => {
          updateForm('categoryId', categoryId);
          setIsCategoryPickerOpen(false);
        }}
      />
    </Screen>
  );
}

function FormField(props: React.ComponentProps<typeof TextInput> & { label: string }) {
  const { label, multiline, ...inputProps } = props;

  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        multiline={multiline}
        placeholderTextColor={palette.gray500}
        style={[styles.input, multiline ? styles.textarea : null]}
        {...inputProps}
      />
    </View>
  );
}

function TypeChip({
  active,
  icon,
  label,
  tone,
  onPress,
}: {
  active: boolean;
  icon: React.ComponentProps<typeof FontAwesome>['name'];
  label: string;
  tone: 'expense' | 'income';
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.typeChip,
        active ? (tone === 'expense' ? styles.typeChipExpense : styles.typeChipIncome) : null,
      ]}
    >
      <FontAwesome
        color={active ? palette.surface : tone === 'expense' ? palette.coral : palette.green}
        name={icon}
        size={15}
      />
      <Text
        style={[
          styles.typeChipText,
          active ? styles.typeChipTextActive : null,
          !active && tone === 'expense' ? styles.typeChipTextExpense : null,
          !active && tone === 'income' ? styles.typeChipTextIncome : null,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function CategoryPickerModal({
  categories,
  onClose,
  onSelect,
  selectedCategoryId,
  visible,
}: {
  categories: Category[];
  onClose: () => void;
  onSelect: (categoryId: string) => void;
  selectedCategoryId: string | null;
  visible: boolean;
}) {
  return (
    <Modal animationType="fade" onRequestClose={onClose} transparent visible={visible}>
      <Pressable onPress={onClose} style={styles.modalBackdrop}>
        <Pressable onPress={() => undefined} style={styles.modalCard}>
          <Text style={styles.modalTitle}>Choose Category</Text>
          <ScrollView style={styles.modalList} showsVerticalScrollIndicator={false}>
            {categories.map((category) => (
              <Pressable
                key={category.id}
                onPress={() => onSelect(category.id)}
                style={[
                  styles.modalOption,
                  selectedCategoryId === category.id ? styles.modalOptionActive : null,
                ]}
              >
                <View style={styles.modalOptionContent}>
                  {category.color ? (
                    <View style={[styles.categoryDot, { backgroundColor: category.color }]} />
                  ) : null}
                  <Text
                    style={[
                      styles.modalOptionText,
                      selectedCategoryId === category.id ? styles.modalOptionTextActive : null,
                    ]}
                  >
                    {category.name}
                  </Text>
                </View>
                {selectedCategoryId === category.id ? (
                  <FontAwesome color={palette.teal} name="check" size={14} />
                ) : null}
              </Pressable>
            ))}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function validateForm(form: FormState) {
  if (!form.amount.trim()) {
    return 'Amount is required.';
  }

  const amount = Number(form.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    return 'Amount must be greater than zero.';
  }

  if (!form.title.trim()) {
    return 'Title is required.';
  }

  if (!form.categoryId) {
    return 'Choose a category.';
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(form.transactionDate.trim())) {
    return 'Date must use YYYY-MM-DD format.';
  }

  return null;
}

const styles = StyleSheet.create({
  typeRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  typeChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: '#F8FBFA',
    minHeight: 48,
  },
  typeChipExpense: {
    borderColor: palette.coral,
    backgroundColor: palette.coral,
  },
  typeChipIncome: {
    borderColor: palette.green,
    backgroundColor: palette.green,
  },
  typeChipText: {
    ...typography.label,
    fontWeight: '600',
  },
  typeChipTextActive: {
    color: palette.surface,
  },
  typeChipTextExpense: {
    color: palette.coral,
  },
  typeChipTextIncome: {
    color: palette.green,
  },
  field: {
    gap: spacing.xs,
  },
  fieldLabel: {
    color: palette.textMuted,
    ...typography.microLabel,
  },
  input: {
    backgroundColor: '#F8FBFA',
    borderColor: palette.border,
    borderRadius: radius.lg - 2,
    borderWidth: 1,
    color: palette.text,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    ...typography.body,
  },
  textarea: {
    minHeight: 96,
    textAlignVertical: 'top',
  },
  selector: {
    minHeight: 54,
    borderRadius: radius.lg - 2,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: '#F8FBFA',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
  },
  selectorContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    flex: 1,
    paddingRight: spacing.sm,
  },
  selectorValue: {
    color: palette.text,
    ...typography.body,
  },
  selectorPlaceholder: {
    color: palette.gray500,
    ...typography.body,
  },
  categoryDot: {
    width: 10,
    height: 10,
    borderRadius: radius.pill,
  },
  banner: {
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  errorBanner: {
    backgroundColor: '#FFF3F1',
    borderWidth: 1,
    borderColor: '#F6C4C0',
  },
  successBanner: {
    backgroundColor: '#F2FBF7',
    borderWidth: 1,
    borderColor: '#B8E7D3',
  },
  errorText: {
    color: palette.coral,
    ...typography.caption,
  },
  successText: {
    color: palette.green,
    ...typography.caption,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  primaryButton: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: palette.teal,
    borderRadius: radius.lg,
    minHeight: 52,
    justifyContent: 'center',
  },
  primaryButtonText: {
    color: palette.surface,
    ...typography.bodyStrong,
    fontWeight: '700',
  },
  secondaryButton: {
    minWidth: 88,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    paddingHorizontal: spacing.md,
  },
  secondaryButtonText: {
    color: palette.textMuted,
    ...typography.label,
    fontWeight: '600',
  },
  modalBackdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(12,20,18,0.36)',
    paddingHorizontal: spacing.lg,
  },
  modalCard: {
    width: '100%',
    maxWidth: 360,
    maxHeight: '72%',
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
  },
  modalTitle: {
    color: palette.text,
    ...typography.sectionTitle,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.sm,
  },
  modalList: {
    paddingHorizontal: spacing.sm,
  },
  modalOption: {
    minHeight: 48,
    borderRadius: radius.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
  },
  modalOptionActive: {
    backgroundColor: palette.tealSoft,
  },
  modalOptionContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  modalOptionText: {
    color: palette.text,
    ...typography.body,
  },
  modalOptionTextActive: {
    color: palette.teal,
    fontWeight: '600',
  },
});

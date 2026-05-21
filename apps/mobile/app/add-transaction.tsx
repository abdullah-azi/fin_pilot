import FontAwesome from '@expo/vector-icons/FontAwesome';
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
import {
  createTransaction,
  type CreateTransactionPayload,
  type TransactionFrequency,
  type TransactionType,
} from '@/lib/api/transactions';
import { useAuth } from '@/providers/AuthProvider';

type FormState = {
  amount: string;
  categoryId: string | null;
  daysPerWeek: string;
  hoursPerDay: string;
  incomeFrequency: TransactionFrequency;
  note: string;
  title: string;
  transactionDate: string;
  type: TransactionType;
};

type FocusField = 'date' | 'daysPerWeek' | 'hoursPerDay' | 'note' | 'title' | null;
type CategoryFieldConfig = {
  icon: React.ComponentProps<typeof FontAwesome>['name'];
  label: string;
  placeholder: string;
};
type PreviewMetric = {
  label: string;
  tone?: 'accent' | 'muted' | 'positive' | 'violet';
  value: string;
};

const COLORS = authPalette;
const TODAY = new Date().toISOString().slice(0, 10);
const DEFAULT_INCOME_FREQUENCY: TransactionFrequency = 'monthly';
const INCOME_FREQUENCIES: TransactionFrequency[] = ['once', 'hourly', 'daily', 'monthly', 'yearly'];

export default function AddTransactionScreen() {
  const { getValidAccessToken, user } = useAuth();
  const [categories, setCategories] = useState<Category[]>([]);
  const [form, setForm] = useState<FormState>({
    amount: '',
    categoryId: null,
    daysPerWeek: '5',
    hoursPerDay: '8',
    incomeFrequency: DEFAULT_INCOME_FREQUENCY,
    note: '',
    title: '',
    transactionDate: TODAY,
    type: 'expense',
  });
  const [focusedField, setFocusedField] = useState<FocusField>(null);
  const [isLoadingCategories, setIsLoadingCategories] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const filteredCategories = useMemo(
    () =>
      sortCategoriesForDisplay(
        categories.filter((category) => {
          if (category.type === 'both') {
            return true;
          }

          return category.type === form.type;
        }),
        form.type,
      ),
    [categories, form.type],
  );

  const selectedCategory =
    filteredCategories.find((category) => category.id === form.categoryId) ??
    categories.find((category) => category.id === form.categoryId) ??
    null;

  const currencyCode = (user?.currency ?? 'PKR').toUpperCase();
  const isExpense = form.type === 'expense';
  const amountColor = isExpense ? '#EF4444' : '#22C55E';
  const entryLabel = isExpense ? 'CATEGORY' : 'INCOME SOURCE';
  const titleFieldConfig = getCategoryFieldConfig(selectedCategory, form.type);
  const submitLabel = isExpense ? 'Save expense' : 'Save income';
  const submitButtonStyle = isExpense ? styles.submitButtonExpense : styles.submitButtonIncome;
  const amountLabel = getAmountLabel(form.type, form.incomeFrequency, currencyCode);
  const shouldUseHourlyIncomeLayout = form.type === 'income' && form.incomeFrequency === 'hourly';
  const incomePreview = useMemo(
    () =>
      form.type === 'income'
        ? getIncomePreview({
            amount: Number(form.amount),
            currencyCode,
            daysPerWeek: Number(form.daysPerWeek),
            frequency: form.incomeFrequency,
            hoursPerDay: Number(form.hoursPerDay),
          })
        : null,
    [currencyCode, form.amount, form.daysPerWeek, form.hoursPerDay, form.incomeFrequency, form.type],
  );
  const incomeHint = useMemo(
    () =>
      form.type === 'income'
        ? getIncomeHint({
            currencyCode,
            frequency: form.incomeFrequency,
            monthlyEquivalent: incomePreview?.monthlyEquivalent ?? 0,
          })
        : null,
    [currencyCode, form.incomeFrequency, form.type, incomePreview],
  );

  useEffect(() => {
    void loadCategories();
  }, []);

  useEffect(() => {
    if (filteredCategories.length === 0) {
      return;
    }

    const selectedIsStillValid = filteredCategories.some((category) => category.id === form.categoryId);
    if (selectedIsStillValid) {
      return;
    }

    setForm((current) => ({
      ...current,
      categoryId: filteredCategories[0]?.id ?? null,
    }));
  }, [filteredCategories, form.categoryId]);

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
    setForm((current) => {
      const next = {
        ...current,
        [field]: value,
      };

      if (field === 'type' && value === 'income') {
        next.incomeFrequency = next.incomeFrequency ?? DEFAULT_INCOME_FREQUENCY;
      }

      return next;
    });
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
        transaction_date: form.transactionDate.trim(),
        type: form.type,
        ...(form.type === 'income'
          ? {
              income_frequency: form.incomeFrequency,
              hours_per_day: form.incomeFrequency === 'hourly' ? Number(form.hoursPerDay) : null,
              days_per_week: form.incomeFrequency === 'hourly' ? Number(form.daysPerWeek) : null,
            }
          : {
              income_frequency: null,
              hours_per_day: null,
              days_per_week: null,
            }),
      };

      await createTransaction(accessToken, payload);

      const defaultCategoryId = filteredCategories[0]?.id ?? categories[0]?.id ?? null;
      setSuccessMessage(form.type === 'expense' ? 'Expense saved.' : 'Income saved.');
      setForm((current) => ({
        ...current,
        amount: '',
        categoryId: defaultCategoryId,
        note: '',
        title: '',
        transactionDate: TODAY,
      }));
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
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.handle} />

        <View style={styles.headerRow}>
          <Text style={styles.sheetTitle}>{isExpense ? 'Add transaction' : 'Add income'}</Text>
          <Pressable onPress={() => router.back()} style={styles.closeButton}>
            <FontAwesome color="#666666" name="close" size={12} />
          </Pressable>
        </View>

        <View style={styles.toggleRow}>
          <TypeToggle
            active={form.type === 'expense'}
            activeBackground="#EF4444"
            icon="arrow-up"
            inactiveTextColor="#444444"
            label="Expense"
            onPress={() => updateForm('type', 'expense')}
          />
          <TypeToggle
            active={form.type === 'income'}
            activeBackground="#22C55E"
            icon="arrow-down"
            inactiveTextColor="#444444"
            label="Income"
            onPress={() => updateForm('type', 'income')}
          />
        </View>

        <View style={styles.amountSection}>
          <Text style={styles.amountLabel}>{amountLabel}</Text>
          <TextInput
            keyboardType="decimal-pad"
            placeholder="0"
            placeholderTextColor="#3A3A3A"
            selectionColor={COLORS.violet}
            style={[styles.amountInput, { color: amountColor }]}
            value={form.amount}
            onChangeText={(value) => updateForm('amount', sanitizeAmount(value))}
          />
        </View>

        <View style={styles.formSection}>
          {!isExpense ? (
            <>
              <Text style={styles.fieldLabel}>HOW ARE YOU PAID?</Text>
              <View style={styles.frequencyRow}>
                {INCOME_FREQUENCIES.map((frequency) => {
                  const selected = form.incomeFrequency === frequency;
                  return (
                    <Pressable
                      key={frequency}
                      onPress={() => updateForm('incomeFrequency', frequency)}
                      style={[styles.frequencyChip, selected ? styles.frequencyChipSelected : null]}
                    >
                      <Text
                        style={[
                          styles.frequencyChipText,
                          selected ? styles.frequencyChipTextSelected : null,
                        ]}
                      >
                        {formatFrequencyLabel(frequency)}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              {form.incomeFrequency === 'hourly' ? (
                <View style={styles.twoColumnRow}>
                  <InputField
                    focused={focusedField === 'hoursPerDay'}
                    icon="clock-o"
                    keyboardType="decimal-pad"
                    label="HRS / DAY"
                    placeholder="8"
                    value={form.hoursPerDay}
                    onBlur={() => setFocusedField(null)}
                    onChangeText={(value) => updateForm('hoursPerDay', sanitizeWholeOrDecimal(value))}
                    onFocus={() => setFocusedField('hoursPerDay')}
                  />
                  <InputField
                    focused={focusedField === 'daysPerWeek'}
                    icon="calendar"
                    keyboardType="decimal-pad"
                    label="DAYS / WEEK"
                    placeholder="5"
                    value={form.daysPerWeek}
                    onBlur={() => setFocusedField(null)}
                    onChangeText={(value) => updateForm('daysPerWeek', sanitizeWholeOrDecimal(value))}
                    onFocus={() => setFocusedField('daysPerWeek')}
                  />
                </View>
              ) : null}

              {incomePreview ? (
                <View style={styles.previewCard}>
                  {incomePreview.metrics.map((metric, index) => (
                    <View key={metric.label}>
                      {index > 0 ? <View style={styles.previewDivider} /> : null}
                      <PreviewRow label={metric.label} tone={metric.tone} value={metric.value} />
                    </View>
                  ))}
                </View>
              ) : null}
            </>
          ) : null}

          {!isExpense && shouldUseHourlyIncomeLayout && incomeHint ? (
            <View style={styles.hintCard}>
              <FontAwesome color="#22C55E" name="android" size={13} style={styles.hintIcon} />
              <Text style={styles.hintText}>{incomeHint}</Text>
            </View>
          ) : null}

          <Text style={styles.fieldLabel}>{entryLabel}</Text>
          {isLoadingCategories ? (
            <View style={styles.loadingCategories}>
              <ActivityIndicator color={COLORS.violetBright} />
            </View>
          ) : (
            <View style={styles.categoryGrid}>
              {filteredCategories.map((category) => {
                const selected = category.id === form.categoryId;
                return (
                  <Pressable
                    key={category.id}
                    onPress={() => updateForm('categoryId', category.id)}
                    style={[styles.categoryCard, selected ? styles.categoryCardSelected : null]}
                  >
                    <FontAwesome
                      color={getCategoryIconColor(category, form.type)}
                      name={mapCategoryIcon(category.icon)}
                      size={16}
                    />
                    <Text style={[styles.categoryName, selected ? styles.categoryNameSelected : null]}>
                      {category.name}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          )}

          {shouldUseHourlyIncomeLayout ? (
            <View style={styles.singleFieldRow}>
              <InputField
                focused={focusedField === 'title'}
                icon={titleFieldConfig.icon}
                label={titleFieldConfig.label}
                placeholder={titleFieldConfig.placeholder}
                value={form.title}
                onBlur={() => setFocusedField(null)}
                onChangeText={(value) => updateForm('title', value)}
                onFocus={() => setFocusedField('title')}
              />
            </View>
          ) : (
            <View style={styles.twoColumnRow}>
              <InputField
                focused={focusedField === 'date'}
                icon="calendar"
                label={isExpense ? 'DATE' : 'DATE RECEIVED'}
                placeholder="YYYY-MM-DD"
                value={form.transactionDate}
                onBlur={() => setFocusedField(null)}
                onChangeText={(value) => updateForm('transactionDate', value)}
                onFocus={() => setFocusedField('date')}
              />
              <InputField
                focused={focusedField === 'title'}
                icon={titleFieldConfig.icon}
                label={titleFieldConfig.label}
                placeholder={titleFieldConfig.placeholder}
                value={form.title}
                onBlur={() => setFocusedField(null)}
                onChangeText={(value) => updateForm('title', value)}
                onFocus={() => setFocusedField('title')}
              />
            </View>
          )}

          {!isExpense && !shouldUseHourlyIncomeLayout && incomeHint ? (
            <View style={styles.hintCard}>
              <FontAwesome color="#22C55E" name="android" size={13} style={styles.hintIcon} />
              <Text style={styles.hintText}>{incomeHint}</Text>
            </View>
          ) : null}

          <InputField
            focused={focusedField === 'note'}
            icon="pencil"
            label="NOTE"
            placeholder="Add a note (optional)"
            value={form.note}
            onBlur={() => setFocusedField(null)}
            onChangeText={(value) => updateForm('note', value)}
            onFocus={() => setFocusedField('note')}
          />

          {error ? (
            <View style={[styles.feedbackCard, styles.errorCard]}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          {successMessage ? (
            <View style={[styles.feedbackCard, styles.successCard]}>
              <Text style={styles.successText}>{successMessage}</Text>
            </View>
          ) : null}
        </View>

        <Pressable disabled={isSubmitting} onPress={handleSubmit} style={[styles.submitButton, submitButtonStyle]}>
          {isSubmitting ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <>
              <FontAwesome color="#FFFFFF" name={isExpense ? 'plus' : 'check'} size={14} />
              <Text style={styles.submitButtonText}>{submitLabel}</Text>
            </>
          )}
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function TypeToggle({
  active,
  activeBackground,
  icon,
  inactiveTextColor,
  label,
  onPress,
}: {
  active: boolean;
  activeBackground: string;
  icon: React.ComponentProps<typeof FontAwesome>['name'];
  inactiveTextColor: string;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.toggleButton, active ? { backgroundColor: activeBackground } : null]}
    >
      <FontAwesome color={active ? '#FFFFFF' : inactiveTextColor} name={icon} size={12} />
      <Text style={[styles.toggleButtonText, active ? styles.toggleButtonTextActive : { color: inactiveTextColor }]}>
        {label}
      </Text>
    </Pressable>
  );
}

function InputField({
  focused,
  icon,
  label,
  ...inputProps
}: React.ComponentProps<typeof TextInput> & {
  focused?: boolean;
  icon: React.ComponentProps<typeof FontAwesome>['name'];
  label: string;
}) {
  return (
    <View style={styles.inputField}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={[styles.inputShell, focused ? styles.inputShellFocused : null]}>
        <TextInput
          autoCapitalize="none"
          autoCorrect={false}
          placeholderTextColor="#3A3A3A"
          selectionColor={COLORS.violet}
          style={styles.fieldInputText}
          {...inputProps}
        />
        <FontAwesome color={focused ? COLORS.violet : '#555555'} name={icon} size={14} />
      </View>
    </View>
  );
}

function PreviewRow({ label, tone, value }: PreviewMetric) {
  return (
    <View style={styles.previewRow}>
      <Text style={styles.previewLabel}>{label}</Text>
      <Text
        style={[
          styles.previewValue,
          tone === 'positive' ? styles.previewValuePositive : null,
          tone === 'violet' ? styles.previewValueViolet : null,
          tone === 'accent' ? styles.previewValueAccent : null,
        ]}
      >
        {value}
      </Text>
    </View>
  );
}

function formatFrequencyLabel(frequency: TransactionFrequency) {
  switch (frequency) {
    case 'once':
      return 'Once';
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

function getAmountLabel(type: TransactionType, frequency: TransactionFrequency, currencyCode: string) {
  if (type === 'expense') {
    return `AMOUNT (${currencyCode})`;
  }

  switch (frequency) {
    case 'hourly':
      return `RATE (${currencyCode} / HR)`;
    case 'daily':
      return `AMOUNT (${currencyCode} / DAY)`;
    case 'monthly':
      return `AMOUNT (${currencyCode} / MONTH)`;
    case 'yearly':
      return `AMOUNT (${currencyCode} / YEAR)`;
    case 'once':
    default:
      return `AMOUNT (${currencyCode})`;
  }
}

function sanitizeAmount(value: string) {
  const sanitized = value.replace(/[^0-9.]/g, '');
  const parts = sanitized.split('.');

  if (parts.length <= 2) {
    return sanitized;
  }

  return `${parts[0]}.${parts.slice(1).join('')}`;
}

function sanitizeWholeOrDecimal(value: string) {
  return sanitizeAmount(value);
}

function mapCategoryIcon(icon: string | null | undefined): React.ComponentProps<typeof FontAwesome>['name'] {
  switch (icon) {
    case 'briefcase':
      return 'briefcase';
    case 'laptop':
      return 'laptop';
    case 'line-chart':
      return 'line-chart';
    case 'ellipsis-h':
      return 'ellipsis-h';
    case 'shopping-basket':
      return 'shopping-basket';
    case 'car':
      return 'car';
    case 'file-text-o':
      return 'file-text-o';
    case 'shopping-bag':
      return 'shopping-bag';
    case 'heartbeat':
      return 'heartbeat';
    case 'film':
      return 'film';
    case 'utensils':
      return 'cutlery';
    case 'tv':
      return 'television';
    case 'wrench':
      return 'wrench';
    case 'book':
      return 'book';
    default:
      return 'ellipsis-h';
  }
}

function getCategoryFieldConfig(
  category: Category | null,
  transactionType: TransactionType,
): CategoryFieldConfig {
  if (!category) {
    return transactionType === 'expense'
      ? { icon: 'building', label: 'MERCHANT', placeholder: 'Carrefour' }
      : { icon: 'user', label: 'FROM', placeholder: 'Employer' };
  }

  switch (category.name) {
    case 'Groceries':
    case 'Food':
      return { icon: 'shopping-cart', label: 'STORE', placeholder: 'Carrefour' };
    case 'Transport':
      return { icon: 'car', label: 'SERVICE', placeholder: 'Uber' };
    case 'Bills':
    case 'Utilities':
      return { icon: 'bolt', label: 'PROVIDER', placeholder: 'K-Electric' };
    case 'Health':
      return { icon: 'medkit', label: 'CLINIC / PHARMACY', placeholder: 'Sehat Pharmacy' };
    case 'Shopping':
    case 'Clothing':
      return { icon: 'shopping-bag', label: 'SHOP', placeholder: 'Outfitters' };
    case 'Entertainment':
    case 'Subscriptions':
      return { icon: 'play-circle', label: 'SERVICE', placeholder: 'Netflix' };
    case 'Education':
      return { icon: 'book', label: 'INSTITUTE', placeholder: 'Coursera' };
    case 'Salary':
      return { icon: 'building', label: 'EMPLOYER', placeholder: 'Acme Corp' };
    case 'Freelance':
      return { icon: 'laptop', label: 'CLIENT / PLATFORM', placeholder: 'Upwork' };
    case 'Investment':
      return { icon: 'line-chart', label: 'SOURCE', placeholder: 'Dividend payout' };
    case 'Other':
      return transactionType === 'expense'
        ? { icon: 'tag', label: 'DETAIL', placeholder: 'Add context' }
        : { icon: 'tag', label: 'SOURCE', placeholder: 'Add context' };
    default:
      return transactionType === 'expense'
        ? { icon: 'building', label: 'MERCHANT', placeholder: 'Carrefour' }
        : { icon: 'user', label: 'FROM', placeholder: 'Employer' };
  }
}

function sortCategoriesForDisplay(categories: Category[], transactionType: TransactionType) {
  const incomeOrder = ['Salary', 'Freelance', 'Investment', 'Other'];
  const expenseOrder = [
    'Groceries',
    'Transport',
    'Health',
    'Subscriptions',
    'Utilities',
    'Clothing',
    'Education',
    'Food',
    'Bills',
    'Shopping',
    'Entertainment',
    'Other',
  ];
  const order = transactionType === 'income' ? incomeOrder : expenseOrder;

  return [...categories].sort((left, right) => {
    const leftIndex = order.indexOf(left.name);
    const rightIndex = order.indexOf(right.name);

    if (leftIndex === -1 && rightIndex === -1) {
      return left.name.localeCompare(right.name);
    }

    if (leftIndex === -1) {
      return 1;
    }

    if (rightIndex === -1) {
      return -1;
    }

    return leftIndex - rightIndex;
  });
}

function getCategoryIconColor(category: Category, transactionType: TransactionType) {
  if (transactionType === 'income') {
    return category.name === 'Other' ? '#666666' : '#22C55E';
  }

  return category.color ?? '#666666';
}

function formatCurrency(value: number, currencyCode: string) {
  if (!Number.isFinite(value)) {
    return `${currencyCode} 0`;
  }

  const rounded = Math.round(value);
  return `Rs ${rounded.toLocaleString('en-US')}`;
}

function getIncomePreview({
  amount,
  currencyCode,
  daysPerWeek,
  frequency,
  hoursPerDay,
}: {
  amount: number;
  currencyCode: string;
  daysPerWeek: number;
  frequency: TransactionFrequency;
  hoursPerDay: number;
}) {
  if (!Number.isFinite(amount) || amount <= 0) {
    return null;
  }

  const safeHoursPerDay = Number.isFinite(hoursPerDay) && hoursPerDay > 0 ? hoursPerDay : 0;
  const safeDaysPerWeek = Number.isFinite(daysPerWeek) && daysPerWeek > 0 ? daysPerWeek : 0;
  let monthlyEquivalent = amount;
  let metrics: PreviewMetric[] = [];

  switch (frequency) {
    case 'hourly': {
      const perDay = amount * safeHoursPerDay;
      monthlyEquivalent = amount * safeHoursPerDay * safeDaysPerWeek * (52 / 12);
      const yearly = monthlyEquivalent * 12;
      metrics = [
        { label: 'Per hour', tone: 'positive', value: formatCurrency(amount, currencyCode) },
        {
          label: `Est. per day (${safeHoursPerDay || 0} hrs)`,
          value: formatCurrency(perDay, currencyCode),
        },
        { label: 'Est. per month', tone: 'violet', value: formatCurrency(monthlyEquivalent, currencyCode) },
        { label: 'Est. per year', value: formatCurrency(yearly, currencyCode) },
      ];
      break;
    }
    case 'daily': {
      monthlyEquivalent = amount * 30;
      const yearly = amount * 365;
      metrics = [
        { label: 'Per day', tone: 'positive', value: formatCurrency(amount, currencyCode) },
        { label: 'Per month (approx)', tone: 'violet', value: formatCurrency(monthlyEquivalent, currencyCode) },
        { label: 'Per year (approx)', value: formatCurrency(yearly, currencyCode) },
      ];
      break;
    }
    case 'monthly': {
      monthlyEquivalent = amount;
      const yearly = amount * 12;
      metrics = [
        { label: 'Per month', tone: 'positive', value: formatCurrency(amount, currencyCode) },
        { label: 'Per day (approx)', value: formatCurrency(amount / 30, currencyCode) },
        { label: 'Per year', tone: 'violet', value: formatCurrency(yearly, currencyCode) },
      ];
      break;
    }
    case 'yearly': {
      monthlyEquivalent = amount / 12;
      metrics = [
        { label: 'Per year', tone: 'positive', value: formatCurrency(amount, currencyCode) },
        { label: 'Per month (approx)', tone: 'violet', value: formatCurrency(monthlyEquivalent, currencyCode) },
        { label: 'Per day (approx)', value: formatCurrency(amount / 365, currencyCode) },
      ];
      break;
    }
    case 'once':
    default: {
      monthlyEquivalent = 0;
      metrics = [
        { label: 'One-time amount', tone: 'positive', value: formatCurrency(amount, currencyCode) },
        { label: 'Monthly baseline impact', tone: 'accent', value: 'Does not update baseline' },
      ];
      break;
    }
  }

  return {
    metrics,
    monthlyEquivalent,
  };
}

function getIncomeHint({
  currencyCode,
  frequency,
  monthlyEquivalent,
}: {
  currencyCode: string;
  frequency: TransactionFrequency;
  monthlyEquivalent: number;
}) {
  if (frequency === 'once') {
    return `One-time income is logged but does not update the monthly baseline FinPilot uses for spending and savings analysis.`;
  }

  return `FinPilot will use ${formatCurrency(monthlyEquivalent, currencyCode)}/month as your income baseline for spending analysis and savings suggestions.`;
}

function validateForm(form: FormState) {
  if (!form.amount.trim()) {
    return 'Amount is required.';
  }

  const amount = Number(form.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    return 'Amount must be greater than zero.';
  }

  if (!form.categoryId) {
    return 'Choose a category.';
  }

  if (!form.title.trim()) {
    return 'This field is required.';
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(form.transactionDate.trim())) {
    return 'Date must use YYYY-MM-DD format.';
  }

  if (form.type === 'income' && form.incomeFrequency === 'hourly') {
    const hoursPerDay = Number(form.hoursPerDay);
    const daysPerWeek = Number(form.daysPerWeek);

    if (!Number.isFinite(hoursPerDay) || hoursPerDay <= 0 || hoursPerDay > 24) {
      return 'Hours per day must be between 0 and 24.';
    }

    if (!Number.isFinite(daysPerWeek) || daysPerWeek <= 0 || daysPerWeek > 7) {
      return 'Days per week must be between 0 and 7.';
    }
  }

  return null;
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#0E0E0E',
  },
  content: {
    paddingBottom: 28,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#2E2E2E',
    alignSelf: 'center',
    marginTop: 14,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 14 + screenTopClearance,
  },
  sheetTitle: {
    color: '#F0F0F0',
    fontSize: 15,
    fontWeight: '500',
  },
  closeButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#1E1E1E',
    borderWidth: 0.5,
    borderColor: '#2E2E2E',
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggleRow: {
    flexDirection: 'row',
    marginHorizontal: 20,
    marginTop: 16,
    backgroundColor: '#161616',
    borderRadius: 12,
    borderWidth: 0.5,
    borderColor: '#272727',
    padding: 3,
    gap: 3,
  },
  toggleButton: {
    flex: 1,
    minHeight: 38,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
  },
  toggleButtonText: {
    fontSize: 12,
    fontWeight: '500',
  },
  toggleButtonTextActive: {
    color: '#FFFFFF',
  },
  amountSection: {
    paddingTop: 20,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  amountLabel: {
    color: '#555555',
    fontSize: 10,
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  amountInput: {
    minWidth: '72%',
    textAlign: 'center',
    fontSize: 34,
    fontWeight: '500',
    letterSpacing: -1,
    paddingVertical: 0,
  },
  formSection: {
    paddingTop: 16,
    paddingHorizontal: 20,
  },
  fieldLabel: {
    color: '#555555',
    fontSize: 10,
    letterSpacing: 0.4,
    marginBottom: 7,
  },
  frequencyRow: {
    flexDirection: 'row',
    gap: 5,
    marginBottom: 14,
  },
  frequencyChip: {
    flex: 1,
    minHeight: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    backgroundColor: '#161616',
    borderWidth: 0.5,
    borderColor: '#272727',
    paddingHorizontal: 4,
  },
  frequencyChipSelected: {
    backgroundColor: '#1A1525',
    borderColor: COLORS.violet,
  },
  frequencyChipText: {
    fontSize: 10,
    fontWeight: '500',
    color: '#555555',
  },
  frequencyChipTextSelected: {
    color: '#9B72F5',
  },
  loadingCategories: {
    minHeight: 88,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewCard: {
    backgroundColor: '#161616',
    borderRadius: 11,
    borderWidth: 0.5,
    borderColor: '#272727',
    paddingHorizontal: 13,
    paddingVertical: 11,
    marginBottom: 12,
  },
  previewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  previewLabel: {
    fontSize: 10,
    color: '#555555',
  },
  previewValue: {
    fontSize: 11,
    fontWeight: '500',
    color: '#DDDDDD',
  },
  previewValuePositive: {
    color: '#22C55E',
  },
  previewValueViolet: {
    color: '#9B72F5',
  },
  previewValueAccent: {
    color: '#F59E0B',
  },
  previewDivider: {
    height: 0.5,
    backgroundColor: '#272727',
    marginVertical: 7,
  },
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 12,
  },
  categoryCard: {
    width: '23%',
    minHeight: 66,
    borderRadius: 10,
    borderWidth: 0.5,
    borderColor: '#272727',
    backgroundColor: '#161616',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    paddingVertical: 8,
    gap: 3,
  },
  categoryCardSelected: {
    borderColor: COLORS.violet,
    backgroundColor: '#1A1525',
  },
  categoryName: {
    color: '#666666',
    fontSize: 9,
    textAlign: 'center',
  },
  categoryNameSelected: {
    color: '#9B72F5',
  },
  twoColumnRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  singleFieldRow: {
    marginBottom: 12,
  },
  inputField: {
    flex: 1,
  },
  inputShell: {
    minHeight: 42,
    borderRadius: 10,
    borderWidth: 0.5,
    borderColor: '#2E2E2E',
    backgroundColor: '#161616',
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  inputShellFocused: {
    borderColor: COLORS.violet,
  },
  fieldInputText: {
    flex: 1,
    color: '#E0E0E0',
    fontSize: 13,
    paddingVertical: 10,
    paddingRight: 8,
  },
  hintCard: {
    backgroundColor: '#0D1A12',
    borderRadius: 9,
    borderWidth: 0.5,
    borderColor: '#1A3D22',
    paddingHorizontal: 11,
    paddingVertical: 9,
    marginBottom: 12,
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-start',
  },
  hintIcon: {
    marginTop: 1,
  },
  hintText: {
    flex: 1,
    fontSize: 10,
    lineHeight: 15,
    color: '#4A8C5C',
  },
  feedbackCard: {
    borderRadius: 10,
    borderWidth: 0.5,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
  },
  errorCard: {
    backgroundColor: 'rgba(240,106,99,0.12)',
    borderColor: 'rgba(240,106,99,0.28)',
  },
  successCard: {
    backgroundColor: 'rgba(34,197,94,0.12)',
    borderColor: 'rgba(34,197,94,0.28)',
  },
  errorText: {
    color: '#F06A63',
    ...typography.caption,
  },
  successText: {
    color: '#22C55E',
    ...typography.caption,
  },
  submitButton: {
    minHeight: 52,
    marginHorizontal: 20,
    marginTop: 8,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  submitButtonExpense: {
    backgroundColor: COLORS.violet,
  },
  submitButtonIncome: {
    backgroundColor: '#22C55E',
  },
  submitButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '500',
  },
});

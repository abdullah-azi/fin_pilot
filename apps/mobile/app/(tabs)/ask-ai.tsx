import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { authPalette, screenTopClearance } from '@/constants/theme';
import {
  generalChat,
  purchaseCheck,
  savingsAdvice,
  type GeneralAdviceResponse,
  type PurchaseCheckResponse,
  type SavingsAdviceResponse,
} from '@/lib/api/ai';
import { getCategories, type Category } from '@/lib/api/categories';
import { ApiError } from '@/lib/api/client';
import { listSavingsGoals, type SavingsGoal } from '@/lib/api/savings-goals';
import { useAuth } from '@/providers/AuthProvider';

const COLORS = authPalette;

type AssistantMode = 'chat' | 'purchase' | 'savings';

type PromptPreset = {
  amount?: string;
  itemName?: string;
  label: string;
  mode: AssistantMode;
  question: string;
};

type ChatConversationTurn = {
  id: string;
  kind: 'chat';
  request: {
    question: string;
  };
  response: GeneralAdviceResponse;
};

type PurchaseConversationTurn = {
  id: string;
  kind: 'purchase';
  request: {
    amount: string;
    categoryName: string | null;
    itemName: string;
    question: string;
  };
  response: PurchaseCheckResponse;
};

type SavingsConversationTurn = {
  id: string;
  kind: 'savings';
  request: {
    goalName: string | null;
    question: string;
  };
  response: SavingsAdviceResponse;
};

type ConversationTurn = ChatConversationTurn | PurchaseConversationTurn | SavingsConversationTurn;

const QUICK_PROMPTS: Record<AssistantMode, PromptPreset[]> = {
  chat: [
    {
      label: 'What should I focus on this month?',
      mode: 'chat',
      question: 'What should I focus on this month?',
    },
    {
      label: 'Am I spending too much lately?',
      mode: 'chat',
      question: 'Am I spending too much lately?',
    },
    {
      label: 'What is my biggest money weakness right now?',
      mode: 'chat',
      question: 'What is my biggest money weakness right now?',
    },
    {
      label: 'Give me one simple action for this week',
      mode: 'chat',
      question: 'Give me one simple action I should take this week.',
    },
  ],
  purchase: [
    {
      amount: '15000',
      itemName: 'new phone',
      label: 'Can I afford a Rs 15,000 purchase right now?',
      mode: 'purchase',
      question: 'Can I afford to buy a new phone for Rs 15,000 right now?',
    },
    {
      amount: '12000',
      itemName: 'headphones',
      label: 'Will headphones hurt my savings target?',
      mode: 'purchase',
      question: 'If I buy headphones this week, will it hurt my savings target?',
    },
    {
      amount: '65000',
      itemName: 'new phone',
      label: 'Should I wait until salary for a new phone?',
      mode: 'purchase',
      question: 'Is it smarter to wait until salary before buying a new phone?',
    },
  ],
  savings: [
    {
      label: 'How much should I save this month?',
      mode: 'savings',
      question: 'How much should I save this month?',
    },
    {
      label: 'Which savings goal should I prioritize first?',
      mode: 'savings',
      question: 'Which savings goal should I prioritize first?',
    },
    {
      label: 'Am I on track for my current goal?',
      mode: 'savings',
      question: 'Am I on track for my current goal?',
    },
    {
      label: 'How should I split savings across my goals?',
      mode: 'savings',
      question: 'How should I split my savings across my active goals this month?',
    },
  ],
};

export default function AskAIScreen() {
  const { getValidAccessToken, user } = useAuth();
  const [mode, setMode] = useState<AssistantMode>('chat');
  const [categories, setCategories] = useState<Category[]>([]);
  const [savingsGoals, setSavingsGoals] = useState<SavingsGoal[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [question, setQuestion] = useState('');
  const [itemName, setItemName] = useState('');
  const [plannedAmount, setPlannedAmount] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [selectedGoalId, setSelectedGoalId] = useState<string | null>(null);
  const [categoryModalOpen, setCategoryModalOpen] = useState(false);
  const [goalModalOpen, setGoalModalOpen] = useState(false);
  const [conversation, setConversation] = useState<ConversationTurn[]>([]);

  useEffect(() => {
    void loadSupportData();
  }, []);

  const selectedCategory = categories.find((category) => category.id === selectedCategoryId) ?? null;
  const selectedGoal = savingsGoals.find((goal) => goal.id === selectedGoalId) ?? null;
  const currencyCode = (user?.currency ?? 'PKR').toUpperCase();
  const canSubmit = useMemo(() => {
    if (mode === 'purchase') {
      return question.trim().length > 0 && itemName.trim().length > 0 && Number(plannedAmount) > 0;
    }

    return question.trim().length > 0;
  }, [itemName, mode, plannedAmount, question]);
  const headerSubtitle = useMemo(
    () => (isSubmitting ? 'Thinking...' : 'Ready to help'),
    [isSubmitting],
  );

  async function loadSupportData() {
    setIsLoadingData(true);
    setError(null);

    try {
      const accessToken = await getValidAccessToken();
      if (!accessToken) {
        throw new Error('Your session expired. Please log in again.');
      }

      const [allCategories, allGoals] = await Promise.all([
        getCategories(accessToken),
        listSavingsGoals(accessToken),
      ]);

      const expenseCategories = allCategories.filter((category) => category.type !== 'income');
      const activeGoals = allGoals.filter((goal) => goal.status === 'active');

      setCategories(expenseCategories);
      setSavingsGoals(activeGoals);
      setSelectedCategoryId((current) => current ?? expenseCategories[0]?.id ?? null);
      setSelectedGoalId((current) => current ?? activeGoals[0]?.id ?? null);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Could not load AI tools.');
    } finally {
      setIsLoadingData(false);
    }
  }

  function applyPrompt(prompt: PromptPreset) {
    setMode(prompt.mode);
    setQuestion(prompt.question);
    setItemName(prompt.itemName ?? '');
    setPlannedAmount(prompt.amount ?? '');
    setError(null);
  }

  async function handleSubmit() {
    if (!canSubmit) {
      setError(
        mode === 'purchase'
          ? 'Add an item, amount, and question first.'
          : 'Enter your question first.',
      );
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const accessToken = await getValidAccessToken();
      if (!accessToken) {
        throw new Error('Your session expired. Please log in again.');
      }

      if (mode === 'chat') {
        const response = await generalChat(accessToken, {
          question: question.trim(),
        });

        setConversation((current) => [
          ...current,
          {
            id: `${Date.now()}`,
            kind: 'chat',
            request: { question: question.trim() },
            response,
          },
        ]);
      } else if (mode === 'purchase') {
        const response = await purchaseCheck(accessToken, {
          planned_amount: Number(plannedAmount),
          item_name: itemName.trim(),
          question: question.trim(),
          category_id: selectedCategoryId,
        });

        setConversation((current) => [
          ...current,
          {
            id: `${Date.now()}`,
            kind: 'purchase',
            request: {
              amount: plannedAmount,
              categoryName: selectedCategory?.effective_name ?? selectedCategory?.name ?? null,
              itemName: itemName.trim(),
              question: question.trim(),
            },
            response,
          },
        ]);
      } else {
        const response = await savingsAdvice(accessToken, {
          question: question.trim(),
          goal_id: selectedGoalId,
        });

        setConversation((current) => [
          ...current,
          {
            id: `${Date.now()}`,
            kind: 'savings',
            request: {
              goalName: selectedGoal?.name ?? null,
              question: question.trim(),
            },
            response,
          },
        ]);
      }

      setQuestion('');
    } catch (caughtError) {
      if (caughtError instanceof ApiError) {
        setError(caughtError.message);
      } else {
        setError(caughtError instanceof Error ? caughtError.message : 'Could not reach FinPilot AI.');
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <View style={styles.avatar}>
          <FontAwesome color="#FFFFFF" name="android" size={16} />
        </View>
        <View style={styles.headerMeta}>
          <Text style={styles.headerTitle}>FinPilot AI</Text>
          <View style={styles.statusRow}>
            <View style={styles.statusDot} />
            <Text style={styles.statusText}>{headerSubtitle}</Text>
          </View>
        </View>
      </View>

      <View style={styles.modeRow}>
        <ModePill active={mode === 'chat'} icon="commenting" label="Chat" onPress={() => setMode('chat')} />
        <ModePill
          active={mode === 'purchase'}
          icon="shopping-cart"
          label="Purchase"
          onPress={() => setMode('purchase')}
        />
        <ModePill active={mode === 'savings'} icon="money" label="Savings" onPress={() => setMode('savings')} />
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {conversation.length === 0 ? (
          <View style={styles.emptyState}>
            <View style={styles.emptyIcon}>
              <FontAwesome color={COLORS.violet} name="android" size={24} />
            </View>
            <Text style={styles.emptyTitle}>Ask me anything</Text>
            <Text style={styles.emptyText}>{getEmptyStateCopy(mode)}</Text>
          </View>
        ) : (
          <View style={styles.chatBody}>
            <Text style={styles.timestamp}>Today</Text>
            {conversation.map((turn) => (
              <View key={turn.id} style={styles.turnBlock}>
                <View style={[styles.messageRow, styles.messageRowUser]}>
                  <View style={styles.userAvatar}>
                    <Text style={styles.userAvatarText}>{getInitials(user?.full_name, user?.email)}</Text>
                  </View>
                  <View style={[styles.chatBubble, styles.userBubble]}>
                    <Text style={styles.userBubbleText}>{turn.request.question}</Text>
                  </View>
                </View>

                {turn.kind === 'chat' ? (
                  <GeneralResponseCard currencyCode={currencyCode} response={turn.response} />
                ) : turn.kind === 'purchase' ? (
                  <PurchaseResponseCard currencyCode={currencyCode} response={turn.response} />
                ) : (
                  <SavingsResponseCard currencyCode={currencyCode} response={turn.response} />
                )}

                <View style={styles.messageRow}>
                  <View style={styles.aiBubbleAvatar}>
                    <FontAwesome color="#FFFFFF" name="android" size={11} />
                  </View>
                  <View style={[styles.chatBubble, styles.aiBubble]}>
                    <Text style={styles.aiBubbleText}>{turn.response.guidance}</Text>
                  </View>
                </View>
              </View>
            ))}

            {isSubmitting ? (
              <View style={styles.messageRow}>
                <View style={styles.aiBubbleAvatar}>
                  <FontAwesome color="#FFFFFF" name="android" size={11} />
                </View>
                <View style={styles.typingBubble}>
                  <View style={styles.typingDot} />
                  <View style={styles.typingDot} />
                  <View style={styles.typingDot} />
                </View>
              </View>
            ) : null}
          </View>
        )}

        {mode === 'purchase' ? (
          <View style={styles.detailsCard}>
            <View style={styles.detailsHeader}>
              <Text style={styles.sectionLabel}>PURCHASE DETAILS</Text>
              <Text style={styles.detailsHelper}>Used for grounded answers</Text>
            </View>

            <View style={styles.detailsGrid}>
              <FieldBlock
                label="ITEM"
                placeholder="New phone"
                value={itemName}
                onChangeText={setItemName}
              />
              <FieldBlock
                keyboardType="decimal-pad"
                label={`AMOUNT (${currencyCode})`}
                placeholder="65000"
                value={plannedAmount}
                onChangeText={(value) => setPlannedAmount(sanitizeAmount(value))}
              />
            </View>

            <View style={styles.fieldBlock}>
              <Text style={styles.fieldLabel}>CATEGORY</Text>
              <Pressable disabled={isLoadingData} onPress={() => setCategoryModalOpen(true)} style={styles.selectorButton}>
                <View style={styles.selectorTextWrap}>
                  <FontAwesome
                    color={selectedCategory?.color ?? COLORS.violetBright}
                    name={mapCategoryIcon(selectedCategory?.icon)}
                    size={14}
                  />
                  <Text style={styles.selectorText}>
                    {selectedCategory?.effective_name ?? selectedCategory?.name ?? 'Choose category'}
                  </Text>
                </View>
                {isLoadingData ? (
                  <ActivityIndicator color={COLORS.violetBright} size="small" />
                ) : (
                  <FontAwesome color="#555555" name="chevron-down" size={12} />
                )}
              </Pressable>
            </View>
          </View>
        ) : null}

        {mode === 'savings' ? (
          <View style={styles.detailsCard}>
            <View style={styles.detailsHeader}>
              <Text style={styles.sectionLabel}>SAVINGS CONTEXT</Text>
              <Text style={styles.detailsHelper}>Optional goal focus</Text>
            </View>

            <View style={styles.fieldBlock}>
              <Text style={styles.fieldLabel}>FOCUS GOAL</Text>
              <Pressable disabled={isLoadingData} onPress={() => setGoalModalOpen(true)} style={styles.selectorButton}>
                <View style={styles.selectorTextWrap}>
                  <FontAwesome color={COLORS.green} name="flag" size={14} />
                  <Text style={styles.selectorText}>{selectedGoal?.name ?? 'Ask about all active goals'}</Text>
                </View>
                {isLoadingData ? (
                  <ActivityIndicator color={COLORS.violetBright} size="small" />
                ) : (
                  <FontAwesome color="#555555" name="chevron-down" size={12} />
                )}
              </Pressable>
            </View>
          </View>
        ) : null}

        <View style={styles.quickPromptsSection}>
          <Text style={styles.sectionLabel}>SUGGESTED QUESTIONS</Text>
          <View style={styles.quickPromptList}>
            {QUICK_PROMPTS[mode].map((prompt) => (
              <Pressable key={prompt.label} onPress={() => applyPrompt(prompt)} style={styles.promptChip}>
                <FontAwesome
                  color={mode === 'purchase' ? COLORS.violetBright : mode === 'savings' ? COLORS.green : COLORS.violetBright}
                  name={mode === 'savings' ? 'money' : 'commenting'}
                  size={13}
                />
                <Text style={styles.promptText}>{prompt.label}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        {error ? (
          <View style={styles.errorCard}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}
      </ScrollView>

      <View style={styles.composerRow}>
        <TextInput
          autoCapitalize="sentences"
          autoCorrect={false}
          multiline
          placeholder={getComposerPlaceholder(mode)}
          placeholderTextColor="#3A3A3A"
          selectionColor={COLORS.violet}
          style={styles.composerInput}
          value={question}
          onChangeText={setQuestion}
        />
        <Pressable
          disabled={!canSubmit || isSubmitting}
          onPress={() => void handleSubmit()}
          style={[styles.sendButton, !canSubmit || isSubmitting ? styles.sendButtonDisabled : null]}
        >
          {isSubmitting ? (
            <ActivityIndicator color="#FFFFFF" size="small" />
          ) : (
            <FontAwesome color="#FFFFFF" name="arrow-up" size={14} />
          )}
        </Pressable>
      </View>

      <CategorySelectModal
        categories={categories}
        open={categoryModalOpen}
        selectedCategoryId={selectedCategoryId}
        onClose={() => setCategoryModalOpen(false)}
        onSelect={(categoryId) => {
          setSelectedCategoryId(categoryId);
          setCategoryModalOpen(false);
        }}
      />

      <GoalSelectModal
        currencyCode={currencyCode}
        goals={savingsGoals}
        open={goalModalOpen}
        selectedGoalId={selectedGoalId}
        onClose={() => setGoalModalOpen(false)}
        onSelect={(goalId) => {
          setSelectedGoalId(goalId);
          setGoalModalOpen(false);
        }}
      />
    </SafeAreaView>
  );
}

function GeneralResponseCard({
  currencyCode,
  response,
}: {
  currencyCode: string;
  response: GeneralAdviceResponse;
}) {
  return (
    <View style={styles.messageRow}>
      <View style={styles.aiBubbleAvatar}>
        <FontAwesome color="#FFFFFF" name="android" size={11} />
      </View>
      <View style={styles.snapshotCard}>
        <Text style={styles.snapshotTitle}>YOUR MONEY SNAPSHOT</Text>
        <MetricRow label="Net this month" tone="positive" value={formatMoney(response.context.current_month_net, currencyCode)} />
        <MetricRow label="Behavior" value={`${response.context.behavior_label} (${response.context.behavior_score})`} />
        <MetricRow label="Active goals" value={`${response.context.active_goal_count}`} />
        <MetricRow label="Savings rate" value={`${Number(response.context.savings_rate).toFixed(0)}%`} />
      </View>
    </View>
  );
}

function PurchaseResponseCard({
  currencyCode,
  response,
}: {
  currencyCode: string;
  response: PurchaseCheckResponse;
}) {
  const tone = response.verdict;

  return (
    <View style={styles.messageRow}>
      <View style={styles.aiBubbleAvatar}>
        <FontAwesome color="#FFFFFF" name="android" size={11} />
      </View>
      <View style={styles.snapshotCard}>
        <Text style={styles.snapshotTitle}>PURCHASE CHECK</Text>
        <MetricRow label="Net this month" tone="positive" value={formatMoney(response.context.current_month_net, currencyCode)} />
        <MetricRow label="Planned amount" value={formatMoney(response.context.planned_amount, currencyCode)} />
        <MetricRow label="Category" value={response.context.category_name ?? 'General'} />
        <MetricRow label="Verdict" tone={tone === 'safe' ? 'positive' : tone === 'caution' ? 'warning' : 'danger'} value={formatVerdict(response.verdict)} />
      </View>
    </View>
  );
}

function SavingsResponseCard({
  currencyCode,
  response,
}: {
  currencyCode: string;
  response: SavingsAdviceResponse;
}) {
  return (
    <View style={styles.messageRow}>
      <View style={styles.aiBubbleAvatar}>
        <FontAwesome color="#FFFFFF" name="android" size={11} />
      </View>
      <View style={styles.snapshotCard}>
        <Text style={styles.snapshotTitle}>SAVINGS SNAPSHOT</Text>
        <MetricRow label="Monthly cushion" tone="positive" value={formatMoney(response.context.comfortable_monthly_savings, currencyCode)} />
        <MetricRow label="Goals" value={`${response.context.active_goal_count}`} />
        <MetricRow label="Need / month" value={formatMoney(response.context.total_goal_monthly_required, currencyCode)} />
        <MetricRow label="Overall progress" value={`${Number(response.context.overall_goal_progress).toFixed(0)}%`} />
      </View>
    </View>
  );
}

function ModePill({
  active,
  icon,
  label,
  onPress,
}: {
  active: boolean;
  icon: React.ComponentProps<typeof FontAwesome>['name'];
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={[styles.modePill, active ? styles.modePillActive : null]}>
      <FontAwesome color={active ? '#F5F7FA' : '#7C7F8A'} name={icon} size={12} />
      <Text style={[styles.modePillText, active ? styles.modePillTextActive : null]}>{label}</Text>
    </Pressable>
  );
}

function FieldBlock({
  keyboardType,
  label,
  placeholder,
  value,
  onChangeText,
}: {
  keyboardType?: 'decimal-pad' | 'default';
  label: string;
  placeholder: string;
  value: string;
  onChangeText: (value: string) => void;
}) {
  return (
    <View style={styles.fieldBlock}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        autoCapitalize="sentences"
        autoCorrect={false}
        keyboardType={keyboardType}
        placeholder={placeholder}
        placeholderTextColor="#3A3A3A"
        selectionColor={COLORS.violet}
        style={styles.fieldInput}
        value={value}
        onChangeText={onChangeText}
      />
    </View>
  );
}

function CategorySelectModal({
  categories,
  open,
  selectedCategoryId,
  onClose,
  onSelect,
}: {
  categories: Category[];
  open: boolean;
  selectedCategoryId: string | null;
  onClose: () => void;
  onSelect: (categoryId: string) => void;
}) {
  return (
    <Modal animationType="fade" onRequestClose={onClose} transparent visible={open}>
      <Pressable onPress={onClose} style={styles.modalBackdrop}>
        <Pressable onPress={() => undefined} style={styles.modalCard}>
          <Text style={styles.modalTitle}>Choose category</Text>
          <ScrollView showsVerticalScrollIndicator={false}>
            {categories.map((category) => {
              const selected = category.id === selectedCategoryId;
              return (
                <Pressable
                  key={category.id}
                  onPress={() => onSelect(category.id)}
                  style={[styles.modalRow, selected ? styles.modalRowSelected : null]}
                >
                  <View style={styles.modalRowLeft}>
                    <FontAwesome color={category.color ?? COLORS.violetBright} name={mapCategoryIcon(category.icon)} size={14} />
                    <Text style={[styles.modalRowText, selected ? styles.modalRowTextSelected : null]}>
                      {category.effective_name ?? category.name}
                    </Text>
                  </View>
                  {selected ? <FontAwesome color={COLORS.violetBright} name="check" size={12} /> : null}
                </Pressable>
              );
            })}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function GoalSelectModal({
  currencyCode,
  goals,
  open,
  selectedGoalId,
  onClose,
  onSelect,
}: {
  currencyCode: string;
  goals: SavingsGoal[];
  open: boolean;
  selectedGoalId: string | null;
  onClose: () => void;
  onSelect: (goalId: string) => void;
}) {
  return (
    <Modal animationType="fade" onRequestClose={onClose} transparent visible={open}>
      <Pressable onPress={onClose} style={styles.modalBackdrop}>
        <Pressable onPress={() => undefined} style={styles.modalCard}>
          <Text style={styles.modalTitle}>Choose savings goal</Text>
          <ScrollView showsVerticalScrollIndicator={false}>
            {goals.map((goal) => {
              const selected = goal.id === selectedGoalId;
              return (
                <Pressable
                  key={goal.id}
                  onPress={() => onSelect(goal.id)}
                  style={[styles.modalRow, selected ? styles.modalRowSelected : null]}
                >
                  <View style={styles.modalRowLeft}>
                    <FontAwesome color={COLORS.green} name="flag" size={14} />
                    <View>
                      <Text style={[styles.modalRowText, selected ? styles.modalRowTextSelected : null]}>{goal.name}</Text>
                      <Text style={styles.modalSubText}>
                        {formatMoney(goal.current_amount, currencyCode)} / {formatMoney(goal.target_amount, currencyCode)}
                      </Text>
                    </View>
                  </View>
                  {selected ? <FontAwesome color={COLORS.violetBright} name="check" size={12} /> : null}
                </Pressable>
              );
            })}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function MetricRow({
  label,
  tone,
  value,
}: {
  label: string;
  tone?: 'danger' | 'positive' | 'warning';
  value: string;
}) {
  return (
    <View style={styles.metricRow}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text
        style={[
          styles.metricValue,
          tone === 'positive' ? styles.metricValuePositive : null,
          tone === 'warning' ? styles.metricValueWarn : null,
          tone === 'danger' ? styles.metricValueDanger : null,
        ]}
      >
        {value}
      </Text>
    </View>
  );
}

function getComposerPlaceholder(mode: AssistantMode) {
  switch (mode) {
    case 'purchase':
      return 'Ask about this purchase...';
    case 'savings':
      return 'Ask about your savings plan...';
    default:
      return 'Ask FinPilot anything...';
  }
}

function getEmptyStateCopy(mode: AssistantMode) {
  switch (mode) {
    case 'purchase':
      return 'Add an item, amount, and category, then ask whether this purchase really fits.';
    case 'savings':
      return 'Ask how to prioritize goals, how much to save, or whether your pace is realistic.';
    default:
      return 'Ask simple money questions in plain language. FinPilot will answer using your real spending, savings, and balance context.';
  }
}

function formatMoney(value: string | number, currencyCode: string) {
  const numeric = typeof value === 'number' ? value : Number(value);
  const symbol = getCurrencySymbol(currencyCode);
  if (!Number.isFinite(numeric)) {
    return currencyCode === 'USD' ? `${symbol}0` : `${symbol} 0`;
  }

  const amount = numeric.toLocaleString('en-US', {
    maximumFractionDigits: 0,
    minimumFractionDigits: 0,
  });

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

function sanitizeAmount(value: string) {
  const sanitized = value.replace(/[^0-9.]/g, '');
  const parts = sanitized.split('.');
  if (parts.length <= 2) {
    return sanitized;
  }

  return `${parts[0]}.${parts.slice(1).join('')}`;
}

function getInitials(fullName?: string | null, email?: string | null) {
  if (fullName?.trim()) {
    const parts = fullName.trim().split(/\s+/).slice(0, 2);
    return parts.map((part) => part[0]?.toUpperCase() ?? '').join('');
  }

  return (email?.[0] ?? 'F').toUpperCase();
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
    default:
      return 'tag';
  }
}

function formatVerdict(verdict: PurchaseCheckResponse['verdict']) {
  switch (verdict) {
    case 'safe':
      return 'Good to go';
    case 'caution':
      return 'Possible, but tight';
    case 'not_recommended':
    default:
      return 'Not recommended';
  }
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#0E0E0E',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingTop: 28 + screenTopClearance,
    paddingHorizontal: 18,
    paddingBottom: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: '#1E1E1E',
  },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: COLORS.violet,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerMeta: {
    flex: 1,
  },
  headerTitle: {
    color: '#F0F0F0',
    fontSize: 13,
    fontWeight: '500',
    marginBottom: 1,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.green,
  },
  statusText: {
    color: COLORS.green,
    fontSize: 10,
  },
  modeRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 14,
    paddingTop: 16,
  },
  modePill: {
    flex: 1,
    minHeight: 38,
    borderRadius: 12,
    borderWidth: 0.5,
    borderColor: '#2E2E2E',
    backgroundColor: '#161616',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
  },
  modePillActive: {
    backgroundColor: '#1A1525',
    borderColor: '#3D2F6A',
  },
  modePillText: {
    color: '#7C7F8A',
    fontSize: 11,
    fontWeight: '500',
  },
  modePillTextActive: {
    color: '#F5F7FA',
  },
  content: {
    paddingHorizontal: 14,
    paddingTop: 18,
    paddingBottom: 12,
  },
  emptyState: {
    minHeight: 220,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
    paddingBottom: 10,
  },
  emptyIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#1A1525',
    borderWidth: 0.5,
    borderColor: '#3D2F6A',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  emptyTitle: {
    color: '#F0F0F0',
    fontSize: 13,
    fontWeight: '500',
    marginBottom: 4,
  },
  emptyText: {
    color: '#555555',
    fontSize: 11,
    lineHeight: 17,
    textAlign: 'center',
  },
  chatBody: {
    gap: 10,
    paddingBottom: 12,
  },
  timestamp: {
    color: '#444444',
    fontSize: 9,
    textAlign: 'center',
  },
  turnBlock: {
    gap: 10,
  },
  messageRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-end',
  },
  messageRowUser: {
    justifyContent: 'flex-end',
  },
  userAvatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#272727',
    alignItems: 'center',
    justifyContent: 'center',
  },
  userAvatarText: {
    color: '#AAAAAA',
    fontSize: 10,
    fontWeight: '600',
  },
  aiBubbleAvatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: COLORS.violet,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chatBubble: {
    maxWidth: 228,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  userBubble: {
    backgroundColor: '#272727',
    borderWidth: 0.5,
    borderColor: '#333333',
    borderBottomRightRadius: 4,
  },
  aiBubble: {
    backgroundColor: '#1A1525',
    borderWidth: 0.5,
    borderColor: '#3D2F6A',
    borderBottomLeftRadius: 4,
  },
  userBubbleText: {
    color: '#E0E0E0',
    fontSize: 11,
    lineHeight: 17,
  },
  aiBubbleText: {
    color: '#C4B5FD',
    fontSize: 11,
    lineHeight: 17,
  },
  snapshotCard: {
    maxWidth: 238,
    backgroundColor: '#1A1525',
    borderWidth: 0.5,
    borderColor: '#3D2F6A',
    borderRadius: 14,
    borderBottomLeftRadius: 4,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  snapshotTitle: {
    color: '#9B72F5',
    fontSize: 10,
    fontWeight: '500',
    marginBottom: 7,
  },
  metricRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  metricLabel: {
    color: '#9B72F5',
    fontSize: 10,
    flex: 1,
    paddingRight: 10,
  },
  metricValue: {
    color: '#DDDDDD',
    fontSize: 11,
    fontWeight: '500',
    maxWidth: 130,
    textAlign: 'right',
  },
  metricValuePositive: {
    color: COLORS.green,
  },
  metricValueWarn: {
    color: COLORS.amber,
  },
  metricValueDanger: {
    color: COLORS.danger,
  },
  detailsCard: {
    backgroundColor: '#161616',
    borderWidth: 0.5,
    borderColor: '#272727',
    borderRadius: 12,
    paddingHorizontal: 13,
    paddingVertical: 12,
    marginBottom: 12,
  },
  detailsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  detailsHelper: {
    color: '#555555',
    fontSize: 9,
  },
  sectionLabel: {
    color: '#555555',
    fontSize: 10,
    letterSpacing: 0.4,
  },
  detailsGrid: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  fieldBlock: {
    flex: 1,
    marginBottom: 10,
  },
  fieldLabel: {
    color: '#555555',
    fontSize: 10,
    letterSpacing: 0.4,
    marginBottom: 6,
  },
  fieldInput: {
    minHeight: 42,
    borderRadius: 10,
    borderWidth: 0.5,
    borderColor: '#2E2E2E',
    backgroundColor: '#101014',
    color: '#E0E0E0',
    fontSize: 13,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  selectorButton: {
    minHeight: 42,
    borderRadius: 10,
    borderWidth: 0.5,
    borderColor: '#2E2E2E',
    backgroundColor: '#101014',
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  selectorTextWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  selectorText: {
    color: '#E0E0E0',
    fontSize: 13,
    flex: 1,
  },
  quickPromptsSection: {
    marginBottom: 10,
  },
  quickPromptList: {
    gap: 6,
    marginTop: 7,
  },
  promptChip: {
    backgroundColor: '#161616',
    borderWidth: 0.5,
    borderColor: '#272727',
    borderRadius: 10,
    paddingHorizontal: 11,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  promptText: {
    color: '#BBBBBB',
    fontSize: 11,
    flex: 1,
    lineHeight: 16,
  },
  errorCard: {
    backgroundColor: 'rgba(240,106,99,0.12)',
    borderWidth: 0.5,
    borderColor: 'rgba(240,106,99,0.28)',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 10,
  },
  errorText: {
    color: COLORS.danger,
    fontSize: 12,
    lineHeight: 18,
  },
  composerRow: {
    borderTopWidth: 0.5,
    borderTopColor: '#1E1E1E',
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 20,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    backgroundColor: '#0E0E0E',
  },
  composerInput: {
    flex: 1,
    minHeight: 42,
    maxHeight: 110,
    backgroundColor: '#161616',
    borderWidth: 0.5,
    borderColor: '#2E2E2E',
    borderRadius: 22,
    color: '#E0E0E0',
    fontSize: 12,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 10,
  },
  sendButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.violet,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: {
    opacity: 0.45,
  },
  typingBubble: {
    backgroundColor: '#1A1525',
    borderWidth: 0.5,
    borderColor: '#3D2F6A',
    borderRadius: 14,
    borderBottomLeftRadius: 4,
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: 'row',
    gap: 5,
    alignItems: 'center',
  },
  typingDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.violet,
    opacity: 0.55,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    justifyContent: 'center',
    paddingHorizontal: 22,
  },
  modalCard: {
    backgroundColor: '#16161A',
    borderWidth: 0.5,
    borderColor: '#2C2C33',
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 16,
    maxHeight: 420,
  },
  modalTitle: {
    color: '#F5F7FA',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
  },
  modalRow: {
    minHeight: 50,
    borderRadius: 10,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  modalRowSelected: {
    backgroundColor: '#1A1525',
  },
  modalRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  modalRowText: {
    color: '#E0E0E0',
    fontSize: 13,
  },
  modalSubText: {
    color: '#7C7F8A',
    fontSize: 10,
    marginTop: 2,
  },
  modalRowTextSelected: {
    color: '#C4B5FD',
  },
});

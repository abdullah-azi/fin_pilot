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

import { authPalette } from '@/constants/theme';
import {
  purchaseCheck,
  savingsAdvice,
  type PurchaseCheckResponse,
  type SavingsAdviceResponse,
} from '@/lib/api/ai';
import { getCategories, type Category } from '@/lib/api/categories';
import { ApiError } from '@/lib/api/client';
import { listSavingsGoals, type SavingsGoal } from '@/lib/api/savings-goals';
import { useAuth } from '@/providers/AuthProvider';

const COLORS = authPalette;

type AssistantMode = 'purchase' | 'savings';

type PromptPreset = {
  amount?: string;
  itemName?: string;
  label: string;
  mode: AssistantMode;
  question: string;
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

type ConversationTurn = PurchaseConversationTurn | SavingsConversationTurn;

const QUICK_PROMPTS: Record<AssistantMode, PromptPreset[]> = {
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
    {
      amount: '5800',
      itemName: 'monthly installment',
      label: 'Would installments be safer for this purchase?',
      mode: 'purchase',
      question: 'Would installments be a safer option for this purchase?',
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
  const [mode, setMode] = useState<AssistantMode>('purchase');
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
      return (
        question.trim().length > 0 &&
        itemName.trim().length > 0 &&
        Number(plannedAmount) > 0
      );
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
    if (prompt.itemName) {
      setItemName(prompt.itemName);
    }
    if (prompt.amount) {
      setPlannedAmount(prompt.amount);
    }
    setError(null);
  }

  async function handleSubmit() {
    if (!canSubmit) {
      setError(
        mode === 'purchase'
          ? 'Add an item, amount, and question first.'
          : 'Enter a savings question first.',
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

      if (mode === 'purchase') {
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
        <Pressable style={styles.headerAction}>
          <FontAwesome color="#555555" name="ellipsis-v" size={16} />
        </Pressable>
      </View>

      <View style={styles.modeRow}>
        <ModePill
          active={mode === 'purchase'}
          icon="shopping-cart"
          label="Purchase check"
          onPress={() => {
            setError(null);
            setMode('purchase');
          }}
        />
        <ModePill
          active={mode === 'savings'}
          icon="money"
          label="Savings advice"
          onPress={() => {
            setError(null);
            setMode('savings');
          }}
        />
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {conversation.length === 0 ? (
          <View style={styles.emptyState}>
            <View style={styles.emptyIcon}>
              <FontAwesome color={COLORS.violet} name="android" size={24} />
            </View>
            <Text style={styles.emptyTitle}>Ask me anything</Text>
            <Text style={styles.emptyText}>
              {mode === 'purchase'
                ? 'I know your income, spending, and habits. Start with a purchase question and I will check if it fits.'
                : 'I know your goals, monthly cushion, and savings pressure. Ask how to prioritize or pace your savings.'}
            </Text>
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

                {turn.kind === 'purchase' ? (
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
              <Text style={styles.detailsHelper}>Used for grounded AI answers</Text>
            </View>

            <View style={styles.detailsGrid}>
              <View style={styles.fieldBlock}>
                <Text style={styles.fieldLabel}>ITEM</Text>
                <TextInput
                  autoCapitalize="sentences"
                  autoCorrect={false}
                  placeholder="New phone"
                  placeholderTextColor="#3A3A3A"
                  selectionColor={COLORS.violet}
                  style={styles.fieldInput}
                  value={itemName}
                  onChangeText={setItemName}
                />
              </View>

              <View style={styles.fieldBlock}>
                <Text style={styles.fieldLabel}>AMOUNT ({currencyCode})</Text>
                <TextInput
                  keyboardType="decimal-pad"
                  placeholder="65000"
                  placeholderTextColor="#3A3A3A"
                  selectionColor={COLORS.violet}
                  style={styles.fieldInput}
                  value={plannedAmount}
                  onChangeText={(value) => setPlannedAmount(sanitizeAmount(value))}
                />
              </View>
            </View>

            <View style={styles.fieldBlock}>
              <Text style={styles.fieldLabel}>CATEGORY</Text>
              <Pressable
                disabled={isLoadingData}
                onPress={() => setCategoryModalOpen(true)}
                style={styles.selectorButton}
              >
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
        ) : (
          <View style={styles.detailsCard}>
            <View style={styles.detailsHeader}>
              <Text style={styles.sectionLabel}>SAVINGS CONTEXT</Text>
              <Text style={styles.detailsHelper}>Optional goal focus for sharper advice</Text>
            </View>

            <View style={styles.fieldBlock}>
              <Text style={styles.fieldLabel}>FOCUS GOAL</Text>
              <Pressable
                disabled={isLoadingData}
                onPress={() => setGoalModalOpen(true)}
                style={styles.selectorButton}
              >
                <View style={styles.selectorTextWrap}>
                  <FontAwesome color={COLORS.green} name="flag" size={14} />
                  <Text style={styles.selectorText}>
                    {selectedGoal?.name ?? 'Ask about all active goals'}
                  </Text>
                </View>
                {isLoadingData ? (
                  <ActivityIndicator color={COLORS.violetBright} size="small" />
                ) : (
                  <FontAwesome color="#555555" name="chevron-down" size={12} />
                )}
              </Pressable>
            </View>

            <View style={styles.infoCard}>
              <MetricRow label="Active goals" value={`${savingsGoals.length}`} />
              <MetricRow
                label="Selected target"
                value={
                  selectedGoal
                    ? `${formatMoney(selectedGoal.current_amount, currencyCode)} / ${formatMoney(selectedGoal.target_amount, currencyCode)}`
                    : 'All goals'
                }
              />
              <MetricRow
                label="Deadline"
                value={selectedGoal?.target_date ? formatShortDate(selectedGoal.target_date) : 'No target date'}
              />
            </View>
          </View>
        )}

        <View style={styles.quickPromptsSection}>
          <Text style={styles.sectionLabel}>SUGGESTED QUESTIONS</Text>
          <View style={styles.quickPromptList}>
            {QUICK_PROMPTS[mode].map((prompt) => (
              <Pressable key={prompt.label} onPress={() => applyPrompt(prompt)} style={styles.promptChip}>
                <FontAwesome
                  color={mode === 'purchase' ? COLORS.violetBright : COLORS.green}
                  name={mode === 'purchase' ? 'commenting' : 'money'}
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
        <Pressable style={styles.micButton}>
          <FontAwesome color="#666666" name="microphone" size={14} />
        </Pressable>
        <TextInput
          autoCapitalize="sentences"
          autoCorrect={false}
          multiline
          placeholder={mode === 'purchase' ? 'Ask about this purchase...' : 'Ask about your savings plan...'}
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

function PurchaseResponseCard({
  currencyCode,
  response,
}: {
  currencyCode: string;
  response: PurchaseCheckResponse;
}) {
  return (
    <View style={styles.messageRow}>
      <View style={styles.aiBubbleAvatar}>
        <FontAwesome color="#FFFFFF" name="android" size={11} />
      </View>
      <View style={styles.snapshotCard}>
        <Text style={styles.snapshotTitle}>YOUR FINANCIAL SNAPSHOT</Text>
        <MetricRow
          label="Balance right now"
          tone="positive"
          value={formatMoney(response.context.current_month_net, currencyCode)}
        />
        <MetricRow
          label="Spent this month"
          tone="warning"
          value={formatMoney(response.context.current_month_expense, currencyCode)}
        />
        <MetricRow
          label="Goal pressure"
          value={`${response.context.active_goal_count} active · ${formatMoney(response.context.total_goal_monthly_required, currencyCode)}/mo`}
        />
        <MetricRow
          label="After this purchase"
          tone={response.verdict === 'safe' ? 'positive' : 'danger'}
          value={formatMoney(
            (
              Number(response.context.current_month_net) - Number(response.context.planned_amount)
            ).toFixed(2),
            currencyCode,
          )}
        />

        {response.context.category_budget_limit ? (
          <>
            <View style={styles.snapshotDivider} />
            <MetricRow
              label={`${response.context.category_name ?? 'Category'} budget`}
              value={`${formatMoney(response.context.current_category_spend ?? '0', currencyCode)} / ${formatMoney(response.context.category_budget_limit, currencyCode)}`}
            />
          </>
        ) : null}

        <VerdictCallout
          copy={response.context.suggested_action}
          tone={response.verdict}
          title={formatVerdict(response.verdict)}
        />
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
  const tone = response.context.can_fund_all_goals_on_time ? 'safe' : 'caution';

  return (
    <View style={styles.messageRow}>
      <View style={styles.aiBubbleAvatar}>
        <FontAwesome color="#FFFFFF" name="android" size={11} />
      </View>
      <View style={styles.snapshotCard}>
        <Text style={styles.snapshotTitle}>YOUR SAVINGS SNAPSHOT</Text>
        <MetricRow
          label="Balance right now"
          tone="positive"
          value={formatMoney(response.context.current_month_net, currencyCode)}
        />
        <MetricRow
          label="Comfortable to save"
          tone="positive"
          value={`${formatMoney(response.context.comfortable_monthly_savings, currencyCode)}/mo`}
        />
        <MetricRow
          label="Goals this month"
          tone={response.context.can_fund_all_goals_on_time ? 'positive' : 'warning'}
          value={`${formatMoney(response.context.total_goal_monthly_required, currencyCode)}/mo`}
        />
        <MetricRow
          label="Overall progress"
          value={`${Number(response.context.overall_goal_progress).toFixed(0)}%`}
        />

        {response.context.focus_goal_name ? (
          <>
            <View style={styles.snapshotDivider} />
            <MetricRow label="Focus goal" value={response.context.focus_goal_name} />
            <MetricRow
              label="Required pace"
              value={`${formatMoney(response.context.focus_goal_monthly_required ?? '0', currencyCode)}/mo`}
            />
            <MetricRow
              label="Pace status"
              tone={mapPaceTone(response.context.focus_goal_pace_status)}
              value={formatPaceStatus(response.context.focus_goal_pace_status)}
            />
          </>
        ) : null}

        <VerdictCallout
          copy={response.context.recommendation_text}
          tone={tone}
          title={tone === 'safe' ? 'Plan looks solid' : 'Needs prioritizing'}
        />

        {response.context.allocations.length > 0 ? (
          <View style={styles.allocationWrap}>
            {response.context.allocations.slice(0, 2).map((allocation) => (
              <View key={allocation.goal_id} style={styles.allocationChip}>
                <Text style={styles.allocationTitle}>{allocation.name}</Text>
                <Text style={styles.allocationValue}>
                  {formatMoney(allocation.recommended_monthly_contribution, currencyCode)}/mo
                </Text>
              </View>
            ))}
          </View>
        ) : null}
      </View>
    </View>
  );
}

function VerdictCallout({
  copy,
  title,
  tone,
}: {
  copy: string;
  title: string;
  tone: 'caution' | 'not_recommended' | 'safe';
}) {
  return (
    <View
      style={[
        styles.verdictCard,
        tone === 'safe'
          ? styles.verdictSafe
          : tone === 'caution'
            ? styles.verdictWarn
            : styles.verdictDanger,
      ]}
    >
      <FontAwesome
        color={tone === 'safe' ? COLORS.green : tone === 'caution' ? COLORS.amber : COLORS.danger}
        name={getVerdictIcon(tone)}
        size={14}
      />
      <Text
        style={[
          styles.verdictText,
          tone === 'safe'
            ? styles.verdictTextSafe
            : tone === 'caution'
              ? styles.verdictTextWarn
              : styles.verdictTextDanger,
        ]}
      >
        <Text style={styles.verdictStrong}>{title}. </Text>
        {copy}
      </Text>
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
                    <FontAwesome
                      color={category.color ?? COLORS.violetBright}
                      name={mapCategoryIcon(category.icon)}
                      size={14}
                    />
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
                      <Text style={[styles.modalRowText, selected ? styles.modalRowTextSelected : null]}>
                        {goal.name}
                      </Text>
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

function formatMoney(value: string | number, currencyCode: string) {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) {
    return `${currencyCode} 0`;
  }

  return `${currencyCode} ${numeric.toLocaleString('en-US', {
    maximumFractionDigits: 0,
    minimumFractionDigits: 0,
  })}`;
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

function getVerdictIcon(verdict: PurchaseCheckResponse['verdict'] | 'safe' | 'caution' | 'not_recommended') {
  switch (verdict) {
    case 'safe':
      return 'check-circle';
    case 'caution':
      return 'warning';
    case 'not_recommended':
    default:
      return 'times-circle';
  }
}

function formatPaceStatus(status: SavingsAdviceResponse['context']['focus_goal_pace_status']) {
  switch (status) {
    case 'on_track':
      return 'On track';
    case 'behind':
      return 'Behind';
    case 'at_risk':
      return 'At risk';
    default:
      return 'N/A';
  }
}

function mapPaceTone(status: SavingsAdviceResponse['context']['focus_goal_pace_status']) {
  switch (status) {
    case 'on_track':
      return 'positive' as const;
    case 'behind':
      return 'warning' as const;
    case 'at_risk':
      return 'danger' as const;
    default:
      return undefined;
  }
}

function formatShortDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString('en-US', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
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
    paddingTop: 18,
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
  headerAction: {
    width: 24,
    alignItems: 'flex-end',
  },
  modeRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 14,
    paddingTop: 12,
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
    paddingTop: 14,
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
  snapshotDivider: {
    height: 0.5,
    backgroundColor: '#3D2F6A',
    marginVertical: 7,
  },
  verdictCard: {
    marginTop: 8,
    borderRadius: 8,
    borderWidth: 0.5,
    paddingHorizontal: 9,
    paddingVertical: 8,
    flexDirection: 'row',
    gap: 6,
    alignItems: 'flex-start',
  },
  verdictSafe: {
    backgroundColor: '#0D1A12',
    borderColor: '#1A3D22',
  },
  verdictWarn: {
    backgroundColor: '#1F1A0E',
    borderColor: '#3D2F0D',
  },
  verdictDanger: {
    backgroundColor: '#1A0F0F',
    borderColor: '#3D1A1A',
  },
  verdictText: {
    flex: 1,
    fontSize: 10,
    lineHeight: 15,
  },
  verdictTextSafe: {
    color: '#4A8C5C',
  },
  verdictTextWarn: {
    color: '#7A5C1E',
  },
  verdictTextDanger: {
    color: '#A85A5A',
  },
  verdictStrong: {
    color: '#F0F0F0',
    fontWeight: '500',
  },
  allocationWrap: {
    gap: 6,
    marginTop: 8,
  },
  allocationChip: {
    borderRadius: 8,
    borderWidth: 0.5,
    borderColor: '#3D2F6A',
    backgroundColor: 'rgba(124,58,237,0.08)',
    paddingHorizontal: 9,
    paddingVertical: 8,
  },
  allocationTitle: {
    color: '#D7D4F5',
    fontSize: 10,
    fontWeight: '600',
    marginBottom: 2,
  },
  allocationValue: {
    color: '#BDB6EB',
    fontSize: 10,
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
  infoCard: {
    borderRadius: 10,
    borderWidth: 0.5,
    borderColor: '#272727',
    backgroundColor: '#101014',
    paddingHorizontal: 12,
    paddingVertical: 10,
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
  micButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#1E1E1E',
    borderWidth: 0.5,
    borderColor: '#2E2E2E',
    alignItems: 'center',
    justifyContent: 'center',
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

import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useIsFocused } from '@react-navigation/native';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
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

import { authPalette, screenTopClearance, typography } from '@/constants/theme';
import { ApiError } from '@/lib/api/client';
import {
  createSavingsGoal,
  deleteSavingsGoal,
  getSavingsGoalRecommendation,
  getSavingsGoalSummary,
  listSavingsGoals,
  projectSavingsGoal,
  updateSavingsGoal,
  type SavingsGoal,
  type SavingsGoalProjection,
  type SavingsGoalRecommendation,
  type SavingsGoalSummary,
} from '@/lib/api/savings-goals';
import { useAuth } from '@/providers/AuthProvider';

const COLORS = authPalette;

type GoalDraft = {
  currentAmount: string;
  monthlyContribution: string;
  name: string;
  priority: 'high' | 'low' | 'medium';
  targetAmount: string;
  targetDate: string;
};

const EMPTY_DRAFT: GoalDraft = {
  currentAmount: '',
  monthlyContribution: '',
  name: '',
  priority: 'medium',
  targetAmount: '',
  targetDate: '',
};

export default function SavingsGoalsScreen() {
  const { getValidAccessToken, user } = useAuth();
  const isFocused = useIsFocused();
  const params = useLocalSearchParams<{ create?: string }>();
  const [goals, setGoals] = useState<SavingsGoal[]>([]);
  const [summary, setSummary] = useState<SavingsGoalSummary | null>(null);
  const [recommendation, setRecommendation] = useState<SavingsGoalRecommendation | null>(null);
  const [projection, setProjection] = useState<SavingsGoalProjection | null>(null);
  const [draft, setDraft] = useState<GoalDraft>(EMPTY_DRAFT);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isProjecting, setIsProjecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingGoal, setEditingGoal] = useState<SavingsGoal | null>(null);
  const [goalActionBusyId, setGoalActionBusyId] = useState<string | null>(null);

  useEffect(() => {
    if (isFocused) {
      void loadSavingsData();
    }
  }, [isFocused]);

  useEffect(() => {
    if (params.create === '1') {
      setModalOpen(true);
    }
  }, [params.create]);

  useEffect(() => {
    if (!modalOpen) {
      return;
    }

    const targetAmount = Number(draft.targetAmount);
    const currentAmount = Number(draft.currentAmount || '0');
    const targetDate = draft.targetDate.trim();

    if (!draft.name.trim() || !Number.isFinite(targetAmount) || targetAmount <= 0 || !targetDate) {
      setProjection(null);
      return;
    }

    const timeout = setTimeout(() => {
      void refreshProjection({
        target_amount: targetAmount,
        current_amount: Number.isFinite(currentAmount) ? currentAmount : 0,
        target_date: targetDate,
        monthly_contribution: draft.monthlyContribution.trim()
          ? Number(draft.monthlyContribution)
          : null,
      });
    }, 250);

    return () => clearTimeout(timeout);
  }, [draft, modalOpen]);

  const currencyCode = (user?.currency ?? 'PKR').toUpperCase();
  const activeGoalCards = summary?.goals ?? [];

  const sortedGoals = useMemo(() => {
    return [...activeGoalCards].sort((left, right) => {
      const urgencyScore = { at_risk: 0, behind: 1, on_track: 2 };
      return urgencyScore[left.pace_status] - urgencyScore[right.pace_status];
    });
  }, [activeGoalCards]);
  const inactiveGoals = useMemo(
    () => goals.filter((goal) => goal.status !== 'active'),
    [goals],
  );

  async function loadSavingsData() {
    setIsLoading(true);
    setError(null);

    try {
      const accessToken = await getValidAccessToken();
      if (!accessToken) {
        throw new Error('Your session expired. Please log in again.');
      }

      const [goalList, summaryResult, recommendationResult] = await Promise.all([
        listSavingsGoals(accessToken),
        getSavingsGoalSummary(accessToken),
        getSavingsGoalRecommendation(accessToken),
      ]);

      setGoals(goalList);
      setSummary(summaryResult);
      setRecommendation(recommendationResult);
    } catch (caughtError) {
      if (caughtError instanceof ApiError) {
        setError(caughtError.message);
      } else {
        setError(caughtError instanceof Error ? caughtError.message : 'Could not load savings goals.');
      }
    } finally {
      setIsLoading(false);
    }
  }

  async function refreshProjection(payload: {
    current_amount: number;
    monthly_contribution: number | null;
    target_amount: number;
    target_date: string;
  }) {
    setIsProjecting(true);
    try {
      const accessToken = await getValidAccessToken();
      if (!accessToken) {
        throw new Error('Your session expired. Please log in again.');
      }

      const result = await projectSavingsGoal(accessToken, payload);
      setProjection(result);
    } catch {
      setProjection(null);
    } finally {
      setIsProjecting(false);
    }
  }

  async function handleCreateGoal() {
    const name = draft.name.trim();
    const targetAmount = Number(draft.targetAmount);
    const currentAmount = Number(draft.currentAmount || '0');
    const targetDate = draft.targetDate.trim();

    if (!name || !Number.isFinite(targetAmount) || targetAmount <= 0 || !targetDate) {
      setError('Enter a goal name, target amount, and target date first.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const accessToken = await getValidAccessToken();
      if (!accessToken) {
        throw new Error('Your session expired. Please log in again.');
      }

      if (editingGoal) {
        await updateSavingsGoal(accessToken, editingGoal.id, {
          name,
          target_amount: targetAmount,
          current_amount: Number.isFinite(currentAmount) ? currentAmount : 0,
          target_date: targetDate,
          priority: draft.priority,
          status: editingGoal.status,
        });
      } else {
        await createSavingsGoal(accessToken, {
          name,
          target_amount: targetAmount,
          current_amount: Number.isFinite(currentAmount) ? currentAmount : 0,
          target_date: targetDate,
          priority: draft.priority,
          status: 'active',
        });
      }

      setDraft(EMPTY_DRAFT);
      setProjection(null);
      setModalOpen(false);
      setEditingGoal(null);
      await loadSavingsData();
    } catch (caughtError) {
      if (caughtError instanceof ApiError) {
        setError(caughtError.message);
      } else {
        setError(
          caughtError instanceof Error
            ? caughtError.message
            : editingGoal
              ? 'Could not update goal.'
              : 'Could not create goal.',
        );
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  function openCreateGoal() {
    setEditingGoal(null);
    setDraft(EMPTY_DRAFT);
    setProjection(null);
    setError(null);
    setModalOpen(true);
  }

  function openEditGoal(goal: SavingsGoal) {
    setEditingGoal(goal);
    setDraft({
      currentAmount: goal.current_amount === '0.00' ? '' : String(Number(goal.current_amount)),
      monthlyContribution: '',
      name: goal.name,
      priority: goal.priority,
      targetAmount: String(Number(goal.target_amount)),
      targetDate: goal.target_date ?? '',
    });
    setProjection(null);
    setError(null);
    setModalOpen(true);
  }

  async function handleGoalStatusUpdate(
    goal: SavingsGoal,
    status: SavingsGoal['status'],
  ) {
    setGoalActionBusyId(goal.id);
    setError(null);

    try {
      const accessToken = await getValidAccessToken();
      if (!accessToken) {
        throw new Error('Your session expired. Please log in again.');
      }

      await updateSavingsGoal(accessToken, goal.id, { status });
      await loadSavingsData();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Could not update goal status.');
    } finally {
      setGoalActionBusyId(null);
    }
  }

  function confirmDeleteGoal(goal: SavingsGoal) {
    Alert.alert(
      'Delete goal',
      `Delete "${goal.name}" permanently?`,
      [
        { style: 'cancel', text: 'Cancel' },
        {
          style: 'destructive',
          text: 'Delete',
          onPress: () => {
            void handleDeleteGoal(goal);
          },
        },
      ],
    );
  }

  async function handleDeleteGoal(goal: SavingsGoal) {
    setGoalActionBusyId(goal.id);
    setError(null);

    try {
      const accessToken = await getValidAccessToken();
      if (!accessToken) {
        throw new Error('Your session expired. Please log in again.');
      }

      await deleteSavingsGoal(accessToken, goal.id);
      if (editingGoal?.id === goal.id) {
        setModalOpen(false);
        setEditingGoal(null);
        setDraft(EMPTY_DRAFT);
        setProjection(null);
      }
      await loadSavingsData();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Could not delete goal.');
    } finally {
      setGoalActionBusyId(null);
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <View>
            <Text style={styles.headerTitle}>Savings goals</Text>
            <Text style={styles.headerSubtitle}>
              {summary
                ? `${summary.active_goal_count} active goals | ${summary.period_label}`
                : 'Plan what matters next'}
            </Text>
          </View>
          <Pressable onPress={openCreateGoal} style={styles.addButton}>
            <FontAwesome color="#9B72F5" name="plus" size={13} />
            <Text style={styles.addButtonText}>New goal</Text>
          </Pressable>
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
              <Pressable onPress={() => void loadSavingsData()} style={styles.retryButton}>
                <Text style={styles.retryButtonText}>Retry</Text>
              </Pressable>
            </View>
          ) : null}

          {!isLoading && !error ? (
            <>
              <View style={styles.summaryStrip}>
                <SummaryCard label="total saved" tone="green" value={formatCompactMoney(summary?.total_saved ?? '0', currencyCode)} />
                <SummaryCard label="total target" tone="neutral" value={formatCompactMoney(summary?.total_target ?? '0', currencyCode)} />
                <SummaryCard
                  label="overall progress"
                  tone="violet"
                  value={`${Math.round(Number(summary?.overall_progress ?? '0'))}%`}
                />
              </View>

              <View style={styles.aiSuggestion}>
                <View style={styles.aiSuggestionTop}>
                  <FontAwesome color={COLORS.violet} name="android" size={15} />
                  <Text style={styles.aiSuggestionTitle}>FinPilot recommendation</Text>
                </View>
                <Text style={styles.aiSuggestionBody}>
                  {recommendation?.recommendation_text ??
                    'Add your first active savings goal to get a monthly allocation plan.'}
                </Text>
                <View style={styles.aiChipRow}>
                  <Chip label={`Comfortable ${formatMoney(recommendation?.comfortable_monthly_savings ?? '0', currencyCode)}/mo`} />
                  <Chip label={`Need ${formatMoney(recommendation?.total_monthly_required ?? '0', currencyCode)}/mo`} />
                </View>
              </View>

              <View style={styles.sectionHead}>
                <Text style={styles.sectionTitle}>Active goals</Text>
              </View>

              {sortedGoals.length ? (
                sortedGoals.map((goal) => (
                  <GoalCard
                    key={goal.goal_id}
                    actionBusy={goalActionBusyId === goal.goal_id}
                    currencyCode={currencyCode}
                    goal={goal}
                    goalRecord={goals.find((item) => item.id === goal.goal_id) ?? null}
                    onComplete={(goalRecord) => {
                      void handleGoalStatusUpdate(goalRecord, 'completed');
                    }}
                    onDelete={confirmDeleteGoal}
                    onEdit={openEditGoal}
                    onPause={(goalRecord) => {
                      void handleGoalStatusUpdate(goalRecord, 'paused');
                    }}
                  />
                ))
              ) : (
                <EmptyBlock copy="Create your first goal to start tracking progress and monthly pace." />
              )}

              {inactiveGoals.length ? (
                <>
                  <View style={styles.sectionHead}>
                    <Text style={styles.sectionTitle}>Paused & completed</Text>
                  </View>
                  {inactiveGoals.map((goal) => (
                    <InactiveGoalCard
                      key={goal.id}
                      actionBusy={goalActionBusyId === goal.id}
                      currencyCode={currencyCode}
                      goal={goal}
                      onComplete={(goalRecord) => {
                        void handleGoalStatusUpdate(goalRecord, 'completed');
                      }}
                      onDelete={confirmDeleteGoal}
                      onEdit={openEditGoal}
                    />
                  ))}
                </>
              ) : null}

              <Pressable onPress={openCreateGoal} style={styles.addGoalCard}>
                <View style={styles.addGoalIcon}>
                  <FontAwesome color={COLORS.violet} name="plus" size={18} />
                </View>
                <Text style={styles.addGoalText}>Add another goal</Text>
                <Text style={styles.addGoalSub}>Wedding, car, education...</Text>
              </Pressable>
            </>
          ) : null}
        </View>
      </ScrollView>

      <GoalModal
        currencyCode={currencyCode}
        draft={draft}
        isProjecting={isProjecting}
        isSubmitting={isSubmitting}
        open={modalOpen}
        projection={projection}
        onChange={(nextDraft) => setDraft((current) => ({ ...current, ...nextDraft }))}
        onClose={() => {
          setModalOpen(false);
          setProjection(null);
          setDraft(EMPTY_DRAFT);
          setEditingGoal(null);
        }}
        editingGoal={editingGoal}
        onSubmit={() => void handleCreateGoal()}
      />
    </SafeAreaView>
  );
}

function SummaryCard({
  label,
  tone,
  value,
}: {
  label: string;
  tone: 'green' | 'neutral' | 'violet';
  value: string;
}) {
  return (
    <View style={styles.summaryCard}>
      <Text
        style={[
          styles.summaryValue,
          tone === 'green' ? styles.summaryValueGreen : null,
          tone === 'violet' ? styles.summaryValueViolet : null,
        ]}
      >
        {value}
      </Text>
      <Text style={styles.summaryLabel}>{label}</Text>
    </View>
  );
}

function Chip({ label }: { label: string }) {
  return (
    <View style={styles.aiChip}>
      <Text style={styles.aiChipText}>{label}</Text>
    </View>
  );
}

function GoalCard({
  actionBusy,
  currencyCode,
  goal,
  goalRecord,
  onComplete,
  onDelete,
  onEdit,
  onPause,
}: {
  actionBusy: boolean;
  currencyCode: string;
  goal: SavingsGoalSummary['goals'][number];
  goalRecord: SavingsGoal | null;
  onComplete: (goal: SavingsGoal) => void;
  onDelete: (goal: SavingsGoal) => void;
  onEdit: (goal: SavingsGoal) => void;
  onPause: (goal: SavingsGoal) => void;
}) {
  const iconName = inferGoalIcon(goal.name);
  const iconMeta = getGoalTone(goal.pace_status);

  return (
    <View style={[styles.goalCard, iconMeta.cardBorder]}>
      <View style={styles.goalTop}>
        <View style={[styles.goalIcon, iconMeta.iconBackground]}>
          <FontAwesome color={iconMeta.iconColor} name={iconName} size={17} />
        </View>
        <View style={styles.goalMeta}>
          <Text style={styles.goalName}>{goal.name}</Text>
          <Text style={styles.goalDate}>
            Target: {goal.target_date ? formatTargetDate(goal.target_date) : 'No date'}
          </Text>
        </View>
        <View style={[styles.goalBadge, iconMeta.badgeBackground]}>
          <Text style={[styles.goalBadgeText, { color: iconMeta.iconColor }]}>{goal.pace_label}</Text>
        </View>
      </View>

      <View style={styles.goalAmounts}>
        <Text style={styles.goalSaved}>{formatMoney(goal.current_amount, currencyCode)}</Text>
        <Text style={styles.goalTarget}>of {formatMoney(goal.target_amount, currencyCode)}</Text>
        <Text style={[styles.goalPct, { color: iconMeta.iconColor }]}>
          {Math.round(Number(goal.progress_percentage))}%
        </Text>
      </View>

      <View style={styles.progressBg}>
        <View
          style={[
            styles.progressFill,
            {
              backgroundColor: iconMeta.iconColor,
              width: `${Math.max(6, Math.min(100, Number(goal.progress_percentage)))}%`,
            },
          ]}
        />
      </View>

      <View style={styles.goalFooter}>
        <Text style={styles.goalPace}>
          {goal.shortfall_amount !== '0.00' && goal.pace_status === 'at_risk' ? 'Need ' : 'Save '}
          <Text style={[styles.goalPaceStrong, goal.pace_status === 'at_risk' ? styles.goalPaceStrongDanger : null]}>
            {formatMoney(goal.monthly_required, currencyCode)}/mo
          </Text>
          {goal.pace_status === 'at_risk' ? ' - too aggressive' : ' to hit target'}
        </Text>
        {goalRecord ? (
          <Pressable onPress={() => onEdit(goalRecord)} style={styles.goalActionButton}>
            <Text style={styles.goalAction}>
              <FontAwesome color={COLORS.violet} name="pencil" size={11} /> Edit
            </Text>
          </Pressable>
        ) : null}
      </View>

      {goalRecord?.description ? (
        <Text style={styles.goalDescription}>{goalRecord.description}</Text>
      ) : null}

      {goalRecord ? (
        <View style={styles.goalActionRow}>
          <ActionChip
            disabled={actionBusy}
            icon="pause"
            label="Pause"
            onPress={() => onPause(goalRecord)}
            tone="muted"
          />
          <ActionChip
            disabled={actionBusy}
            icon="check"
            label="Complete"
            onPress={() => onComplete(goalRecord)}
            tone="positive"
          />
          <ActionChip
            disabled={actionBusy}
            icon="trash"
            label="Delete"
            onPress={() => onDelete(goalRecord)}
            tone="danger"
          />
        </View>
      ) : null}
    </View>
  );
}

function InactiveGoalCard({
  actionBusy,
  currencyCode,
  goal,
  onComplete,
  onDelete,
  onEdit,
}: {
  actionBusy: boolean;
  currencyCode: string;
  goal: SavingsGoal;
  onComplete: (goal: SavingsGoal) => void;
  onDelete: (goal: SavingsGoal) => void;
  onEdit: (goal: SavingsGoal) => void;
}) {
  const iconName = inferGoalIcon(goal.name);
  const tone = goal.status === 'completed' ? COLORS.green : COLORS.amber;

  return (
    <View style={styles.inactiveGoalCard}>
      <View style={styles.goalTop}>
        <View style={[styles.goalIcon, { backgroundColor: goal.status === 'completed' ? '#0D1A12' : '#1F1A0E' }]}>
          <FontAwesome color={tone} name={iconName} size={17} />
        </View>
        <View style={styles.goalMeta}>
          <Text style={styles.goalName}>{goal.name}</Text>
          <Text style={styles.goalDate}>
            {formatMoney(goal.current_amount, currencyCode)} of {formatMoney(goal.target_amount, currencyCode)}
          </Text>
        </View>
        <View style={[styles.goalBadge, goal.status === 'completed' ? styles.badgeOn : styles.badgeWarn]}>
          <Text style={[styles.goalBadgeText, { color: tone }]}>
            {goal.status === 'completed' ? 'Completed' : 'Paused'}
          </Text>
        </View>
      </View>

      <View style={styles.goalActionRow}>
        <ActionChip
          disabled={actionBusy}
          icon="pencil"
          label="Edit"
          onPress={() => onEdit(goal)}
          tone="muted"
        />
        {goal.status === 'paused' ? (
          <ActionChip
            disabled={actionBusy}
            icon="check"
            label="Complete"
            onPress={() => onComplete(goal)}
            tone="positive"
          />
        ) : null}
        <ActionChip
          disabled={actionBusy}
          icon="trash"
          label="Delete"
          onPress={() => onDelete(goal)}
          tone="danger"
        />
      </View>
    </View>
  );
}

function ActionChip({
  disabled,
  icon,
  label,
  onPress,
  tone,
}: {
  disabled?: boolean;
  icon: React.ComponentProps<typeof FontAwesome>['name'];
  label: string;
  onPress: () => void;
  tone: 'danger' | 'muted' | 'positive';
}) {
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.actionChip,
        tone === 'positive' ? styles.actionChipPositive : null,
        tone === 'danger' ? styles.actionChipDanger : null,
        disabled ? styles.actionChipDisabled : null,
      ]}
    >
      <FontAwesome
        color={tone === 'positive' ? COLORS.green : tone === 'danger' ? COLORS.danger : COLORS.violetBright}
        name={icon}
        size={11}
      />
      <Text
        style={[
          styles.actionChipText,
          tone === 'positive' ? styles.actionChipTextPositive : null,
          tone === 'danger' ? styles.actionChipTextDanger : null,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function GoalModal({
  currencyCode,
  draft,
  isProjecting,
  isSubmitting,
  open,
  projection,
  editingGoal,
  onChange,
  onClose,
  onSubmit,
}: {
  currencyCode: string;
  draft: GoalDraft;
  isProjecting: boolean;
  isSubmitting: boolean;
  open: boolean;
  projection: SavingsGoalProjection | null;
  editingGoal: SavingsGoal | null;
  onChange: (nextDraft: Partial<GoalDraft>) => void;
  onClose: () => void;
  onSubmit: () => void;
}) {
  const isEditing = Boolean(editingGoal);

  return (
    <Modal animationType="slide" onRequestClose={onClose} transparent visible={open}>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalSheet}>
          <View style={styles.modalHandle} />
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{isEditing ? 'Edit savings goal' : 'New savings goal'}</Text>
            <Pressable onPress={onClose} style={styles.closeButton}>
              <FontAwesome color="#666666" name="times" size={14} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.modalBody} keyboardShouldPersistTaps="handled">
            <FieldLabel label="GOAL NAME" />
            <TextInput
              autoCapitalize="words"
              placeholder="Holiday trip to Turkey"
              placeholderTextColor="#555555"
              selectionColor={COLORS.violet}
              style={[styles.modalInput, styles.modalInputActive]}
              value={draft.name}
              onChangeText={(value) => onChange({ name: value })}
            />

            <FieldLabel label={`TARGET AMOUNT (${currencyCode})`} />
            <TextInput
              keyboardType="decimal-pad"
              placeholder="130000"
              placeholderTextColor="#555555"
              selectionColor={COLORS.green}
              style={[styles.modalInput, styles.largeAmountInput]}
              value={draft.targetAmount}
              onChangeText={(value) => onChange({ targetAmount: sanitizeAmount(value) })}
            />

            <FieldLabel label="TARGET DATE (YYYY-MM-DD)" />
            <TextInput
              autoCapitalize="none"
              placeholder="2027-03-01"
              placeholderTextColor="#555555"
              selectionColor={COLORS.violet}
              style={styles.modalInput}
              value={draft.targetDate}
              onChangeText={(value) => onChange({ targetDate: value })}
            />

            <FieldLabel label={`CURRENT AMOUNT (${currencyCode})`} />
            <TextInput
              keyboardType="decimal-pad"
              placeholder="0"
              placeholderTextColor="#555555"
              selectionColor={COLORS.violet}
              style={styles.modalInput}
              value={draft.currentAmount}
              onChangeText={(value) => onChange({ currentAmount: sanitizeAmount(value) })}
            />

            <FieldLabel label="PRIORITY" />
            <View style={styles.priorityRow}>
              {(['high', 'medium', 'low'] as const).map((priority) => (
                <Pressable
                  key={priority}
                  onPress={() => onChange({ priority })}
                  style={[styles.priorityChip, draft.priority === priority ? styles.priorityChipActive : null]}
                >
                  <Text style={[styles.priorityText, draft.priority === priority ? styles.priorityTextActive : null]}>
                    {capitalize(priority)}
                  </Text>
                </Pressable>
              ))}
            </View>

            <FieldLabel label={`MONTHLY CONTRIBUTION (${currencyCode})`} />
            <TextInput
              keyboardType="decimal-pad"
              placeholder="Optional"
              placeholderTextColor="#555555"
              selectionColor={COLORS.violet}
              style={styles.modalInput}
              value={draft.monthlyContribution}
              onChangeText={(value) => onChange({ monthlyContribution: sanitizeAmount(value) })}
            />

            <View style={styles.projectionCard}>
              <View style={styles.projectionHeader}>
                <FontAwesome color={COLORS.green} name="android" size={14} />
                <Text style={styles.projectionTitle}>FinPilot projection</Text>
              </View>

              {isProjecting ? (
                <View style={styles.projectionLoading}>
                  <ActivityIndicator color={COLORS.green} size="small" />
                </View>
              ) : projection ? (
                <>
                  <ProjectionRow label="Monthly needed" value={formatMoney(projection.monthly_required, currencyCode)} />
                  <ProjectionRow
                    label="% of your income"
                    value={
                      projection.income_share_percentage
                        ? `${Number(projection.income_share_percentage).toFixed(1)}% - ${projection.feasible_label.toLowerCase()}`
                        : projection.feasible_label
                    }
                    valueTone={projection.feasible_status}
                  />
                  <ProjectionRow
                    label="Estimated completion"
                    value={
                      projection.projected_completion_date
                        ? `${formatTargetDate(projection.projected_completion_date)}${projection.will_hit_target_on_time ? ' on time' : ''}`
                        : 'Needs contribution input'
                    }
                  />
                </>
              ) : (
                <Text style={styles.projectionHint}>
                  Enter a goal name, target amount, and target date to see the monthly pace needed.
                </Text>
              )}
            </View>

            <Pressable disabled={isSubmitting} onPress={onSubmit} style={styles.createButton}>
              {isSubmitting ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <>
                  <FontAwesome color="#FFFFFF" name={isEditing ? 'check' : 'money'} size={14} />
                  <Text style={styles.createButtonText}>{isEditing ? 'Save changes' : 'Create goal'}</Text>
                </>
              )}
            </Pressable>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function ProjectionRow({
  label,
  value,
  valueTone = 'default',
}: {
  label: string;
  value: string;
  valueTone?: 'at_risk' | 'behind' | 'default' | 'on_track';
}) {
  return (
    <View style={styles.projectionRow}>
      <Text style={styles.projectionLabel}>{label}</Text>
      <Text
        style={[
          styles.projectionValue,
          valueTone === 'on_track' ? styles.projectionValueOnTrack : null,
          valueTone === 'behind' ? styles.projectionValueBehind : null,
          valueTone === 'at_risk' ? styles.projectionValueRisk : null,
        ]}
      >
        {value}
      </Text>
    </View>
  );
}

function FieldLabel({ label }: { label: string }) {
  return <Text style={styles.fieldLabel}>{label}</Text>;
}

function EmptyBlock({ copy }: { copy: string }) {
  return (
    <View style={styles.emptyBlock}>
      <Text style={styles.emptyBlockText}>{copy}</Text>
    </View>
  );
}

function getGoalTone(status: 'at_risk' | 'behind' | 'on_track') {
  if (status === 'on_track') {
    return {
      badgeBackground: styles.badgeOn,
      cardBorder: styles.goalCardOnTrack,
      iconBackground: styles.goalIconOnTrack,
      iconColor: COLORS.green,
    };
  }

  if (status === 'behind') {
    return {
      badgeBackground: styles.badgeWarn,
      cardBorder: styles.goalCardWarn,
      iconBackground: styles.goalIconWarn,
      iconColor: COLORS.amber,
    };
  }

  return {
    badgeBackground: styles.badgeUrgent,
    cardBorder: styles.goalCardUrgent,
    iconBackground: styles.goalIconUrgent,
    iconColor: COLORS.danger,
  };
}

function inferGoalIcon(name: string): React.ComponentProps<typeof FontAwesome>['name'] {
  const normalized = name.toLowerCase();
  if (normalized.includes('emergency') || normalized.includes('fund')) {
    return 'shield';
  }
  if (normalized.includes('trip') || normalized.includes('travel') || normalized.includes('holiday')) {
    return 'plane';
  }
  if (normalized.includes('laptop') || normalized.includes('computer')) {
    return 'laptop';
  }
  if (normalized.includes('car')) {
    return 'car';
  }
  if (normalized.includes('home') || normalized.includes('house')) {
    return 'home';
  }
  if (normalized.includes('health')) {
    return 'heart';
  }
  return 'flag';
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

function formatTargetDate(value: string) {
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleDateString('en-US', {
    month: 'short',
    year: 'numeric',
  });
}

function sanitizeAmount(value: string) {
  const sanitized = value.replace(/[^0-9.]/g, '');
  const parts = sanitized.split('.');
  if (parts.length <= 2) {
    return sanitized;
  }

  return `${parts[0]}.${parts.slice(1).join('')}`;
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
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
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  headerTitle: {
    color: '#F0F0F0',
    fontSize: 16,
    fontWeight: '500',
    marginBottom: 4,
  },
  headerSubtitle: {
    color: '#555555',
    fontSize: 11,
  },
  addButton: {
    minHeight: 32,
    borderRadius: 20,
    borderWidth: 0.5,
    borderColor: COLORS.violet,
    backgroundColor: '#1A1525',
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  addButtonText: {
    color: '#9B72F5',
    fontSize: 11,
    fontWeight: '500',
  },
  body: {
    paddingHorizontal: 14,
    paddingTop: 14,
  },
  summaryStrip: {
    flexDirection: 'row',
    gap: 7,
    marginBottom: 14,
  },
  summaryCard: {
    flex: 1,
    backgroundColor: '#161616',
    borderWidth: 0.5,
    borderColor: '#272727',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 9,
    alignItems: 'center',
  },
  summaryValue: {
    color: '#F0F0F0',
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 2,
  },
  summaryValueGreen: {
    color: COLORS.green,
  },
  summaryValueViolet: {
    color: COLORS.violet,
  },
  summaryLabel: {
    color: '#555555',
    fontSize: 9,
  },
  aiSuggestion: {
    backgroundColor: '#1A1525',
    borderWidth: 0.5,
    borderColor: '#3D2F6A',
    borderRadius: 11,
    paddingHorizontal: 13,
    paddingVertical: 11,
    marginBottom: 14,
  },
  aiSuggestionTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginBottom: 8,
  },
  aiSuggestionTitle: {
    color: '#C4B5FD',
    fontSize: 11,
    fontWeight: '500',
  },
  aiSuggestionBody: {
    color: '#9B8CC4',
    fontSize: 10,
    lineHeight: 15.5,
    marginBottom: 9,
  },
  aiChipRow: {
    flexDirection: 'row',
    gap: 6,
    flexWrap: 'wrap',
  },
  aiChip: {
    backgroundColor: '#161616',
    borderWidth: 0.5,
    borderColor: '#3D2F6A',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  aiChipText: {
    color: '#9B72F5',
    fontSize: 10,
  },
  sectionHead: {
    marginBottom: 9,
  },
  sectionTitle: {
    color: '#BBBBBB',
    fontSize: 12,
    fontWeight: '500',
  },
  goalCard: {
    backgroundColor: '#161616',
    borderWidth: 0.5,
    borderColor: '#272727',
    borderRadius: 13,
    paddingHorizontal: 13,
    paddingVertical: 13,
    marginBottom: 10,
  },
  goalCardOnTrack: {
    borderColor: 'rgba(34,197,94,0.27)',
  },
  goalCardWarn: {
    borderColor: 'rgba(245,158,11,0.22)',
  },
  goalCardUrgent: {
    borderColor: 'rgba(240,106,99,0.28)',
  },
  goalTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 11,
  },
  goalIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  goalIconOnTrack: {
    backgroundColor: '#0D1A12',
  },
  goalIconWarn: {
    backgroundColor: '#1F1A0E',
  },
  goalIconUrgent: {
    backgroundColor: '#131520',
  },
  goalMeta: {
    flex: 1,
  },
  goalName: {
    color: '#E0E0E0',
    fontSize: 12,
    fontWeight: '500',
    marginBottom: 2,
  },
  goalDate: {
    color: '#555555',
    fontSize: 10,
  },
  goalBadge: {
    borderRadius: 20,
    borderWidth: 0.5,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  badgeOn: {
    backgroundColor: '#0D1A12',
    borderColor: 'rgba(34,197,94,0.27)',
  },
  badgeWarn: {
    backgroundColor: '#1F1A0E',
    borderColor: 'rgba(245,158,11,0.27)',
  },
  badgeUrgent: {
    backgroundColor: '#1A0F0F',
    borderColor: 'rgba(240,106,99,0.28)',
  },
  goalBadgeText: {
    fontSize: 9,
    fontWeight: '500',
  },
  goalAmounts: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: 7,
  },
  goalSaved: {
    color: '#F0F0F0',
    fontSize: 15,
    fontWeight: '500',
    marginRight: 8,
  },
  goalTarget: {
    color: '#555555',
    fontSize: 11,
    flex: 1,
  },
  goalPct: {
    fontSize: 12,
    fontWeight: '500',
  },
  progressBg: {
    height: 6,
    backgroundColor: '#272727',
    borderRadius: 3,
    marginBottom: 7,
    overflow: 'hidden',
  },
  progressFill: {
    height: 6,
    borderRadius: 3,
  },
  goalFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
  },
  goalPace: {
    color: '#555555',
    fontSize: 10,
    flex: 1,
  },
  goalPaceStrong: {
    color: '#BBBBBB',
    fontWeight: '500',
  },
  goalPaceStrongDanger: {
    color: COLORS.danger,
  },
  goalAction: {
    color: COLORS.violet,
    fontSize: 10,
  },
  goalActionButton: {
    minHeight: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  goalDescription: {
    color: '#505463',
    fontSize: 10,
    lineHeight: 14,
    marginTop: 8,
  },
  goalActionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
  },
  inactiveGoalCard: {
    backgroundColor: '#161616',
    borderWidth: 0.5,
    borderColor: '#272727',
    borderRadius: 13,
    paddingHorizontal: 13,
    paddingVertical: 13,
    marginBottom: 10,
  },
  actionChip: {
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
  actionChipPositive: {
    borderColor: 'rgba(34,197,94,0.35)',
    backgroundColor: '#0D1A12',
  },
  actionChipDanger: {
    borderColor: 'rgba(240,106,99,0.35)',
    backgroundColor: '#1A0F0F',
  },
  actionChipDisabled: {
    opacity: 0.45,
  },
  actionChipText: {
    color: COLORS.violetBright,
    fontSize: 10,
    fontWeight: '500',
  },
  actionChipTextPositive: {
    color: COLORS.green,
  },
  actionChipTextDanger: {
    color: COLORS.danger,
  },
  addGoalCard: {
    backgroundColor: '#161616',
    borderWidth: 0.5,
    borderStyle: 'dashed',
    borderColor: '#2E2E2E',
    borderRadius: 13,
    paddingHorizontal: 13,
    paddingVertical: 16,
    marginBottom: 10,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  addGoalIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#1A1525',
    borderWidth: 0.5,
    borderColor: 'rgba(124,58,237,0.28)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addGoalText: {
    color: '#555555',
    fontSize: 12,
  },
  addGoalSub: {
    color: '#3A3A3A',
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
    marginBottom: 10,
  },
  emptyBlockText: {
    color: '#555555',
    fontSize: 10,
    lineHeight: 15,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: '#0E0E0E',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderWidth: 0.5,
    borderColor: '#272727',
    paddingBottom: 18,
    maxHeight: '92%',
  },
  modalHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#2E2E2E',
    alignSelf: 'center',
    marginTop: 14,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 14,
  },
  modalTitle: {
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
  modalBody: {
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 12,
  },
  fieldLabel: {
    color: '#555555',
    fontSize: 10,
    letterSpacing: 0.4,
    marginBottom: 5,
  },
  modalInput: {
    minHeight: 44,
    borderRadius: 10,
    borderWidth: 0.5,
    borderColor: '#2E2E2E',
    backgroundColor: '#161616',
    color: '#E0E0E0',
    fontSize: 13,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
  },
  modalInputActive: {
    borderColor: COLORS.violet,
  },
  largeAmountInput: {
    fontSize: 18,
    fontWeight: '500',
    color: COLORS.green,
  },
  priorityRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  priorityChip: {
    flex: 1,
    minHeight: 38,
    borderRadius: 10,
    borderWidth: 0.5,
    borderColor: '#2E2E2E',
    backgroundColor: '#161616',
    alignItems: 'center',
    justifyContent: 'center',
  },
  priorityChipActive: {
    borderColor: COLORS.violet,
    backgroundColor: '#1A1525',
  },
  priorityText: {
    color: '#777777',
    fontSize: 11,
    fontWeight: '500',
  },
  priorityTextActive: {
    color: '#9B72F5',
  },
  projectionCard: {
    backgroundColor: '#0D1A12',
    borderWidth: 0.5,
    borderColor: '#1A3D22',
    borderRadius: 10,
    paddingHorizontal: 13,
    paddingVertical: 10,
    marginBottom: 14,
  },
  projectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginBottom: 7,
  },
  projectionTitle: {
    color: COLORS.green,
    fontSize: 11,
    fontWeight: '500',
  },
  projectionLoading: {
    paddingVertical: 8,
  },
  projectionHint: {
    color: '#6B7B70',
    fontSize: 10,
    lineHeight: 15,
  },
  projectionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 4,
  },
  projectionLabel: {
    color: '#555555',
    fontSize: 10,
  },
  projectionValue: {
    color: '#DDDDDD',
    fontSize: 11,
    fontWeight: '500',
    flexShrink: 1,
    textAlign: 'right',
  },
  projectionValueOnTrack: {
    color: COLORS.green,
  },
  projectionValueBehind: {
    color: COLORS.amber,
  },
  projectionValueRisk: {
    color: COLORS.danger,
  },
  createButton: {
    minHeight: 50,
    borderRadius: 13,
    backgroundColor: COLORS.green,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    marginBottom: 18,
  },
  createButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '500',
  },
});

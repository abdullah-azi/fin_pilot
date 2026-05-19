import { apiRequest } from '@/lib/api/client';

export type SavingsGoal = {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  target_amount: string;
  current_amount: string;
  target_date: string | null;
  priority: 'low' | 'medium' | 'high';
  status: 'active' | 'completed' | 'paused';
  created_at: string;
  updated_at: string;
};

type SavingsGoalListResponse = {
  items: SavingsGoal[];
};

export type SavingsGoalSummary = {
  period_label: string;
  active_goal_count: number;
  total_saved: string;
  total_target: string;
  overall_progress: string;
  comfortable_monthly_savings: string;
  total_monthly_required: string;
  goals: Array<{
    goal_id: string;
    name: string;
    current_amount: string;
    target_amount: string;
    target_date: string | null;
    progress_percentage: string;
    monthly_required: string;
    pace_status: 'at_risk' | 'behind' | 'on_track';
    pace_label: string;
    shortfall_amount: string;
  }>;
};

export type SavingsGoalRecommendation = {
  period_label: string;
  comfortable_monthly_savings: string;
  total_monthly_required: string;
  can_fund_all_goals_on_time: boolean;
  recommendation_text: string;
  allocations: Array<{
    goal_id: string;
    name: string;
    recommended_monthly_contribution: string;
    required_monthly_contribution: string;
    pace_status: 'at_risk' | 'behind' | 'on_track';
  }>;
};

export type SavingsGoalProjectionPayload = {
  target_amount: number;
  current_amount?: number;
  target_date: string;
  monthly_contribution?: number | null;
};

export type SavingsGoalProjection = {
  monthly_required: string;
  income_share_percentage: string | null;
  feasible_status: 'at_risk' | 'behind' | 'on_track';
  feasible_label: string;
  comfortable_monthly_savings: string;
  projected_completion_date: string | null;
  will_hit_target_on_time: boolean;
};

export type CreateSavingsGoalPayload = {
  name: string;
  description?: string | null;
  target_amount: number;
  current_amount?: number;
  target_date?: string | null;
  priority: 'low' | 'medium' | 'high';
  status?: 'active' | 'completed' | 'paused';
};

export type UpdateSavingsGoalPayload = {
  name?: string;
  description?: string | null;
  target_amount?: number;
  current_amount?: number;
  target_date?: string | null;
  priority?: 'low' | 'medium' | 'high';
  status?: 'active' | 'completed' | 'paused';
};

export async function listSavingsGoals(accessToken: string) {
  const response = await apiRequest<SavingsGoalListResponse>('/savings-goals/', {
    accessToken,
  });

  return response.items;
}

export async function getSavingsGoalSummary(accessToken: string) {
  return apiRequest<SavingsGoalSummary>('/savings-goals/summary', {
    accessToken,
  });
}

export async function getSavingsGoalRecommendation(accessToken: string) {
  return apiRequest<SavingsGoalRecommendation>('/savings-goals/recommendation', {
    accessToken,
  });
}

export async function projectSavingsGoal(accessToken: string, payload: SavingsGoalProjectionPayload) {
  return apiRequest<SavingsGoalProjection>('/savings-goals/projection', {
    accessToken,
    method: 'POST',
    body: payload,
  });
}

export async function createSavingsGoal(accessToken: string, payload: CreateSavingsGoalPayload) {
  return apiRequest<SavingsGoal>('/savings-goals/', {
    accessToken,
    method: 'POST',
    body: payload,
  });
}

export async function updateSavingsGoal(
  accessToken: string,
  goalId: string,
  payload: UpdateSavingsGoalPayload,
) {
  return apiRequest<SavingsGoal>(`/savings-goals/${goalId}`, {
    accessToken,
    method: 'PATCH',
    body: payload,
  });
}

export async function deleteSavingsGoal(accessToken: string, goalId: string) {
  return apiRequest<void>(`/savings-goals/${goalId}`, {
    accessToken,
    method: 'DELETE',
  });
}

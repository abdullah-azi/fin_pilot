import { apiRequest } from '@/lib/api/client';

export type GeneralAdvicePayload = {
  question: string;
};

export type GeneralAdviceContext = {
  currency_code: string;
  currency_symbol: string;
  month_label: string;
  current_month_income: string;
  current_month_expense: string;
  current_month_net: string;
  active_goal_count: number;
  comfortable_monthly_savings: string;
  behavior_label: string;
  behavior_score: number;
  top_spending_category: string | null;
  savings_rate: string;
};

export type GeneralAdviceResponse = {
  guidance: string;
  provider: string;
  model_name: string;
  context: GeneralAdviceContext;
};

export async function generalChat(accessToken: string, payload: GeneralAdvicePayload) {
  return apiRequest<GeneralAdviceResponse>('/ai/chat', {
    accessToken,
    body: payload,
    method: 'POST',
  });
}

export type PurchaseCheckPayload = {
  planned_amount: number;
  item_name: string;
  question: string;
  category_id?: string | null;
};

export type PurchaseCheckContext = {
  currency_code: string;
  currency_symbol: string;
  month_label: string;
  planned_amount: string;
  item_name: string;
  category_name: string | null;
  current_category_spend: string | null;
  category_budget_limit: string | null;
  current_month_income: string;
  current_month_expense: string;
  current_month_net: string;
  top_spending_category: string | null;
  active_goal_count: number;
  total_goal_monthly_required: string;
  comfortable_monthly_savings: string;
  affordability_ratio: string;
  verdict: 'caution' | 'not_recommended' | 'safe';
  suggested_action: string;
};

export type PurchaseCheckResponse = {
  verdict: 'caution' | 'not_recommended' | 'safe';
  affordability_score: number;
  guidance: string;
  provider: string;
  model_name: string;
  context: PurchaseCheckContext;
};

export async function purchaseCheck(accessToken: string, payload: PurchaseCheckPayload) {
  return apiRequest<PurchaseCheckResponse>('/ai/purchase-check', {
    accessToken,
    body: payload,
    method: 'POST',
  });
}

export type SavingsAdvicePayload = {
  question: string;
  goal_id?: string | null;
};

export type SavingsAdviceAllocation = {
  goal_id: string;
  name: string;
  recommended_monthly_contribution: string;
  required_monthly_contribution: string;
  pace_status: 'at_risk' | 'behind' | 'on_track';
};

export type SavingsAdviceContext = {
  currency_code: string;
  currency_symbol: string;
  month_label: string;
  current_month_income: string;
  current_month_expense: string;
  current_month_net: string;
  active_goal_count: number;
  comfortable_monthly_savings: string;
  total_goal_monthly_required: string;
  overall_goal_progress: string;
  can_fund_all_goals_on_time: boolean;
  recommendation_text: string;
  focus_goal_name: string | null;
  focus_goal_progress_percentage: string | null;
  focus_goal_monthly_required: string | null;
  focus_goal_pace_status: 'at_risk' | 'behind' | 'on_track' | null;
  allocations: SavingsAdviceAllocation[];
};

export type SavingsAdviceResponse = {
  guidance: string;
  provider: string;
  model_name: string;
  context: SavingsAdviceContext;
};

export async function savingsAdvice(accessToken: string, payload: SavingsAdvicePayload) {
  return apiRequest<SavingsAdviceResponse>('/ai/savings-advice', {
    accessToken,
    body: payload,
    method: 'POST',
  });
}

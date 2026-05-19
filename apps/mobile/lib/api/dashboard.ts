import { apiRequest } from '@/lib/api/client';

export type DashboardTransactionCategory = {
  name: string;
  color: string | null;
  icon: string | null;
};

export type DashboardTransaction = {
  id: string;
  user_id: string;
  type: 'expense' | 'income';
  amount: string;
  income_frequency: 'once' | 'hourly' | 'daily' | 'monthly' | 'yearly' | null;
  hours_per_day: string | null;
  days_per_week: string | null;
  category_id: string | null;
  title: string;
  note: string | null;
  transaction_date: string;
  created_at: string;
  updated_at: string;
  category: DashboardTransactionCategory | null;
};

export type DashboardSummaryResponse = {
  month_label: string;
  insight: string;
  summary: {
    transaction_count: number;
    total_income: string;
    total_expense: string;
    net: string;
  };
  top_categories: Array<{
    category_id: string | null;
    name: string;
    color: string | null;
    icon: string | null;
    percentage: string;
    total_amount: string;
  }>;
  recent_transactions: DashboardTransaction[];
  active_goal: {
    goal_id: string;
    name: string;
    current_amount: string;
    target_amount: string;
    progress_percentage: string;
    target_date: string | null;
  } | null;
};

export async function getDashboardSummary(accessToken: string) {
  return apiRequest<DashboardSummaryResponse>('/dashboard/summary', {
    method: 'GET',
    accessToken,
  });
}

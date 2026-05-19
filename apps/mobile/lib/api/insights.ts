import { API_BASE_URL } from '@/lib/api/config';
import { ApiError, apiRequest } from '@/lib/api/client';

export type InsightCategoryAnalytics = {
  category_id: string | null;
  name: string;
  color: string | null;
  icon: string | null;
  total_amount: string;
  percentage: string;
  delta_percentage: string | null;
  trend_direction: 'down' | 'flat' | 'up';
};

export type InsightMonthlySpendPoint = {
  month_key: string;
  month_label: string;
  total_amount: string;
  is_current: boolean;
};

export type SpendingBehaviorSummary = {
  label: string;
  score: number;
  planned_buys: number;
  impulse_buys: number;
  overspent_days: number;
};

export type InsightCard = {
  severity: 'bad' | 'good' | 'warn';
  title: string;
  description: string;
};

export type SpendingAnalysisResponse = {
  period_label: string;
  total_spent: string;
  category_breakdown: InsightCategoryAnalytics[];
  monthly_trend: InsightMonthlySpendPoint[];
  behavior: SpendingBehaviorSummary;
  insights: InsightCard[];
};

export async function getSpendingAnalysis(accessToken: string, months = 4) {
  return apiRequest<SpendingAnalysisResponse>(`/insights/spending-analysis?months=${months}`, {
    method: 'GET',
    accessToken,
  });
}

export type InsightMonthlyCashflowPoint = {
  month_key: string;
  month_label: string;
  total_income: string;
  total_expense: string;
  net: string;
  is_current: boolean;
};

export type ReportSummaryTransaction = {
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
  category: {
    name: string | null;
    color: string | null;
    icon: string | null;
  } | null;
};

export type ReportSummaryResponse = {
  period_label: string;
  net_saved: string;
  total_income: string;
  total_expense: string;
  transaction_count: number;
  savings_rate: string;
  savings_rate_delta: string | null;
  monthly_overview: InsightMonthlyCashflowPoint[];
  category_table: InsightCategoryAnalytics[];
  largest_transactions: ReportSummaryTransaction[];
};

export async function getReportSummary(accessToken: string, months = 4) {
  return apiRequest<ReportSummaryResponse>(`/insights/reports?months=${months}`, {
    method: 'GET',
    accessToken,
  });
}

export async function fetchReportExport(
  accessToken: string,
  format: 'csv' | 'pdf',
  months = 4,
) {
  const response = await fetch(`${API_BASE_URL}/insights/export?format=${format}&months=${months}`, {
    method: 'GET',
    headers: {
      Accept: format === 'pdf' ? 'application/pdf' : 'text/csv',
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    let message = 'Could not export report.';

    try {
      const payload = (await response.json()) as { detail?: string };
      if (payload?.detail) {
        message = payload.detail;
      }
    } catch {
      // Ignore JSON parse failure for non-JSON export responses.
    }

    throw new ApiError(message, response.status);
  }

  return {
    contentDisposition: response.headers.get('content-disposition'),
    contentType: response.headers.get('content-type') ?? (format === 'pdf' ? 'application/pdf' : 'text/csv'),
    data: format === 'pdf' ? await response.arrayBuffer() : await response.text(),
  };
}

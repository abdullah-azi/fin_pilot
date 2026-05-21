import { apiRequest } from '@/lib/api/client';

export type TransactionType = 'expense' | 'income';
export type TransactionFrequency = 'once' | 'hourly' | 'daily' | 'monthly' | 'yearly';

export type CreateTransactionPayload = {
  type: TransactionType;
  amount: number;
  income_frequency?: TransactionFrequency | null;
  hours_per_day?: number | null;
  days_per_week?: number | null;
  category_id: string | null;
  title: string;
  note?: string | null;
  transaction_date: string;
};

export type Transaction = {
  id: string;
  user_id: string;
  type: TransactionType;
  amount: string;
  income_frequency: TransactionFrequency | null;
  hours_per_day: string | null;
  days_per_week: string | null;
  category_id: string | null;
  title: string;
  note: string | null;
  transaction_date: string;
  created_at: string;
  updated_at: string;
};

export type TransactionListResponse = {
  items: Transaction[];
  summary: {
    total_count: number;
    total_income: string;
    total_expense: string;
    net: string;
  };
  meta: {
    limit: number;
    offset: number;
    has_more: boolean;
  };
};

export type TransactionBulkDeleteResponse = {
  deleted_count: number;
};

export type TransactionBackfillResponse = {
  scanned_count: number;
  updated_count: number;
  status: string;
};

export async function createTransaction(accessToken: string, payload: CreateTransactionPayload) {
  return apiRequest<Transaction>('/transactions/', {
    method: 'POST',
    accessToken,
    body: payload,
  });
}

export async function listTransactions(accessToken: string) {
  const response = await apiRequest<TransactionListResponse>('/transactions/', {
    method: 'GET',
    accessToken,
  });

  return response.items;
}

export async function getTransactionHistory(
  accessToken: string,
  query = '',
) {
  const suffix = query ? `/transactions/?${query}` : '/transactions/';

  return apiRequest<TransactionListResponse>(suffix, {
    method: 'GET',
    accessToken,
  });
}

export async function deleteAllTransactions(accessToken: string) {
  return apiRequest<TransactionBulkDeleteResponse>('/transactions/all', {
    method: 'DELETE',
    accessToken,
  });
}

export async function backfillUncategorizedTransactions(accessToken: string) {
  return apiRequest<TransactionBackfillResponse>('/transactions/backfill-uncategorized', {
    method: 'POST',
    accessToken,
  });
}

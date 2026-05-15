import { apiRequest } from '@/lib/api/client';

export type TransactionType = 'expense' | 'income';

export type CreateTransactionPayload = {
  type: TransactionType;
  amount: number;
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
  category_id: string | null;
  title: string;
  note: string | null;
  transaction_date: string;
  created_at: string;
  updated_at: string;
};

export async function createTransaction(accessToken: string, payload: CreateTransactionPayload) {
  return apiRequest<Transaction>('/transactions/', {
    method: 'POST',
    accessToken,
    body: payload,
  });
}

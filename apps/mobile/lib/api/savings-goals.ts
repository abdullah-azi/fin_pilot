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

export async function listSavingsGoals(accessToken: string) {
  const response = await apiRequest<SavingsGoalListResponse>('/savings-goals/', {
    accessToken,
  });

  return response.items;
}

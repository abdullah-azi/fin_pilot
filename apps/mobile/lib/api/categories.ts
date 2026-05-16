import { apiRequest } from '@/lib/api/client';

export type CategoryType = 'both' | 'expense' | 'income';

export type Category = {
  id: string;
  user_id: string | null;
  name: string;
  display_name: string | null;
  effective_name: string;
  type: CategoryType;
  color: string | null;
  icon: string | null;
  is_default: boolean;
  is_hidden: boolean;
  monthly_budget_limit: string | null;
  is_custom: boolean;
  created_at: string;
  updated_at: string;
};

export async function getCategories(accessToken: string) {
  return apiRequest<Category[]>('/categories/', {
    accessToken,
  });
}

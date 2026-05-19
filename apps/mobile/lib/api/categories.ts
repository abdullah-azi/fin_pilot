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

export type CreateCategoryPayload = {
  color?: string | null;
  icon?: string | null;
  name: string;
  type: CategoryType;
};

export type UpdateCategorySettingsPayload = {
  display_name?: string | null;
  is_hidden?: boolean | null;
  monthly_budget_limit?: number | string | null;
};

export async function getCategories(accessToken: string, includeHidden = false) {
  return apiRequest<Category[]>(`/categories/?include_hidden=${includeHidden ? 'true' : 'false'}`, {
    accessToken,
  });
}

export async function createCategory(accessToken: string, payload: CreateCategoryPayload) {
  return apiRequest<Category>('/categories/', {
    accessToken,
    body: payload,
    method: 'POST',
  });
}

export async function updateCategorySettings(
  accessToken: string,
  categoryId: string,
  payload: UpdateCategorySettingsPayload,
) {
  return apiRequest<Category>(`/categories/${categoryId}/settings`, {
    accessToken,
    body: payload,
    method: 'PATCH',
  });
}

export async function deleteCategory(accessToken: string, categoryId: string) {
  return apiRequest<void>(`/categories/${categoryId}`, {
    accessToken,
    method: 'DELETE',
  });
}

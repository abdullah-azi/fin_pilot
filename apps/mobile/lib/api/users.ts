import { apiRequest } from '@/lib/api/client';
import type { AuthUser } from '@/lib/api/auth';

export type UpdateCurrentUserPayload = {
  email?: string;
  password?: string;
  full_name?: string | null;
  currency?: string;
  country?: string | null;
  preferences?: {
    monthly_income_expected?: number | string | null;
    monthly_savings_target?: number | string | null;
    risk_style?: string | null;
    preferred_ai_tone?: string | null;
    notifications_enabled?: boolean | null;
    default_currency?: string | null;
  };
};

export async function getCurrentUserProfile(accessToken: string) {
  return apiRequest<AuthUser>('/users/me', {
    accessToken,
  });
}

export async function updateCurrentUser(accessToken: string, payload: UpdateCurrentUserPayload) {
  return apiRequest<AuthUser>('/users/me', {
    method: 'PATCH',
    accessToken,
    body: payload,
  });
}

export async function deleteCurrentUser(accessToken: string) {
  return apiRequest<void>('/users/me', {
    method: 'DELETE',
    accessToken,
  });
}

import { apiRequest } from '@/lib/api/client';

export type AuthUserPreferences = {
  user_id: string;
  monthly_income_expected: string | null;
  monthly_savings_target: string | null;
  risk_style: string | null;
  preferred_ai_tone: string | null;
  month_start_day: number;
  ai_suggestions_enabled: boolean;
  weekly_digest_enabled: boolean;
  savings_reminders_enabled: boolean;
  promotions_enabled: boolean;
  biometric_enabled: boolean;
  appearance: string;
  language: string;
  notifications_enabled: boolean;
  default_currency: string | null;
  created_at: string;
  updated_at: string;
};

export type AuthUser = {
  id: string;
  email: string;
  full_name: string | null;
  phone: string | null;
  profile_image_url: string | null;
  currency: string;
  country: string | null;
  is_active: boolean;
  preferences: AuthUserPreferences | null;
  created_at: string;
  updated_at: string;
};

export type AuthResponse = {
  access_token: string;
  refresh_token: string;
  token_type: string;
  access_token_expires_in: number;
  refresh_token_expires_in: number;
  user: AuthUser;
};

export type LoginPayload = {
  email: string;
  password: string;
};

export type SignupPayload = {
  email: string;
  password: string;
  full_name?: string | null;
  currency?: string;
  country?: string | null;
};

export type RefreshPayload = {
  refresh_token: string;
};

export type ForgotPasswordPayload = {
  email: string;
};

export type ForgotPasswordResponse = {
  status: string;
  reset_token: string | null;
  expires_in_seconds: number | null;
};

export type ResetPasswordPayload = {
  token: string;
  new_password: string;
};

export type ResetPasswordResponse = {
  status: string;
};

export async function login(payload: LoginPayload) {
  return apiRequest<AuthResponse>('/auth/login', {
    method: 'POST',
    body: payload,
  });
}

export async function signup(payload: SignupPayload) {
  return apiRequest<AuthResponse>('/auth/signup', {
    method: 'POST',
    body: payload,
  });
}

export async function getCurrentUser(accessToken: string) {
  return apiRequest<AuthUser>('/auth/me', {
    accessToken,
  });
}

export async function logout(accessToken: string) {
  return apiRequest<{ status: string }>('/auth/logout', {
    method: 'POST',
    accessToken,
  });
}

export async function refreshSession(payload: RefreshPayload) {
  return apiRequest<AuthResponse>('/auth/refresh', {
    method: 'POST',
    body: payload,
  });
}

export async function forgotPassword(payload: ForgotPasswordPayload) {
  return apiRequest<ForgotPasswordResponse>('/auth/forgot-password', {
    method: 'POST',
    body: payload,
  });
}

export async function resetPassword(payload: ResetPasswordPayload) {
  return apiRequest<ResetPasswordResponse>('/auth/reset-password', {
    method: 'POST',
    body: payload,
  });
}

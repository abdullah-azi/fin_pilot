import { API_BASE_URL, API_ORIGIN } from '@/lib/api/config';
import { ApiError, apiRequest } from '@/lib/api/client';
import type { AuthUser } from '@/lib/api/auth';

export type UpdateCurrentUserPayload = {
  email?: string;
  password?: string;
  full_name?: string | null;
  phone?: string | null;
  currency?: string;
  country?: string | null;
  preferences?: {
    monthly_income_expected?: number | string | null;
    monthly_savings_target?: number | string | null;
    risk_style?: string | null;
    preferred_ai_tone?: string | null;
    month_start_day?: number | null;
    ai_suggestions_enabled?: boolean | null;
    weekly_digest_enabled?: boolean | null;
    savings_reminders_enabled?: boolean | null;
    promotions_enabled?: boolean | null;
    biometric_enabled?: boolean | null;
    appearance?: string | null;
    language?: string | null;
    notifications_enabled?: boolean | null;
    default_currency?: string | null;
  };
};

export type ChangePasswordPayload = {
  current_password: string;
  new_password: string;
};

type ErrorPayload = {
  detail?: string | { msg?: string }[] | Record<string, unknown>;
};

function extractErrorMessage(payload: ErrorPayload | null, fallback: string) {
  if (!payload?.detail) {
    return fallback;
  }

  if (typeof payload.detail === 'string') {
    return payload.detail;
  }

  if (Array.isArray(payload.detail)) {
    return payload.detail.map((item) => item.msg ?? 'Invalid request').join(', ');
  }

  return fallback;
}

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

export async function changeCurrentUserPassword(accessToken: string, payload: ChangePasswordPayload) {
  return apiRequest<{ status: string }>('/users/me/change-password', {
    method: 'POST',
    accessToken,
    body: payload,
  });
}

export async function uploadCurrentUserProfileImage(
  accessToken: string,
  file: { mimeType?: string | null; name: string; uri: string },
) {
  const formData = new FormData();
  formData.append(
    'file',
    {
      name: file.name,
      type: file.mimeType ?? 'image/jpeg',
      uri: file.uri,
    } as never,
  );

  const response = await fetch(`${API_BASE_URL}/users/me/profile-image`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: formData,
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as ErrorPayload | null;
    throw new ApiError(extractErrorMessage(payload, 'Could not upload profile image.'), response.status);
  }

  return (await response.json()) as { profile_image_url: string };
}

export async function deleteCurrentUserProfileImage(accessToken: string) {
  return apiRequest<{ status: string }>('/users/me/profile-image', {
    method: 'DELETE',
    accessToken,
  });
}

export function resolveProfileImageUrl(path: string | null | undefined) {
  if (!path) {
    return null;
  }

  if (/^https?:\/\//i.test(path)) {
    return path;
  }

  return `${API_ORIGIN}${path.startsWith('/') ? path : `/${path}`}`;
}

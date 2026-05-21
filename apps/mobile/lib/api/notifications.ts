import { apiRequest } from '@/lib/api/client';

export type NotificationDevice = {
  id: string;
  expo_push_token: string;
  platform: 'android' | 'ios' | 'unknown' | 'web';
  device_name: string | null;
  app_build: string | null;
  push_enabled: boolean;
  is_active: boolean;
  last_registered_at: string;
  last_notified_at: string | null;
};

export type RegisterNotificationDevicePayload = {
  expo_push_token: string;
  platform: NotificationDevice['platform'];
  device_name?: string | null;
  app_build?: string | null;
  push_enabled?: boolean;
};

export function registerNotificationDevice(accessToken: string, payload: RegisterNotificationDevicePayload) {
  return apiRequest<NotificationDevice>('/notifications/devices/register', {
    accessToken,
    body: payload,
    method: 'POST',
  });
}

export function deactivateNotificationDevice(accessToken: string, expoPushToken: string) {
  return apiRequest<{ status: string }>('/notifications/devices/deactivate', {
    accessToken,
    body: { expo_push_token: expoPushToken },
    method: 'POST',
  });
}

export function sendTestNotification(
  accessToken: string,
  payload?: { title?: string; body?: string; data?: Record<string, unknown> },
) {
  return apiRequest<{
    status: string;
    attempted_count: number;
    delivered_count: number;
    failed_count: number;
    channel: 'test';
  }>('/notifications/test', {
    accessToken,
    body: payload ?? {},
    method: 'POST',
  });
}

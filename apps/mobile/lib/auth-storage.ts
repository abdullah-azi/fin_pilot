import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import type { AuthResponse, AuthUser } from '@/lib/api/auth';

const AUTH_STORAGE_KEY = 'finpilot.auth.session';

export type StoredAuthSession = {
  accessToken: string;
  refreshToken: string;
  tokenType: string;
  accessTokenExpiresIn: number;
  refreshTokenExpiresIn: number;
  accessTokenExpiresAt: number;
  refreshTokenExpiresAt: number;
  user: AuthUser;
};

function isWeb() {
  return Platform.OS === 'web';
}

function mapAuthResponseToStoredSession(payload: AuthResponse): StoredAuthSession {
  const now = Date.now();

  return {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token,
    tokenType: payload.token_type,
    accessTokenExpiresIn: payload.access_token_expires_in,
    refreshTokenExpiresIn: payload.refresh_token_expires_in,
    accessTokenExpiresAt: now + payload.access_token_expires_in * 1000,
    refreshTokenExpiresAt: now + payload.refresh_token_expires_in * 1000,
    user: payload.user,
  };
}

export async function readStoredSession() {
  const rawSession = isWeb()
    ? globalThis.localStorage?.getItem(AUTH_STORAGE_KEY) ?? null
    : await SecureStore.getItemAsync(AUTH_STORAGE_KEY);

  if (!rawSession) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawSession) as Partial<StoredAuthSession>;
    if (
      !parsed.accessToken ||
      !parsed.refreshToken ||
      !parsed.tokenType ||
      !parsed.user ||
      typeof parsed.accessTokenExpiresIn !== 'number' ||
      typeof parsed.refreshTokenExpiresIn !== 'number'
    ) {
      return null;
    }

    return {
      accessToken: parsed.accessToken,
      refreshToken: parsed.refreshToken,
      tokenType: parsed.tokenType,
      accessTokenExpiresIn: parsed.accessTokenExpiresIn,
      refreshTokenExpiresIn: parsed.refreshTokenExpiresIn,
      accessTokenExpiresAt:
        typeof parsed.accessTokenExpiresAt === 'number' ? parsed.accessTokenExpiresAt : 0,
      refreshTokenExpiresAt:
        typeof parsed.refreshTokenExpiresAt === 'number' ? parsed.refreshTokenExpiresAt : 0,
      user: parsed.user,
    };
  } catch {
    return null;
  }
}

export async function writeStoredSession(payload: AuthResponse) {
  const session = mapAuthResponseToStoredSession(payload);
  const rawSession = JSON.stringify(session);

  if (isWeb()) {
    globalThis.localStorage?.setItem(AUTH_STORAGE_KEY, rawSession);
    return session;
  }

  await SecureStore.setItemAsync(AUTH_STORAGE_KEY, rawSession);
  return session;
}

export async function clearStoredSession() {
  if (isWeb()) {
    globalThis.localStorage?.removeItem(AUTH_STORAGE_KEY);
    return;
  }

  await SecureStore.deleteItemAsync(AUTH_STORAGE_KEY);
}

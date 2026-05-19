import { Platform } from 'react-native';

const DEFAULT_API_ORIGIN = Platform.select({
  android: 'http://10.0.2.2:8001',
  default: 'http://localhost:8001',
});

const configuredApiUrl = process.env.EXPO_PUBLIC_API_URL?.trim();

function normalizeBaseUrl(value: string) {
  return value.replace(/\/+$/, '');
}

export const API_BASE_URL = normalizeBaseUrl(
  configuredApiUrl && configuredApiUrl.length > 0
    ? configuredApiUrl
    : `${DEFAULT_API_ORIGIN}/api/v1`,
);

export const API_ORIGIN = API_BASE_URL.replace(/\/api\/v1$/, '');

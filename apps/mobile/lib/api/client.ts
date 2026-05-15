import { API_BASE_URL } from '@/lib/api/config';

type RequestMethod = 'DELETE' | 'GET' | 'PATCH' | 'POST';

type RequestOptions = {
  accessToken?: string | null;
  body?: unknown;
  method?: RequestMethod;
};

type ErrorPayload = {
  detail?: string | { msg?: string }[] | Record<string, unknown>;
};

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

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

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: options.method ?? 'GET',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(options.accessToken ? { Authorization: `Bearer ${options.accessToken}` } : null),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as ErrorPayload | null;
    throw new ApiError(extractErrorMessage(payload, 'Request failed.'), response.status);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

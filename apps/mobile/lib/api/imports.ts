import { API_BASE_URL } from '@/lib/api/config';
import { ApiError, apiRequest } from '@/lib/api/client';

export type CSVImportPreviewRow = {
  amount: string;
  category_id: string | null;
  category_name: string | null;
  fingerprint: string;
  note: string | null;
  raw_preview: Record<string, string>;
  row_index: number;
  title: string;
  transaction_date: string;
  type: 'expense' | 'income';
};

export type CSVImportSkippedRow = {
  raw_preview: Record<string, string>;
  reason: string;
  row_index: number;
};

export type CSVImportPreviewResponse = {
  detected_columns: string[];
  parsed_count: number;
  rows: CSVImportPreviewRow[];
  skipped_count: number;
  skipped_rows: CSVImportSkippedRow[];
  source_name: string | null;
};

export type CSVImportConfirmPayload = {
  original_parsed_count?: number | null;
  rows: Array<{
    amount: string;
    category_id: string | null;
    fingerprint: string;
    note: string | null;
    row_index: number;
    title: string;
    transaction_date: string;
    type: 'expense' | 'income';
  }>;
  source_name: string | null;
};

export type CSVImportConfirmResponse = {
  imported_count: number;
  imported_transaction_ids: string[];
  skipped_duplicate_count: number;
  skipped_duplicates: number[];
  source_name: string | null;
};

export type ImportHistoryItem = {
  id: string;
  source_name: string | null;
  original_parsed_count: number;
  requested_count: number;
  imported_count: number;
  ignored_count: number;
  skipped_duplicate_count: number;
  transaction_date_from: string | null;
  transaction_date_to: string | null;
  created_at: string;
  updated_at: string;
};

export type ImportHistoryResponse = {
  items: ImportHistoryItem[];
};

type UploadableCSVFile = {
  mimeType?: string | null;
  name: string;
  uri: string;
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

export async function previewCSVImport(
  accessToken: string,
  file: UploadableCSVFile,
): Promise<CSVImportPreviewResponse> {
  const formData = new FormData();
  formData.append(
    'file',
    {
      name: file.name,
      type: file.mimeType ?? 'text/csv',
      uri: file.uri,
    } as never,
  );

  const response = await fetch(`${API_BASE_URL}/imports/csv/preview`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: formData,
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as ErrorPayload | null;
    throw new ApiError(extractErrorMessage(payload, 'Could not preview this CSV file.'), response.status);
  }

  return (await response.json()) as CSVImportPreviewResponse;
}

export function confirmCSVImport(accessToken: string, payload: CSVImportConfirmPayload) {
  return apiRequest<CSVImportConfirmResponse>('/imports/csv/confirm', {
    accessToken,
    body: payload,
    method: 'POST',
  });
}

export function getImportHistory(accessToken: string) {
  return apiRequest<ImportHistoryResponse>('/imports/history', {
    accessToken,
  });
}

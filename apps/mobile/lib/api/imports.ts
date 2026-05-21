import { apiRequest } from '@/lib/api/client';
import { EncodingType, readAsStringAsync } from 'expo-file-system/legacy';

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

export async function previewCSVImport(
  accessToken: string,
  file: UploadableCSVFile,
): Promise<CSVImportPreviewResponse> {
  const extension = file.name.toLowerCase().split('.').pop();

  if (extension === 'xlsx') {
    const contentBase64 = await readAsStringAsync(file.uri, {
      encoding: EncodingType.Base64,
    });

    return apiRequest<CSVImportPreviewResponse>('/imports/xlsx/preview-base64', {
      accessToken,
      body: {
        content_base64: contentBase64,
        source_name: file.name,
      },
      method: 'POST',
    });
  }

  const content = await readAsStringAsync(file.uri);

  return apiRequest<CSVImportPreviewResponse>('/imports/csv/preview-text', {
    accessToken,
    body: {
      content,
      source_name: file.name,
    },
    method: 'POST',
  });
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

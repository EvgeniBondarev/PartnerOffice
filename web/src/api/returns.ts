import { request, requestFile } from './client';
import { apiUrl } from '../config';
import type { ReturnsSection } from '../returns/useReturnsQuery';
import type { ReturnEvent, ReturnPair } from '../returns/ReturnHistory';

/** Wire contracts shared by the returns list and its unit rows. */
export interface ReturnRow {
  key?: string; return_type?: string; id: number | null; client_id: string; posting_number: string | null; barcode: string | null;
  box_id?: number | null; box_barcode?: string | null; sku?: number | null; name: string | null; offer_id: string | null; qty: number | null;
  status: string | null; status_name: string | null; target_place: string | null; target_place_addr: string | null; return_date: string | null;
  image_url?: string | null; batch_id?: string | null; ii_code?: string | null;
  onec?: { status: 'accepted' | 'processing' | 'none'; number?: string | null; at?: string | null };
  review?: 'queue' | null;
  decision?: { outcome?: string; status?: string; status_name?: string | null; status_at?: string | null; warehouse?: string | null; doc_number?: string | null; ttn?: { name: string; size: number } | null; onec?: { number?: string | null; at?: string | null }; partner_ack_at?: string | null; reservations?: ShelfReservation[] | null };
  mark?: string; defect?: boolean; missort?: boolean; comment?: string; marked_by?: string;
  units?: ReturnRow[]; unitOf?: string; schema?: string[] | null; supplier?: string | null;
  pair?: ReturnPair | null; history?: ReturnEvent[] | null;
}

/** Резерв позиции «Полки» под заказ партнёра: reserved — «В резерве», written_off — «Списан» (заказ отправлен или штуки уже нет на складе в 1С: source «onec», заказа нет). */
export interface ShelfReservation { order_id: number; posting_number?: string | null; qty: number; state: 'reserved' | 'written_off'; state_name?: string | null; at?: string | null; source?: 'onec' | null }

export type ReturnMark = Pick<ReturnRow, 'mark' | 'defect' | 'missort' | 'comment' | 'marked_by'> & {
  /** Сервер подтвердил постановку на разбор: в интерфейсе показываем уведомление. */
  review_submitted?: boolean;
};
export type MarkPatch = { status?: 'pending' | 'accepted' | 'rejected'; defect?: boolean; missort?: boolean; comment?: string };
export type BatchMarkResult = { key: string; ok: boolean; changes?: ReturnMark; error?: string };
export interface ReturnPage {
  items: ReturnRow[]; total: number; page: number; page_size: number; snapshot_at: string | null;
  fbo_snapshot_at?: string | null; partial: boolean; exact_search?: boolean; revision?: string | null;
  facets?: { client_ids?: string[]; statuses?: string[]; marks?: string[]; mark_subs?: string[]; reviews?: string[] } | null;
  suppliers?: string[] | null; cabinets?: { id: number; name: string; ozonClientId: string }[];
}
export interface ReturnChanges {
  revision?: string | null; changed: boolean; reset: boolean; upsert: ReturnRow[]; remove: string[];
  counts: Partial<Record<ReturnsSection, number>>;
}

export type ReturnListOptions = { page?: number; pageSize?: number; filters?: Record<string, string>; signal?: AbortSignal };
const ROOT = '/partner-api/returns';
const sectionParams = (section: ReturnsSection): Record<string, string> =>
  section === 'supplier' ? { section: 'outbound', to: 'supplier' }
    : section === 'warehouse' ? { section: 'outbound', to: 'us' } : { section };

export function listReturns(section: ReturnsSection, { page = 1, pageSize = 50, filters = {}, signal }: ReturnListOptions = {}): Promise<ReturnPage> {
  const query = new URLSearchParams({ ...sectionParams(section), page: String(page), pageSize: String(pageSize), ...filters });
  return request<ReturnPage>(`${ROOT}?${query}`, { signal });
}

/** Supplier and warehouse are returned as `supplier` and `us` by the aggregate endpoint. */
export interface ReturnCounts { counts: Partial<Record<'waiting' | 'transit' | 'received' | 'shelf' | 'supplier' | 'us' | 'outbound', number>> }
export function getReturnCounts(signal?: AbortSignal): Promise<ReturnCounts> {
  return request<ReturnCounts>(`${ROOT}/counts`, { signal });
}

/** Address of the server-sent revision stream (EventSource cannot go through `request`). */
export const returnEventsUrl = (): string => apiUrl(`${ROOT}/events`);

export function getReturnChanges(since: string, loadedKeys: string[], signal?: AbortSignal): Promise<ReturnChanges> {
  const query = new URLSearchParams({ since });
  loadedKeys.forEach(key => query.append('loaded_key', key));
  return request<ReturnChanges>(`${ROOT}/changes?${query}`, { signal });
}

/** The single-key endpoint is also used for exact-match scanner acceptance. */
export function markReturn(key: string, patch: MarkPatch): Promise<ReturnMark> {
  return request<ReturnMark>(`${ROOT}/mark`, { method: 'POST', body: JSON.stringify({ key, ...patch }) });
}

export interface MarkReturnsResponse { results: BatchMarkResult[] }
/**
 * Batch mark is idempotent by `operationId`: the caller owns it and must resend the same value when it repeats
 * the same request (retry, uncertain network failure). There is deliberately no per-key legacy fallback:
 * non-atomic single writes cannot be deduplicated.
 */
export async function markReturns(keys: string[], patch: MarkPatch, operationId: string): Promise<MarkReturnsResponse> {
  const response = await request<{ results: BatchMarkResult[] }>(`${ROOT}/marks`, {
    method: 'POST', body: JSON.stringify({ operationId, keys, ...patch })
  });
  return { results: response.results };
}

/** `created: false` means the server already stored this client id (a retry that had actually succeeded). */
export interface ReturnPhoto { id: string; created?: boolean }
const photoPath = (key: string, id?: string) => `${ROOT}/photos${id === undefined ? '' : `/${encodeURIComponent(id)}`}?key=${encodeURIComponent(key)}`;
export const returnPhotoUrl = (key: string, id: string): string => apiUrl(photoPath(key, id));

export function listReturnPhotos(key: string, signal?: AbortSignal): Promise<ReturnPhoto[]> {
  return request<ReturnPhoto[]>(photoPath(key), { signal });
}

export async function deleteReturnPhoto(key: string, id: string): Promise<void> {
  await request<unknown>(photoPath(key, id), { method: 'DELETE' });
}

/**
 * Idempotent upload: PUT under a client-generated photo id, so repeating it with the same id never duplicates the photo.
 * Multipart authentication, errors and expired sessions use the shared API client.
 */
export function uploadReturnPhoto(key: string, file: File, id: string): Promise<ReturnPhoto> {
  const form = new FormData();
  form.append('file', file);
  return request<ReturnPhoto>(photoPath(key, id), { method: 'PUT', body: form });
}

/** Fetches the PDF; the caller owns the object URL and download filename. */
export function downloadReturnTtn(key: string, signal?: AbortSignal): Promise<{ blob: Blob; headers: Headers }> {
  return requestFile(`${ROOT}/ttn?key=${encodeURIComponent(key)}`, { signal });
}

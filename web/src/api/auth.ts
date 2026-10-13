import { request } from './client';

export interface PartnerProfile {
  id: number;
  name: string;
  /** Почта, на которую приходят коды входа. */
  email: string | null;
  /** Коды возможностей, которые включил владелец (LabelPrint, Assemble, TrackNumber). Просмотр заказов доступен всегда. */
  permissions?: Array<number | string>;
}

/** Тело ответа 429: блокировка после неверных кодов (lockedUntilUtc) или слишком частый запрос кода (retryAfterSeconds). */
export interface LockedResponse {
  error: string;
  lockedUntilUtc?: string;
  retryAfterSeconds?: number;
}

const post = <T>(path: string, body: unknown, signal?: AbortSignal) =>
  request<T>(path, { method: 'POST', body: JSON.stringify(body), signal });

/** Название организации по точной почте партнёра. Для незнакомой почты name = null. */
export const lookupOrganization = (email: string, signal?: AbortSignal) =>
  post<{ name: string | null }>('/partner-api/auth/lookup', { email: email.trim() }, signal);

/** Просит сервер отправить код на почту. Ответ 202 одинаков для любой почты. */
export const requestCode = (email: string) => post<null>('/partner-api/auth/code/request', { email: email.trim() });

/** Входит по коду из письма. Пробелы в коде сервер игнорирует. */
export const verifyCode = (email: string, code: string) =>
  post<{ id: number; name: string; email: string }>('/partner-api/auth/code/verify', { email: email.trim(), code });

export const logout = () => request<null>('/partner-api/auth/logout', { method: 'POST' });

export const fetchMe = () => request<PartnerProfile>('/partner-api/auth/me');

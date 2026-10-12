import { request } from './client';

export interface PartnerProfile {
  id: number;
  name: string;
  login: string;
  /** Коды возможностей, которые включил владелец (LabelPrint, Assemble, TrackNumber). Просмотр заказов доступен всегда. */
  permissions?: Array<number | string>;
}

export interface LockedResponse {
  error: string;
  lockedUntilUtc?: string;
}

export const login = (loginName: string, password: string) =>
  request<{ id: number; name: string; login: string }>('/partner-api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ login: loginName.trim(), password })
  });

export const logout = () => request<null>('/partner-api/auth/logout', { method: 'POST' });

export const fetchMe = () => request<PartnerProfile>('/partner-api/auth/me');

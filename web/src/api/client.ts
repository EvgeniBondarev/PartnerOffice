import { API_BASE_URL, apiUrl } from '../config';

/** Ошибка запроса к API. status 0 — сервер недоступен (нет сети, прокси не достучался до Studio2). */
export class ApiError extends Error {
  readonly status: number;
  readonly data: unknown;

  constructor(status: number, message: string, data?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

const NETWORK_MESSAGE = 'Нет связи с сервером. Проверьте интернет и попробуйте ещё раз.';

/**
 * Запрос к API партнёра. Сессия живёт в cookie (HttpOnly, SameSite=Strict), поэтому токены в браузере не хранятся.
 * Тело ошибки сервера вида { error: "…" } превращается в ApiError с понятным текстом.
 */
export async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(apiUrl(path), {
      // Другой origin (прод: API на studio2.mpsuper.ru) — cookie сессии нужно отправлять явно.
      credentials: API_BASE_URL ? 'include' : 'same-origin',
      ...init,
      headers: { Accept: 'application/json', ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...init.headers }
    });
  } catch {
    throw new ApiError(0, NETWORK_MESSAGE);
  }

  const text = await response.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }

  if (!response.ok) {
    const serverMessage = (data as { error?: unknown } | null)?.error;
    const message =
      typeof serverMessage === 'string' && serverMessage
        ? serverMessage
        : response.status >= 500
          ? 'Сервер временно недоступен. Попробуйте позже.'
          : `Запрос не выполнен (${response.status})`;
    throw new ApiError(response.status, message, data);
  }

  return data as T;
}

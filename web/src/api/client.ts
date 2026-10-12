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

/**
 * Сессия закончилась (401 на любом методе, кроме входа): приложение должно показать форму входа.
 * Обработчик ставит AuthProvider.
 */
let unauthorizedHandler: (() => void) | null = null;
export const setUnauthorizedHandler = (handler: (() => void) | null) => {
  unauthorizedHandler = handler;
};

const NETWORK_MESSAGE = 'Нет связи с сервером. Проверьте интернет и попробуйте ещё раз.';

/**
 * Запрос к API партнёра. Сессия живёт в cookie (HttpOnly, SameSite=Strict), поэтому токены в браузере не хранятся.
 * Тело ошибки сервера вида { error: "…" } превращается в ApiError с понятным текстом.
 */
async function send(path: string, init: RequestInit): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(apiUrl(path), {
      // Другой origin (прод: API на studio2.mpsuper.ru) — cookie сессии нужно отправлять явно.
      credentials: API_BASE_URL ? 'include' : 'same-origin',
      ...init,
      headers: { ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...init.headers }
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new ApiError(0, NETWORK_MESSAGE);
  }

  if (!response.ok) {
    const text = await response.text();
    let data: unknown = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = null;
      }
    }

    const serverMessage = (data as { error?: unknown } | null)?.error;
    const message =
      typeof serverMessage === 'string' && serverMessage
        ? serverMessage
        : response.status >= 500
          ? 'Сервер временно недоступен. Попробуйте позже.'
          : `Запрос не выполнен (${response.status})`;

    if (response.status === 401 && !path.startsWith('/partner-api/auth/')) unauthorizedHandler?.();
    throw new ApiError(response.status, message, data);
  }

  return response;
}

/**
 * Запрос к API партнёра. Сессия живёт в cookie (HttpOnly, SameSite=Strict), поэтому токены в браузере не хранятся.
 * Тело ошибки сервера вида { error: "…" } превращается в ApiError с понятным текстом.
 */
export async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await send(path, { ...init, headers: { Accept: 'application/json', ...init.headers } });
  const text = await response.text();
  if (!text) return null as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null as T;
  }
}

/** Запрос файла (PDF этикетки). Ошибки приходят JSON-ом и разбираются так же, как в <see cref="request"/>. */
export async function requestFile(path: string, init: RequestInit = {}): Promise<{ blob: Blob; headers: Headers }> {
  const response = await send(path, { ...init, headers: { Accept: 'application/pdf, application/json', ...init.headers } });
  return { blob: await response.blob(), headers: response.headers };
}

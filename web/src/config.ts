/**
 * Адрес API Studio2. Пусто — запросы идут на тот же origin (в разработке их проксирует Vite на локальную Studio2).
 * Задаётся переменной VITE_API_BASE_URL: .env.development, .env.production или .env.local.
 */
export const API_BASE_URL: string = (import.meta.env.VITE_API_BASE_URL ?? '').trim().replace(/\/+$/, '');

/** Полный адрес метода API. База передаётся параметром, чтобы функцию можно было проверить без переменных окружения. */
export const apiUrl = (path: string, base: string = API_BASE_URL): string => `${base}${path}`;

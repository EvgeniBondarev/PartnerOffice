import { ApiError } from '../api/client';

/** Текст ошибки для пользователя и подробности (причины Ozon), если сервер их отдал. */
export function describeError(error: unknown, fallback = 'Не удалось выполнить действие. Попробуйте ещё раз.'): { message: string; reasons: string[] } {
  if (error instanceof ApiError) {
    const reasons = (error.data as { reasons?: unknown } | null)?.reasons;
    return { message: error.message || fallback, reasons: Array.isArray(reasons) ? reasons.filter((r): r is string => typeof r === 'string') : [] };
  }
  return { message: fallback, reasons: [] };
}

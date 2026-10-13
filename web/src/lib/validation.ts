/** Правила совпадают с серверными (Studio2, PartnerEmail): почта до 320 символов, код из 6 цифр. */
export const EMAIL_MAX = 320;
export const CODE_LENGTH = 6;

// Как на сервере: что-то@что-то.зона, без пробелов и второй «@».
const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/;

/** Возвращает текст ошибки для поля почты или null, если значение подходит. */
export function validateEmail(value: string): string | null {
  const email = value.trim();
  if (email.length === 0) return 'Введите почту';
  if (/\s/.test(email)) return 'В почте не должно быть пробелов';
  if (!email.includes('@')) return 'В почте не хватает «@», например name@company.ru';
  if ((email.match(/@/g) ?? []).length > 1) return 'В почте должна быть одна «@»';
  if (email.startsWith('@')) return 'Перед «@» впишите имя почтового ящика';
  if (email.endsWith('@')) return 'После «@» впишите домен, например company.ru';
  if (!EMAIL_PATTERN.test(email)) return 'Домен указан неполностью, например company.ru';
  if (email.length > EMAIL_MAX) return `Почта не длиннее ${EMAIL_MAX} символов`;
  return null;
}

/** Оставляет в коде только цифры: из письма его часто копируют с пробелами. */
export const normalizeCode = (value: string): string => value.replace(/\D/g, '').slice(0, CODE_LENGTH);

export function validateCode(value: string): string | null {
  const digits = value.replace(/\D/g, '');
  if (digits.length === 0) return 'Введите код из письма';
  if (digits.length < CODE_LENGTH) return `Код состоит из ${CODE_LENGTH} цифр`;
  if (digits.length > CODE_LENGTH || /[^\d\s]/.test(value)) return `Код состоит из ${CODE_LENGTH} цифр`;
  return null;
}

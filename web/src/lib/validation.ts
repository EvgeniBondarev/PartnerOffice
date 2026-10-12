/** Правила совпадают с серверными (Studio2, PartnerManagementService): логин 3–100 символов, пароль не короче 8. */
export const LOGIN_MIN = 3;
export const LOGIN_MAX = 100;
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 200;

const LOGIN_PATTERN = /^[a-z0-9._@-]+$/i;

/** Возвращает текст ошибки для поля или null, если значение подходит. */
export function validateLogin(value: string): string | null {
  const login = value.trim();
  if (login.length === 0) return 'Введите логин';
  if (/\s/.test(login)) return 'В логине не должно быть пробелов';
  if (!LOGIN_PATTERN.test(login)) return 'Логин: латиница, цифры и символы . _ @ -';
  if (login.length < LOGIN_MIN) return `Логин не короче ${LOGIN_MIN} символов`;
  if (login.length > LOGIN_MAX) return `Логин не длиннее ${LOGIN_MAX} символов`;
  return null;
}

export function validatePassword(value: string): string | null {
  if (value.length === 0) return 'Введите пароль';
  if (value.length < PASSWORD_MIN) return `Пароль не короче ${PASSWORD_MIN} символов`;
  if (value.length > PASSWORD_MAX) return 'Пароль слишком длинный';
  return null;
}

export interface LoginErrors {
  login: string | null;
  password: string | null;
}

export function validateLoginForm(login: string, password: string): LoginErrors {
  return { login: validateLogin(login), password: validatePassword(password) };
}

export const hasErrors = (errors: LoginErrors) => errors.login !== null || errors.password !== null;

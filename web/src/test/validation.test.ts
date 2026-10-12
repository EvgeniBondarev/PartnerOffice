import { describe, expect, it } from 'vitest';
import { hasErrors, validateLogin, validateLoginForm, validatePassword } from '../lib/validation';

describe('validateLogin', () => {
  it.each([
    ['', 'Введите логин'],
    ['   ', 'Введите логин'],
    ['ab', 'Логин не короче 3 символов'],
    ['has space', 'В логине не должно быть пробелов'],
    ['иван', 'Логин: латиница, цифры и символы . _ @ -'],
    ['a'.repeat(101), 'Логин не длиннее 100 символов']
  ])('«%s» → %s', (value, message) => {
    expect(validateLogin(value)).toBe(message);
  });

  it.each(['abc', 'Kazan_01', 'ivan.petrov@mail.ru', 'a-b', '  trimmed  '])('«%s» подходит', (value) => {
    expect(validateLogin(value)).toBeNull();
  });
});

describe('validatePassword', () => {
  it('требует пароль и минимум 8 символов', () => {
    expect(validatePassword('')).toBe('Введите пароль');
    expect(validatePassword('1234567')).toBe('Пароль не короче 8 символов');
    expect(validatePassword('12345678')).toBeNull();
  });

  it('не режет пробелы и спецсимволы внутри пароля', () => {
    expect(validatePassword('  pass word!  ')).toBeNull();
  });

  it('отсекает слишком длинный пароль', () => {
    expect(validatePassword('x'.repeat(201))).toBe('Пароль слишком длинный');
  });
});

describe('validateLoginForm', () => {
  it('собирает ошибки обоих полей', () => {
    const errors = validateLoginForm('', 'short');
    expect(errors).toEqual({ login: 'Введите логин', password: 'Пароль не короче 8 символов' });
    expect(hasErrors(errors)).toBe(true);
    expect(hasErrors(validateLoginForm('kazan', 'password1'))).toBe(false);
  });
});

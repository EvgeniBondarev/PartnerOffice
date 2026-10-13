import { describe, expect, it } from 'vitest';
import { normalizeCode, validateCode, validateEmail } from '../lib/validation';

describe('validateEmail', () => {
  it.each([
    ['', 'Введите почту'],
    ['   ', 'Введите почту'],
    ['has space@acme.ru', 'В почте не должно быть пробелов'],
    ['no-at-sign', 'В почте не хватает «@», например name@company.ru'],
    ['two@@acme.ru', 'В почте должна быть одна «@»'],
    ['a@b@acme.ru', 'В почте должна быть одна «@»'],
    ['@acme.ru', 'Перед «@» впишите имя почтового ящика'],
    ['boss@', 'После «@» впишите домен, например company.ru'],
    ['boss@acme', 'Домен указан неполностью, например company.ru'],
    ['boss@acme.', 'Домен указан неполностью, например company.ru'],
    ['boss@acme.r', 'Домен указан неполностью, например company.ru']
  ])('«%s» → %s', (value, message) => {
    expect(validateEmail(value)).toBe(message);
  });

  it('отсекает слишком длинную почту', () => {
    expect(validateEmail(`${'a'.repeat(320)}@acme.ru`)).toBe('Почта не длиннее 320 символов');
  });

  it.each(['boss@acme.ru', 'Ivan.Petrov+orders@mail.company.ru', '  trimmed@acme.ru  ', 'a-b_c@x.io'])('«%s» подходит', (value) => {
    expect(validateEmail(value)).toBeNull();
  });
});

describe('normalizeCode', () => {
  it('оставляет только цифры и обрезает до шести', () => {
    expect(normalizeCode('123 456')).toBe('123456');
    expect(normalizeCode('12-34ab56')).toBe('123456');
    expect(normalizeCode('1234567890')).toBe('123456');
    expect(normalizeCode('abc')).toBe('');
  });
});

describe('validateCode', () => {
  it('требует ровно шесть цифр', () => {
    expect(validateCode('')).toBe('Введите код из письма');
    expect(validateCode('12345')).toBe('Код состоит из 6 цифр');
    expect(validateCode('1234567')).toBe('Код состоит из 6 цифр');
    expect(validateCode('12345a')).toBe('Код состоит из 6 цифр');
    expect(validateCode('123456')).toBeNull();
    expect(validateCode('123 456')).toBeNull();
  });
});

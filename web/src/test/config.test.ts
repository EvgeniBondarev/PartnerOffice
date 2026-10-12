import { describe, expect, it } from 'vitest';
import { apiUrl } from '../config';

describe('apiUrl', () => {
  it('без базы оставляет путь как есть: запрос идёт на тот же origin, в разработке его проксирует Vite', () => {
    expect(apiUrl('/partner-api/auth/me', '')).toBe('/partner-api/auth/me');
  });

  it('с базой дописывает путь к адресу Studio2', () => {
    expect(apiUrl('/partner-api/auth/me', 'https://studio2.mpsuper.ru')).toBe('https://studio2.mpsuper.ru/partner-api/auth/me');
  });
});

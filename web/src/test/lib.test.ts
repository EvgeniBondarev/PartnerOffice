import { describe, expect, it } from 'vitest';
import { canShipOzonOrder, formatDateTime, formatDateTimeShort, formatMoney, formatQuantity, formatRange, isOverdue, ozonStatusTone, toIsoDate, fromIsoDate } from '../lib/format';
import { ozonImage } from '../lib/images';
import { hasPermission, isOzonOrder } from '../lib/permissions';
import { validateExemplar } from '../orders/RequirementsDialog';
import { buildOrdersQuery } from '../api/orders';
import { readFilters, toQuery, writeParams } from '../orders/params';

describe('формат', () => {
  it('сумма: неразрывный пробел в тысячах, запятая, ₽', () => {
    expect(formatMoney(1250)).toBe('1 250,00 ₽');
    expect(formatMoney(1234567.5)).toBe('1 234 567,50 ₽');
    expect(formatMoney(null)).toBe('—');
  });

  it('количество и даты', () => {
    expect(formatQuantity(3)).toBe('3 шт.');
    expect(formatQuantity(null)).toBe('—');
    expect(formatDateTime('2026-10-13T18:00:00', new Date(2026, 9, 1))).toBe('13 октября, 18:00');
    expect(formatDateTime('2025-10-13T18:00:00', new Date(2026, 9, 1))).toContain('2025');
    expect(formatDateTimeShort('2026-10-13T08:05:00')).toBe('13.10.2026, 08:05');
    expect(formatDateTime(null)).toBe('—');
  });

  it('период и ISO-даты по местному времени', () => {
    expect(toIsoDate(new Date(2026, 0, 5))).toBe('2026-01-05');
    expect(fromIsoDate('2026-02-30')).toBeNull();
    expect(fromIsoDate('мусор')).toBeNull();
    expect(formatRange('2026-04-12', '2026-10-12')).toBe('12.04.2026 – 12.10.2026');
    expect(formatRange('2026-04-12', '')).toBe('с 12.04.2026');
    expect(formatRange('', '2026-10-12')).toBe('по 12.10.2026');
    expect(formatRange('', '')).toBe('');
  });

  it('просрочка только у ещё не собранных заказов', () => {
    const now = new Date(2026, 9, 12, 12, 0);
    expect(isOverdue('2026-10-12T11:00:00', 'Ожидает отгрузки', now)).toBe(true);
    expect(isOverdue('2026-10-12T13:00:00', 'Ожидает отгрузки', now)).toBe(false);
    expect(isOverdue('2026-10-12T11:00:00', 'Доставляется', now)).toBe(false);
    expect(isOverdue(null, 'Ожидает отгрузки', now)).toBe(false);
  });

  it('тон статуса Ozon', () => {
    expect(ozonStatusTone('Отменён')).toBe('negative');
    expect(ozonStatusTone('Доставлен')).toBe('success');
    expect(ozonStatusTone('Ожидает упаковки')).toBe('warning');
    expect(ozonStatusTone('Доставляется')).toBe('neutral');
    expect(ozonStatusTone(null)).toBe('neutral');
  });

  it('разрешает отгрузку только в статусе awaiting_packaging', () => {
    expect(canShipOzonOrder('Ожидает сборки')).toBe(true);
    expect(canShipOzonOrder('awaiting_packaging')).toBe(true);
    expect(canShipOzonOrder('Ожидает отгрузки')).toBe(false);
    expect(canShipOzonOrder('Доставляется')).toBe(false);
  });
});

describe('картинки Ozon', () => {
  it('уменьшенная версия через ir.ozone.ru, чужие адреса не трогаем', () => {
    expect(ozonImage('https://cdn1.ozone.ru/s3/multimedia-1-h/9121075469.jpg', 100)).toBe('https://ir.ozone.ru/s3/multimedia-1-h/c100/9121075469.jpg');
    expect(ozonImage('https://ir.ozone.ru/s3/multimedia-6/c800/6742048830.jpg', 200)).toBe('https://ir.ozone.ru/s3/multimedia-6/c200/6742048830.jpg');
    expect(ozonImage('https://ir-3.ozone.ru/s3/multimedia-1-z/8081648855.jpg', 100)).toBe('https://ir.ozone.ru/s3/multimedia-1-z/c100/8081648855.jpg');
    expect(ozonImage('https://example.com/a.jpg', 100)).toBe('https://example.com/a.jpg');
    expect(ozonImage(null, 100)).toBeNull();
  });
});

describe('права', () => {
  it('коды приходят числами, имена тоже принимаются', () => {
    expect(hasPermission({ permissions: [1] }, 'LabelPrint')).toBe(true);
    expect(hasPermission({ permissions: [1] }, 'Assemble')).toBe(false);
    expect(hasPermission({ permissions: ['Assemble'] }, 'Assemble')).toBe(true);
    expect(hasPermission(null, 'Assemble')).toBe(false);
    expect(isOzonOrder('ozon')).toBe(true);
    expect(isOzonOrder('YANDEX')).toBe(false);
  });
});

describe('форма данных экземпляров', () => {
  const requirement = { shipmentNumber: 'X', productId: 1, productName: 'P', offerId: 'O', exemplarId: 1, index: 1, quantity: 1, needsMandatoryMark: true, needsGtd: true, needsRnpt: true, unsupported: [] };
  const empty = { mandatoryMark: '', gtd: '', gtdAbsent: false, rnpt: '', rnptAbsent: false };

  it('пустая форма требует всё, «отсутствует» снимает требование ГТД и РНПТ, но не маркировки', () => {
    expect(Object.keys(validateExemplar(requirement, empty))).toEqual(['mandatoryMark', 'gtd', 'rnpt']);
    expect(validateExemplar(requirement, { ...empty, mandatoryMark: 'code', gtdAbsent: true, rnptAbsent: true })).toEqual({});
    expect(validateExemplar(requirement, { ...empty, gtdAbsent: true, rnptAbsent: true })).toHaveProperty('mandatoryMark');
  });

  it('поля, которые Ozon не просит, не проверяются', () => {
    expect(validateExemplar({ ...requirement, needsMandatoryMark: false, needsGtd: false, needsRnpt: true }, { ...empty, rnpt: '123' })).toEqual({});
  });
});

describe('фильтры в адресе и запрос', () => {
  it('туда и обратно, пустые значения в адрес не попадают', () => {
    const filters = { search: ' 122RU19=HSH ', ozonStatus: 'Ожидает сборки', warehouseId: '', clientId: '', from: '2026-10-01', to: '' };
    const params = writeParams(filters);
    expect(params.toString()).toBe('search=122RU19%3DHSH&ozonStatus=%D0%9E%D0%B6%D0%B8%D0%B4%D0%B0%D0%B5%D1%82+%D1%81%D0%B1%D0%BE%D1%80%D0%BA%D0%B8&from=2026-10-01');
    expect(readFilters(params)).toEqual({ ...filters, search: '122RU19=HSH' });
  });

  it('в запрос к API идут числа и только заполненное', () => {
    const query = toQuery({ search: '', ozonStatus: 'Ожидает сборки', warehouseId: 'x', clientId: '', from: '', to: '2026-10-12' });
    expect(query).toEqual({ search: undefined, ozonStatus: 'Ожидает сборки', warehouseId: undefined, clientId: undefined, from: undefined, to: '2026-10-12' });
    expect(buildOrdersQuery({ ...query, page: 3, pageSize: 50 })).toBe('ozonStatus=%D0%9E%D0%B6%D0%B8%D0%B4%D0%B0%D0%B5%D1%82+%D1%81%D0%B1%D0%BE%D1%80%D0%BA%D0%B8&to=2026-10-12&page=3&pageSize=50');
  });
});

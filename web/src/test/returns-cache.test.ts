import { beforeEach, describe, expect, it } from 'vitest';
import {
  applyReturnsDelta, clearReturnsCache, mergeRows, replaceFirstPage, readCounts, readList, rememberCounts, rememberList, returnsCacheEpoch, returnsCacheSize
} from '../returns/returnsCache';

type Row = { key?: string; name?: string; units?: Row[] };
const row = (key: string, name = key): Row => ({ key, name });
const entry = (items: Row[], pagesLoaded = 1) => ({ data: { revision: 'r1' }, items, pagesLoaded });
const counts = { waiting: 1, transit: null, received: null, shelf: null, supplier: null, warehouse: null };

describe('кэш возвратов', () => {
  beforeEach(() => clearReturnsCache());

  it('хранит все загруженные порции и счётчики партнёра', () => {
    const epoch = returnsCacheEpoch();
    expect(rememberList(epoch, '1|/list', entry([row('a'), row('b')], 2))).toBe(true);
    expect(rememberCounts(epoch, 1, counts)).toBe(true);
    expect(readList<unknown, Row>('1|/list')?.pagesLoaded).toBe(2);
    expect(readList<unknown, Row>('1|/list')?.items.map(item => item.key)).toEqual(['a', 'b']);
    expect(readCounts(1)).toEqual(counts);
  });

  it('очистка (выход, 401) стирает всё и меняет эпоху: ответ, запрошенный до неё, не возвращает данные в кэш', () => {
    const epoch = returnsCacheEpoch();
    rememberList(epoch, '1|/list', entry([row('a')]));
    rememberCounts(epoch, 1, counts);
    clearReturnsCache();
    expect(returnsCacheSize()).toEqual({ lists: 0, counts: 0 });
    expect(returnsCacheEpoch()).not.toBe(epoch);
    expect(rememberList(epoch, '1|/list', entry([row('late')]))).toBe(false);
    expect(rememberCounts(epoch, 1, counts)).toBe(false);
    expect(returnsCacheSize()).toEqual({ lists: 0, counts: 0 });
  });

  it('держит не больше 40 списков, вытесняя давно не открывавшиеся', () => {
    const epoch = returnsCacheEpoch();
    for (let i = 0; i < 45; i++) rememberList(epoch, `1|/list/${i}`, entry([row(String(i))]));
    expect(returnsCacheSize().lists).toBe(40);
    expect(readList('1|/list/0')).toBeUndefined();
    expect(readList('1|/list/44')).toBeDefined();
  });
});

describe('обновление первой порции', () => {
  it('свежая первая порция заменяет свои строки, а строки 2+ остаются на месте и без повторов', () => {
    const current = [row('a', 'old a'), row('b'), row('c'), row('d')];       // a, b — первая порция; c, d — вторая
    const fresh = [row('a', 'new a'), row('b'), row('c', 'dup')];            // c сдвинулась на первую порцию
    const merged = mergeRows(fresh, current);
    expect(merged.map(item => item.key)).toEqual(['a', 'b', 'c', 'd']);
    expect(merged[0].name).toBe('new a');
    expect(merged[2].name).toBe('dup');
  });
});

describe('замена первой порции', () => {
  it('строки прежней первой порции, которых нет в свежей, уходят; порции 2+ остаются на месте', () => {
    const previousFirst = [row('a'), row('b'), row('c')];
    const current = [row('a'), row('b'), row('c'), row('d'), row('e')];
    const merged = replaceFirstPage(current, previousFirst, [row('b', 'new b'), row('c'), row('d', 'moved up')]);
    expect(merged.map(item => item.key)).toEqual(['b', 'c', 'd', 'e']);
    expect(merged[0].name).toBe('new b');
    expect(merged[2].name).toBe('moved up');
  });

  it('строки без ключа прежней первой порции тоже заменяются, а не копятся', () => {
    const keyless = { name: 'без ключа' };
    const merged = replaceFirstPage([keyless, row('x')] as Row[], [keyless], [row('a')]);
    expect(merged.map(item => item.key)).toEqual(['a', 'x']);
  });

  it('строка вне прежней первой порции (из порций 2+) остаётся, даже если свежая первая порция её не содержит', () => {
    expect(replaceFirstPage([row('a'), row('z')], [row('a')], [row('a')]).map(item => item.key)).toEqual(['a', 'z']);
  });
});

describe('дельта возвратов', () => {
  const base = [row('a'), row('b'), row('c')];

  it('известные строки заменяются на месте, удалённые убираются, обновление списка не нужно', () => {
    const result = applyReturnsDelta(base, { upsert: [row('b', 'changed')], remove: ['c'] });
    expect(result.refresh).toBe(false);
    expect(result.items).toEqual([row('a'), row('b', 'changed')]);
  });

  it('неизвестная строка (новая или без ключа) не теряется молча: просим обычное обновление', () => {
    expect(applyReturnsDelta(base, { upsert: [row('new')], remove: [] }).refresh).toBe(true);
    expect(applyReturnsDelta(base, { upsert: [{ name: 'без ключа' }], remove: [] }).refresh).toBe(true);
  });

  it('известные изменения применяются, даже когда рядом есть неизвестные', () => {
    const result = applyReturnsDelta(base, { upsert: [row('a', 'changed'), row('new')], remove: [] });
    expect(result.refresh).toBe(true);
    expect(result.items[0].name).toBe('changed');
    expect(result.items).toHaveLength(3);
  });

  it('ключ штуки внутри свёрнутой строки не заменяет её молча: нужен перечитанный список', () => {
    const grouped: Row[] = [{ key: 'g', units: [row('u1'), row('u2')] }];
    expect(applyReturnsDelta(grouped, { upsert: [row('u1', 'changed')], remove: [] }).refresh).toBe(true);
    expect(applyReturnsDelta(grouped, { upsert: [], remove: ['u2'] }).refresh).toBe(true);
  });

  it('удаление ключа, которого нет в загруженном, ничего не требует', () => {
    const result = applyReturnsDelta(base, { upsert: [], remove: ['zzz'] });
    expect(result.refresh).toBe(false);
    expect(result.items).toEqual(base);
  });
});

import { describe, expect, it } from 'vitest';
import type { ReturnRow } from '../api/returns';
import { displayedRows, looksLikeCode, markSub, subPatch, suggestionLabel, plural } from '../returns/returnsModel';

const row = (extra: Partial<ReturnRow> = {}) => ({ key: 'parent', name: 'Товар', image_url: 'picture', mark: 'accepted', ...extra }) as ReturnRow;

describe('returns presentation model', () => {
  it('expands unit rows with parent image and a collapse key', () => {
    const parent = row({ units: [row({ key: 'unit', image_url: null })] });
    expect(displayedRows([parent], new Set())).toEqual([parent]);
    expect(displayedRows([parent], new Set(['parent']))).toEqual([{ ...parent.units![0], image_url: 'picture', unitOf: 'parent' }]);
  });
  it('shows a substatus only for accepted returns and prioritizes defect', () => {
    expect(markSub(row({ mark: 'pending', defect: true }))).toBe('ok');
    expect(markSub(row({ defect: true, missort: true }))).toBe('defect');
    expect(markSub(row({ missort: true }))).toBe('missort');
  });
  it('clears the opposite flag when creating an accepted substatus patch', () => {
    expect(subPatch('missort')).toEqual({ status: 'accepted', defect: false, missort: true });
  });
  it('recognizes scanner codes without treating ordinary text as a code', () => {
    expect(looksLikeCode('ii14471039742')).toBe(true);
    expect(looksLikeCode('2698515728645041')).toBe(true);
    expect(looksLikeCode('93696056-0024-2')).toBe(true);
    expect(looksLikeCode('Фильтр')).toBe(false);
  });
  it('suggests the matched field rather than a different label', () => {
    expect(suggestionLabel(row({ posting_number: '12345-1234', offer_id: 'ART-7' }), 'art')).toBe('ART-7');
  });
  it('uses Russian plural forms around teen boundaries', () => {
    expect([1, 2, 5, 11, 21].map(n => plural(n, 'возврат', 'возврата', 'возвратов'))).toEqual(['возврат', 'возврата', 'возвратов', 'возвратов', 'возврат']);
  });
});

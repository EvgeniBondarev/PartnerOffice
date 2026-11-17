import type { MarkPatch, ReturnRow } from '../api/returns';

/** Expanded groups display their units with the parent's image and collapse key. */
export const displayedRows = (items: ReturnRow[], expanded: Set<string>): ReturnRow[] => items.flatMap(row =>
  row.units?.length && row.key && expanded.has(row.key) ? row.units.map(unit => ({ ...unit, image_url: row.image_url, unitOf: row.key })) : [row]);

export type MarkSub = 'ok' | 'defect' | 'missort';
/** Ignore legacy substatus flags on non-accepted returns; defect wins if both are set. */
export const markSub = (row: Pick<ReturnRow, 'mark' | 'defect' | 'missort'>): MarkSub => row.mark !== 'accepted' ? 'ok' : row.defect ? 'defect' : row.missort ? 'missort' : 'ok';
export const isResale = (row: ReturnRow) => row.pair?.link === 'resale';
export const subPatch = (sub: MarkSub): MarkPatch => ({ status: 'accepted', defect: sub === 'defect', missort: sub === 'missort' });

export const PAGE_SIZE = 50, LOAD_AHEAD_PX = 400;
export const plural = (n: number, one: string, few: string, many: string) => {
  const tail = n % 100, last = n % 10;
  return tail >= 11 && tail <= 14 ? many : last === 1 ? one : last >= 2 && last <= 4 ? few : many;
};
export const looksLikeCode = (value: string) => /^(?:(?:i{1,2}|bx)\d{6,}|\d{10,}|\d{6,}-\d{3,}(?:-\d+)?)$/i.test(value);
export function suggestionLabel(row: ReturnRow, query: string): string {
  const fields = [row.posting_number, row.pair?.posting_number, row.pair?.barcode, row.box_barcode, row.box_id?.toString(), row.barcode, row.ii_code, row.onec?.number, row.offer_id, row.sku?.toString(), row.name];
  const search = query.toLocaleLowerCase();
  return fields.find(value => value?.toLocaleLowerCase().includes(search)) || row.name || 'Возврат';
}
export const rowKey = (row: ReturnRow) => row.key || `${row.client_id}:${row.id}`;

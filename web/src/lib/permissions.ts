import type { PartnerProfile } from '../api/auth';

/** Возможности, которые включает владелец. Просмотр заказов доступен всегда. */
export type Permission = 'LabelPrint' | 'Assemble' | 'TrackNumber';

const CODES: Record<Permission, number> = { LabelPrint: 1, Assemble: 2, TrackNumber: 3 };

/** Сервер отдаёт коды числами (enum PartnerPermissionCode), но принимаем и имена: формат может смениться. */
export function hasPermission(partner: Pick<PartnerProfile, 'permissions'> | null | undefined, permission: Permission): boolean {
  return (partner?.permissions ?? []).some((value) => value === CODES[permission] || value === permission);
}

export const isOzonOrder = (marketplace: string | null | undefined) => (marketplace ?? '').toUpperCase() === 'OZON';

/** Скелетон дизайн-системы (skeleton.css): показывается, пока данные грузятся. */
export function Skeleton({ width, height, radius = 8 }: { width: number | string; height: number; radius?: number }) {
  return (
    <div
      className="po-skeleton-common__skeleton po-skeleton-common__rectangle"
      style={{ width, height, borderRadius: radius }}
      aria-hidden="true"
    />
  );
}

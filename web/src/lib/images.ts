/**
 * Картинки товаров приходят полноразмерными (cdn1.ozone.ru/s3/<папка>/<файл>.jpg, десятки килобайт).
 * Сервис ir.ozone.ru отдаёт их уменьшенными: …/s3/<папка>/c<размер>/<файл>.jpg. Для миниатюры в таблице нужен c100,
 * для просмотра c800. Чужие адреса возвращаем как есть.
 */
const OZON_IMAGE = /^https?:\/\/(?:cdn\d*|ir(?:-\d+)?)\.ozone\.ru\/s3\/([^/]+)\/(?:c\d+\/)?([^/?#]+)$/i;

export function ozonImage(url: string | null | undefined, size: 100 | 200 | 400 | 800): string | null {
  if (!url) return null;
  const match = OZON_IMAGE.exec(url.trim());
  return match ? `https://ir.ozone.ru/s3/${match[1]}/c${size}/${match[2]}` : url;
}

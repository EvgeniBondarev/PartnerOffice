/** Несколько значений одного фильтра лежат одной строкой через запятую: «pending,accepted». Пустая строка — ничего не выбрано (то есть все). */
export const splitList = (value: string): string[] => value.split(',').map(item => item.trim()).filter(Boolean);
export const joinList = (values: string[]): string => values.join(',');
/** Включает или выключает значение, сохраняя порядок выбора. */
export const toggleValue = (value: string, item: string): string => {
  const list = splitList(value);
  return joinList(list.includes(item) ? list.filter(x => x !== item) : [...list, item]);
};

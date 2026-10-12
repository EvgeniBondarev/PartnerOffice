import { useEffect, useMemo, useState } from 'react';
import { getCountries, saveCountries, saveExemplars, type CountryOption, type ExemplarRequirement, type OrderListItem, type ShipRequirements } from '../api/orders';
import { describeError } from '../lib/errors';
import { Button } from '../ui/Button';
import { Informer } from '../ui/Informer';
import { Overlay } from '../ui/Overlay';
import { SelectField } from '../ui/SelectField';
import { TextField } from '../ui/TextField';

interface RequirementsDialogProps {
  order: OrderListItem;
  requirements: ShipRequirements;
  /** Данные сохранены в Ozon и отправление готово к сборке: можно продолжать отгрузку или печать. */
  onDone: () => void;
  onCancel: () => void;
}

interface ExemplarForm {
  mandatoryMark: string;
  gtd: string;
  gtdAbsent: boolean;
  rnpt: string;
  rnptAbsent: boolean;
}

const keyOf = (e: ExemplarRequirement) => `${e.productId}:${e.exemplarId}:${e.index}`;
const emptyForm = (): ExemplarForm => ({ mandatoryMark: '', gtd: '', gtdAbsent: false, rnpt: '', rnptAbsent: false });

/** Нужно ли что-то спрашивать у партнёра: страны и поля экземпляров. Требования без полей (вес, IMEI) форма не закрывает. */
export const needsInput = (requirements: ShipRequirements) =>
  requirements.countries.length > 0 || requirements.exemplars.some((e) => e.needsMandatoryMark || e.needsGtd || e.needsRnpt);

/** Валидация формы экземпляров: ключ — поле, значение — текст ошибки. Вынесена, чтобы проверяться отдельно. */
export function validateExemplar(requirement: ExemplarRequirement, form: ExemplarForm): Partial<Record<'mandatoryMark' | 'gtd' | 'rnpt', string>> {
  const errors: Partial<Record<'mandatoryMark' | 'gtd' | 'rnpt', string>> = {};
  if (requirement.needsMandatoryMark && !form.mandatoryMark.trim()) errors.mandatoryMark = 'Введите код маркировки';
  if (requirement.needsGtd && !form.gtdAbsent && !form.gtd.trim()) errors.gtd = 'Введите номер ГТД или отметьте, что его нет';
  if (requirement.needsRnpt && !form.rnptAbsent && !form.rnpt.trim()) errors.rnpt = 'Введите РНПТ или отметьте, что его нет';
  return errors;
}

/**
 * Данные, без которых Ozon не соберёт отправление: страна-изготовитель и данные экземпляров
 * (Честный ЗНАК, ГТД, РНПТ). Те же шаги, что в Studio2: сохранить страны, затем экземпляры, дождаться «готово к сборке».
 */
export function RequirementsDialog({ order, requirements, onDone, onCancel }: RequirementsDialogProps) {
  const fillable = useMemo(() => requirements.exemplars.filter((e) => e.needsMandatoryMark || e.needsGtd || e.needsRnpt), [requirements]);
  const unsupported = useMemo(() => Array.from(new Set(requirements.exemplars.flatMap((e) => e.unsupported))), [requirements]);

  const [countries, setCountries] = useState<CountryOption[]>([]);
  const [countriesError, setCountriesError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Record<number, string>>({});
  const [forms, setForms] = useState<Record<string, ExemplarForm>>(() => Object.fromEntries(fillable.map((e) => [keyOf(e), emptyForm()])));
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<{ message: string; reasons: string[] } | null>(null);

  useEffect(() => {
    if (requirements.countries.length === 0) return;
    let cancelled = false;
    getCountries(order.id)
      .then((list) => !cancelled && setCountries(list))
      .catch((error) => !cancelled && setCountriesError(describeError(error, 'Не удалось загрузить список стран.').message));
    return () => {
      cancelled = true;
    };
  }, [order.id, requirements.countries.length]);

  const countryOptions = useMemo(() => countries.map((c) => ({ value: c.countryIsoCode, label: c.name })), [countries]);
  const patch = (key: string, next: Partial<ExemplarForm>) => setForms((previous) => ({ ...previous, [key]: { ...previous[key], ...next } }));

  const exemplarErrors = (e: ExemplarRequirement) => (touched ? validateExemplar(e, forms[keyOf(e)] ?? emptyForm()) : {});
  const missingCountry = (productId: number) => touched && !selected[productId];

  const valid =
    requirements.countries.every((c) => selected[c.productId]) &&
    fillable.every((e) => Object.keys(validateExemplar(e, forms[keyOf(e)] ?? emptyForm())).length === 0);

  const submit = async () => {
    setTouched(true);
    if (!valid) return;
    setBusy(true);
    setFailure(null);
    try {
      if (requirements.countries.length > 0) {
        await saveCountries(
          order.id,
          requirements.countries.map((c) => ({ productId: c.productId, countryIsoCode: selected[c.productId] }))
        );
      }
      if (fillable.length > 0) {
        await saveExemplars(
          order.id,
          fillable.map((e) => {
            const form = forms[keyOf(e)] ?? emptyForm();
            return {
              productId: e.productId,
              exemplarId: e.exemplarId,
              mandatoryMark: e.needsMandatoryMark ? form.mandatoryMark.trim() : null,
              gtd: e.needsGtd && !form.gtdAbsent ? form.gtd.trim() : null,
              isGtdAbsent: e.needsGtd && form.gtdAbsent,
              rnpt: e.needsRnpt && !form.rnptAbsent ? form.rnpt.trim() : null,
              isRnptAbsent: e.needsRnpt && form.rnptAbsent
            };
          })
        );
      }
      onDone();
    } catch (error) {
      setFailure(describeError(error, 'Ozon не принял данные. Проверьте их и попробуйте ещё раз.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Overlay
      kind="dialog"
      title="Данные для отгрузки"
      onClose={onCancel}
      busy={busy}
      width={640}
      footer={
        <>
          <Button variant="primary" size={500} loading={busy} onClick={submit}>
            Сохранить и продолжить
          </Button>
          <Button variant="action-secondary" size={500} disabled={busy} onClick={onCancel}>
            Отмена
          </Button>
        </>
      }
    >
      <p className="pa-lead">
        Ozon не примет заказ <b>{order.shipmentNumber}</b> в отгрузку, пока не заполнены эти данные. Мы сохраним их в Ozon и продолжим.
      </p>

      {failure && <Informer kind="error" reasons={failure.reasons}>{failure.message}</Informer>}
      {unsupported.length > 0 && (
        <Informer kind="warning" title="Часть данных заполняется в кабинете Ozon">
          {unsupported.join(', ')}. Здесь их ввести нельзя: заполните в кабинете продавца Ozon, иначе отгрузка может не пройти.
        </Informer>
      )}
      {countriesError && <Informer kind="error">{countriesError}</Informer>}

      {requirements.countries.length > 0 && (
        <section className="pa-form-section" aria-labelledby="req-countries">
          <h3 id="req-countries" className="ozi-heading-200">Страна-изготовитель</h3>
          {requirements.countries.map((c) => (
            <div key={c.productId} className="pa-form-row">
              <div className="pa-form-row__title">
                {c.productName}
                {c.offerId && <span className="pa-sub pa-sub--inline"> · {c.offerId}</span>}
              </div>
              <SelectField
                label="Страна"
                value={selected[c.productId] ?? ''}
                options={countryOptions}
                emptyLabel="Не выбрана"
                onChange={(iso) => setSelected((previous) => ({ ...previous, [c.productId]: iso }))}
              />
              {missingCountry(c.productId) && <div className="pa-field-error" role="alert">Выберите страну</div>}
            </div>
          ))}
        </section>
      )}

      {fillable.length > 0 && (
        <section className="pa-form-section" aria-labelledby="req-exemplars">
          <h3 id="req-exemplars" className="ozi-heading-200">Данные экземпляров</h3>
          {fillable.map((e) => {
            const key = keyOf(e);
            const form = forms[key] ?? emptyForm();
            const errors = exemplarErrors(e);
            return (
              <fieldset key={key} className="pa-exemplar">
                <legend className="pa-form-row__title">
                  {e.productName}
                  <span className="pa-sub pa-sub--inline"> · экземпляр {e.index}{e.quantity > 1 ? ` из ${e.quantity}` : ''}</span>
                </legend>
                {e.needsMandatoryMark && (
                  <TextField
                    size={500}
                    label="Код маркировки (Честный ЗНАК)"
                    value={form.mandatoryMark}
                    onValueChange={(mandatoryMark) => patch(key, { mandatoryMark })}
                    error={errors.mandatoryMark}
                    hint="Код целиком, как в QR-коде на товаре"
                    autoComplete="off"
                    spellCheck={false}
                    readOnly={busy}
                  />
                )}
                {e.needsGtd && (
                  <div className="pa-absent">
                    <TextField
                      size={500}
                      label="Номер ГТД"
                      value={form.gtdAbsent ? '' : form.gtd}
                      onValueChange={(gtd) => patch(key, { gtd })}
                      error={errors.gtd}
                      disabled={form.gtdAbsent}
                      autoComplete="off"
                      readOnly={busy}
                    />
                    <label className="pa-check">
                      <input type="checkbox" className="po-checkbox" checked={form.gtdAbsent} disabled={busy} onChange={(event) => patch(key, { gtdAbsent: event.target.checked })} />
                      <span>ГТД отсутствует</span>
                    </label>
                  </div>
                )}
                {e.needsRnpt && (
                  <div className="pa-absent">
                    <TextField
                      size={500}
                      label="РНПТ"
                      value={form.rnptAbsent ? '' : form.rnpt}
                      onValueChange={(rnpt) => patch(key, { rnpt })}
                      error={errors.rnpt}
                      disabled={form.rnptAbsent}
                      autoComplete="off"
                      readOnly={busy}
                    />
                    <label className="pa-check">
                      <input type="checkbox" className="po-checkbox" checked={form.rnptAbsent} disabled={busy} onChange={(event) => patch(key, { rnptAbsent: event.target.checked })} />
                      <span>РНПТ отсутствует</span>
                    </label>
                  </div>
                )}
              </fieldset>
            );
          })}
        </section>
      )}
    </Overlay>
  );
}

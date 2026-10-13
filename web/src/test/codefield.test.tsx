import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { CodeField } from '../ui/CodeField';

function Harness({ onChange, error }: { onChange?: (value: string) => void; error?: string }) {
  const [value, setValue] = useState('');
  return (
    <CodeField
      label="Код из письма"
      value={value}
      error={error}
      onValueChange={(next) => {
        setValue(next);
        onChange?.(next);
      }}
    />
  );
}

const cell = (n: number) => screen.getByLabelText(`Цифра ${n} из 6`) as HTMLInputElement;
const values = () => [1, 2, 3, 4, 5, 6].map((n) => cell(n).value).join('');

describe('CodeField', () => {
  it('показывает шесть ячеек в группе с подписью', () => {
    render(<Harness />);
    expect(screen.getByRole('group', { name: 'Код из письма' })).toBeInTheDocument();
    expect(screen.getAllByLabelText(/Цифра \d из 6/)).toHaveLength(6);
  });

  it('переходит в следующую ячейку после каждой цифры', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(cell(1));
    await user.keyboard('12');

    expect(values()).toBe('12');
    expect(cell(3)).toHaveFocus();
  });

  it('игнорирует буквы и символы', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(cell(1));
    await user.keyboard('a-1b2');

    expect(values()).toBe('12');
  });

  it('вставка раскладывает код по ячейкам, пробелы и лишнее отбрасываются', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);

    await user.click(cell(3));
    await user.paste('Код: 123 456 789');

    expect(values()).toBe('123456');
    expect(onChange).toHaveBeenLastCalledWith('123456');
  });

  it('автоподстановка кода целиком в первую ячейку заполняет все', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(cell(1));
    await user.paste('482913');

    expect(values()).toBe('482913');
  });

  it('Backspace стирает цифру и возвращается назад', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(cell(1));
    await user.keyboard('123');
    await user.keyboard('{Backspace}');
    expect(values()).toBe('12');
    expect(cell(3)).toHaveFocus();

    await user.keyboard('{Backspace}');
    expect(values()).toBe('1');
    expect(cell(2)).toHaveFocus();
  });

  it('стрелки переключают ячейки, цифра в середине заменяет только свою', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(cell(1));
    await user.keyboard('1234');
    await user.keyboard('{ArrowLeft}{ArrowLeft}');
    expect(cell(3)).toHaveFocus();
    await user.keyboard('9');

    expect(values()).toBe('1294');
  });

  it('показывает ошибку текстом и помечает ячейки', () => {
    render(<Harness error="Неверный или просроченный код" />);

    expect(screen.getByRole('alert')).toHaveTextContent('Неверный или просроченный код');
    expect(cell(1)).toHaveAttribute('aria-invalid', 'true');
  });
});

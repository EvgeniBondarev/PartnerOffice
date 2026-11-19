import { fireEvent, render, screen, waitFor, cleanup } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { GiveoutDialog } from '../returns/Giveout';

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
it('requires confirmation before regenerating a barcode and reloads the new value', async () => {
  const fetcher = vi.fn().mockResolvedValue(new Response('{"success":true}', { status: 200 }));
  vi.stubGlobal('fetch', fetcher);
  const reload = vi.fn().mockResolvedValue(undefined);
  render(<GiveoutDialog id={11} name="Кабинет" data={{ enabled: true, image: 'YWJj', barcode: '123' }} canWork reload={reload} onClose={() => {}} />);
  expect(screen.getByText('123')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Выпустить новый' }));
  expect(fetcher).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Подтвердить выпуск' }));
  await waitFor(() => expect(reload).toHaveBeenCalledWith(11));
  expect(fetcher.mock.calls[0][0]).toBe('/partner-api/giveout/11/reset');
});
it('does not offer reset or sharing without permission to work with returns', () => {
  render(<GiveoutDialog id={11} name="Кабинет" data={{ enabled: true, barcode: '123' }} canWork={false} reload={async () => {}} onClose={() => {}} />);
  expect(screen.queryByRole('button', { name: 'Поделиться' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Выпустить новый' })).not.toBeInTheDocument();
});

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = (name: string) => readFileSync(resolve(process.cwd(), 'src/returns', name), 'utf8');

describe('returns page boundaries', () => {
  it('delegates list/cache/SSE and pagination to the data hook', () => {
    const page = source('ReturnsPage.tsx');
    expect(page).toContain('useReturnsData(');
    expect(page).not.toMatch(/\b(listReturns|getReturnChanges|rememberList|returnEventsUrl)\s*\(/);
  });
  it('delegates marks, TTN, and exact scanner acceptance to the action hook', () => {
    const page = source('ReturnsPage.tsx');
    expect(page).toContain('useReturnActions(');
    expect(page).not.toMatch(/\b(markReturns|markReturn|downloadReturnTtn)\s*\(/);
  });
  it('renders its filter controls and result view through separate components', () => {
    const page = source('ReturnsPage.tsx');
    expect(page).toContain('<ReturnsControls');
    expect(page).toContain('<ReturnsResults');
    expect(page).not.toContain('<table');
  });
});

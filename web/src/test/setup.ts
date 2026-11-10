import '@testing-library/jest-dom/vitest';

import { afterEach } from 'vitest';
import { clearReturnsCache } from '../returns/ReturnsPage';

// Кэш списков возвратов живёт между переходами по вкладкам; между тестами его очищаем.
afterEach(() => clearReturnsCache());

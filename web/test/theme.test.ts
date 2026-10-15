import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import { applyTheme, C, DARK_PALETTE, getSavedTheme, LIGHT_PALETTE } from '../src/theme/theme';

test('theme applies immediately, persists both modes, and never calls the network', () => {
  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const previousStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const values = new Map<string, string>();
  const dataset: Record<string, string> = {};
  Object.defineProperties(globalThis, {
    document: { configurable: true, value: { documentElement: { dataset } } },
    localStorage: { configurable: true, value: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value); },
    } },
  });
  const network = mock.method(globalThis, 'fetch', () => { throw new Error('Theme must stay local.'); });
  try {
    assert.equal(getSavedTheme(), 'light');
    applyTheme('dark');
    assert.equal(getSavedTheme(), 'dark');
    assert.equal(values.get('asl_theme'), 'dark');
    assert.equal(dataset.theme, 'dark');
    assert.deepEqual(C, DARK_PALETTE);
    applyTheme('light');
    assert.equal(getSavedTheme(), 'light');
    assert.equal(dataset.theme, 'light');
    assert.deepEqual(C, LIGHT_PALETTE);

    Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new Error('Storage unavailable'); } });
    assert.equal(getSavedTheme(), 'light');
    assert.doesNotThrow(() => applyTheme('dark'));
    assert.equal(dataset.theme, 'dark');
    assert.deepEqual(C, DARK_PALETTE);
    assert.equal(network.mock.callCount(), 0);
  } finally {
    applyTheme('light');
    if (previousDocument) Object.defineProperty(globalThis, 'document', previousDocument);
    else Reflect.deleteProperty(globalThis, 'document');
    if (previousStorage) Object.defineProperty(globalThis, 'localStorage', previousStorage);
    else Reflect.deleteProperty(globalThis, 'localStorage');
    mock.restoreAll();
  }
});

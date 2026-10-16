import type { Row } from './client.js';

// Match the old id::text comparisons, including noncanonical UUIDs being absent.
export const isCanonicalUuid = (value: string): boolean => /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/.test(value);
export const string = (value: unknown): string => typeof value === 'string' ? value : '';
export const array = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
export const object = (value: unknown): Row => typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Row : {};
export const timestamp = (v: unknown): number | null => v instanceof Date ? v.getTime() : (typeof v === 'string' || typeof v === 'number' ? new Date(v).getTime() : null);

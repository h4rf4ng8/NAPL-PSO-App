import { sessionVersion } from '../auth/client';
import { ApiError, request } from './http';
function checkIdentity(version: number, signal?: AbortSignal) {
  signal?.throwIfAborted();
  if (version !== sessionVersion()) throw new ApiError(401, 'login_required', 'Please sign in again.');
}
export interface Page<T> { nodes: T[]; pageInfo: { endCursor: string | null; hasNextPage: boolean }; totalCount: number; }
export function pagePath(path: string, after: string | null): string {
  return after ? `${path}${path.includes('?') ? '&' : '?'}after=${encodeURIComponent(after)}` : path;
}
// Called only after a reader opens a complete text field or its editor.
export async function readText(path: string, signal?: AbortSignal): Promise<string> {
  let after: string | null = null;
  let text = '';
  const version = sessionVersion();
  do {
    checkIdentity(version, signal);
    const page: Page<string> = await request<Page<string>>(pagePath(path, after), 'GET', undefined, signal);
    checkIdentity(version, signal);
    text += page.nodes.join('');
    after = page.pageInfo.hasNextPage ? page.pageInfo.endCursor : null;
  } while (after);
  checkIdentity(version, signal);
  return text;
}

interface FieldDescriptor { index: number; key: string | null; value?: unknown; valueUrl?: string; }
// Complete saved fields are required before an explicit editor replaces a record.
export async function readValue(path: string, signal?: AbortSignal): Promise<unknown> {
  let after: string | null = null;
  const fields: [string, unknown][] = [];
  let scalar = false;
  let scalarValue: unknown;
  const version = sessionVersion();
  do {
    checkIdentity(version, signal);
    const page: Page<FieldDescriptor> = await request<Page<FieldDescriptor>>(pagePath(path, after), 'GET', undefined, signal);
    checkIdentity(version, signal);
    for (const entry of page.nodes) {
      if (entry.key !== null && typeof entry.key !== 'string') throw new Error('Invalid saved field.');
      if (Object.hasOwn(entry, 'value')) {
        if (entry.key === null) {
          if (page.totalCount !== 1) throw new Error('Invalid saved scalar.');
          scalar = true; scalarValue = entry.value;
        } else fields.push([entry.key, entry.value]);
      }
      else if (entry.valueUrl) {
        const field: unknown = JSON.parse(await readText(entry.valueUrl, signal));
        checkIdentity(version, signal);
        if (!field || typeof field !== 'object' || !('key' in field) || (field.key !== null && typeof field.key !== 'string') || (entry.key !== null && field.key !== entry.key) || !('value' in field)) throw new Error('Invalid saved field detail.');
        if (field.key === null) {
          if (page.totalCount !== 1) throw new Error('Invalid saved scalar.');
          scalar = true; scalarValue = field.value;
        } else fields.push([field.key, field.value]);
      } else throw new Error('Saved field is unavailable.');
    }
    after = page.pageInfo.hasNextPage ? page.pageInfo.endCursor : null;
  } while (after);
  checkIdentity(version, signal);
  return scalar ? scalarValue : Object.fromEntries(fields);
}

export async function readFields(path: string, signal?: AbortSignal): Promise<Record<string, unknown>> {
  const value = await readValue(path, signal);
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error('Saved object is unavailable.');
  return value as Record<string, unknown>;
}

import type { User } from '../src/types.ts';
export interface Session {
  user: User;
  csrf: string;
}
let csrf = '';
export function setCsrf(value: string) {
  csrf = value;
}
export async function api<T>(
  path: string,
  method = 'GET',
  value?: unknown,
  key?: string,
): Promise<T> {
  const response = await fetch(`/api${path}`, {
    method,
    credentials: 'same-origin',
    headers: {
      ...(value === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(method === 'GET' ? {} : { 'X-CSRF-Token': csrf }),
      ...(key ? { 'Idempotency-Key': key } : {}),
    },
    body: value === undefined ? undefined : JSON.stringify(value),
  });
  const data = await response.json();
  if (!response.ok) {
    if (response.status === 401 && path !== '/auth/login' && path !== '/auth/me')
      window.dispatchEvent(new Event('session-expired'));
    throw new Error(data.error || 'No se pudo completar la operación.');
  }
  return data as T;
}

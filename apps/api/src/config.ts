import { isIP } from 'node:net';

const DEFAULT_API_HOST = '127.0.0.1';

export function resolveApiHost(host: string | undefined): string {
  const candidate = host ?? DEFAULT_API_HOST;

  if (candidate.toLowerCase() === 'localhost') return DEFAULT_API_HOST;
  if (candidate === '::1') return candidate;
  if (isIP(candidate) === 4 && candidate.startsWith('127.')) return candidate;

  throw new Error(
    'API_HOST must be a loopback address (127.0.0.0/8, ::1, or localhost); remote binds are not supported',
  );
}

export function resolveProjectRoots(value: string | undefined): string[] {
  if (!value?.trim()) throw new Error('PROJECT_ALLOWED_ROOTS must contain at least one directory');
  const roots = value.split(';').map((root) => root.trim()).filter(Boolean);
  if (roots.length === 0) throw new Error('PROJECT_ALLOWED_ROOTS must contain at least one directory');
  return roots;
}

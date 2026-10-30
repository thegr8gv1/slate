import Constants from 'expo-constants';
import { Platform } from 'react-native';

/**
 * API client.
 *
 * Base URL resolution is the one genuinely platform-specific thing in the app:
 * the web build talks to localhost, but a phone on the LAN needs the dev
 * machine's address. Expo already knows that address (it is how the bundle got
 * to the device), so we reuse it instead of asking anyone to edit a config.
 */

const DEFAULT_PORT = 4000;

function resolveBaseUrl(): string {
  const explicit = process.env.EXPO_PUBLIC_API_URL;
  if (explicit) return explicit.replace(/\/$/, '');

  // hostUri looks like "192.168.1.130:8081" in dev.
  const hostUri =
    Constants.expoConfig?.hostUri ??
    (Constants.expoGoConfig as { debuggerHost?: string } | undefined)?.debuggerHost;

  if (hostUri) {
    const host = hostUri.split(':')[0];
    if (host && host !== 'localhost' && host !== '127.0.0.1') {
      return `http://${host}:${DEFAULT_PORT}`;
    }
  }

  if (Platform.OS === 'android') {
    // The Android emulator reaches the host machine through this alias.
    return `http://10.0.2.2:${DEFAULT_PORT}`;
  }
  return `http://localhost:${DEFAULT_PORT}`;
}

export const API_BASE = resolveBaseUrl();

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

let authToken: string | null = null;

export function setAuthToken(token: string | null): void {
  authToken = token;
}

export function getAuthToken(): string | null {
  return authToken;
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  query?: Record<string, string | number | boolean | string[] | undefined | null>;
  signal?: AbortSignal;
  /** Skips the Authorization header (sign-in and reference endpoints). */
  anonymous?: boolean;
}

function buildUrl(path: string, query?: RequestOptions['query']): string {
  const url = `${API_BASE}${path.startsWith('/') ? path : `/${path}`}`;
  if (!query) return url;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue;
    params.set(key, Array.isArray(value) ? value.join(',') : String(value));
  }
  const qs = params.toString();
  return qs ? `${url}?${qs}` : url;
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (!options.anonymous && authToken) headers.Authorization = `Bearer ${authToken}`;

  let response: Response;
  try {
    response = await fetch(buildUrl(path, options.query), {
      method: options.method ?? 'GET',
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: options.signal,
    });
  } catch (cause) {
    // A network-level failure is the common case in dev (API not running), so
    // it gets a message that says what to actually do about it.
    throw new ApiError(
      0,
      'NETWORK',
      `Cannot reach the Slate API at ${API_BASE}. Start it with \`npm run api\` from the repo root.`,
      cause,
    );
  }

  const text = await response.text();
  const payload = text ? safeParse(text) : null;

  if (!response.ok) {
    const error = (payload as { error?: { code?: string; message?: string; details?: unknown } } | null)?.error;
    throw new ApiError(
      response.status,
      error?.code ?? `HTTP_${response.status}`,
      error?.message ?? `Request failed with ${response.status}`,
      error?.details,
    );
  }

  return payload as T;
}

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export const api = {
  get: <T,>(path: string, query?: RequestOptions['query'], signal?: AbortSignal) =>
    request<T>(path, { query, signal }),
  post: <T,>(path: string, body?: unknown) => request<T>(path, { method: 'POST', body }),
  patch: <T,>(path: string, body?: unknown) => request<T>(path, { method: 'PATCH', body }),
  anonymousPost: <T,>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', body, anonymous: true }),
};

/** SSE endpoint for the live notification lane. */
export function notificationStreamUrl(): string {
  return `${API_BASE}/notifications/stream`;
}

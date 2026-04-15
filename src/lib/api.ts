import axios, { AxiosError, AxiosRequestConfig, AxiosResponse } from 'axios';

export interface ApiEnvelope<T> {
  success: boolean;
  data: T;
  timestamp?: string;
  message?: string;
}

const TOKEN_KEY = 'ws-admin-token';

export const tokenStore = {
  get(): string | null {
    if (typeof window === 'undefined') return null;
    return window.localStorage.getItem(TOKEN_KEY);
  },
  set(token: string) {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(TOKEN_KEY, token);
  },
  clear() {
    if (typeof window === 'undefined') return;
    window.localStorage.removeItem(TOKEN_KEY);
  },
};

export const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api/v1',
  timeout: 20000,
});

const IMPERSONATE_KEY = 'ws-admin-impersonate';
function readImpersonateId(): string | null {
  if (typeof window === 'undefined') return null;
  const raw = window.localStorage.getItem(IMPERSONATE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { id?: string };
    return parsed?.id ?? null;
  } catch {
    return null;
  }
}

api.interceptors.request.use((config) => {
  const token = tokenStore.get();
  config.headers = config.headers ?? {};
  const headers = config.headers as Record<string, string>;
  if (token) headers.Authorization = `Bearer ${token}`;
  const imp = readImpersonateId();
  if (imp) headers['X-Impersonate-User-Id'] = imp;
  return config;
});

api.interceptors.response.use(
  (resp) => resp,
  (err: AxiosError) => {
    const url = err.config?.url || '';
    // IMPORTANT: skip /auth/ endpoints so wrong-password errors surface on login form
    const isAuthEndpoint = url.includes('/auth/');
    if (err.response?.status === 401 && !isAuthEndpoint) {
      if (typeof window !== 'undefined') {
        tokenStore.clear();
        if (!window.location.pathname.startsWith('/login')) {
          window.location.href = '/login';
        }
      }
    }
    return Promise.reject(err);
  },
);

/** Unwrap `{success,data,timestamp}` envelopes. Never access `response.data` directly. */
export function unwrap<T>(resp: AxiosResponse<ApiEnvelope<T> | T>): T {
  const body = resp.data as ApiEnvelope<T> | T;
  if (body && typeof body === 'object' && 'data' in (body as ApiEnvelope<T>)) {
    return (body as ApiEnvelope<T>).data;
  }
  return body as T;
}

export async function get<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
  const r = await api.get<ApiEnvelope<T>>(url, config);
  return unwrap<T>(r);
}

export async function post<T>(url: string, body?: unknown, config?: AxiosRequestConfig): Promise<T> {
  const r = await api.post<ApiEnvelope<T>>(url, body, config);
  return unwrap<T>(r);
}

export async function patch<T>(url: string, body?: unknown, config?: AxiosRequestConfig): Promise<T> {
  const r = await api.patch<ApiEnvelope<T>>(url, body, config);
  return unwrap<T>(r);
}

export async function put<T>(url: string, body?: unknown, config?: AxiosRequestConfig): Promise<T> {
  const r = await api.put<ApiEnvelope<T>>(url, body, config);
  return unwrap<T>(r);
}

export async function del<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
  const r = await api.delete<ApiEnvelope<T>>(url, config);
  return unwrap<T>(r);
}

export function errorMessage(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data as any;
    // Backend envelope: { success, error: { code, message, details } }
    if (data?.error?.message && typeof data.error.message === 'string') return data.error.message;
    // NestJS default / validation: { message: string | string[] }
    if (Array.isArray(data?.message)) return data.message[0];
    if (data?.message && typeof data.message === 'string') return data.message;
    return err.message;
  }
  if (err instanceof Error) return err.message;
  return 'Unknown error';
}

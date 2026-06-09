/**
 * The single HTTP client for talking to the API.
 *
 * It attaches an auth token when one is available. In local stub mode there is
 * no token (the API treats every request as the dev user); when you wire a real
 * provider, call setTokenGetter() once (in lib/auth) so every request carries a
 * Bearer token — no screen needs to know how auth works.
 */
const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8080";

type TokenGetter = () => Promise<string | null>;
let getToken: TokenGetter = async () => null;

/** Register how to obtain an auth token (called by the auth provider). */
export function setTokenGetter(fn: TokenGetter) {
  getToken = fn;
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** Make a JSON request to the API. Throws ApiError on non-2xx. */
export async function api<T = unknown>(
  path: string,
  options: { method?: string; body?: unknown } = {}
): Promise<T> {
  const token = await getToken();
  const headers: Record<string, string> = {};
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${API_URL}${path}`, {
    method: options.method ?? "GET",
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    try {
      const data = await res.json();
      if (data?.error) message = data.error;
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(res.status, message);
  }

  // 204 No Content
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

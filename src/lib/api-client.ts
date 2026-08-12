const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

// Clerk attaches itself to window when loaded; grab a session token so the
// backend TenancyGuard can verify who is calling. Falls back silently when
// Clerk isn't ready (backend AUTH_MODE=permissive covers local dev).
async function getAuthToken(): Promise<string | null> {
  if (typeof window === "undefined") return null;
  try {
    const clerk = (window as unknown as {
      Clerk?: { session?: { getToken: () => Promise<string | null> } };
    }).Clerk;
    return (await clerk?.session?.getToken()) ?? null;
  } catch {
    return null;
  }
}

// Every restaurant-scoped hook (query and mutation alike) builds its URL by
// interpolating useRestaurantId()'s return value, which is `null` until
// RestaurantProvider finishes resolving /me. Query hooks consistently guard
// with `enabled: !!restaurantId`, but mutation hooks don't have an
// equivalent React Query option — if a mutation ever fires before
// restaurantId resolves, `${restaurantId}` silently stringifies to the
// literal text "null"/"undefined" in the URL. Centralizing the guard here
// (rather than adding a null-check to every one of the ~50 mutation hooks)
// catches every current and future case in one place: TenancyGuard would
// reject "/restaurants/null/..." anyway (no membership row matches that
// string), so this doesn't change what's reachable — it just fails fast,
// client-side, with a clear message instead of a wasted round-trip.
function assertNoUnresolvedRestaurantId(path: string): void {
  if (/\/restaurants\/(null|undefined)(\/|$)/.test(path)) {
    throw new Error(
      "Blocked API request: restaurantId has not resolved yet. This is a client bug — the caller " +
        "must wait for the restaurant context to finish loading before triggering this request.",
    );
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  assertNoUnresolvedRestaurantId(path);
  const token = await getAuthToken();
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      ...(init?.body && !(init.body instanceof FormData)
        ? { "Content-Type": "application/json" }
        : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new ApiError(res.status, body || res.statusText);
  }

  return res.json() as Promise<T>;
}

export const apiClient = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, {
      method: "POST",
      body: body instanceof FormData ? body : JSON.stringify(body),
    }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "PATCH", body: JSON.stringify(body) }),
  put: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "PUT", body: JSON.stringify(body) }),
  delete: <T>(path: string) => request<T>(path, { method: "DELETE" }),
};

/** An API call that came back with an error status. */
export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

function redirectToLogin() {
  if (typeof window === "undefined") return;
  if (!window.location.pathname.startsWith("/login")) {
    window.location.href = "/login";
  }
}

/**
 * fetch() for JSON endpoints that treats an error status as an error.
 *
 * Plain fetch() resolves on 401/404/500 too, and the error body then ends up
 * in component state as if it were data. This throws an ApiError instead and
 * sends the browser to the login page when the session has expired.
 */
export async function fetchJson<T>(input: string, init?: RequestInit): Promise<T> {
  const res = await fetch(input, init);

  if (res.status === 401) {
    redirectToLogin();
    throw new ApiError(401, "Sitzung abgelaufen");
  }

  if (!res.ok) {
    let message = `Anfrage fehlgeschlagen (${res.status})`;
    try {
      const body = await res.json();
      if (body && typeof body.error === "string") message = body.error;
    } catch {
      // Not a JSON body; keep the generic message.
    }
    throw new ApiError(res.status, message);
  }

  return res.json() as Promise<T>;
}

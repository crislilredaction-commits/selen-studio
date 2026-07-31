export type GoogleOAuthFailureCode =
  | "invalid_grant"
  | "insufficient_scope"
  | "oauth_unavailable";

export class GoogleOAuthError extends Error {
  readonly code: GoogleOAuthFailureCode;
  readonly reconnectRequired: boolean;

  constructor(code: GoogleOAuthFailureCode) {
    const reconnectRequired = code === "invalid_grant";
    super(
      reconnectRequired
        ? "La connexion Google Calendar a expire ou a ete revoquee. Une reconnexion manuelle est necessaire."
        : code === "insufficient_scope"
          ? "La connexion Google Calendar ne dispose pas des autorisations necessaires."
          : "Google Calendar est temporairement indisponible.",
    );
    this.name = "GoogleOAuthError";
    this.code = code;
    this.reconnectRequired = reconnectRequired;
  }
}

type GoogleOAuthConfig = {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
};

type FetchLike = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export async function refreshGoogleAccessToken(
  config: GoogleOAuthConfig,
  fetcher: FetchLike = fetch,
) {
  const response = await fetcher("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: config.refreshToken,
      grant_type: "refresh_token",
    }),
  });

  const payload = (await response.json().catch(() => null)) as {
    access_token?: unknown;
    error?: unknown;
  } | null;

  if (response.ok && typeof payload?.access_token === "string") {
    return payload.access_token;
  }

  const providerCode =
    typeof payload?.error === "string" ? payload.error : "oauth_unavailable";
  if (providerCode === "invalid_grant") {
    throw new GoogleOAuthError("invalid_grant");
  }
  if (providerCode === "insufficient_scope") {
    throw new GoogleOAuthError("insufficient_scope");
  }
  throw new GoogleOAuthError("oauth_unavailable");
}

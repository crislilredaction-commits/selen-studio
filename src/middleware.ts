import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const AUTH_LOOKUP_TIMEOUT_MS = 5_000;

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number) {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(
      () => reject(new Error("studio_auth_lookup_timeout")),
      timeoutMs,
    );
  });

  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

function authUnavailableResponse() {
  return NextResponse.json(
    { error: "Service d'authentification temporairement indisponible." },
    {
      status: 503,
      headers: {
        "Cache-Control": "no-store",
        "Retry-After": "5",
      },
    },
  );
}

export async function middleware(request: NextRequest) {
  const response = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            request.cookies.set(name, value);
            response.cookies.set(name, value, options);
          });
        },
      },
    },
  );

  let user = null;

  try {
    const authResult = await withTimeout(
      supabase.auth.getUser(),
      AUTH_LOOKUP_TIMEOUT_MS,
    );
    user = authResult.data.user;
  } catch (error) {
    console.warn("[studio-auth] Authentication lookup unavailable", {
      reason: error instanceof Error ? error.message : "unknown_error",
      pathname: request.nextUrl.pathname,
    });
    return authUnavailableResponse();
  }

  const isAgentPage = request.nextUrl.pathname.startsWith("/agent");

  if (isAgentPage && !user) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/login";
    redirectUrl.searchParams.set("redirectedFrom", request.nextUrl.pathname);

    return NextResponse.redirect(redirectUrl);
  }

  return response;
}

export const config = {
  matcher: ["/agent/:path*"],
};

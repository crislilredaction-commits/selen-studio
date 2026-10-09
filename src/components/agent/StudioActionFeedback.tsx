"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { STUDIO_NAVIGATION_EVENT, type StudioNavigationEventDetail } from "@/lib/studioNavigation";

type FeedbackKind = "loading" | "success" | "error";

type Feedback = {
  id: number;
  kind: FeedbackKind;
  message: string;
};

type ActiveAction = {
  button: HTMLButtonElement | null;
  expiresAt: number;
  label: string;
};

type PendingAction = {
  button: HTMLButtonElement | null;
  wasDisabled: boolean;
};

const MUTATION_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function cleanLabel(value: string | null | undefined) {
  const label = value?.replace(/\s+/g, " ").trim();
  return label ? label.slice(0, 90) : "Action Studio";
}

function actionFromElement(target: EventTarget | null): ActiveAction | null {
  if (!(target instanceof Element)) return null;
  const element = target.closest<HTMLElement>(
    'button, input[type="submit"], input[type="button"], [role="button"]',
  );
  if (!element || element.dataset.studioFeedback === "off") return null;

  const button = element instanceof HTMLButtonElement ? element : null;
  const inputValue = element instanceof HTMLInputElement ? element.value : null;
  const label = cleanLabel(
    element.dataset.actionLabel ||
      element.getAttribute("aria-label") ||
      inputValue ||
      element.textContent ||
      element.getAttribute("title"),
  );

  return { button, expiresAt: Date.now() + 2_000, label };
}

function requestMethod(input: RequestInfo | URL, init?: RequestInit) {
  if (init?.method) return init.method.toUpperCase();
  if (typeof Request !== "undefined" && input instanceof Request) {
    return input.method.toUpperCase();
  }
  return "GET";
}

async function responseMessage(response: Response, fallback: string) {
  const contentType = response.headers.get("content-type") ?? "";
  try {
    if (contentType.includes("application/json")) {
      const payload = (await response.clone().json()) as Record<string, unknown>;
      const value = payload.error ?? payload.message;
      if (typeof value === "string" && value.trim()) return value.trim();
    }
  } catch {
    // Le consommateur d'origine reste propriétaire de la réponse.
  }
  return fallback;
}

export default function StudioActionFeedback() {
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const activeActionRef = useRef<ActiveAction | null>(null);
  const pendingActionsRef = useRef(new Map<number, PendingAction>());
  const pendingCounterRef = useRef(0);
  const counterRef = useRef(0);
  const clearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const releasePending = useCallback((pendingId: number) => {
    const pending = pendingActionsRef.current.get(pendingId);
    if (!pending) return;
    if (pending.button) {
      pending.button.disabled = pending.wasDisabled;
      pending.button.removeAttribute("aria-busy");
      pending.button.classList.remove("studio-action-pending");
    }
    pendingActionsRef.current.delete(pendingId);
  }, []);

  const releaseAllPending = useCallback(() => {
    for (const pendingId of pendingActionsRef.current.keys()) {
      releasePending(pendingId);
    }
  }, [releasePending]);

  const publish = useCallback(
    (kind: FeedbackKind, message: string, duration?: number) => {
      if (clearTimerRef.current) clearTimeout(clearTimerRef.current);
      const id = ++counterRef.current;
      setFeedback({ id, kind, message });
      if (kind !== "loading") {
        clearTimerRef.current = setTimeout(
          () => setFeedback((current) => (current?.id === id ? null : current)),
          duration ?? (kind === "error" ? 8_000 : 4_000),
        );
      }
    },
    [],
  );

  const markPending = useCallback(
    (action: ActiveAction) => {
      const pendingId = ++pendingCounterRef.current;
      if (action.button) {
        const wasDisabled = action.button.disabled;
        action.button.disabled = true;
        action.button.setAttribute("aria-busy", "true");
        action.button.classList.add("studio-action-pending");
        pendingActionsRef.current.set(pendingId, { button: action.button, wasDisabled });
      } else {
        pendingActionsRef.current.set(pendingId, { button: null, wasDisabled: false });
      }
      publish("loading", `${action.label}…`);
      return pendingId;
    },
    [publish],
  );

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      activeActionRef.current = actionFromElement(event.target);
    };

    const onSubmitCapture = (event: SubmitEvent) => {
      const action =
        actionFromElement(event.submitter) ??
        ({ button: null, expiresAt: Date.now() + 2_000, label: "Enregistrement" } satisfies ActiveAction);
      activeActionRef.current = action;
    };

    const onSubmit = (event: SubmitEvent) => {
      const action = activeActionRef.current;
      if (!action || event.defaultPrevented) return;
      activeActionRef.current = null;
      markPending(action);
    };

    document.addEventListener("click", onClick, true);
    document.addEventListener("submit", onSubmitCapture, true);
    document.addEventListener("submit", onSubmit);

    const originalFetch = window.fetch.bind(window);
    const instrumentedFetch: typeof window.fetch = async (input, init) => {
      const method = requestMethod(input, init);
      const action = activeActionRef.current;
      const shouldReport =
        MUTATION_METHODS.has(method) && action !== null && action.expiresAt >= Date.now();

      if (!shouldReport || !action) return originalFetch(input, init);

      activeActionRef.current = null;
      const pendingId = markPending(action);

      try {
        const response = await originalFetch(input, init);
        if (response.ok) {
          const message = await responseMessage(response, `${action.label} : terminé.`);
          publish("success", message);
        } else {
          const message = await responseMessage(
            response,
            `${action.label} : l’action n’a pas abouti.`,
          );
          publish("error", message);
        }
        return response;
      } catch (error) {
        publish(
          "error",
          error instanceof Error && error.message
            ? error.message
            : `${action.label} : erreur réseau.`,
        );
        throw error;
      } finally {
        releasePending(pendingId);
      }
    };

    window.fetch = instrumentedFetch;
    return () => {
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("submit", onSubmitCapture, true);
      document.removeEventListener("submit", onSubmit);
      if (window.fetch === instrumentedFetch) window.fetch = originalFetch;
      if (clearTimerRef.current) clearTimeout(clearTimerRef.current);
      releaseAllPending();
    };
  }, [markPending, publish, releaseAllPending, releasePending]);

  if (!feedback) return null;

  const tone =
    feedback.kind === "error"
      ? { background: "#3d1717", border: "#b84a4a", color: "#fff1f1" }
      : feedback.kind === "success"
        ? { background: "#173629", border: "#3f9b70", color: "#effff6" }
        : { background: "#2f281a", border: "var(--selen-gold)", color: "#fff8e8" };

  return (
    <>
      <style jsx global>{`
        .studio-action-pending {
          cursor: progress !important;
          opacity: 0.72 !important;
          pointer-events: none !important;
        }
      `}</style>
      <aside
        aria-atomic="true"
        aria-live={feedback.kind === "error" ? "assertive" : "polite"}
        role={feedback.kind === "error" ? "alert" : "status"}
        style={{
          ...tone,
          alignItems: "center",
          border: `1px solid ${tone.border}`,
          borderRadius: 12,
          bottom: 20,
          boxShadow: "0 16px 40px rgba(0, 0, 0, 0.34)",
          display: "flex",
          gap: 12,
          maxWidth: "min(420px, calc(100vw - 32px))",
          padding: "12px 14px",
          position: "fixed",
          right: 20,
          zIndex: 1200,
        }}
      >
        {feedback.kind === "loading" ? (
          <span aria-hidden="true" style={{ fontSize: 18 }}>↻</span>
        ) : feedback.kind === "success" ? (
          <span aria-hidden="true">✓</span>
        ) : (
          <span aria-hidden="true">!</span>
        )}
        <span style={{ flex: 1, fontSize: 13, fontWeight: 700 }}>{feedback.message}</span>
        {feedback.kind !== "loading" ? (
          <button
            aria-label="Fermer le message"
            data-studio-feedback="off"
            onClick={() => setFeedback(null)}
            style={{
              background: "transparent",
              border: 0,
              color: "inherit",
              cursor: "pointer",
              fontSize: 18,
              padding: 2,
            }}
            type="button"
          >
            ×
          </button>
        ) : null}
      </aside>
    </>
  );
}

/**
 * Navigation feedback is separate from mutation feedback: a Next.js link does
 * not send a mutation request, so the action handler cannot observe its wait.
 */
export function StudioNavigationFeedback() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const activeRef = useRef<HTMLElement | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const counterRef = useRef(0);

  useEffect(() => {
    const releaseActiveElement = () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
      activeRef.current?.classList.remove("studio-navigation-pending");
      activeRef.current?.removeAttribute("aria-busy");
      activeRef.current = null;
    };

    const clear = () => {
      releaseActiveElement();
      setFeedback(null);
    };

    const begin = (element: HTMLElement | null, label?: string) => {
      if (activeRef.current === element && element) return false;
      releaseActiveElement();
      activeRef.current = element;
      element?.classList.add("studio-navigation-pending");
      element?.setAttribute("aria-busy", "true");
      const id = ++counterRef.current;
      setFeedback({
        id,
        kind: "loading",
        message: label ? `Ouverture de « ${label} »…` : "Ouverture…",
      });
      timeoutRef.current = setTimeout(() => {
        releaseActiveElement();
        setFeedback({
          id: ++counterRef.current,
          kind: "error",
          message: "La page tarde à s’ouvrir. Réessaie ou recharge Studio.",
        });
      }, 15_000);
      return true;
    };

    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
      if (!(event.target instanceof Element)) return;
      const link = event.target.closest<HTMLAnchorElement>('a[href]');
      if (!link || !link.closest(".agent-shell") || link.hasAttribute("download") || link.target === "_blank" || link.dataset.studioFeedback === "off") return;
      const url = new URL(link.href, window.location.href);
      if (url.origin !== window.location.origin || !url.pathname.startsWith("/agent")) return;
      // A same-page anchor is immediate and does not wait for the App Router.
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;
      if (activeRef.current === link) {
        event.preventDefault();
        return;
      }
      const label = cleanLabel(link.getAttribute("aria-label") || link.textContent);
      // The class and aria-busy are applied in the capture phase, before the
      // Next.js handler and before any network response can complete.
      begin(link, label);
    };

    const onNavigationEvent = (event: Event) => {
      const detail = (event as CustomEvent<StudioNavigationEventDetail>).detail;
      if (detail?.kind === "error") {
        releaseActiveElement();
        setFeedback({
          id: ++counterRef.current,
          kind: "error",
          message: detail.message || "Impossible d’ouvrir cette page. Réessaie.",
        });
        return;
      }
      begin(null, detail?.label ? cleanLabel(detail.label) : undefined);
    };

    const onPopState = () => begin(null, "la page précédente");
    const onNavigationError = () => {
      if (!activeRef.current && !timeoutRef.current) return;
      releaseActiveElement();
      setFeedback({
        id: ++counterRef.current,
        kind: "error",
        message: "La navigation a échoué. Réessaie.",
      });
    };

    document.addEventListener("click", onClick, true);
    window.addEventListener(STUDIO_NAVIGATION_EVENT, onNavigationEvent);
    window.addEventListener("popstate", onPopState);
    window.addEventListener("error", onNavigationError);
    window.addEventListener("unhandledrejection", onNavigationError);
    return () => {
      document.removeEventListener("click", onClick, true);
      window.removeEventListener(STUDIO_NAVIGATION_EVENT, onNavigationEvent);
      window.removeEventListener("popstate", onPopState);
      window.removeEventListener("error", onNavigationError);
      window.removeEventListener("unhandledrejection", onNavigationError);
      clear();
    };
  }, []);

  useEffect(() => {
    const active = activeRef.current;
    if (active) {
      active.classList.remove("studio-navigation-pending");
      active.removeAttribute("aria-busy");
      activeRef.current = null;
    }
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = null;
    const clearFeedbackTimer = window.setTimeout(() => setFeedback(null), 0);
    return () => window.clearTimeout(clearFeedbackTimer);
  }, [pathname, searchParams]);

  if (!feedback) return null;
  return (
    <aside
      aria-live={feedback.kind === "error" ? "assertive" : "polite"}
      className={`studio-navigation-feedback studio-navigation-feedback--${feedback.kind}`}
      role={feedback.kind === "error" ? "alert" : "status"}
    >
      {feedback.kind === "loading" ? <span aria-hidden="true" className="studio-navigation-feedback__spinner" /> : null}
      <span>{feedback.message}</span>
      {feedback.kind === "error" ? (
        <button
          aria-label="Fermer le message de navigation"
          data-studio-feedback="off"
          onClick={() => setFeedback(null)}
          type="button"
        >
          ×
        </button>
      ) : null}
    </aside>
  );
}

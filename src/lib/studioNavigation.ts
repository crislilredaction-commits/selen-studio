export const STUDIO_NAVIGATION_EVENT = "selen:studio-navigation";

export type StudioNavigationEventDetail = {
  kind?: "loading" | "error";
  label?: string;
  message?: string;
};

type StudioRouter = {
  push: (href: string) => void;
  replace: (href: string) => void;
};

/** Publishes visible feedback in the same turn, before router navigation. */
export function navigateWithStudioFeedback(
  router: StudioRouter,
  href: string,
  options?: { label?: string; replace?: boolean },
) {
  window.dispatchEvent(
    new CustomEvent<StudioNavigationEventDetail>(STUDIO_NAVIGATION_EVENT, {
      detail: { kind: "loading", label: options?.label },
    }),
  );
  try {
    if (options?.replace) router.replace(href);
    else router.push(href);
  } catch (error) {
    window.dispatchEvent(
      new CustomEvent<StudioNavigationEventDetail>(STUDIO_NAVIGATION_EVENT, {
        detail: {
          kind: "error",
          message: "Impossible d’ouvrir cette page. Réessaie.",
        },
      }),
    );
    throw error;
  }
}

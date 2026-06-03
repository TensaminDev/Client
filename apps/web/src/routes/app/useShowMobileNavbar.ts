import { useLocation, useMatches } from "@tanstack/react-router";

export function useShowMobileNavbar(): boolean {
  const matches = useMatches();
  const location = useLocation();

  return matches.some(
    (match) =>
      match.pathname === location.pathname &&
      // Router staticData is app-defined and not typed by the route matcher here.
      // @ts-expect-error App route metadata
      match.staticData?.showMobileNavbar === true,
  );
}

import { createRoute, type AnyRoute } from "@tanstack/react-router";

import SettingsLayout from "./layout";
import { settingsPages } from "./manifest";

export { SettingsProfilesProvider, useSettingsProfiles } from "./profiles";
export type { SettingsProfile } from "./profiles";
export { SettingsProfileOnboarding } from "./profileOnboarding";
export { SettingsProfileMenu } from "./profileMenu";

export function createSettingsRoute(parentRoute: AnyRoute) {
  const settingsRoute = createRoute({
    getParentRoute: () => parentRoute,
    path: "settings",
    component: SettingsLayout,
    staticData: { showMobileNavbar: false },
  });

  return settingsRoute.addChildren(
    settingsPages.map((page) =>
      createRoute({
        getParentRoute: () => settingsRoute,
        path: page.path,
        component: page.component,
        staticData: { showMobileNavbar: false },
      }),
    ),
  );
}

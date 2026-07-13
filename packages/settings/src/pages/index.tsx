import { useIsMobile } from "@tensamin/ui";
import { SettingsSidebar } from "../layout";

export default function Page() {
  const isMobile = useIsMobile();
  return isMobile && <SettingsSidebar />;
}

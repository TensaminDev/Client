import { SettingsSidebar } from "@/features/settings/layout";
import { useIsMobile } from "@tensamin/ui/utils";

export default function Page() {
  const isMobile = useIsMobile();
  return isMobile && <SettingsSidebar />;
}

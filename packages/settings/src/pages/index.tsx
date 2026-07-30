import { SettingsSidebar } from "../layout";

export default function Page() {
  return (
    <div className="h-full md:hidden">
      <SettingsSidebar mobile />
    </div>
  );
}

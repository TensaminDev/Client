import { SettingsSidebar } from "../sidebar";

export default function Page() {
  return (
    <div className="h-full md:hidden">
      <SettingsSidebar mobile />
    </div>
  );
}

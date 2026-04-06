import { useCall } from "./context";

import MainLayout from "./views/main/layout";
import MainGrid from "./views/main/grid";
import MainFocused from "./views/main/focused";
import Preview from "./views/preview";

export default function Screen() {
  const { view } = useCall();

  return view === "preview" ? (
    <Preview />
  ) : (
    <MainLayout>{view === "grid" ? <MainGrid /> : <MainFocused />}</MainLayout>
  );
}

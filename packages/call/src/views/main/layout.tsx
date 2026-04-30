import Actions from "../../components/actions";
import TopBar from "../../components/top";

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="w-full h-full flex flex-col">
      <div className="shrink-0">
        <TopBar />
      </div>
      <div className="min-h-0 flex-1 w-full flex justify-center items-center overflow-hidden">
        {children}
      </div>
      <div className="shrink-0 pb-4.5 pt-3">
        <Actions />
      </div>
    </div>
  );
}

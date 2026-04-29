import Actions from "../../components/actions";
import TopBar from "../../components/top";

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="w-full h-full flex flex-col">
      <TopBar />
      <div className="w-full h-full">{children}</div>
      <Actions />
    </div>
  );
}

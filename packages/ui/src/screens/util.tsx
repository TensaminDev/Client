import Controls from "@tensamin/tauri/controls";

export default function CreateScreen({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div
      className="bg-background w-screen h-screen flex flex-col justify-center items-center"
      data-tauri-drag-region
    >
      <>
        <Controls className="fixed top-0 right-0 m-[7px] mr-[7.6px]! ring-foreground/15" />
        {children}
      </>
    </div>
  );
}

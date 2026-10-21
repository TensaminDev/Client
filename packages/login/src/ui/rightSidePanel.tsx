import OptionalPixelBlast from "@tensamin/shared/pixelBlast";

export default function RightSidePanel() {
  return (
    <div className="relative hidden 2xl:flex! flex-col justify-center w-300 border-l-2 bg-(--primary)/4">
      <OptionalPixelBlast
        transparent
        className="absolute w-full h-full opacity-65 z-0"
      />
      <a
        className="flex flex-col pl-10 z-10 w-auto mr-auto"
        href="https://shop.nonanium.net"
        target="_blank"
      >
        <p className="text-2xl font-semibold pb-3">Support us!</p>
        <p className="flex gap-1 items-center">
          <code className="text-sm p-0.5 px-1 rounded-md border-1 bg-muted">
            git checkout
          </code>
          our merch at
        </p>
        <p className="underline text-(--primary-foreground-alt)!">
          https://shop.nonanium.net/
        </p>
      </a>
    </div>
  );
}

import { ThemeCustomizer } from "@methanium/ui";

export default function Page() {
  return (
    <div>
      <ThemeCustomizer />
      <a
        className="mt-8 block max-w-md text-xs text-muted-foreground"
        href="https://git.methanium.net/tensamin/client/issues/new"
        target="_blank"
        rel="noreferrer"
      >
        Please open an issue on Git to tell us what you would like to see in
        here.
      </a>
    </div>
  );
}

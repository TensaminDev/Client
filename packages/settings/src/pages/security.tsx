import { ClearStorageButton } from "@methanium/ui";

export default function Page() {
  return (
    <div>
      <p className="text-muted-foreground text-sm mb-1">
        Think of this as a logout button
      </p>
      <ClearStorageButton className="w-full md:w-auto!" />
    </div>
  );
}

import { ErrorScreen } from "@nonanium/ui";

export default function Page() {
  return (
    <ErrorScreen
      error="Page not found (404)"
      description="This page does not exist."
      fullScreen={false}
      statusLink={false}
    />
  );
}

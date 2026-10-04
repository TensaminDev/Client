const sessionId =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function qrLoginLink(id: string): string {
  if (!sessionId.test(id)) throw new Error("Invalid temporary login ID");
  return `tensamin://qr-login?session=${id}`;
}

export function qrLoginId(input: string): string {
  if (sessionId.test(input)) return input;
  const url = new URL(input);
  const id = url.searchParams.get("session") ?? "";
  if (
    url.protocol !== "tensamin:" ||
    url.hostname !== "qr-login" ||
    url.username ||
    url.password ||
    url.port ||
    (url.pathname && url.pathname !== "/") ||
    url.hash ||
    [...url.searchParams.keys()].length !== 1 ||
    !sessionId.test(id)
  )
    throw new Error("Invalid QR login link");
  return id;
}

export function displayCallId(callId: string) {
  return callId.toUpperCase().slice(0, 4) + "..." + callId.toUpperCase().slice(-4);
}

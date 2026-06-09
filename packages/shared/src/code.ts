export function toLossySixDigitCode(input: string): string {
  let firstHash = 0xdeadbeef;
  let secondHash = 0x41c6ce57;

  for (let index = 0; index < input.length; index += 1) {
    const character = input.charCodeAt(index);

    firstHash = Math.imul(firstHash ^ character, 2654435761);
    secondHash = Math.imul(secondHash ^ character, 1597334677);
  }

  firstHash = Math.imul(firstHash ^ (firstHash >>> 16), 2246822507);
  firstHash ^= Math.imul(secondHash ^ (secondHash >>> 13), 3266489909);
  secondHash = Math.imul(secondHash ^ (secondHash >>> 16), 2246822507);
  secondHash ^= Math.imul(firstHash ^ (firstHash >>> 13), 3266489909);

  const hash = 4294967296 * (2097151 & secondHash) + (firstHash >>> 0);

  return String(hash % 1_000_000).padStart(6, "0");
}

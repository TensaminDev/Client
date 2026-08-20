const MAX_MTP_REQUEST_ID = 0xffff_ffff;

export class RequestIdAllocator {
  #next: number;

  constructor(next = 1) {
    if (
      !Number.isSafeInteger(next) ||
      next <= 0 ||
      next > MAX_MTP_REQUEST_ID + 1
    ) {
      throw new RangeError("invalid MTP request ID allocator state");
    }
    this.#next = next;
  }

  allocate(): number {
    if (this.#next > MAX_MTP_REQUEST_ID) {
      throw new Error("MTP request ID space exhausted for this connection");
    }

    return this.#next++;
  }
}

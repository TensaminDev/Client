export default function createAsyncQueue<T>() {
  let resolve!: (value: T) => void;

  const promise = new Promise<T>((r) => {
    resolve = r;
  });

  return {
    set: resolve,
    get: () => promise,
  };
}

// eslint-disable-next-line
type AnyFn = (...args: any[]) => any;

export function createQueuedFunc<F extends AnyFn>(
  getFn: () => F | null | undefined,
) {
  return (async (...args: Parameters<F>): Promise<Awaited<ReturnType<F>>> => {
    while (!getFn()) {
      await new Promise((r) => setTimeout(r, 50));
    }

    return await getFn()!(...args);
  }) as F;
}

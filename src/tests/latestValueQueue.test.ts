import { describe, expect, it } from "vitest";
import { LatestValueQueue } from "../lib/latestValueQueue";

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe("LatestValueQueue", () => {
  it("never runs two writes concurrently for the same key", async () => {
    const first = deferred<boolean>();
    const second = deferred<boolean>();
    let active = 0;
    let maxActive = 0;
    const calls: string[] = [];

    const queue = new LatestValueQueue<string>(async (_key, value) => {
      calls.push(value);
      active += 1;
      maxActive = Math.max(maxActive, active);
      const result = await (calls.length === 1 ? first.promise : second.promise);
      active -= 1;
      return result;
    }, () => undefined);

    queue.enqueue("cell", "A");
    queue.enqueue("cell", "B");

    expect(calls).toEqual(["A"]);
    expect(maxActive).toBe(1);

    first.resolve(true);
    await flushMicrotasks();
    expect(calls).toEqual(["A", "B"]);
    expect(maxActive).toBe(1);

    second.resolve(true);
    await flushMicrotasks();
    expect(queue.hasAnyActive()).toBe(false);
  });

  it("sends A and then only the newest pending value C", async () => {
    const first = deferred<boolean>();
    const second = deferred<boolean>();
    const calls: string[] = [];

    const queue = new LatestValueQueue<string>(async (_key, value) => {
      calls.push(value);
      return calls.length === 1 ? first.promise : second.promise;
    }, () => undefined);

    queue.enqueue("cell", "A");
    queue.enqueue("cell", "B");
    queue.enqueue("cell", "C");

    expect(calls).toEqual(["A"]);
    first.resolve(true);
    await flushMicrotasks();
    expect(calls).toEqual(["A", "C"]);

    second.resolve(true);
    await flushMicrotasks();
  });

  it("allows different keys to run concurrently", () => {
    const pending = new Map<string, ReturnType<typeof deferred<boolean>>>();
    let active = 0;
    let maxActive = 0;

    const queue = new LatestValueQueue<string>(async (key) => {
      const d = deferred<boolean>();
      pending.set(key, d);
      active += 1;
      maxActive = Math.max(maxActive, active);
      const result = await d.promise;
      active -= 1;
      return result;
    }, () => undefined);

    queue.enqueue("one", "A");
    queue.enqueue("two", "B");

    expect(maxActive).toBe(2);
    pending.get("one")?.resolve(true);
    pending.get("two")?.resolve(true);
  });

  it("does not report an old failure when a newer value is pending", async () => {
    const first = deferred<boolean>();
    const second = deferred<boolean>();
    const settled: Array<{ value: string; success: boolean }> = [];
    let callCount = 0;

    const queue = new LatestValueQueue<string>(async () => {
      callCount += 1;
      return callCount === 1 ? first.promise : second.promise;
    }, (info) => settled.push({ value: info.value, success: info.success }));

    queue.enqueue("cell", "old");
    queue.enqueue("cell", "new");

    first.resolve(false);
    await flushMicrotasks();
    expect(settled).toEqual([]);

    second.resolve(true);
    await flushMicrotasks();
    expect(settled).toEqual([{ value: "new", success: true }]);
    expect(queue.getLastConfirmed("cell")).toBe("new");
  });

  it("keeps the last confirmed value when the final write fails", async () => {
    const write = deferred<boolean>();
    const settled: Array<{ success: boolean }> = [];

    const queue = new LatestValueQueue<string>(
      async () => write.promise,
      (info) => settled.push({ success: info.success })
    );

    queue.seedConfirmed("cell", "server-value");
    queue.enqueue("cell", "new-value");
    write.resolve(false);
    await flushMicrotasks();

    expect(settled).toEqual([{ success: false }]);
    expect(queue.getLastConfirmed("cell")).toBe("server-value");
  });

  it("does not fire late settle callbacks after destroy", async () => {
    const write = deferred<boolean>();
    const settled: string[] = [];

    const queue = new LatestValueQueue<string>(
      async () => write.promise,
      (info) => settled.push(info.value)
    );

    queue.enqueue("cell", "A");
    queue.destroy();
    write.resolve(true);
    await flushMicrotasks();

    expect(settled).toEqual([]);
  });
});

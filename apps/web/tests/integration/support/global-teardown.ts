export default async function globalTeardown(): Promise<void> {
  const handle = globalThis.__OVERLOAD_PG__;
  if (handle) {
    await handle.stop();
    globalThis.__OVERLOAD_PG__ = undefined;
  }
}

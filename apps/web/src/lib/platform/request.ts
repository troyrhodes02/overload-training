import "server-only";
import { headers } from "next/headers";
import { isAppShellUserAgent } from "./app-shell";

/** Server: whether the current request comes from an Overload app shell. */
export async function isAppShellRequest(): Promise<boolean> {
  return isAppShellUserAgent((await headers()).get("user-agent"));
}

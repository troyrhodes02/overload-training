jest.mock("@/lib/data/account", () => ({
  requireAccountForDataRights: jest.fn(),
}));
jest.mock("@/lib/accounts/export", () => ({
  buildAccountExport: jest.fn(async () => ({ exportedOn: "2026-11-12" })),
  exportFilename: (d: string) => `overload-export-${d}.json`,
}));

import { requireAccountForDataRights } from "@/lib/data/account";
import { buildAccountExport } from "@/lib/accounts/export";
import { GET } from "@/app/(app)/settings/export/route";

/** OVE-125 (audit F-A7): a suspended account can still download its data. */
it("a suspended account gets its own export", async () => {
  const account = { userId: "u1", timeZone: "UTC", db: {} };
  (requireAccountForDataRights as jest.Mock).mockResolvedValue({
    account,
    suspended: true,
  });
  const res = await GET();
  expect(res.status).toBe(200);
  expect(res.headers.get("Content-Disposition")).toContain(
    "overload-export-2026-11-12.json",
  );
  expect(buildAccountExport).toHaveBeenCalledWith(account);
});

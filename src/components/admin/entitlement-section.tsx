"use client";

import * as React from "react";
import { useState, useTransition } from "react";
import { Gift } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  grantCompAction,
  revokeCompAction,
} from "@/app/admin/accounts/[id]/actions";
import type { AdminAccountBillingDto } from "@/lib/admin/types";

/**
 * Plans, Billing & Promo Codes — the admin account page's entitlement section
 * (design Screen 6; AC-3). Shows the resolved effective plan and source, the
 * READ-ONLY Stripe mirror, and grant/revoke of complimentary Pro (audited,
 * never touching Stripe). No training content appears here.
 */
export function AdminEntitlementSection({
  targetId,
  billing,
}: {
  targetId: string;
  billing: AdminAccountBillingDto;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [grantOpen, setGrantOpen] = useState(false);
  const [revokeOpen, setRevokeOpen] = useState(false);

  return (
    <section className="space-y-3 border-t border-border pt-6">
      <h2 className="text-base font-semibold">Plan &amp; entitlement</h2>
      <dl className="space-y-1.5 text-sm">
        <Row label="Effective">
          <span className="font-medium capitalize">
            {billing.effectivePlan}
          </span>
        </Row>
        <Row label="Source">
          <span className="capitalize">{billing.source}</span>
          {billing.comp ? (
            <span className="text-muted-foreground">
              {" "}
              · {billing.comp.reason.replace("_", " ")}
              {billing.comp.endsAt
                ? ` · until ${billing.comp.endsAt.slice(0, 10)}`
                : " · no end date"}
            </span>
          ) : null}
        </Row>
        <Row label="Subscription (Stripe, read-only)">
          {billing.stripe ? (
            <span className="text-muted-foreground">
              {billing.stripe.status}
              {billing.stripe.interval ? ` · ${billing.stripe.interval}` : ""}
              {billing.stripe.promoCode
                ? ` · promo ${billing.stripe.promoCode}`
                : ""}
            </span>
          ) : (
            <span className="text-muted-foreground">none</span>
          )}
        </Row>
      </dl>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <div className="flex gap-2">
        {billing.comp ? (
          <Dialog open={revokeOpen} onOpenChange={setRevokeOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm">
                Revoke complimentary access
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Revoke complimentary Pro</DialogTitle>
              </DialogHeader>
              <p className="text-sm text-muted-foreground">
                This removes complimentary Pro from this account. Access is
                recalculated from any other valid source (trial or
                subscription). No training data is affected.
              </p>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setRevokeOpen(false)}>
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  disabled={pending}
                  onClick={() => {
                    setError(null);
                    startTransition(async () => {
                      const r = await revokeCompAction(targetId);
                      if (!r.ok) setError(r.error.message);
                      else setRevokeOpen(false);
                    });
                  }}
                >
                  Revoke access
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        ) : (
          <Dialog open={grantOpen} onOpenChange={setGrantOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm">
                <Gift className="h-4 w-4" />
                Grant complimentary access
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Grant complimentary Pro</DialogTitle>
              </DialogHeader>
              <GrantForm
                pending={pending}
                onCancel={() => setGrantOpen(false)}
                onSubmit={(data) => {
                  setError(null);
                  startTransition(async () => {
                    const r = await grantCompAction({ targetId, ...data });
                    if (!r.ok) setError(r.error.message);
                    else setGrantOpen(false);
                  });
                }}
              />
            </DialogContent>
          </Dialog>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        Stripe facts are a read-only mirror. Only complimentary access is
        editable here, and it never touches Stripe.
      </p>
    </section>
  );
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:justify-between">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="sm:text-right">{children}</dd>
    </div>
  );
}

function GrantForm({
  pending,
  onCancel,
  onSubmit,
}: {
  pending: boolean;
  onCancel: () => void;
  onSubmit: (data: {
    reason: "friend" | "creator" | "tester" | "founding_member" | "other";
    note?: string;
    endsAt?: string;
  }) => void;
}) {
  const [reason, setReason] = useState<
    "friend" | "creator" | "tester" | "founding_member" | "other"
  >("founding_member");
  const [note, setNote] = useState("");
  const [endsAt, setEndsAt] = useState("");

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="comp-reason">Reason</Label>
        <NativeSelect
          id="comp-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value as typeof reason)}
        >
          <option value="friend">Friend</option>
          <option value="creator">Creator</option>
          <option value="tester">Tester</option>
          <option value="founding_member">Founding member</option>
          <option value="other">Other</option>
        </NativeSelect>
      </div>
      {reason === "other" ? (
        <div className="space-y-1.5">
          <Label htmlFor="comp-note">Note</Label>
          <Input
            id="comp-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Required for Other"
          />
        </div>
      ) : null}
      <div className="space-y-1.5">
        <Label htmlFor="comp-ends">Ends on (optional)</Label>
        <Input
          id="comp-ends"
          type="date"
          value={endsAt}
          onChange={(e) => setEndsAt(e.target.value)}
        />
      </div>
      <DialogFooter>
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          disabled={pending}
          onClick={() =>
            onSubmit({
              reason,
              note: note.trim() || undefined,
              endsAt: endsAt || undefined,
            })
          }
        >
          Grant access
        </Button>
      </DialogFooter>
    </div>
  );
}

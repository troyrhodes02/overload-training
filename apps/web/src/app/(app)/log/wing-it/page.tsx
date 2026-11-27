import Link from "next/link";
import { redirect } from "next/navigation";
import { listActiveGyms } from "@/lib/gyms/queries";
import { getWingItToday } from "@/lib/logging/wing-it";
import { GymPicker } from "@/components/logging/gym-picker";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { requireAccount } from "@/lib/data/account";
import {
  WING_IT_COPY,
  wingItBlockedMessage,
  wingItBlockedResume,
} from "@overload/shared/logging/wing-it";

export const metadata = { title: "Start Wing-It workout · Overload" };

/**
 * Pitch 25 (design §6.6): where a Wing-It workout starts. An open one is
 * resumed straight away; while another workout is in progress with saved
 * sets, the page says which and offers Resume (nothing starts or is
 * discarded). Otherwise the planned start's "Where are you training?" choice.
 */
export default async function StartWingItPage() {
  const account = await requireAccount();
  const wingIt = await getWingItToday(account);
  if (wingIt.open) redirect(`/log/${wingIt.open.loggedSessionId}`);

  if (wingIt.blockedBy) {
    return (
      <section className="space-y-4">
        <p className="font-medium">{WING_IT_COPY.start}</p>
        <Alert role="alert">
          <AlertDescription>
            {wingItBlockedMessage(wingIt.blockedBy.sessionName)}{" "}
            <Link
              href={`/log/${wingIt.blockedBy.loggedSessionId}`}
              className="font-medium underline"
            >
              {wingItBlockedResume(wingIt.blockedBy.sessionName)}
            </Link>
          </AlertDescription>
        </Alert>
      </section>
    );
  }

  const gyms = await listActiveGyms(account);
  return (
    <section className="space-y-4">
      <p className="font-medium">Where are you training?</p>
      <div className="rounded-lg border border-border bg-card p-4">
        <GymPicker
          mode="wing_it"
          gyms={gyms.map((g) => ({ id: g.id, name: g.name }))}
          confirmLabel={WING_IT_COPY.start}
        />
      </div>
    </section>
  );
}

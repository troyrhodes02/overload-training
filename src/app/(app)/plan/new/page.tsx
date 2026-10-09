import { BackLink } from "@/components/plan/plan-bits";
import { MesocycleForm } from "@/components/plan/mesocycle-form";
import {
  DEFAULT_DELOAD_WEEK,
  DEFAULT_LENGTH_WEEKS,
} from "@/lib/plan/validation";
import { createMesocycleAction } from "../actions";

export const metadata = { title: "New mesocycle · Overload" };

export default function NewMesocyclePage() {
  return (
    <section className="space-y-6 pb-24 md:pb-0">
      <div className="space-y-1">
        <BackLink href="/plan" label="Plan" />
        <h1 className="text-lg font-semibold">New mesocycle</h1>
      </div>
      <MesocycleForm
        action={createMesocycleAction}
        variant="create"
        submitLabel="Create draft"
        pendingLabel="Creating…"
        // 5 weeks / deload week 5 are editable pre-fills (spec D6, D7). The
        // start date is never inferred (spec D60); no structure is pre-chosen.
        initial={{
          name: "",
          startDate: "",
          lengthWeeks: String(DEFAULT_LENGTH_WEEKS),
          deloadWeek: String(DEFAULT_DELOAD_WEEK),
          splitType: "",
        }}
      />
    </section>
  );
}

import type {
  ExerciseRecordsDto,
  RecordSetDto,
} from "@/lib/progression/history-types";
import { formatLoad } from "@/lib/progression/history-format";

/**
 * The records of one scope (design doc §4.3, Screen 1; preview §02): one
 * bordered card of labelled rows — never a badge, an icon, a colour, or a
 * "new" marker (AC-3). Best set is what was lifted; Best e1RM is its estimate
 * and says so in words; Heaviest is a real completed set; rep records are the
 * rep-max frontier, so a lighter longer set never reads as "better".
 */
export function ExerciseRecords({
  records,
  scopeName,
}: {
  records: ExerciseRecordsDto;
  /** The gym, for a machine or cable; null otherwise. */
  scopeName: string | null;
}) {
  return (
    <section aria-labelledby="records-heading" className="space-y-2">
      <h2 id="records-heading" className="text-base font-medium">
        Records
        {scopeName ? (
          <span className="font-normal text-muted-foreground">
            {" "}
            · {scopeName}
          </span>
        ) : null}
      </h2>
      <div className="divide-y divide-border rounded-lg border border-border bg-card">
        {records.kind === "bodyweight" ? (
          <Cell label="Most reps in a set">
            <div className="flex items-baseline justify-between gap-2">
              <Value large>
                {records.mostReps.reps}
                <Unit>reps</Unit>
              </Value>
              <Meta>{records.mostReps.dateLabel}</Meta>
            </div>
          </Cell>
        ) : (
          <>
            <Cell label="Best set">
              <div className="flex items-baseline justify-between gap-2">
                <Value large>
                  <SetText set={records.bestSet} />
                  <Unit>lb</Unit>
                </Value>
                <Meta>{records.bestSet.dateLabel}</Meta>
              </div>
            </Cell>
            <div className="grid grid-cols-2 divide-x divide-border">
              <Cell label="Best e1RM · estimate">
                <Value>
                  {records.bestE1rm}
                  <Unit>lb</Unit>
                </Value>
                <Meta>
                  from <SetText set={records.bestSet} />
                </Meta>
              </Cell>
              <Cell label="Heaviest weight">
                <Value>
                  <SetText set={records.heaviest} />
                </Value>
                <Meta>{records.heaviest.dateLabel}</Meta>
              </Cell>
            </div>
            <div className="px-3.5 py-3">
              <table className="w-full text-sm tabular-nums">
                <caption className="pb-1 text-left text-xs text-muted-foreground">
                  Rep records · most reps at this weight or heavier
                </caption>
                <thead>
                  <tr className="text-xs text-muted-foreground">
                    <th scope="col" className="pb-0.5 text-left font-normal">
                      Weight
                    </th>
                    <th scope="col" className="pb-0.5 text-right font-normal">
                      Reps
                    </th>
                    <th scope="col" className="pb-0.5 text-right font-normal">
                      Date
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {records.repRecords.map((r) => (
                    <tr key={`${r.weightLbs}-${r.reps}`}>
                      <td className="py-0.5">{formatLoad(r.weightLbs)} lb</td>
                      <td className="py-0.5 text-right">{r.reps}</td>
                      <td className="py-0.5 text-right text-xs text-muted-foreground">
                        {r.dateLabel}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        Working sets of finished workouts. Deload weeks don&apos;t count.
      </p>
    </section>
  );
}

function SetText({ set }: { set: RecordSetDto }) {
  return (
    <>
      {formatLoad(set.weightLbs)} × {set.reps}
    </>
  );
}

function Cell({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5 px-3.5 py-3">
      <span className="text-xs text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

function Value({
  large = false,
  children,
}: {
  large?: boolean;
  children: React.ReactNode;
}) {
  return (
    <span
      className={
        large
          ? "text-xl font-semibold tabular-nums tracking-tight"
          : "text-lg font-semibold tabular-nums tracking-tight"
      }
    >
      {children}
    </span>
  );
}

function Unit({ children }: { children: React.ReactNode }) {
  return (
    <span className="ml-0.5 text-xs font-normal tracking-normal text-muted-foreground">
      {children}
    </span>
  );
}

function Meta({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-xs tabular-nums text-muted-foreground">
      {children}
    </span>
  );
}

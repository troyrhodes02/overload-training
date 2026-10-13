import type { Scenario } from "./scenario";
import { fresh } from "./scenarios/fresh";
import { established } from "./scenarios/established";
import { plateau } from "./scenarios/plateau";
import { multiGym } from "./scenarios/multi-gym";

/**
 * The one scenario registry (dev tooling only). To add a scenario: write a
 * module exporting a `Scenario` (build facts from an anchor date + verify the
 * intended derived states through the real read layer) and list it here. The
 * CLI, --list, reset, verification, and report all come from this list.
 */
export const SCENARIOS: readonly Scenario[] = [
  fresh,
  established,
  plateau,
  multiGym,
];

export function findScenario(key: string): Scenario | undefined {
  return SCENARIOS.find((s) => s.key === key);
}

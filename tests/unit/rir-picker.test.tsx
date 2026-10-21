import { renderToStaticMarkup } from "react-dom/server";
import { RirPicker } from "@/components/logging/rir-picker";

/**
 * The optional RIR choice (RIR Logging & Autoregulation spec §7, R22–R24;
 * preview §08). Static markup: nothing chosen by default, one value pressed
 * when given, five 44px outline chips `0 1 2 3 4+`, a neutral selected state.
 * Toggling, clearing, and focus are covered in e2e/accounts/rir-logging.spec.ts.
 */
const render = (value: number | null, extra: { disabled?: boolean } = {}) =>
  renderToStaticMarkup(
    <RirPicker
      label="Set 2 RIR (reps in reserve, optional)"
      value={value}
      onChange={() => {}}
      {...extra}
    />,
  );

const pressed = (html: string) =>
  [...html.matchAll(/<button[^>]*aria-checked="true"[^>]*>([^<]*)</g)].map(
    (m) => m[1],
  );

describe("RirPicker", () => {
  it("renders 0 1 2 3 4+ with nothing pressed when not recorded", () => {
    const html = render(null);
    const labels = [...html.matchAll(/<button[^>]*>([^<]*)<\/button>/g)].map(
      (m) => m[1],
    );
    expect(labels).toEqual(["0", "1", "2", "3", "4+"]);
    expect(pressed(html)).toEqual([]);
  });

  it("presses exactly the recorded value — 0 is a value, not empty", () => {
    expect(pressed(render(2))).toEqual(["2"]);
    expect(pressed(render(0))).toEqual(["0"]);
    expect(pressed(render(4))).toEqual(["4+"]);
  });

  it("names the group and each chip for screen readers", () => {
    const html = render(null);
    // Radix renders a single-select toggle group as a radio group.
    expect(html).toContain('role="radiogroup"');
    expect(html).toContain(
      'aria-label="Set 2 RIR (reps in reserve, optional)"',
    );
    expect(html).toContain('aria-label="4 or more"');
  });

  it("uses 44px outline chips with a neutral (not primary) selected state", () => {
    const html = render(1);
    expect(html).toContain("h-11");
    expect(html).toContain("min-w-11");
    expect(html).toContain("data-[state=on]:bg-accent");
    expect(html).not.toMatch(/bg-primary/);
  });

  it("shows the muted RIR prefix by default and hides it for the dialog", () => {
    expect(render(null)).toContain(">RIR</span>");
    expect(
      renderToStaticMarkup(
        <RirPicker
          label="x"
          value={null}
          onChange={() => {}}
          showLabel={false}
        />,
      ),
    ).not.toContain(">RIR</span>");
  });

  it("can be named by a visible label instead (the correction dialog)", () => {
    const html = renderToStaticMarkup(
      <RirPicker
        label="unused"
        labelledBy="rir-ls-1"
        value={null}
        onChange={() => {}}
        showLabel={false}
      />,
    );
    expect(html).toContain('aria-labelledby="rir-ls-1"');
    expect(html).not.toContain('aria-label="unused"');
  });

  it("disables every chip while saving", () => {
    const html = render(2, { disabled: true });
    expect(html.match(/<button[^>]*disabled=""/g)?.length).toBe(5);
  });
});

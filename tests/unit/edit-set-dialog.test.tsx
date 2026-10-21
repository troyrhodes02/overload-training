import { renderToStaticMarkup } from "react-dom/server";

jest.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: jest.fn() }),
}));
jest.mock("@/app/(app)/history/actions", () => ({
  editLoggedSetAction: jest.fn(),
}));

import { EditSetDialog } from "@/components/logging/edit-set-dialog";

/**
 * The correction dialog is shared (Faster Logging UX R17): History keeps its
 * "edit" link; the logging card supplies a logged row as the trigger. The
 * dialog's content and action are the same either way.
 */
const props = {
  loggedSetId: "ls-1",
  setNumber: 2,
  exerciseName: "Barbell Bench Press",
  requiresExternalWeight: true,
  weightLbs: 185,
  reps: 8,
};

describe("EditSetDialog trigger", () => {
  it("defaults to History's edit link", () => {
    const html = renderToStaticMarkup(<EditSetDialog {...props} />);
    expect(html).toMatch(/<button[^>]*>edit<\/button>/);
  });

  it("uses a supplied trigger instead", () => {
    const html = renderToStaticMarkup(
      <EditSetDialog
        {...props}
        trigger={<button type="button">Set 2 row</button>}
      />,
    );
    expect(html).toContain("Set 2 row");
    expect(html).not.toMatch(/>edit<\/button>/);
    expect(html).toContain('aria-haspopup="dialog"');
  });
});

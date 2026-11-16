/** Pitch 21d design T1–T4: honest placeholders, in both appearances. */
import { fireEvent, render, screen } from "@testing-library/react-native";
import { Linking } from "react-native";
import { Placeholder } from "../src/screens/Placeholder";
import { ThemeProvider } from "../src/ui/ThemeProvider";

jest.mock("../src/config/env", () => ({
  ENV: {
    ok: true,
    config: {
      environment: "staging",
      apiOrigin: "https://staging.test",
      localApi: false,
      supabaseRef: "ref",
    },
  },
  APP_VERSION: "0.1.0",
  webOrigin: () => "https://staging.test",
}));

describe("Placeholder", () => {
  it("has the shared header, says what the web does now, and links there", async () => {
    const openURL = jest.spyOn(Linking, "openURL").mockResolvedValue(undefined);
    await render(
      <ThemeProvider>
        <Placeholder
          eyebrow="Strength targets"
          title="Goals"
          icon="target"
          heading="Set and track goals on the web"
          message="Goals come to the app in a later update."
          webItems={["Set a weight and reps target"]}
          cta="Open Goals on the web"
          webPath="/goals"
        />
      </ThemeProvider>,
    );
    expect(await screen.findByRole("header", { name: "Goals" })).toBeTruthy();
    expect(screen.getByText("Strength targets")).toBeTruthy();
    expect(
      screen.getByText("Goals come to the app in a later update."),
    ).toBeTruthy();
    await fireEvent.press(
      screen.getByRole("button", { name: "Open Goals on the web" }),
    );
    expect(openURL).toHaveBeenCalledWith("https://staging.test/goals");
  });
});

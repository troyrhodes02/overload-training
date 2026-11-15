/** Pitch 21d design T1–T4: honest placeholders, in both appearances. */
import { render, screen } from "@testing-library/react-native";
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
  it("says the feature is coming and offers the web, with no fake data", async () => {
    await render(
      <ThemeProvider>
        <Placeholder
          icon="target"
          title="Goals come to the app in a later update."
          message="Set and track your goals on the web now."
        />
      </ThemeProvider>,
    );
    expect(
      await screen.findByText("Goals come to the app in a later update."),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Open Overload on the web" }),
    ).toBeTruthy();
  });
});

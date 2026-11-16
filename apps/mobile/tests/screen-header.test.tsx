/** Pitch 21e Checkpoint A (RD-24): every tab root has the shared header. */
import { render, screen } from "@testing-library/react-native";
import { Text } from "react-native";
import { ScreenHeader } from "../src/ui/ScreenHeader";
import { TabScreen } from "../src/ui/TabScreen";
import { ThemeProvider } from "../src/ui/ThemeProvider";

describe("ScreenHeader", () => {
  it("shows the context line, the title as a header, and the subtitle", async () => {
    await render(
      <ThemeProvider>
        <ScreenHeader
          eyebrow="Sunday, November 15"
          title="Today"
          subtitle="Good afternoon, Quinn."
        />
      </ThemeProvider>,
    );
    expect(await screen.findByRole("header", { name: "Today" })).toBeTruthy();
    expect(screen.getByText("Sunday, November 15")).toBeTruthy();
    expect(screen.getByText("Good afternoon, Quinn.")).toBeTruthy();
  });

  it("TabScreen puts the header above the content", async () => {
    await render(
      <ThemeProvider>
        <TabScreen title="History">
          <Text>Week content</Text>
        </TabScreen>
      </ThemeProvider>,
    );
    expect(await screen.findByRole("header", { name: "History" })).toBeTruthy();
    expect(screen.getByText("Week content")).toBeTruthy();
  });
});

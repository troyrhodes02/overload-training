/**
 * Pitch 21l (RD-22, RD-23): What's New and the tour on the phone. The sheet
 * never opens while a tour runs, and opens once it has ended.
 */
import { render, screen } from "@testing-library/react-native";
import { WhatsNewSheet } from "../src/account/WhatsNewSheet";
import {
  resetWhatsNewLaunch,
  shouldShowWhatsNew,
} from "../src/account/whats-new-model";
import { meDto, Providers } from "./harness";

const mockApi = { request: jest.fn(async () => ({ moved: true })) };
jest.mock("../src/api/ApiProvider", () => ({ useApi: () => mockApi }));
jest.mock("expo-router", () => ({ usePathname: () => "/today" }));
const mockTour = { active: false, start: jest.fn() };
jest.mock("../src/tour/TourProvider", () => ({ useTour: () => mockTour }));

const entry = {
  id: "2026-11-26-overload-on-iphone",
  date: "2026-11-26",
  title: "Overload on iPhone",
  body: "Overload now has an iPhone app, in a private beta for invited testers.",
};
const due = { entries: [entry], throughId: entry.id };

beforeEach(() => {
  resetWhatsNewLaunch();
  mockTour.active = false;
});

describe("shouldShowWhatsNew", () => {
  it("waits while a tour is running", () => {
    expect(
      shouldShowWhatsNew({ due: true, pathname: "/today", tourActive: true }),
    ).toBe(false);
    expect(
      shouldShowWhatsNew({ due: true, pathname: "/today", tourActive: false }),
    ).toBe(true);
    expect(shouldShowWhatsNew({ due: true, pathname: "/today" })).toBe(true);
  });
});

describe("the sheet and a running tour", () => {
  it("stays closed during a tour, then opens once the tour ends", async () => {
    mockTour.active = true;
    const view = await render(
      <Providers me={meDto({ whatsNew: due })}>
        <WhatsNewSheet />
      </Providers>,
    );
    expect(screen.queryByText("Overload on iPhone")).toBeNull();
    mockTour.active = false;
    await view.rerender(
      <Providers me={meDto({ whatsNew: due })}>
        <WhatsNewSheet />
      </Providers>,
    );
    expect(await screen.findByText("Overload on iPhone")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Got it" })).toBeTruthy();
  });
});

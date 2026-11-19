/**
 * Focused text was clipped at the bottom (owner report, sign-in email on the
 * iPhone, 2026-11-18): the shared TextField gave a single-line iOS field a
 * fixed line height, and its focus ring grew the border by a point without
 * giving it back, so the text area shrank under the line on focus. The
 * letters' descenders were cut while editing and looked fine once blurred.
 *
 * These pin the two causes in every state: no line height on a single-line
 * field, and the same text area focused, blurred, or showing an error.
 */
import { StyleSheet } from "react-native";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { TextField, fieldFrame } from "../src/ui/TextField";
import { inputTextSize, textSize } from "../src/ui/theme";
import { Providers } from "./harness";

type Style = {
  lineHeight?: number;
  fontSize?: number;
  borderWidth?: number;
  paddingVertical?: number;
  paddingHorizontal?: number;
};

const styleOf = (label: string): Style =>
  StyleSheet.flatten(screen.getByLabelText(label).props.style) as Style;

/** Border plus padding on one side: what is left for the text is the rest. */
const inset = (s: Style) => ({
  vertical: (s.borderWidth ?? 0) + (s.paddingVertical ?? 0),
  horizontal: (s.borderWidth ?? 0) + (s.paddingHorizontal ?? 0),
});

describe("the shared TextField (sign-in, sign-up, Edit set, Log cardio)", () => {
  it("a single-line field has no fixed line height, focused or not", async () => {
    await render(
      <Providers>
        <TextField label="Email" value="gary.pyle@example.com" />
      </Providers>,
    );
    expect(styleOf("Email").lineHeight).toBeUndefined();
    expect(styleOf("Email").fontSize).toBe(textSize("base").fontSize);
    await fireEvent(screen.getByLabelText("Email"), "focus");
    expect(styleOf("Email").lineHeight).toBeUndefined();
    expect(styleOf("Email").fontSize).toBe(textSize("base").fontSize);
  });

  it("focusing draws the 2-point ring without shrinking the text area", async () => {
    await render(
      <Providers>
        <TextField label="Email" value="gary.pyle@example.com" />
      </Providers>,
    );
    const blurred = styleOf("Email");
    await fireEvent(screen.getByLabelText("Email"), "focus");
    const focused = styleOf("Email");
    expect([blurred.borderWidth, focused.borderWidth]).toEqual([1, 2]);
    expect(inset(focused)).toEqual(inset(blurred));
    await fireEvent(screen.getByLabelText("Email"), "blur");
    expect(styleOf("Email")).toEqual(blurred);
  });

  it("an error border keeps the same text area too", async () => {
    await render(
      <Providers>
        <TextField label="Password" value="p" error="Enter your password." />
      </Providers>,
    );
    expect(styleOf("Password").borderWidth).toBe(2);
    expect(inset(styleOf("Password"))).toEqual(inset(fieldFrame(false)));
  });

  it("a multiline field keeps the line height it wraps with", async () => {
    await render(
      <Providers>
        <TextField label="Notes" multiline value={"one\ntwo"} />
      </Providers>,
    );
    expect(styleOf("Notes").lineHeight).toBe(textSize("base").lineHeight);
  });

  it("the secure password field and the email keyboard are unchanged", async () => {
    await render(
      <Providers>
        <TextField
          label="Password"
          secureTextEntry
          textContentType="password"
          value="x"
        />
        <TextField
          label="Email"
          keyboardType="email-address"
          autoCapitalize="none"
          value=""
        />
      </Providers>,
    );
    const password = screen.getByLabelText("Password").props;
    const email = screen.getByLabelText("Email").props;
    expect(password.secureTextEntry).toBe(true);
    expect(email.keyboardType).toBe("email-address");
    expect(email.autoCapitalize).toBe("none");
  });
});

describe("inputTextSize", () => {
  it("is the type scale's font size, with the line height only for multiline", () => {
    for (const size of ["sm", "base", "lg", "xl"] as const) {
      expect(inputTextSize(size)).toEqual({
        fontSize: textSize(size).fontSize,
      });
      expect(inputTextSize(size, { multiline: true })).toEqual(textSize(size));
    }
  });
});

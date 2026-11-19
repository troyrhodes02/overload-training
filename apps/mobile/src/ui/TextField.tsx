import { useState, type ComponentRef, type Ref } from "react";
import { TextInput, View, type TextInputProps } from "react-native";
import { fontFamily, inputTextSize } from "./theme";
import { Text } from "./Text";
import { useTheme } from "./ThemeProvider";

/** The handle a TextField ref receives (focus, blur). */
export type TextInputHandle = ComponentRef<typeof TextInput>;

export type TextFieldProps = Omit<TextInputProps, "ref"> & {
  label: string;
  error?: string | null;
  hint?: string;
  ref?: Ref<TextInputHandle>;
};

/** The field's resting border and padding (design §8). */
const BORDER = 1;
const PADDING_X = 12;
const PADDING_Y = 10;

/**
 * Border and padding for a state. The focus ring (and an error) draws a
 * 2-point border; the padding gives back the extra point, so the text area is
 * the same size focused or not and the text never moves or gets cut.
 */
export function fieldFrame(emphasized: boolean): {
  borderWidth: number;
  paddingHorizontal: number;
  paddingVertical: number;
} {
  const borderWidth = emphasized ? 2 : BORDER;
  const giveBack = borderWidth - BORDER;
  return {
    borderWidth,
    paddingHorizontal: PADDING_X - giveBack,
    paddingVertical: PADDING_Y - giveBack,
  };
}

/**
 * A labelled input with its field error under it (design §8). The error is
 * announced to VoiceOver with the field, and the focus ring uses the `ring`
 * token.
 */
export function TextField({
  label,
  error,
  hint,
  style,
  onFocus,
  onBlur,
  ref,
  ...rest
}: TextFieldProps) {
  const theme = useTheme();
  const { colors, radius, controlHeight } = theme;
  const [focused, setFocused] = useState(false);
  const borderColor = error
    ? colors.destructive
    : focused
      ? colors.ring
      : colors.input;
  return (
    <View style={{ gap: 6 }}>
      <Text size="sm" weight="medium">
        {label}
      </Text>
      <TextInput
        ref={ref}
        accessibilityLabel={label}
        accessibilityHint={error ?? hint}
        placeholderTextColor={colors.mutedForeground}
        keyboardAppearance={theme.scheme}
        selectionColor={colors.primary}
        onFocus={(e) => {
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          onBlur?.(e);
        }}
        style={[
          {
            minHeight: controlHeight.lg,
            borderRadius: radius.lg,
            ...fieldFrame(focused || Boolean(error)),
            borderColor,
            backgroundColor: colors.card,
            color: colors.foreground,
            fontFamily: fontFamily.regular,
            ...inputTextSize("base", { multiline: rest.multiline }),
          },
          style,
        ]}
        {...rest}
      />
      {error ? (
        <Text size="sm" tone="destructive" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : hint ? (
        <Text size="xs" tone="muted">
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

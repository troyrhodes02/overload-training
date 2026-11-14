import { useState, type ComponentRef, type Ref } from "react";
import { TextInput, View, type TextInputProps } from "react-native";
import { fontFamily, textSize } from "./theme";
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
            borderWidth: focused || error ? 2 : 1,
            borderColor,
            backgroundColor: colors.card,
            paddingHorizontal: 12,
            paddingVertical: 10,
            color: colors.foreground,
            fontFamily: fontFamily.regular,
            ...textSize("base"),
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

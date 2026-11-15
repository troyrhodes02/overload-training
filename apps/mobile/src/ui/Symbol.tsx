import { SymbolView, type SymbolViewProps } from "expo-symbols";

/** An SF Symbol (RD-2): the icon set the native tab bar uses too. */
export function Symbol({
  name,
  size = 22,
  color,
  weight = "regular",
}: {
  name: SymbolViewProps["name"];
  size?: number;
  color: string;
  weight?: SymbolViewProps["weight"];
}) {
  return (
    <SymbolView
      name={name}
      size={size}
      tintColor={color}
      weight={weight}
      accessibilityElementsHidden
      importantForAccessibility="no"
    />
  );
}

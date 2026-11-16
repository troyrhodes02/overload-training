// jest-expo mocks the native modules. Keep the Keychain in memory per test.
jest.mock("expo-secure-store", () => {
  const store = new Map<string, string>();
  return {
    AFTER_FIRST_UNLOCK: 0,
    WHEN_UNLOCKED_THIS_DEVICE_ONLY: 1,
    getItemAsync: jest.fn(async (k: string) => store.get(k) ?? null),
    setItemAsync: jest.fn(async (k: string, v: string) => {
      store.set(k, v);
    }),
    deleteItemAsync: jest.fn(async (k: string) => {
      store.delete(k);
    }),
    __store: store,
  };
});
jest.mock("expo-symbols", () => ({ SymbolView: () => null }));

// InputAccessoryView, modelled the way iOS lays it out (OVE-214): an empty
// placeholder in the row, carrying the component's style (pointerEvents), and
// the bar's content in the keyboard, NOT inside that placeholder. The real
// component renders the content as the placeholder's children, which would let
// the placeholder's pointerEvents block the bar's buttons in tests although on
// the device the bar is a different view hierarchy.
jest.mock(
  "react-native/Libraries/Components/TextInput/InputAccessoryView",
  () => {
    const { createElement, Fragment } =
      jest.requireActual<typeof import("react")>("react");
    function InputAccessoryView(props: {
      nativeID?: string;
      style?: unknown;
      children?: import("react").ReactNode;
    }) {
      return createElement(
        Fragment,
        null,
        createElement("RCTInputAccessoryView", {
          nativeID: props.nativeID,
          style: [props.style, { position: "absolute" }],
        }),
        createElement(
          "KeyboardAccessoryContent",
          { nativeID: props.nativeID },
          props.children,
        ),
      );
    }
    return { __esModule: true, default: InputAccessoryView };
  },
);

import { useState } from "react";
import { Modal, ScrollView, View } from "react-native";
import { usePathname } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { WhatsNewDialogData } from "@overload/shared/contracts/release-notes";
import { useMarkReleaseNotesSeen } from "../api/account";
import { useMe } from "../api/queries";
import { useTour } from "../tour/TourProvider";
import { Button } from "../ui/Button";
import { Text } from "../ui/Text";
import { useTheme } from "../ui/ThemeProvider";
import { ReleaseNoteList } from "./ReleaseNoteItem";
import { markWhatsNewShown, shouldShowWhatsNew } from "./whats-new-model";

/**
 * A5 What's New sheet (Pitch 21j design §6 A5; RD-5, RD-7). When the server
 * says significant updates are unseen, one page sheet shows them together,
 * newest first, once per launch and never over a workout. Closing it — Got it
 * or a swipe down — marks everything through the newest entry seen for the
 * account, so the web won't show it again either. It never opens while a
 * tour is running (21l RD-23).
 */
export function WhatsNewSheet() {
  const me = useMe(true);
  const pathname = usePathname();
  const due = me.data?.whatsNew ?? null;
  const [open, setOpen] = useState<WhatsNewDialogData | null>(null);
  const mark = useMarkReleaseNotesSeen();
  const { active: tourActive } = useTour();

  // Decided during render (React's pattern for state that follows props):
  // once per launch, and never over a workout.
  if (!open && due && shouldShowWhatsNew({ due: true, pathname, tourActive })) {
    markWhatsNewShown();
    setOpen(due);
  }

  const close = () => {
    if (!open) return;
    mark.mutate(open.throughId);
    setOpen(null);
  };

  return <WhatsNewSheetView data={open} onClose={close} />;
}

export function WhatsNewSheetView({
  data,
  onClose,
}: {
  data: WhatsNewDialogData | null;
  onClose: () => void;
}) {
  const { colors, spacing } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal
      visible={data !== null}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
      onDismiss={undefined}
    >
      <View
        style={{
          flex: 1,
          backgroundColor: colors.background,
          paddingBottom: insets.bottom + spacing.lg,
        }}
      >
        <ScrollView
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm }}
        >
          <Text
            size="lg"
            weight="semibold"
            align="center"
            accessibilityRole="header"
          >
            What&apos;s new
          </Text>
          {data ? <ReleaseNoteList entries={data.entries} /> : null}
        </ScrollView>
        <View style={{ paddingHorizontal: spacing.lg }}>
          <Button label="Got it" onPress={onClose} />
        </View>
      </View>
    </Modal>
  );
}

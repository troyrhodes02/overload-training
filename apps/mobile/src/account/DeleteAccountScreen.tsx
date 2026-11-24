import { useRef, useState } from "react";
import { Alert, Pressable, View } from "react-native";
import { Stack, router, usePreventRemove } from "expo-router";
import type { AccountInventoryDto } from "@overload/shared/contracts/account";
import { useDeleteAccount, useDeletionInventory } from "../api/account";
import { useApi } from "../api/ApiProvider";
import { ApiError } from "../api/errors";
import { useSession } from "../auth/session";
import { afterAccountDeleted } from "../accounts/after-deletion";
import { Banner } from "../ui/Banner";
import { Button } from "../ui/Button";
import { FormScreen } from "../ui/FormScreen";
import { GroupedList, ListRow } from "../ui/GroupedList";
import { haptic } from "../ui/haptics";
import { LoadErrorState } from "../ui/LoadErrorState";
import { SkeletonCard } from "../ui/Skeleton";
import { Text } from "../ui/Text";
import { TextField, type TextInputHandle } from "../ui/TextField";
import { useTheme } from "../ui/ThemeProvider";
import {
  BILLING_NOTE,
  DELETE_MESSAGES,
  INVENTORY_ROWS,
  checkAgainView,
  deletionFailure,
  type DeletionView,
} from "./deletion-model";

/**
 * A9 Delete account (Pitch 21j design §6 A9, §15; RD-16, RD-17, RD-19).
 * What will go, in the lifter's own numbers; the billing note; the current
 * password; then a system alert. Only the server's confirmation (or the
 * account's token no longer verifying) counts as deleted; then nothing
 * private stays on the phone.
 */
export function DeleteAccountScreen() {
  const inventory = useDeletionInventory();
  if (!inventory.data) {
    return (
      <>
        <Stack.Screen options={{ title: "Delete account" }} />
        <FormScreen>
          {inventory.isError ? (
            <LoadErrorState
              error={inventory.error}
              subject="Your account"
              request="GET /me/deletion-inventory"
              onRetry={() => void inventory.refetch()}
              retrying={inventory.isFetching}
            />
          ) : (
            <SkeletonCard rows={5} />
          )}
        </FormScreen>
      </>
    );
  }
  return (
    <DeleteForm
      inventory={inventory.data}
      refetchInventory={() => inventory.refetch().then((r) => r.data)}
    />
  );
}

function DeleteForm({
  inventory,
  refetchInventory,
}: {
  inventory: AccountInventoryDto;
  refetchInventory: () => Promise<AccountInventoryDto | undefined>;
}) {
  const { colors, spacing } = useTheme();
  const api = useApi();
  const session = useSession();
  const remove = useDeleteAccount();
  const [password, setPassword] = useState("");
  const [view, setView] = useState<DeletionView>({
    kind: "form",
    fieldError: null,
    formError: null,
  });
  const passwordRef = useRef<TextInputHandle>(null);
  const busy =
    view.kind === "deleting" ||
    view.kind === "checking" ||
    view.kind === "deleted";
  // No leaving mid-request: the answer decides what the phone shows.
  usePreventRemove(busy, () => {});

  const rows = INVENTORY_ROWS.filter((r) => inventory[r.key] > 0);

  const finish = async () => {
    setView({ kind: "deleted" });
    void haptic.warning();
    await afterAccountDeleted(session);
  };

  async function submit() {
    setView({ kind: "deleting" });
    passwordRef.current?.blur();
    try {
      const { outcome } = await remove.mutateAsync(password);
      if (outcome === "deleted") return finish();
      setPassword("");
      await refetchInventory();
      setView({
        kind: "form",
        fieldError: null,
        formError: DELETE_MESSAGES.identityPending,
      });
    } catch (error) {
      const next = deletionFailure(error);
      if (next.kind === "form") setPassword("");
      setView(next);
      if (next.kind === "form" && next.fieldError) {
        passwordRef.current?.focus();
      }
    }
  }

  function confirm() {
    if (!password) {
      setView({
        kind: "form",
        fieldError: DELETE_MESSAGES.missingPassword,
        formError: null,
      });
      return;
    }
    Alert.alert(
      "Delete your Overload account?",
      "Your training history and everything in your account will be permanently deleted.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => void submit(),
        },
      ],
    );
  }

  async function checkAgain() {
    setView({ kind: "checking" });
    try {
      await api.request("/me");
      const inv = await api.request<AccountInventoryDto>(
        "/me/deletion-inventory",
      );
      setView(checkAgainView({ kind: "present", inventory: inv }));
    } catch (error) {
      const gone =
        error instanceof ApiError &&
        (error.code === "signed_out" || error.code === "unauthorized");
      if (gone) return finish();
      setView(checkAgainView({ kind: "unreachable" }));
    }
  }

  if (view.kind === "unconfirmed" || view.kind === "checking") {
    return (
      <>
        <Stack.Screen
          options={{ title: "Delete account", gestureEnabled: false }}
        />
        <FormScreen>
          <Banner
            message={
              view.kind === "unconfirmed"
                ? view.message
                : DELETE_MESSAGES.unconfirmed
            }
          />
          <Button
            label="Check again"
            loading={view.kind === "checking"}
            onPress={() => void checkAgain()}
          />
        </FormScreen>
      </>
    );
  }

  const formError = view.kind === "form" ? view.formError : null;
  const fieldError = view.kind === "form" ? view.fieldError : null;
  return (
    <>
      <Stack.Screen
        options={{ title: "Delete account", gestureEnabled: !busy }}
      />
      <FormScreen>
        <Text size="2xl" weight="semibold" accessibilityRole="header">
          Delete your account
        </Text>
        <Text>
          This permanently deletes your account and everything in it. It
          can&apos;t be undone.
        </Text>
        {rows.length > 0 ? (
          <GroupedList>
            {rows.map((r) => (
              <ListRow
                key={r.key}
                title={r.label}
                value={inventory[r.key].toLocaleString("en-US")}
              />
            ))}
          </GroupedList>
        ) : (
          <Text tone="muted">Your account has no training data yet.</Text>
        )}
        <View style={{ gap: spacing.sm }}>
          <Text size="sm" tone="muted">
            The shared exercise library isn&apos;t affected.
          </Text>
          <Text size="sm" tone="muted">
            {BILLING_NOTE}
          </Text>
          <Pressable
            accessibilityRole="link"
            onPress={() => router.push("/more/help")}
            disabled={busy}
          >
            <Text size="sm" tone="primary">
              Contact support
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="link"
            onPress={() => router.push("/more/export")}
            disabled={busy}
          >
            <Text size="sm" tone="primary">
              Before you go, you can export your data.
            </Text>
          </Pressable>
        </View>
        {formError ? <Banner message={formError} /> : null}
        <TextField
          ref={passwordRef}
          label="Password"
          value={password}
          secureTextEntry
          textContentType="password"
          autoComplete="current-password"
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="go"
          editable={!busy}
          error={fieldError}
          hint="Enter your password to confirm."
          onChangeText={(t) => {
            setPassword(t);
            if (view.kind === "form" && view.fieldError) {
              setView({ ...view, fieldError: null });
            }
          }}
          onSubmitEditing={confirm}
        />
        <View style={{ gap: spacing.xs }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Delete account permanently"
            accessibilityState={{ disabled: !password || busy, busy }}
            disabled={!password || busy}
            onPress={confirm}
            style={({ pressed }) => ({
              minHeight: 48,
              borderRadius: 12,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: colors.destructive,
              opacity: !password || busy ? 0.5 : pressed ? 0.8 : 1,
            })}
          >
            <Text
              weight="semibold"
              style={{ color: colors.destructiveForeground }}
            >
              {busy ? "Deleting…" : "Delete account permanently"}
            </Text>
          </Pressable>
          <Button
            label="Cancel"
            variant="text"
            disabled={busy}
            onPress={() => router.back()}
          />
        </View>
      </FormScreen>
    </>
  );
}

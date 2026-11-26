import { useState } from "react";
import { Linking, View } from "react-native";
import * as Updates from "expo-updates";
import { useQueryClient } from "@tanstack/react-query";
import { APP_VERSION, ENV, webOrigin } from "../config/env";
import { isPlausibleKey, saveStagingKey } from "../staging-access/key";
import { Banner } from "../ui/Banner";
import { GateScreen } from "../ui/StateView";
import { Text } from "../ui/Text";
import { TextField } from "../ui/TextField";

/**
 * The blocking gates (design §6 G2–G6). Each is a full screen with one clear
 * action; none of them signs the lifter out except G5's explicit choice.
 */

export function MisconfiguredGate({ problems }: { problems: string[] }) {
  return (
    <GateScreen
      icon="exclamationmark.octagon"
      title="This build is misconfigured"
      message="It can't connect to Overload. Install the latest version."
    >
      <Text size="xs" tone="muted" align="center">
        {problems.join("\n")}
      </Text>
    </GateScreen>
  );
}

export function UpdateRequiredGate({ minimum }: { minimum: string | null }) {
  const [checking, setChecking] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  return (
    <GateScreen
      icon="arrow.down.app"
      title="Update Overload"
      message="This version is no longer supported. Install the latest version to keep training."
      action={{
        label: "Check for update",
        loading: checking,
        onPress: async () => {
          setChecking(true);
          setNote(null);
          try {
            const result = await Updates.checkForUpdateAsync();
            if (result.isAvailable) {
              await Updates.fetchUpdateAsync();
              await Updates.reloadAsync();
            } else {
              setNote("No update yet. Install the latest development build.");
            }
          } catch {
            setNote(
              "Couldn't check for an update. Install the latest development build.",
            );
          } finally {
            setChecking(false);
          }
        },
      }}
    >
      <Text size="xs" tone="muted" align="center">
        {`This build: ${APP_VERSION}${minimum ? ` · Minimum: ${minimum}` : ""}`}
      </Text>
      {note ? <Banner tone="info" message={note} /> : null}
    </GateScreen>
  );
}

export function MaintenanceGate() {
  const client = useQueryClient();
  return (
    <GateScreen
      icon="wrench.and.screwdriver"
      title="Overload is down for maintenance"
      message="Your data is safe. Try again in a few minutes."
      action={{
        label: "Try again",
        onPress: () => void client.refetchQueries(),
      }}
    />
  );
}

export function UnreachableGate() {
  const client = useQueryClient();
  const [busy, setBusy] = useState(false);
  return (
    <GateScreen
      icon="wifi.slash"
      title="Can't reach Overload"
      message="Overload needs a connection. Check your signal or Wi-Fi and try again."
      action={{
        label: "Try again",
        loading: busy,
        onPress: async () => {
          setBusy(true);
          try {
            await client.refetchQueries();
          } finally {
            setBusy(false);
          }
        },
      }}
    />
  );
}

export function SuspendedGate({ onSignOut }: { onSignOut: () => void }) {
  const origin = webOrigin();
  return (
    <GateScreen
      icon="lock"
      title="This account is suspended"
      message="You can still download your data or delete your account on the web."
      action={
        origin
          ? {
              label: "Open Overload on the web",
              onPress: () => void Linking.openURL(origin),
            }
          : undefined
      }
      secondaryAction={{ label: "Sign out", onPress: onSignOut }}
    />
  );
}

/**
 * G6, development and staging builds only (spec §7, RD-3): the per-device
 * staging access key. Stored only in this device's Keychain; never shown
 * again after saving.
 */
export function StagingAccessGate() {
  const client = useQueryClient();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  if (!ENV.ok) return null;
  return (
    <GateScreen
      icon="key"
      title="This build needs staging access"
      message="Paste the mobile staging access key from the runbook. It's stored only on this device."
      action={{
        label: "Save",
        loading: saving,
        onPress: async () => {
          if (!isPlausibleKey(value)) {
            setError("That doesn't look like an access key.");
            return;
          }
          setSaving(true);
          setError(null);
          try {
            await saveStagingKey(value);
            setValue("");
            await client.resetQueries();
          } catch {
            setError("Couldn't save the key on this device.");
          } finally {
            setSaving(false);
          }
        },
      }}
    >
      <View style={{ gap: 8 }}>
        <TextField
          label="Staging access key"
          value={value}
          onChangeText={setValue}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          textContentType="none"
          error={error}
        />
      </View>
    </GateScreen>
  );
}

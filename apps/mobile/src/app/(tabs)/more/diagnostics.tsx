import { useEffect, useState } from "react";
import { ScrollView, View } from "react-native";
import { Redirect, Stack } from "expo-router";
import * as Updates from "expo-updates";
import { APP_VERSION, ENV } from "../../../config/env";
import { diagnosticsAvailable } from "../../../diagnostics/availability";
import { runHermesChecks } from "../../../diagnostics/hermes-checks";
import {
  readStagingKey,
  removeStagingKey,
  stagingAccessAllowed,
} from "../../../staging-access/key";
import { Button } from "../../../ui/Button";
import { GroupedList, ListRow } from "../../../ui/GroupedList";
import { Text } from "../../../ui/Text";
import { useTheme } from "../../../ui/ThemeProvider";

/**
 * Diagnostics (design M3): read-only facts for the owner's device review.
 * Developer (staging) builds only, decided by `diagnosticsAvailable`; never a
 * token, a key, an email, or a password.
 */
export default function DiagnosticsRoute() {
  // The route guard in more/_layout already refuses; this is the last check.
  if (!diagnosticsAvailable()) return <Redirect href="/more" />;
  return <DiagnosticsScreen />;
}

export function DiagnosticsScreen() {
  const { colors, spacing } = useTheme();
  const [results, setResults] = useState(runHermesChecks);
  const [keyStored, setKeyStored] = useState<boolean | null>(null);
  useEffect(() => {
    void readStagingKey().then((k) => setKeyStored(k !== null));
  }, []);
  const passed = results.filter((r) => r.ok).length;
  const host = ENV.ok ? ENV.config.apiOrigin.replace(/^https?:\/\//, "") : "—";
  const update = Updates.isEmbeddedLaunch
    ? "Embedded bundle"
    : `Update ${Updates.updateId?.slice(0, 8) ?? "?"}`;
  const engine = (globalThis as { HermesInternal?: unknown }).HermesInternal
    ? "Hermes"
    : "Not Hermes";
  return (
    <>
      <Stack.Screen
        options={{ title: "Diagnostics", headerLargeTitle: false }}
      />
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        style={{ backgroundColor: colors.background }}
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.xl }}
      >
        <GroupedList header="Environment">
          <ListRow
            title="Environment"
            value={ENV.ok ? ENV.config.environment : "misconfigured"}
          />
          <ListRow title="API" value={host} />
          <ListRow
            title="Supabase project"
            value={ENV.ok ? ENV.config.supabaseRef : "—"}
          />
          <ListRow title="App version" value={APP_VERSION} />
          <ListRow title="JavaScript engine" value={engine} />
        </GroupedList>
        {stagingAccessAllowed() ? (
          <GroupedList
            header="Staging access"
            footer="The key lives only in this iPhone's Keychain. Removing it brings back the staging access screen."
          >
            <ListRow
              title="Access key"
              value={
                keyStored === null ? "…" : keyStored ? "Stored" : "Not stored"
              }
            />
            {keyStored ? (
              <ListRow
                title="Remove access key"
                tone="destructive"
                onPress={() => {
                  void removeStagingKey().then(() => setKeyStored(false));
                }}
              />
            ) : null}
          </GroupedList>
        ) : null}
        <GroupedList header="Updates">
          <ListRow title="Channel" value={Updates.channel ?? "—"} />
          <ListRow
            title="Runtime"
            value={Updates.runtimeVersion?.slice(0, 10) ?? "—"}
          />
          <ListRow title="Running" value={update} />
          <ListRow
            title="Published"
            value={
              Updates.createdAt
                ? Updates.createdAt.toISOString().slice(0, 16).replace("T", " ")
                : "—"
            }
          />
        </GroupedList>
        <GroupedList
          header="Hermes date and time-zone checks"
          footer={`${passed} of ${results.length} passed.`}
        >
          {results.map((r) => (
            <View key={r.id} style={{ padding: spacing.md, gap: spacing.xxs }}>
              <Text
                size="sm"
                weight="medium"
                tone={r.ok ? "default" : "destructive"}
              >
                {`${r.ok ? "Pass" : "Fail"} · ${r.id}`}
              </Text>
              {r.ok ? null : (
                <Text size="xs" tone="muted">
                  {`Got ${r.actual}, expected ${r.expected}`}
                </Text>
              )}
            </View>
          ))}
        </GroupedList>
        <Button
          label="Run checks again"
          variant="secondary"
          size="md"
          onPress={() => setResults(runHermesChecks())}
        />
      </ScrollView>
    </>
  );
}

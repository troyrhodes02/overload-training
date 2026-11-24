import { RefreshControl, ScrollView, View } from "react-native";
import { Stack } from "expo-router";
import { usePlanAccess } from "../api/account";
import { Banner } from "../ui/Banner";
import { GroupedList, ListRow } from "../ui/GroupedList";
import { LoadErrorState } from "../ui/LoadErrorState";
import { SkeletonCard } from "../ui/Skeleton";
import { Text } from "../ui/Text";
import { useTheme } from "../ui/ThemeProvider";
import { BILLING_FOOTNOTE, FREE_ALWAYS, planSections } from "./plan-model";

/**
 * A3 Plan & access (Pitch 21j design §6 A3, §15; RD-15). The plan in the
 * web's own words from the Stripe mirror, what it includes, and one plain
 * sentence about where billing lives. Read-only: no price, no purchase, no
 * link (no purchase flow in the app).
 */
export function PlanAccessScreen() {
  const { colors, spacing } = useTheme();
  const query = usePlanAccess();
  const plan = query.data;

  const body = (() => {
    if (!plan) {
      return query.isError ? (
        <LoadErrorState
          error={query.error}
          subject="Your plan"
          request="GET /me/plan"
          onRetry={() => void query.refetch()}
          retrying={query.isFetching}
        />
      ) : (
        <SkeletonCard rows={3} />
      );
    }
    const s = planSections(plan);
    return (
      <>
        <View style={{ gap: spacing.sm }}>
          <Text size="2xl" weight="semibold" accessibilityRole="header">
            {plan.label}
          </Text>
          {s.problemBanner ? <Banner message={s.problemBanner} /> : null}
          <Text tone="muted">{plan.explanation}</Text>
        </View>
        {s.proLines.length > 0 ? (
          <GroupedList header={s.proHeading}>
            {s.proLines.map((line) => (
              <ListRow key={line} title={line} />
            ))}
          </GroupedList>
        ) : null}
        <GroupedList header="Free always includes">
          {FREE_ALWAYS.map((line) => (
            <ListRow key={line} title={line} />
          ))}
        </GroupedList>
        <Text size="sm" tone="muted">
          {BILLING_FOOTNOTE}
        </Text>
      </>
    );
  })();

  return (
    <>
      <Stack.Screen options={{ title: "Plan & access" }} />
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        style={{ backgroundColor: colors.background }}
        contentContainerStyle={{
          padding: spacing.lg,
          gap: spacing.xl,
          paddingBottom: spacing.xxl,
        }}
        refreshControl={
          <RefreshControl
            refreshing={query.isRefetching}
            onRefresh={() => void query.refetch()}
            tintColor={colors.mutedForeground}
          />
        }
      >
        {body}
      </ScrollView>
    </>
  );
}

import { describeLoadError } from "../api/load-error";
import { StateView, type StateAction } from "./StateView";
import { Text } from "./Text";

/** A failed read, described (OVE-203), with Try again and an optional way out. */
export function LoadErrorState({
  error,
  subject,
  request,
  byId,
  onRetry,
  retrying,
  secondaryAction,
}: {
  error: unknown;
  subject: string;
  request: string;
  byId?: boolean;
  onRetry: () => void;
  retrying?: boolean;
  secondaryAction?: StateAction;
}) {
  const view = describeLoadError(error, { subject, request, byId });
  return (
    <StateView
      icon={view.icon}
      title={view.title}
      message={view.message}
      action={{ label: "Try again", onPress: onRetry, loading: retrying }}
      secondaryAction={secondaryAction}
    >
      {view.technical ? (
        <Text
          size="xs"
          tone="muted"
          accessibilityLabel={`Details: ${view.technical}`}
        >
          {view.technical}
        </Text>
      ) : null}
    </StateView>
  );
}

import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import type {
  AccountInventoryDto,
  DeleteAccountResponseDto,
  MeDto,
  MePlanDto,
  ProfileDto,
  ProfileViewDto,
  UpdateProfileRequest,
  UpdateProfileResponseDto,
} from "@overload/shared/contracts/account";
import type {
  MarkReleaseNotesSeenResponseDto,
  ReleaseNotesDto,
} from "@overload/shared/contracts/release-notes";
import type { FeedbackResponseDto } from "@overload/shared/contracts/feedback";
import { FEEDBACK_FORM_FIELDS } from "@overload/shared/contracts/feedback";
import { File } from "expo-file-system";
import { useApi } from "./ApiProvider";
import type { ApiError } from "./errors";
import { QUERY_KEYS } from "./queries";

/**
 * Account & Settings's reads and writes (Pitch 21j spec §7, data layer). Every
 * value is the server's: the profile and its rules, the plan as the web words
 * it, the release notes and the one seen point the web shares, the export
 * document, and the deletion outcome. Nothing here is cached on the device
 * beyond the query cache, which sign-out (and deletion) clears.
 */

export const ACCOUNT_KEYS = {
  profile: ["profile"] as const,
  plan: ["me-plan"] as const,
  releaseNotes: ["release-notes"] as const,
  deletionInventory: ["deletion-inventory"] as const,
};

/** The export may take longer than an ordinary read (RD-12). */
export const EXPORT_TIMEOUT_MS = 60_000;

/** Deletion cancels Stripe, then runs a transaction of up to 30 s. */
export const DELETE_TIMEOUT_MS = 60_000;

/** E1 `GET /me/profile`. */
export function useProfile() {
  const api = useApi();
  return useQuery<ProfileViewDto, ApiError>({
    queryKey: ACCOUNT_KEYS.profile,
    queryFn: ({ signal }) =>
      api.request<ProfileViewDto>("/me/profile", { signal }),
    staleTime: 0,
  });
}

/**
 * After a saved profile: the account card and the greeting read the new
 * names at once; a changed time zone moves "today", so every date-dependent
 * account screen re-reads from the server (RD-2).
 */
export function applySavedProfile(
  client: QueryClient,
  saved: ProfileDto,
  previousTimeZone: string | null,
): void {
  client.setQueryData<MeDto>(QUERY_KEYS.me, (me) =>
    me ? { ...me, profile: saved } : me,
  );
  client.setQueryData<ProfileViewDto>(ACCOUNT_KEYS.profile, (view) =>
    view ? { ...view, profile: saved } : view,
  );
  if (previousTimeZone !== null && previousTimeZone !== saved.timeZone) {
    void client.invalidateQueries({
      predicate: (q) =>
        q.queryKey[0] !== QUERY_KEYS.appConfig[0] &&
        q.queryKey[0] !== QUERY_KEYS.me[0] &&
        q.queryKey[0] !== ACCOUNT_KEYS.profile[0],
    });
  } else {
    void client.invalidateQueries({ queryKey: ["today"] });
  }
}

/** E2 `PUT /me/profile`: an absolute write, safe to resend. */
export function useUpdateProfile() {
  const api = useApi();
  return useMutation<UpdateProfileResponseDto, ApiError, UpdateProfileRequest>({
    mutationFn: (body) =>
      api.request<UpdateProfileResponseDto>("/me/profile", {
        method: "PUT",
        body,
      }),
  });
}

/** E3 `GET /me/plan`: read-only, the web's words (RD-15). */
export function usePlanAccess() {
  const api = useApi();
  return useQuery<MePlanDto, ApiError>({
    queryKey: ACCOUNT_KEYS.plan,
    queryFn: ({ signal }) => api.request<MePlanDto>("/me/plan", { signal }),
    staleTime: 30_000,
  });
}

/** E4 `GET /release-notes`. */
export function useReleaseNotes() {
  const api = useApi();
  return useQuery<ReleaseNotesDto, ApiError>({
    queryKey: ACCOUNT_KEYS.releaseNotes,
    queryFn: ({ signal }) =>
      api.request<ReleaseNotesDto>("/release-notes", { signal }),
    staleTime: 5 * 60_000,
  });
}

/**
 * E5 `POST /me/release-notes/seen`. The sheet has already closed and `me`
 * already shows nothing due; a failed mark simply lets the entries return on
 * a later launch (design A5).
 */
export function useMarkReleaseNotesSeen() {
  const api = useApi();
  const client = useQueryClient();
  return useMutation<MarkReleaseNotesSeenResponseDto, ApiError, string>({
    mutationFn: (throughId) => {
      client.setQueryData<MeDto>(QUERY_KEYS.me, (me) =>
        me ? { ...me, whatsNew: null } : me,
      );
      return api.request<MarkReleaseNotesSeenResponseDto>(
        "/me/release-notes/seen",
        { method: "POST", body: { throughId } },
      );
    },
  });
}

export type FeedbackScreenshot = { uri: string; name: string; type: string };

/**
 * The screenshot as a multipart file part that `expo/fetch` can encode
 * (OVE-254). Since Expo SDK 52 the global `fetch` is `expo/fetch`, whose
 * FormData encoder writes a part from its `name`, `type`, and `bytes()`, and
 * throws "Unsupported FormDataPart implementation" for React Native's
 * `{ uri, name, type }` part — before anything is sent. The type is stated,
 * not inferred from the file's extension, because the server refuses a part
 * whose declared type isn't what its bytes are. The bytes are read from the
 * prepared JPEG each time the body is encoded, so a retry sends the same file.
 */
export type ScreenshotPart = {
  name: string;
  type: string;
  bytes: () => Promise<Uint8Array>;
};

export function screenshotPart(shot: FeedbackScreenshot): ScreenshotPart {
  return {
    name: shot.name,
    type: shot.type,
    bytes: () => new File(shot.uri).bytes(),
  };
}

/** The multipart body of E6 (spec §6). */
export function feedbackFormData(input: {
  category: string;
  message: string;
  screenshot?: FeedbackScreenshot | null;
}): FormData {
  const fd = new FormData();
  fd.append(FEEDBACK_FORM_FIELDS.category, input.category);
  fd.append(FEEDBACK_FORM_FIELDS.message, input.message);
  if (input.screenshot) {
    fd.append(
      FEEDBACK_FORM_FIELDS.screenshots,
      screenshotPart(input.screenshot) as unknown as Blob,
    );
  }
  return fd;
}

/** A screenshot can take longer than the 15-second default on a slow network. */
export const FEEDBACK_UPLOAD_TIMEOUT_MS = 60_000;

/** E6 `POST /feedback`, once per intent (the key). */
export function useSubmitFeedback() {
  const api = useApi();
  return useMutation<
    FeedbackResponseDto,
    ApiError,
    {
      key: string;
      category: string;
      message: string;
      screenshot?: FeedbackScreenshot | null;
    }
  >({
    mutationFn: ({ key, ...input }) =>
      api.request<FeedbackResponseDto>("/feedback", {
        method: "POST",
        formData: feedbackFormData(input),
        headers: { "Idempotency-Key": key },
        timeoutMs: input.screenshot ? FEEDBACK_UPLOAD_TIMEOUT_MS : undefined,
      }),
  });
}

/** E7 `GET /me/export`: never cached (RD-13); the caller writes the file. */
export function useFetchExport() {
  const api = useApi();
  return () =>
    api.request<unknown>("/me/export", { timeoutMs: EXPORT_TIMEOUT_MS });
}

/** E8 `GET /me/deletion-inventory`. */
export function useDeletionInventory() {
  const api = useApi();
  return useQuery<AccountInventoryDto, ApiError>({
    queryKey: ACCOUNT_KEYS.deletionInventory,
    queryFn: ({ signal }) =>
      api.request<AccountInventoryDto>("/me/deletion-inventory", { signal }),
    staleTime: 0,
  });
}

/** E9 `POST /me/delete`. The password is sent once and never kept. */
export function useDeleteAccount() {
  const api = useApi();
  return useMutation<DeleteAccountResponseDto, ApiError, string>({
    mutationFn: (password) =>
      api.request<DeleteAccountResponseDto>("/me/delete", {
        method: "POST",
        body: { password },
        // Longer than the server's 30-second deletion transaction (review
        // #2), so a slow delete is answered, not cut off mid-way.
        timeoutMs: DELETE_TIMEOUT_MS,
      }),
  });
}

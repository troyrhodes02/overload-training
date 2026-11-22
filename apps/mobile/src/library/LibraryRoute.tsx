import { useCallback, useEffect, useState } from "react";
import { router, useFocusEffect } from "expo-router";
import { Banner } from "../ui/Banner";
import { Button } from "../ui/Button";
import { clearNotice, useNotice } from "../ui/notice-store";
import { FavoriteStar } from "./FavoriteStar";
import { LibraryScreen } from "./LibraryScreen";
import { libraryExerciseHref } from "./NewExerciseScreen";

/** Where "Add your own exercise" and the header's + open L2. */
export function newExerciseHref(name: string | null): string {
  return name
    ? `/exercise-new?name=${encodeURIComponent(name)}`
    : "/exercise-new";
}

/**
 * L1 as More shows it (Pitch 21h design L1): the library with stars, the
 * header's + for a new exercise, the "Added X." notice L2 leaves behind, and
 * a failed star said once at the top.
 */
export function LibraryRoute() {
  const notice = useNotice("exercises");
  const [failure, setFailure] = useState<string | null>(null);
  // The notice is for this visit: leaving the library clears it.
  useFocusEffect(useCallback(() => () => clearNotice("exercises"), []));
  useEffect(() => {
    if (!failure) return;
    const t = setTimeout(() => setFailure(null), 6000);
    return () => clearTimeout(t);
  }, [failure]);
  return (
    <LibraryScreen
      detailHref={libraryExerciseHref}
      trailing={(e) => <FavoriteStar exercise={e} onFailure={setFailure} />}
      headerRight={() => (
        <Button
          label="+"
          variant="text"
          accessibilityLabel="Add your own exercise"
          onPress={() => router.push(newExerciseHref(null))}
        />
      )}
      onAddOwn={(name) => router.push(newExerciseHref(name))}
      notice={
        <>
          {failure ? <Banner message={failure} /> : null}
          {notice ? (
            <Banner
              tone="info"
              message={notice.message}
              action={
                notice.viewHref
                  ? {
                      label: "View",
                      onPress: () => {
                        const href = notice.viewHref!;
                        clearNotice("exercises");
                        router.push(href);
                      },
                    }
                  : undefined
              }
            />
          ) : null}
        </>
      }
    />
  );
}

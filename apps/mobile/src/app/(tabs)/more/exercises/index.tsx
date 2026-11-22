import { LibraryScreen } from "../../../../library/LibraryScreen";

/** L1 Exercises (Pitch 21h design §6, §15): pushed from More. */
export default function LibraryRoute() {
  return (
    <LibraryScreen
      detailHref={(id) => `/more/exercises/${encodeURIComponent(id)}`}
    />
  );
}

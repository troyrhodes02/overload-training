# Landing photography

Drop your gym photos here to make them appear on the public landing page. You
do not need to touch any code — the layout, crops, overlays, and motion are
already built around these exact filenames. A slot with no file shows a tasteful
dark placeholder (labelled with the filename), so the page always looks finished.

## The slots

Use these **exact filenames**. They are the permanent public asset names.

| Filename | Where it shows | Best image | Ratio | Subject placement |
| --- | --- | --- | --- | --- |
| `hero-training.webp` | Hero, behind the product panel | A single lifter mid-set | 4:5 portrait | Lifter upper-left to center; leave the lower/right edges calm for the dark scrim |
| `training-detail.webp` | Beside the logging section | A tight equipment/grip detail | 1:1 square | Texture over face — a grip, knurling, chalk, a loaded sleeve |
| `gym-atmosphere.webp` | Full-bleed band ("what Overload won't do") | A wide, moody training floor | 16:9 or wider | Keep the center uncluttered — white text sits over it |
| `machine-detail.webp` | The gym-specific section | A cable/plate-loaded machine stack | 3:4 portrait | The weight stack or carriage — the thing whose weight differs per gym |
| `effort-band.webp` | Full-bleed band ("The work") | A lifter mid-effort under load | 16:9 or wider | Dark and textured; keep the left/center calm — white text sits over it |
| `floor-band.webp` | Full-bleed band ("Built for the long run") | A wide, quiet training floor | 16:9 or wider | Depth down the floor; keep the left uncluttered for the white text |
| `training-secondary.webp` | Optional secondary beat | A quieter editorial shot | 3:2 landscape | A rack, a chalk bowl, a lifter resetting. Optional — the layout works without it |

Placed in the current layout: `hero`, `training-detail`, `gym-atmosphere`,
`machine-detail`, and the two immersive bands `effort-band` and `floor-band`.
`training-secondary` is supported and ready if a future section wants it. The
three full-bleed bands (`gym-atmosphere`, `effort-band`, `floor-band`) are the
"background image" sections — give each a distinct photo.

## How to add or replace an image

1. Pick or license a photo.
2. Convert it to **WebP** (e.g. `cwebp input.jpg -q 82 -o hero-training.webp`, or any image tool). Aim for roughly the ratio above; the layout crops to fit and keeps the focal point.
3. Rename it to the exact filename from the table.
4. Put it in this folder (`public/images/landing/`).
5. Hard-refresh the local site (see caching note). The photo appears in the
   existing layout, with the same crop, gradient overlays, and reveal motion the
   placeholder had.

To swap a photo later, replace the file with another image under the **same
filename** — nothing else changes.

## Caching / hard-refresh

- **Development:** these images are served **unoptimized** in dev, so replacing a
  file and doing a hard refresh (Cmd/Ctrl+Shift+R) shows the new photo
  immediately. No server restart is needed.
- If a replacement still looks stale, it is browser cache — hard refresh again,
  or open the page in a private window.
- **Production:** Next optimizes these images and caches the optimized output.
  A redeploy that ships the new file serves it. There are no cache-busting query
  strings, so a file keeps its clean URL.

## How the placeholder works

Each slot is resolved on the **server** before the page is sent: if the file
exists it renders the photo (`next/image`), otherwise it renders the labelled
placeholder in the exact same box. That means no broken-image icons, no empty
white rectangles, no layout shift, and no flicker on navigation. You can design
and review the whole page before any real photography exists.

## Do not

- Do not create empty or fake `.webp` files, and do not rename a `.png`/`.jpg`
  to `.webp` — a corrupt file will fail to decode. Leave a slot empty to keep its
  placeholder.
- Do not rename the slots. The filenames are referenced by
  `src/lib/landing/images.ts`; add a new slot there (and here) only with a real
  design reason.

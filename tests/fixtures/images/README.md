# Image fixtures (OVE-108)

`sample.heic` is a small real HEVC-encoded HEIC image used to verify the
plan-import HEIC→accepted-MIME conversion path end to end (`heic-convert`
decode → `sharp` orient/strip/resize/re-encode). A real HEVC-HEIC cannot be
generated in-process because the available `sharp` build encodes only AV1/AVIF
HEIF, which the HEVC decoder rejects; hence a checked-in binary.

JPEG/PNG/WebP fixtures are generated in-process by the tests (sharp can encode
them), including ones carrying an EXIF orientation tag, so no binary is needed
for those.

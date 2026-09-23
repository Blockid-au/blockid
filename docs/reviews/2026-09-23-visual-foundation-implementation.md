# G30 visual foundation and OCR correction

Source preparation23/09/2026; not a live release receipt.

The existing `/api/pitchdeck/ocr` fallback embedded a truncated base64 image in
a text-only `callAI` prompt. It was not a multimodal image request, yet could
return `vision_llm` and charge credits when the resulting text was longer than
local OCR. It also wrote the supplied filename beneath a temporary directory
without constraining path traversal. No evidence establishes that a customer
was charged or that a file was overwritten; these are source-level defects.

The corrected authenticated endpoint preserves the existing entitlement gate,
performs bounded JSON/base64 validation and full image decode, then passes only
a normalized private image to a bounded EN/VI OCR worker. It writes no uploaded
file. Short/unreadable OCR is `needs_input`; worker timeout/busy are explicit.
No AI provider is called and no credits are charged. `forceLlm` returns
`vision_not_qualified` until an independently qualified multimodal path exists.
Successful transcription is marked `transcribed_unverified`, with image hashes,
upright dimensions and a warning that chart/diagram interpretation was not done.

Foundation modules provide strict metadata contracts for site/tenant/business/
input/revision, source page/slide/image and region coordinates. Duplicate IDs,
out-of-bounds regions and evidence on unreadable sources are rejected. These
contracts are not authorization or semantic verification; those checks remain
at producer/reader boundaries. Scoped cache fingerprints detect mutated metadata
and include model, prompt and permission scope, but no cache store is activated.

JPEG/PNG/WebP decoding uses the already installed Sharp0.35.4, now declared as a
direct dependency at that exact version. Limits:25MiB input/output,20M pixels,
8192px edge,10-second processing timeout. Decode applies EXIF orientation and
strips metadata. OCR permits one worker per process,30-second response deadline;
unknown worker lifetime keeps admission closed. This is not a cross-origin job
scheduler or proof that a permanently stalled worker has been reclaimed.

## Provider shortlist for evaluation only

Official pages checked23/09. These are candidates, **not qualified models**, and
no vision request or customer activation has occurred. USD per1M tokens:

| Candidate | Standard input/output | Why include in evaluation |
|---|---|---|
| [Qwen3-VL-235B-A22B-Instruct](https://deepinfra.com/Qwen/Qwen3-VL-235B-A22B-Instruct) |0.20/0.88| Explicit vision/OCR model in provider examples |
| [Gemma4-31B-it](https://deepinfra.com/google/gemma-4-31B-it/api) |0.13/0.38| Lower-cost image-input candidate; must meet the same gates |
| [Qwen3.5-397B-A17B](https://deepinfra.com/Qwen/Qwen3.5-397B-A17B/api) |0.45/3.00| Larger multimodal comparison candidate, not presumed better |

[DeepInfra vision documentation](https://docs.deepinfra.com/chat/vision) uses
structured `image_url` content with a real image URL or base64 data URI. An image
encoded inside an ordinary text string is not equivalent. Private images should
use approved in-request bytes rather than publicly accessible object URLs.
Exact account availability, image token accounting, actual returned model,
latency and accepted-report cost still need budgeted evaluation. The Qwen3-VL
page's embedded model card refers to Thinking weights despite an Instruct page
ID; pin and verify exact returned model/config rather than assuming equivalence.

## Verification and next dependencies

- 23 focused tests pass: real PNG/JPEG/WebP decode, EXIF normalization, size and
  malformed input, source/region/cache isolation, bounded worker lifecycle and
  endpoint no-inference/no-charge/incomplete states.
- Focused ESLint and full TypeScript check pass.
- Real local EN/VI OCR transcribed a synthetic financial image in872ms, preserving
  AUD100,000, FY2025 and the unaudited qualifier. No model inference was used.
- No images uploaded to providers; no customer reports/credits/retention changed.
- Still required: bounded document/slide rendering and region selection, real
  corpus/holdout evaluation, multimodal budget ledger/qualified routing, claim
  verification, intake UI, same-revision projections and both-site rollout.
- SVI is in scope but has not received an implementation or deployment of this
  foundation in this receipt. Local OCR support does not certify visual analysis.

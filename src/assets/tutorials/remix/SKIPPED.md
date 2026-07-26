# remix: not generated

The remix flow (`source_processing: "remix"` with `extra_source_images`) is only served by
Stable Cascade on the AI Horde. At the time these tutorial examples were generated,
`GET /api/v2/status/models?type=image` reported **zero workers** offering `Stable Cascade 1.0`;
the model did not appear in the live model list at all (no entry matched `/cascade/i`).

For contrast, the models used by the other flows were all serviceable in the same poll:

| model | workers |
| --- | --- |
| Stable Cascade 1.0 | 0 |
| AlbedoBase XL (SDXL) | 4 |
| Deliberate | 5 |
| stable_diffusion_inpainting | 2 |

Submitting the job anyway would have queued indefinitely with no worker able to pick it up, so
the flow was skipped rather than left to time out.

## What the example would have been

- `source_image`: the anchor `txt2img/result.webp` (lighthouse keeper)
- `extra_source_images`: a fog-forest image, supplied as `[{ "image": "<base64>" }]`
- `source_processing`: `"remix"`
- `models`: `["Stable Cascade 1.0"]`

To produce it later, re-check worker availability first:

```js
import { modelWorkers } from './horde.mjs';
const { out } = await modelWorkers(['Stable Cascade 1.0']);
```

Only run the flow if the count is non-zero.

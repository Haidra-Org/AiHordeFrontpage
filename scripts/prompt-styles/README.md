# Image prompt styles

The horde's text styles (`/v2/styles/text`) carry a prompt template with a `{p}` placeholder, sampling
parameters and a model list, and the horde applies them server-side when a text request names a
`style`. The frontpage's prompt cards (under an alchemy request, and under the image studio's prompt
box) use them as the instruction a text model follows, so the wording can be tuned without a release.

The server has no flag for "this style writes image prompts", so the class is marked by convention:

- every such style carries the tag `image-prompt`;
- one role tag: `image-prompt:describe` (writes from a caption and tags) or `image-prompt:improve`
  (rewrites a prompt);
- further tags name a direction the reader can pick (`photographic`, `painterly`, `cinematic`,
  `minimal`).

The client sends only the material as `{p}`: `Description:`, `Tags:`, `Prompt:` and `Notes from the
user:` lines. The style's template wraps it in the instruction. A style's `models` list is the model
pick for that style; the client falls back to its built-in instruction and curated list when no style
of the role is online.

`image-prompt-styles.json` holds the first set. To create them under your account:

```bash
KEY='your-api-key'
python - <<'EOF' | while IFS= read -r body; do
  curl -s -X POST "https://aihorde.net/api/v2/styles/text" \
    -H "apikey: $KEY" -H "Content-Type: application/json" \
    -H "Client-Agent: AiHordeFrontpage:prompt-styles:1.0" \
    -d "$body"; echo
done
import json
for style in json.load(open('scripts/prompt-styles/image-prompt-styles.json', encoding='utf-8')):
    print(json.dumps(style))
EOF
```

Names are unique per account: a second run needs `PATCH /v2/styles/text/{id}` instead. The `models`
lists name the instruct builds online when the set was written and will drift as volunteers change
what they run; a style whose models are all offline still works, since the client then falls back.

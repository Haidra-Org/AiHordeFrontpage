# Image prompt styles

The horde's text styles (`/v2/styles/text`) carry a prompt template, sampling parameters and a model
list, and the horde applies them server-side when a text request names a `style`. The frontpage's
prompt cards (under an alchemy request, and under the image studio's prompt box) use them as the
instruction a text model follows, so the wording can be tuned without a release.

The server has no flag for "this style writes image prompts", so the class is marked by convention:

- every such style carries the tag `image-prompt`;
- one role tag: `image-prompt:describe` (writes from a caption and tags) or `image-prompt:improve`
  (rewrites a prompt);
- further tags name a direction the reader can pick (`photographic`, `painterly`, `cinematic`,
  `minimal`).

Kudos scale with the parameter count, and one line of comma-separated phrases is not work a large
model does better, so the client's default pick is the value tier: the smallest curated build online
(at or under 9B), reaching for a bigger one only when nothing smaller is running. A reader who wants
the biggest model on the day chooses it in the card. A style's `models` is a set of builds the
request may run on and nothing more: the horde does not keep the order a style was written with, and
any worker carrying any of them can take the job, so a style that should stay cheap has to name cheap
builds only. The lists name koboldcpp builds from the client's curated list, since that is what the
sizing and the placeholders were written against.

## What a style declares

`image-prompt-styles.json` holds the set. Each entry carries the fields the endpoints take:

- `prompt`: the template. It carries the koboldcpp placeholders, one line per part of the material,
  and `{p}`, which the horde requires.
- `params`: the sampling parameters. No `singleline`: koboldcpp ignores it. The stop sequences hold
  the blank line, the input placeholder and the Alpaca marker, so a model carrying on into the next
  instruction is stopped whether or not its worker templates the placeholders.
- `parameter_policy`: `listed`, with `max_length` and `max_context_length` overridable and ceilings
  of 512, 4096 and 5 takes. A request may size itself to the material it has and may not buy a
  context nobody asked for. `n` cannot be listed as overridable (the horde rejects that outright),
  but it always comes from the request and its ceiling applies anyway.
- `template_fields`: the five parts of the material as named placeholders, `caption`, `tags`, `note`,
  `prompt` and `style_words`, all optional, each with a description the horde serves back. A request
  sends them as a flat object of strings under `template_fields` alongside `style`.
- `tags` and `models`: the convention above and the model pick.

### Two things about the template that are easy to get wrong

The horde keeps a koboldcpp placeholder such as `{{[INPUT]}}` as written in a text template; any
other brace follows Python's `str.format_map` rules, so a literal brace is written doubled. Stop
sequences are not formatted, so they carry the placeholder as written. `styles.py --probe` reads the
resolved prompt back and says whether the placeholders came through intact; check it after any edit
to a template.

A placeholder nothing fills formats to an empty string, and the label in front of it stays. A style
whose request carries only a caption therefore sends `Tags:` and `Notes from the user:` with nothing
after them, which is why every instruction ends with a line telling the model to ignore a label with
nothing after it.

## The two scripts

Both run on Python 3.12 with the standard library and `requests`. Neither is part of the app; the
frontpage takes no new dependency.

### `scripts/prompt-trials/styles.py`

Puts the styles on a horde. It creates a style the account does not have and patches the one it does,
matching on the name, which is unique per account rather than globally. It refuses any host that is
not loopback unless `--allow-remote` is passed, because a half-tested template should not reach the
public horde.

```bash
python scripts/prompt-trials/styles.py --horde-url http://localhost:7001/api/v2 --api-key "$KEY" --probe
```

With `--probe` it reads each style back, asks for a dry run that uses it with the template fields
filled and `context_fit: reject`, and keeps the `resolved` body the horde answers with: the prompt
after templating, the params after the policy, and the token estimate. That is the only way to see
what a style actually produces before a worker sees it. The files land in
`scripts/prompt-trials/styles-out/`.

The key can come from `--api-key`, from the environment (`AIHORDE_LOCAL_KEY` by default) or from a
`.env` file named with `--env-file`. It is never written to the output. Creating a style needs an
account that is trusted or a customizer; on a local horde started with `HORDE_TEST_APIKEYS=1`, the
AI-Horde repo's `tests/integration/bootstrap_test_user.py` mints a trusted one. Style writes are
limited to two a second, so the script spaces its calls and retries one that is refused anyway.

### `scripts/prompt-trials/run_trials.py`

Asks every curated model with workers the same set of jobs and scores what comes back. The cases live
in `scripts/prompt-trials/corpus.json`: a short alchemy caption with tags, a long studio prompt to
improve, a prompt with a literal `Prompt:` inside quotes, a prompt with quoted billboard text, and a
verdict case.

```bash
python scripts/prompt-trials/run_trials.py --env-file .env --takes 2 --budget 300
```

It quotes the whole run with dry runs first and stops without submitting anything if the total is
over the budget, so a run cannot cost more than it was allowed to. Then it submits every trial at
once, up to thirty in flight, spaced under the horde's ten calls a second, and polls them all
together. Everything is kept under `scripts/prompt-trials/runs/<label>/`: one JSON file per trial with
the request, the dry run, the status body and each take, plus `table.md` and `summary.json`.

Each take is scored for an empty answer, a censored one, a leaked `<think>` block, a leaked label, a
negative written as prose, an instruction echoed back, its length in tokens, the price of the request,
the worker and the model.

**The two sides have to be kept in step.** `build_draft_material`, `build_draft_prompt`,
`size_request` and `clean_draft` in `run_trials.py` are ports of the functions of those names in
`src/app/services/prompt-draft.service.ts`, placeholders and constants and all. A change to the
instructions, the sizes or the cleaning rules on either side has to be made on both, or the trials
stop describing what a reader would get.

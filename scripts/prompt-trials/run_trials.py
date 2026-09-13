#!/usr/bin/env python3
"""Ask every curated text model the same prompt-drafting jobs and score what comes back.

The bodies are built by the same rules the app builds them by: `build_draft_material`,
`build_draft_prompt` and `size_request` below are ports of the functions of those names in
`src/app/services/prompt-draft.service.ts`, and the scoring reads an answer through a port of
`clean_draft` from the same file. A change on either side has to be made on both, or the trials stop
describing what a reader would get.

Every request and every response is kept as JSON under the output folder, so a run can be read again
without asking the horde a second time.

Python 3.12 with the standard library and `requests`.
"""

from __future__ import annotations

import argparse
import json
import math
import os
import re
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import requests

CLIENT_AGENT = "AiHordeFrontpage:prompt-trials:1.0"
DEFAULT_HORDE = "https://aihorde.net/api/v2"

# ---------------------------------------------------------------------------
# The curated list, as `CURATED_TEXT_MODELS` in prompt-draft.service.ts has it.
# ---------------------------------------------------------------------------

CURATED_TEXT_MODELS: list[tuple[str, int]] = [
    (r"gemma-4.*e\d+b.*-it", 0),
    (r"llama-3(\.\d)?-8b-instruct", 1),
    (r"qwen3(\.5)?-(4|7|8)b", 2),
    (r"llama-3\.2-3b-instruct", 3),
    (r"qwen.*-(0\.6|0\.8|1\.7)b|llama-3\.2-1b-instruct", 4),
    (r"qwen3(\.5)?-(14|32)b", 5),
    (r"llama-3(\.\d)?-70b-instruct", 6),
    (r"gemma-4-31b.*-it", 7),
    (r"gemma-4.*-it", 8),
    (r"cydonia", 9),
    (r"behemoth", 10),
]


def curated_rank(name: str) -> int | None:
    """Where a model falls on the curated list, or None when it is not on it."""
    for pattern, rank in CURATED_TEXT_MODELS:
        if re.search(pattern, name, re.IGNORECASE):
            return rank
    return None


def model_parameter_count(name: str) -> float | None:
    """How many billion parameters a model's name claims, or None when it does not say."""
    matches = re.findall(r"(\d+(?:\.\d+)?)b(?![a-z0-9])", name, re.IGNORECASE)
    if not matches:
        return None
    value = float(matches[-1])
    return value if value > 0 else None


# ---------------------------------------------------------------------------
# The templates. Ports of buildDraftMaterial / buildDraftPrompt.
# ---------------------------------------------------------------------------

INPUT_PLACEHOLDER = "{{[INPUT]}}"
OUTPUT_PLACEHOLDER = "{{[OUTPUT]}}"

JUDGE_INSTRUCTION = (
    "You compare an image prompt with a description of the finished picture. In three short lines "
    "say what matches, what is missing, and one change to the prompt that would help. No preamble."
)

IMPROVE_STYLED = (
    "You improve prompts for an AI image generator. Rewrite the prompt below as one stronger prompt, "
    "then write a negative prompt for it. Answer in exactly two labelled lines:\n"
    "Prompt: a single line of comma-separated phrases, concrete and visual, keeping every subject and "
    "detail the writer asked for. Write the subject and the scene only: a rendering style is applied "
    "separately, so add no style, medium or quality words.\n"
    "Negative: a short, comma-separated line naming what should be kept out of the picture. No style "
    "words, since a style is applied separately.\n"
    "No quotes, no explanation."
)

IMPROVE_PLAIN = (
    "You improve prompts for an AI image generator. Rewrite the prompt below as one stronger prompt, "
    "then write a negative prompt for it. Answer in exactly two labelled lines:\n"
    "Prompt: a single line of comma-separated phrases, concrete and visual, keeping every subject and "
    "detail the writer asked for, adding setting, style, lighting and quality words only where they "
    "are missing.\n"
    "Negative: a short, comma-separated line naming what should be kept out of the picture.\n"
    "No quotes, no explanation."
)

WRITE_STYLED = (
    "You write prompts for an AI image generator. Turn the description below into one prompt: a single "
    "line of comma-separated phrases, concrete and visual, the subject first, then the setting. Write "
    "the subject and the scene only: a rendering style is applied separately, so add no style, medium "
    "or quality words. Write nothing but the prompt. No quotes, no explanation."
)

WRITE_PLAIN = (
    "You write prompts for an AI image generator. Turn the description below into one prompt: a single "
    "line of comma-separated phrases, concrete and visual, the subject first, then the setting, the "
    "style, the lighting and quality words. Write nothing but the prompt. No quotes, no explanation."
)


def _part(material: dict[str, Any], key: str) -> str:
    value = material.get(key)
    return value.strip() if isinstance(value, str) else ""


def draft_role(material: dict[str, Any]) -> str:
    """What the request is for, once the material has had its say."""
    role = material.get("role")
    if role:
        return str(role)
    return "improve" if _part(material, "prompt") else "write"


def build_draft_material(material: dict[str, Any]) -> str:
    """The material alone, labelled line by line, with no instruction of its own."""
    lines: list[str] = []
    prompt = _part(material, "prompt")
    caption = _part(material, "caption")
    tags = _part(material, "tags")
    note = _part(material, "note")
    style_words = _part(material, "styleWords")
    if prompt:
        lines.append(f"Prompt: {prompt}")
    if caption:
        lines.append(f"Description: {caption}")
    if tags:
        lines.append(f"Tags: {tags}")
    if note:
        lines.append(f"Notes from the user: {note}")
    if style_words:
        lines.append(f"Rendering style applied separately (do not repeat these words): {style_words}")
    return "\n".join(lines)


def as_instruction(instruction: str, material: str) -> str:
    """An instruction and its material, marked up for the worker to template."""
    return f"{INPUT_PLACEHOLDER}\n{instruction}\n\n{material}\n{OUTPUT_PLACEHOLDER}\n"


def build_draft_prompt(material: dict[str, Any]) -> str:
    """The request as an instruction the common instruct tunes follow."""
    styled = bool(_part(material, "styleWords"))
    role = draft_role(material)
    body = build_draft_material(material)
    if role == "judge":
        return as_instruction(JUDGE_INSTRUCTION, body)
    if role == "improve":
        instruction = IMPROVE_STYLED if styled else IMPROVE_PLAIN
    else:
        instruction = WRITE_STYLED if styled else WRITE_PLAIN
    return as_instruction(instruction, body)


def stop_sequences_for(role: str) -> list[str]:
    """Where an answer is cut short, for workers that template the placeholders and those that do not."""
    shared = [INPUT_PLACEHOLDER, "### Instruction:"]
    return ["\n\n", *shared] if role == "write" else shared


# ---------------------------------------------------------------------------
# The sizes. A port of sizeRequest and the constants around it.
# ---------------------------------------------------------------------------

CHARS_PER_TOKEN = 3.5
TOKEN_MARGIN = 1.2
LARGEST_CONTEXT = 4096
CONTEXT_STEPS = [512, 1024, 2048, LARGEST_CONTEXT]
WRITE_MIN_LENGTH = 48
WRITE_MAX_LENGTH = 160
IMPROVE_HEADROOM = 64
IMPROVE_MIN_LENGTH = 64
IMPROVE_MAX_LENGTH = 256
JUDGE_LENGTH = 200


def estimate_tokens(text: str) -> int:
    """What a piece of text costs to read, as near as a client can tell."""
    return math.ceil((len(text) / CHARS_PER_TOKEN) * TOKEN_MARGIN)


def _clamp(value: float, low: float, high: float) -> float:
    return min(high, max(low, value))


def asked_length(role: str, material: dict[str, Any]) -> int:
    """The answer allowance the job wants, before any ceiling is applied."""
    if role == "judge":
        return JUDGE_LENGTH
    if role == "improve":
        return int(
            _clamp(
                estimate_tokens(_part(material, "prompt")) + IMPROVE_HEADROOM,
                IMPROVE_MIN_LENGTH,
                IMPROVE_MAX_LENGTH,
            )
        )
    return int(_clamp(estimate_tokens(build_draft_material(material)), WRITE_MIN_LENGTH, WRITE_MAX_LENGTH))


@dataclass
class Sizing:
    """The two sizes a request goes out with, and what they were worked out from."""

    max_length: int
    max_context_length: int
    prompt_tokens: int
    asked_length: int
    limited_by: str | None


def size_request(
    role: str,
    material: dict[str, Any],
    limits: dict[str, int] | None = None,
    ceilings: dict[str, int] | None = None,
) -> Sizing:
    """The two sizes a request goes out with, held to the workers' ceilings and the style's."""
    prompt_tokens = estimate_tokens(build_draft_prompt(material))
    asked = asked_length(role, material)
    worker_cap = (limits or {}).get("maxLength", math.inf)
    style_cap = (ceilings or {}).get("maxLength", math.inf)
    max_length = int(max(1, min(asked, worker_cap, style_cap)))
    wanted = prompt_tokens + max_length
    context_cap = min(
        (limits or {}).get("maxContextLength", math.inf),
        (ceilings or {}).get("maxContextLength", math.inf),
    )
    step = next((size for size in CONTEXT_STEPS if size >= wanted), LARGEST_CONTEXT)
    max_context_length = int(min(step, context_cap))
    if max_length >= asked:
        limited_by = None
    elif style_cap < worker_cap:
        limited_by = "style"
    else:
        limited_by = "workers"
    return Sizing(max_length, max_context_length, prompt_tokens, asked, limited_by)


def build_request(
    material: dict[str, Any],
    models: list[str] | None,
    takes: int,
    sizing: Sizing,
) -> dict[str, Any]:
    """The body a press would send, as `PromptDraftService.buildRequest` builds it with no style."""
    role = draft_role(material)
    params: dict[str, Any] = {
        "max_length": sizing.max_length,
        "max_context_length": sizing.max_context_length,
        "temperature": 0.7,
        "top_p": 0.92,
        "min_p": 0.05,
        "rep_pen": 1.1,
        "stop_sequence": stop_sequences_for(role),
    }
    if takes > 1:
        params = {"n": takes, **params}
    body: dict[str, Any] = {"prompt": build_draft_prompt(material), "params": params}
    if models:
        body["models"] = models
    body["slow_workers"] = True
    return body


# ---------------------------------------------------------------------------
# Reading an answer. A port of cleanDraft and the helpers it uses.
# ---------------------------------------------------------------------------

QUOTES = "\"'“”‘’"
_QUOTE_EDGES = re.compile(rf"^[{QUOTES}]+|[{QUOTES}]+$")
_BULLET = re.compile(r"^[-*•]\s*")
_WHITESPACE = re.compile(r"\s+")


def _unquoted(text: str) -> str:
    return _QUOTE_EDGES.sub("", text).strip()


def tidy_line(value: str) -> str:
    """A line with the quotes and bullet a model sometimes puts round it taken off."""
    return _WHITESPACE.sub(" ", _unquoted(_BULLET.sub("", _unquoted(value))))


def was_wrapped(value: str) -> bool:
    """Whether tidying a line took anything off it beyond repeated blanks."""
    return tidy_line(value) != _WHITESPACE.sub(" ", value).strip()


def strip_think_blocks(text: str) -> str:
    """The answer with any reasoning the model showed taken out, closed block or not."""
    without = re.sub(r"<think(?:ing)?>[\s\S]*?</think(?:ing)?>", " ", text, flags=re.IGNORECASE)
    without = re.sub(r"<think(?:ing)?>[\s\S]*$", " ", without, count=1, flags=re.IGNORECASE)
    return without.strip()


def trim_to_sentence(text: str) -> str:
    """The text cut back to the last sentence it finished; a list of phrases is left whole."""
    trimmed = text.strip()
    if trimmed == "" or re.search(rf"[.!?][{QUOTES}]?$", trimmed):
        return trimmed
    ends = list(re.finditer(rf"[.!?][{QUOTES}]?(?=\s)", trimmed))
    if not ends:
        return trimmed
    return trimmed[: ends[-1].end()].strip()


def is_prose_negative(value: str) -> bool:
    """Whether a negative line was written as sentences rather than as a list."""
    return bool(re.search(r"[.!?]", value) or re.match(r"^(no|avoid|without|don'?t)\s", value, re.IGNORECASE))


def reshape_negative(value: str) -> str:
    """A negative line written as prose turned into the list an image generator reads."""
    words: list[str] = []
    for sentence in re.split(r"[.!?]+", value):
        sentence = sentence.strip()
        if not sentence:
            continue
        sentence = re.sub(r"^(no|avoid|without|don'?t(?:\s+include)?|not)\s+", "", sentence, flags=re.IGNORECASE)
        for word in re.split(r"\s*,\s*|\s+(?:or|and)\s+", sentence, flags=re.IGNORECASE):
            word = word.strip()
            if word:
                words.append(word)
    return ", ".join(dict.fromkeys(words))


INSTRUCTION_ECHO = re.compile(
    r"^(you (write|improve) prompts?\b|you compare an image prompt\b|turn the description below\b"
    r"|answer in exactly two labelled lines\b|rewrite the prompt below\b)",
    re.IGNORECASE,
)

CHANGE_ORDER = [
    "think_removed",
    "label_stripped",
    "quotes_stripped",
    "negative_reshaped",
    "trimmed_to_sentence",
    "instruction_echo",
]

_LABELLED = re.compile(r"^(prompt|image prompt|positive)\s*:\s*", re.IGNORECASE)
_NEGATIVE_LABEL = re.compile(r"^(negative|negative prompt)\s*:\s*", re.IGNORECASE)


def clean_draft(text: str) -> dict[str, Any]:
    """A model's answer split into the prompt and the negative line, and what was done to it."""
    changes: set[str] = set()
    thought = strip_think_blocks(text)
    if thought != text.strip():
        changes.add("think_removed")
    lines = [line.strip() for line in re.split(r"\r?\n", thought)]
    lines = [line for line in lines if line]
    prompt: str | None = None
    negative = ""
    for line in lines:
        clean = tidy_line(line)
        if negative == "" and _NEGATIVE_LABEL.match(clean):
            if was_wrapped(line):
                changes.add("quotes_stripped")
            changes.add("label_stripped")
            negative = tidy_line(_NEGATIVE_LABEL.sub("", clean, count=1))
            continue
        if prompt is None and _LABELLED.match(clean):
            if was_wrapped(line):
                changes.add("quotes_stripped")
            changes.add("label_stripped")
            prompt = tidy_line(_LABELLED.sub("", clean, count=1))
    if prompt is None:
        first = next((line for line in lines if not _NEGATIVE_LABEL.match(tidy_line(line))), None)
        if first is not None and was_wrapped(first):
            changes.add("quotes_stripped")
        prompt = "" if first is None else tidy_line(first)
    if negative != "" and is_prose_negative(negative):
        listed = reshape_negative(negative)
        if listed not in ("", negative):
            negative = listed
            changes.add("negative_reshaped")
    trimmed = trim_to_sentence(prompt)
    if trimmed != prompt and trimmed != "":
        prompt = trimmed
        changes.add("trimmed_to_sentence")
    if INSTRUCTION_ECHO.match(prompt):
        changes.add("instruction_echo")
    return {
        "text": prompt,
        "negative": negative,
        "changes": [change for change in CHANGE_ORDER if change in changes],
    }


# ---------------------------------------------------------------------------
# The horde
# ---------------------------------------------------------------------------


class Horde:
    """The calls a trial run makes, on one session with one key.

    The horde answers 429 above ten calls a second, whoever is asking, so every call goes through
    one spacing lock and a call that is refused anyway is tried again. Thirty trials in flight are
    thirty waiting answers, not thirty calls at once.
    """

    def __init__(self, base_url: str, api_key: str, timeout: int = 30, rate: float = 8.0) -> None:
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout
        self.spacing = 1.0 / rate if rate > 0 else 0.0
        self._lock = threading.Lock()
        self._next_call = 0.0
        self.session = requests.Session()
        self.session.headers.update(
            {
                "apikey": api_key,
                "Client-Agent": CLIENT_AGENT,
                "Content-Type": "application/json",
            }
        )

    def _space(self) -> None:
        with self._lock:
            now = time.monotonic()
            wait = self._next_call - now
            self._next_call = max(now, self._next_call) + self.spacing
        if wait > 0:
            time.sleep(wait)

    def _call(self, method: str, path: str, **kwargs: Any) -> requests.Response:
        for attempt in range(6):
            self._space()
            response = self.session.request(method, f"{self.base_url}{path}", timeout=self.timeout, **kwargs)
            if response.status_code != 429:
                return response
            time.sleep(1.0 + attempt)
        return response

    def get(self, path: str, **params: Any) -> Any:
        response = self._call("GET", path, params=params or None)
        response.raise_for_status()
        return response.json()

    def post(self, path: str, body: dict[str, Any]) -> tuple[int, Any]:
        response = self._call("POST", path, json=body)
        try:
            payload = response.json()
        except ValueError:
            payload = {"raw": response.text}
        return response.status_code, payload

    def delete(self, path: str) -> Any:
        response = self._call("DELETE", path)
        try:
            return response.json()
        except ValueError:
            return {"raw": response.text}


def online_curated_models(horde: Horde) -> list[dict[str, Any]]:
    """The curated models with workers, in curated order and then by how many workers run them."""
    models = horde.get("/status/models", type="text")
    ranked = []
    for model in models:
        if model.get("count", 0) <= 0:
            continue
        rank = curated_rank(model.get("name", ""))
        if rank is None:
            continue
        ranked.append({**model, "rank": rank})
    ranked.sort(key=lambda entry: (entry["rank"], -entry.get("count", 0)))
    return ranked


def worker_limits(horde: Horde) -> dict[str, dict[str, int]]:
    """The largest `max_length` and `max_context_length` advertised per model, over online workers."""
    workers = horde.get("/workers", type="text")
    limits: dict[str, dict[str, int]] = {}
    for worker in workers:
        if worker.get("online") is False or worker.get("maintenance_mode"):
            continue
        length = worker.get("max_length")
        context = worker.get("max_context_length")
        for name in worker.get("models") or []:
            entry = limits.setdefault(name, {"maxLength": 0, "maxContextLength": 0})
            if isinstance(length, int):
                entry["maxLength"] = max(entry["maxLength"], length)
            if isinstance(context, int):
                entry["maxContextLength"] = max(entry["maxContextLength"], context)
    return {name: entry for name, entry in limits.items() if entry["maxLength"] > 0 and entry["maxContextLength"] > 0}


# ---------------------------------------------------------------------------
# A run
# ---------------------------------------------------------------------------


@dataclass
class Trial:
    """One case asked of one model: the body it goes out with and everything it comes back with."""

    trial_id: str
    case: str
    role: str
    model: str
    material: dict[str, Any]
    sizing: Sizing
    body: dict[str, Any]
    dry_run_kudos: float | None = None
    dry_run_body: dict[str, Any] | None = None
    request_id: str | None = None
    submit_status: int | None = None
    submit_body: dict[str, Any] | None = None
    status: dict[str, Any] | None = None
    error: str | None = None
    generations: list[dict[str, Any]] = field(default_factory=list)


def load_corpus(path: Path) -> list[dict[str, Any]]:
    cases = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(cases, list):
        raise SystemExit(f"{path} does not hold a list of cases")
    return cases


def read_key(args: argparse.Namespace) -> str:
    """The key from the flag, the environment or a .env file, in that order. It is never printed."""
    if args.api_key:
        return args.api_key
    from_env = os.getenv(args.env_var)
    if from_env:
        return from_env
    if args.env_file:
        for line in Path(args.env_file).read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            name, _, value = line.partition("=")
            if name.strip() == args.env_var:
                return value.strip().strip("\"'")
    raise SystemExit(f"No API key: pass --api-key, set {args.env_var}, or point --env-file at a file holding it")


def build_trials(
    cases: list[dict[str, Any]],
    models: list[str],
    limits: dict[str, dict[str, int]],
    takes: int,
) -> list[Trial]:
    trials: list[Trial] = []
    for case in cases:
        material = {key: value for key, value in case.items() if key != "id"}
        role = draft_role(material)
        for model in models:
            sizing = size_request(role, material, limits.get(model))
            trials.append(
                Trial(
                    trial_id=f"{case['id']}--{re.sub(r'[^A-Za-z0-9._-]+', '_', model)}",
                    case=str(case["id"]),
                    role=role,
                    model=model,
                    material=material,
                    sizing=sizing,
                    body=build_request(material, [model], takes, sizing),
                )
            )
    return trials


def dry_run_all(horde: Horde, trials: list[Trial], pool: ThreadPoolExecutor) -> None:
    def one(trial: Trial) -> None:
        status, payload = horde.post("/generate/text/async", {**trial.body, "dry_run": True})
        trial.dry_run_body = {"status": status, "response": payload}
        # A dry run answers 200 with the quote; a queued request answers 202 with an id.
        if status in (200, 202) and isinstance(payload, dict) and payload.get("kudos") is not None:
            trial.dry_run_kudos = payload.get("kudos")
        else:
            trial.error = f"dry run {status}: {json.dumps(payload)[:300]}"

    list(pool.map(one, trials))


def submit_all(horde: Horde, trials: list[Trial], pool: ThreadPoolExecutor) -> None:
    def one(trial: Trial) -> None:
        status, payload = horde.post("/generate/text/async", trial.body)
        trial.submit_status = status
        trial.submit_body = payload
        if status == 202 and isinstance(payload, dict) and payload.get("id"):
            trial.request_id = str(payload["id"])
        else:
            trial.error = f"submit {status}: {json.dumps(payload)[:300]}"

    list(pool.map(one, trials))


def poll_all(
    horde: Horde,
    trials: list[Trial],
    pool: ThreadPoolExecutor,
    timeout: int,
    interval: int,
) -> None:
    """Every live request checked in one round, over and over, until all of them are finished."""
    pending = [trial for trial in trials if trial.request_id]
    deadline = time.monotonic() + timeout
    while pending and time.monotonic() < deadline:

        def one(trial: Trial) -> Trial:
            try:
                trial.status = horde.get(f"/generate/text/status/{trial.request_id}")
            except requests.RequestException as err:
                trial.error = f"poll: {err}"
            return trial

        checked = list(pool.map(one, pending))
        still: list[Trial] = []
        for trial in checked:
            status = trial.status or {}
            if status.get("done") or status.get("faulted") or status.get("is_possible") is False:
                trial.generations = status.get("generations") or []
                continue
            still.append(trial)
        pending = still
        if pending:
            waited = int(time.monotonic() - (deadline - timeout))
            print(f"  {len(pending)} still running after {waited}s", flush=True)
            time.sleep(interval)
    for trial in pending:
        trial.error = (trial.error or "") + " timed out; cancelled"
        trial.status = horde.delete(f"/generate/text/status/{trial.request_id}")
        trial.generations = (trial.status or {}).get("generations") or []


def score(trial: Trial, generation: dict[str, Any]) -> dict[str, Any]:
    """One take read the way the app reads it, with the leaks it carries named."""
    raw = generation.get("text") or ""
    cleaned = clean_draft(raw)
    state = generation.get("state")
    return {
        "case": trial.case,
        "role": trial.role,
        "model": generation.get("model") or trial.model,
        "worker": generation.get("worker_name") or "",
        "empty": raw.strip() == "",
        "censored": state in ("censored", "csam"),
        "think_leak": "<think" in raw.lower(),
        "label_leak": "label_stripped" in cleaned["changes"],
        "prose_negative": "negative_reshaped" in cleaned["changes"],
        "instruction_echo": "instruction_echo" in cleaned["changes"],
        "tokens": estimate_tokens(raw),
        "state": state,
        "text": cleaned["text"],
        "negative": cleaned["negative"],
        "changes": cleaned["changes"],
        "raw": raw,
    }


def mark(value: bool) -> str:
    return "yes" if value else "-"


def results_table(trials: list[Trial]) -> str:
    """The scoring table: one row per take, plus the sizes each case and model asked for."""
    lines = [
        "| Case | Role | Model | Take | Empty | Censored | Think | Label | Prose neg | Echo | Tokens "
        "| Kudos | Worker |",
        "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    ]
    for trial in trials:
        kudos = (trial.status or {}).get("kudos")
        kudos_text = f"{kudos:.1f}" if isinstance(kudos, (int, float)) else "-"
        if not trial.generations:
            lines.append(
                f"| {trial.case} | {trial.role} | {trial.model} | - | - | - | - | - | - | - | - | "
                f"{kudos_text} | {(trial.error or 'no takes')[:60]} |"
            )
            continue
        for index, generation in enumerate(trial.generations, start=1):
            row = score(trial, generation)
            lines.append(
                f"| {row['case']} | {row['role']} | {row['model']} | {index} | {mark(row['empty'])} | "
                f"{mark(row['censored'])} | {mark(row['think_leak'])} | {mark(row['label_leak'])} | "
                f"{mark(row['prose_negative'])} | {mark(row['instruction_echo'])} | {row['tokens']} | "
                f"{kudos_text if index == 1 else ''} | {row['worker']} |"
            )
    lines.append("")
    lines.append("| Case | Role | Model | max_length | max_context_length | Prompt tokens | Asked | Held by |")
    lines.append("| --- | --- | --- | --- | --- | --- | --- | --- |")
    for trial in trials:
        sizing = trial.sizing
        lines.append(
            f"| {trial.case} | {trial.role} | {trial.model} | {sizing.max_length} | "
            f"{sizing.max_context_length} | {sizing.prompt_tokens} | {sizing.asked_length} | "
            f"{sizing.limited_by or '-'} |"
        )
    return "\n".join(lines)


def save(out_dir: Path, trials: list[Trial], takes: int, horde_url: str) -> None:
    """Every request and every response, kept whole so a run can be read again."""
    (out_dir / "raw").mkdir(parents=True, exist_ok=True)
    for trial in trials:
        record = {
            "trial_id": trial.trial_id,
            "case": trial.case,
            "role": trial.role,
            "model": trial.model,
            "material": trial.material,
            "sizing": trial.sizing.__dict__,
            "request": trial.body,
            "dry_run": trial.dry_run_body,
            "submit": {"status": trial.submit_status, "response": trial.submit_body},
            "request_id": trial.request_id,
            "response": trial.status,
            "error": trial.error,
            "takes": [score(trial, generation) for generation in trial.generations],
        }
        (out_dir / "raw" / f"{trial.trial_id}.json").write_text(
            json.dumps(record, indent=2, ensure_ascii=False), encoding="utf-8"
        )
    summary = {
        "horde": horde_url,
        "ran_at": datetime.now(timezone.utc).isoformat(),
        "takes_per_trial": takes,
        "trials": len(trials),
        "dry_run_kudos": sum(trial.dry_run_kudos or 0 for trial in trials),
        "spent_kudos": sum((trial.status or {}).get("kudos") or 0 for trial in trials),
    }
    (out_dir / "summary.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")
    (out_dir / "table.md").write_text(results_table(trials) + "\n", encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--horde-url", default=DEFAULT_HORDE, help="Base API URL")
    parser.add_argument("--api-key", help="API key; prefer the environment or --env-file")
    parser.add_argument("--env-var", default="AIHORDE_DEV_KEY", help="Environment variable holding the key")
    parser.add_argument("--env-file", help="A .env file to read the key from when it is not in the environment")
    parser.add_argument(
        "--corpus",
        default=str(Path(__file__).with_name("corpus.json")),
        help="The cases to ask",
    )
    parser.add_argument("--out", default=str(Path(__file__).with_name("runs")), help="Where the run is kept")
    parser.add_argument("--label", help="A name for this run's folder; the timestamp otherwise")
    parser.add_argument("--takes", type=int, default=2, help="Answers per trial (n)")
    parser.add_argument("--budget", type=float, default=300.0, help="The most kudos a run may quote")
    parser.add_argument("--models", help="Comma-separated models, in place of the online curated ones")
    parser.add_argument("--max-models", type=int, help="Ask only the first N curated models online")
    parser.add_argument("--cases", help="Comma-separated case ids, in place of the whole corpus")
    parser.add_argument("--concurrency", type=int, default=30, help="Requests in flight at once")
    parser.add_argument("--rate", type=float, default=8.0, help="Calls a second; the horde refuses above ten")
    parser.add_argument("--timeout", type=int, default=600, help="Seconds before a live request is cancelled")
    parser.add_argument("--interval", type=int, default=5, help="Seconds between polling rounds")
    parser.add_argument("--dry-run-only", action="store_true", help="Quote the run and stop")
    args = parser.parse_args()

    horde = Horde(args.horde_url, read_key(args), rate=args.rate)
    cases = load_corpus(Path(args.corpus))
    if args.cases:
        wanted = {name.strip() for name in args.cases.split(",")}
        cases = [case for case in cases if case["id"] in wanted]
    if not cases:
        raise SystemExit("No cases to ask")

    if args.models:
        models = [name.strip() for name in args.models.split(",") if name.strip()]
    else:
        online = online_curated_models(horde)
        models = [entry["name"] for entry in online]
        print(f"Curated models online: {len(models)}")
        for entry in online:
            size = model_parameter_count(entry["name"])
            print(f"  {entry['name']} ({entry['count']} workers, {size or '?'}B, rank {entry['rank']})")
    if args.max_models:
        models = models[: args.max_models]
    if not models:
        raise SystemExit("No curated model has workers; nothing to ask")

    limits = worker_limits(horde)
    trials = build_trials(cases, models, limits, args.takes)
    print(f"{len(trials)} trials: {len(cases)} cases x {len(models)} models, n={args.takes}")

    out_dir = Path(args.out) / (args.label or datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S"))
    out_dir.mkdir(parents=True, exist_ok=True)

    with ThreadPoolExecutor(max_workers=max(1, args.concurrency)) as pool:
        dry_run_all(horde, trials, pool)
        quoted = sum(trial.dry_run_kudos or 0 for trial in trials)
        print(f"Dry run total: {quoted:.1f} kudos over {len(trials)} trials")
        for trial in trials:
            if trial.error:
                print(f"  {trial.trial_id}: {trial.error}")
        if quoted > args.budget:
            save(out_dir, trials, args.takes, args.horde_url)
            print(f"Over the {args.budget:.0f} kudos budget; nothing submitted. Quotes kept in {out_dir}")
            return 1
        if args.dry_run_only:
            save(out_dir, trials, args.takes, args.horde_url)
            print(f"Quotes kept in {out_dir}")
            return 0

        submit_all(horde, trials, pool)
        live = [trial for trial in trials if trial.request_id]
        print(f"{len(live)} submitted; polling every {args.interval}s")
        poll_all(horde, trials, pool, args.timeout, args.interval)

    save(out_dir, trials, args.takes, args.horde_url)
    spent = sum((trial.status or {}).get("kudos") or 0 for trial in trials)
    print(f"Spent: {spent:.1f} kudos (quoted {quoted:.1f}). Run kept in {out_dir}")
    print()
    print(results_table(trials))
    return 0


if __name__ == "__main__":
    sys.exit(main())

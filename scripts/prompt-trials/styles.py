#!/usr/bin/env python3
"""Put the image-prompt styles on a horde, and check what one resolves to.

Reads `scripts/prompt-styles/image-prompt-styles.json` and creates each style the account does not
have yet, patching the one it does by the same name. Style names are unique per account, so the
account's own style of that name is the one a second run updates.

With `--probe` it reads a style back and asks the horde for a dry run that uses it, with the
template fields filled and `context_fit: reject`, and keeps the `resolved` body the horde answers
with: the prompt after templating, the params after the policy, and the token estimate. That is the
only way to see whether the koboldcpp placeholders survived `str.format_map`, which is why the
templates carry them doubled.

Aimed at a local horde. Pass `--allow-remote` to talk to anything that is not loopback.

Python 3.12 with the standard library and `requests`.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
import urllib.parse
from pathlib import Path
from typing import Any

import requests

CLIENT_AGENT = "AiHordeFrontpage:prompt-styles:1.0"
DEFAULT_HORDE = "http://localhost:7001/api/v2"
LOOPBACK = ("localhost", "127.0.0.1", "::1")

# What a probe fills the declared fields with: enough of each to see the layout come back.
PROBE_FIELDS: dict[str, dict[str, str]] = {
    "describe": {
        "caption": "a lighthouse on a rocky headland with waves breaking against it under a heavy sky",
        "tags": "lighthouse, storm, sea spray, cliffs, overcast, dusk",
        "note": "keep it moody",
    },
    "improve": {
        "prompt": "a woman in a greenhouse full of ferns, morning light through dusty glass, linen apron",
        "note": "she should be looking at the camera",
        "style_words": "cinematic, anamorphic lens, teal and orange grade",
    },
}


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


class Horde:
    """The style calls, on one session with one key.

    Writing a style is limited to two calls a second, well under what the rest of the API allows, so
    every call is spaced and a call refused anyway is tried again. A set of six styles is otherwise
    half created and half refused.
    """

    def __init__(self, base_url: str, api_key: str, timeout: int = 30, spacing: float = 0.6) -> None:
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout
        self.spacing = spacing
        self._next_call = 0.0
        self.session = requests.Session()
        self.session.headers.update(
            {"apikey": api_key, "Client-Agent": CLIENT_AGENT, "Content-Type": "application/json"}
        )

    def _call(self, method: str, path: str, **kwargs: Any) -> requests.Response:
        for attempt in range(6):
            wait = self._next_call - time.monotonic()
            if wait > 0:
                time.sleep(wait)
            self._next_call = time.monotonic() + self.spacing
            response = self.session.request(method, f"{self.base_url}{path}", timeout=self.timeout, **kwargs)
            if response.status_code != 429:
                return response
            time.sleep(1.0 + attempt)
        return response

    def get(self, path: str, **params: Any) -> tuple[int, Any]:
        return _read(self._call("GET", path, params=params or None))

    def post(self, path: str, body: dict[str, Any]) -> tuple[int, Any]:
        return _read(self._call("POST", path, json=body))

    def patch(self, path: str, body: dict[str, Any]) -> tuple[int, Any]:
        return _read(self._call("PATCH", path, json=body))


def _read(response: requests.Response) -> tuple[int, Any]:
    return response.status_code, _json_of(response)


def _json_of(response: requests.Response) -> Any:
    try:
        return response.json()
    except ValueError:
        return {"raw": response.text}


def style_body(style: dict[str, Any]) -> dict[str, Any]:
    """The body the endpoints take, from one entry of the style file."""
    body = {
        key: style[key]
        for key in (
            "name",
            "info",
            "prompt",
            "params",
            "public",
            "nsfw",
            "tags",
            "models",
            "parameter_policy",
            "template_fields",
        )
        if key in style
    }
    return body


def find_own_style(horde: Horde, alias: str, name: str) -> dict[str, Any] | None:
    """The account's own style of that name, or None. Names are unique per account, not globally."""
    lookup = urllib.parse.quote(f"{alias}::{name}", safe="")
    status, payload = horde.get(f"/styles/text_by_name/{lookup}")
    if status == 200 and isinstance(payload, dict) and payload.get("id"):
        return payload
    return None


def declared_role(style: dict[str, Any]) -> str:
    """Which job a style does, from the role tag the convention puts on it."""
    tags = style.get("tags") or []
    return "improve" if "image-prompt:improve" in tags else "describe"


def probe(horde: Horde, style: dict[str, Any], out_dir: Path) -> dict[str, Any]:
    """One dry run through a style, with its fields filled, kept as the horde resolved it."""
    role = declared_role(style)
    declared = {field["name"] for field in style.get("template_fields") or []}
    fields = {name: value for name, value in PROBE_FIELDS[role].items() if name in declared}
    request = {
        "prompt": " ",
        "style": style["id"],
        "template_fields": fields,
        "context_fit": "reject",
        "params": {"n": 1},
        "dry_run": True,
        "slow_workers": True,
    }
    status, payload = horde.post("/generate/text/async", request)
    record = {
        "style": {"id": style["id"], "name": style["name"]},
        "request": request,
        "status": status,
        "response": payload,
    }
    safe = "".join(character if character.isalnum() else "_" for character in style["name"])
    (out_dir / f"resolved--{safe}.json").write_text(json.dumps(record, indent=2, ensure_ascii=False), encoding="utf-8")
    return record


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--horde-url", default=DEFAULT_HORDE, help="Base API URL")
    parser.add_argument("--allow-remote", action="store_true", help="Permit a host that is not loopback")
    parser.add_argument("--api-key", help="API key; prefer the environment or --env-file")
    parser.add_argument("--env-var", default="AIHORDE_LOCAL_KEY", help="Environment variable holding the key")
    parser.add_argument("--env-file", help="A .env file to read the key from when it is not in the environment")
    parser.add_argument(
        "--file",
        default=str(Path(__file__).resolve().parents[1] / "prompt-styles" / "image-prompt-styles.json"),
        help="The style declarations to put on the horde",
    )
    parser.add_argument("--out", default=str(Path(__file__).with_name("styles-out")), help="Where probes are kept")
    parser.add_argument("--only", help="Comma-separated style names, in place of all of them")
    parser.add_argument("--dry-run", action="store_true", help="Say what would be sent and stop")
    parser.add_argument("--probe", action="store_true", help="Read each style back and dry run through it")
    args = parser.parse_args()

    host = urllib.parse.urlparse(args.horde_url).hostname or ""
    if host not in LOOPBACK and not args.allow_remote:
        raise SystemExit(f"{host} is not loopback; pass --allow-remote if that is really the intention")

    styles = json.loads(Path(args.file).read_text(encoding="utf-8"))
    if args.only:
        wanted = {name.strip() for name in args.only.split(",")}
        styles = [style for style in styles if style["name"] in wanted]
    if not styles:
        raise SystemExit("No styles to send")

    horde = Horde(args.horde_url, read_key(args))
    status, user = horde.get("/find_user")
    if status != 200 or not isinstance(user, dict):
        raise SystemExit(f"The key was not accepted ({status}): {json.dumps(user)[:200]}")
    alias = user.get("username", "")
    print(f"Account: {alias} on {args.horde_url}")

    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)
    written: list[dict[str, Any]] = []
    for style in styles:
        body = style_body(style)
        existing = find_own_style(horde, alias, style["name"])
        if args.dry_run:
            print(f"{'PATCH' if existing else 'POST '} {style['name']}")
            continue
        if existing:
            status, payload = horde.patch(f"/styles/text/{existing['id']}", body)
            style_id = existing["id"]
        else:
            status, payload = horde.post("/styles/text", body)
            style_id = payload.get("id") if isinstance(payload, dict) else None
        if status not in (200, 201) or not style_id:
            print(f"FAILED {style['name']} ({status}): {json.dumps(payload)[:400]}")
            continue
        print(f"{'updated' if existing else 'created'} {style['name']} -> {style_id}")
        written.append({"id": style_id, "name": style["name"]})

    if args.dry_run or not args.probe:
        return 0

    for entry in written:
        status, served = horde.get(f"/styles/text/{entry['id']}")
        if status != 200 or not isinstance(served, dict):
            print(f"could not read {entry['name']} back ({status})")
            continue
        (out_dir / f"served--{''.join(c if c.isalnum() else '_' for c in entry['name'])}.json").write_text(
            json.dumps(served, indent=2, ensure_ascii=False), encoding="utf-8"
        )
        record = probe(horde, served, out_dir)
        resolved = (record["response"] or {}).get("resolved") if isinstance(record["response"], dict) else None
        if record["status"] not in (200, 202) or resolved is None:
            print(f"probe {entry['name']}: {record['status']} {json.dumps(record['response'])[:300]}")
            continue
        prompt = resolved.get("prompt", "")
        placeholders = all(marker in prompt for marker in ("{{[INPUT]}}", "{{[OUTPUT]}}"))
        print(
            f"probe {entry['name']}: {resolved.get('estimated_prompt_tokens')} prompt tokens, "
            f"context {resolved.get('params', {}).get('max_context_length')}, "
            f"placeholders {'intact' if placeholders else 'MANGLED'}"
        )
    print(f"Probes kept in {out_dir}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

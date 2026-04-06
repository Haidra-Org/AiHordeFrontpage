#!/usr/bin/env python3
"""
One-time setup: post all messages via webhook and record the message IDs.

This replaces the existing manually-posted messages with webhook-owned ones
that can be edited programmatically via PATCH.

Run this ONCE, then commit the resulting discord_data/messages.json.

Usage:
    DISCORD_WEBHOOK_URL=... python initial_post.py [--dry-run]

After running, the old messages should be deleted manually from Discord.
"""

import argparse
import json
import os
import sys
import time
from pathlib import Path

import requests

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
DISCORD_DIR = REPO_ROOT / "discord_data"
MESSAGES_PATH = DISCORD_DIR / "messages.json"

sys.path.insert(0, str(Path(__file__).parent))
from update_messages import compose_all_messages, load_channels, load_item_channel_map

SECTION_ORDER = [
    "legend",
    "image-uis",
    "text-uis",
    "bots",
    "plugins",
    "retired",
    "programs",
    "unofficial",
]
"""Ordered sections matching the Discord channel layout. Only sections with content will be posted."""


def post_message(webhook_url: str, payload: dict) -> str | None:
    """POST a new message via webhook. Returns the message ID."""
    resp = requests.post(
        f"{webhook_url}?wait=true",
        json=payload,
        timeout=30,
    )
    if resp.status_code in (200, 201):
        return resp.json()["id"]
    print(f"  Error {resp.status_code}: {resp.text}", file=sys.stderr)
    return None


def main():
    parser = argparse.ArgumentParser(description="Initial post of all Discord messages")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    webhook_url = os.environ.get("DISCORD_WEBHOOK_URL")
    if not webhook_url and not args.dry_run:
        print(
            "Error: DISCORD_WEBHOOK_URL environment variable is required",
            file=sys.stderr,
        )
        sys.exit(1)

    channels = load_channels()
    item_channel_map = load_item_channel_map()
    messages = compose_all_messages(channels, item_channel_map)

    if args.dry_run:
        print("Dry run — would post these sections in order:")
        for section in SECTION_ORDER:
            payload = messages.get(section)
            if payload:
                print(
                    f"  {section}: {json.dumps(payload, ensure_ascii=False)[:120]}..."
                )
        return

    msg_ids = {}
    for section in SECTION_ORDER:
        payload = messages.get(section)
        if not payload:
            print(f"  Skipping {section}: no payload")
            continue

        print(f"  Posting {section}...", end=" ")
        msg_id = post_message(webhook_url, payload)
        if msg_id:
            msg_ids[section] = msg_id
            print(f"OK (ID: {msg_id})")
        else:
            print("FAILED")

        # Respect rate limits
        time.sleep(1)

    MESSAGES_PATH.write_text(
        json.dumps(msg_ids, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"\nWrote {len(msg_ids)} message IDs to {MESSAGES_PATH}")
    print(
        "Commit this file, then delete the old manually-posted messages from Discord."
    )


if __name__ == "__main__":
    main()

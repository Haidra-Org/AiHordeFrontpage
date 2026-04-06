#!/usr/bin/env python3
"""
Sync Discord guild channels to a local JSON inventory.

Fetches all channels from the configured guild via the Discord API
and writes a name→id mapping to discord_data/channels.json.

Usage:
    DISCORD_BOT_TOKEN=... python sync_channels.py [--guild-id ID]

Environment:
    DISCORD_BOT_TOKEN   Required. Bot token with VIEW_CHANNEL permission.
    DISCORD_GUILD_ID    Optional. Defaults to the AI Horde guild.
"""

import argparse
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

import requests

DISCORD_API = "https://discord.com/api/v10"
DEFAULT_GUILD_ID = "781145214752129095"

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
OUTPUT_PATH = REPO_ROOT / "discord_data" / "channels.json"

CHANNEL_TYPE_NAMES = {
    0: "text",
    2: "voice",
    4: "category",
    5: "announcement",
    10: "announcement_thread",
    11: "public_thread",
    12: "private_thread",
    13: "stage",
    15: "forum",
    16: "media",
}

# Only index these types — no voice/stage/threads
INDEXABLE_TYPES = {0, 5, 15, 16}

SKIPPED_CHANNEL_CATEGORIES = {
    "secret",
    "card game",
    "hypnagonia",
}


def fetch_channels(guild_id: str, bot_token: str) -> list[dict]:
    resp = requests.get(
        f"{DISCORD_API}/guilds/{guild_id}/channels",
        headers={"Authorization": f"Bot {bot_token}"},
        timeout=30,
    )
    resp.raise_for_status()
    return resp.json()


def build_inventory(raw_channels: list[dict]) -> dict[str, dict]:
    categories = {ch["id"]: ch["name"] for ch in raw_channels if ch["type"] == 4}

    channels = {}
    for ch in sorted(raw_channels, key=lambda c: c.get("position", 0)):
        if ch["type"] not in INDEXABLE_TYPES:
            continue

        category = categories.get(ch.get("parent_id"), "").lower()
        if any(skip in category for skip in SKIPPED_CHANNEL_CATEGORIES):
            continue

        channels[ch["name"]] = {
            "id": ch["id"],
            "type": CHANNEL_TYPE_NAMES.get(ch["type"], f"unknown_{ch['type']}"),
            "category": categories.get(ch.get("parent_id")),
        }

    return channels


def main():
    parser = argparse.ArgumentParser(description="Sync Discord channel inventory")
    parser.add_argument(
        "--guild-id",
        default=os.environ.get("DISCORD_GUILD_ID", DEFAULT_GUILD_ID),
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=OUTPUT_PATH,
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print the inventory without writing to disk",
    )
    args = parser.parse_args()

    bot_token = os.environ.get("DISCORD_BOT_TOKEN")
    if not bot_token:
        print(
            "Error: DISCORD_BOT_TOKEN environment variable is required", file=sys.stderr
        )
        sys.exit(1)

    print(f"Fetching channels for guild {args.guild_id}...")
    raw = fetch_channels(args.guild_id, bot_token)
    print(f"  Fetched {len(raw)} raw channels from Discord")

    inventory = build_inventory(raw)
    print(f"  Indexed {len(inventory)} text/announcement/forum channels")

    result = {
        "guild_id": args.guild_id,
        "synced_at": datetime.now(timezone.utc).isoformat(),
        "channel_count": len(inventory),
        "channels": inventory,
    }

    if args.dry_run:
        print(json.dumps(result, indent=2, ensure_ascii=False))
        return

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(
        json.dumps(result, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    print(f"  Wrote channel inventory to {args.output}")


if __name__ == "__main__":
    main()

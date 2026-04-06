#!/usr/bin/env python3
"""
Compose Discord embed messages from the data JSONs and push them via webhook.

Reads:
  - src/assets/data/*.en.json        (the source-of-truth item data)
  - discord_data/channels.json       (friendly-name → channel-id map)
  - discord_data/item_channel_map.json (item-name → channel-name map)
  - discord_data/messages.json        (section → webhook message id)

Writes:
  - PATCHes each webhook message with the composed embeds

Usage:
    DISCORD_WEBHOOK_URL=... python update_messages.py [--dry-run]

Environment:
    DISCORD_WEBHOOK_URL   Required. The webhook URL for the target channel.
"""

import argparse
import json
import os
import re
import sys
from pathlib import Path
from urllib.parse import urlparse

try:
    import requests
except ImportError:
    requests = None  # type: ignore[assignment]

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
DATA_DIR = REPO_ROOT / "src" / "assets" / "data"
DISCORD_DIR = REPO_ROOT / "discord_data"
CHANNELS_PATH = DISCORD_DIR / "channels.json"
ITEM_CHANNEL_MAP_PATH = DISCORD_DIR / "item_channel_map.json"
MESSAGES_PATH = DISCORD_DIR / "messages.json"

# Discord identifiers
GUILD_ID = "781145214752129095"
EFREAK_USER_ID = "215227108916592650"
# Thread not in channels.json, so kept as a constant
UPDATES_THREAD_ID = "1490745191122997398"

PLATFORM_EMOJI = {
    "web": "<:inet:1395164339241222234>",
    "ios": "<:ios:1339337015077900439>",
    "android": "<:android:1339335107265171506>",
    "windows": "🪟",
    "linux": "🐧",
    "macos": "🍎",
}
"""'platform' → emoji mapping for items where the platform is more relevant than function kind.
Custom emojis use the <:name:id> format; unicode emojis are literal."""

FUNCTION_EMOJI = {
    "bot": "🤖",
    "plugin": "🧩",
    "game": "🎮",
}
"""'functionKind' → emoji mapping for items where function kind is a key part of the identity (e.g. bots, plugins, games)."""

# Display labels for the legend embed (order matters)
LEGEND_ORDER = [
    ("android", "Android"),
    ("macos", "MacOS"),
    ("web", "Browser"),
    ("plugin", "Plug-in"),
    ("windows", "Windows"),
    ("ios", "iOS"),
    ("bot", "Chatbot"),
    ("game", "Game"),
]
"""Ordered list of (key, label) pairs for the legend embed. The key is looked up in FUNCTION_EMOJI or 
PLATFORM_EMOJI to show the emoji, and the label is the human-readable text."""

RETIRED_CHANNELS = [
    "krita",
    "blender",
    "sdnext",
    "airis",
    "skaya",
    "flutter-app",
    "a1111-extension",
]
"""Retired channels that should be listed in the Retired Integrations section. These are integrations that are no longer maintained or functional.
If any of these get revived, ping <@{EFREAK_USER_ID}> to update the role and move them out of the retired section."""

RETIRED_BOT_CHANNELS = ["quackertonai"]
"""Retired bot channels. These are listed separately in the Retired Integrations section with a 🤖 
prefix to distinguish them from non-bot integrations."""

SEMI_RETIRED_CHANNEL = "stable-ui"
"""Semi-retired/deprecated channel. Still maintained but deprecated, so listed separately with a warning note in the Retired Integrations section."""


# Multiplatform PC: windows+linux or windows+linux+macos without web/mobile
def get_platform_emojis(item: dict) -> str:
    platforms = set(item.get("platform") or [])
    function_kind = item.get("functionKind", "")

    if function_kind in FUNCTION_EMOJI:
        return FUNCTION_EMOJI[function_kind]

    desktop_platforms = platforms & {"windows", "linux", "macos"}
    has_web = "web" in platforms
    has_mobile = bool(platforms & {"ios", "android"})

    if not has_web and not has_mobile and len(desktop_platforms) >= 2:
        return "💻"

    emojis = []
    for p in ["web", "ios", "android", "windows", "linux", "macos"]:
        if p in platforms and p in PLATFORM_EMOJI:
            emojis.append(PLATFORM_EMOJI[p])

    return "".join(emojis) if emojis else "📱"


def _strip_leading_emoji(name: str) -> str:
    """Strip leading non-ASCII characters (emoji prefixes like 📱🤖🧩🎮) from a channel name."""
    i = 0
    while i < len(name) and not name[i].isascii():
        i += 1
    return name[i:]


def load_channels() -> dict[str, str]:
    """Load channel name → id mapping, with emoji-stripped aliases.

    Discord channels often have emoji prefixes (e.g. "📱artbot").
    This builds a lookup where both "📱artbot" and "artbot" resolve
    to the same channel ID. Exact matches take priority.
    """
    if not CHANNELS_PATH.exists():
        print(
            f"Warning: {CHANNELS_PATH} not found, channel references will be unresolved",
            file=sys.stderr,
        )
        return {}
    data = json.loads(CHANNELS_PATH.read_text(encoding="utf-8"))

    result: dict[str, str] = {}
    # First pass: emoji-stripped aliases (lower priority)
    for name, info in data.get("channels", {}).items():
        stripped = _strip_leading_emoji(name)
        if stripped and stripped != name:
            result[stripped] = info["id"]
    # Second pass: exact names (higher priority, overwrites any collision)
    for name, info in data.get("channels", {}).items():
        result[name] = info["id"]

    return result


def load_item_channel_map() -> dict[str, str]:
    """Load item name → channel friendly-name mapping."""
    if not ITEM_CHANNEL_MAP_PATH.exists():
        return {}
    data = json.loads(ITEM_CHANNEL_MAP_PATH.read_text(encoding="utf-8"))
    return {k: v for k, v in data.items() if not k.startswith("_")}


def channel_ref(channels: dict[str, str], friendly_name: str | None) -> str:
    """Resolve a friendly channel name to a Discord channel mention."""
    if not friendly_name:
        return ""
    channel_id = channels.get(friendly_name)
    if channel_id:
        return f"<#{channel_id}>"
    print(f"  Warning: no channel ID for '{friendly_name}'", file=sys.stderr)
    return f"#{friendly_name}"


def load_data(filename: str) -> list[dict]:
    path = DATA_DIR / filename
    if not path.exists():
        return []
    return json.loads(path.read_text(encoding="utf-8"))


def format_links(item: dict) -> str:
    """Build the link text for an item.

    Uses discordLinks if present (empty array = no links).
    Otherwise auto-generates from link/sourceControlLink.
    In both cases, sourceControlLink is appended automatically
    (labeled by its domain) if not already covered by discordLinks.
    """
    source = item.get("sourceControlLink", "")

    discord_links = item.get("discordLinks")
    if discord_links is not None:
        if not discord_links and not source:
            return ""
        parts = []
        has_strikethrough_first = False
        covered_urls = set()
        for dl in discord_links:
            link_text = f"[{dl['label']}]({dl['url']})"
            if dl.get("strikethrough"):
                link_text = f"~~{link_text}~~"
                if not parts:
                    has_strikethrough_first = True
            parts.append(link_text)
            covered_urls.add(dl["url"])

        # Auto-append sourceControlLink if not already in discordLinks
        if source and source not in covered_urls:
            domain = urlparse(source).hostname or "source"
            domain = domain.removeprefix("www.")
            parts.append(f"[{domain}]({source})")

        if not parts:
            return ""
        if has_strikethrough_first:
            return " ".join(parts)
        return ", ".join(parts)

    parts = []
    link = item.get("link", "")

    if link:
        domain = urlparse(link).hostname or "website"
        domain = domain.removeprefix("www.")
        parts.append(f"[{domain}]({link})")

    if source and source != link:
        domain = urlparse(source).hostname or "source"
        domain = domain.removeprefix("www.")
        parts.append(f"[{domain}]({source})")

    return ", ".join(parts)


def build_item_line(
    item: dict,
    channels: dict[str, str],
    item_channel_map: dict[str, str],
    show_emoji: bool = True,
    show_links: bool = True,
) -> str:
    """Compose a single item line for a Discord embed.

    show_emoji=False for sections where the channel name carries the emoji (bots, plugins, games).
    show_links=False for channel-only lines (plugins, some games).
    """
    parts = []

    if show_emoji:
        emoji = get_platform_emojis(item)
        parts.append(emoji)

    channel_name = item_channel_map.get(item.get("name", ""))
    ch = channel_ref(channels, channel_name)
    if ch:
        parts.append(ch)

    if show_links:
        links = format_links(item)
        note = item.get("discordNote", "")
        if links and note:
            if note.startswith("\n"):
                parts.append(f"{links}{note}")
            else:
                parts.append(f"({links}) {note}")
        elif links:
            parts.append(links)
        elif note:
            parts.append(note)

    return " ".join(parts)


def compose_section_embed(
    title: str,
    items: list[dict],
    channels: dict[str, str],
    item_channel_map: dict[str, str],
    subtitle: str | None = None,
    color: int | None = None,
    timestamp: str | None = None,
    show_emoji: bool = True,
    show_links: bool = True,
    skip_deprecated: bool = True,
) -> dict:
    """Compose a Discord embed for a section."""
    lines = []
    if subtitle:
        lines.append(f"-# {subtitle}")

    filtered = (
        [i for i in items if not i.get("deprecated")] if skip_deprecated else items
    )
    for item in filtered:
        lines.append(
            f"- {build_item_line(item, channels, item_channel_map, show_emoji=show_emoji, show_links=show_links)}"
        )

    embed = {
        "title": title,
        "description": "\n".join(lines),
    }
    if color is not None:
        embed["color"] = color
    if timestamp:
        embed["timestamp"] = timestamp

    return embed


def build_unofficial_line(item: dict) -> str:
    """Compose a line for the unofficial section from structured fields.

    Template: {prefix} {author's} [{label}](<{link}>){, description} {by author} ({source}) {suffix}
    """
    name = item.get("discordLabel") if "discordLabel" in item else item.get("name", "")
    link = item.get("link", "")
    source = item.get("sourceControlLink", "")
    author = item.get("discordAuthor", "")
    author_prefix = item.get("discordAuthorPrefix", False)
    prefix = item.get("discordPrefix", "")
    description = item.get("discordDescription", "")
    suffix = item.get("discordSuffix", "")

    parts = []

    if prefix:
        parts.append(prefix)

    if author and author_prefix:
        parts.append(f"<@{author}>'s")

    if link and name:
        parts.append(f"[{name}](<{link}>)")
    elif link:
        parts.append(f"<{link}>")
    elif name:
        parts.append(name)

    line = " ".join(parts)

    if description:
        line = f"{line}, {description}"

    if author and not author_prefix:
        line = f"{line} by <@{author}>"

    if source and source != link:
        domain = urlparse(source).hostname or "source"
        domain = domain.removeprefix("www.")
        line = f"{line} ([{domain}](<{source}>))"

    if suffix:
        line = f"{line} {suffix}"

    return line


def _unofficial_section(item: dict) -> str | None:
    """Determine which unofficial embed field an item belongs to.

    Returns one of 'horde-tools', 'unofficial-uis', 'non-horde', 'see-also',
    or None if the item doesn't belong in the unofficial section.
    """
    section = item.get("discordSection")
    if section:
        return section
    fk = item.get("functionKind", "")
    if fk in ("utility", "interface"):
        return "horde-tools"
    if fk == "frontend":
        return "unofficial-uis"
    return None


VALID_DISCORD_SECTIONS = {
    "horde-tools",
    "unofficial-uis",
    "non-horde",
    "see-also",
    "programs",
}

# functionKind values that render via build_item_line (needing channel maps)
_OFFICIAL_FUNCTION_KINDS = {"frontend", "bot", "plugin", "cli"}

VALID_FUNCTION_KINDS = {
    "frontend",
    "bot",
    "plugin",
    "cli",
    "worker",
    "sdk",
    "utility",
    "interface",
    "game",
    "informational",
    "resource_collection",
}

VALID_PLATFORMS = {
    "web",
    "ios",
    "android",
    "windows",
    "linux",
    "macos",
    "cli",
    "server",
    "fediverse",
    "programming",
}

_REQUIRED_FIELDS = ("name", "description", "link", "functionKind", "platform")

# Discord API limits
_EMBED_DESC_LIMIT = 4096
_EMBED_FIELD_VALUE_LIMIT = 1024


def validate_data(
    channels: dict[str, str],
    item_channel_map: dict[str, str],
) -> list[str]:
    """Cross-validate data JSONs, item_channel_map, and channels.json.

    Returns a list of warning/error strings. Empty list = all good.
    """
    errors: list[str] = []

    data_files = (
        "image-guis.en.json",
        "text-guis.en.json",
        "tools.en.json",
        "games.en.json",
        "resource.en.json",
    )

    all_items: list[dict] = []
    for filename in data_files:
        items = load_data(filename)
        for item in items:
            item["_source_file"] = filename
        all_items.extend(items)

        # Duplicate names within a file
        names_in_file = [i.get("name", "") for i in items if i.get("name")]
        seen = set()
        for n in names_in_file:
            if n in seen:
                errors.append(f"DUPLICATE: '{n}' appears multiple times in {filename}")
            seen.add(n)

    # --- Per-item schema checks ---
    for item in all_items:
        tag = f"'{item.get('name', '?')}' ({item['_source_file']})"

        # Required fields
        for field in _REQUIRED_FIELDS:
            if not item.get(field):
                errors.append(
                    f"MISSING FIELD: {tag} is missing required field '{field}'"
                )

        # functionKind enum
        fk = item.get("functionKind", "")
        if fk and fk not in VALID_FUNCTION_KINDS:
            errors.append(
                f"BAD FUNCTION_KIND: {tag} has functionKind='{fk}' "
                f"— not in {sorted(VALID_FUNCTION_KINDS)}"
            )

        # platform values
        for p in item.get("platform") or []:
            if p not in VALID_PLATFORMS:
                errors.append(f"BAD PLATFORM: {tag} has unknown platform '{p}'")

        # discordLinks structure
        for dl in item.get("discordLinks") or []:
            if "label" not in dl or "url" not in dl:
                errors.append(
                    f"BAD DISCORD_LINK: {tag} has discordLinks entry missing 'label' or 'url'"
                )

        # discordAuthor snowflake format
        author = item.get("discordAuthor", "")
        if author and not re.fullmatch(r"\d{17,20}", author):
            errors.append(
                f"BAD AUTHOR ID: {tag} discordAuthor='{author}' is not a valid Discord snowflake"
            )

        # discordSection enum
        section = item.get("discordSection")
        if section and section not in VALID_DISCORD_SECTIONS:
            errors.append(
                f"BAD SECTION: {tag} has discordSection='{section}' — not in {VALID_DISCORD_SECTIONS}"
            )

    # --- Cross-file checks ---
    all_names = {item["name"] for item in all_items if "name" in item}
    mapped_names = set(item_channel_map.keys())

    # Items rendered in official sections via build_item_line need channel mappings.
    # Unofficial items use build_unofficial_line and don't need channel mappings.
    # Workers/SDKs are website-only and don't appear in Discord embeds.
    for item in all_items:
        name = item.get("name", "")
        if not name or item.get("deprecated"):
            continue
        section = _unofficial_section(item)
        fk = item.get("functionKind", "")
        source = item.get("_source_file", "")

        if section in ("horde-tools", "unofficial-uis", "non-horde", "see-also"):
            continue

        needs_channel = source in (
            "image-guis.en.json",
            "text-guis.en.json",
            "games.en.json",
        )
        if not needs_channel and (
            fk in _OFFICIAL_FUNCTION_KINDS or section == "programs"
        ):
            needs_channel = True

        if needs_channel and name not in mapped_names:
            errors.append(
                f"MISSING MAP: '{name}' ({source}) has no entry in item_channel_map.json"
            )

    # Orphan entries in item_channel_map
    for name in sorted(mapped_names - all_names):
        errors.append(
            f"ORPHAN MAP: '{name}' is in item_channel_map.json but not in any data JSON"
        )

    # Channel names referenced in item_channel_map that don't exist in channels.json
    for name, ch_name in sorted(item_channel_map.items()):
        if ch_name not in channels:
            errors.append(
                f"BAD CHANNEL: item_channel_map '{name}' → '{ch_name}' not found in channels.json"
            )

    # Retired/semi-retired channel names that don't exist in channels.json
    for ch_name in RETIRED_CHANNELS + RETIRED_BOT_CHANNELS + [SEMI_RETIRED_CHANNEL]:
        if ch_name not in channels:
            errors.append(
                f"BAD CHANNEL: retired channel '{ch_name}' not found in channels.json"
            )

    # --- Compose and check Discord API limits ---
    messages = compose_all_messages(channels, item_channel_map)
    for section, payload in messages.items():
        for i, embed in enumerate(payload.get("embeds", [])):
            desc = embed.get("description", "")
            title = embed.get("title", f"embed #{i}")
            if len(desc) > _EMBED_DESC_LIMIT:
                errors.append(
                    f"EMBED TOO LONG: section '{section}' embed '{title}' "
                    f"description is {len(desc)} chars (limit {_EMBED_DESC_LIMIT})"
                )
            for field in embed.get("fields", []):
                val = field.get("value", "")
                if len(val) > _EMBED_FIELD_VALUE_LIMIT:
                    errors.append(
                        f"FIELD TOO LONG: section '{section}' embed '{title}' "
                        f"field '{field.get('name', '?')}' is {len(val)} chars (limit {_EMBED_FIELD_VALUE_LIMIT})"
                    )

    return errors


def compose_all_messages(
    channels: dict[str, str], item_channel_map: dict[str, str]
) -> dict[str, dict]:
    """
    Compose all Discord messages from the data JSONs.
    Returns a dict of section_key → {content, embeds} payloads.
    """
    image_guis = load_data("image-guis.en.json")
    text_guis = load_data("text-guis.en.json")
    tools = load_data("tools.en.json")
    games = load_data("games.en.json")
    resources = load_data("resource.en.json")

    # Partition tools by functionKind
    bots = [t for t in tools if t.get("functionKind") == "bot"]
    plugins = [
        t
        for t in tools
        if t.get("functionKind") == "plugin" and not t.get("deprecated")
    ]
    cli_tool = [t for t in tools if t.get("functionKind") == "cli"]

    # Programs section: items with discordSection "programs", plus all games
    programs_utilities = [t for t in tools if _unofficial_section(t) == "programs"]

    # Unofficial section: partitioned by discordSection field (with defaults from functionKind)
    horde_tools = [t for t in tools if _unofficial_section(t) == "horde-tools"]
    non_horde_tools = [t for t in tools if _unofficial_section(t) == "non-horde"]
    unofficial_uis = [t for t in tools if _unofficial_section(t) == "unofficial-uis"]

    # Resources partition by discordSection
    see_also = [r for r in resources if r.get("discordSection") == "see-also"]
    non_horde_resources = [
        r for r in resources if r.get("discordSection") == "non-horde"
    ]

    messages = {}

    # === Legend + Worker Management ===
    legend_fields = []
    all_emoji = {**PLATFORM_EMOJI, **FUNCTION_EMOJI}
    for key, label in LEGEND_ORDER:
        legend_fields.append({"name": all_emoji[key], "value": label, "inline": True})
    legend_fields.append({"name": "💻", "value": "Multiplatform PC", "inline": True})

    messages["legend"] = {
        "content": "# Index of AI Horde UIs\n-# Everything with an official channel here on Discord.",
        "embeds": [
            {
                "title": "Legend",
                "color": 2326507,
                "fields": legend_fields,
            },
            {
                "title": "Worker Management",
                "description": channel_ref(channels, "horde-worker-gui"),
            },
        ],
    }

    # === Image UIs ===
    # Includes image GUIs + CLI (channel-only), sorted alphabetically by channel name
    image_items = list(image_guis) + cli_tool
    messages["image-uis"] = {
        "embeds": [
            compose_section_embed(
                "Image UIs",
                image_items,
                channels,
                item_channel_map,
                skip_deprecated=False,
            )
        ],
    }

    # === Text UIs ===
    messages["text-uis"] = {
        "embeds": [
            compose_section_embed("Text UIs", text_guis, channels, item_channel_map)
        ],
    }

    # === Bots ===
    # No emoji prefix — channel names already carry 🤖
    messages["bots"] = {
        "embeds": [
            compose_section_embed(
                "Bots",
                bots,
                channels,
                item_channel_map,
                subtitle="for various platforms",
                show_emoji=False,
            )
        ],
    }

    # === Plugins ===
    # Channel mentions only — channel names carry 🧩
    messages["plugins"] = {
        "embeds": [
            compose_section_embed(
                "Plugins",
                plugins,
                channels,
                item_channel_map,
                subtitle="for interfacing with Horde via other software",
                show_emoji=False,
                show_links=False,
            )
        ],
    }

    # === Retired Integrations ===
    integrations_ch = channel_ref(channels, "horde-integrations")
    retired_lines = [
        "-# These are dead. Some are open source: if you've brought them back to life, "
        f"please ping <@{EFREAK_USER_ID}> in {integrations_ch} to give you the role "
        "and reopen the channel. In the meantime, please note that dead integrations are "
        "*not* supported; you can try asking for help with them but will likely not get any.",
    ]
    for ch_name in RETIRED_CHANNELS:
        retired_lines.append(f"- {channel_ref(channels, ch_name)}")
    for ch_name in RETIRED_BOT_CHANNELS:
        retired_lines.append(f"- 🤖 {channel_ref(channels, ch_name)}")
    semi_ch = channel_ref(channels, SEMI_RETIRED_CHANNEL)
    retired_lines.append(
        f"-# Semi-retired/deprecated: {semi_ch} is being kept in a working state "
        f"by <@{EFREAK_USER_ID}> who does not use it. Broken features will be removed, "
        "but PRs and forks are very welcome."
    )
    messages["retired"] = {
        "embeds": [
            {
                "title": "Retired Integrations",
                "description": "\n".join(retired_lines),
            }
        ],
    }

    # === Programs ===
    # AI Wallpaper Changer + Ealain (with emoji/links) + games (channel only)
    program_lines = ["-# that make use of Horde"]
    for item in programs_utilities:
        program_lines.append(f"- {build_item_line(item, channels, item_channel_map)}")
    for game in games:
        ch_name = item_channel_map.get(game.get("name", ""))
        ch = channel_ref(channels, ch_name)
        program_lines.append(f"- {ch}")
    messages["programs"] = {
        "embeds": [
            {
                "title": "Programs",
                "description": "\n".join(program_lines),
            }
        ],
    }

    # === Unofficial UIs and other tools ===
    unofficial_embeds = []

    # Tools for interacting with Horde
    tool_lines = [f"- {build_unofficial_line(t)}" for t in horde_tools]
    if tool_lines:
        unofficial_embeds.append({
            "title": "Tools for interacting with Horde",
            "description": "\n".join(tool_lines),
        })

    # Unofficial UIs
    ui_lines = [f"- {build_unofficial_line(t)}" for t in unofficial_uis]
    if ui_lines:
        unofficial_embeds.append({
            "title": "Unofficial UIs",
            "description": "\n".join(ui_lines),
        })

    # Useful tools that aren't Horde-specific
    non_horde_lines = []
    for t in non_horde_tools:
        non_horde_lines.append(f"- {build_unofficial_line(t)}")
    for r in non_horde_resources:
        non_horde_lines.append(f"- {build_unofficial_line(r)}")
    if non_horde_lines:
        unofficial_embeds.append({
            "title": "Useful tools that aren't Horde-specific",
            "description": "\n".join(non_horde_lines),
        })

    # See also
    see_also_lines = [f"- {build_unofficial_line(r)}" for r in see_also]
    if see_also_lines:
        unofficial_embeds.append({
            "title": "See also",
            "description": "\n".join(see_also_lines),
        })

    unofficial_embeds.append({
        "title": "Updates",
        "description": "Feel free to suggest updates to the lists above in "
        f"<#{UPDATES_THREAD_ID}>, and I'll add them.",
        "url": f"https://discord.com/channels/{GUILD_ID}/{UPDATES_THREAD_ID}",
        "author": {
            "name": "Efreak",
            "url": f"https://discord.com/users/{EFREAK_USER_ID}",
        },
    })

    messages["unofficial"] = {
        "content": "# Unofficial UIs and other tools\n-# Basically things that don't have a dedicated channel",
        "embeds": unofficial_embeds,
    }

    return messages


def parse_webhook_url(url: str) -> tuple[str, str]:
    """Extract (webhook_id, webhook_token) from a webhook URL."""
    match = re.search(r"/webhooks/(\d+)/([A-Za-z0-9_-]+)", url)
    if not match:
        print("Error: could not parse webhook URL", file=sys.stderr)
        sys.exit(1)
    return match.group(1), match.group(2)


def push_message(
    webhook_id: str, webhook_token: str, message_id: str, payload: dict
) -> bool:
    """PATCH a single webhook message."""
    url = f"https://discord.com/api/v10/webhooks/{webhook_id}/{webhook_token}/messages/{message_id}"
    resp = requests.patch(url, json=payload, timeout=30)
    if resp.status_code == 200:
        return True
    print(f"  Error {resp.status_code}: {resp.text}", file=sys.stderr)
    return False


def main():
    parser = argparse.ArgumentParser(description="Compose and push Discord messages")
    parser.add_argument(
        "--dry-run", action="store_true", help="Print payloads without pushing"
    )
    parser.add_argument(
        "--validate",
        action="store_true",
        help="Run data validation only and exit (no secrets needed)",
    )
    parser.add_argument("--section", help="Only update a specific section")
    args = parser.parse_args()

    channels = load_channels()
    item_channel_map = load_item_channel_map()

    # Cross-validate data files and compose messages
    validation_errors = validate_data(channels, item_channel_map)
    if validation_errors:
        print(
            f"\nData validation found {len(validation_errors)} issue(s):",
            file=sys.stderr,
        )
        for err in validation_errors:
            print(f"  ⚠ {err}", file=sys.stderr)
        if args.validate or not args.dry_run:
            sys.exit(1)
        print()  # blank line before dry-run output
    elif args.validate:
        print("Data validation passed — no issues found.")
        return

    messages = compose_all_messages(channels, item_channel_map)

    # Load message ID mapping
    if not MESSAGES_PATH.exists():
        print(
            f"Error: {MESSAGES_PATH} not found. Run initial setup first.",
            file=sys.stderr,
        )
        sys.exit(1)

    msg_map = json.loads(MESSAGES_PATH.read_text(encoding="utf-8"))

    if args.dry_run:
        for section, payload in messages.items():
            if args.section and section != args.section:
                continue
            msg_id = msg_map.get(section, "(no message ID)")
            print(f"\n{'=' * 60}")
            print(f"Section: {section}  →  Message ID: {msg_id}")
            print(json.dumps(payload, indent=2, ensure_ascii=False))
        return

    webhook_url = os.environ.get("DISCORD_WEBHOOK_URL")
    if not webhook_url:
        print(
            "Error: DISCORD_WEBHOOK_URL environment variable is required",
            file=sys.stderr,
        )
        sys.exit(1)

    if requests is None:
        print(
            "Error: 'requests' package is required for pushing. Install with: pip install requests",
            file=sys.stderr,
        )
        sys.exit(1)

    webhook_id, webhook_token = parse_webhook_url(webhook_url)

    success = 0
    failed = 0
    for section, payload in messages.items():
        if args.section and section != args.section:
            continue

        msg_id = msg_map.get(section)
        if not msg_id:
            print(f"  Skipping {section}: no message ID in messages.json")
            failed += 1
            continue

        print(f"  Updating {section} (message {msg_id})...", end=" ")
        if push_message(webhook_id, webhook_token, msg_id, payload):
            print("OK")
            success += 1
        else:
            failed += 1

    print(f"\nDone: {success} updated, {failed} failed")
    if failed:
        sys.exit(1)


if __name__ == "__main__":
    main()

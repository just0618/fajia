#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path


def now():
    return datetime.now(timezone.utc).isoformat()


def clean(v):
    return str(v or "").strip()


def parse_shard_arg(raw):
    if "=" not in raw:
        raise SystemExit(
            f"invalid --shard {raw!r}; expected GROUP_ID=/path/to/index.json"
        )

    gid, path = raw.split("=", 1)
    gid = gid.strip()
    p = Path(path).expanduser().resolve()

    if not gid:
        raise SystemExit(f"empty group id in --shard {raw!r}")

    if not p.exists():
        raise SystemExit(f"shard not found: {p}")

    return gid, p


def main():
    ap = argparse.ArgumentParser()

    ap.add_argument(
        "--shard",
        action="append",
        required=True,
        help="repeatable: GROUP_ID=/path/to/member_activity_index.json",
    )

    ap.add_argument(
        "--output",
        default=(
            "/opt/fajia/runtime/douban_member_sync_v1/"
            "member_activity_directory.json"
        ),
    )

    args = ap.parse_args()

    identities = {}
    groups = {}

    stats = {
        "shards": 0,
        "identities": 0,
        "member_links": 0,
        "historical_links": 0,
        "profile_key_aliases": 0,
        "skipped_without_uid": 0,
    }

    for raw in args.shard:
        group_id, path = parse_shard_arg(raw)

        data = json.loads(path.read_text(encoding="utf-8"))

        actual_gid = clean((data.get("group") or {}).get("id"))
        if actual_gid != group_id:
            raise SystemExit(
                f"group mismatch: arg={group_id} "
                f"file={actual_gid or '<empty>'} path={path}"
            )

        group_name = clean((data.get("group") or {}).get("name")) or group_id

        groups[group_id] = {
            "id": group_id,
            "name": group_name,
            "generated_at": clean(data.get("generated_at")),
        }

        stats["shards"] += 1

        for section, bucket_name in (
            ("members", "member"),
            ("historical_identities", "historical_identity"),
        ):
            bucket = data.get(section) or {}

            if not isinstance(bucket, dict):
                raise SystemExit(
                    f"{path}: {section} must be an object"
                )

            for raw_key, rec in bucket.items():
                if not isinstance(rec, dict):
                    continue

                uid = clean(rec.get("author_uid"))

                if not uid:
                    stats["skipped_without_uid"] += 1
                    continue

                profile_key = clean(rec.get("profile_key"))
                display_name = (
                    clean(rec.get("display_name"))
                    or clean(rec.get("canonical_name"))
                )
                profile_url = (
                    clean(rec.get("profile_url"))
                    or clean(rec.get("canonical_profile_url"))
                )

                if uid not in identities:
                    identities[uid] = {
                        "author_uid": uid,
                        "display_name": display_name,
                        "profile_url": profile_url,
                        "profile_keys": set(),
                        "groups": {},
                    }

                x = identities[uid]

                if display_name:
                    x["display_name"] = display_name

                if profile_url:
                    x["profile_url"] = profile_url

                if profile_key:
                    x["profile_keys"].add(profile_key)

                existing = x["groups"].get(group_id)

                link = {
                    "bucket": bucket_name,
                    "key": clean(raw_key),
                }

                if existing and existing != link:
                    raise SystemExit(
                        f"identity/group collision: "
                        f"uid={uid} group={group_id} "
                        f"old={existing} new={link}"
                    )

                x["groups"][group_id] = link

                if bucket_name == "member":
                    stats["member_links"] += 1
                else:
                    stats["historical_links"] += 1

    out_identities = {}

    for uid in sorted(
        identities,
        key=lambda x: int(x) if x.isdigit() else x
    ):
        x = identities[uid]

        profile_keys = sorted(x["profile_keys"])
        group_links = {
            gid: x["groups"][gid]
            for gid in sorted(x["groups"])
        }

        out_identities[uid] = {
            "author_uid": uid,
            "display_name": x["display_name"],
            "profile_url": x["profile_url"],
            "profile_keys": profile_keys,
            "groups": group_links,
        }

        stats["profile_key_aliases"] += len(profile_keys)

    stats["identities"] = len(out_identities)

    result = {
        "schema_version": 1,
        "generated_at": now(),
        "groups": {
            gid: groups[gid]
            for gid in sorted(groups)
        },
        "stats": stats,
        "identities": out_identities,
    }

    out = Path(args.output).expanduser().resolve()
    out.parent.mkdir(parents=True, exist_ok=True)

    out.write_text(
        json.dumps(
            result,
            ensure_ascii=False,
            separators=(",", ":"),
        ),
        encoding="utf-8",
    )

    print(
        json.dumps(
            {
                "ok": True,
                "schema_version": 1,
                "output": str(out),
                "output_bytes": out.stat().st_size,
                "output_kib": round(out.stat().st_size / 1024, 2),
                **stats,
                "groups": list(result["groups"]),
            },
            ensure_ascii=False,
            indent=2,
        )
    )


if __name__ == "__main__":
    main()

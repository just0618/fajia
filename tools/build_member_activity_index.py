#!/usr/bin/env python3
from __future__ import annotations
import argparse, csv, json, sqlite3
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

DEFAULT_MEMBER_INDEX = Path("/opt/fajia/runtime/douban_member_sync_v1/member_index.json")
DEFAULT_HISTORY_CSV = Path("/opt/fajia/runtime/douban_author_comments_enriched_v0_1.csv")
DEFAULT_MASTER_DB = Path("/opt/fajia/app/fajia_master_timeline_v1.sqlite")
DEFAULT_OUTPUT = Path("/opt/fajia/runtime/douban_member_sync_v1/member_activity_index.json")

GROUP_ID = "761299"
GROUP_NAME = "法述进修学院（旧组）"

def now_iso():
    return datetime.now(timezone.utc).isoformat()

def clean_text(value, limit=500):
    s = str(value or "").strip()
    return s if len(s) <= limit else s[:limit] + "…"

def source_label(source_key):
    s = str(source_key or "")
    if s.startswith("DB_CHAT_"):
        rest = s[len("DB_CHAT_"):]
        parts = rest.rsplit("_", 1)
        if parts and parts[0].isdigit():
            return f"{parts[0]}.0闲聊楼"
    return s or "豆瓣闲聊楼"

def load_tracked(path):
    d = json.loads(path.read_text(encoding="utf-8"))
    out = {}
    for m in d.get("members", []):
        pk = str(m.get("profile_key") or "").strip()
        if pk:
            out[pk] = {
                "display_name": str(m.get("display_name") or ""),
                "profile_url": str(m.get("profile_url") or ""),
            }
    return out

def add_activity(bucket, row, origin):
    uid = str(row.get("author_platform_id") or "").strip()
    item_id = str(row.get("item_id") or "").strip()
    if not uid or not item_id:
        return False
    bucket[uid][item_id] = {
        "item_id": item_id,
        "group_id": GROUP_ID,
        "source_key": str(row.get("source_key") or ""),
        "source_label": source_label(row.get("source_key")),
        "source_type": str(row.get("source_type") or ""),
        "published_at": str(row.get("published_at") or ""),
        "text": clean_text(row.get("text_raw") or row.get("text_clean"), 500),
        "source_url": str(row.get("source_url") or ""),
        "reply_to_item_id": str(row.get("reply_to_item_id") or ""),
        "origin": origin,
    }
    return True

def load_history_csv(path, tracked, bucket):
    stats = {"rows": 0, "identified": 0, "tracked": 0}
    with path.open(encoding="utf-8-sig", newline="") as f:
        for row in csv.DictReader(f):
            stats["rows"] += 1
            uid = str(row.get("author_platform_id") or "").strip()
            if not uid:
                continue
            stats["identified"] += 1
            if uid in tracked and add_activity(bucket, row, "historical_backfill"):
                stats["tracked"] += 1
    return stats

def latest_identities(con):
    sql = '''
    SELECT item_id, source_key, source_id, author_hash,
           author_platform_id, author_display_name, profile_url,
           comment_published_at, identity_observed_at
    FROM douban_author_identity_observations
    WHERE COALESCE(author_platform_id,'') <> ''
    ORDER BY identity_observed_at ASC
    '''
    latest = {}
    for r in con.execute(sql):
        latest[str(r["item_id"])] = dict(r)
    return latest

def load_live_db(path, tracked, bucket):
    stats = {"identity_rows": 0, "tracked_identity_items": 0, "joined_items": 0}
    con = sqlite3.connect(f"file:{path}?mode=ro", uri=True)
    con.row_factory = sqlite3.Row
    try:
        identities = latest_identities(con)
        stats["identity_rows"] = len(identities)
        ids = [
            item_id for item_id, ident in identities.items()
            if str(ident.get("author_platform_id") or "").strip() in tracked
        ]
        stats["tracked_identity_items"] = len(ids)

        for start in range(0, len(ids), 500):
            chunk = ids[start:start + 500]
            if not chunk:
                continue
            qs = ",".join("?" for _ in chunk)
            sql = f'''
            SELECT item_id, source_key, source_type, published_at,
                   text_raw, text_clean, source_url, reply_to_item_id,
                   deleted_seen_at
            FROM content_items
            WHERE item_id IN ({qs})
              AND platform='douban'
              AND source_layer='douban_chat'
            '''
            for r in con.execute(sql, chunk):
                row = dict(r)
                if str(row.get("deleted_seen_at") or "").strip():
                    continue
                ident = identities.get(str(row["item_id"]))
                if not ident:
                    continue
                row["author_platform_id"] = ident.get("author_platform_id")
                if add_activity(bucket, row, "live_identity"):
                    stats["joined_items"] += 1
    finally:
        con.close()
    return stats

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--member-index", default=str(DEFAULT_MEMBER_INDEX))
    ap.add_argument("--history-csv", default=str(DEFAULT_HISTORY_CSV))
    ap.add_argument("--master-db", default=str(DEFAULT_MASTER_DB))
    ap.add_argument("--output", default=str(DEFAULT_OUTPUT))
    ap.add_argument("--keep-per-member", type=int, default=20)
    args = ap.parse_args()

    member_index = Path(args.member_index)
    history_csv = Path(args.history_csv)
    master_db = Path(args.master_db)
    output = Path(args.output)

    for p in (member_index, history_csv, master_db):
        if not p.exists():
            raise SystemExit(f"missing input: {p}")

    tracked = load_tracked(member_index)
    bucket = defaultdict(dict)
    hist_stats = load_history_csv(history_csv, tracked, bucket)
    live_stats = load_live_db(master_db, tracked, bucket)

    members = {}
    total_activity = 0
    keep = max(1, args.keep_per_member)

    for profile_key, by_item in bucket.items():
        rows = list(by_item.values())
        rows.sort(
            key=lambda x: (str(x.get("published_at") or ""), str(x.get("item_id") or "")),
            reverse=True,
        )
        total_count = len(rows)
        total_activity += total_count
        recent = rows[:keep]
        members[profile_key] = {
            "profile_key": profile_key,
            "display_name": tracked.get(profile_key, {}).get("display_name", ""),
            "profile_url": tracked.get(profile_key, {}).get("profile_url", ""),
            "total_count": total_count,
            "latest_at": recent[0].get("published_at") if recent else None,
            "recent": recent,
        }

    result = {
        "schema_version": 1,
        "generated_at": now_iso(),
        "group": {"id": GROUP_ID, "name": GROUP_NAME},
        "policy": {
            "tracked_profiles_only": True,
            "recent_items_per_member": keep,
            "text_max_chars": 500,
            "ip_location_uploaded": False,
        },
        "stats": {
            "tracked_profiles": len(tracked),
            "profiles_with_activity": len(members),
            "total_deduplicated_activity": total_activity,
            "history": hist_stats,
            "live": live_stats,
        },
        "members": members,
    }

    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(
        json.dumps(result, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )
    print(json.dumps({
        "ok": True,
        "output": str(output),
        "tracked_profiles": len(tracked),
        "profiles_with_activity": len(members),
        "total_deduplicated_activity": total_activity,
        "history_rows": hist_stats["rows"],
        "history_identified": hist_stats["identified"],
        "history_tracked": hist_stats["tracked"],
        "live_identity_rows": live_stats["identity_rows"],
        "live_joined_items": live_stats["joined_items"],
        "keep_per_member": keep,
    }, ensure_ascii=False, indent=2))

if __name__ == "__main__":
    main()

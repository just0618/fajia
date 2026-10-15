#!/usr/bin/env python3

import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path


URL = os.environ.get(
    "MEMBER_ACTIVITY_DIRECTORY_UPLOAD_URL",
    "https://fajia.online/api/member-activity-directory-upload",
)


if len(sys.argv) != 2:
    raise SystemExit(
        "usage: upload_member_activity_directory.py "
        "/path/to/member_activity_directory.json"
    )


token = os.environ.get("MEMBER_INDEX_UPLOAD_TOKEN", "")

if not token:
    raise SystemExit("MEMBER_INDEX_UPLOAD_TOKEN is not set")


directory = json.loads(
    Path(sys.argv[1]).read_text(encoding="utf-8")
)


payload = json.dumps(
    {
        "token": token,
        "directory": directory,
    },
    ensure_ascii=False,
    separators=(",", ":"),
).encode("utf-8")


req = urllib.request.Request(
    URL,
    data=payload,
    headers={"Content-Type": "application/json"},
    method="POST",
)


try:
    with urllib.request.urlopen(req, timeout=60) as resp:
        print(resp.read().decode("utf-8"))

except urllib.error.HTTPError as e:
    print(
        e.read().decode("utf-8", errors="replace"),
        file=sys.stderr,
    )
    raise

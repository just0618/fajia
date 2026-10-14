#!/usr/bin/env python3
"""
Upload a prepared member index JSON to fajia.online.

Usage:
  MEMBER_INDEX_UPLOAD_TOKEN='your-token' \
  python tools/upload_member_index.py member_index.json

Optional:
  MEMBER_INDEX_API='https://fajia.online/api/member-index-upload'
"""
import json
import os
import sys
import urllib.request
import urllib.error

if len(sys.argv) != 2:
    raise SystemExit("Usage: python upload_member_index.py member_index.json")

token = os.environ.get("MEMBER_INDEX_UPLOAD_TOKEN", "")
if not token:
    raise SystemExit("Missing MEMBER_INDEX_UPLOAD_TOKEN")

api = os.environ.get(
    "MEMBER_INDEX_API",
    "https://fajia.online/api/member-index-upload"
)

with open(sys.argv[1], "r", encoding="utf-8") as f:
    index = json.load(f)

payload = json.dumps(
    {"token": token, "index": index},
    ensure_ascii=False
).encode("utf-8")

req = urllib.request.Request(
    api,
    data=payload,
    headers={"Content-Type": "application/json"},
    method="POST",
)

try:
    with urllib.request.urlopen(req, timeout=30) as resp:
        print(resp.read().decode("utf-8"))
except urllib.error.HTTPError as e:
    print(e.read().decode("utf-8"), file=sys.stderr)
    raise

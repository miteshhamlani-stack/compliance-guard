#!/usr/bin/env python3
"""Refresh ruleset dating and snapshot metadata for configured official sources.

This script records source-page metadata only. It deliberately does not infer
legal rule changes from page contents; changes to terms/citations need review.
"""

from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlparse
from urllib.request import HTTPRedirectHandler, Request, build_opener


ROOT = Path(__file__).resolve().parents[1]
RULES_PATH = ROOT / "public" / "rules.json"
ALLOWED_HOSTS = {
    "sebi.gov.in",
    "www.sebi.gov.in",
    "amfiindia.com",
    "www.amfiindia.com",
}


class NoRedirectHandler(HTTPRedirectHandler):
    def redirect_request(self, request, response, code, message, headers, new_url):
        return None


def validate_rules(data: object) -> dict:
    if not isinstance(data, dict):
        raise ValueError("rules.json must contain a JSON object")
    for field in ("version", "lastUpdated", "prohibitedTerms", "superlatives", "mandatoryDisclaimers", "citations", "metadataSources"):
        if field not in data:
            raise ValueError(f"rules.json is missing required field: {field}")
    if not isinstance(data["metadataSources"], list):
        raise ValueError("metadataSources must be an array")
    return data


def inspect_source(source: dict) -> dict:
    authority = source.get("authority")
    url = source.get("url")
    if not isinstance(authority, str) or not isinstance(url, str):
        raise ValueError("each metadata source requires string authority and url values")

    parsed = urlparse(url)
    if parsed.scheme != "https" or parsed.hostname not in ALLOWED_HOSTS:
        raise ValueError(f"refusing non-approved regulatory source URL: {url}")

    request = Request(
        url,
        headers={
            "User-Agent": "ComplianceGuard-Rules-Metadata/1.0",
            "Accept": "text/html,application/json,application/xml,text/xml,*/*",
        },
    )
    opener = build_opener(NoRedirectHandler())
    with opener.open(request, timeout=15) as response:
        response.read(1)
        last_modified = response.headers.get("Last-Modified")
        if last_modified:
            try:
                last_modified = parsedate_to_datetime(last_modified).astimezone(
                    timezone.utc
                ).isoformat()
            except (TypeError, ValueError, OverflowError):
                pass
        return {
            "authority": authority,
            "url": url,
            "etag": response.headers.get("ETag"),
            "lastModified": last_modified,
        }


def main() -> int:
    try:
        data = validate_rules(json.loads(RULES_PATH.read_text(encoding="utf-8")))
    except (OSError, json.JSONDecodeError, ValueError) as error:
        print(f"Unable to load rules file: {error}", file=sys.stderr)
        return 1

    now = datetime.now(timezone.utc)
    data["version"] = f"v{now:%Y.%m}"
    data["lastUpdated"] = now.strftime("%B %Y")

    previous_snapshots = {
        snapshot.get("url"): snapshot
        for snapshot in data.get("sourceSnapshots", [])
        if isinstance(snapshot, dict) and isinstance(snapshot.get("url"), str)
    }
    source_snapshots = []
    for source in data["metadataSources"]:
        try:
            snapshot = inspect_source(source)
            source_snapshots.append(snapshot)
            print(f"Inspected {snapshot['authority']} metadata: {snapshot['url']}")
        except (HTTPError, URLError, TimeoutError, OSError, ValueError) as error:
            print(
                f"Warning: could not inspect {source.get('authority', 'source')} metadata: {error}",
                file=sys.stderr,
            )
            previous_snapshot = previous_snapshots.get(source.get("url"))
            if previous_snapshot:
                source_snapshots.append(previous_snapshot)

    data["sourceSnapshots"] = source_snapshots
    RULES_PATH.write_text(
        json.dumps(data, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(
        "Updated ruleset metadata. HTTP source metadata does not automatically "
        "interpret or amend legal rules."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

#!/usr/bin/env python3
"""Pull visitor cities from Google Analytics 4 and write assets/v2/visitors.json.

Run by .github/workflows/visitors.yml once a day.

Env:
  GA_PROPERTY_ID                  numeric GA4 property id (Admin > Property details)
  GOOGLE_APPLICATION_CREDENTIALS  path to a service-account JSON key that has
                                  Viewer access on the GA4 property

GA4 reports city names, not coordinates, so cities are geocoded offline
against the GeoNames cities1000 dataset (CC BY 4.0, geonames.org).
"""
from __future__ import annotations

import csv
import io
import json
import os
import sys
import unicodedata
import urllib.request
import zipfile
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "assets" / "v2" / "visitors.json"
GEONAMES_URL = "https://download.geonames.org/export/dump/cities1000.zip"
GEONAMES_CACHE = Path(os.environ.get("GEONAMES_CACHE", "/tmp/cities1000.txt"))
ADMIN1_URL = "https://download.geonames.org/export/dump/admin1CodesASCII.txt"
ADMIN1_CACHE = GEONAMES_CACHE.with_name("admin1CodesASCII.txt")
START_DATE = "2015-08-14"  # earliest date the GA4 Data API accepts

# Traffic from these places is overwhelmingly crawlers / cloud servers, not people.
# (country, region or None for any region, city)
EXCLUDE = {
    # cloud data-center towns
    ("US", "Iowa", "Council Bluffs"),     # Google
    ("US", "Virginia", "Ashburn"),        # AWS / "Data Center Alley"
    ("US", "Oregon", "Boardman"),         # AWS
    ("US", "Oregon", "The Dalles"),       # Google
    ("US", "Oregon", "Prineville"),       # Meta / Apple
    ("US", "Washington", "Quincy"),       # Microsoft / Yahoo
    ("US", "South Carolina", "Moncks Corner"),  # Google
    ("US", "North Carolina", "Lenoir"),   # Google
    ("US", "North Carolina", "Forest City"),    # Meta
    ("US", "Iowa", "Altoona"),            # Meta
    ("US", "Nebraska", "Papillion"),      # Meta
    ("US", "Oklahoma", "Pryor"),          # Google
    # crawler-dominated spikes seen in this site's analytics
    ("SG", None, "Singapore"),
    ("CN", "Gansu", "Lanzhou"),
}


def excluded(cc: str, region: str, city: str) -> bool:
    c, r = norm(city), norm(region)
    return any(cc == ecc and c == norm(ecity) and (er is None or r == norm(er))
               for ecc, er, ecity in EXCLUDE)


def norm(s: str) -> str:
    s = unicodedata.normalize("NFKD", s)
    s = "".join(c for c in s if not unicodedata.combining(c))
    return " ".join(s.lower().replace("-", " ").replace("'", "").split())


def load_geonames() -> tuple[dict, dict, dict]:
    """Return (regional, primary, alternate) lookups.

    regional is keyed by (country_code, normalized_region, normalized_name) so that
    e.g. Princeton, New Jersey is not confused with Princeton, Florida; the other
    two are keyed by (country_code, normalized_name) as a fallback.
    """
    if not GEONAMES_CACHE.exists():
        print(f"downloading {GEONAMES_URL}", file=sys.stderr)
        with urllib.request.urlopen(GEONAMES_URL, timeout=120) as r:
            data = r.read()
        with zipfile.ZipFile(io.BytesIO(data)) as z:
            GEONAMES_CACHE.write_bytes(z.read("cities1000.txt"))
    if not ADMIN1_CACHE.exists():
        print(f"downloading {ADMIN1_URL}", file=sys.stderr)
        with urllib.request.urlopen(ADMIN1_URL, timeout=120) as r:
            ADMIN1_CACHE.write_bytes(r.read())

    admin1: dict[str, tuple[str, str]] = {}  # "US.NJ" -> (name, ascii name)
    with ADMIN1_CACHE.open(encoding="utf-8") as f:
        for row in csv.reader(f, delimiter="\t", quoting=csv.QUOTE_NONE):
            admin1[row[0]] = (row[1], row[2])

    regional: dict[tuple[str, str, str], tuple[int, float, float]] = {}
    primary: dict[tuple[str, str], tuple[int, float, float]] = {}
    alternate: dict[tuple[str, str], tuple[int, float, float]] = {}

    def put(d, key, val):
        if key not in d or val[0] > d[key][0]:  # keep the most populous match
            d[key] = val

    with GEONAMES_CACHE.open(encoding="utf-8") as f:
        for row in csv.reader(f, delimiter="\t", quoting=csv.QUOTE_NONE):
            name, ascii_name, alts = row[1], row[2], row[3]
            lat, lng, cc = float(row[4]), float(row[5]), row[8]
            pop = int(row[14] or 0)
            val = (pop, lat, lng)
            put(primary, (cc, norm(name)), val)
            put(primary, (cc, norm(ascii_name)), val)
            for region in {norm(r) for r in admin1.get(f"{cc}.{row[10]}", ())}:
                for n in {norm(name), norm(ascii_name)}:
                    put(regional, (cc, region, n), val)
            for a in alts.split(",") if alts else ():
                put(alternate, (cc, norm(a)), val)
    return regional, primary, alternate


def fetch_ga(property_id: str) -> tuple[list[tuple[str, str, str, str, int]], int]:
    from google.analytics.data_v1beta import BetaAnalyticsDataClient
    from google.analytics.data_v1beta.types import (
        DateRange, Dimension, Metric, RunReportRequest,
    )

    client = BetaAnalyticsDataClient()
    prop = f"properties/{property_id}"
    rng = [DateRange(start_date=START_DATE, end_date="today")]

    rows, offset = [], 0
    while True:
        resp = client.run_report(RunReportRequest(
            property=prop,
            dimensions=[Dimension(name="city"), Dimension(name="region"),
                        Dimension(name="countryId"), Dimension(name="country")],
            metrics=[Metric(name="totalUsers")],
            date_ranges=rng, limit=10000, offset=offset,
        ))
        for r in resp.rows:
            city, region, cc, country = (v.value for v in r.dimension_values)
            rows.append((city, region, cc, country, int(r.metric_values[0].value)))
        offset += len(resp.rows)
        if not resp.rows or offset >= resp.row_count:
            break

    total = client.run_report(RunReportRequest(
        property=prop, metrics=[Metric(name="totalUsers")], date_ranges=rng,
    ))
    total_users = int(total.rows[0].metric_values[0].value) if total.rows else 0
    return rows, total_users


def build(rows, total_users, regional, primary, alternate) -> dict:
    merged: dict[tuple[float, float], dict] = {}
    countries, unmatched, dropped = set(), [], 0
    for city, region, cc, country, users in rows:
        if excluded(cc, region, city):
            dropped += users
            continue
        if cc and cc != "(not set)":
            countries.add(cc)
        if not city or city == "(not set)" or not cc or cc == "(not set)":
            continue
        hit = (regional.get((cc, norm(region), norm(city)))
               or primary.get((cc, norm(city)))
               or alternate.get((cc, norm(city))))
        if not hit:
            unmatched.append(f"{city}, {cc}")
            continue
        _, lat, lng = hit
        key = (round(lat, 2), round(lng, 2))
        p = merged.setdefault(key, {"city": city, "country": country, "lat": key[0], "lng": key[1], "users": 0})
        p["users"] += users

    if dropped:
        print(f"excluded {dropped} users from crawler / data-center locations", file=sys.stderr)
    if unmatched:
        print(f"{len(unmatched)} unmatched cities: {', '.join(unmatched[:40])}", file=sys.stderr)

    points = sorted(merged.values(), key=lambda p: (-p["users"], p["city"]))
    return {
        "visitors": max(total_users - dropped, sum(p["users"] for p in points)),
        "cities": len(points),
        "countries": len(countries),
        "points": points,
    }


def main() -> None:
    property_id = os.environ.get("GA_PROPERTY_ID", "").strip()
    if not property_id:
        sys.exit("GA_PROPERTY_ID is not set")

    regional, primary, alternate = load_geonames()
    rows, total = fetch_ga(property_id)
    data = build(rows, total, regional, primary, alternate)

    old = json.loads(OUT.read_text()) if OUT.exists() else {}
    if {k: v for k, v in old.items() if k != "updated"} == data:
        print("no change")
        return
    OUT.write_text(json.dumps({"updated": date.today().isoformat(), **data}, ensure_ascii=False, indent=1) + "\n")
    print(f"wrote {OUT.relative_to(ROOT)}: {data['visitors']} visitors, {data['cities']} cities, {data['countries']} countries")


if __name__ == "__main__":
    main()

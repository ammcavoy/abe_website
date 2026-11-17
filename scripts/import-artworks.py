#!/usr/bin/env python3
"""One-off importer: turn the artwork JPEGs in the repo root into tab data files.

Filename pattern: "<Title> <W>_x<H>_ <medium> <year>, <series> series.jpeg"
Run from the repo root once:  python3 -I scripts/import-artworks.py

It moves each image to <tab>/<id>.jpeg (git mv) and writes <tab>/<tab>.json.
Values published on abeweston.com (2026-11-16) override the filename where they differ.
"""
import json
import os
import re
import subprocess
import sys
import unicodedata

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PATTERN = re.compile(
    r"^(?P<title>.+?) (?P<w>\d+)_x(?P<h>\d+)_ (?P<medium>.+?) (?P<year>\d{4}), (?P<series>\w+) series\.(?P<ext>jpe?g|png)$",
    re.IGNORECASE,
)
SERIES_TO_TAB = {"techno": "techno", "sailboat": "sailing", "portrait": "portraits"}

# Overrides keyed by filename title, from the live site's artwork pages.
OVERRIDES = {
    "Floweboy": {"title": "Flower Boy"},
    "Electric sheep": {"title": "Electric Sheep", "height": 22, "sold": True},
    "Life support": {"title": "Life Support"},
    "Look into the light": {"title": "Look Into The Light"},
    "Oil change": {"title": "Oil Change", "medium": "Oil and duct tape on paper"},
    "Wisdom of the crowds": {"title": "Wisdom of the Crowds"},
    "Scow season": {"title": "Scow Season", "sold": True},
    "Ensign": {"year": 2026, "medium": "Oil on recycled sail", "sold": True},
    "J88": {"sold": True},
    "Lightning fast": {"title": "Lightning Fast", "sold": True},
    "Mirage": {"sold": True},
    "Kaua'i 'ō'ō bird song": {"title": "Kaua'i 'ō'ō Bird Song"},
}


def slugify(text):
    text = unicodedata.normalize("NFKD", text)
    text = "".join(c for c in text if not unicodedata.combining(c))
    text = text.lower().replace("'", "").replace("’", "")
    text = re.sub(r"[^a-z0-9]+", "-", text).strip("-")
    return text


def main():
    os.chdir(ROOT)
    entries = {tab: [] for tab in SERIES_TO_TAB.values()}
    for name in sorted(os.listdir(ROOT)):
        m = PATTERN.match(name)
        if not m:
            continue
        g = m.groupdict()
        tab = SERIES_TO_TAB[g["series"].lower()]
        override = OVERRIDES.get(g["title"], {})
        title = override.get("title", g["title"])
        item_id = slugify(title)
        ext = g["ext"].lower()
        dest = f"{tab}/{item_id}.{ext}"
        medium = override.get("medium", g["medium"][:1].upper() + g["medium"][1:])

        os.makedirs(tab, exist_ok=True)
        subprocess.run(["git", "mv", name, dest], check=True)

        entries[tab].append({
            "id": item_id,
            "title": title,
            "year": override.get("year", int(g["year"])),
            "date": "",
            "dimensions": {
                "width": override.get("width", int(g["w"])),
                "height": override.get("height", int(g["h"])),
                "unit": "in",
            },
            "medium": medium,
            "sold": override.get("sold", False),
            "price": "",
            "description": "",
            "image": dest,
        })

    for tab, items in entries.items():
        items.sort(key=lambda e: (-e["year"], e["title"].lower()))
        path = f"{tab}/{tab}.json"
        with open(path, "w", encoding="utf-8") as f:
            json.dump({"entries": items}, f, indent=2, ensure_ascii=False)
            f.write("\n")
        print(f"{path}: {len(items)} entries")
        for e in items:
            if not os.path.exists(e["image"]):
                print(f"  MISSING {e['image']}", file=sys.stderr)


if __name__ == "__main__":
    main()

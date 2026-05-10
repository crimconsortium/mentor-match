#!/usr/bin/env python3
"""Build faculty.js for the Mentor Match site from the explorer's data.json.

Mirrors the explorer's taxonomy (keywords, title categories, consortium flag)
and adds geographic metadata (state, US region, country) per institution so the
quiz can weight location preferences.
"""

import json
import re
import urllib.request
from pathlib import Path

EXPLORER_DATA_URL = "https://raw.githubusercontent.com/crimconsortium/criminology-faculty-explorer/main/data.json"
OUT = Path(__file__).parent / "faculty.js"

# --------------------------------------------------------------------------
# Institution -> {state (US only), region, country}
# US regions follow Census Bureau divisions, condensed to four standard regions:
#   Northeast, Midwest, South, West.
# Non-US institutions get country only and region = "International".
# --------------------------------------------------------------------------
INSTITUTIONS = {
    "American University":                    ("DC", "Northeast", "United States"),
    "Arizona State University":               ("AZ", "West", "United States"),
    "CUNY--John Jay College of Criminal Justice": ("NY", "Northeast", "United States"),
    "Erasmus University Rotterdam":           (None, "International", "Netherlands"),
    "Florida International University":       ("FL", "South", "United States"),
    "Florida State University":               ("FL", "South", "United States"),
    "George Mason University":                ("VA", "South", "United States"),
    "Georgia State University":               ("GA", "South", "United States"),
    "Ghent University":                       (None, "International", "Belgium"),
    "Indiana University Bloomington":         ("IN", "Midwest", "United States"),
    "Indiana University of Pennsylvania":     ("PA", "Northeast", "United States"),
    "Max Planck Institute for the Study of Crime, Security and Law": (None, "International", "Germany"),
    "Michigan State University":              ("MI", "Midwest", "United States"),
    "North Dakota State University":          ("ND", "Midwest", "United States"),
    "Northeastern University":                ("MA", "Northeast", "United States"),
    "Old Dominion University":                ("VA", "South", "United States"),
    "Prairie View A&M University":            ("TX", "South", "United States"),
    "Rutgers University--Newark":             ("NJ", "Northeast", "United States"),
    "Sam Houston State University":           ("TX", "South", "United States"),
    "Simon Fraser University":                (None, "International", "Canada"),
    "Southern Illinois University Carbondale":("IL", "Midwest", "United States"),
    "Tarleton State University":              ("TX", "South", "United States"),
    "Temple University":                      ("PA", "Northeast", "United States"),
    "Texas Southern University":              ("TX", "South", "United States"),
    "Texas State University":                 ("TX", "South", "United States"),
    "The Pennsylvania State University":      ("PA", "Northeast", "United States"),
    "The University of Alabama":              ("AL", "South", "United States"),
    "The University of Texas at Dallas":      ("TX", "South", "United States"),
    "University at Albany, State University of New York": ("NY", "Northeast", "United States"),
    "University of Arkansas--Little Rock":    ("AR", "South", "United States"),
    "University of California--Irvine":       ("CA", "West", "United States"),
    "University of Cambridge":                (None, "International", "United Kingdom"),
    "University of Central Florida":          ("FL", "South", "United States"),
    "University of Cincinnati":               ("OH", "Midwest", "United States"),
    "University of Delaware":                 ("DE", "South", "United States"),
    "University of Florida":                  ("FL", "South", "United States"),
    "University of Georgia":                  ("GA", "South", "United States"),
    "University of Hawaiʻi at Mānoa":         ("HI", "West", "United States"),
    "University of Leeds":                    (None, "International", "United Kingdom"),
    "University of Liverpool":                (None, "International", "United Kingdom"),
    "University of Louisville":               ("KY", "South", "United States"),
    "University of Manchester":               (None, "International", "United Kingdom"),
    "University of Maribor":                  (None, "International", "Slovenia"),
    "University of Maryland--College Park":   ("MD", "South", "United States"),
    "University of Massachusetts Lowell":     ("MA", "Northeast", "United States"),
    "University of Miami":                    ("FL", "South", "United States"),
    "University of Mississippi":              ("MS", "South", "United States"),
    "University of Missouri–St. Louis (UMSL)":("MO", "Midwest", "United States"),
    "University of Nebraska at Omaha":        ("NE", "Midwest", "United States"),
    "University of Nevada, Las Vegas":        ("NV", "West", "United States"),
    "University of New Haven":                ("CT", "Northeast", "United States"),
    "University of Pennsylvania":             ("PA", "Northeast", "United States"),
    "University of South Carolina":           ("SC", "South", "United States"),
    "University of South Florida":            ("FL", "South", "United States"),
    "University of Waikato":                  (None, "International", "New Zealand"),
    "Université de Montréal":                 (None, "International", "Canada"),
    "Washington State University":            ("WA", "West", "United States"),
}

# Keyword taxonomy — copied verbatim from the explorer's app.js
KEYWORD_TAXONOMY = [
    ("Policing", ["police", "policing", "law enforcement", "officer", "patrol", "sheriff", "cops"]),
    ("Corrections & prisons", ["prison", "corrections", "incarcerat", "reentry", "reintegrat", "parole", "probation"]),
    ("Courts & sentencing", ["court", "sentenc", "judicial", "prosecut"]),
    ("Juvenile justice", ["juvenile", "youth"]),
    ("Violence & homicide", ["violen", "homicide", "murder"]),
    ("Drugs & substance use", ["drug", "substance"]),
    ("Gangs", ["gang"]),
    ("Race & ethnicity", ["race", "racial", "ethnic"]),
    ("Gender & feminism", ["gender", "feminis", "women", "intimate partner"]),
    ("Victimization", ["victim"]),
    ("Immigration", ["immigrat", "migrat"]),
    ("Communities & neighborhoods", ["communit", "neighborhood"]),
    ("Policy & reform", ["policy", "reform"]),
    ("Cybercrime", ["cyber", "online", "digital"]),
    ("Terrorism & extremism", ["terror", "extrem", "radicali"]),
    ("Methods & statistics", ["method", "statistic", "quantitat", "qualitative", "research design"]),
    ("Theory", ["theor"]),
    ("Criminology of place", ["hot spot", "spatial", "place-based", "geograph", "environmental crim"]),
    ("Developmental / life-course", ["life course", "life-course", "developmental", "delinquen"]),
    ("Law & society", ["law and society", "socio-leg", "law & soc", "legal consciousness",
                       "legal mobilization", "procedural justice", "rule of law", "legal pluralism", "sociolegal"]),
    ("Mental health", ["mental health", "psychiatric", "psycholog"]),
    ("White-collar / organizational", ["white-collar", "white collar", "corporate", "organizational crim"]),
    ("Human trafficking", ["traffick"]),
    ("Human rights", ["human rights"]),
]


def keywords_for(text: str):
    if not text:
        return []
    low = text.lower()
    return [label for (label, pats) in KEYWORD_TAXONOMY if any(p in low for p in pats)]


def simplify_title(t: str) -> str:
    """Mirror the explorer's title-category logic, but bucket into three quiz tiers."""
    if not t:
        return "Other"
    low = t.lower()
    if "emerit" in low:
        return "Emeritus"
    if "distinguished" in low and "professor" in low:
        return "Distinguished Professor"
    if "assistant professor" in low:
        return "Assistant Professor"
    if "associate professor" in low:
        return "Associate Professor"
    if "clinical" in low and "professor" in low:
        return "Clinical Professor"
    if "teaching" in low or "instructional professor" in low or "professor of instruction" in low or "professor of teaching" in low:
        return "Teaching / Instructional"
    if "research professor" in low:
        return "Research Professor"
    if low.startswith("professor") or low == "professor" or "full professor" in low:
        return "Professor"
    if " professor" in low and not any(x in low for x in ["associate", "assistant", "emerit", "clinical", "teaching", "instruction"]):
        return "Professor"
    if "lecturer" in low:
        return "Lecturer"
    if "instructor" in low:
        return "Instructor"
    if "dean" in low:
        return "Dean / Chair"
    if "chair" in low:
        return "Dean / Chair"
    return "Other"


# Quiz rank tiers: higher / middle / lower
TIER_HIGHER = {"Distinguished Professor", "Professor", "Dean / Chair", "Emeritus"}
TIER_MIDDLE = {"Associate Professor", "Clinical Professor", "Research Professor"}
TIER_LOWER  = {"Assistant Professor", "Teaching / Instructional", "Lecturer", "Instructor"}


def tier_for(title_cat: str) -> str:
    if title_cat in TIER_HIGHER: return "higher"
    if title_cat in TIER_MIDDLE: return "middle"
    if title_cat in TIER_LOWER:  return "lower"
    return "other"


def main():
    print("Downloading explorer data…")
    raw = urllib.request.urlopen(EXPLORER_DATA_URL, timeout=30).read().decode("utf-8")
    data = json.loads(raw)

    faculty = []
    missing_inst = set()
    for dep in data["departments"]:
        inst = dep["institution"]
        info = INSTITUTIONS.get(inst)
        if info is None:
            missing_inst.add(inst)
            continue
        state, region, country = info
        consortium_dept = bool(dep.get("crimrxiv_member"))
        for f in dep["faculty"]:
            title_cat = simplify_title(f.get("title", ""))
            interests = f.get("research_interests", "") or ""
            consortium = bool(f.get("crimrxiv_member") or consortium_dept)
            faculty.append({
                "name": f["name"],
                "title": f.get("title", ""),
                "title_category": title_cat,
                "rank_tier": tier_for(title_cat),
                "institution": inst,
                "department_name": dep.get("department_name", ""),
                "department_url": dep.get("department_homepage", ""),
                "directory_url": dep.get("faculty_directory_url", ""),
                "profile_url": f.get("profile_url", ""),
                "email": f.get("email", ""),
                "research_interests": interests,
                "topics": keywords_for(interests),
                "state": state,
                "region": region,
                "country": country,
                "consortium": consortium,
            })
    if missing_inst:
        print("WARNING: missing institution map for:", missing_inst)
    print(f"Built {len(faculty)} faculty across {len({f['institution'] for f in faculty})} institutions.")

    # Emit faculty.js
    payload = {
        "generated_at": data.get("generated_at"),
        "build_date": data.get("build_date"),
        "build_version": data.get("build_version"),
        "explorer_data_url": EXPLORER_DATA_URL,
        "explorer_site_url": "https://crimconsortium.github.io/criminology-faculty-explorer/",
        "faculty": faculty,
        "topics": [label for (label, _pats) in KEYWORD_TAXONOMY],
    }

    header = (
        "/* Auto-generated by build_data.py — do not edit by hand.\n"
        "   Source: " + EXPLORER_DATA_URL + "\n"
        "   Rebuild: `python3 build_data.py` from the project root. */\n"
    )
    OUT.write_text(header + "window.__MM_DATA__ = " + json.dumps(payload, ensure_ascii=False) + ";\n", encoding="utf-8")
    print("Wrote", OUT)


if __name__ == "__main__":
    main()

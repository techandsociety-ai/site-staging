"""Build a chart-kit question file from saved CHIP50 MCP results.

    python3 tools/build_question.py tools/questions/tiktok-w38.json

The config names four MCP results, saved as JSON (paths relative to tools/):

    us         generate_marginals(variable=X)                          the U.S. rate
    us_by      generate_crosstab(platform=X, demographic=BY)           U.S. by group
    states     generate_crosstab(platform=X, demographic="state")      every state
    states_by  generate_crosstab_multi(variable=X, demographics=["state", BY])

Save each result as the tool returned it (the {"result": "..."} wrapper is
fine). The script writes docs/demo/chart-kit/<id>.json, which the page and the
embed load, and prints facts to check headlines against. It never edits the
text in the config: headlines are written by a person.
"""
import json
import sys
from pathlib import Path

TOOLS = Path(__file__).resolve().parent
OUT = TOOLS.parent / "docs" / "demo" / "chart-kit"

ABBR = {
    "Alabama": "AL", "Alaska": "AK", "Arizona": "AZ", "Arkansas": "AR", "California": "CA",
    "Colorado": "CO", "Connecticut": "CT", "Delaware": "DE", "District of Columbia": "DC",
    "Florida": "FL", "Georgia": "GA", "Hawaii": "HI", "Idaho": "ID", "Illinois": "IL",
    "Indiana": "IN", "Iowa": "IA", "Kansas": "KS", "Kentucky": "KY", "Louisiana": "LA",
    "Maine": "ME", "Maryland": "MD", "Massachusetts": "MA", "Michigan": "MI", "Minnesota": "MN",
    "Mississippi": "MS", "Missouri": "MO", "Montana": "MT", "Nebraska": "NE", "Nevada": "NV",
    "New Hampshire": "NH", "New Jersey": "NJ", "New Mexico": "NM", "New York": "NY",
    "North Carolina": "NC", "North Dakota": "ND", "Ohio": "OH", "Oklahoma": "OK", "Oregon": "OR",
    "Pennsylvania": "PA", "Rhode Island": "RI", "South Carolina": "SC", "South Dakota": "SD",
    "Tennessee": "TN", "Texas": "TX", "Utah": "UT", "Vermont": "VT", "Virginia": "VA",
    "Washington": "WA", "West Virginia": "WV", "Wisconsin": "WI", "Wyoming": "WY",
}
SHORT = {"District of Columbia": "D.C."}


def rows(path):
    """The data rows of a saved MCP result, wrapped or not."""
    d = json.loads((TOOLS / path).read_text())
    if isinstance(d, dict) and isinstance(d.get("result"), str):
        d = json.loads(d["result"])
    return d["data"] if isinstance(d, dict) else d


def cell(r):
    """One group: the weighted rate, or None when the MCP withheld it."""
    return None if r.get("suppressed") else r["user_rate_pct"], r["unweighted_n"]


def main(config):
    cfg = json.loads(Path(config).read_text())
    by, order = cfg["by"]["column"], cfg["by"]["order"]

    (us_value, us_n), = [cell(r) for r in rows(cfg["raw"]["us"])]
    us_by = {r["demographic_value"]: cell(r) for r in rows(cfg["raw"]["us_by"])}
    totals = {r["demographic_value"]: cell(r) for r in rows(cfg["raw"]["states"])}
    cells = {}
    for r in rows(cfg["raw"]["states_by"]):
        cells.setdefault(r["state"], {})[r[by]] = r

    if set(totals) != set(ABBR):
        sys.exit(f"states result covers {len(totals)} places; expected 50 states and DC")
    for name, (value, n) in totals.items():
        # the cells partition the state under the same weight, so they must add up to the served total
        got = cells[name].values()
        wn = sum(c["weighted_n"] for c in got)
        rate = 100 * sum(c["weighted_users"] for c in got) / wn
        if value is not None and abs(rate - value) > 0.05:
            sys.exit(f"{name}: cells give {rate:.2f}%, the states result says {value}%")

    def groups(lookup):
        return [{"label": g, "value": lookup[g][0], "n": lookup[g][1]} for g in order]

    states = []
    for name in sorted(totals):
        value, n = totals[name]
        states.append({
            "name": name, "label": SHORT.get(name, name), "abbr": ABBR[name],
            "slug": name.lower().replace(" ", "-"), "value": value, "n": n,
            "by": groups({g: cell(c) for g, c in cells[name].items()}),
        })

    out = {k: cfg[k] for k in ("id", "site", "question", "dek", "wording", "wave", "fielded",
                               "weight", "suppression", "moe", "provenance", "pulled", "text")}
    out.update(byName=cfg["by"]["name"], us={"value": us_value, "n": us_n}, by=groups(us_by), states=states)
    dest = OUT / f"{cfg['id']}.json"
    dest.write_text(json.dumps(out, indent=1) + "\n")
    print(f"wrote {dest.relative_to(TOOLS.parent)}")

    # facts to check the headlines against
    ranked = sorted((s for s in states if s["value"] is not None), key=lambda s: s["value"])
    lo, hi = ranked[0], ranked[-1]
    near = sum(abs(s["value"] - us_value) <= 5 for s in ranked)
    small = min((g["n"], s["name"], g["label"]) for s in states for g in s["by"])
    falling = [s["name"] for s in states
               if all(a["value"] is not None and b["value"] is not None and a["value"] > b["value"]
                      for a, b in zip(s["by"], s["by"][1:]))]
    gap = min(s["by"][0]["value"] - s["by"][-1]["value"] for s in states
              if s["by"][0]["value"] is not None and s["by"][-1]["value"] is not None)
    print(f"U.S. {us_value}% (n={us_n:,})")
    print(f"states run {lo['value']}% ({lo['name']}) to {hi['value']}% ({hi['name']}); "
          f"{near} of {len(ranked)} within 5 points of the U.S.")
    print(f"smallest group: {small[1]}, {small[2]}, n={small[0]}")
    print(f"{len(falling)} of {len(states)} fall at every step from {order[0]} to {order[-1]}; "
          f"first group minus last is at least {gap:.1f} points everywhere")
    withheld = sum(g["value"] is None for s in states for g in s["by"])
    if withheld:
        print(f"{withheld} state groups withheld by the MCP (n<10)")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else TOOLS / "questions" / "tiktok-w38.json")

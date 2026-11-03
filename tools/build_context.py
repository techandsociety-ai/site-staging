"""Build a wave's state context rows (docs/demo/chart-kit/context-<wave>.json):
partisanship by state, for the explorer to draw under a set's items, so a
reader can see whether the states an item ranks high are the red or the blue
ones. Both rows come from the survey itself, through the MCP, as raw results
saved under tools/raw/context-<wave>/:

  2024 vote: get_categorical_crosstab(column="vote_choice_24", demographic="state")
             and generate_marginals(variable="vote_choice_24"), asked of 2024
             voters; the margin is Trump's share minus Harris's
  party ID:  generate_crosstab(platform=<party_rep recode>, demographic="state")
             and the same for party_dem, plus generate_marginals of each; the
             margin is the Republican share minus the Democratic one, of all
             adults (Independent/Other is the rest)

Margins are in points, positive for the Republican side. Usage:
    python3 tools/build_context.py w39
"""
import json
import sys
from pathlib import Path

TOOLS = Path(__file__).resolve().parent
OUT = TOOLS.parent / "docs" / "demo" / "chart-kit"
WAVE = {"w39": {"wave": "Wave 39", "fielded": "Oct 1 to Nov 2, 2026", "pulled": "Nov 3, 2026"}}


def load(path):
    d = json.loads(path.read_text())
    if isinstance(d, dict) and isinstance(d.get("result"), str):
        d = json.loads(d["result"])
    return d


def main(wave):
    raw = TOOLS / "raw" / f"context-{wave}"
    # 2024 vote: one row per state x answer
    vs, vu = load(raw / "vote_choice_24_by_state.json"), load(raw / "vote_choice_24_us.json")
    lab = {"1": "Harris", "2": "Trump"}
    by = {}
    for r in vs["data"]:
        s = by.setdefault(r["demographic_value"], {"n": 0, "parts": {}})
        s["n"] += r["unweighted_n"] or 0
        if str(r["response_value"]) in lab and not r["suppressed"]:
            s["parts"][lab[str(r["response_value"])]] = r["pct_within_demo"]
    us_parts = {lab[str(r["value"])]: r["pct"] for r in vu["data"] if str(r["value"]) in lab}
    us_n = sum(r["unweighted_n"] or 0 for r in vu["data"])
    if not us_parts:   # marginals label values by name, not code
        us_parts = {"Harris": next(r["pct"] for r in vu["data"] if "Harris" in str(r["value"])),
                    "Trump": next(r["pct"] for r in vu["data"] if "Trump" in str(r["value"]))}
    vote = {"id": "vote24", "label": "2024 vote margin",
            "long": "2024 presidential vote: Trump's share minus Harris's, among 2024 voters",
            "parts": ["Trump", "Harris"], "weight": vs["weight_used"] + " by state; " + vu["weight_used"] + " for the U.S.",
            "provenance": ['get_categorical_crosstab(column="vote_choice_24", demographic="state", data_source="' + wave + '")',
                           'generate_marginals(variable="vote_choice_24", data_source="' + wave + '")'],
            "us": {"value": round(us_parts["Trump"] - us_parts["Harris"], 1), "parts": us_parts, "n": us_n},
            "states": {k: {"value": round(v["parts"]["Trump"] - v["parts"]["Harris"], 1), "parts": v["parts"], "n": v["n"]}
                       for k, v in by.items()}}

    # party ID: two binary recodes of party3
    rep, dem = load(raw / "party_rep_by_state.json"), load(raw / "party_dem_by_state.json")
    rid, did = rep["platform"], dem["platform"]
    ru, du = load(raw / "party_rep_us.json"), load(raw / "party_dem_us.json")
    def rate(m):   # a binary's marginals: one row, the share coded 1
        return m["data"][0]["user_rate_pct"]
    def total(m):
        return m["data"][0]["unweighted_n"]
    dr = {r["demographic_value"]: r for r in dem["data"]}
    party = {"id": "party", "label": "Party ID margin",
             "long": "Party identification: the Republican share minus the Democratic one, of all adults",
             "parts": ["Republican", "Democrat"], "weight": rep["weight_used"] + " by state; " + ru["weight_used"] + " for the U.S.",
             "provenance": ['create_recoded_variable(name="party_rep", source_column="party3", mapping Republican → 1, Democrat and Independent/Other → 0, binary=true) → ' + rid,
                            'create_recoded_variable(name="party_dem", source_column="party3", mapping Democrat → 1, Republican and Independent/Other → 0, binary=true) → ' + did,
                            f'generate_crosstab(platform=<each>, demographic="state", data_source="{wave}") and generate_marginals(<each>)'],
             "us": {"value": round(rate(ru) - rate(du), 1), "parts": {"Republican": rate(ru), "Democrat": rate(du)}, "n": total(ru)},
             "states": {}}
    for r in rep["data"]:
        d = dr[r["demographic_value"]]
        party["states"][r["demographic_value"]] = {"value": round(r["user_rate_pct"] - d["user_rate_pct"], 1),
                                                   "parts": {"Republican": r["user_rate_pct"], "Democrat": d["user_rate_pct"]},
                                                   "n": r["unweighted_n"]}

    rows = [vote, party]
    for row in rows:
        if len(row["states"]) != 51:
            sys.exit(f"{row['id']}: {len(row['states'])} places, expected 51")
    dest = OUT / f"context-{wave}.json"
    dest.write_text(json.dumps({**WAVE[wave], "rows": rows}, indent=1, ensure_ascii=False) + "\n")
    print(f"wrote {dest.relative_to(TOOLS.parent)}")
    for row in rows:
        st = sorted(row["states"].items(), key=lambda kv: kv[1]["value"])
        print(f"  {row['label']}: U.S. {row['us']['value']:+.1f}; most Democratic {st[0][0]} {st[0][1]['value']:+.1f}, "
              f"most Republican {st[-1][0]} {st[-1][1]['value']:+.1f}")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "w39")

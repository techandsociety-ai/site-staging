"""Build a chart-kit question file from saved CHIP50 MCP results.

    python3 tools/build_question.py tools/questions/tiktok-w38.json     one question
    python3 tools/build_question.py tools/questions/platforms-w38.json  a set, plus index.json

A question config names up to four MCP results, saved as JSON (paths
relative to tools/):

    us         generate_marginals(variable=X)                          the U.S. rate
    us_by      generate_crosstab(platform=X, demographic=BY)           U.S. by group
    states     generate_crosstab(platform=X, demographic="state")      every state
    states_by  generate_crosstab_multi(variable=X, demographics=["state", BY])

us and states are optional: without them the totals are summed from the
by-group cells, which partition each place under one weight. Save each result
as the tool returned it (the {"result": "..."} wrapper is fine). The script
writes docs/demo/chart-kit/<id>.json, which the page and the embed load, and
prints facts to check headlines against. A set config (see
platforms-w38.json) builds many questions from one template and writes
index.json for the explorer; a question's own text overrides the template.
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


def partition(cells):
    """The rate and headcount of a group whose cells partition it under one weight."""
    wn = sum(c["weighted_n"] for c in cells)
    return 100 * sum(c["weighted_users"] for c in cells) / wn, sum(c["unweighted_n"] for c in cells)


def build_one(cfg, state_n=None):
    """Write one question file. raw.us and raw.states are optional: without
    them the U.S. and state totals are summed from the by-group cells, which
    partition each place under the same weight (checked against the served
    totals wherever both exist, and against state_n headcounts otherwise)."""
    by, order = cfg["by"]["column"], cfg["by"]["order"]
    raw = cfg["raw"]
    us_rows = rows(raw["us_by"])
    us_by = {r["demographic_value"]: cell(r) for r in us_rows}
    if "us" in raw:
        (us_value, us_n), = [cell(r) for r in rows(raw["us"])]
    else:
        us_value, us_n = partition(us_rows)
        us_value = round(us_value, 2)
    cells = {}
    for r in rows(raw["states_by"]):
        cells.setdefault(r["state"], {})[r[by]] = r
    if set(cells) != set(ABBR):
        sys.exit(f"{cfg['id']}: state cells cover {len(cells)} places; expected 50 states and DC")

    totals = {r["demographic_value"]: cell(r) for r in rows(raw["states"])} if "states" in raw else {}
    for name, got in cells.items():
        if any(c.get("suppressed") for c in got.values()):
            if name not in totals:
                sys.exit(f"{cfg['id']}: {name} has withheld cells, so its total needs the states result")
            continue
        rate, n = partition(got.values())
        if name in totals:
            # the cells partition the state under the same weight, so they must add up to the served total
            if totals[name][0] is not None and abs(rate - totals[name][0]) > 0.05:
                sys.exit(f"{cfg['id']}: {name}: cells give {rate:.2f}%, the states result says {totals[name][0]}%")
        else:
            if state_n and state_n[name] != n:
                sys.exit(f"{cfg['id']}: {name}: cells hold {n} respondents, the state has {state_n[name]}")
            totals[name] = (round(rate, 2), n)

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
    out.update(label=cfg.get("label", cfg["question"]), topic=cfg.get("topic"), column=cfg.get("column"),
               byName=cfg["by"]["name"], us={"value": us_value, "n": us_n}, by=groups(us_by), states=states)
    fill_auto(out)
    dest = OUT / f"{cfg['id']}.json"
    dest.write_text(json.dumps(out, indent=1) + "\n")
    print(f"wrote {dest.relative_to(TOOLS.parent)}")
    facts(out, order)
    return out


def fill_auto(q):
    """Fill the build-time tokens a set's template uses ({label}, {lo}, {loState},
    {hi}, {hiState}) from this question's numbers, and an "auto" dek with a
    plain statement of the U.S. figure ({column} names the variable). Tokens like {state} and {value} are
    left for the page, which fills them for the place picked."""
    pct = lambda v: f"{round(v)}%"
    ranked = sorted((s for s in q["states"] if s["value"] is not None), key=lambda s: s["value"])
    tokens = {"label": q["label"], "column": q.get("column") or "", "lo": pct(ranked[0]["value"]), "loState": ranked[0]["label"],
              "hi": pct(ranked[-1]["value"]), "hiState": ranked[-1]["label"]}
    def sub(v):
        for k, x in tokens.items():
            v = v.replace("{%s}" % k, x)
        return v
    def walk(d):
        for k, v in d.items():
            if isinstance(v, dict):
                walk(v)
            elif isinstance(v, str):
                d[k] = sub(v)
    if q["dek"] == "auto":
        q["dek"] = f"{pct(q['us']['value'])} of U.S. adults say they use {q['label']}."
    walk(q["text"])
    q["question"] = sub(q["question"])
    q["provenance"] = [sub(c) for c in q["provenance"]]
    q["wording"] = q["wording"].replace("{option}", q.pop("option", q["label"]))


def facts(q, order):
    """Facts to check the headlines against."""
    states, us_value, us_n = q["states"], q["us"]["value"], q["us"]["n"]
    ranked = sorted((s for s in states if s["value"] is not None), key=lambda s: s["value"])
    lo, hi = ranked[0], ranked[-1]
    near = sum(abs(s["value"] - us_value) <= 5 for s in ranked)
    small = min((g["n"], s["name"], g["label"]) for s in states for g in s["by"])
    falling = [s["name"] for s in states
               if all(a["value"] is not None and b["value"] is not None and a["value"] > b["value"]
                      for a, b in zip(s["by"], s["by"][1:]))]
    print(f"  U.S. {us_value}% (n={us_n:,}); states run {lo['value']}% ({lo['name']}) to {hi['value']}% "
          f"({hi['name']}); {near} of {len(ranked)} within 5 points of the U.S.")
    print(f"  smallest group: {small[1]}, {small[2]}, n={small[0]}; "
          f"{len(falling)} of {len(states)} fall at every step from {order[0]} to {order[-1]}")
    withheld = sum(g["value"] is None for s in states for g in s["by"])
    if withheld:
        print(f"  {withheld} state groups withheld by the MCP (n<10)")


def build_set(cfg):
    """Write every question in a set, then index.json, which lists them for the explorer."""
    state_n = {r["demographic_value"]: r["unweighted_n"] for r in rows(cfg["state_n"])}
    shared = {k: v for k, v in cfg.items() if k not in ("set", "questions", "template", "state_n")}
    index = []
    for q in cfg["questions"]:
        one = json.loads(json.dumps({**shared, **cfg["template"]}))
        if "config" in q:
            one.update(json.loads((TOOLS / "questions" / q["config"]).read_text()))
        one.update(q)
        one.setdefault("raw", {"us_by": f"raw/{q['id']}/us_by_age.json", "states_by": f"raw/{q['id']}/states_by_age.json"})
        built = build_one(one, state_n)
        index.append({"id": built["id"], "label": built["label"], "topic": built["topic"],
                      "question": built["question"], "us": built["us"]["value"]})
    dest = OUT / "index.json"
    dest.write_text(json.dumps({"set": cfg["set"], "wave": cfg["wave"], "questions": index}, indent=1) + "\n")
    print(f"wrote {dest.relative_to(TOOLS.parent)}")


def main(config):
    cfg = json.loads(Path(config).read_text())
    if "questions" in cfg:
        build_set(cfg)
    else:
        build_one(cfg)


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else TOOLS / "questions" / "tiktok-w38.json")

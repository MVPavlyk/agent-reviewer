#!/usr/bin/env python3
"""Collect hard metrics for a multi-agent workflow run.

Reads the main session transcript and the per-subagent transcripts, and emits a
compact summary. NOTHING here loads a transcript into an agent's context: the
files are megabytes of JSONL, and the whole point of this script is that only
its aggregated output is ever read.

Usage:
  collect_metrics.py --session <id> [--scratch <dir>] [--json]
  collect_metrics.py --auto            # newest transcript for this project

Exit codes: 0 ok, 2 transcript not found.
"""
import argparse, json, os, re, sys, glob
from collections import Counter, OrderedDict

HOME = os.path.expanduser("~")


def project_key(cwd):
    # Claude Code slugifies the cwd: every "/" AND every "." becomes "-".
    # Missing the dot rule silently yields "no transcript found" on any path
    # containing a dot (e.g. a username like "oyi.21.11.00075").
    return cwd.replace("/", "-").replace(".", "-")


def find_main(session, cwd):
    d = os.path.join(HOME, ".claude", "projects", project_key(cwd))
    if session:
        p = os.path.join(d, session + ".jsonl")
        return p if os.path.exists(p) else None
    files = glob.glob(os.path.join(d, "*.jsonl"))
    return max(files, key=os.path.getmtime) if files else None


def iter_records(path):
    with open(path, errors="replace") as fh:
        for line in fh:
            try:
                yield json.loads(line)
            except Exception:
                continue


def usage_of(rec):
    m = rec.get("message")
    return m.get("usage") if isinstance(m, dict) else None


def blocks(rec):
    m = rec.get("message")
    c = m.get("content") if isinstance(m, dict) else None
    return c if isinstance(c, list) else []


def scan_main(path):
    """Main-session totals + dispatch order, in the order they happened."""
    tot = Counter()
    turns = 0
    tools = Counter()
    dispatches = []            # ordered Agent tool_use calls
    by_tool_use_id = {}
    notif = OrderedDict()      # task_id -> reported usage (deduped)

    for rec in iter_records(path):
        u = usage_of(rec)
        if u:
            turns += 1
            for k in ("input_tokens", "output_tokens",
                      "cache_creation_input_tokens", "cache_read_input_tokens"):
                tot[k] += u.get(k, 0) or 0
            det = u.get("output_tokens_details") or {}
            tot["thinking_tokens"] += det.get("thinking_tokens", 0) or 0

        for b in blocks(rec):
            if not isinstance(b, dict):
                continue
            if b.get("type") == "tool_use":
                name = b.get("name")
                tools[name] += 1
                if name == "Agent":
                    inp = b.get("input") or {}
                    d = {
                        "seq": len(dispatches) + 1,
                        "tool_use_id": b.get("id"),
                        "agent": inp.get("subagent_type") or "general-purpose",
                        "description": inp.get("description") or "",
                        "background": bool(inp.get("run_in_background")),
                        "prompt_chars": len(inp.get("prompt") or ""),
                        "ts": rec.get("timestamp"),
                        "task_id": None,
                    }
                    dispatches.append(d)
                    by_tool_use_id[b.get("id")] = d
            elif b.get("type") == "tool_result":
                txt = b.get("content")
                if isinstance(txt, list):
                    txt = " ".join(x.get("text", "") for x in txt
                                   if isinstance(x, dict))
                if not isinstance(txt, str):
                    continue
                m = re.search(r"agentId:\s*([0-9a-f]+)", txt)
                if m and b.get("tool_use_id") in by_tool_use_id:
                    by_tool_use_id[b["tool_use_id"]]["task_id"] = m.group(1)

        # Task notifications carry the agent's self-reported usage. They can
        # appear more than once for the same task, so dedupe by task-id —
        # summing raw regex hits double-counts (verified: every value appeared
        # at least twice in a real run).
        raw = json.dumps(rec) if not isinstance(rec, str) else rec
        for tid, tok, tu, dur in re.findall(
            r"<task-id>([^<]+)</task-id>.*?<subagent_tokens>(\d+)</subagent_tokens>"
            r"\s*<tool_uses>(\d+)</tool_uses>\s*<duration_ms>(\d+)</duration_ms>",
            raw, re.S,
        ):
            notif.setdefault(tid, {"tokens": int(tok), "tool_uses": int(tu),
                                   "duration_ms": int(dur)})

    return {"totals": dict(tot), "turns": turns, "tools": tools,
            "dispatches": dispatches, "notified": notif}


def scan_task(path):
    """Per-subagent transcript: usage, tools, turns."""
    tot = Counter()
    turns = 0
    tools = Counter()
    for rec in iter_records(path):
        u = usage_of(rec)
        if u:
            turns += 1
            for k in ("input_tokens", "output_tokens",
                      "cache_creation_input_tokens", "cache_read_input_tokens"):
                tot[k] += u.get(k, 0) or 0
        for b in blocks(rec):
            if isinstance(b, dict) and b.get("type") == "tool_use":
                tools[b.get("name")] += 1
    return {"totals": dict(tot), "turns": turns, "tools": tools}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--session")
    ap.add_argument("--scratch", help="scratchpad dir containing tasks/")
    ap.add_argument("--cwd", default=os.getcwd())
    ap.add_argument("--auto", action="store_true")
    ap.add_argument("--json", action="store_true")
    a = ap.parse_args()

    main_path = find_main(a.session, a.cwd)
    if not main_path:
        print("ERROR: no transcript found. Pass --session <id>, or --auto.",
              file=sys.stderr)
        return 2

    m = scan_main(main_path)

    tasks_dir = None
    if a.scratch:
        cand = os.path.join(a.scratch, "tasks")
        tasks_dir = cand if os.path.isdir(cand) else None
    if not tasks_dir:
        for c in glob.glob(os.path.join("/private/tmp", "claude-*",
                                        project_key(a.cwd).lstrip("-"), "*",
                                        "tasks")):
            tasks_dir = c
            break

    for d in m["dispatches"]:
        d["measured"] = None
        tid = d.get("task_id")
        if tid:
            n = m["notified"].get(tid)
            if n:
                d["reported_tokens"] = n["tokens"]
                d["tool_uses"] = n["tool_uses"]
                d["duration_ms"] = n["duration_ms"]
            if tasks_dir:
                p = os.path.join(tasks_dir, tid + ".output")
                if os.path.exists(p):
                    d["measured"] = scan_task(p)

    if a.json:
        print(json.dumps({
            "transcript": main_path, "tasks_dir": tasks_dir,
            "main": {"totals": m["totals"], "turns": m["turns"],
                     "tools": dict(m["tools"])},
            "dispatches": m["dispatches"],
        }, indent=2, default=str))
        return 0

    t = m["totals"]
    print(f"# Workflow run metrics\n")
    print(f"transcript: {main_path}")
    print(f"tasks dir : {tasks_dir or 'NOT FOUND — per-agent detail unavailable'}\n")
    print("## Orchestrator (main session)")
    print(f"- assistant turns: {m['turns']}")
    print(f"- output tokens: {t.get('output_tokens',0):,} "
          f"(thinking {t.get('thinking_tokens',0):,})")
    print(f"- cache write: {t.get('cache_creation_input_tokens',0):,} · "
          f"cache read: {t.get('cache_read_input_tokens',0):,} · "
          f"uncached input: {t.get('input_tokens',0):,}")
    print(f"- tool calls: {sum(m['tools'].values())} "
          f"{dict(m['tools'].most_common(8))}\n")

    ds = m["dispatches"]
    rep = sum(d.get("reported_tokens", 0) for d in ds)
    print(f"## Subagents — {len(ds)} dispatches, "
          f"{rep:,} reported tokens total\n")
    print("| # | agent | description | tokens | tools | dur s | turns |")
    print("|---|---|---|---|---|---|---|")
    for d in ds:
        meas = d.get("measured") or {}
        turns = meas.get("turns", "—")
        print(f"| {d['seq']} | {d['agent']} | {d['description'][:34]} | "
              f"{d.get('reported_tokens','—'):,} | {d.get('tool_uses','—')} | "
              f"{round(d.get('duration_ms',0)/1000) or '—'} | {turns} |"
              .replace("'—':,", "—"))
    print("\n## Agent mix")
    for agent, n in Counter(d["agent"] for d in ds).most_common():
        tk = sum(x.get("reported_tokens", 0) for x in ds if x["agent"] == agent)
        print(f"- {agent}: {n} dispatch(es), {tk:,} tokens")
    return 0


if __name__ == "__main__":
    sys.exit(main())

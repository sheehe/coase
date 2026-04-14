"""Stop hook: append new user/assistant messages from the current Claude Code
session JSONL to doc/message/chatN.md, one timestamped block each.

Dedup: state file tracks last-written message uuid per session.
Rotation: when current chatN.md >= 500 lines, new blocks go into chat{N+1}.md.

CLI modes:
  - No args (hook mode): reads session_id from stdin, resolves to jsonl under
    ~/.claude/projects/, applies Coase cwd filter, processes incremental blocks.
  - --backfill [JSONL_PATH]: explicit one-shot ingestion. Bypasses the cwd
    filter — use when Claude Code was started from c:/Projects (parent) rather
    than c:/Projects/Coase, so session jsonl lives in c--Projects/ with a
    non-Coase cwd field. Path optional; defaults to the most recently modified
    jsonl across both candidate dirs.
"""

from __future__ import annotations

import json
import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
MESSAGE_DIR = PROJECT_ROOT / "doc" / "message"
STATE_FILE = MESSAGE_DIR / ".chat_export_state.json"
ROTATE_LINES = 500

# Claude Code encodes the startup cwd into the projects dir name by replacing
# ":" and path separators with "-". Depending on whether Claude Code was
# started from c:/Projects or from c:/Projects/Coase, the session lands in a
# different subdir. We look in both.
SESSIONS_DIR_CANDIDATES: list[Path] = [
    Path.home() / ".claude" / "projects" / "c--Projects-Coase",
    Path.home() / ".claude" / "projects" / "c--Projects",
]

# Canonical Coase project root — used to filter out sibling projects when the
# session lives in the parent-cwd dir (c--Projects).
COASE_ROOT = PROJECT_ROOT.resolve()

# IDE/system-injected pseudo-tags that appear inside user text but aren't
# the user's actual input — strip before logging.
PSEUDO_TAG_RE = re.compile(
    r"<(ide_opened_file|ide_selection|system-reminder|command-message|command-name|command-args|local-command-stdout|local-command-stderr|user-prompt-submit-hook)>"
    r".*?"
    r"</\1>",
    re.DOTALL,
)


def read_hook_stdin() -> dict:
    try:
        raw = sys.stdin.read()
        return json.loads(raw) if raw.strip() else {}
    except Exception:
        return {}


def load_state() -> dict:
    if STATE_FILE.exists():
        try:
            return json.loads(STATE_FILE.read_text(encoding="utf-8"))
        except Exception:
            return {}
    return {}


def save_state(state: dict) -> None:
    STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
    STATE_FILE.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")


def find_session_jsonl(session_id: str) -> Path | None:
    # First try: exact session id lookup across all candidate dirs.
    if session_id:
        for base in SESSIONS_DIR_CANDIDATES:
            candidate = base / f"{session_id}.jsonl"
            if candidate.exists():
                return candidate
    # Fallback: most recently modified JSONL across candidate dirs.
    all_jsonls: list[Path] = []
    for base in SESSIONS_DIR_CANDIDATES:
        if base.exists():
            all_jsonls.extend(base.glob("*.jsonl"))
    if not all_jsonls:
        return None
    return sorted(all_jsonls, key=lambda p: p.stat().st_mtime, reverse=True)[0]


def is_coase_session(jsonl_path: Path) -> bool:
    """Best-effort check: does this jsonl belong to a Coase-rooted session?

    Returns True iff the first entry carrying a `cwd` field has cwd equal to
    COASE_ROOT or a subdirectory of it. Used in hook mode to skip sibling
    projects (e.g. MARS v1) that share the parent c--Projects dir.

    Sessions started from the c:/Projects parent cwd will return False — those
    must be ingested via --backfill, not via the hook.
    """
    try:
        with jsonl_path.open("r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    d = json.loads(line)
                except Exception:
                    continue
                cwd = d.get("cwd")
                if not cwd:
                    continue
                try:
                    cwd_resolved = Path(cwd).resolve()
                except Exception:
                    return False
                try:
                    cwd_resolved.relative_to(COASE_ROOT)
                    return True
                except ValueError:
                    return False
        return False
    except Exception:
        return False


def process_session(jsonl_path: Path) -> int:
    """Core: read new blocks from jsonl, append to chatN.md, update state.

    Returns number of blocks appended (0 if nothing new).
    """
    state = load_state()
    key = jsonl_path.stem
    last_uuid = state.get(key)
    blocks, new_cursor = collect_new_blocks(jsonl_path, last_uuid)
    if not blocks:
        return 0
    append_blocks(blocks)
    if new_cursor:
        state[key] = new_cursor
        save_state(state)
    return len(blocks)


def parse_timestamp(ts: str) -> str:
    """ISO UTC -> local 'YYYY-MM-DD HH:MM'."""
    try:
        dt = datetime.fromisoformat(ts.replace("Z", "+00:00"))
        return dt.astimezone().strftime("%Y-%m-%d %H:%M")
    except Exception:
        return datetime.now().strftime("%Y-%m-%d %H:%M")


def extract_user_text(msg: dict) -> str | None:
    """Return real user text, or None for tool_result / meta entries."""
    content = msg.get("message", {}).get("content")
    if isinstance(content, str):
        return content.strip() or None
    if not isinstance(content, list):
        return None
    parts = []
    for seg in content:
        if not isinstance(seg, dict):
            continue
        if seg.get("type") == "text":
            parts.append(seg.get("text", ""))
        elif seg.get("type") == "tool_result":
            return None  # tool result masquerading as user — skip
    text = "\n".join(p for p in parts if p)
    text = PSEUDO_TAG_RE.sub("", text).strip()
    return text or None


def extract_assistant_text(msg: dict) -> str | None:
    """Return visible assistant text (skip thinking and tool_use)."""
    content = msg.get("message", {}).get("content")
    if isinstance(content, str):
        return content.strip() or None
    if not isinstance(content, list):
        return None
    parts = []
    for seg in content:
        if isinstance(seg, dict) and seg.get("type") == "text":
            parts.append(seg.get("text", ""))
    text = "\n".join(p for p in parts if p).strip()
    return text or None


def collect_new_blocks(jsonl_path: Path, last_uuid: str | None) -> tuple[list[tuple[str, str, str]], str | None]:
    """Return list of (timestamp, role, text) plus the new cursor uuid.

    role is '用户' or 'Claude'.
    """
    blocks: list[tuple[str, str, str]] = []
    passed_cursor = last_uuid is None
    new_cursor = last_uuid

    with jsonl_path.open("r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                d = json.loads(line)
            except Exception:
                continue
            t = d.get("type")
            if t not in ("user", "assistant"):
                continue
            if d.get("isMeta"):
                continue  # skill output / system-injected meta, not real user text
            uuid = d.get("uuid")
            if not uuid:
                continue
            if not passed_cursor:
                if uuid == last_uuid:
                    passed_cursor = True
                continue

            if t == "user":
                text = extract_user_text(d)
                if text:
                    blocks.append((parse_timestamp(d.get("timestamp", "")), "用户", text))
                    new_cursor = uuid
            else:  # assistant
                text = extract_assistant_text(d)
                if text:
                    blocks.append((parse_timestamp(d.get("timestamp", "")), "Claude", text))
                    new_cursor = uuid

    return blocks, new_cursor


def group_into_turns(
    blocks: list[tuple[str, str, str]],
) -> tuple[tuple[str, str, str] | None, list[tuple[tuple[str, str, str] | None, tuple[str, str, str] | None]]]:
    """Collapse a flat block list into (leading_orphan_assistant, turns).

    A turn = one user message + only the LAST assistant message that follows.
    Intermediate 'thinking out loud' assistant updates are dropped — Stop-hook
    semantics mean the last assistant message is the user-visible reply.

    `leading_orphan_assistant` is the last assistant message in any orphan run
    at the head of the batch (messages before any user message). Orphans appear
    when the hook fires mid-turn or when /resume replays a tail — we use them
    to REPLACE the last Claude block already in the file.
    """
    leading_orphan: tuple[str, str, str] | None = None
    turns: list[tuple[tuple[str, str, str] | None, tuple[str, str, str] | None]] = []
    current_user: tuple[str, str, str] | None = None
    current_assistant: tuple[str, str, str] | None = None
    for block in blocks:
        _, role, _ = block
        if role == "用户":
            if current_user is not None:
                turns.append((current_user, current_assistant))
            current_user = block
            current_assistant = None
        else:  # Claude
            if current_user is None:
                leading_orphan = block  # keep only the latest orphan
            else:
                current_assistant = block  # keep only the latest per turn
    if current_user is not None:
        turns.append((current_user, current_assistant))
    return leading_orphan, turns


CLAUDE_HEADER_RE = re.compile(r"^## \[(\d+)\] .* · Claude$")


def replace_last_claude_block(target: Path, new_ts: str, new_text: str) -> bool:
    """Find the last '## [N] <ts> · Claude' block in target and replace its
    header timestamp and body. Returns True if replaced, False if no such
    block exists.
    """
    if not target.exists():
        return False
    content = target.read_text(encoding="utf-8")
    lines = content.splitlines()
    header_idx = None
    turn_n: int | None = None
    for i in range(len(lines) - 1, -1, -1):
        m = CLAUDE_HEADER_RE.match(lines[i])
        if m:
            header_idx = i
            turn_n = int(m.group(1))
            break
    if header_idx is None or turn_n is None:
        return False
    # Block body runs until the next '---' separator (or EOF).
    end_idx = len(lines)
    for j in range(header_idx + 1, len(lines)):
        if lines[j].strip() == "---":
            end_idx = j + 1  # include the separator line
            break
    new_block_lines = [
        f"## [{turn_n}] {new_ts} · Claude",
        "",
        new_text,
        "",
        "---",
        "",
    ]
    rebuilt = lines[:header_idx] + new_block_lines + lines[end_idx:]
    out = "\n".join(rebuilt)
    if not out.endswith("\n"):
        out += "\n"
    target.write_text(out, encoding="utf-8")
    return True


def next_turn_number(target: Path) -> int:
    """Scan target file for existing '## [N]' headers, return max+1 (or 1)."""
    if not target.exists():
        return 1
    pattern = re.compile(r"^## \[(\d+)\]")
    max_n = 0
    try:
        for line in target.read_text(encoding="utf-8").splitlines():
            m = pattern.match(line)
            if m:
                n = int(m.group(1))
                if n > max_n:
                    max_n = n
    except Exception:
        return 1
    return max_n + 1


def current_chat_file() -> Path:
    """Return the chatN.md file to append to, rotating if needed."""
    MESSAGE_DIR.mkdir(parents=True, exist_ok=True)
    pattern = re.compile(r"^chat(\d+)\.md$")
    nums = []
    for p in MESSAGE_DIR.iterdir():
        m = pattern.match(p.name)
        if m:
            nums.append((int(m.group(1)), p))
    if not nums:
        path = MESSAGE_DIR / "chat1.md"
        path.write_text("# chat1\n\n", encoding="utf-8")
        return path
    nums.sort()
    latest_n, latest_path = nums[-1]
    try:
        line_count = sum(1 for _ in latest_path.open("r", encoding="utf-8"))
    except Exception:
        line_count = 0
    if line_count >= ROTATE_LINES:
        new_n = latest_n + 1
        new_path = MESSAGE_DIR / f"chat{new_n}.md"
        new_path.write_text(f"# chat{new_n}\n\n", encoding="utf-8")
        return new_path
    return latest_path


def format_block(n: int, ts: str, role: str, text: str) -> str:
    return f"## [{n}] {ts} · {role}\n\n{text}\n\n---\n\n"


def append_blocks(blocks: list[tuple[str, str, str]]) -> None:
    leading_orphan, turns = group_into_turns(blocks)

    # Orphan assistant messages belong to a turn already written — update that
    # turn's Claude block in place instead of creating a new entry.
    if leading_orphan is not None:
        ts, _, text = leading_orphan
        target = current_chat_file()
        replace_last_claude_block(target, ts, text)

    for user_block, assistant_block in turns:
        target = current_chat_file()  # re-eval per turn so rotation can kick in
        n = next_turn_number(target)
        pieces: list[str] = []
        if user_block is not None:
            ts, _, text = user_block
            pieces.append(format_block(n, ts, "用户", text))
        if assistant_block is not None:
            ts, _, text = assistant_block
            pieces.append(format_block(n, ts, "Claude", text))
        if pieces:
            with target.open("a", encoding="utf-8") as f:
                f.write("".join(pieces))


def main() -> int:
    """Hook entry: reads session_id from stdin, applies cwd filter."""
    hook_input = read_hook_stdin()
    session_id = hook_input.get("session_id", "")

    jsonl = find_session_jsonl(session_id)
    if jsonl is None:
        return 0  # nothing to do, stay silent

    if not is_coase_session(jsonl):
        return 0  # session belongs to a sibling project, not Coase

    process_session(jsonl)
    return 0


def backfill_main(jsonl_arg: str | None) -> int:
    """Backfill entry: explicit one-shot ingestion, bypasses cwd filter.

    If jsonl_arg is None, picks the most recently modified jsonl across
    candidate dirs (same fallback as the hook mode).
    """
    if jsonl_arg:
        jsonl = Path(jsonl_arg).resolve()
        if not jsonl.exists():
            print(f"[backfill] jsonl not found: {jsonl}", file=sys.stderr)
            return 1
    else:
        jsonl = find_session_jsonl("")
        if jsonl is None:
            print("[backfill] no jsonl found in candidate session dirs", file=sys.stderr)
            return 1
        print(f"[backfill] auto-picked latest: {jsonl}", file=sys.stderr)

    n = process_session(jsonl)
    print(f"[backfill] appended {n} block(s) from {jsonl.name}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    try:
        if len(sys.argv) >= 2 and sys.argv[1] == "--backfill":
            arg = sys.argv[2] if len(sys.argv) >= 3 else None
            sys.exit(backfill_main(arg))
        sys.exit(main())
    except Exception as e:
        # Never fail the hook — log to a sidecar file for debugging.
        try:
            (MESSAGE_DIR / ".chat_export_error.log").parent.mkdir(parents=True, exist_ok=True)
            with (MESSAGE_DIR / ".chat_export_error.log").open("a", encoding="utf-8") as f:
                f.write(f"{datetime.now().isoformat()} {type(e).__name__}: {e}\n")
        except Exception:
            pass
        sys.exit(0)

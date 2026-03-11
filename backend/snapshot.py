import os
import shutil
from datetime import datetime
from glob import glob

from config import DATA_DIR, SESSIONS_FILE, SNAPSHOTS_DIR
from utils import load_json, save_json


def _ensure_snapshots_dir():
    os.makedirs(SNAPSHOTS_DIR, exist_ok=True)


def _snapshot_meta_path():
    return os.path.join(SNAPSHOTS_DIR, "snapshots.json")


def _load_snapshot_registry():
    return load_json(_snapshot_meta_path(), default=[])


def _save_snapshot_registry(registry):
    save_json(_snapshot_meta_path(), registry)


def take_snapshot(reason="manual"):
    _ensure_snapshots_dir()

    now = datetime.now()
    snapshot_id = now.strftime("%Y%m%d_%H%M%S_%f")
    snapshot_dir = os.path.join(SNAPSHOTS_DIR, snapshot_id)
    os.makedirs(snapshot_dir, exist_ok=True)

    if os.path.exists(SESSIONS_FILE):
        shutil.copy2(SESSIONS_FILE, os.path.join(snapshot_dir, "sessions.json"))

    data_dest = os.path.join(snapshot_dir, "data")
    os.makedirs(data_dest, exist_ok=True)

    session_files = glob(os.path.join(DATA_DIR, "session_*.json"))
    for src in session_files:
        shutil.copy2(src, os.path.join(data_dest, os.path.basename(src)))

    sessions = load_json(SESSIONS_FILE, default=[])
    session_count = len(sessions)

    meta = {
        "id": snapshot_id,
        "reason": reason,
        "created_at": now.isoformat(),
        "session_count": session_count,
    }

    registry = _load_snapshot_registry()
    registry.append(meta)
    _save_snapshot_registry(registry)

    print(
        f"[SNAPSHOT] Created snapshot {snapshot_id} (reason={reason}, sessions={session_count})"
    )
    return meta


def list_snapshots():
    _ensure_snapshots_dir()
    registry = _load_snapshot_registry()
    return list(reversed(registry))


def rollback_snapshot(snapshot_id):
    _ensure_snapshots_dir()

    snapshot_dir = os.path.join(SNAPSHOTS_DIR, snapshot_id)
    if not os.path.isdir(snapshot_dir):
        raise ValueError(f"Snapshot '{snapshot_id}' not found")

    snapshot_sessions = os.path.join(snapshot_dir, "sessions.json")
    if not os.path.exists(snapshot_sessions):
        raise ValueError(
            f"Snapshot '{snapshot_id}' is corrupted (missing sessions.json)"
        )

    safety = take_snapshot(reason="pre_rollback")
    print(f"[SNAPSHOT] Safety snapshot taken: {safety['id']}")

    shutil.copy2(snapshot_sessions, SESSIONS_FILE)

    snapshot_data = os.path.join(snapshot_dir, "data")

    current_files = glob(os.path.join(DATA_DIR, "session_*.json"))
    for f in current_files:
        os.remove(f)

    if os.path.isdir(snapshot_data):
        for src in glob(os.path.join(snapshot_data, "session_*.json")):
            shutil.copy2(src, os.path.join(DATA_DIR, os.path.basename(src)))

    sessions = load_json(SESSIONS_FILE, default=[])

    print(
        f"[SNAPSHOT] Rolled back to snapshot {snapshot_id} ({len(sessions)} sessions)"
    )
    return {
        "snapshot_id": snapshot_id,
        "sessions_restored": len(sessions),
        "safety_snapshot_id": safety["id"],
    }


def delete_snapshot(snapshot_id):
    _ensure_snapshots_dir()

    snapshot_dir = os.path.join(SNAPSHOTS_DIR, snapshot_id)
    if not os.path.isdir(snapshot_dir):
        raise ValueError(f"Snapshot '{snapshot_id}' not found")

    shutil.rmtree(snapshot_dir)

    registry = _load_snapshot_registry()
    registry = [s for s in registry if s["id"] != snapshot_id]
    _save_snapshot_registry(registry)

    print(f"[SNAPSHOT] Deleted snapshot {snapshot_id}")

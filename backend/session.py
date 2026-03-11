import os
from datetime import datetime
from config import DATA_DIR, SESSIONS_FILE
from utils import ensure_data_dir, load_json, save_json


def load_sessions():
    return load_json(SESSIONS_FILE, default=[])


def save_sessions(sessions):
    save_json(SESSIONS_FILE, sessions)


def get_session_file(session_id):
    ensure_data_dir()
    return os.path.join(DATA_DIR, f"session_{session_id}.json")


def get_session(session_id):
    for s in load_sessions():
        if s["id"] == session_id:
            return s
    return None


def _build_session_map(sessions=None):
    if sessions is None:
        sessions = load_sessions()
    return {s["id"]: s for s in sessions}


def get_ancestor_ids(session_id):
    session_map = _build_session_map()
    ancestors = []
    visited = set()
    session = session_map.get(session_id)
    while session and session.get("parent_id"):
        parent_id = session["parent_id"]
        if parent_id in visited:
            break
        visited.add(parent_id)
        ancestors.append(parent_id)
        session = session_map.get(parent_id)
    return ancestors


def get_descendant_ids(session_id):
    sessions = load_sessions()
    descendants = []
    visited = set()

    def collect_children(parent_id):
        if parent_id in visited:
            return
        visited.add(parent_id)
        for s in sessions:
            if s.get("parent_id") == parent_id and s["id"] not in visited:
                descendants.append(s["id"])
                collect_children(s["id"])

    collect_children(session_id)
    return descendants


def get_ancestor_distance(descendant_id, ancestor_id):
    session_map = _build_session_map()
    distance = 0
    visited = set()
    current = session_map.get(descendant_id)
    while current:
        if current["id"] == ancestor_id:
            return distance
        if current["id"] in visited or not current.get("parent_id"):
            break
        visited.add(current["id"])
        current = session_map.get(current["parent_id"])
        distance += 1
    return distance


def load_messages(session_id):
    return load_json(get_session_file(session_id), default=[])


def save_messages(session_id, messages):
    save_json(get_session_file(session_id), messages)


def create_session(session_id, title="New Chat", parent_id=None):
    sessions = load_sessions()
    session = {
        "id": session_id,
        "title": title,
        "parent_id": parent_id,
        "created_at": datetime.now().isoformat(),
    }
    sessions.append(session)
    save_sessions(sessions)

    initial_messages = [
        {
            "id": 1,
            "text": "Hello! I'm your AI assistant. How can I help you today?",
            "sender": "other",
            "role": "assistant",
            "timestamp": datetime.now().isoformat(),
        }
    ]
    save_messages(session_id, initial_messages)

    return session


def delete_session(session_id):
    sessions = load_sessions()

    # Detach children from the deleted session
    for s in sessions:
        if s.get("parent_id") == session_id:
            s["parent_id"] = None

    sessions = [s for s in sessions if s["id"] != session_id]
    save_sessions(sessions)

    filepath = get_session_file(session_id)
    if os.path.exists(filepath):
        os.remove(filepath)


def update_session_title(session_id, title):
    sessions = load_sessions()
    for s in sessions:
        if s["id"] == session_id:
            s["title"] = title
            break
    save_sessions(sessions)


def move_session(session_id, new_parent_id):
    if session_id == new_parent_id:
        return False, "Cannot move a session into itself."

    if new_parent_id is not None:
        descendants = get_descendant_ids(session_id)
        if new_parent_id in descendants:
            return False, "Cannot move a session into its own descendant."

    sessions = load_sessions()
    for s in sessions:
        if s["id"] == session_id:
            s["parent_id"] = new_parent_id
            break

    save_sessions(sessions)
    return True, None

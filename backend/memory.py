from datetime import datetime
import numpy as np
from ai import get_embedding
from session import get_ancestor_ids, load_messages, save_messages


def cosine_similarity(a, b):
    a, b = np.array(a), np.array(b)
    return np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b))


def _is_memory(msg):
    return "embedding" in msg and msg.get("embedding") is not None


def _slice_title(text, max_len=50):
    text = text.strip().replace("\n", " ")
    if len(text) <= max_len:
        return text
    return text[:max_len] + "..."


def enrich_message(text, role):

    return {
        "role": role,
        "title": _slice_title(text),
        "embedding": get_embedding(text),
        "enabled": True,
        "timestamp": datetime.now().isoformat(),
    }


def _collect_memories(session_id):
    ancestor_ids = get_ancestor_ids(session_id)
    all_sessions = [(session_id, 0)] + [
        (aid, i + 1) for i, aid in enumerate(ancestor_ids)
    ]

    results = []
    for sid, dist in all_sessions:
        for msg in load_messages(sid):
            if _is_memory(msg):
                results.append((msg, sid, dist))
    return results


def load_all_memories(session_id):
    memories = []
    for msg, sid, dist in _collect_memories(session_id):
        msg["session_id"] = sid
        msg["inherited"] = sid != session_id
        msg["inherit_distance"] = dist if sid != session_id else 0
        memories.append(msg)
    return memories


def search_memories(session_id, query, top_k=5, threshold=0.5):
    collected = _collect_memories(session_id)
    if not collected:
        return []

    memories = []
    for msg, _sid, dist in collected:
        msg["inherit_distance"] = dist
        memories.append(msg)

    if not memories:
        return []

    query_embedding = get_embedding(query)
    now = datetime.now()

    scored = []
    for m in memories:
        if not m.get("enabled", True):
            continue

        score = cosine_similarity(query_embedding, m["embedding"])

        if m.get("role") == "user" and score > 0.9:
            continue

        if score < threshold:
            continue

        recency_bonus = 0
        if m.get("timestamp"):
            try:
                hours_old = (
                    now - datetime.fromisoformat(m["timestamp"])
                ).total_seconds() / 3600
                recency_bonus = max(0, 0.1 * (1 - hours_old / 168))
            except (ValueError, TypeError):
                pass

        distance_penalty = m.get("inherit_distance", 0) * 0.05
        final_score = score + recency_bonus - distance_penalty

        scored.append({**m, "semantic_score": score, "final_score": final_score})

    scored.sort(key=lambda x: x["final_score"], reverse=True)
    return scored[:top_k]


def toggle_memory(session_id, message_id):
    messages = load_messages(session_id)
    for msg in messages:
        if msg["id"] == message_id and _is_memory(msg):
            msg["enabled"] = not msg.get("enabled", True)
            save_messages(session_id, messages)
            return msg
    return None


def delete_memory(session_id, message_id):
    messages = load_messages(session_id)
    filtered = [msg for msg in messages if msg["id"] != message_id]
    if len(filtered) < len(messages):
        save_messages(session_id, filtered)
        return True
    return False

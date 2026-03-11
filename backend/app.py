import json
import queue
import threading
import time

from flask import Flask, jsonify, request
from flask_cors import CORS

from ai import generate_reply
from clustering import reparent_sessions
from memory import (
    delete_memory,
    enrich_message,
    load_all_memories,
    search_memories,
    toggle_memory,
)
from session import (
    create_session,
    delete_session,
    load_messages,
    load_sessions,
    move_session,
    save_messages,
    update_session_title,
)
from snapshot import (
    delete_snapshot,
    list_snapshots,
    rollback_snapshot,
    take_snapshot,
)

app = Flask(__name__)
CORS(app)

thinking_sessions = set()
thinking_lock = threading.Lock()

clustering_active = False
clustering_started_at = None
clustering_lock = threading.Lock()


subscribers = []
subscribers_lock = threading.Lock()


def notify_clients(event_type, data=None):
    message = f"event: {event_type}\ndata: {json.dumps(data or {})}\n\n"
    with subscribers_lock:
        for sub in subscribers:
            try:
                sub.put_nowait(message)
            except Exception:
                pass


@app.route("/api/events")
def events():
    q = queue.Queue()
    with subscribers_lock:
        subscribers.append(q)
        count = len(subscribers)
    print(
        f"[SSE] Frontend connected ({count} active subscriber{'s' if count != 1 else ''})"
    )

    def generate():
        try:
            # Immediately confirm connection so frontend can clear
            # the disconnected overlay (onopen alone is unreliable)
            yield f"event: connected\ndata: {json.dumps({})}\n\n"
            while True:
                try:
                    msg = q.get(timeout=30)
                    yield msg
                except queue.Empty:
                    # Send heartbeat to detect broken connections
                    yield ": heartbeat\n\n"
        except GeneratorExit:
            pass
        finally:
            with subscribers_lock:
                if q in subscribers:
                    subscribers.remove(q)
                count = len(subscribers)
            print(
                f"[SSE] Frontend disconnected ({count} active subscriber{'s' if count != 1 else ''})"
            )

    return app.response_class(generate(), mimetype="text/event-stream")


@app.route("/api/status", methods=["GET"])
def get_status():
    with thinking_lock:
        sessions = list(thinking_sessions)
    with clustering_lock:
        is_clustering = clustering_active
        started_at = clustering_started_at
    print(f"[STATUS] thinking_sessions={sessions} clustering={is_clustering}")
    return jsonify(
        {
            "thinking_sessions": sessions,
            "clustering": is_clustering,
            "clustering_started_at": started_at,
        }
    )


@app.route("/api/sessions", methods=["GET"])
def get_sessions():
    sessions = load_sessions()
    print(f"[GET /sessions] returning {len(sessions)} sessions")
    return jsonify(sessions)


@app.route("/api/sessions", methods=["POST"])
def new_session():
    data = request.json or {}
    title = data.get("title", "New Chat")
    parent_id = data.get("parent_id")

    sessions = load_sessions()
    session_id = max((s["id"] for s in sessions), default=0) + 1

    session = create_session(session_id, title, parent_id)
    print(f"[POST /sessions] created session {session_id} (parent={parent_id})")
    notify_clients("tree_update")
    return jsonify(session), 201


@app.route("/api/sessions/<int:session_id>", methods=["DELETE"])
def del_session(session_id):
    print(f"[DELETE /sessions/{session_id}]")
    delete_session(session_id)
    notify_clients("tree_update")
    return jsonify({"success": True})


@app.route("/api/sessions/<int:session_id>", methods=["PATCH"])
def patch_session(session_id):
    data = request.json
    title = data.get("title")
    print(f"[PATCH /sessions/{session_id}] title='{title}'")
    update_session_title(session_id, title)
    notify_clients("tree_update")
    return jsonify({"success": True})


@app.route("/api/sessions/<int:session_id>/move", methods=["PATCH"])
def move_session_endpoint(session_id):
    data = request.json
    new_parent_id = data.get("parent_id")
    print(f"[PATCH /sessions/{session_id}/move] new_parent_id={new_parent_id}")

    success, error = move_session(session_id, new_parent_id)
    if success:
        notify_clients("tree_update")
        return jsonify({"success": True})
    print(f"[PATCH /sessions/{session_id}/move] FAILED: {error}")
    return jsonify({"error": error}), 400


@app.route("/api/sessions/<int:session_id>/history", methods=["GET"])
def get_history(session_id):
    messages = load_messages(session_id)
    # Ensure messages are in chronological Q&A order (user query before AI response)
    messages.sort(key=lambda m: (m.get("timestamp", ""), m.get("id", 0)))
    print(f"[GET /sessions/{session_id}/history] returning {len(messages)} messages")

    for msg in messages:
        msg.pop("embedding", None)
    return jsonify(messages)


@app.route("/api/sessions/<int:session_id>/message", methods=["POST"])
def post_message(session_id):
    data = request.json
    user_text = data.get("text", "").strip()
    if not user_text:
        return jsonify({"error": "Empty message"}), 400

    t0 = time.time()
    messages = load_messages(session_id)
    next_id = max((m["id"] for m in messages), default=0) + 1

    user_enrichment = enrich_message(user_text, "user")
    user_message = {
        "id": next_id,
        "text": user_text,
        "sender": "me",
        **user_enrichment,
    }

    messages.append(user_message)
    save_messages(session_id, messages)

    summary = user_enrichment["title"]
    update_session_title(session_id, summary)
    notify_clients("tree_update")

    print(
        f"[MSG {session_id}] saved user message id={next_id} ({time.time() - t0:.2f}s)"
    )

    response = {k: v for k, v in user_message.items() if k != "embedding"}
    return jsonify({"message": response, "title": summary}), 201


@app.route("/api/sessions/<int:session_id>/chat", methods=["POST"])
def chat(session_id):

    with thinking_lock:
        if session_id in thinking_sessions:
            print(
                f"[POST /sessions/{session_id}/chat] REJECTED: session {session_id} already thinking"
            )
            return jsonify(
                {"error": "AI is busy on this session", "session_id": session_id}
            ), 429
        thinking_sessions.add(session_id)

    notify_clients("thinking_start", {"session_id": session_id})
    t_start = time.time()

    try:
        messages = load_messages(session_id)

        user_msg = next(
            (m for m in reversed(messages) if m.get("sender") == "me"), None
        )
        if not user_msg:
            return jsonify({"error": "No user message found"}), 400
        user_text = user_msg["text"]
        print(f"[CHAT {session_id}] user: {user_text[:80]}...")

        t0 = time.time()
        relevant_memories = search_memories(
            session_id, user_text, top_k=10, threshold=0.5
        )
        print(
            f"[CHAT {session_id}] memory search: {len(relevant_memories)} results ({time.time() - t0:.2f}s)"
        )
        for m in relevant_memories:
            dist = m.get("inherit_distance", 0)
            print(
                f"  - score={m.get('final_score', 0):.3f} dist={dist} | {m['text'][:60]}..."
            )

        context = [
            {
                "role": m.get("role", "user"),
                "text": m["text"],
                "timestamp": m.get("timestamp"),
                "inherit_distance": m.get("inherit_distance", 0),
            }
            for m in relevant_memories
        ]

        t0 = time.time()
        ai_reply = generate_reply(user_text, context if context else None)
        print(
            f"[CHAT {session_id}] AI reply generated ({time.time() - t0:.2f}s): {ai_reply[:80]}..."
        )

        t0 = time.time()
        next_id = max((m["id"] for m in messages), default=0) + 1
        ai_message = {
            "id": next_id,
            "text": ai_reply,
            "sender": "other",
            "memories_used": len(relevant_memories),
            **enrich_message(ai_reply, "assistant"),
        }
        print(f"[CHAT {session_id}] AI message enriched ({time.time() - t0:.2f}s)")

        messages.append(ai_message)
        save_messages(session_id, messages)

        print(f"[CHAT {session_id}] DONE total={time.time() - t_start:.2f}s")

        ai_response = {k: v for k, v in ai_message.items() if k != "embedding"}

        notify_clients(
            "new_message", {"session_id": session_id, "message": ai_response}
        )

        return jsonify(
            {
                "ai": ai_response,
                "memories_used": len(relevant_memories),
            }
        ), 201

    finally:
        with thinking_lock:
            thinking_sessions.discard(session_id)
        notify_clients("thinking_end", {"session_id": session_id})
        notify_clients("tree_update")


@app.route("/api/sessions/<int:session_id>/memories", methods=["GET"])
def get_memories(session_id):
    memories = load_all_memories(session_id)
    print(f"[GET /sessions/{session_id}/memories] returning {len(memories)} memories")
    for m in memories:
        m.pop("embedding", None)
    return jsonify(memories)


@app.route(
    "/api/sessions/<int:session_id>/memories/<int:memory_id>", methods=["DELETE"]
)
def del_memory(session_id, memory_id):
    print(f"[DELETE /sessions/{session_id}/memories/{memory_id}]")
    delete_memory(session_id, memory_id)
    return jsonify({"success": True})


@app.route(
    "/api/sessions/<int:session_id>/memories/<int:memory_id>/toggle", methods=["PATCH"]
)
def toggle_mem(session_id, memory_id):
    print(f"[PATCH /sessions/{session_id}/memories/{memory_id}/toggle]")
    memory = toggle_memory(session_id, memory_id)
    if memory:
        return jsonify({"success": True, "enabled": memory["enabled"]})
    return jsonify({"error": "Memory not found"}), 404


@app.route("/api/cluster/reparent", methods=["POST"])
def cluster_reparent():
    global clustering_active, clustering_started_at

    with clustering_lock:
        if clustering_active:
            return jsonify({"error": "A clustering operation is already running"}), 429
        clustering_active = "reparent"
        clustering_started_at = time.time()

    notify_clients("clustering_start", {"operation": "reparent"})
    print("[CLUSTER] Starting reparent_sessions...")

    # Take automatic snapshot before tidy operation
    try:
        snapshot = take_snapshot(reason="auto_tidy")
        print(f"[CLUSTER] Pre-tidy snapshot taken: {snapshot['id']}")
    except Exception as e:
        print(f"[CLUSTER] Warning: Failed to take pre-tidy snapshot: {e}")

    def run():
        global clustering_active
        try:
            result = reparent_sessions()
            print(f"[CLUSTER] reparent_sessions done: {result}")
            notify_clients(
                "clustering_end",
                {
                    "operation": "reparent",
                    "result": result,
                },
            )
            notify_clients("tree_update")
        except Exception as e:
            print(f"[CLUSTER] reparent_sessions FAILED: {e}")
            notify_clients(
                "clustering_end",
                {
                    "operation": "reparent",
                    "error": str(e),
                },
            )
        finally:
            with clustering_lock:
                clustering_active = False
                clustering_started_at = None

    thread = threading.Thread(target=run, daemon=True)
    thread.start()

    return jsonify({"started": True, "operation": "reparent"}), 202


@app.route("/api/snapshots", methods=["GET"])
def get_snapshots():
    snapshots = list_snapshots()
    print(f"[GET /snapshots] returning {len(snapshots)} snapshots")
    return jsonify(snapshots)


@app.route("/api/snapshots", methods=["POST"])
def create_snapshot():
    data = request.json or {}
    reason = data.get("reason", "manual")
    snapshot = take_snapshot(reason=reason)
    print(f"[POST /snapshots] created snapshot {snapshot['id']}")
    notify_clients("tree_update")
    return jsonify(snapshot), 201


@app.route("/api/snapshots/<snapshot_id>/rollback", methods=["POST"])
def rollback_to_snapshot(snapshot_id):
    try:
        result = rollback_snapshot(snapshot_id)
        print(f"[POST /snapshots/{snapshot_id}/rollback] success")
        notify_clients("tree_update")
        return jsonify(result)
    except ValueError as e:
        print(f"[POST /snapshots/{snapshot_id}/rollback] error: {e}")
        return jsonify({"error": str(e)}), 404


@app.route("/api/snapshots/<snapshot_id>", methods=["DELETE"])
def del_snapshot(snapshot_id):
    try:
        delete_snapshot(snapshot_id)
        print(f"[DELETE /snapshots/{snapshot_id}]")
        return jsonify({"success": True})
    except ValueError as e:
        return jsonify({"error": str(e)}), 404


if __name__ == "__main__":
    app.run(debug=True, port=5000, threaded=True)

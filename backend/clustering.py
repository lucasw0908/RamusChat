"""
Two-phase hierarchical clustering for session tree organization.

Phase 1 — Forest partition (complete-linkage agglomerative clustering):
  Groups sessions so that ALL pairwise cosine distances within each group
  are below FOREST_THRESHOLD. This prevents DBSCAN's chaining problem
  where A→B→C forms one cluster even when A and C are dissimilar.
  Each group becomes one tree in the forest. Ungrouped sessions are roots.

Phase 2 — Tree building (nested DBSCAN):
  Within each forest group, recursively applies DBSCAN at progressively
  tighter thresholds to create internal hierarchy.
  The most central session (hub) becomes the tree root.
"""

import numpy as np

from ai import generate_reply, get_embeddings_batch
from memory import _is_memory, _slice_title
from session import (
    load_sessions,
    save_sessions,
    load_messages,
    save_messages,
)


# --- Parameters ---
FOREST_THRESHOLD = 0.4  # complete-linkage cosine distance (all pairs in group < this)
TREE_EPS = 0.3  # DBSCAN eps for within-tree sub-clustering
EPS_DECAY = 0.65  # multiply eps by this each recursion level
MIN_EPS = 0.15  # stop recursion when eps drops below this
MIN_SAMPLES = 2  # minimum points to form a DBSCAN cluster


def _cosine_distance_matrix(embeddings):
    """Pairwise cosine distance matrix: dist(i,j) = 1 - cos_sim(i,j)."""
    norms = np.linalg.norm(embeddings, axis=1, keepdims=True)
    norms = np.maximum(norms, 1e-10)
    normalized = embeddings / norms
    similarity = normalized @ normalized.T
    np.clip(similarity, -1.0, 1.0, out=similarity)
    return 1.0 - similarity


# ---------------------------------------------------------------------------
# Phase 1: Forest partition (complete-linkage)
# ---------------------------------------------------------------------------


def _forest_partition(dist_matrix, threshold):
    """Partition items into groups where all pairwise distances < threshold.

    Uses agglomerative clustering with complete linkage — the distance between
    two groups is the MAXIMUM pairwise distance between their members.
    Only merges that keep every pair within the threshold are allowed.

    Returns a list of lists of indices.
    """
    n = dist_matrix.shape[0]
    group_of = list(range(n))  # each item starts in its own group

    while True:
        # Build current groups
        groups = {}
        for i in range(n):
            groups.setdefault(group_of[i], []).append(i)
        group_ids = sorted(groups.keys())

        if len(group_ids) <= 1:
            break

        # Find the pair of groups with smallest complete-linkage distance
        best_pair = None
        best_dist = threshold

        for ai in range(len(group_ids)):
            for bi in range(ai + 1, len(group_ids)):
                ga = groups[group_ids[ai]]
                gb = groups[group_ids[bi]]
                max_d = dist_matrix[np.ix_(ga, gb)].max()
                if max_d < best_dist:
                    best_dist = max_d
                    best_pair = (group_ids[ai], group_ids[bi])

        if best_pair is None:
            break

        # Merge group b into group a
        ga_id, gb_id = best_pair
        for i in range(n):
            if group_of[i] == gb_id:
                group_of[i] = ga_id

    # Collect final groups
    result = {}
    for i in range(n):
        result.setdefault(group_of[i], []).append(i)
    return list(result.values())


# ---------------------------------------------------------------------------
# Phase 2: Tree building (nested DBSCAN)
# ---------------------------------------------------------------------------


def _dbscan(dist_matrix, eps, min_samples):
    """DBSCAN with precomputed distance matrix.

    Returns an int array of cluster labels (-1 = noise).
    """
    n = dist_matrix.shape[0]
    labels = np.full(n, -1, dtype=int)

    neighborhoods = [set(np.where(dist_matrix[i] <= eps)[0]) for i in range(n)]
    core_points = {i for i in range(n) if len(neighborhoods[i]) >= min_samples}

    cluster_id = 0
    visited = set()

    for i in range(n):
        if i in visited or i not in core_points:
            continue

        queue = [i]
        visited.add(i)
        while queue:
            p = queue.pop(0)
            labels[p] = cluster_id
            if p in core_points:
                for q in neighborhoods[p]:
                    if q not in visited:
                        visited.add(q)
                        queue.append(q)
        cluster_id += 1

    # Assign border points (within eps of a cluster member) to that cluster
    for i in range(n):
        if labels[i] != -1:
            continue
        for j in neighborhoods[i]:
            if labels[j] != -1:
                labels[i] = labels[j]
                break

    return labels


def _find_hub(member_indices, embeddings):
    """Find the most central session (closest to cluster centroid)."""
    member_embs = embeddings[member_indices]
    centroid = member_embs.mean(axis=0)
    dists = np.linalg.norm(member_embs - centroid, axis=1)
    return member_indices[np.argmin(dists)]


def _nested_dbscan(
    member_indices, embeddings, dist_matrix, eps, min_samples, decay, min_eps
):
    """Recursively apply DBSCAN to build sub-hierarchy within a tree.

    Returns a list of (parent_idx, child_idx) edge tuples.
    """
    if len(member_indices) < min_samples:
        return []

    idx_array = np.array(member_indices)
    sub_dist = dist_matrix[np.ix_(idx_array, idx_array)]

    labels = _dbscan(sub_dist, eps, min_samples)

    clusters = {}
    for i, label in enumerate(labels):
        if label != -1:
            clusters.setdefault(label, []).append(member_indices[i])

    if not clusters:
        return []

    edges = []
    next_eps = eps * decay

    for members in clusters.values():
        hub_idx = _find_hub(members, embeddings)
        others = [m for m in members if m != hub_idx]

        if not others:
            continue

        if next_eps >= min_eps and len(others) >= min_samples:
            sub_edges = _nested_dbscan(
                others,
                embeddings,
                dist_matrix,
                next_eps,
                min_samples,
                decay,
                min_eps,
            )
            edges.extend(sub_edges)

            children_in_sub = {child for _, child in sub_edges}
            for m in others:
                if m not in children_in_sub:
                    edges.append((hub_idx, m))
        else:
            for m in others:
                edges.append((hub_idx, m))

    return edges


def _build_tree(group, embeddings, dist_matrix):
    """Build internal hierarchy for a single forest group.

    The most central session becomes the tree root.
    Other members get sub-clustered via nested DBSCAN.
    Returns a list of (parent_idx, child_idx) edge tuples.
    """
    if len(group) < 2:
        return []

    hub = _find_hub(group, embeddings)
    others = [m for m in group if m != hub]

    if len(others) < MIN_SAMPLES:
        # Too few for DBSCAN — direct children of hub
        return [(hub, m) for m in others]

    sub_edges = _nested_dbscan(
        others,
        embeddings,
        dist_matrix,
        TREE_EPS,
        MIN_SAMPLES,
        EPS_DECAY,
        MIN_EPS,
    )

    # Items not placed as children in sub-edges → direct children of hub
    children_in_sub = {child for _, child in sub_edges}
    edges = list(sub_edges)
    for m in others:
        if m not in children_in_sub:
            edges.append((hub, m))

    return edges


# ---------------------------------------------------------------------------
# Session summarization
# ---------------------------------------------------------------------------

MAX_TRANSCRIPT_CHARS = 2000  # truncate long sessions before summarizing


def _build_transcript(messages):
    """Build a concise chat transcript from session messages."""
    lines = []
    for msg in messages:
        role = "User" if msg.get("sender") == "me" else "AI"
        text = _slice_title(msg.get("text", ""), max_len=150)
        lines.append(f"{role}: {text}")
    transcript = "\n".join(lines)
    if len(transcript) > MAX_TRANSCRIPT_CHARS:
        transcript = transcript[:MAX_TRANSCRIPT_CHARS] + "\n...(truncated)"
    return transcript


def _summarize_sessions(sessions_with_messages):
    """Summarize each session's chat history into a short topic description.

    Args:
        sessions_with_messages: list of (session_dict, messages_list) tuples.

    Returns:
        list of summary strings, one per session.
    """
    summaries = []
    for s, messages in sessions_with_messages:
        if not messages:
            summaries.append(s.get("title", "empty session"))
            continue

        transcript = _build_transcript(messages)
        prompt = (
            "Summarize the following conversation in 1-2 concise sentences. "
            "Focus on the main topic and key points discussed.\n\n"
            f"{transcript}\n\nSummary:"
        )
        try:
            summary = generate_reply(prompt)
            summaries.append(summary)
        except Exception as e:
            # Fallback to title if summarization fails
            print(f"[CLUSTER] summarization failed for session {s['id']}: {e}")
            summaries.append(s.get("title", "empty session"))

    return summaries


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------


def _sort_session_messages(session_id):
    """Sort messages in a session file by timestamp."""
    messages = load_messages(session_id)
    if len(messages) <= 1:
        return
    messages.sort(key=lambda m: (m.get("timestamp", ""), m.get("id", 0)))
    save_messages(session_id, messages)


def reparent_sessions():
    """Reorganize the session tree into a forest using two-phase clustering."""

    sessions = load_sessions()
    if len(sessions) < 2:
        return {"clusters": [], "message": "Need at least 2 sessions to reorganize"}

    # --- Step 1: Summarize sessions and compute embeddings ---
    sessions_with_messages = []
    for s in sessions:
        messages = load_messages(s["id"])
        # Use only memory messages (those with embeddings = real chat content)
        mem_msgs = [msg for msg in messages if _is_memory(msg)]
        sessions_with_messages.append((s, mem_msgs))

    print(f"[CLUSTER] summarizing {len(sessions)} sessions...")
    summaries = _summarize_sessions(sessions_with_messages)
    for i, summary in enumerate(summaries):
        print(f"  session {sessions[i]['id']}: {_slice_title(summary, 80)}")

    # Embed all summaries in one batch call
    summary_embeddings = get_embeddings_batch(summaries)
    session_data = [
        (s, np.array(emb))
        for (s, _), emb in zip(sessions_with_messages, summary_embeddings)
    ]

    n = len(session_data)
    embeddings = np.array([sd[1] for sd in session_data])

    # --- Step 2: Pairwise cosine distances ---
    dist_matrix = _cosine_distance_matrix(embeddings)
    print(f"[CLUSTER] {n} sessions, distance matrix computed")

    # --- Step 3: Forest partition (complete-linkage, no chaining) ---
    forest_groups = _forest_partition(dist_matrix, FOREST_THRESHOLD)
    singletons = sum(1 for g in forest_groups if len(g) == 1)
    print(
        f"[CLUSTER] forest partition: {len(forest_groups)} trees "
        f"({singletons} singletons)"
    )

    # --- Step 4: Build internal hierarchy per tree ---
    all_edges = []
    for group in forest_groups:
        all_edges.extend(_build_tree(group, embeddings, dist_matrix))
    print(f"[CLUSTER] tree building: {len(all_edges)} parent-child edges")

    # --- Step 5: Apply tree structure ---
    parent_map = {}
    for parent_idx, child_idx in all_edges:
        parent_map[child_idx] = parent_idx

    children_of = {}
    for child_idx, parent_idx in parent_map.items():
        children_of.setdefault(parent_idx, []).append(child_idx)

    clusters_result = []
    for parent_idx, child_indices in children_of.items():
        clusters_result.append(
            {
                "parent_id": session_data[parent_idx][0]["id"],
                "child_ids": [session_data[ci][0]["id"] for ci in child_indices],
            }
        )

    sessions = load_sessions()
    session_map = {s["id"]: s for s in sessions}

    for s in sessions:
        s["parent_id"] = None

    for cluster in clusters_result:
        parent_id = cluster["parent_id"]
        for child_id in cluster["child_ids"]:
            if child_id in session_map:
                session_map[child_id]["parent_id"] = parent_id

    save_sessions(sessions)

    for s in sessions:
        _sort_session_messages(s["id"])

    print(
        f"[CLUSTER] reparent complete: {len(forest_groups)} trees, "
        f"{len(clusters_result)} parent nodes"
    )
    return {"clusters": clusters_result}

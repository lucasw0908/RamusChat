const API = "http://localhost:5000/api";

export const API_BASE = API;

async function ensureOk(res, label) {
    if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`${label} failed (${res.status}): ${text}`);
    }
    return res;
}

export async function fetchSessions() {
    const res = await fetch(`${API}/sessions`);
    await ensureOk(res, "fetchSessions");
    return res.json();
}

export async function createSession(parentId = null) {
    const res = await fetch(`${API}/sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "New Chat", parent_id: parentId }),
    });
    await ensureOk(res, "createSession");
    return res.json();
}

export async function deleteSession(id) {
    const res = await fetch(`${API}/sessions/${id}`, { method: "DELETE" });
    await ensureOk(res, "deleteSession");
}

export async function patchSessionTitle(sessionId, title) {
    const res = await fetch(`${API}/sessions/${sessionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
    });
    await ensureOk(res, "patchSessionTitle");
}

export async function moveSession(sessionId, newParentId) {
    const res = await fetch(`${API}/sessions/${sessionId}/move`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ parent_id: newParentId }),
    });
    if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `moveSession failed: ${res.status}`);
    }
    return res.json();
}

export async function fetchHistory(sessionId) {
    const res = await fetch(`${API}/sessions/${sessionId}/history`);
    await ensureOk(res, "fetchHistory");
    return res.json();
}

export async function fetchMemories(sessionId) {
    const res = await fetch(`${API}/sessions/${sessionId}/memories`);
    await ensureOk(res, "fetchMemories");
    return res.json();
}

export async function sendMessage(sessionId, text) {
    const res = await fetch(`${API}/sessions/${sessionId}/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
    });
    if (!res.ok) throw new Error(`sendMessage failed: ${res.status}`);
    return res.json();
}

export async function sendChat(sessionId) {
    const res = await fetch(`${API}/sessions/${sessionId}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
    });
    await ensureOk(res, "sendChat");
    return res.json();
}

export async function deleteMemory(sessionId, memoryId) {
    const res = await fetch(`${API}/sessions/${sessionId}/memories/${memoryId}`, { method: "DELETE" });
    await ensureOk(res, "deleteMemory");
    return res.json();
}

export async function toggleMemory(sessionId, memoryId) {
    const res = await fetch(`${API}/sessions/${sessionId}/memories/${memoryId}/toggle`, { method: "PATCH" });
    await ensureOk(res, "toggleMemory");
    return res.json();
}

export async function fetchStatus() {
    const res = await fetch(`${API}/status`);
    await ensureOk(res, "fetchStatus");
    return res.json();
}

export async function clusterReparent() {
    const res = await fetch(`${API}/cluster/reparent`, { method: "POST" });
    if (res.status === 429) throw new Error("A clustering operation is already running");
    if (!res.ok) throw new Error(`clusterReparent failed: ${res.status}`);
    return res.json();
}

export async function fetchSnapshots() {
    const res = await fetch(`${API}/snapshots`);
    await ensureOk(res, "fetchSnapshots");
    return res.json();
}

export async function createSnapshot(reason = "manual") {
    const res = await fetch(`${API}/snapshots`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
    });
    if (!res.ok) throw new Error(`createSnapshot failed: ${res.status}`);
    return res.json();
}

export async function rollbackToSnapshot(snapshotId) {
    const res = await fetch(`${API}/snapshots/${snapshotId}/rollback`, {
        method: "POST",
    });
    if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || `rollback failed: ${res.status}`);
    }
    return res.json();
}

export async function deleteSnapshot(snapshotId) {
    const res = await fetch(`${API}/snapshots/${snapshotId}`, { method: "DELETE" });
    if (!res.ok) throw new Error(`deleteSnapshot failed: ${res.status}`);
    return res.json();
}



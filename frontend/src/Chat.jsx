import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import * as api from "./api";
import Message from "./Message";
import SessionSidebar from "./components/SessionSidebar";
import MemoryPanel from "./components/MemoryPanel";
import TitleEditModal from "./components/TitleEditModal";
import ChatInput from "./components/ChatInput";
import VersionControlPanel from "./components/VersionControlPanel";
import ClusteringLockOverlay from "./components/ClusteringLockOverlay";
import ClusteringResultModal from "./components/ClusteringResultModal";
import DisconnectedOverlay from "./components/DisconnectedOverlay";
import ToastContainer from "./components/ToastContainer";
import { useSSE } from "./hooks/useSSE";
import { useElapsedTimer } from "./hooks/useElapsedTimer";
import { useToast } from "./hooks/useToast";
import { formatElapsed } from "./utils/format";
import EditIcon from '@mui/icons-material/Edit';
import AccountTreeIcon from '@mui/icons-material/AccountTree';
import PsychologyIcon from '@mui/icons-material/Psychology';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import LockIcon from '@mui/icons-material/Lock';
import RestoreIcon from '@mui/icons-material/Restore';
import "./styles.css";

export default function Chat() {
    const { sessionId: urlSessionId } = useParams();
    const navigate = useNavigate();

    // --- State ---
    const [sessions, setSessions] = useState([]);
    const [messages, setMessages] = useState([]);
    const [memories, setMemories] = useState([]);
    const [input, setInput] = useState("");
    const [loading, setLoading] = useState(true);
    const [thinkingSessions, setThinkingSessions] = useState(new Set());
    const [clustering, setClustering] = useState(false);
    const [showSessions, setShowSessions] = useState(true);
    const [isSidebarFullscreen, setIsSidebarFullscreen] = useState(false);
    const [showMemories, setShowMemories] = useState(false);
    const [showScrollBtn, setShowScrollBtn] = useState(false);
    const [editingTitle, setEditingTitle] = useState(false);
    const [titleInput, setTitleInput] = useState("");
    const [clusteringInitialElapsed, setClusteringInitialElapsed] = useState(0);
    const [clusteringResult, setClusteringResult] = useState(null);
    const [showVersionControl, setShowVersionControl] = useState(false);
    const [snapshots, setSnapshots] = useState([]);

    const chatMessagesRef = useRef(null);
    const currentSessionIdRef = useRef(null);
    const initRef = useRef(false);

    // --- Toast notifications ---
    const [toasts, addToast, dismissToast] = useToast();

    // --- Derived state ---
    const currentSession = useMemo(() => {
        if (!urlSessionId) return null;
        const id = parseInt(urlSessionId, 10);
        return sessions.find(s => s.id === id) || null;
    }, [urlSessionId, sessions]);

    const isCurrentSessionThinking = currentSession ? thinkingSessions.has(currentSession.id) : false;
    const canSend = currentSession && !isCurrentSessionThinking;

    // --- Timers ---
    const thinkingElapsed = useElapsedTimer(isCurrentSessionThinking);
    const clusteringElapsed = useElapsedTimer(!!clustering, clusteringInitialElapsed);

    // Keep ref in sync
    useEffect(() => {
        currentSessionIdRef.current = currentSession?.id;
    }, [currentSession?.id]);

    // --- Data loaders ---
    const fetchSessions = useCallback(async () => {
        try {
            setSessions(await api.fetchSessions());
        } catch (err) {
            console.error("Failed to fetch sessions:", err);
            addToast("Failed to load sessions");
        }
    }, [addToast]);

    const loadSessionData = useCallback(async (sessionId) => {
        setLoading(true);
        try {
            const [history, mems] = await Promise.all([
                api.fetchHistory(sessionId),
                api.fetchMemories(sessionId),
            ]);
            if (currentSessionIdRef.current === sessionId) {
                setMessages(history);
                setMemories(mems);
            }
        } catch (err) {
            console.error("Failed to load session data:", err);
            addToast("Failed to load chat history");
        } finally {
            setLoading(false);
        }
    }, [addToast]);

    const refreshMemories = useCallback(async (sessionId) => {
        try {
            const mems = await api.fetchMemories(sessionId);
            if (currentSessionIdRef.current === sessionId) {
                setMemories(mems);
            }
        } catch (err) {
            console.error("Failed to fetch memories:", err);
            addToast("Failed to refresh memories");
        }
    }, [addToast]);

    const refreshSnapshots = useCallback(async () => {
        try {
            setSnapshots(await api.fetchSnapshots());
        } catch (err) {
            console.error("Failed to fetch snapshots:", err);
            addToast("Failed to load snapshots");
        }
    }, [addToast]);

    const setSessionTitle = useCallback((sessionId, title) => {
        setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, title } : s));
    }, []);

    // --- SSE subscription ---
    const sseHandlers = useMemo(() => ({
        connected: () => {
            // Full resync on reconnect — state may be stale after disconnect
            fetchSessions();
            if (currentSessionIdRef.current) loadSessionData(currentSessionIdRef.current);
            api.fetchStatus().then(status => {
                setThinkingSessions(
                    status.thinking_sessions?.length > 0
                        ? new Set(status.thinking_sessions)
                        : new Set()
                );
                if (status.clustering) {
                    setClustering(status.clustering);
                    if (status.clustering_started_at) {
                        const elapsed = Math.floor(Date.now() / 1000 - status.clustering_started_at);
                        setClusteringInitialElapsed(Math.max(0, elapsed));
                    }
                } else {
                    setClustering(false);
                }
            }).catch(err => console.error("Failed to sync status on reconnect:", err));
        },
        tree_update: () => {
            // Only refresh the session list — NOT the current session's messages.
            // Messages are managed by handleSend's optimistic UI + SSE new_message events.
            // Reloading messages here would race with in-flight handleSend and cause duplicates.
            fetchSessions();
        },
        new_message: (data) => {
            if (data.session_id === currentSessionIdRef.current) {
                setMessages(prev => [...prev, data.message]);
                refreshMemories(data.session_id);
            }
        },
        thinking_start: (data) => {
            setThinkingSessions(prev => new Set(prev).add(data.session_id));
        },
        thinking_end: (data) => {
            setThinkingSessions(prev => {
                const next = new Set(prev);
                next.delete(data.session_id);
                return next;
            });
        },
        clustering_start: (data) => {
            setClustering(data.operation);
        },
        clustering_end: (data) => {
            setClustering(false);
            if (data.error) {
                setClusteringResult({ operation: data.operation, error: data.error });
            } else if (data.result) {
                setClusteringResult({ operation: data.operation, ...data.result });
            }
            // Full reload after clustering — session structure may have changed
            fetchSessions();
            if (currentSessionIdRef.current) loadSessionData(currentSessionIdRef.current);
        },
    }), [fetchSessions, loadSessionData, refreshMemories]);

    const { connected, retryCount, nextRetryAt, firstDisconnectAt, retryNow } = useSSE(sseHandlers);

    // --- Init: fetch sessions + sync status ---
    useEffect(() => {
        if (initRef.current) return;
        initRef.current = true;
        fetchSessions();

        api.fetchStatus().then(status => {
            if (status.thinking_sessions?.length > 0) {
                setThinkingSessions(new Set(status.thinking_sessions));
            }
            if (status.clustering) {
                setClustering(status.clustering);
                if (status.clustering_started_at) {
                    const elapsed = Math.floor(Date.now() / 1000 - status.clustering_started_at);
                    setClusteringInitialElapsed(Math.max(0, elapsed));
                }
            }
        }).catch(err => {
            console.error("Failed to fetch status:", err);
            addToast("Failed to sync server status");
        });
    }, [fetchSessions]);

    // Load session data when session changes
    useEffect(() => {
        if (currentSession?.id) loadSessionData(currentSession.id);
    }, [currentSession?.id, loadSessionData]);

    // Auto-scroll on new messages
    useEffect(() => {
        chatMessagesRef.current?.scrollTo(0, chatMessagesRef.current.scrollHeight);
    }, [messages, isCurrentSessionThinking]);

    // Prevent accidental close during clustering
    useEffect(() => {
        if (!clustering) return;
        const handler = (e) => {
            e.preventDefault();
            e.returnValue = "Clustering is in progress. Are you sure you want to leave?";
        };
        window.addEventListener("beforeunload", handler);
        return () => window.removeEventListener("beforeunload", handler);
    }, [clustering]);

    // Escape key toggles sidebar
    useEffect(() => {
        const onKeyDown = (e) => {
            if (e.key === "Escape" && !editingTitle && currentSession) {
                setShowSessions(prev => !prev);
            }
        };
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [editingTitle, currentSession]);

    // Load snapshots when panel opens
    useEffect(() => {
        if (showVersionControl) refreshSnapshots();
    }, [showVersionControl, refreshSnapshots]);

    // --- Session actions ---
    const handleCreateSession = async (parentId = null) => {
        try {
            const session = await api.createSession(parentId);
            setSessions(prev => [...prev, session]);
            navigate(`/chat/${session.id}`);
        } catch (err) {
            console.error("Failed to create session:", err);
            addToast("Failed to create session");
        }
    };

    const handleSelectSession = (session) => navigate(`/chat/${session.id}`);

    const handleDeleteSession = async (e, id) => {
        e.stopPropagation();
        if (thinkingSessions.has(id)) return;
        try {
            await api.deleteSession(id);
            const remaining = sessions.filter(s => s.id !== id);
            setSessions(remaining);
            if (currentSession?.id === id) {
                navigate(remaining.length > 0 ? `/chat/${remaining[0].id}` : "/");
            }
        } catch (err) {
            console.error("Failed to delete session:", err);
            addToast("Failed to delete session");
        }
    };

    const handleMoveSession = async (sessionId, newParentId) => {
        try {
            await api.moveSession(sessionId, newParentId);
            fetchSessions();
        } catch (err) {
            console.error("Failed to move session:", err);
            addToast("Failed to move session: " + err.message);
        }
    };

    // --- Clustering ---
    const handleReparent = async () => {
        if (clustering) return;
        if (!confirm("Tidy up sessions? This will reorganize the session tree by semantic similarity. Messages will NOT be moved.")) return;
        try {
            await api.clusterReparent();
            setClusteringInitialElapsed(0);
            setClustering("reparent");
        } catch (err) {
            console.error("Failed to start reparent:", err);
            addToast("Failed to start clustering: " + err.message);
        }
    };

    // --- Title editing ---
    const handleTitleEdit = () => {
        if (!currentSession) return;
        setTitleInput(currentSession.title || "");
        setEditingTitle(true);
    };

    const handleTitleSave = async () => {
        const trimmed = titleInput.trim();
        if (trimmed && trimmed !== currentSession?.title) {
            try {
                await api.patchSessionTitle(currentSession.id, trimmed);
                setSessionTitle(currentSession.id, trimmed);
            } catch (err) {
                console.error("Failed to update title:", err);
                addToast("Failed to update title");
            }
        }
        setEditingTitle(false);
    };

    // --- AI generation ---
    const triggerAI = useCallback(async (sessionId) => {
        // Optimistically set thinking to prevent double-sends.
        // SSE thinking_end clears it on success; catch clears it on network failure.
        setThinkingSessions(prev => new Set(prev).add(sessionId));
        try {
            await api.sendChat(sessionId);
            // SSE new_message handler delivers the AI reply and refreshes memories.
        } catch (err) {
            console.error("Failed to generate AI reply:", err);
            addToast("Failed to generate AI reply");
            setThinkingSessions(prev => {
                const next = new Set(prev);
                next.delete(sessionId);
                return next;
            });
        }
    }, [addToast]);

    // --- Chat ---
    const handleSend = async () => {
        if (!input.trim() || isCurrentSessionThinking || !currentSession) return;

        const userText = input;
        const sessionId = currentSession.id;

        // Optimistic UI
        const optimisticId = Date.now();
        setMessages(prev => [...prev, { id: optimisticId, text: userText, sender: "me" }]);
        setInput("");

        try {
            const msgData = await api.sendMessage(sessionId, userText);
            if (currentSessionIdRef.current === sessionId) {
                setMessages(prev => prev.map(m => m.id === optimisticId ? msgData.message : m));
            }
            if (msgData.title) setSessionTitle(sessionId, msgData.title);
        } catch (err) {
            console.error("Failed to save message:", err);
            addToast("Failed to send message");
            if (currentSessionIdRef.current === sessionId) {
                setMessages(prev => prev.filter(m => m.id !== optimisticId));
            }
            return;
        }

        await triggerAI(sessionId);
    };

    // --- Memory actions ---
    const handleDeleteMemory = async (memoryId, sessionId) => {
        try {
            await api.deleteMemory(sessionId, memoryId);
            // Deleting a memory deletes the message entirely — refresh both panels
            if (currentSession?.id) {
                setMessages(prev => prev.filter(m => m.id !== memoryId));
                await refreshMemories(currentSession.id);
            }
        } catch (err) {
            console.error("Failed to delete memory:", err);
            addToast("Failed to delete memory");
        }
    };

    const handleToggleMemory = async (memoryId, sessionId) => {
        try {
            const result = await api.toggleMemory(sessionId, memoryId);
            // Update the message's enabled state so dimming is reflected in chat
            if (currentSession?.id) {
                setMessages(prev => prev.map(m =>
                    m.id === memoryId ? { ...m, enabled: result.enabled } : m
                ));
                await refreshMemories(currentSession.id);
            }
        } catch (err) {
            console.error("Failed to toggle memory:", err);
            addToast("Failed to toggle memory");
        }
    };

    // --- Snapshot actions ---
    const handleRollback = async (snapshotId) => {
        try {
            await api.rollbackToSnapshot(snapshotId);
            await fetchSessions();
            if (currentSessionIdRef.current) await loadSessionData(currentSessionIdRef.current);
            await refreshSnapshots();
        } catch (err) {
            console.error("Failed to rollback:", err);
            addToast("Rollback failed: " + err.message);
        }
    };

    const handleDeleteSnapshot = async (snapshotId) => {
        try {
            await api.deleteSnapshot(snapshotId);
            setSnapshots(prev => prev.filter(s => s.id !== snapshotId));
        } catch (err) {
            console.error("Failed to delete snapshot:", err);
            addToast("Failed to delete snapshot");
        }
    };

    // --- Scroll handling ---
    const scrollToBottom = () => {
        chatMessagesRef.current?.scrollTo({
            top: chatMessagesRef.current.scrollHeight,
            behavior: 'smooth',
        });
    };

    const handleScroll = () => {
        if (chatMessagesRef.current) {
            const { scrollTop, scrollHeight, clientHeight } = chatMessagesRef.current;
            setShowScrollBtn(scrollHeight - scrollTop - clientHeight > 300);
        }
    };

    // --- Render ---
    const displayTitle = currentSession?.title || "Select a session from tree";

    return (
        <div className="chat-app">
            {!connected && <DisconnectedOverlay retryCount={retryCount} nextRetryAt={nextRetryAt} firstDisconnectAt={firstDisconnectAt} onRetryNow={retryNow} />}

            {clustering && (
                <ClusteringLockOverlay clustering={clustering} elapsed={clusteringElapsed} />
            )}

            <SessionSidebar
                open={showSessions}
                fullscreen={isSidebarFullscreen}
                sessions={sessions}
                currentSession={currentSession}
                thinkingSessions={thinkingSessions}
                clustering={clustering}
                clusteringElapsed={clusteringElapsed}
                onToggleFullscreen={() => setIsSidebarFullscreen(v => !v)}
                onCreateSession={handleCreateSession}
                onSelectSession={handleSelectSession}
                onDeleteSession={handleDeleteSession}
                onMoveSession={handleMoveSession}
                onReparent={handleReparent}
            />

            <div className="main-area">
                <div className="top-bar">
                    <button
                        className={`toggle-btn ${showSessions ? 'active' : ''}`}
                        onClick={() => setShowSessions(v => !v)}
                    >
                        <AccountTreeIcon sx={{ fontSize: 18, mr: 1, verticalAlign: 'middle' }} />
                        Tree
                    </button>
                    <button
                        className={`toggle-btn ${showMemories ? 'active' : ''}`}
                        onClick={() => {
                            setShowMemories(v => {
                                if (!v && currentSession) refreshMemories(currentSession.id);
                                return !v;
                            });
                        }}
                    >
                        <PsychologyIcon sx={{ fontSize: 18, mr: 1, verticalAlign: 'middle' }} />
                        {memories.length}
                    </button>
                    <button
                        className={`toggle-btn ${showVersionControl ? 'active' : ''}`}
                        onClick={() => setShowVersionControl(v => !v)}
                    >
                        <RestoreIcon sx={{ fontSize: 18, mr: 1, verticalAlign: 'middle' }} />
                        History
                    </button>
                </div>

                {showMemories && (
                    <MemoryPanel
                        memories={memories}
                        hasParent={!!currentSession?.parent_id}
                        onToggle={handleToggleMemory}
                        onDelete={handleDeleteMemory}
                        onClose={() => setShowMemories(false)}
                    />
                )}

                {showVersionControl && (
                    <VersionControlPanel
                        snapshots={snapshots}
                        onRollback={handleRollback}
                        onDelete={handleDeleteSnapshot}
                        onClose={() => setShowVersionControl(false)}
                        disabled={!!clustering || thinkingSessions.size > 0}
                    />
                )}

                <div className="chat-container">
                    <div className="chat-header">
                        <div className="chat-header-content">
                            <span className="chat-header-title">{displayTitle}</span>
                            <button
                                className="edit-title-btn"
                                onClick={handleTitleEdit}
                                disabled={!currentSession}
                                title="Edit title"
                            >
                                <EditIcon sx={{ fontSize: 16 }} />
                            </button>
                        </div>
                    </div>

                    {editingTitle && (
                        <TitleEditModal
                            value={titleInput}
                            onChange={setTitleInput}
                            onSave={handleTitleSave}
                            onCancel={() => setEditingTitle(false)}
                        />
                    )}

                    <div className="chat-messages-wrapper">
                        <div className="chat-messages" ref={chatMessagesRef} onScroll={handleScroll}>
                            {!currentSession ? (
                                <div className="loading-text">Select a chat from the tree view</div>
                            ) : loading ? (
                                <div className="loading-text">Loading...</div>
                            ) : messages.length === 0 ? (
                                <div className="loading-text">No messages yet</div>
                            ) : (
                                messages.map((msg) => (
                                        <Message
                                            key={msg.id}
                                            message={msg}
                                        />
                                    ))
                            )}
                            {isCurrentSessionThinking && (
                                <div className="chat-thinking">
                                    <div className="chat-thinking-label">
                                        <span>Generating response</span>
                                        <span className="chat-thinking-dots">
                                            <span /><span /><span />
                                        </span>
                                    </div>
                                </div>
                            )}
                        </div>
                        {showScrollBtn && (
                            <button className="scroll-bottom-btn" onClick={scrollToBottom}>
                                <ArrowDownwardIcon sx={{ fontSize: 20 }} />
                            </button>
                        )}
                    </div>

                    <div className="chat-input-wrapper">
                        {isCurrentSessionThinking && (
                            <div className="thinking-status">
                                <LockIcon sx={{ fontSize: 14 }} />
                                <span className="thinking-status-text">AI is running</span>
                                <span className="thinking-status-timer">{formatElapsed(thinkingElapsed)}</span>
                            </div>
                        )}
                        <ChatInput
                            value={input}
                            onChange={setInput}
                            onSend={handleSend}
                            disabled={!canSend}
                            thinking={isCurrentSessionThinking}
                        />
                    </div>
                </div>
            </div>

            {clusteringResult && (
                <ClusteringResultModal
                    result={clusteringResult}
                    onClose={() => setClusteringResult(null)}
                />
            )}

            <ToastContainer toasts={toasts} onDismiss={dismissToast} />
        </div>
    );
}

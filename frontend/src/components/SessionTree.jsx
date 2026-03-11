import { useState, useRef, useEffect, useMemo } from "react";
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';

function buildTree(sessions) {
    const map = {};
    const roots = [];

    sessions.forEach(s => {
        map[s.id] = { ...s, children: [] };
    });

    sessions.forEach(s => {
        if (s.parent_id && map[s.parent_id]) {
            map[s.parent_id].children.push(map[s.id]);
        } else {
            roots.push(map[s.id]);
        }
    });

    return roots;
}

function DAGNode({ session, currentSession, thinkingSessions, onSelect, onDelete, onCreateChild, onMoveSession, depth = 0 }) {
    const [expanded, setExpanded] = useState(true);
    const [isDragOver, setIsDragOver] = useState(false);
    const dragCounter = useRef(0);

    // Auto-expand when selected
    useEffect(() => {
        if (currentSession?.id === session.id) {
            setExpanded(true);
        }
    }, [currentSession?.id, session.id]);

    const hasChildren = session.children?.length > 0;
    const isActive = currentSession?.id === session.id;
    const isThinking = thinkingSessions.has(session.id);

    const handleDragStart = (e) => {
        e.dataTransfer.setData("text/plain", session.id);
        e.dataTransfer.effectAllowed = "move";
        setTimeout(() => e.target.classList.add('dragging'), 0);
    };

    const handleDragEnd = (e) => {
        e.target.classList.remove('dragging');
    };

    const handleDragOver = (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
    };

    const handleDragEnter = (e) => {
        e.preventDefault();
        e.stopPropagation();
        dragCounter.current += 1;
        if (dragCounter.current === 1) setIsDragOver(true);
    };

    const handleDragLeave = (e) => {
        e.preventDefault();
        e.stopPropagation();
        dragCounter.current -= 1;
        if (dragCounter.current === 0) setIsDragOver(false);
    };

    const handleDrop = (e) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragOver(false);
        dragCounter.current = 0;
        const draggedSessionId = parseInt(e.dataTransfer.getData("text/plain"), 10);
        if (draggedSessionId && draggedSessionId !== session.id) {
            onMoveSession(draggedSessionId, session.id);
        }
    };

    return (
        <div className="dag-node-wrapper" style={{ '--depth': depth }}>
            <div className="dag-node-container">
                <div
                    className={`dag-node ${isActive ? 'active' : ''} ${isThinking ? 'thinking' : ''} ${isDragOver ? 'drag-over' : ''}`}
                    onClick={() => onSelect(session)}
                    onDragOver={handleDragOver}
                    onDragEnter={handleDragEnter}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                >
                    <div
                        className="dag-node-header"
                        draggable={true}
                        onDragStart={handleDragStart}
                        onDragEnd={handleDragEnd}
                    >
                        <div className="dag-node-left">
                            {hasChildren ? (
                                <div
                                    className="dag-expand-icon"
                                    onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
                                >
                                    {expanded
                                        ? <ExpandMoreIcon sx={{ fontSize: 16 }} />
                                        : <ChevronRightIcon sx={{ fontSize: 16 }} />
                                    }
                                </div>
                            ) : (
                                <div className="dag-node-dot-spacer" />
                            )}
                            <span className="dag-node-title" title={session.title}>{session.title}</span>
                        </div>
                        {isThinking && (
                            <div className="thinking-dots">
                                <span /><span /><span />
                            </div>
                        )}
                    </div>
                    <div className="dag-node-actions">
                        <button
                            className="dag-action-btn add"
                            onClick={(e) => { e.stopPropagation(); onCreateChild(session.id); }}
                            title="Add child branch"
                        >
                            <AddIcon sx={{ fontSize: 14 }} />
                        </button>
                        <button
                            className="dag-action-btn delete"
                            onClick={(e) => { e.stopPropagation(); onDelete(e, session.id); }}
                            title="Delete branch"
                        >
                            <DeleteOutlineIcon sx={{ fontSize: 14 }} />
                        </button>
                    </div>
                </div>
                {hasChildren && expanded && (
                    <div className="dag-children">
                        {session.children.map((child, index) => (
                            <DAGNode
                                key={child.id}
                                session={child}
                                currentSession={currentSession}
                                thinkingSessions={thinkingSessions}
                                onSelect={onSelect}
                                onDelete={onDelete}
                                onCreateChild={onCreateChild}
                                onMoveSession={onMoveSession}
                                depth={depth + 1}
                                isLast={index === session.children.length - 1}
                            />
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

export default function SessionTree({ sessions, currentSession, thinkingSessions, onSelect, onDelete, onCreateChild, onMoveSession }) {
    const sessionTree = useMemo(() => buildTree(sessions), [sessions]);

    return (
        <div className="dag-container">
            <div className="dag-roots">
                {sessionTree.map((session, index) => (
                    <DAGNode
                        key={session.id}
                        session={session}
                        currentSession={currentSession}
                        thinkingSessions={thinkingSessions}
                        onSelect={onSelect}
                        onDelete={onDelete}
                        onCreateChild={onCreateChild}
                        onMoveSession={onMoveSession}
                        isLast={index === sessionTree.length - 1}
                    />
                ))}
            </div>

            {/* Root drop zone for moving to top level */}
            <div
                className="dag-root-dropzone"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                    e.preventDefault();
                    const draggedSessionId = parseInt(e.dataTransfer.getData("text/plain"), 10);
                    if (draggedSessionId) {
                        onMoveSession(draggedSessionId, null);
                    }
                }}
            >
                Drag here to move to root level
            </div>
        </div>
    );
}

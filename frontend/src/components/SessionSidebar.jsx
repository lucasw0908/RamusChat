import SessionTree from "./SessionTree";
import AddIcon from '@mui/icons-material/Add';
import FullscreenIcon from '@mui/icons-material/Fullscreen';
import FullscreenExitIcon from '@mui/icons-material/FullscreenExit';
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh';
import TimerIcon from '@mui/icons-material/Timer';
import { formatElapsed } from '../utils/format';

export default function SessionSidebar({
    open,
    fullscreen,
    sessions,
    currentSession,
    thinkingSessions,
    clustering,
    clusteringElapsed,
    onToggleFullscreen,
    onCreateSession,
    onSelectSession,
    onDeleteSession,
    onMoveSession,
    onReparent,
}) {
    return (
        <div className={`session-sidebar ${open ? 'open' : ''} ${fullscreen ? 'fullscreen' : ''}`}>
            <div className="session-header">
                <button
                    className="fullscreen-toggle-btn"
                    onClick={onToggleFullscreen}
                    title={fullscreen ? "Exit Fullscreen" : "Fullscreen Tree"}
                >
                    {fullscreen
                        ? <FullscreenExitIcon sx={{ fontSize: 20 }} />
                        : <FullscreenIcon sx={{ fontSize: 20 }} />
                    }
                </button>
                <h3>Sessions</h3>
                <button
                    className="new-session-btn"
                    onClick={() => onCreateSession()}
                >
                    <AddIcon sx={{ fontSize: 18 }} />
                </button>
            </div>
            <div className="dag-scroll">
                <SessionTree
                    sessions={sessions}
                    currentSession={currentSession}
                    thinkingSessions={thinkingSessions}
                    onSelect={onSelectSession}
                    onDelete={onDeleteSession}
                    onCreateChild={onCreateSession}
                    onMoveSession={onMoveSession}
                />
            </div>
            <div className="cluster-actions">
                {clustering && (
                    <div className="clustering-status">
                        <TimerIcon sx={{ fontSize: 14 }} />
                        <span className="clustering-status-text">
                            {clustering === "reparent" ? "Re-parenting..." : "Restructuring..."}
                        </span>
                        <span className="clustering-status-timer">{formatElapsed(clusteringElapsed)}</span>
                    </div>
                )}
                <div className="cluster-buttons">
                    <button
                        className={`cluster-btn reparent ${clustering === "reparent" ? "active" : ""}`}
                        onClick={onReparent}
                        disabled={!!clustering || thinkingSessions.size > 0 || sessions.length < 2}
                    >
                        <AutoFixHighIcon sx={{ fontSize: 16 }} />
                        <span>Tidy up</span>
                    </button>
                </div>
            </div>
        </div>
    );
}

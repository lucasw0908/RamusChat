import { useState } from "react";
import RestoreIcon from "@mui/icons-material/Restore";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import CloseIcon from "@mui/icons-material/Close";
import AutoFixHighIcon from "@mui/icons-material/AutoFixHigh";
import SaveIcon from "@mui/icons-material/Save";
import UndoIcon from "@mui/icons-material/Undo";

const REASON_LABELS = {
    auto_tidy: "Auto Tidy",
    manual: "Manual",
    pre_rollback: "Pre-Rollback",
};

function formatDate(isoString) {
    const d = new Date(isoString);
    const now = new Date();
    const diffMs = now - d;
    const diffMin = Math.floor(diffMs / 60000);
    const diffHr = Math.floor(diffMs / 3600000);
    const diffDay = Math.floor(diffMs / 86400000);

    if (diffMin < 1) return "Just now";
    if (diffMin < 60) return `${diffMin}m ago`;
    if (diffHr < 24) return `${diffHr}h ago`;
    if (diffDay < 7) return `${diffDay}d ago`;

    return d.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    });
}

function ReasonBadge({ reason }) {
    const label = REASON_LABELS[reason] || reason;
    const className = `snapshot-reason-badge ${reason}`;
    return <span className={className}>{label}</span>;
}

export default function VersionControlPanel({
    snapshots,
    onRollback,
    onDelete,
    onClose,
    disabled,
}) {
    const [confirmingId, setConfirmingId] = useState(null);
    const [rollingBack, setRollingBack] = useState(false);

    const handleRollback = async (snapshotId) => {
        if (confirmingId !== snapshotId) {
            setConfirmingId(snapshotId);
            return;
        }
        setRollingBack(true);
        try {
            await onRollback(snapshotId);
        } finally {
            setRollingBack(false);
            setConfirmingId(null);
        }
    };

    const handleDelete = async (e, snapshotId) => {
        e.stopPropagation();
        if (!confirm("Delete this snapshot? This cannot be undone.")) return;
        await onDelete(snapshotId);
    };

    return (
        <div className="version-control-panel">
            <div className="version-control-header">
                <div className="version-control-header-left">
                    <RestoreIcon sx={{ fontSize: 16 }} />
                    <h4>Version History</h4>
                </div>
                <button className="close-panel-btn" onClick={onClose}>
                    <CloseIcon sx={{ fontSize: 18 }} />
                </button>
            </div>

            {snapshots.length === 0 ? (
                <div className="version-control-empty">
                    <p>No snapshots yet.</p>
                    <p className="version-control-hint">
                        Snapshots are created automatically before each Tidy
                        operation.
                    </p>
                </div>
            ) : (
                <div className="snapshot-list">
                    {snapshots.map((snap, index) => (
                        <div
                            key={snap.id}
                            className={`snapshot-item ${confirmingId === snap.id ? "confirming" : ""} ${index === 0 ? "latest" : ""}`}
                        >
                            <div className="snapshot-item-left">
                                <div className="snapshot-timeline-dot" />
                                <div className="snapshot-info">
                                    <div className="snapshot-info-top">
                                        <ReasonBadge reason={snap.reason} />
                                        <span className="snapshot-sessions">
                                            {snap.session_count} sessions
                                        </span>
                                    </div>
                                    <span className="snapshot-date">
                                        {formatDate(snap.created_at)}
                                    </span>
                                </div>
                            </div>
                            <div className="snapshot-actions">
                                {confirmingId === snap.id ? (
                                    <>
                                        <button
                                            className="snapshot-btn confirm-rollback"
                                            onClick={() =>
                                                handleRollback(snap.id)
                                            }
                                            disabled={rollingBack || disabled}
                                            title="Confirm rollback"
                                        >
                                            <UndoIcon sx={{ fontSize: 14 }} />
                                            <span>
                                                {rollingBack
                                                    ? "..."
                                                    : "Confirm"}
                                            </span>
                                        </button>
                                        <button
                                            className="snapshot-btn cancel-rollback"
                                            onClick={() =>
                                                setConfirmingId(null)
                                            }
                                            disabled={rollingBack}
                                        >
                                            Cancel
                                        </button>
                                    </>
                                ) : (
                                    <>
                                        <button
                                            className="snapshot-btn rollback"
                                            onClick={() =>
                                                handleRollback(snap.id)
                                            }
                                            disabled={disabled}
                                            title="Roll back to this version"
                                        >
                                            <UndoIcon sx={{ fontSize: 14 }} />
                                        </button>
                                        <button
                                            className="snapshot-btn delete"
                                            onClick={(e) =>
                                                handleDelete(e, snap.id)
                                            }
                                            disabled={disabled}
                                            title="Delete snapshot"
                                        >
                                            <DeleteOutlineIcon
                                                sx={{ fontSize: 14 }}
                                            />
                                        </button>
                                    </>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

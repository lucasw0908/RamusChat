import { useEffect } from 'react';
import CloseIcon from '@mui/icons-material/Close';

export default function ClusteringResultModal({ result, onClose }) {
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key === "Escape") { e.stopPropagation(); onClose(); }
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [onClose]);

    const isError = !!result.error;
    const clusters = result.clusters || [];
    const totalChildren = clusters.reduce((sum, c) => sum + (c.child_ids?.length || 0), 0);

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal clustering-result-modal" onClick={(e) => e.stopPropagation()}>
                <div className="clustering-result-header">
                    <h3>{isError ? "Clustering Failed" : "Tidy Complete"}</h3>
                    <button className="close-panel-btn" onClick={onClose}>
                        <CloseIcon sx={{ fontSize: 18 }} />
                    </button>
                </div>
                {isError ? (
                    <div className="clustering-result-error">{result.error}</div>
                ) : (
                    <div className="clustering-result-body">
                        <div className="clustering-result-stat">
                            <span className="clustering-result-label">Parent nodes</span>
                            <span className="clustering-result-value">{clusters.length}</span>
                        </div>
                        <div className="clustering-result-stat">
                            <span className="clustering-result-label">Sessions reparented</span>
                            <span className="clustering-result-value">{totalChildren}</span>
                        </div>
                    </div>
                )}
                <div className="modal-actions">
                    <button className="modal-btn save" onClick={onClose}>OK</button>
                </div>
            </div>
        </div>
    );
}

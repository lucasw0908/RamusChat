import HourglassTopIcon from '@mui/icons-material/HourglassTop';
import { formatElapsed } from '../utils/format';

export default function ClusteringLockOverlay({ clustering, elapsed }) {
    const operationLabel = clustering === "reparent"
        ? "Tidying up sessions..."
        : "Restructuring sessions";

    return (
        <div className="clustering-lock-overlay">
            <div className="clustering-lock-content">
                <HourglassTopIcon className="spin" sx={{ fontSize: 40, color: '#999' }} />
                <h2>{operationLabel}</h2>
                <p className="clustering-lock-desc">
                    Please wait while the AI reorganizes your sessions.
                    <br />Do not close or refresh this page.
                </p>
                <span className="clustering-lock-timer">{formatElapsed(elapsed)}</span>
            </div>
        </div>
    );
}

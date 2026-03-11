import { useState, useEffect } from 'react';
import CloudOffIcon from '@mui/icons-material/CloudOff';
import RefreshIcon from '@mui/icons-material/Refresh';

const FAST_DURATION = 60000; // must match useSSE.js

export default function DisconnectedOverlay({ retryCount, nextRetryAt, firstDisconnectAt, onRetryNow }) {
    const [countdown, setCountdown] = useState(0);
    const [slowPhase, setSlowPhase] = useState(false);

    // Countdown ticker — only meaningful during slow phase
    useEffect(() => {
        if (!nextRetryAt) { setCountdown(0); return; }
        const tick = () => setCountdown(Math.max(0, Math.ceil((nextRetryAt - Date.now()) / 1000)));
        tick();
        const id = setInterval(tick, 250);
        return () => clearInterval(id);
    }, [nextRetryAt]);

    // Track whether we've crossed the 60s threshold
    useEffect(() => {
        if (!firstDisconnectAt) { setSlowPhase(false); return; }
        const remaining = FAST_DURATION - (Date.now() - firstDisconnectAt);
        if (remaining <= 0) { setSlowPhase(true); return; }
        const id = setTimeout(() => setSlowPhase(true), remaining);
        return () => clearTimeout(id);
    }, [firstDisconnectAt]);

    const connecting = countdown === 0;

    return (
        <div className="disconnected-overlay">
            <div className="disconnected-overlay-content">
                <CloudOffIcon className="pulse" sx={{ fontSize: 48, color: '#e57373' }} />
                <h2>Backend Disconnected</h2>
                <p className="disconnected-overlay-desc">
                    Unable to reach the server. Make sure the backend is running.
                </p>
                <div className="disconnected-overlay-status">
                    <div className="disconnected-status-row">
                        <span className="disconnected-label">Status</span>
                        <span className="disconnected-value retrying">
                            <span className="disconnected-status-dot" />
                            {connecting ? 'Connecting...' : 'Waiting to retry'}
                        </span>
                    </div>
                    {slowPhase && !connecting && (
                        <div className="disconnected-status-row">
                            <span className="disconnected-label">Retrying in</span>
                            <span className="disconnected-value">{countdown}s</span>
                        </div>
                    )}
                    {retryCount > 0 && (
                        <div className="disconnected-status-row">
                            <span className="disconnected-label">Attempt</span>
                            <span className="disconnected-value">{retryCount}</span>
                        </div>
                    )}
                </div>
                {slowPhase && !connecting && (
                    <button className="disconnected-retry-btn" onClick={onRetryNow}>
                        <RefreshIcon sx={{ fontSize: 16 }} />
                        Retry Now
                    </button>
                )}
                {(!slowPhase || connecting) && (
                    <div className="disconnected-overlay-dots">
                        <span /><span /><span />
                    </div>
                )}
            </div>
        </div>
    );
}

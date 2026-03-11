import { useState, useEffect } from 'react';

/**
 * Counts elapsed seconds while `isActive` is true.
 * Optionally accepts an `initialValue` (e.g. synced from backend).
 * Resets to 0 when `isActive` becomes false.
 *
 * @param {boolean} isActive  - whether the timer should be running
 * @param {number}  initialValue - starting value (default 0)
 * @returns {number} elapsed seconds
 */
export function useElapsedTimer(isActive, initialValue = 0) {
    const [elapsed, setElapsed] = useState(initialValue);

    useEffect(() => {
        if (!isActive) {
            setElapsed(0);
            return;
        }
        setElapsed(initialValue);
        const interval = setInterval(() => setElapsed(e => e + 1), 1000);
        return () => clearInterval(interval);
    }, [isActive, initialValue]);

    return elapsed;
}

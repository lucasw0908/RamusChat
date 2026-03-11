import { useEffect, useState, useRef, useCallback } from 'react';
import { API_BASE } from '../api';

const FAST_DELAY    = 2000;   // 2s between retries during fast phase
const FAST_DURATION = 60000;  // fast phase lasts 60s
const BACKOFF_BASE  = 4000;   // first slow retry delay
const MAX_DELAY     = 30000;  // 30s cap

/**
 * Subscribe to Server-Sent Events from the backend.
 *
 * Retry strategy (two-phase):
 *   - First 60s after disconnect: constant 2s retries (fast phase)
 *   - After 60s: exponential backoff 4s → 8s → 16s → 30s (capped)
 *
 * The hook exposes `nextRetryAt` (epoch-ms timestamp) so the UI can
 * render a live countdown, and `retryNow` to let the user skip the wait.
 *
 * @param {Object} handlers - map of event names to handler functions.
 * @returns {{ connected: boolean, retryCount: number, nextRetryAt: number|null, retryNow: () => void }}
 */
export function useSSE(handlers) {
    const [connected, setConnected]               = useState(true);
    const [retryCount, setRetryCount]             = useState(0);
    const [nextRetryAt, setNextRetryAt]           = useState(null);
    const [firstDisconnectAt, setFirstDisconnectAt] = useState(null);

    const retryTimerRef      = useRef(null);
    const eventSourceRef     = useRef(null);
    const handlersRef        = useRef(handlers);
    const retryCountRef      = useRef(0);
    const firstDisconnectRef = useRef(null);
    const backoffStepRef     = useRef(0);
    handlersRef.current = handlers;

    const clearRetryTimer = useCallback(() => {
        if (retryTimerRef.current) {
            clearTimeout(retryTimerRef.current);
            retryTimerRef.current = null;
        }
    }, []);

    const connect = useCallback(() => {
        // Tear down previous EventSource
        if (eventSourceRef.current) {
            eventSourceRef.current.close();
            eventSourceRef.current = null;
        }

        const eventSource = new EventSource(`${API_BASE}/events`);
        eventSourceRef.current = eventSource;

        const markConnected = () => {
            clearRetryTimer();
            setConnected(true);
            setNextRetryAt(null);
            setFirstDisconnectAt(null);
            setRetryCount(0);
            retryCountRef.current = 0;
            firstDisconnectRef.current = null;
            backoffStepRef.current = 0;
        };

        eventSource.onopen = markConnected;

        // Backend yields an explicit "connected" event on every new
        // SSE connection — the authoritative reconnection signal.
        eventSource.addEventListener('connected', markConnected);

        for (const [event, handler] of Object.entries(handlersRef.current)) {
            eventSource.addEventListener(event, (e) => {
                try {
                    const data = e.data ? JSON.parse(e.data) : {};
                    handler(data);
                } catch {
                    handler({});
                }
            });
        }

        eventSource.onerror = () => {
            // Disable browser auto-reconnect — we manage retries ourselves
            eventSource.close();
            eventSourceRef.current = null;

            if (!firstDisconnectRef.current) {
                firstDisconnectRef.current = Date.now();
                setFirstDisconnectAt(firstDisconnectRef.current);
            }

            retryCountRef.current += 1;
            const attempt = retryCountRef.current;

            // Two-phase: fast constant retries, then exponential backoff
            const elapsed = Date.now() - firstDisconnectRef.current;
            let delay;
            if (elapsed < FAST_DURATION) {
                delay = FAST_DELAY;
            } else {
                backoffStepRef.current += 1;
                delay = Math.min(BACKOFF_BASE * Math.pow(2, backoffStepRef.current - 1), MAX_DELAY);
            }

            setRetryCount(attempt);
            setNextRetryAt(Date.now() + delay);
            setConnected(false);

            console.warn(`SSE: retry #${attempt} in ${delay / 1000}s (disconnected ${Math.round(elapsed / 1000)}s ago)`);

            retryTimerRef.current = setTimeout(() => {
                retryTimerRef.current = null;
                connect();
            }, delay);
        };
    }, [clearRetryTimer]);

    /** Skip the backoff countdown and reconnect immediately. */
    const retryNow = useCallback(() => {
        clearRetryTimer();
        setNextRetryAt(null);
        connect();
    }, [clearRetryTimer, connect]);

    useEffect(() => {
        connect();
        return () => {
            clearRetryTimer();
            if (eventSourceRef.current) {
                eventSourceRef.current.close();
                eventSourceRef.current = null;
            }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return { connected, retryCount, nextRetryAt, firstDisconnectAt, retryNow };
}

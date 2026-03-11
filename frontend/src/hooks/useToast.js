import { useState, useCallback, useRef } from "react";

/**
 * Lightweight toast notification hook.
 * Returns [toasts, addToast, dismissToast] — no external deps.
 *
 * Usage:
 *   const [toasts, addToast, dismissToast] = useToast();
 *   addToast("Something went wrong", "error");
 */
export function useToast(autoHideMs = 5000) {
    const [toasts, setToasts] = useState([]);
    const nextId = useRef(0);

    const addToast = useCallback((message, type = "error") => {
        const id = nextId.current++;
        setToasts(prev => [...prev, { id, message, type }]);

        if (autoHideMs > 0) {
            setTimeout(() => {
                setToasts(prev => prev.filter(t => t.id !== id));
            }, autoHideMs);
        }
    }, [autoHideMs]);

    const dismissToast = useCallback((id) => {
        setToasts(prev => prev.filter(t => t.id !== id));
    }, []);

    return [toasts, addToast, dismissToast];
}

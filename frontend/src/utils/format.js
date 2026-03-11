/**
 * Format seconds as M:SS elapsed time string.
 */
export function formatElapsed(s) {
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

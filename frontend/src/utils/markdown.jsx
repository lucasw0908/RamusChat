/**
 * Shared markdown rendering utilities.
 *
 * - preprocessLaTeX: converts bracket delimiters to dollar-sign delimiters
 * - markdownComponents: custom ReactMarkdown component overrides
 */

/**
 * Convert LaTeX bracket delimiters to dollar-sign delimiters
 * so remark-math can parse them.
 *   \(...\)  ->  $...$       (inline)
 *   \[...\]  ->  $$...$$     (display, on own lines)
 *
 * Skips content inside code fences (``` blocks) and inline code (`...`).
 */
export function preprocessLaTeX(text) {
    const parts = text.split(/(```[\s\S]*?```|`[^`]+`)/g);
    return parts.map((part, i) => {
        if (i % 2 === 1) return part;
        part = part.replace(/\\\[([\s\S]*?)\\\]/g, (_match, inner) => {
            return `\n$$\n${inner.trim()}\n$$\n`;
        });
        part = part.replace(/\\\(([\s\S]*?)\\\)/g, (_match, inner) => {
            return `$${inner}$`;
        });
        return part;
    }).join('');
}

/**
 * Shared component overrides for ReactMarkdown.
 * Used by Message.jsx and MemoryPanel.jsx.
 */
export const markdownComponents = {
    code({ className, children, ...props }) {
        const match = /language-(\w+)/.exec(className || '');
        const isInline = !match && !String(children).includes('\n');
        return isInline ? (
            <code className="inline-code" {...props}>
                {children}
            </code>
        ) : (
            <pre className="code-block">
                <code className={className} {...props}>
                    {children}
                </code>
            </pre>
        );
    },
    table({ children }) {
        return <table className="md-table">{children}</table>;
    },
    h1({ children }) {
        return <h1 className="md-h1">{children}</h1>;
    },
    h2({ children }) {
        return <h2 className="md-h2">{children}</h2>;
    },
    h3({ children }) {
        return <h3 className="md-h3">{children}</h3>;
    },
    ul({ children }) {
        return <ul className="md-ul">{children}</ul>;
    },
};

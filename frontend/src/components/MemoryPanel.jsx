import { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import { preprocessLaTeX, markdownComponents } from '../utils/markdown';
import CloseIcon from '@mui/icons-material/Close';
import PersonIcon from '@mui/icons-material/Person';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';

function MemoryItem({ memory, onToggle, onDelete, onClickText }) {
    const { id, session_id, inherited, enabled, role, title, text, inherit_distance } = memory;
    const isDisabled = enabled === false;

    return (
        <div className={`memory-item ${inherited ? "inherited" : ""} ${isDisabled ? "disabled" : ""}`}>
            <input
                type="checkbox"
                className="memory-checkbox"
                checked={!isDisabled}
                onChange={() => onToggle(id, session_id)}
                title={isDisabled ? "Enable memory" : "Disable memory"}
            />
            <span className="memory-role">
                {role === "user"
                    ? <PersonIcon sx={{ fontSize: 16, color: '#aaa' }} />
                    : <SmartToyIcon sx={{ fontSize: 16, color: '#10a37f' }} />
                }
            </span>
            <span className="memory-text clickable" onClick={() => onClickText(memory)}>{title || text.slice(0, 50)}</span>
            {inherited && <span className="inherited-tag">&#8593;{inherit_distance || 1}</span>}
            <div className="memory-actions">
                {!inherited && (
                    <button className="delete-btn" onClick={() => onDelete(id, session_id)}>
                        <DeleteOutlineIcon sx={{ fontSize: 14 }} />
                    </button>
                )}
            </div>
        </div>
    );
}

function MemoryModal({ memory, onClose }) {
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key === "Escape") { e.stopPropagation(); onClose(); }
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [onClose]);

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal memory-modal" onClick={(e) => e.stopPropagation()}>
                <div className="memory-modal-header">
                    <span className="memory-modal-role">
                        {memory.role === "user"
                            ? <PersonIcon sx={{ fontSize: 18, color: '#aaa' }} />
                            : <SmartToyIcon sx={{ fontSize: 18, color: '#10a37f' }} />
                        }
                    </span>
                    <h3>{memory.role === "user" ? "User" : "Assistant"}</h3>
                    <button className="close-panel-btn" onClick={onClose}>
                        <CloseIcon sx={{ fontSize: 18 }} />
                    </button>
                </div>
                <div className="memory-modal-body">
                    <ReactMarkdown
                        remarkPlugins={[remarkGfm, remarkMath]}
                        rehypePlugins={[rehypeKatex]}
                        components={markdownComponents}
                    >
                        {preprocessLaTeX(memory.text)}
                    </ReactMarkdown>
                </div>
            </div>
        </div>
    );
}

export default function MemoryPanel({ memories, hasParent, onToggle, onDelete, onClose }) {
    const [selectedMemory, setSelectedMemory] = useState(null);

    return (
        <div className="memory-panel">
            <div className="memory-panel-header">
                <h4>
                    Memories
                    {hasParent && <span className="inherited-badge">(includes inherited)</span>}
                </h4>
                <button className="close-panel-btn" onClick={onClose}>
                    <CloseIcon sx={{ fontSize: 18 }} />
                </button>
            </div>
            <div className="memory-list">
                {memories.length === 0 ? (
                    <div style={{ color: '#888', fontSize: 13 }}>No memories yet</div>
                ) : (
                    memories.map((m) => (
                        <MemoryItem
                            key={`${m.id}-${m.inherited}-${m.inherit_distance || 0}`}
                            memory={m}
                            onToggle={onToggle}
                            onDelete={onDelete}
                            onClickText={setSelectedMemory}
                        />
                    ))
                )}
            </div>
            {selectedMemory && (
                <MemoryModal memory={selectedMemory} onClose={() => setSelectedMemory(null)} />
            )}
        </div>
    );
}

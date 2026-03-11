export default function TitleEditModal({ value, onChange, onSave, onCancel }) {
    const handleKeyDown = (e) => {
        if (e.key === "Enter") onSave();
        else if (e.key === "Escape") { e.stopPropagation(); onCancel(); }
    };

    return (
        <div className="modal-overlay">
            <div className="modal">
                <h3>Edit Title</h3>
                <input
                    className="modal-input"
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Enter new title..."
                    autoFocus
                />
                <div className="modal-actions">
                    <button className="modal-btn cancel" onClick={onCancel}>Cancel</button>
                    <button className="modal-btn save" onClick={onSave}>Save</button>
                </div>
            </div>
        </div>
    );
}

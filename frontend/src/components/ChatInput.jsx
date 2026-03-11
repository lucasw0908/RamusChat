import { useRef } from "react";
import SendIcon from '@mui/icons-material/Send';

export default function ChatInput({ value, onChange, onSend, disabled, thinking }) {
    const textareaRef = useRef(null);

    const handleChange = (e) => {
        onChange(e.target.value);
        e.target.style.height = "auto";
        e.target.style.height = Math.min(e.target.scrollHeight, 150) + "px";
    };

    const handleKeyDown = (e) => {
        if (e.key === "Enter" && !e.shiftKey && !disabled) {
            e.preventDefault();
            onSend();
        }
    };

    const handleSend = () => {
        onSend();
        if (textareaRef.current) textareaRef.current.style.height = "auto";
    };

    let placeholder = "Message TreeMemory...";
    if (thinking) {
        placeholder = "AI is thinking...";
    }

    return (
        <div className={`chat-input ${disabled ? 'locked' : ''}`}>
            <textarea
                ref={textareaRef}
                value={value}
                onChange={handleChange}
                onKeyDown={handleKeyDown}
                placeholder={placeholder}
                disabled={disabled}
                rows={1}
            />
            <button
                className="send-btn"
                onClick={handleSend}
                disabled={disabled || !value.trim()}
            >
                <SendIcon sx={{ fontSize: 18 }} />
            </button>
        </div>
    );
}

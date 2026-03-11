import { memo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import remarkBreaks from 'remark-breaks';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import PsychologyIcon from '@mui/icons-material/Psychology';
import { preprocessLaTeX, markdownComponents } from './utils/markdown';

const Message = memo(function Message({ message }) {
    const isMe = message.sender === "me";
    const memoriesUsed = message.memories_used;
    const isDisabled = message.enabled === false;

    const remarkPlugins = isMe
        ? [remarkGfm, remarkMath, remarkBreaks]
        : [remarkGfm, remarkMath];

    return (
        <div className={`message-row ${isMe ? 'me' : 'other'} ${isDisabled ? 'disabled' : ''}`}>
            <div className="message-wrapper">
                <div className="message-bubble">
                    <ReactMarkdown
                        remarkPlugins={remarkPlugins}
                        rehypePlugins={[rehypeKatex]}
                        components={markdownComponents}
                    >
                        {preprocessLaTeX(message.text)}
                    </ReactMarkdown>
                </div>
                {!isMe && memoriesUsed > 0 && (
                    <div className="message-meta">
                        <PsychologyIcon sx={{ fontSize: 14, verticalAlign: 'middle', mr: 0.5, color: '#666' }} />
                        {memoriesUsed} {memoriesUsed === 1 ? 'memory' : 'memories'} used
                    </div>
                )}
            </div>
        </div>
    );
});

export default Message;

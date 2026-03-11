import CloseIcon from '@mui/icons-material/Close';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';

const icons = {
    error: <ErrorOutlineIcon sx={{ fontSize: 18 }} />,
    success: <CheckCircleOutlineIcon sx={{ fontSize: 18 }} />,
    info: <InfoOutlinedIcon sx={{ fontSize: 18 }} />,
};

export default function ToastContainer({ toasts, onDismiss }) {
    if (toasts.length === 0) return null;

    return (
        <div className="toast-container">
            {toasts.map(toast => (
                <div key={toast.id} className={`toast-item ${toast.type}`}>
                    <span className="toast-icon">{icons[toast.type] || icons.error}</span>
                    <span className="toast-message">{toast.message}</span>
                    <button className="toast-close" onClick={() => onDismiss(toast.id)}>
                        <CloseIcon sx={{ fontSize: 16 }} />
                    </button>
                </div>
            ))}
        </div>
    );
}

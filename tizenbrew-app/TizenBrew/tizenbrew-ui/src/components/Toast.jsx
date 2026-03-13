import { useEffect, useState } from 'react';

const ICONS = {
    loading: (
        <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
        </svg>
    ),
    success: (
        <svg className="h-5 w-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 00-1.414 0L8 12.586 4.707 9.293a1 1 0 00-1.414 1.414l4 4a1 1 0 001.414 0l8-8a1 1 0 000-1.414z" clipRule="evenodd" />
        </svg>
    ),
    error: (
        <svg className="h-5 w-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 10-2 0v4a1 1 0 102 0V7zm-1 8a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
        </svg>
    ),
    info: (
        <svg className="h-5 w-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zm-1 9a1 1 0 01-1-1v-4a1 1 0 112 0v4a1 1 0 01-1 1z" clipRule="evenodd" />
        </svg>
    ),
};

const STYLES = {
    loading: 'bg-slate-700 border-slate-500 text-slate-100',
    success: 'bg-slate-900 border-emerald-500 text-emerald-300',
    error:   'bg-slate-900 border-red-500 text-red-300',
    info:    'bg-slate-900 border-sky-500 text-sky-300',
};

const ICON_STYLES = {
    loading: 'text-slate-300',
    success: 'text-emerald-400',
    error:   'text-red-400',
    info:    'text-sky-400',
};

function ToastItem({ id, variant, message, onDismiss }) {
    const [visible, setVisible] = useState(false);
    useEffect(() => { requestAnimationFrame(() => setVisible(true)); }, []);
    function dismiss() { setVisible(false); setTimeout(() => onDismiss(id), 300); }
    return (
        <div
            style={{
                transition: 'opacity 0.3s ease, transform 0.3s ease',
                opacity: visible ? 1 : 0,
                transform: visible ? 'translateY(0)' : 'translateY(12px)',
            }}
            className={`flex items-start gap-3 px-4 py-3 rounded-xl border shadow-2xl min-w-[22vw] max-w-[40vw] ${STYLES[variant]}`}
        >
            <span className={`mt-0.5 flex-shrink-0 ${ICON_STYLES[variant]}`}>{ICONS[variant]}</span>
            <span className="text-xl leading-snug flex-1">{message}</span>
            {variant !== 'loading' && (
                <button onClick={dismiss} className="flex-shrink-0 opacity-50 hover:opacity-100 transition-opacity ml-1 mt-0.5">
                    <svg className="h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                </button>
            )}
        </div>
    );
}

export function ToastContainer({ toasts, onDismiss }) {
    return (
        <div style={{ position: 'fixed', bottom: '4vh', right: '3vw', zIndex: 9999 }} className="flex flex-col gap-3 items-end">
            {toasts.map(t => (
                <ToastItem key={t.id} id={t.id} variant={t.variant} message={t.message} onDismiss={onDismiss} />
            ))}
        </div>
    );
}

let _nextId = 1;

export function useToast() {
    const [toasts, setToasts] = useState([]);

    function add(variant, message, duration) {
        const id = _nextId++;
        setToasts(prev => [...prev, { id, variant, message }]);
        if (variant !== 'loading' && duration !== 0) {
            setTimeout(() => dismiss(id), duration ?? 4000);
        }
        return id;
    }

    function dismiss(id) { setToasts(prev => prev.filter(t => t.id !== id)); }

    function resolve(id, variant, message, duration) {
        setToasts(prev => prev.map(t => t.id === id ? { ...t, variant, message } : t));
        setTimeout(() => dismiss(id), duration ?? 4000);
    }

    const toast = {
        loading: (msg) => add('loading', msg, 0),
        success: (msg, dur) => add('success', msg, dur),
        error:   (msg, dur) => add('error', msg, dur),
        info:    (msg, dur) => add('info', msg, dur),
        dismiss,
        resolve,
    };

    return { toasts, toast };
}

// Global singleton — App.jsx registers its toast instance here
let _globalToast = null;
export function setGlobalToast(t) { _globalToast = t; }
export function getGlobalToast() { return _globalToast; }
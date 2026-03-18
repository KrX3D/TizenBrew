import { useFocusable, setFocus } from '@noriginmedia/norigin-spatial-navigation';
import { useEffect, useRef } from 'preact/hooks';
import { useTranslation } from 'react-i18next';

// Focusable button inside the modal
function ModalButton({ children, onClick, focusKey, autoFocus }) {
    const { ref, focused, focusSelf } = useFocusable({
        focusKey,
        onEnterPress: onClick
    });
    useEffect(() => { if (autoFocus) focusSelf(); }, []);

    return (
        <button
            ref={ref}
            onClick={onClick}
            className={[
                'px-8 py-3 rounded-xl text-base font-semibold transition-all',
                focused
                    ? 'bg-indigo-500 text-white ring-2 ring-white'
                    : 'bg-slate-700 text-slate-200 hover:bg-slate-600'
            ].join(' ')}
        >
            {children}
        </button>
    );
}

/**
 * Drop-in replacement for the browser's confirm() dialog.
 * Works on ALL Tizen versions — no IDS_WEBVIEW_* strings, no double-fire.
 *
 * Usage (in a component):
 *   const [modal, setModal] = useState(null);
 *
 *   // show
 *   setModal({ message: 'Delete this?', onConfirm: () => doDelete() });
 *
 *   // in JSX
 *   {modal && <ConfirmModal message={modal.message} onConfirm={() => { modal.onConfirm(); setModal(null); }} onCancel={() => setModal(null)} />}
 */
export default function ConfirmModal({ message, onConfirm, onCancel }) {
    const { t } = useTranslation();

    // Trap Back button so it cancels the dialog
    useEffect(() => {
        function onKey(e) {
            if (e.keyCode === 10009) { e.preventDefault(); e.stopPropagation(); onCancel(); }
        }
        window.addEventListener('keydown', onKey, true);
        return () => window.removeEventListener('keydown', onKey, true);
    }, [onCancel]);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
            <div className="bg-slate-800 rounded-2xl shadow-2xl p-10 max-w-[60vw] min-w-[30vw] flex flex-col items-center gap-6 border border-slate-600">
                <p className="text-white text-xl text-center leading-relaxed">{message}</p>
                <div className="flex gap-6">
                    {/* Cancel focused first — safer default on TV remotes */}
                    <ModalButton focusKey="modal-cancel" autoFocus onClick={onCancel}>
                        {t('modal.cancel')}
                    </ModalButton>
                    <ModalButton focusKey="modal-confirm" onClick={onConfirm}>
                        {t('modal.ok')}
                    </ModalButton>
                </div>
            </div>
        </div>
    );
}
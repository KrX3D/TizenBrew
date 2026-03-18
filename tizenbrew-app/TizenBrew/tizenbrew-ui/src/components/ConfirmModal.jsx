import { useFocusable, setFocus } from '@noriginmedia/norigin-spatial-navigation';
import { useEffect } from 'preact/hooks';
import { useTranslation } from 'react-i18next';

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
                // text-2xl = ~50% bigger than the previous text-base
                'px-10 py-4 rounded-xl text-2xl font-semibold transition-all min-w-[8vw]',
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
 * Props:
 *   message      string   — question to display
 *   onConfirm    fn       — called when OK is pressed
 *   onCancel     fn       — called when Cancel or Back is pressed
 *   returnFocusKey string — focusKey to restore after modal closes (optional)
 */
export default function ConfirmModal({ message, onConfirm, onCancel, returnFocusKey }) {
    const { t } = useTranslation();

    // Restore focus to the triggering element when the modal unmounts
    useEffect(() => {
        return () => {
            if (returnFocusKey) {
                // Small delay so the modal has fully unmounted before refocusing
                setTimeout(() => setFocus(returnFocusKey), 50);
            }
        };
    }, [returnFocusKey]);

    // Back button → cancel
    useEffect(() => {
        function onKey(e) {
            if (e.keyCode === 10009) { e.preventDefault(); e.stopPropagation(); onCancel(); }
        }
        window.addEventListener('keydown', onKey, true);
        return () => window.removeEventListener('keydown', onKey, true);
    }, [onCancel]);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
            <div className="bg-slate-800 rounded-2xl shadow-2xl p-12 max-w-[65vw] min-w-[35vw] flex flex-col items-center gap-8 border border-slate-600">
                {/* text-2xl = ~50% bigger than the original text-base message */}
                <p className="text-white text-2xl text-center leading-relaxed">{message}</p>
                <div className="flex gap-8">
                    {/* Cancel focused by default — safer on TV */}
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
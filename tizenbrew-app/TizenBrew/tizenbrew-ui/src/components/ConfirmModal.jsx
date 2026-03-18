import { useFocusable, setFocus } from '@noriginmedia/norigin-spatial-navigation';
import { useEffect } from 'preact/hooks';
import { useTranslation } from 'react-i18next';

function ModalButton({ children, onClick, focusKey, autoFocus }) {
    const { ref, focused, focusSelf } = useFocusable({ focusKey, onEnterPress: onClick });
    useEffect(() => { if (autoFocus) focusSelf(); }, []);

    return (
        <button
            ref={ref}
            onClick={onClick}
            className={[
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
 *   message    string  — question text, \n splits into sub-line (e.g. repo path)
 *   onConfirm  fn      — called on OK  (parent handles focus after)
 *   onCancel   fn      — called on Cancel / Back  (parent handles focus after)
 *
 * ConfirmModal does NOT touch focus on unmount — the parent is fully
 * responsible for restoring focus, because it knows whether the triggering
 * element still exists after the action completes.
 */
export default function ConfirmModal({ message, onConfirm, onCancel }) {
    const { t } = useTranslation();

    // Back button → cancel
    useEffect(() => {
        function onKey(e) {
            if (e.keyCode === 10009) { e.preventDefault(); e.stopPropagation(); onCancel(); }
        }
        window.addEventListener('keydown', onKey, true);
        return () => window.removeEventListener('keydown', onKey, true);
    }, [onCancel]);

    const lines   = (message || '').split('\n');
    const mainLine = lines[0];
    const subLines = lines.slice(1);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
            <div className="bg-slate-800 rounded-2xl shadow-2xl p-12 max-w-[65vw] min-w-[35vw] flex flex-col items-center gap-8 border border-slate-600">
                <div className="text-center">
                    <p className="text-white text-2xl leading-relaxed">{mainLine}</p>
                    {subLines.map((line, i) => (
                        <p key={i} className="text-slate-400 text-lg mt-2 font-mono break-all">{line}</p>
                    ))}
                </div>
                <div className="flex gap-8">
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
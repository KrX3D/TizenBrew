import { Cog6ToothIcon, ArchiveBoxIcon, HomeIcon, QuestionMarkCircleIcon, ArrowPathIcon } from '@heroicons/react/16/solid';
import { useFocusable } from '@noriginmedia/norigin-spatial-navigation';
import { useEffect, useContext, useState } from 'preact/hooks';
import { useLocation } from 'preact-iso';
import { GlobalStateContext } from './ClientContext.jsx';
import TBLogo from '../assets/tizenbrew.svg';
import { useTranslation } from 'react-i18next';
import { Events } from './WebSocketClient.js';

function Button({ children, route, focus, focusKey, onClick }) {
    const { ref, focusSelf, focused } = useFocusable();
    const location = useLocation();

    if (focus) {
        useEffect(() => { focusSelf(); }, []);
    }

    return (
        <button
            ref={ref}
            focusKey={focus ? 'sn:focusable-item-1' : focusKey}
            // rounded-full keeps the focus ring round (box-shadow follows border-radius)
            className={`flex items-center justify-center p-2 rounded-full bg-slate-800 hover:bg-slate-600 text-slate-100 ${focused ? 'focus' : ''}`}
            onClick={onClick || (() => location.route(`/tizenbrew-ui/dist/index.html${route}`))}
        >
            {children}
        </button>
    );
}

export default function Header() {
    const { state } = useContext(GlobalStateContext);
    const { t } = useTranslation();
    const [reloading, setReloading] = useState(false);

    const handleReload = () => {
        if (state.client && !reloading) {
            setReloading(true);
            state.client.send({ type: Events.GetModules, payload: true });
            setTimeout(() => setReloading(false), 2000);
        }
    };

    // Show a proper status string:
    // - null / undefined  → 'service.connecting' (translates to e.g. "Connecting...")
    // - any other key     → translate it normally
    // This avoids showing the raw literal '...' forever while the service starts.
    const statusKey = state?.sharedData?.state || 'service.connecting';
    const statusText = reloading ? t('service.reloading') : t(statusKey);

    return (
        <header className="inset-x-0 top-0 bg-slate-700 h-[8vh]">
            <nav aria-label="Global" className="flex items-center justify-between lg:px-8 h-[8vh]">
                <div className="flex lg:flex-1">
                    <a href="#" className="-m-1.5 p-1.5">
                        <img src={TBLogo} className="h-[8vh] w-auto" />
                    </a>
                </div>
                <div className="hidden lg:flex lg:gap-x-12">
                    <div className="mx-auto max-w-[30vw] h-[2.5vh]">
                        <div className="hidden sm:mb-8 sm:flex sm:justify-center">
                            <div className="relative rounded-full px-3 py-1 text-xl text-gray-200 ring-1 ring-gray-900/10 hover:ring-gray-900/20">
                                {statusText}
                            </div>
                        </div>
                    </div>
                </div>
                <div className="hidden lg:flex lg:flex-1 lg:justify-end lg:gap-x-2">
                    <Button onClick={handleReload} route="#">
                        <ArrowPathIcon className={`h-[4vh] w-[2vw] ${reloading ? 'animate-spin' : ''}`} />
                    </Button>
                    <Button route="/" focus={true} focusKey="sn:focusable-item-1">
                        <HomeIcon className="h-[4vh] w-[2vw]" />
                    </Button>
                    <Button route="/settings">
                        <Cog6ToothIcon className="h-[4vh] w-[2vw]" />
                    </Button>
                    <Button route="/module-manager">
                        <ArchiveBoxIcon className="h-[4vh] w-[2vw]" />
                    </Button>
                    <Button route="/about">
                        <QuestionMarkCircleIcon className="h-[4vh] w-[2vw]" />
                    </Button>
                </div>
            </nav>
        </header>
    );
}
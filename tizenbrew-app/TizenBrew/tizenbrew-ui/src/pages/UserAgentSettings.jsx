import { useFocusable } from "@noriginmedia/norigin-spatial-navigation";
import { useTranslation } from "react-i18next";
import { useEffect } from "react";

const UserAgents = [
    {
        name: 'UE50MU7000',
        worksOnTizen: 3,
        userAgent: 'Mozilla/5.0 (LINUX; Tizen/3.0/2017.1.0) Cobalt/9.lts-gold (unlike Gecko) gles Evergreen/1.0.0 Starboard/9, Samsung_TV_KANTM_2017/T-MDEUC-1420.0 (Samsung, UE50MU7000, Wired)'
    },
    {
        name: 'QN55Q80AAFXZA',
        worksOnTizen: 6,
        userAgent: 'Mozilla/5.0 (LINUX; Tizen/6.0/2021.1.3) Cobalt/21.lts.4.302899-gold (unlike Gecko) v8/7.7.299.8-jit gles Evergreen/1.4.3 Starboard/12, Samsung_TV_NIKEM2_2021/T-NKM2AKUC-2111.1 (Samsung, QN55Q80AAFXZA, Wired)'
    },
    {
        name: 'QN90B',
        worksOnTizen: 6,
        userAgent: 'Mozilla/5.0 (Linux; Tizen 6.5) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/3.0 TV Safari/537.36, Samsung_TV_QN90B/T-PTMDEUC-1440.8 (Samsung, QE55QN90BATXXU, Wired)'
    },
    {
        name: 'S95C',
        worksOnTizen: 7,
        userAgent: 'Mozilla/5.0 (Linux; Tizen 7.0) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/7.0 TV Safari/537.36, Samsung_TV_S95C/T-PTMLDEUC-1201.0 (Samsung, QE65S95CATXXU, Wired)'
    },
    {
        name: 'settings.uaBasedOnDevice',
        userAgent: () => {
            const xhr = new XMLHttpRequest();
            xhr.open("GET", "http://127.0.0.1:8001/api/v2/", false);
            xhr.send();

            let apiData = {};
            try {
                apiData = JSON.parse(xhr.responseText);
            } catch (e) {
                alert("Failed to parse API response:", e);
            }

            const firmware = tizen.systeminfo.getCapability("http://tizen.org/custom/sw_version"),
                model = tizen.systeminfo.getCapability("http://tizen.org/system/model_name"),
                chipsetModel = apiData.device.model.split('_')[1],
                deviceName = `_TV_${chipsetModel}`,
                newUserAgent = `${window.navigator.userAgent}, ${deviceName}/${firmware} (Samsung, ${model}, Wired)`;

            return newUserAgent;
        }
    }
];

function classNames(...classes) {
    return classes.filter(Boolean).join(' ')
}

function ItemBasic({ children, onClick, shouldFocus, isSelected }) {
    const { ref, focused, focusSelf } = useFocusable();
    useEffect(() => {
        if (focused) {
            ref.current.scrollIntoView({
                behavior: 'smooth',
                block: 'center',
                inline: 'center',
            });
        }
    }, [focused, ref]);

    if (shouldFocus) {
        useEffect(() => {
            focusSelf();
        }, [ref]);
    }

    return (
        <div
            ref={ref}
            onClick={onClick}
            className={classNames(
                'relative bg-gray-900 shadow-2xl rounded-3xl p-8 ring-1 ring-gray-900/10 sm:p-10 h-[35vh] w-[20vw]',
                focused ? 'focus' : '',
                isSelected ? 'ring-2 ring-indigo-500' : ''
            )}
        >
            {children}
        </div>
    );
}

export default function UserAgentSettings() {
    const { t } = useTranslation();
    const selectedUa = localStorage.getItem('userAgent');

    return (
        <div className="relative isolate lg:px-8">
            <div className="mx-auto flex flex-wrap justify-center gap-4 top-4 relative">
                {UserAgents.map((ua, idx) => {
                    const userAgent = typeof ua.userAgent === 'function' ? ua.userAgent() : ua.userAgent;
                    const isSelected = selectedUa === userAgent;

                    return (
                        <ItemBasic key={idx} onClick={() => {
                            if (confirm(`${t('settings.setUaTo', { userAgent: userAgent })}\n\n${t('settings.uaNegativeEffects')}`)) {
                                localStorage.setItem('userAgent', userAgent);
                                alert(t('settings.uaSetRelaunch'));
                                tizen.application.getCurrentApplication().exit();
                            }
                        }} shouldFocus={idx === 0} isSelected={isSelected}>
                            <h3 className='text-indigo-400 text-base/7 font-semibold'>
                                {ua.name.startsWith('settings.') ? t(ua.name) : ua.name}
                            </h3>
                            <p className='text-gray-300 mt-6 text-base/7'>
                                {ua.worksOnTizen ? t('settings.worksOnTizen', { version: ua.worksOnTizen }) : ''}
                            </p>
                            {isSelected ? <p className='text-green-400 mt-3 text-sm'>Selected</p> : null}
                        </ItemBasic>
                    )
                })}
                <ItemBasic onClick={() => {
                    localStorage.removeItem('userAgent');
                    alert(t('settings.uaSetRelaunch'));
                    tizen.application.getCurrentApplication().exit();
                }} isSelected={!selectedUa}>
                    <h3 className='text-indigo-400 text-base/7 font-semibold'>
                        {t('settings.default')}
                    </h3>
                    {!selectedUa ? <p className='text-green-400 mt-3 text-sm'>Selected</p> : null}
                </ItemBasic>
            </div>
        </div>
    )
}

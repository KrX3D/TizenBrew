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
        userAgent: 'Mozilla/5.0 (LINUX; Tizen/6.5/2022.2.0) Cobalt/22.lts.1.321690-gold (unlike Gecko) v8/9.3.345.16-jit gles Evergreen/1.5.1 Starboard/13, Samsung_TV_QN90B_2022/T-PTMDEUC-1420.9 (Samsung, QN90B, Wired)'
    },
    {
        name: 'S95C',
        worksOnTizen: 7,
        userAgent: 'Mozilla/5.0 (LINUX; Tizen/7.0/2023.2.0) Cobalt/23.lts.2.338160-gold (unlike Gecko) gles Evergreen/1.6.0 Starboard/14, Samsung_TV_S95C_2023/T-PTMDEUC-1503.8 (Samsung, S95C, Wired)'
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

function ItemBasic({ children, onClick, shouldFocus, selected }) {
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

    useEffect(() => {
        if (shouldFocus) focusSelf();
    }, [shouldFocus, focusSelf]);

    return (
        <div
            ref={ref}
            onClick={onClick}
            className={classNames(
                'relative bg-gray-900 shadow-2xl rounded-3xl p-8 ring-1 ring-gray-900/10 sm:p-10 h-[35vh] w-[20vw]',
                focused ? 'focus' : '',
                selected ? 'ring-2 ring-indigo-400' : ''
            )}
        >
            {children}
            {selected ? <span className='absolute top-3 right-3 text-xs bg-indigo-600 text-white px-2 py-1 rounded'>Selected</span> : null}
        </div>
    );
}

export default function UserAgentSettings() {
    const { t } = useTranslation();
    const selectedUA = localStorage.getItem('userAgent') || '';

    return (
        <div className="relative isolate lg:px-8">
            <div className="mx-auto flex flex-wrap justify-center gap-4 top-4 relative">
                {UserAgents.map((ua, idx) => {
                    const isSelected = typeof ua.userAgent === 'string' && ua.userAgent === selectedUA;

                    return (
                        <ItemBasic key={idx} selected={isSelected} onClick={() => {
                            const userAgent = typeof ua.userAgent === 'function' ? ua.userAgent() : ua.userAgent;
                            if (confirm(`${t('settings.setUaTo', { userAgent: userAgent })}\n\n${t('settings.uaNegativeEffects')}`)) {
                                localStorage.setItem('userAgent', userAgent);
                                alert(t('settings.uaSetRelaunch'));
                                tizen.application.getCurrentApplication().exit();
                            }
                        }} shouldFocus={idx === 0}>
                            <h3 className='text-indigo-400 text-base/7 font-semibold'>
                                {t(ua.name)}
                            </h3>
                            <p className='text-gray-300 mt-6 text-base/7'>
                                {ua.worksOnTizen ? t('settings.worksOnTizen', { version: ua.worksOnTizen }) : ''}
                            </p>
                        </ItemBasic>
                    )
                })}
                <ItemBasic selected={!selectedUA} onClick={() => {
                    localStorage.removeItem('userAgent');
                    alert(t('settings.uaSetRelaunch'));
                    tizen.application.getCurrentApplication().exit();
                }}>
                    <h3 className='text-indigo-400 text-base/7 font-semibold'>
                        {t('settings.default')}
                    </h3>
                </ItemBasic>
            </div>
        </div>
    )
}

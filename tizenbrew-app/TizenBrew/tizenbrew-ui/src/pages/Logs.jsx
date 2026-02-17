import { useContext } from 'react';
import { GlobalStateContext } from '../components/ClientContext.jsx';

function formatTimestamp(ts) {
    const date = new Date(ts);
    return date.toISOString().replace('T', ' ').replace('Z', '');
}

export default function Logs() {
    const { state } = useContext(GlobalStateContext);
    const logs = (state.sharedData.logs || []).slice().reverse();

    return (
        <div className="relative isolate lg:px-8 p-6 overflow-y-auto h-full">
            <div className="mx-auto w-[95vw] bg-gray-900 rounded-2xl p-4">
                <h2 className='text-indigo-400 text-2xl font-semibold mb-4'>Local service/module logs</h2>
                <p className='text-gray-300 mb-4'>These logs are collected inside TizenBrew while Host PC IP stays at 127.0.0.1.</p>
                <div className='font-mono text-sm whitespace-pre-wrap break-all max-h-[70vh] overflow-y-auto'>
                    {logs.length === 0 ? 'No logs yet.' : logs.map((entry, idx) => (
                        <div key={idx} className='mb-2'>
                            <span className='text-slate-400'>[{formatTimestamp(entry.ts)}]</span>{' '}
                            <span className='text-amber-400'>[{entry.level}]</span>{' '}
                            <span className='text-cyan-400'>[{entry.source}]</span>{' '}
                            <span className='text-gray-200'>{entry.message}</span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    )
}

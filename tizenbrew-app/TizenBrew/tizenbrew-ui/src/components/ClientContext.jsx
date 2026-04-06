import { createContext } from 'preact';
import { useReducer } from 'preact/hooks';

const initialState = {
    sharedData: {
        debugStatus: {
            rwiDebug: false,
            appDebug: false,
            tizenDebug: false
        },
        autoLaunchModule: '',
        autoLaunchServiceList: [],
        defaultModule: '',
        remoteLogging: null,
        modules: null,
        state: null,
        error: {
            message: null,
            dissapear: false
        }
    },
    client: null
};

function reducer(state, action) {
    switch (action.type) {
        case 'SET_SHARED_DATA':
            return { ...state, sharedData: action.payload };
        case 'SET_CLIENT':
            if (state.client) return state;
            return { ...state, client: action.payload };
        case 'SET_MODULES':
            return { ...state, sharedData: { ...state.sharedData, modules: action.payload } };
        case 'SET_DEBUG_STATUS':
            return { ...state, sharedData: { ...state.sharedData, debugStatus: action.payload } };
        case 'SET_STATE':
            return { ...state, sharedData: { ...state.sharedData, state: action.payload } };
        case 'SET_ERROR':
            return { ...state, sharedData: { ...state.sharedData, error: action.payload } };
        case 'SET_AUTOLAUNCH':
            return {
                ...state,
                sharedData: {
                    ...state.sharedData,
                    autoLaunchModule:      action.payload.autoLaunchModule      ?? state.sharedData.autoLaunchModule,
                    autoLaunchServiceList: action.payload.autoLaunchServiceList ?? state.sharedData.autoLaunchServiceList,
                }
            };
        case 'SET_DEFAULT_MODULE':
            return { ...state, sharedData: { ...state.sharedData, defaultModule: action.payload } };
        case 'SET_REMOTE_LOGGING':
            return { ...state, sharedData: { ...state.sharedData, remoteLogging: action.payload } };
        default:
            return state;
    }
}

export const GlobalStateContext = createContext();

export function GlobalStateProvider({ children }) {
    const [state, dispatch] = useReducer(reducer, initialState);

    return (
        <GlobalStateContext.Provider value={{ state, dispatch }}>
            {children}
        </GlobalStateContext.Provider>
    );
}
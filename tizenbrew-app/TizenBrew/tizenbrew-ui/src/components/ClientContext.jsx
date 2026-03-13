import { createContext } from 'preact';
import { useReducer } from 'preact/hooks';

const initialState = {
    sharedData: {
        debugStatus: {
            rwiDebug: false,
            appDebug: false,
            tizenDebug: false
        },
        modules: null,
        modulesVersion: 0,
        state: null,
        error: {
            message: null,
            dissapear: false
        },
        pendingAdd: null,           // { fullName, type, toastId, snapshotVersion }
        resetModulesResult: null,   // { success, deleted, notFound, dirListings }
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
            return {
                ...state,
                sharedData: {
                    ...state.sharedData,
                    modules: action.payload,
                    modulesVersion: state.sharedData.modulesVersion + 1
                }
            };
        case 'SET_PENDING_ADD':
            return { ...state, sharedData: { ...state.sharedData, pendingAdd: action.payload } };
        case 'SET_RESET_MODULES_RESULT':
            return { ...state, sharedData: { ...state.sharedData, resetModulesResult: action.payload } };
        case 'SET_DEBUG_STATUS':
            return { ...state, sharedData: { ...state.sharedData, debugStatus: action.payload } };
        case 'SET_STATE':
            return { ...state, sharedData: { ...state.sharedData, state: action.payload } };
        case 'SET_ERROR':
            return { ...state, sharedData: { ...state.sharedData, error: action.payload } };
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
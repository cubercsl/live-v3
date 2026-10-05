import { useMemo, useSyncExternalStore } from "react";

const subscribeToLocation = (onChange: () => void) => {
    window.addEventListener("popstate", onChange);
    return () => window.removeEventListener("popstate", onChange);
};

const getLocationHref = () => window.location.href;

// Location is mutable, so URL changes need a value snapshot for React.
const useLocationHref = () =>
    useSyncExternalStore(subscribeToLocation, getLocationHref);

export const useLocation = (): Location => {
    useLocationHref();
    return window.location;
};

export const useQueryParams = (): URLSearchParams => {
    const href = useLocationHref();
    return useMemo(() => new URL(href).searchParams, [href]);
};

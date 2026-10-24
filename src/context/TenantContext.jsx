
import {
    createContext,
    useContext,
    useEffect,
    useState,
    useCallback,
    useRef,
} from "react";
import { getTenant, calculateDaysRemaining } from "@/services/tenantService";
import { useAuth } from "@/context/AuthContext";

const TenantContext = createContext(null);
const IMPERSONATION_KEY = "sekka_impersonated_tenant";

const detectTenantFromHostname = () => {
    if (typeof window === "undefined") return null;

    const hostname = window.location.hostname;

    if (
        hostname === "localhost" ||
        hostname === "127.0.0.1"
    ) {
        return null;
    }

    const parts = hostname.split(".");

    if (parts.length < 3) return null;

    const subdomain = parts[0];

    return ["www", "sekka"].includes(subdomain) ? null : subdomain;
};

const getStoredImpersonatedTenant = () => {
    if (typeof window === "undefined") return null;

    try {
        return sessionStorage.getItem(IMPERSONATION_KEY);
    } catch {
        return null;
    }
};

export const TenantProvider = ({ children }) => {
    const { user, profile, isPlatformAdmin } = useAuth();

    const [impersonatedId, setImpersonatedId] = useState(
        getStoredImpersonatedTenant
    );
    const [tenantData, setTenantData] = useState(null);
    const [loading, setLoading] = useState(true);

    const requestIdRef = useRef(0);

    const activeTenantId = isPlatformAdmin
        ? impersonatedId ||
          import.meta.env.VITE_TENANT_ID ||
          detectTenantFromHostname()
        : import.meta.env.VITE_TENANT_ID ||
          detectTenantFromHostname() ||
          profile?.tenantId ||
          null;

    const refreshTenant = useCallback(async (id = activeTenantId) => {
        const requestId = ++requestIdRef.current;

        if (!id) {
            setTenantData(null);
            setLoading(false);
            return null;
        }

        setLoading(true);

        try {
            const data = await getTenant(id);

            if (requestId !== requestIdRef.current) return null;

            setTenantData(data);
            return data;
        } catch (error) {
            if (requestId === requestIdRef.current) {
                console.error("Error loading tenant:", error);
                setTenantData(null);
            }

            return null;
        } finally {
            if (requestId === requestIdRef.current) {
                setLoading(false);
            }
        }
    }, [activeTenantId]);

    useEffect(() => {
        refreshTenant(activeTenantId);

        return () => {
            requestIdRef.current += 1;
        };
    }, [activeTenantId, user?.uid, refreshTenant]);

    const switchTenant = useCallback((targetTenantId) => {
        if (
            !isPlatformAdmin ||
            typeof targetTenantId !== "string" ||
            !targetTenantId.trim()
        ) {
            return false;
        }

        const tenantId = targetTenantId.trim();

        try {
            sessionStorage.setItem(IMPERSONATION_KEY, tenantId);
        } catch (error) {
            console.error("Unable to save active tenant:", error);
            return false;
        }

        setTenantData(null);
        setLoading(true);
        setImpersonatedId(tenantId);

        return true;
    }, [isPlatformAdmin]);

    const exitImpersonation = useCallback(() => {
        try {
            sessionStorage.removeItem(IMPERSONATION_KEY);
        } catch (error) {
            console.error("Unable to clear active tenant:", error);
        }

        setTenantData(null);
        setLoading(true);
        setImpersonatedId(null);
    }, []);

    const isModuleEnabled = useCallback((moduleKey) => {
    if (loading || !tenantData || !moduleKey) {
        return false;
    }

    return tenantData.modules?.[moduleKey] === true;
}, [loading, tenantData]);

    const daysRemaining = calculateDaysRemaining(
        tenantData?.subscription?.endDate
    );

    const value = {
        tenantId: activeTenantId,
        tenant: tenantData,
        loadingTenant: loading,
        isImpersonating: Boolean(
            isPlatformAdmin && impersonatedId
        ),
        impersonatedTenantId: isPlatformAdmin
            ? impersonatedId
            : null,
        switchTenant,
        exitImpersonation,
        isModuleEnabled,
        refreshTenant,
        daysRemaining,
        isExpiringSoon: daysRemaining <= 3 && daysRemaining > 0,
        isExpired: daysRemaining <= 0,
        tenantName: tenantData?.name || activeTenantId || "",
        tenantModules: tenantData?.modules || {},
        tenantSubscription: tenantData?.subscription || {},
    };

    return (
        <TenantContext.Provider value={value}>
            {children}
        </TenantContext.Provider>
    );
};

export const useTenant = () => {
    const context = useContext(TenantContext);

    if (!context) {
        throw new Error(
            "useTenant must be used within a TenantProvider"
        );
    }

    return context;
};

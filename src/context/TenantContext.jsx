import {
    createContext,
    useContext,
    useEffect,
    useState,
    useCallback,
} from "react";
import {
    getTenant,
    DEFAULT_TENANT_ID,
    DEFAULT_MODULES,
    calculateDaysRemaining,
} from "@/services/tenantService";
import { useAuth } from "@/context/AuthContext";

const TenantContext = createContext(null);

const IMPERSONATION_KEY = "sekka_impersonated_tenant";

/**
 * Detects tenant from hostname / subdomain if applicable
 */
const detectTenantFromHostname = () => {
    if (typeof window === "undefined") return null;
    const hostname = window.location.hostname;
    // Example: abuhady.sekka.app or abuhady.vercel.app
    if (hostname.includes(".vercel.app") || hostname.includes(".sekka.app")) {
        const sub = hostname.split(".")[0];
        if (sub && sub !== "www" && sub !== "sekka" && sub !== "localhost") {
            return sub;
        }
    }
    return null;
};

export const TenantProvider = ({ children }) => {
    const { isSuperAdmin, profile } = useAuth();

    // 1. Check for impersonation from storage
    const [impersonatedId, setImpersonatedId] = useState(() => {
        if (typeof window !== "undefined") {
            return sessionStorage.getItem(IMPERSONATION_KEY) || null;
        }
        return null;
    });

    // 2. Resolve active tenant ID
    const resolveTenantId = useCallback(() => {
        // If super admin is impersonating a merchant, honor that first
        if (impersonatedId) return impersonatedId;

        // If environment variable explicitly sets tenant (e.g. deployed on Vercel for Abu Hady)
        const envTenant = import.meta.env.VITE_TENANT_ID;
        if (envTenant) return envTenant;

        // Subdomain detection
        const detectedFromHost = detectTenantFromHostname();
        if (detectedFromHost) return detectedFromHost;

        // If logged-in user has an assigned tenantId
        if (profile?.tenantId && !isSuperAdmin) {
            return profile.tenantId;
        }

        // Default fallback to abu-hady
        return DEFAULT_TENANT_ID;
    }, [impersonatedId, profile, isSuperAdmin]);

    const [activeTenantId, setActiveTenantId] = useState(resolveTenantId);
    const [tenantData, setTenantData] = useState(null);
    const [loading, setLoading] = useState(true);

    // Refresh tenant data from Firestore
    const refreshTenant = useCallback(async (idToFetch) => {
        const id = idToFetch || activeTenantId;
        if (!id) return null;
        try {
            setLoading(true);
            const data = await getTenant(id);
            setTenantData(data);
            return data;
        } catch (err) {
            console.error("Error loading tenant in context:", err);
            return null;
        } finally {
            setLoading(false);
        }
    }, [activeTenantId]);

    // Keep activeTenantId updated if dependencies change
    useEffect(() => {
        const resolved = resolveTenantId();
        if (resolved !== activeTenantId) {
            setActiveTenantId(resolved);
        }
    }, [resolveTenantId]);

    // Load tenant data on activeTenantId change
    useEffect(() => {
        if (activeTenantId) {
            refreshTenant(activeTenantId);
        }
    }, [activeTenantId, refreshTenant]);

    // Super Admin Switcher / Impersonation
    const switchTenant = (targetTenantId) => {
        if (!isSuperAdmin) {
            console.warn("Only super admin can switch tenants.");
            return;
        }
        if (targetTenantId) {
            sessionStorage.setItem(IMPERSONATION_KEY, targetTenantId);
            setImpersonatedId(targetTenantId);
            setActiveTenantId(targetTenantId);
        }
    };

    const exitImpersonation = () => {
        sessionStorage.removeItem(IMPERSONATION_KEY);
        setImpersonatedId(null);
        const resolved = import.meta.env.VITE_TENANT_ID || DEFAULT_TENANT_ID;
        setActiveTenantId(resolved);
    };

    // Check if a specific module is active for the current tenant
    const isModuleEnabled = (moduleKey) => {
        // Super admin always has access, but if impersonating, can also respect tenant module flag
        const modules = tenantData?.modules || DEFAULT_MODULES;
        return modules[moduleKey] !== false;
    };

    // Subscription calculations
    const daysRemaining = calculateDaysRemaining(tenantData?.subscription?.endDate);
    const isExpiringSoon = daysRemaining <= 3 && daysRemaining > 0;
    const isExpired = daysRemaining <= 0;

    const value = {
        tenantId: activeTenantId,
        tenant: tenantData,
        loadingTenant: loading,
        isImpersonating: !!impersonatedId,
        impersonatedTenantId: impersonatedId,
        switchTenant,
        exitImpersonation,
        isModuleEnabled,
        refreshTenant,
        daysRemaining,
        isExpiringSoon,
        isExpired,
        tenantName: tenantData?.name || (activeTenantId === "abu-hady" ? "أبو هادي" : activeTenantId),
        tenantModules: tenantData?.modules || DEFAULT_MODULES,
        tenantSubscription: tenantData?.subscription || {},
    };

    return (
        <TenantContext.Provider value={value}>
            {children}
        </TenantContext.Provider>
    );
};

export const useTenant = () => {
    const ctx = useContext(TenantContext);
    if (!ctx) {
        throw new Error("useTenant must be used within a TenantProvider");
    }
    return ctx;
};

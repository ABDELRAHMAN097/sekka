
import {
    createContext,
    useContext,
    useEffect,
    useState,
    useCallback,
    useRef,
} from "react";
import { resolveTenant, getTenant, calculateDaysRemaining } from "@/services/tenantService";
import { useAuth } from "@/context/AuthContext";

const TenantContext = createContext(null);
const IMPERSONATION_KEY = "sekka_impersonated_tenant";
const STORED_TENANT_KEY = "sekka_tenant_id";

/**
 * Detects any merchant tenant identifier from:
 * 1. URL search params (?tenant=... or ?slug=...)
 * 2. URL pathname (/t/:slug or /merchant/:slug)
 * 3. Stored session / local storage
 * 4. Subdomain (e.g. sara.sekka.com)
 * 5. Custom Domain (e.g. saracars.com)
 * 6. VITE_TENANT_ID environment variable (if explicitly set)
 */
export const detectTenantIdentifier = () => {
    if (typeof window === "undefined") return null;

    // 1. URL Query parameters (?tenant=... or ?slug=...)
    try {
        const search = window.location.search;
        if (search) {
            const params = new URLSearchParams(search);
            const queryVal = params.get("tenant") || params.get("slug");
            if (queryVal && queryVal.trim()) {
                return queryVal.trim();
            }
        }
    } catch {
        // ignore
    }

    // 2. Path parameter: /t/:slug or /merchant/:slug
    try {
        const pathname = window.location.pathname;
        const pathMatch = pathname.match(/\/(?:t|merchant)\/([^/?#]+)/);
        if (pathMatch && pathMatch[1] && pathMatch[1].trim()) {
            return pathMatch[1].trim();
        }
    } catch {
        // ignore
    }

    // 3. Stored active merchant from session/local storage
    try {
        const stored = sessionStorage.getItem(STORED_TENANT_KEY) || localStorage.getItem(STORED_TENANT_KEY);
        if (stored && stored.trim()) {
            return stored.trim();
        }
    } catch {
        // ignore
    }

    // 4. Hostname: subdomain or custom domain
    try {
        const hostname = window.location.hostname;
        if (hostname && hostname !== "localhost" && hostname !== "127.0.0.1") {
            const parts = hostname.split(".");
            // Subdomain (e.g. dealer.sekka.com)
            if (parts.length >= 3 && !["www", "sekka"].includes(parts[0])) {
                return parts[0];
            }
            // Custom domain (e.g. mydealership.com)
            if (parts.length >= 2 && !hostname.includes("sekka.") && !hostname.includes("firebaseapp.com") && !hostname.includes("web.app")) {
                return hostname;
            }
        }
    } catch {
        // ignore
    }

    // 5. Environment variable
    if (import.meta.env.VITE_TENANT_ID && import.meta.env.VITE_TENANT_ID.trim()) {
        return import.meta.env.VITE_TENANT_ID.trim();
    }

    return null;
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
    const { user, profile, isPlatformAdmin, isSuperAdmin } = useAuth();
    const isPlatformPrivileged = isPlatformAdmin || isSuperAdmin;

    const [impersonatedId, setImpersonatedId] = useState(
        getStoredImpersonatedTenant
    );
    const [tenantData, setTenantData] = useState(null);
    const [loading, setLoading] = useState(true);

    const requestIdRef = useRef(0);

    const detectedId = detectTenantIdentifier();

    // In dashboard routes: regular merchants and staff are locked to their own tenant.
    // Platform admins operate in platform scope (tenantData = null) unless actively impersonating.
    const isDashboardPath =
        typeof window !== "undefined" &&
        window.location.pathname.includes("/dashboard");

    const activeIdentifier = isPlatformPrivileged
        ? impersonatedId || null
        : isDashboardPath && profile?.tenantId
          ? profile.tenantId
          : detectedId || profile?.tenantId || null;

    const refreshTenant = useCallback(async (identifier = activeIdentifier) => {
        const requestId = ++requestIdRef.current;

        if (!identifier) {
            setTenantData(null);
            setLoading(false);
            return null;
        }

        setLoading(true);

        try {
            // resolveTenant handles doc ID, slug, and custom domain
            const data = await resolveTenant(identifier);

            if (requestId !== requestIdRef.current) return null;

            if (data) {
                setTenantData(data);
                try {
                    sessionStorage.setItem(STORED_TENANT_KEY, data.id);
                    localStorage.setItem(STORED_TENANT_KEY, data.id);
                } catch {
                    // ignore
                }
            } else {
                setTenantData(null);
            }
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
    }, [activeIdentifier]);

    useEffect(() => {
        refreshTenant(activeIdentifier);

        return () => {
            requestIdRef.current += 1;
        };
    }, [activeIdentifier, user?.uid, refreshTenant]);

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
            sessionStorage.setItem(STORED_TENANT_KEY, tenantId);
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
            sessionStorage.removeItem(STORED_TENANT_KEY);
            localStorage.removeItem(STORED_TENANT_KEY);
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

    const effectiveTenantId = tenantData?.id || (isPlatformAdmin ? impersonatedId : null) || null;

    const value = {
        tenantId: effectiveTenantId,
        tenant: tenantData,
        loadingTenant: loading,
        isImpersonating: Boolean(
            isPlatformPrivileged && impersonatedId
        ),
        impersonatedTenantId: isPlatformPrivileged
            ? impersonatedId
            : null,
        switchTenant,
        exitImpersonation,
        isModuleEnabled,
        refreshTenant,
        daysRemaining,
        isExpiringSoon: daysRemaining <= 3 && daysRemaining > 0,
        isExpired: daysRemaining <= 0,
        tenantName: tenantData?.name || "",
        tenantSlug: tenantData?.slug || "",
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

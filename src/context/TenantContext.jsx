
import {
    createContext,
    useContext,
    useEffect,
    useState,
    useCallback,
    useMemo,
    useRef,
} from "react";

import { useAuth } from "@/context/AuthContext";
import {
    getBusinessOwner,
    getBusinessOwnerModules,
    calculateDaysRemaining,
    DEFAULT_MODULES,
} from "@/services/tenantService";

const BusinessContext = createContext(null);

const getDefaultModules = () =>
    Object.fromEntries(
        Object.keys(DEFAULT_MODULES).map((key) => [key, false])
    );

const normalizeRole = (role) =>
    String(role || "").toLowerCase().trim();

export const BusinessProvider = ({ children }) => {
    const {
        user,
        profile,
        role,
        isPlatformUser,
        isSuperAdmin,
        isPlatformAdmin,
    } = useAuth();

    const [business, setBusiness] = useState(null);
    const [businessModules, setBusinessModules] = useState(
        getDefaultModules
    );
    const [loadingBusiness, setLoadingBusiness] = useState(true);
    const [impersonatedBusiness, setImpersonatedBusiness] =
        useState(null);
    const [impersonationLoading, setImpersonationLoading] =
        useState(false);

    const requestRef = useRef(0);

    const isImpersonating = Boolean(impersonatedBusiness);

    const currentOwnerUid = useMemo(() => {
        if (isImpersonating) {
            return impersonatedBusiness?.ownerUid || null;
        }

        if (isPlatformUser) return null;

        if (normalizeRole(role) === "business_owner") {
            return profile?.ownerUid || profile?.uid || user?.uid || null;
        }

        return profile?.ownerUid || null;
    }, [
        isImpersonating,
        impersonatedBusiness,
        isPlatformUser,
        role,
        profile,
        user,
    ]);

    const loadBusinessData = useCallback(async (ownerUid) => {
        if (!ownerUid) {
            return {
                business: null,
                modules: getDefaultModules(),
            };
        }

        const ownerData = await getBusinessOwner(ownerUid);

        if (!ownerData) {
            return {
                business: null,
                modules: getDefaultModules(),
            };
        }

        const savedModules = await getBusinessOwnerModules(ownerUid);

        return {
            business: {
                ...ownerData,
                ownerUid,
            },
            modules: {
                ...getDefaultModules(),
                ...(savedModules || {}),
            },
        };
    }, []);

    const refreshBusiness = useCallback(async (ownerUid) => {
        const targetOwnerUid = ownerUid || currentOwnerUid;
        const requestId = ++requestRef.current;

        if (!targetOwnerUid) {
            setBusiness(null);
            setBusinessModules(getDefaultModules());
            setLoadingBusiness(false);
            return null;
        }

        setLoadingBusiness(true);

        try {
            const result = await loadBusinessData(targetOwnerUid);

            if (requestId !== requestRef.current) return null;

            setBusiness(result.business);
            setBusinessModules(result.modules);

            return result.business;
        } catch (error) {
            if (requestId === requestRef.current) {
                setBusiness(null);
                setBusinessModules(getDefaultModules());
            }

            console.error("Error refreshing business context:", error);
            throw error;
        } finally {
            if (requestId === requestRef.current) {
                setLoadingBusiness(false);
            }
        }
    }, [currentOwnerUid, loadBusinessData]);

    useEffect(() => {
        let active = true;
        const requestId = ++requestRef.current;

        const loadBusiness = async () => {
            if (!user || !currentOwnerUid) {
                setBusiness(null);
                setBusinessModules(getDefaultModules());
                setLoadingBusiness(false);
                return;
            }

            setLoadingBusiness(true);

            try {
                const result = await loadBusinessData(currentOwnerUid);

                if (!active || requestId !== requestRef.current) {
                    return;
                }

                setBusiness(result.business);
                setBusinessModules(result.modules);
            } catch (error) {
                if (!active || requestId !== requestRef.current) {
                    return;
                }

                console.error("Error loading business context:", error);
                setBusiness(null);
                setBusinessModules(getDefaultModules());
            } finally {
                if (active && requestId === requestRef.current) {
                    setLoadingBusiness(false);
                }
            }
        };

        loadBusiness();

        return () => {
            active = false;
        };
    }, [user, currentOwnerUid, loadBusinessData]);

    const startImpersonation = useCallback(async (ownerUid) => {
        if (!isSuperAdmin && !isPlatformAdmin) {
            throw new Error("ليس لديك صلاحية الدخول إلى نشاط آخر.");
        }

        if (!ownerUid) {
            throw new Error("لم يتم تحديد النشاط.");
        }

        const requestId = ++requestRef.current;

        setImpersonationLoading(true);

        try {
            const result = await loadBusinessData(ownerUid);

            if (requestId !== requestRef.current) {
                throw new Error("تم إلغاء طلب الدخول إلى النشاط.");
            }

            if (!result.business) {
                throw new Error("النشاط المطلوب غير موجود.");
            }

            setImpersonatedBusiness({
                ...result.business,
                ownerUid,
            });

            setBusiness(result.business);
            setBusinessModules(result.modules);
            setLoadingBusiness(false);

            return result.business;
        } finally {
            setImpersonationLoading(false);
        }
    }, [
        isSuperAdmin,
        isPlatformAdmin,
        loadBusinessData,
    ]);

    const exitImpersonation = useCallback(() => {
        requestRef.current += 1;

        setImpersonatedBusiness(null);
        setBusiness(null);
        setBusinessModules(getDefaultModules());
        setLoadingBusiness(true);
    }, []);

    const daysRemaining = calculateDaysRemaining(
        business?.subscription?.endDate
    );

    const hasSubscriptionEndDate = Boolean(
        business?.subscription?.endDate
    );

    const isExpired =
        business?.status === "active" &&
        hasSubscriptionEndDate &&
        typeof daysRemaining === "number" &&
        daysRemaining <= 0;

    const isExpiringSoon =
        business?.status === "active" &&
        hasSubscriptionEndDate &&
        typeof daysRemaining === "number" &&
        daysRemaining > 0 &&
        daysRemaining <= 3;

    const isModuleEnabled = useCallback((moduleKey) => {
        if (
            !moduleKey ||
            !Object.hasOwn(DEFAULT_MODULES, moduleKey)
        ) {
            return false;
        }

        if (!business || business.status !== "active") {
            return false;
        }

        if (business.subscription?.endDate) {
            const remainingDays = calculateDaysRemaining(
                business.subscription.endDate
            );

            if (
                typeof remainingDays === "number" &&
                remainingDays <= 0
            ) {
                return false;
            }
        }

        return businessModules[moduleKey] === true;
    }, [business, businessModules]);

    const value = {
        business,
        ownerUid: currentOwnerUid,
        businessModules,
        loadingBusiness,

        tenantName: business?.name || "",
        tenantId: currentOwnerUid,

        refreshBusiness,
        isModuleEnabled,
        daysRemaining,
        isExpiringSoon,
        isExpired,

        isPlatformUser,
        isImpersonating,
        impersonatedBusiness,
        impersonationLoading,

        startImpersonation,
        exitImpersonation,
    };

    return (
        <BusinessContext.Provider value={value}>
            {children}
        </BusinessContext.Provider>
    );
};

export const useBusiness = () => {
    const context = useContext(BusinessContext);

    if (!context) {
        throw new Error(
            "useBusiness must be used within a BusinessProvider"
        );
    }

    return context;
};

export const useTenant = useBusiness;
export const TenantProvider = BusinessProvider;

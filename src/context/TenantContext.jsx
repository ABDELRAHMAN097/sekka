
import {
    createContext,
    useContext,
    useEffect,
    useState,
    useCallback,
} from "react";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";

import { auth } from "@/services/authService";
import {
    getBusinessOwnerBySlug,
    getBusinessOwnerByDomain,
} from "@/services/tenantService";
import { db } from "@/config/firebase";

const AuthContext = createContext(null);

const PLATFORM_ROLES = [
    "super_admin",
    "platform_admin",
    "platform_staff",
];

const BUSINESS_ROLES = [
    "business_owner",
    "admin",
    "staff",
    "worker",
    "driver",
    "customer",
];

const PLATFORM_HOSTS = [
    "sekka504.vercel.app",
    "localhost",
    "127.0.0.1",
];

const getSiteOwner = async () => {
    if (typeof window === "undefined") return null;

    const hostname = window.location.hostname
        .trim()
        .toLowerCase();

    if (PLATFORM_HOSTS.includes(hostname)) return null;

    if (hostname.endsWith(".sekka504.vercel.app")) {
        const slug = hostname.replace(".sekka504.vercel.app", "");

        if (!slug || slug.includes(".")) return null;

        return getBusinessOwnerBySlug(slug);
    }

    if (
        hostname.endsWith(".vercel.app") ||
        hostname.endsWith(".web.app") ||
        hostname.endsWith(".firebaseapp.com")
    ) {
        return null;
    }

    return getBusinessOwnerByDomain(hostname);
};

const getPlatformRole = async (uid) => {
    const snapshot = await getDoc(doc(db, "platformRoles", uid));

    if (!snapshot.exists()) return null;

    const data = snapshot.data();
    const role = String(data?.role || "").trim().toLowerCase();

    return data?.status === "active" && PLATFORM_ROLES.includes(role)
        ? role
        : null;
};

const getCurrentProfile = async (uid) => {
    const [platformRole, siteOwner] = await Promise.all([
        getPlatformRole(uid).catch(() => null),
        getSiteOwner().catch(() => null),
    ]);

    if (platformRole) {
        const snapshot = await getDoc(doc(db, "users", uid));
        const data = snapshot.exists() ? snapshot.data() : {};

        return {
            uid,
            ...data,
            role: platformRole,
            platformRole,
            status: data.status || "active",
        };
    }

    if (siteOwner) {
        const ownerUid = siteOwner.ownerUid || siteOwner.uid || siteOwner.id;

        if (!ownerUid || siteOwner.status !== "active") {
            return null;
        }

        const snapshot = await getDoc(
            doc(db, "users", ownerUid, "users", uid)
        );

        if (!snapshot.exists()) return null;

        const data = snapshot.data();
        const role = String(data.role || "").trim().toLowerCase();

        if (!BUSINESS_ROLES.includes(role) || data.status !== "active") {
            return null;
        }

        return {
            uid,
            ...data,
            role,
            ownerUid,
            ownerName: siteOwner.name || "",
            ownerStatus: siteOwner.status,
        };
    }

    const snapshot = await getDoc(doc(db, "users", uid));

    if (!snapshot.exists()) return null;

    const data = snapshot.data();
    const role = String(data.role || "").trim().toLowerCase();

    if (role !== "business_owner") return null;

    return {
        uid,
        ...data,
        role,
        status: data.status || "pending",
    };
};

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [profile, setProfile] = useState(null);
    const [platformRole, setPlatformRole] = useState(null);
    const [loading, setLoading] = useState(true);

    const refreshProfile = useCallback(async (uid) => {
        const targetUid = uid || auth.currentUser?.uid;

        if (!targetUid) {
            setProfile(null);
            return null;
        }

        try {
            const data = await getCurrentProfile(targetUid);
            setProfile(data);
            setPlatformRole(data?.platformRole || null);
            return data;
        } catch (error) {
            console.error("Error refreshing profile:", error);
            setProfile(null);
            return null;
        }
    }, []);

    const refreshPlatformRole = useCallback(async (uid) => {
        if (!uid) {
            setPlatformRole(null);
            return null;
        }

        try {
            const role = await getPlatformRole(uid);
            setPlatformRole(role);
            return role;
        } catch (error) {
            setPlatformRole(null);
            return null;
        }
    }, []);

    useEffect(() => {
        let active = true;

        const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
            setLoading(true);
            setUser(firebaseUser);
            setProfile(null);
            setPlatformRole(null);

            if (!firebaseUser) {
                setLoading(false);
                return;
            }

            try {
                const data = await getCurrentProfile(firebaseUser.uid);

                if (!active) return;

                setProfile(data);
                setPlatformRole(data?.platformRole || null);
            } catch (error) {
                console.error("Error loading authentication data:", error);

                if (active) {
                    setProfile(null);
                    setPlatformRole(null);
                }
            } finally {
                if (active) setLoading(false);
            }
        });

        return () => {
            active = false;
            unsubscribe();
        };
    }, []);

    const role = profile?.role || null;

    const isSuperAdmin = role === "super_admin";
    const isPlatformAdmin = role === "platform_admin";
    const isPlatformStaff = role === "platform_staff";
    const isPlatformUser = PLATFORM_ROLES.includes(role);

    const isBusinessOwner = role === "business_owner";
    const isAdmin = isPlatformAdmin || isSuperAdmin ||
        isBusinessOwner || role === "admin";
    const isStaff = role === "staff";
    const isWorker = role === "worker";
    const isDriver = role === "driver";
    const isCustomer = role === "customer";

    const canAccessDashboard =
        isPlatformUser ||
        isBusinessOwner ||
        ["admin", "staff", "worker", "driver"].includes(role);

    const hasRole = useCallback((allowedRoles = []) => {
        if (!allowedRoles.length) return true;
        if (isSuperAdmin) return true;

        return allowedRoles.includes(role) ||
            allowedRoles.includes(platformRole);
    }, [role, platformRole, isSuperAdmin]);

    const value = {
        user,
        profile,
        role,
        platformRole,
        loading,
        isSuperAdmin,
        isPlatformAdmin,
        isPlatformStaff,
        isPlatformUser,
        isBusinessOwner,
        isAdmin,
        isStaff,
        isWorker,
        isDriver,
        isCustomer,
        canAccessDashboard,
        hasRole,
        refreshProfile,
        refreshPlatformRole,
    };

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => {
    const context = useContext(AuthContext);

    if (!context) {
        throw new Error("useAuth must be used within an AuthProvider");
    }

    return context;
};


import {
    createContext,
    useContext,
    useEffect,
    useState,
    useCallback,
    useRef,
} from "react";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";

import { auth, db, getPublicBusinessOwner } from "@/services/authService";

const AuthContext = createContext(null);

const PLATFORM_ROLES = [
    "super_admin",
    "platform_admin",
    "platform_staff",
];

const BUSINESS_OWNER_ROLES = ["business_owner"];

const BUSINESS_USER_ROLES = [
    "admin",
    "staff",
    "worker",
    "driver",
    "customer",
];

const normalizeRole = (role) =>
    String(role || "").toLowerCase().trim();

const getOwnerUid = (owner) =>
    owner?.ownerUid || owner?.id || owner?.uid || null;

const getPlatformProfile = async (uid, platformRole) => {
    const snapshot = await getDoc(doc(db, "users", uid));
    const data = snapshot.exists() ? snapshot.data() : {};

    return {
        ...data,
        uid,
        ownerUid: null,
        role: platformRole,
        status: "active",
    };
};

const getBusinessOwnerProfile = async (uid) => {
    const snapshot = await getDoc(doc(db, "users", uid));

    if (!snapshot.exists()) return null;

    const data = snapshot.data();
    const role = normalizeRole(data.role);

    if (!BUSINESS_OWNER_ROLES.includes(role)) return null;

    return {
        ...data,
        uid,
        ownerUid: uid,
        role,
        status: data.status || "pending",
    };
};

const getBusinessUserProfile = async (uid, owner) => {
    const ownerUid = getOwnerUid(owner);

    if (!ownerUid) return null;
    if (normalizeRole(owner.status) !== "active") return null;

    const snapshot = await getDoc(
        doc(db, "users", ownerUid, "users", uid)
    );

    if (!snapshot.exists()) return null;

    const data = snapshot.data();
    const role = normalizeRole(data.role);

    if (!BUSINESS_USER_ROLES.includes(role)) return null;
    if (data.status !== "active") return null;

    return {
        ...data,
        uid,
        ownerUid,
        role,
        status: data.status,
    };
};

const getActivePlatformRole = async (uid) => {
    const snapshot = await getDoc(doc(db, "platformRoles", uid));

    if (!snapshot.exists()) return null;

    const data = snapshot.data();
    const role = normalizeRole(data.role);

    return data.status === "active" && PLATFORM_ROLES.includes(role)
        ? role
        : null;
};

const loadAuthProfile = async (uid) => {
    const platformRole = await getActivePlatformRole(uid);

    if (platformRole) {
        const profile = await getPlatformProfile(uid, platformRole);

        return {
            profile,
            platformRole,
        };
    }

    const owner = await getPublicBusinessOwner();

    if (owner) {
        const businessUserProfile = await getBusinessUserProfile(uid, owner);

        return {
            profile: businessUserProfile,
            platformRole: null,
        };
    }

    const ownerProfile = await getBusinessOwnerProfile(uid);

    return {
        profile: ownerProfile,
        platformRole: null,
    };
};

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [profile, setProfile] = useState(null);
    const [platformRole, setPlatformRole] = useState(null);
    const [loading, setLoading] = useState(true);

    const requestRef = useRef(0);

    const refreshProfile = useCallback(async (uid) => {
        const targetUid = uid || auth.currentUser?.uid;

        if (!targetUid) {
            setProfile(null);
            setPlatformRole(null);
            return null;
        }

        const requestId = ++requestRef.current;

        try {
            const result = await loadAuthProfile(targetUid);

            if (requestId !== requestRef.current) return null;

            setProfile(result.profile || null);
            setPlatformRole(result.platformRole || null);

            return result.profile || null;
        } catch (error) {
            console.error("Error refreshing authentication profile:", error);

            if (requestId === requestRef.current) {
                setProfile(null);
                setPlatformRole(null);
            }

            return null;
        }
    }, []);

    const refreshPlatformRole = useCallback(async (uid) => {
        const targetUid = uid || auth.currentUser?.uid;

        if (!targetUid) {
            setPlatformRole(null);
            setProfile(null);
            return null;
        }

        const requestId = ++requestRef.current;

        try {
            const result = await loadAuthProfile(targetUid);

            if (requestId !== requestRef.current) return null;

            setProfile(result.profile || null);
            setPlatformRole(result.platformRole || null);

            return result.platformRole || null;
        } catch (error) {
            console.error("Error refreshing platform role:", error);

            if (requestId === requestRef.current) {
                setPlatformRole(null);
                setProfile(null);
            }

            return null;
        }
    }, []);

    useEffect(() => {
        let active = true;

        const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
            const requestId = ++requestRef.current;

            setLoading(true);
            setUser(firebaseUser);
            setProfile(null);
            setPlatformRole(null);

            if (!firebaseUser) {
                if (active) setLoading(false);
                return;
            }

            try {
                const result = await loadAuthProfile(firebaseUser.uid);

                if (!active || requestId !== requestRef.current) return;

                setProfile(result.profile || null);
                setPlatformRole(result.platformRole || null);
            } catch (error) {
                console.error("Error loading authentication data:", error);

                if (!active || requestId !== requestRef.current) return;

                setProfile(null);
                setPlatformRole(null);
            } finally {
                if (active && requestId === requestRef.current) {
                    setLoading(false);
                }
            }
        });

        return () => {
            active = false;
            requestRef.current += 1;
            unsubscribe();
        };
    }, []);

    const role = normalizeRole(profile?.role);

    const isSuperAdmin = role === "super_admin";
    const isPlatformAdmin =
        role === "platform_admin" || platformRole === "platform_admin";
    const isPlatformStaff =
        role === "platform_staff" || platformRole === "platform_staff";
    const isPlatformUser =
        isSuperAdmin || isPlatformAdmin || isPlatformStaff;

    const isBusinessOwner = role === "business_owner";
    const isOwnerActive = isBusinessOwner && profile?.status === "active";

    const isAdmin = role === "admin";
    const isStaff = role === "staff";
    const isWorker = role === "worker";
    const isDriver = role === "driver";
    const isCustomer = role === "customer";

    const ownerUid =
        profile?.ownerUid || (isBusinessOwner ? user?.uid : null);

    const canAccessDashboard =
        isPlatformUser ||
        isBusinessOwner ||
        isAdmin ||
        isStaff ||
        isWorker ||
        isDriver;

    const hasRole = (allowedRoles = []) => {
        const normalizedRoles = allowedRoles.map(normalizeRole);

        if (!normalizedRoles.length) return true;
        if (isSuperAdmin) return true;

        return (
            normalizedRoles.includes(role) ||
            normalizedRoles.includes(platformRole)
        );
    };

    return (
        <AuthContext.Provider
            value={{
                user,
                profile,
                role,
                ownerUid,
                platformRole,
                loading,

                isSuperAdmin,
                isPlatformAdmin,
                isPlatformStaff,
                isPlatformUser,

                isBusinessOwner,
                isOwnerActive,

                isAdmin,
                isStaff,
                isWorker,
                isDriver,
                isCustomer,

                canAccessDashboard,
                hasRole,

                refreshProfile,
                refreshPlatformRole,
            }}
        >
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

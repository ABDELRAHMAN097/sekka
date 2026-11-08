
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

const normalizeStatus = (status, fallback = "pending") =>
    String(status || fallback).toLowerCase().trim();

const getOwnerUid = (owner) =>
    owner?.ownerUid || owner?.id || owner?.uid || null;

const getPlatformRoleRecord = async (uid) => {
    const snapshot = await getDoc(doc(db, "platformRoles", uid));

    if (!snapshot.exists()) {
        return {
            exists: false,
            role: null,
        };
    }

    const data = snapshot.data();
    const role = normalizeRole(data.role);
    const status = normalizeStatus(data.status);

    return {
        exists: true,
        role:
            status === "active" && PLATFORM_ROLES.includes(role)
                ? role
                : null,
    };
};

const getPlatformProfile = async (uid, platformRole) => {
    const snapshot = await getDoc(doc(db, "users", uid));
    const data = snapshot.exists() ? snapshot.data() : {};

    return {
        ...data,
        uid,
        ownerUid: null,
        role: platformRole,
        status: "active",
        businessStatus: null,
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
        status: normalizeStatus(data.status),
        businessStatus: normalizeStatus(data.status),
    };
};

const getBusinessUserProfile = async (uid, owner) => {
    const ownerUid = getOwnerUid(owner);

    if (!ownerUid) return null;

    const snapshot = await getDoc(
        doc(db, "users", ownerUid, "users", uid)
    );

    if (!snapshot.exists()) return null;

    const data = snapshot.data();
    const role = normalizeRole(data.role);

    if (!BUSINESS_USER_ROLES.includes(role)) return null;

    return {
        ...data,
        uid,
        ownerUid,
        role,
        status: normalizeStatus(data.status),
        businessStatus: normalizeStatus(owner.status),
    };
};

const loadAuthProfile = async (uid) => {
    const platformRecord = await getPlatformRoleRecord(uid);

    if (platformRecord.exists) {
        if (!platformRecord.role) {
            return {
                profile: null,
                platformRole: null,
            };
        }

        const profile = await getPlatformProfile(
            uid,
            platformRecord.role
        );

        return {
            profile,
            platformRole: platformRecord.role,
        };
    }

    const owner = await getPublicBusinessOwner();

    if (owner) {
        const ownerUid = getOwnerUid(owner);

        if (uid === ownerUid) {
            return {
                profile: await getBusinessOwnerProfile(uid),
                platformRole: null,
            };
        }

        return {
            profile: await getBusinessUserProfile(uid, owner),
            platformRole: null,
        };
    }

    return {
        profile: await getBusinessOwnerProfile(uid),
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
            requestRef.current += 1;
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
            console.error(
                "Error refreshing authentication profile:",
                error
            );

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
            requestRef.current += 1;
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

        const unsubscribe = onAuthStateChanged(
            auth,
            async (firebaseUser) => {
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
                    const result = await loadAuthProfile(
                        firebaseUser.uid
                    );

                    if (
                        !active ||
                        requestId !== requestRef.current
                    ) {
                        return;
                    }

                    setProfile(result.profile || null);
                    setPlatformRole(result.platformRole || null);
                } catch (error) {
                    console.error(
                        "Error loading authentication data:",
                        error
                    );

                    if (
                        !active ||
                        requestId !== requestRef.current
                    ) {
                        return;
                    }

                    setProfile(null);
                    setPlatformRole(null);
                } finally {
                    if (
                        active &&
                        requestId === requestRef.current
                    ) {
                        setLoading(false);
                    }
                }
            }
        );

        return () => {
            active = false;
            requestRef.current += 1;
            unsubscribe();
        };
    }, []);

    const role = normalizeRole(profile?.role);
    const accountStatus = normalizeStatus(profile?.status);
    const businessStatus = normalizeStatus(
        profile?.businessStatus,
        accountStatus
    );

    const isSuperAdmin =
        platformRole === "super_admin";

    const isPlatformAdmin =
        platformRole === "platform_admin";

    const isPlatformStaff =
        platformRole === "platform_staff";

    const isPlatformUser =
        PLATFORM_ROLES.includes(platformRole);

    const isBusinessOwner =
        BUSINESS_OWNER_ROLES.includes(role);

    const isOwnerActive =
        isBusinessOwner &&
        accountStatus === "active";

    const isAdmin = role === "admin";
    const isStaff = role === "staff";
    const isWorker = role === "worker";
    const isDriver = role === "driver";
    const isCustomer = role === "customer";

    const isAccountActive =
        Boolean(profile) && accountStatus === "active";

    const isBusinessActive =
        isPlatformUser ||
        (
            Boolean(profile) &&
            businessStatus === "active"
        );

    const ownerUid =
        profile?.ownerUid ||
        (isBusinessOwner ? user?.uid : null);

    const canAccessDashboard =
        isPlatformUser ||
        (
            isAccountActive &&
            isBusinessActive &&
            (
                isBusinessOwner ||
                isAdmin ||
                isStaff ||
                isWorker ||
                isDriver
            )
        );

    const hasRole = useCallback((allowedRoles = []) => {
        const normalizedRoles = allowedRoles.map(normalizeRole);

        if (!normalizedRoles.length) return true;

        return (
            normalizedRoles.includes(role) ||
            normalizedRoles.includes(platformRole)
        );
    }, [role, platformRole]);

    return (
        <AuthContext.Provider
            value={{
                user,
                profile,
                role,
                ownerUid,
                platformRole,
                loading,

                accountStatus,
                businessStatus,
                isAccountActive,
                isBusinessActive,

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
        throw new Error(
            "useAuth must be used within an AuthProvider"
        );
    }

    return context;
};

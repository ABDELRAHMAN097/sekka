
import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";

import { auth } from "@/services/authService";
import { getUserProfile } from "@/services/profileService";
import { db } from "@/config/firebase";

const AuthContext = createContext(null);

const DASHBOARD_ROLES = [
    "super_admin",
    "admin",
    "driver",
    "worker",
    "staff",
    "tenant_owner",
    "tenant_admin",
    "tenant_staf",
    "tenant_staff",
    "tenant_driver",
    "platform_admin",
    "platform_staf",
    "platform_staff",
];

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [profile, setProfile] = useState(null);
    const [platformRole, setPlatformRole] = useState(null);
    const [loading, setLoading] = useState(true);

    const refreshProfile = useCallback(async (uid) => {
        const targetUid = uid || auth.currentUser?.uid;
        if (!targetUid) return null;

        try {
            const data = await getUserProfile(targetUid);
            setProfile(data || null);
            return data || null;
        } catch (error) {
            console.error("Error refreshing profile:", error);
            return null;
        }
    }, []);

    const refreshPlatformRole = useCallback(async (uid) => {
        if (!uid) {
            setPlatformRole(null);
            return null;
        }

        try {
            const snapshot = await getDoc(doc(db, "platformRoles", uid));
            const data = snapshot.exists() ? snapshot.data() : null;
            const validPlatformRoles = ["platform_admin", "platform_staf", "platform_staff"];
            const role = data?.status === "active" && validPlatformRoles.includes(data?.role)
                ? data.role
                : null;

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
                if (active) setLoading(false);
                return;
            }

            try {
                // 1. Primary profile from /users/{uid} (conforms to Firestore security rules)
                const userProfile = await getUserProfile(firebaseUser.uid);

                // 2. Optional platform / tenant lookups (safely isolated so missing collections don't break auth)
                let pRole = null;
                try {
                    const snapshot = await getDoc(doc(db, "platformRoles", firebaseUser.uid));
                    const data = snapshot.exists() ? snapshot.data() : null;
                    const valid = ["platform_admin", "platform_staf", "platform_staff"];
                    if (data?.status === "active" && valid.includes(data?.role)) {
                        pRole = data.role;
                    }
                } catch {
                    pRole = null;
                }

                let tenantDocSnap = null;
                try {
                    const tSnap = await getDoc(doc(db, "tenants", firebaseUser.uid));
                    tenantDocSnap = tSnap.exists() ? tSnap.data() : null;
                } catch {
                    tenantDocSnap = null;
                }

                if (!active) return;

                let effectiveRole = String(userProfile?.role || "customer").toLowerCase().trim();
                let effectiveTenantId = userProfile?.tenantId || "";

                const isPlatformPrivileged = [
                    "platform_admin",
                    "super_admin",
                    "platform_staf",
                    "platform_staff",
                    "admin",
                ].includes(effectiveRole) || [
                    "platform_admin",
                    "platform_staf",
                    "platform_staff"
                ].includes(pRole);

                // NEVER overwrite a platform administrator or super admin with tenant_owner
                if (!isPlatformPrivileged && tenantDocSnap && (tenantDocSnap.role === "tenant_owner" || !effectiveRole || effectiveRole === "customer")) {
                    effectiveRole = "tenant_owner";
                    effectiveTenantId = firebaseUser.uid;
                }

                if (isPlatformPrivileged) {
                    if (effectiveRole === "customer" && pRole) {
                        effectiveRole = pRole;
                    }
                    effectiveTenantId = "";
                }

                setProfile({
                    uid: firebaseUser.uid,
                    name: userProfile?.name || firebaseUser.displayName || "مستخدم",
                    email: firebaseUser.email,
                    phone: userProfile?.phone || firebaseUser.phoneNumber || "",
                    ...userProfile,
                    role: effectiveRole,
                    tenantId: effectiveTenantId,
                    status: userProfile?.status || "active",
                });
                setPlatformRole(pRole);
            } catch (error) {
                console.error("Error loading authentication data:", error);
                if (!active) return;

                setProfile({
                    uid: firebaseUser.uid,
                    name: firebaseUser.displayName || "مستخدم",
                    email: firebaseUser.email,
                    role: "customer",
                    status: "active",
                });
            } finally {
                if (active) setLoading(false);
            }
        });

        return () => {
            active = false;
            unsubscribe();
        };
    }, []);

    const role = String(profile?.role || "customer").toLowerCase().trim();
    const isPlatformAdmin = role === "platform_admin" || platformRole === "platform_admin";
    const isPlatformStaff = role === "platform_staf" || role === "platform_staff" || platformRole === "platform_staf" || platformRole === "platform_staff";
    const isPlatformUser = isPlatformAdmin || isPlatformStaff;
    const isSuperAdmin = isPlatformAdmin || role === "super_admin";
    const isTenantOwner = role === "tenant_owner";
    const isTenantStaff = role === "tenant_staf" || role === "tenant_staff" || role === "staff";
    const isTenantDriver = role === "tenant_driver" || role === "driver";
    const isAdmin = isPlatformUser || isTenantOwner || role === "admin" || role === "tenant_admin" || role === "platform_admin";
    const isDriver = isTenantDriver;
    const isCustomer = !isPlatformUser && !DASHBOARD_ROLES.includes(role);
    const canAccessDashboard = isPlatformUser || DASHBOARD_ROLES.includes(role);

    const hasRole = (allowedRoles = []) =>
        !allowedRoles.length ||
        isPlatformAdmin ||
        isSuperAdmin ||
        allowedRoles.includes(role) ||
        allowedRoles.includes(platformRole) ||
        (allowedRoles.includes("admin") && isAdmin) ||
        (allowedRoles.includes("super_admin") && isSuperAdmin) ||
        (allowedRoles.includes("tenant_staf") && (role === "staff" || role === "tenant_staff")) ||
        (allowedRoles.includes("tenant_driver") && role === "driver") ||
        (allowedRoles.includes("platform_staf") && isPlatformStaff);

    return (
        <AuthContext.Provider value={{
            user,
            profile,
            role,
            platformRole,
            loading,
            isPlatformAdmin,
            isPlatformStaff,
            isPlatformUser,
            isSuperAdmin,
            isTenantOwner,
            isTenantStaff,
            isTenantDriver,
            isAdmin,
            isDriver,
            isCustomer,
            canAccessDashboard,
            hasRole,
            refreshProfile,
            refreshPlatformRole,
        }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => {
    const context = useContext(AuthContext);

    if (!context) throw new Error("useAuth must be used within an AuthProvider");

    return context;
};

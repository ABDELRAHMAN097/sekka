
import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";

import { auth } from "@/services/authService";
import { getUserProfile } from "@/services/profileService";
import { db } from "@/config/firebase";

const AuthContext = createContext(null);

const DASHBOARD_ROLES = ["tenant_owner", "tenant_admin", "driver"];

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
            const role = data?.status === "active" && data?.role === "platform_admin"
                ? "platform_admin"
                : null;

            setPlatformRole(role);
            return role;
        } catch (error) {
            console.error("Error loading platform role:", error);
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
                const [userProfile, role] = await Promise.all([
                    getUserProfile(firebaseUser.uid),
                    (async () => {
                        const snapshot = await getDoc(
                            doc(db, "platformRoles", firebaseUser.uid)
                        );
                        const data = snapshot.exists() ? snapshot.data() : null;
                        return data?.status === "active" && data?.role === "platform_admin"
                            ? "platform_admin"
                            : null;
                    })(),
                ]);

                if (!active) return;

                setProfile(userProfile || {
                    uid: firebaseUser.uid,
                    name: firebaseUser.displayName || "مستخدم",
                    email: firebaseUser.email,
                    role: "customer",
                    status: "active",
                });
                setPlatformRole(role);
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

    const role = profile?.role || "customer";
    const isPlatformAdmin = platformRole === "platform_admin";
    const isSuperAdmin = isPlatformAdmin || role === "super_admin";
    const isAdmin = isPlatformAdmin || role === "admin" || role === "tenant_owner" || role === "tenant_admin";
    const isDriver = role === "driver";
    const isCustomer = role === "customer";
    const canAccessDashboard = isPlatformAdmin || DASHBOARD_ROLES.includes(role);

    const hasRole = (allowedRoles = []) =>
        !allowedRoles.length ||
        isPlatformAdmin ||
        allowedRoles.includes(role) ||
        allowedRoles.includes(platformRole);

    return (
        <AuthContext.Provider value={{
            user,
            profile,
            role,
            platformRole,
            loading,
            isPlatformAdmin,
            isSuperAdmin,
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

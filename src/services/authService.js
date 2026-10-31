
import {
    createUserWithEmailAndPassword,
    sendEmailVerification,
    sendPasswordResetEmail,
    signInWithEmailAndPassword,
    GoogleAuthProvider,
    signInWithPopup,
    signOut,
    updateProfile,
    updatePassword,
    reauthenticateWithCredential,
    EmailAuthProvider,
} from "firebase/auth";
import {
    doc,
    setDoc,
    getDoc,
    updateDoc,
    serverTimestamp,
} from "firebase/firestore";
import { auth, db } from "../config/firebase";
import {
    USERS_COLLECTION,
    getSearchFields,
    saveUserSearchFields,
} from "./userUtils";
import { resolveTenant } from "./tenantService";

export const googleProvider = new GoogleAuthProvider();

/**
 * Resolves the effective merchant tenant ID from:
 * 1. Explicit parameter (ID or slug)
 * 2. URL search parameters (?tenant=... or ?slug=...)
 * 3. Path (/t/:slug)
 * 4. Stored session or local storage
 * 5. Hostname (subdomain or custom domain)
 * 6. Environment variable
 */
export const getPublicTenantId = async (tenantId = null) => {
    // 1. Explicit argument
    if (tenantId) {
        const resolved = await resolveTenant(tenantId);
        if (resolved) return resolved.id;
    }

    if (typeof window === "undefined") return null;

    // 2. URL query parameters
    try {
        const search = window.location.search;
        if (search) {
            const params = new URLSearchParams(search);
            const queryVal = params.get("tenant") || params.get("slug");
            if (queryVal && queryVal.trim()) {
                const resolved = await resolveTenant(queryVal.trim());
                if (resolved) {
                    try {
                        sessionStorage.setItem("sekka_tenant_id", resolved.id);
                    } catch {}
                    return resolved.id;
                }
            }
        }
    } catch {
        // ignore
    }

    // 3. Path parameter: /t/:slug or /merchant/:slug
    try {
        const pathname = window.location.pathname;
        const match = pathname.match(/\/(?:t|merchant)\/([^/?#]+)/);
        if (match && match[1]) {
            const resolved = await resolveTenant(match[1]);
            if (resolved) {
                try {
                    sessionStorage.setItem("sekka_tenant_id", resolved.id);
                } catch {}
                return resolved.id;
            }
        }
    } catch {
        // ignore
    }

    // 4. Stored active merchant in storage
    try {
        const stored = sessionStorage.getItem("sekka_tenant_id") || localStorage.getItem("sekka_tenant_id");
        if (stored && stored.trim()) {
            return stored.trim();
        }
    } catch {
        // ignore
    }

    // 5. Hostname: subdomain or custom domain
    try {
        const hostname = window.location.hostname;
        if (hostname && hostname !== "localhost" && hostname !== "127.0.0.1") {
            const parts = hostname.split(".");
            if (parts.length >= 3 && !["www", "sekka"].includes(parts[0])) {
                const resolved = await resolveTenant(parts[0]);
                if (resolved) return resolved.id;
            }
            if (parts.length >= 2 && !hostname.includes("sekka.") && !hostname.includes("firebaseapp.com") && !hostname.includes("web.app")) {
                const resolved = await resolveTenant(hostname);
                if (resolved) return resolved.id;
            }
        }
    } catch {
        // ignore
    }

    // 6. Optional env variable
    if (import.meta.env.VITE_TENANT_ID && import.meta.env.VITE_TENANT_ID.trim()) {
        const resolved = await resolveTenant(import.meta.env.VITE_TENANT_ID.trim());
        if (resolved) return resolved.id;
    }

    return null;
};

/**
 * Saves user profile in root /users/{uid} document.
 */
const saveUserProfile = async (user, { name = "", phone = "", tenantId = null, isNewUser = false }) => {
    const userRef = doc(db, USERS_COLLECTION, user.uid);
    const displayName = name || user.displayName || "مستخدم";
    const userPhone = phone || user.phoneNumber || "";
    const userEmail = user.email || "";

    const searchFields = getSearchFields({
        name: displayName,
        email: userEmail,
        phone: userPhone,
    });

    const profile = {
        uid: user.uid,
        name: displayName,
        email: userEmail,
        phone: userPhone,
        role: "customer",
        status: "active",
        tenantId: tenantId || "",
        ...searchFields,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
    };

    // For brand new registration: write directly to avoid read rule failures on non-existent documents
    if (isNewUser) {
        await setDoc(userRef, profile);
        return profile;
    }

    try {
        const existing = await getDoc(userRef);
        if (existing.exists()) {
            const existingData = existing.data();
            await saveUserSearchFields(user.uid, existingData);

            if (!existingData.tenantId && tenantId) {
                try {
                    await updateDoc(userRef, { tenantId, updatedAt: serverTimestamp() });
                } catch (e) {
                    console.warn("Could not attach tenantId to existing user:", e);
                }
            }
            return existingData;
        }
    } catch (readErr) {
        console.warn("User profile read skipped (proceeding to write):", readErr?.message);
    }

    await setDoc(userRef, profile, { merge: true });
    return profile;
};

/**
 * Links a customer to a merchant tenant subcollection:
 * /tenants/{tenantId}/customers/{user.uid}
 */
export const linkTenantCustomer = async (user, tenantIdOrSlug) => {
    if (!tenantIdOrSlug || !user?.uid) return;

    try {
        const tenant = await resolveTenant(tenantIdOrSlug);
        if (!tenant || tenant.status !== "active") {
            return;
        }

        const tenantId = tenant.id;
        const customerRef = doc(db, "tenants", tenantId, "customers", user.uid);

        const customerData = {
            uid: user.uid,
            name: user.displayName || user.name || "عميل",
            email: user.email || "",
            phone: user.phoneNumber || user.phone || "",
            role: "", // Empty role string for customer as per DB requirements
            status: "active",
            updatedAt: serverTimestamp(),
        };

        // Using setDoc with merge: true safely creates or updates without requiring getDoc
        await setDoc(customerRef, {
            ...customerData,
            createdAt: serverTimestamp(),
        }, { merge: true });

        // Update root user profile with tenantId safely (preserve original registration merchant)
        try {
            const userRef = doc(db, USERS_COLLECTION, user.uid);
            const userSnap = await getDoc(userRef);
            if (userSnap.exists() && !userSnap.data()?.tenantId) {
                await updateDoc(userRef, {
                    tenantId,
                    updatedAt: serverTimestamp(),
                });
            }
        } catch {
            // ignore
        }
    } catch (error) {
        console.warn(`Customer linking to tenant notice (${tenantIdOrSlug}):`, error?.message);
    }
};

export const registerWithEmail = async ({
    email,
    password,
    name,
    phone = "",
    tenantId = null,
}) => {
    const result = await createUserWithEmailAndPassword(auth, email, password);
    const user = result.user;

    try {
        await updateProfile(user, { displayName: name || "" });
    } catch (updateErr) {
        console.warn("Could not update displayName:", updateErr);
    }

    let effectiveTenantId = null;
    try {
        effectiveTenantId = await getPublicTenantId(tenantId);
    } catch (tenantErr) {
        console.warn("Could not resolve tenant during register:", tenantErr);
    }

    const profile = await saveUserProfile(user, {
        name,
        phone,
        tenantId: effectiveTenantId,
        isNewUser: true,
    });

    if (effectiveTenantId) {
        try {
            await linkTenantCustomer(user, effectiveTenantId);
        } catch (linkErr) {
            console.warn("Could not link tenant customer:", linkErr);
        }
    }

    try {
        await sendEmailVerification(user);
    } catch (error) {
        console.warn("Could not send verification email:", error);
    }

    return { ...user, profile };
};

export const loginWithEmail = async (email, password, tenantId = null) => {
    const result = await signInWithEmailAndPassword(auth, email, password);
    const user = result.user;

    try {
        const userRef = doc(db, USERS_COLLECTION, user.uid);
        const userSnapshot = await getDoc(userRef);
        if (userSnapshot.exists()) {
            await saveUserSearchFields(user.uid, userSnapshot.data());
        }
    } catch (error) {
        console.error("User search fields update error:", error);
    }

    // Link customer to tenant on login if accessing from merchant site
    try {
        const effectiveTenantId = await getPublicTenantId(tenantId);
        if (effectiveTenantId) {
            await linkTenantCustomer(user, effectiveTenantId);
        }
    } catch (error) {
        console.warn("Tenant customer link on login warning:", error);
    }

    return result;
};

export const signInWithGoogle = async (tenantId = null) => {
    const result = await signInWithPopup(auth, googleProvider);
    const user = result.user;

    const effectiveTenantId = await getPublicTenantId(tenantId);

    await saveUserProfile(user, {
        name: user.displayName || "مستخدم Google",
        phone: user.phoneNumber || "",
        tenantId: effectiveTenantId,
    });

    if (effectiveTenantId) {
        await linkTenantCustomer(user, effectiveTenantId);
    }

    return result;
};

export const resetPassword = (email) =>
    sendPasswordResetEmail(auth, email);

export const logout = () => signOut(auth);

export const changeCurrentUserPassword = async (currentPassword, newPassword) => {
    const user = auth.currentUser;
    if (!user?.email) throw new Error("No authenticated user found.");

    const credential = EmailAuthProvider.credential(user.email, currentPassword);
    await reauthenticateWithCredential(user, credential);
    await updatePassword(user, newPassword);
    return true;
};

export const resendVerificationEmail = async () => {
    const user = auth.currentUser;
    if (!user) throw new Error("No authenticated user found.");

    await sendEmailVerification(user);
    return true;
};

export { auth, db };

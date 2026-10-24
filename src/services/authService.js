
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
    serverTimestamp,
} from "firebase/firestore";
import { auth, db } from "../config/firebase";
import {
    USERS_COLLECTION,
    getSearchFields,
    saveUserSearchFields,
} from "./userUtils";

export const googleProvider = new GoogleAuthProvider();

const getPublicTenantId = (tenantId) => {
    if (tenantId) return tenantId;

    if (typeof window === "undefined") return null;

    const hostname = window.location.hostname;
    if (hostname === "localhost" || hostname === "127.0.0.1") {
        return import.meta.env.VITE_TENANT_ID || null;
    }

    const parts = hostname.split(".");
    if (parts.length < 3 || ["www", "sekka"].includes(parts[0])) {
        return import.meta.env.VITE_TENANT_ID || null;
    }

    return parts[0];
};

const saveUserProfile = async (user, { name, phone = "" }) => {
    const userRef = doc(db, USERS_COLLECTION, user.uid);
    const existing = await getDoc(userRef);

    if (existing.exists()) {
        await saveUserSearchFields(user.uid, existing.data());
        return existing.data();
    }

    const profile = {
        uid: user.uid,
        name: name || user.displayName || "مستخدم",
        email: user.email || "",
        phone: phone || user.phoneNumber || "",
        role: "customer",
        status: "active",
        ...getSearchFields({
            name: name || user.displayName || "مستخدم",
            email: user.email || "",
            phone: phone || user.phoneNumber || "",
        }),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
    };

    await setDoc(userRef, profile);
    return profile;
};

const linkTenantCustomer = async (user, tenantId) => {
    if (!tenantId) return;

    const tenantRef = doc(db, "tenants", tenantId);
    const tenantSnapshot = await getDoc(tenantRef);

    if (!tenantSnapshot.exists() || tenantSnapshot.data()?.status !== "active") {
        throw new Error("The selected tenant is unavailable.");
    }

    const customerRef = doc(db, "tenants", tenantId, "customers", user.uid);
    const customerSnapshot = await getDoc(customerRef);

    if (!customerSnapshot.exists()) {
        await setDoc(customerRef, {
            uid: user.uid,
            name: user.displayName || "",
            email: user.email || "",
            phone: user.phoneNumber || "",
            role: "customer",
            status: "active",
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
        });
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

    await updateProfile(user, { displayName: name || "" });

    const profile = await saveUserProfile(user, { name, phone });
    await linkTenantCustomer(user, getPublicTenantId(tenantId));

    try {
        await sendEmailVerification(user);
    } catch (error) {
        console.warn("Could not send verification email:", error);
    }

    return { ...user, profile };
};

export const loginWithEmail = async (email, password) => {
    const result = await signInWithEmailAndPassword(auth, email, password);

    try {
        const userRef = doc(db, USERS_COLLECTION, result.user.uid);
        const userSnapshot = await getDoc(userRef);
        if (userSnapshot.exists()) {
            await saveUserSearchFields(result.user.uid, userSnapshot.data());
        }
    } catch (error) {
        console.error("User search fields update error:", error);
    }

    return result;
};

export const signInWithGoogle = async (tenantId = null) => {
    const result = await signInWithPopup(auth, googleProvider);
    const user = result.user;

    await saveUserProfile(user, {
        name: user.displayName || "مستخدم Google",
        phone: user.phoneNumber || "",
    });

    await linkTenantCustomer(user, getPublicTenantId(tenantId));

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

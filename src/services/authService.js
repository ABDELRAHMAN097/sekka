
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
import { getSearchFields } from "./userUtils";
import {
    getBusinessOwnerBySlug,
    getBusinessOwnerByDomain,
} from "./tenantService";

export const googleProvider = new GoogleAuthProvider();

const PLATFORM_HOST = "sekka504.vercel.app";

const PLATFORM_ROLES = [
    "super_admin",
    "platform_admin",
    "platform_staff",
];

const BUSINESS_OWNER_ROLES = [
    "business_owner",
];

const BUSINESS_USER_ROLES = [
    "admin",
    "staff",
    "worker",
    "driver",
    "customer",
];

const normalizeRole = (role) =>
    String(role || "").trim().toLowerCase();

const getOwnerUid = (owner) =>
    owner?.ownerUid || owner?.id || owner?.uid || null;

export const getPublicBusinessOwner = async () => {
    if (typeof window === "undefined") return null;

    const hostname = window.location.hostname.trim().toLowerCase();

    if (
        hostname === PLATFORM_HOST ||
        hostname === "localhost" ||
        hostname === "127.0.0.1"
    ) {
        return null;
    }

    if (hostname.endsWith(`.${PLATFORM_HOST}`)) {
        const slug = hostname.slice(0, -(PLATFORM_HOST.length + 1));

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

const getRootUserRef = (uid) =>
    doc(db, "users", uid);

const getBusinessUserRef = (ownerUid, userUid) =>
    doc(db, "users", ownerUid, "users", userUid);

const getActivePlatformRole = async (uid) => {
    const snapshot = await getDoc(doc(db, "platformRoles", uid));

    if (!snapshot.exists()) return null;

    const data = snapshot.data();
    const role = normalizeRole(data.role);

    return data.status === "active" && PLATFORM_ROLES.includes(role)
        ? role
        : null;
};

const buildProfile = (user, data, role, status) => {
    const name = data.name || user.displayName || "مستخدم";
    const email = user.email || data.email || "";
    const phone = data.phone || user.phoneNumber || "";

    return {
        ...data,
        uid: user.uid,
        name,
        email,
        emailNormalized: email.toLowerCase().trim(),
        phone,
        ...getSearchFields({ name, email, phone }),
        role,
        status,
        updatedAt: serverTimestamp(),
    };
};

const saveOwnerProfile = async (
    user,
    { name = "", phone = "" } = {}
) => {
    const userRef = getRootUserRef(user.uid);
    const snapshot = await getDoc(userRef);
    const existing = snapshot.exists() ? snapshot.data() : {};

    if (
        snapshot.exists() &&
        !BUSINESS_OWNER_ROLES.includes(normalizeRole(existing.role))
    ) {
        throw new Error("هذا الحساب مرتبط بدور آخر ولا يمكن تسجيله كصاحب نشاط.");
    }

    const status = existing.status || "pending";

    const profile = buildProfile(
        user,
        {
            ...existing,
            name: name || existing.name,
            phone: phone || existing.phone,
        },
        "business_owner",
        status
    );

    await setDoc(userRef, {
        ...profile,
        role: "business_owner",
        status,
        createdAt: existing.createdAt || serverTimestamp(),
    }, { merge: true });

    return profile;
};

const saveBusinessUserProfile = async (
    user,
    ownerUid,
    { name = "", phone = "", role = "customer" } = {}
) => {
    if (!ownerUid) {
        throw new Error("تعذر تحديد حساب صاحب النشاط.");
    }

    const userRef = getBusinessUserRef(ownerUid, user.uid);
    const snapshot = await getDoc(userRef);
    const existing = snapshot.exists() ? snapshot.data() : {};

    if (snapshot.exists() && existing.status !== "active") {
        throw new Error("هذا الحساب غير نشط. يرجى التواصل مع إدارة النشاط.");
    }

    const finalRole = normalizeRole(existing.role || role);

    if (!BUSINESS_USER_ROLES.includes(finalRole)) {
        throw new Error("دور هذا الحساب غير صالح داخل النشاط.");
    }

    const status = existing.status || "active";

    const profile = buildProfile(
        user,
        {
            ...existing,
            name: name || existing.name,
            phone: phone || existing.phone,
        },
        finalRole,
        status
    );

    await setDoc(userRef, {
        ...profile,
        ownerUid,
        role: finalRole,
        status,
        createdAt: existing.createdAt || serverTimestamp(),
    }, { merge: true });

    return profile;
};

const getLoginProfile = async (user) => {
    const platformRole = await getActivePlatformRole(user.uid);

    if (platformRole) {
        const snapshot = await getDoc(getRootUserRef(user.uid));
        const data = snapshot.exists() ? snapshot.data() : {};

        return {
            ...data,
            uid: user.uid,
            role: platformRole,
            status: "active",
            platformRole,
        };
    }

    const owner = await getPublicBusinessOwner();

    if (owner) {
        if (owner.status !== "active") {
            throw new Error("موقع النشاط غير مفعل حاليًا.");
        }

        const ownerUid = getOwnerUid(owner);

        if (!ownerUid) {
            throw new Error("تعذر تحديد حساب صاحب النشاط.");
        }

        const snapshot = await getDoc(
            getBusinessUserRef(ownerUid, user.uid)
        );

        if (!snapshot.exists()) {
            throw new Error("لا يوجد حساب مرتبط بهذا النشاط.");
        }

        const data = snapshot.data();
        const role = normalizeRole(data.role);

        if (!BUSINESS_USER_ROLES.includes(role)) {
            throw new Error("دور هذا الحساب غير صالح داخل النشاط.");
        }

        if (data.status !== "active") {
            throw new Error("هذا الحساب غير نشط. يرجى التواصل مع إدارة النشاط.");
        }

        return {
            ...data,
            uid: user.uid,
            ownerUid,
            role,
            status: data.status,
        };
    }

    const snapshot = await getDoc(getRootUserRef(user.uid));

    if (!snapshot.exists()) {
        throw new Error("لا يوجد حساب صاحب نشاط مرتبط بهذا المستخدم.");
    }

    const data = snapshot.data();
    const role = normalizeRole(data.role);

    if (!BUSINESS_OWNER_ROLES.includes(role)) {
        throw new Error("ليس لديك صلاحية الدخول إلى منصة سِكّة.");
    }

    return {
        ...data,
        uid: user.uid,
        role,
        status: data.status || "pending",
    };
};

const validateLogin = async (user) => {
    try {
        return await getLoginProfile(user);
    } catch (error) {
        await signOut(auth);
        throw error;
    }
};

export const registerWithEmail = async ({
    email,
    password,
    name,
    phone = "",
}) => {
    const owner = await getPublicBusinessOwner();
    const ownerUid = getOwnerUid(owner);

    if (owner && owner.status !== "active") {
        throw new Error("موقع النشاط غير مفعل حاليًا.");
    }

    if (owner && !ownerUid) {
        throw new Error("تعذر تحديد حساب صاحب النشاط.");
    }

    const result = await createUserWithEmailAndPassword(
        auth,
        email,
        password
    );

    const user = result.user;

    try {
        await updateProfile(user, {
            displayName: name || "",
        });

        const profile = owner
            ? await saveBusinessUserProfile(user, ownerUid, {
                name,
                phone,
                role: "customer",
            })
            : await saveOwnerProfile(user, { name, phone });

        await sendEmailVerification(user);

        return { ...result, profile };
    } catch (error) {
        await signOut(auth);
        throw error;
    }
};

export const loginWithEmail = async (email, password) => {
    const result = await signInWithEmailAndPassword(
        auth,
        email,
        password
    );

    const profile = await validateLogin(result.user);

    return { ...result, profile };
};

export const signInWithGoogle = async () => {
    const result = await signInWithPopup(auth, googleProvider);
    const user = result.user;

    try {
        const platformRole = await getActivePlatformRole(user.uid);

        if (platformRole) {
            const snapshot = await getDoc(getRootUserRef(user.uid));
            const data = snapshot.exists() ? snapshot.data() : {};

            return {
                ...result,
                profile: {
                    ...data,
                    uid: user.uid,
                    role: platformRole,
                    status: "active",
                    platformRole,
                },
            };
        }

        const owner = await getPublicBusinessOwner();

        if (owner) {
            if (owner.status !== "active") {
                throw new Error("موقع النشاط غير مفعل حاليًا.");
            }

            const ownerUid = getOwnerUid(owner);

            if (!ownerUid) {
                throw new Error("تعذر تحديد حساب صاحب النشاط.");
            }

            const profile = await saveBusinessUserProfile(
                user,
                ownerUid,
                {
                    name: user.displayName || "مستخدم Google",
                    phone: user.phoneNumber || "",
                    role: "customer",
                }
            );

            return { ...result, profile };
        }

        const snapshot = await getDoc(getRootUserRef(user.uid));

        if (!snapshot.exists()) {
            const profile = await saveOwnerProfile(user, {
                name: user.displayName || "صاحب نشاط",
                phone: user.phoneNumber || "",
            });

            return { ...result, profile };
        }

        const data = snapshot.data();
        const role = normalizeRole(data.role);

        if (!BUSINESS_OWNER_ROLES.includes(role)) {
            throw new Error("ليس لديك صلاحية الدخول إلى منصة سِكّة.");
        }

        return {
            ...result,
            profile: {
                ...data,
                uid: user.uid,
                role,
                status: data.status || "pending",
            },
        };
    } catch (error) {
        await signOut(auth);
        throw error;
    }
};

export const resetPassword = (email) =>
    sendPasswordResetEmail(auth, email);

export const logout = () =>
    signOut(auth);

export const changeCurrentUserPassword = async (
    currentPassword,
    newPassword
) => {
    const user = auth.currentUser;

    if (!user?.email) {
        throw new Error("No authenticated user found.");
    }

    const credential = EmailAuthProvider.credential(
        user.email,
        currentPassword
    );

    await reauthenticateWithCredential(user, credential);
    await updatePassword(user, newPassword);

    return true;
};

export const resendVerificationEmail = async () => {
    const user = auth.currentUser;

    if (!user) {
        throw new Error("No authenticated user found.");
    }

    await sendEmailVerification(user);

    return true;
};

export { auth, db };

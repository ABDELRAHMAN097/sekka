
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

const PLATFORM_HOST = (
    import.meta.env.VITE_PLATFORM_HOST || "sekka504.vercel.app"
).trim().toLowerCase();

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

const normalizeStatus = (status, fallback = "pending") =>
    String(status || fallback).trim().toLowerCase();

const getOwnerUid = (owner) =>
    owner?.ownerUid || owner?.id || owner?.uid || null;

const getRootUserRef = (uid) =>
    doc(db, "users", uid);

const getBusinessUserRef = (ownerUid, userUid) =>
    doc(db, "users", ownerUid, "users", userUid);

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

const getPlatformProfile = async (user, platformRole) => {
    const snapshot = await getDoc(getRootUserRef(user.uid));
    const data = snapshot.exists() ? snapshot.data() : {};

    return {
        ...data,
        uid: user.uid,
        ownerUid: null,
        role: platformRole,
        status: "active",
        platformRole,
    };
};

const getSiteContext = async () => {
    if (typeof window === "undefined") {
        throw new Error("تعذر تحديد موقع تسجيل الدخول.");
    }

    const hostname = window.location.hostname
        .trim()
        .toLowerCase()
        .replace(/\.$/, "");

    if (
        hostname === PLATFORM_HOST ||
        hostname === "localhost" ||
        hostname === "127.0.0.1"
    ) {
        return {
            type: "platform",
            owner: null,
        };
    }

    if (hostname.endsWith(`.${PLATFORM_HOST}`)) {
        const slug = hostname.slice(
            0,
            -(PLATFORM_HOST.length + 1)
        );

        if (!slug || slug.includes(".")) {
            throw new Error("عنوان موقع النشاط غير صالح.");
        }

        const owner = await getBusinessOwnerBySlug(slug);

        if (!owner || !getOwnerUid(owner)) {
            throw new Error("لم يتم العثور على النشاط المطلوب.");
        }

        return {
            type: "business",
            owner,
        };
    }

    if (
        hostname.endsWith(".vercel.app") ||
        hostname.endsWith(".web.app") ||
        hostname.endsWith(".firebaseapp.com")
    ) {
        throw new Error("هذا الموقع غير مسجل على منصة سِكّة.");
    }

    const owner = await getBusinessOwnerByDomain(hostname);

    if (!owner || !getOwnerUid(owner)) {
        throw new Error("هذا الدومين غير مرتبط بأي نشاط على سِكّة.");
    }

    return {
        type: "business",
        owner,
    };
};

export const getPublicBusinessOwner = async () => {
    const context = await getSiteContext();

    return context.type === "business"
        ? context.owner
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
        throw new Error(
            "هذا الحساب مرتبط بدور آخر ولا يمكن تسجيله كصاحب نشاط."
        );
    }

    const status = normalizeStatus(existing.status);

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

    await setDoc(
        userRef,
        {
            ...profile,
            role: "business_owner",
            status,
            createdAt: existing.createdAt || serverTimestamp(),
        },
        { merge: true }
    );

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

    const ownerSnapshot = await getDoc(getRootUserRef(ownerUid));

    if (!ownerSnapshot.exists()) {
        throw new Error("النشاط المطلوب غير موجود.");
    }

    const ownerData = ownerSnapshot.data();

    if (
        normalizeRole(ownerData.role) !== "business_owner" ||
        normalizeStatus(ownerData.status) !== "active"
    ) {
        throw new Error("النشاط غير مفعل حاليًا.");
    }

    const userRef = getBusinessUserRef(ownerUid, user.uid);
    const snapshot = await getDoc(userRef);
    const existing = snapshot.exists() ? snapshot.data() : {};

    if (
        snapshot.exists() &&
        normalizeStatus(existing.status) !== "active"
    ) {
        throw new Error(
            "هذا الحساب غير نشط. يرجى التواصل مع إدارة النشاط."
        );
    }

    const finalRole = normalizeRole(existing.role || role);

    if (!BUSINESS_USER_ROLES.includes(finalRole)) {
        throw new Error("دور هذا الحساب غير صالح داخل النشاط.");
    }

    const status = normalizeStatus(existing.status, "active");

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

    await setDoc(
        userRef,
        {
            ...profile,
            ownerUid,
            role: finalRole,
            status,
            createdAt: existing.createdAt || serverTimestamp(),
        },
        { merge: true }
    );

    return {
        ...profile,
        ownerUid,
    };
};

const getLoginProfile = async (user) => {
    const platformRecord = await getPlatformRoleRecord(user.uid);

    if (platformRecord.exists) {
        if (!platformRecord.role) {
            throw new Error(
                "حساب المنصة غير نشط أو لا يملك دورًا صالحًا."
            );
        }

        return getPlatformProfile(user, platformRecord.role);
    }

    const context = await getSiteContext();

    if (context.type === "business") {
        const owner = context.owner;

        if (normalizeStatus(owner.status) !== "active") {
            throw new Error("موقع النشاط غير مفعل حاليًا.");
        }

        const ownerUid = getOwnerUid(owner);

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

        if (normalizeStatus(data.status) !== "active") {
            throw new Error(
                "هذا الحساب غير نشط. يرجى التواصل مع إدارة النشاط."
            );
        }

        return {
            ...data,
            uid: user.uid,
            ownerUid,
            role,
            status: normalizeStatus(data.status),
            businessStatus: normalizeStatus(owner.status),
        };
    }

    const snapshot = await getDoc(getRootUserRef(user.uid));

    if (!snapshot.exists()) {
        throw new Error(
            "لا يوجد حساب صاحب نشاط مرتبط بهذا المستخدم."
        );
    }

    const data = snapshot.data();
    const role = normalizeRole(data.role);

    if (!BUSINESS_OWNER_ROLES.includes(role)) {
        throw new Error("ليس لديك صلاحية الدخول إلى منصة سِكّة.");
    }

    return {
        ...data,
        uid: user.uid,
        ownerUid: user.uid,
        role,
        status: normalizeStatus(data.status),
        businessStatus: normalizeStatus(data.status),
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
    const context = await getSiteContext();

    if (
        context.type === "business" &&
        normalizeStatus(context.owner.status) !== "active"
    ) {
        throw new Error("موقع النشاط غير مفعل حاليًا.");
    }

    const ownerUid =
        context.type === "business"
            ? getOwnerUid(context.owner)
            : null;

    if (context.type === "business" && !ownerUid) {
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

        const profile =
            context.type === "business"
                ? await saveBusinessUserProfile(user, ownerUid, {
                    name,
                    phone,
                    role: "customer",
                })
                : await saveOwnerProfile(user, {
                    name,
                    phone,
                });

        await sendEmailVerification(user);

        return {
            ...result,
            profile,
        };
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

    return {
        ...result,
        profile,
    };
};

export const signInWithGoogle = async () => {
    const result = await signInWithPopup(auth, googleProvider);
    const user = result.user;

    try {
        const platformRecord = await getPlatformRoleRecord(user.uid);

        if (platformRecord.exists) {
            if (!platformRecord.role) {
                throw new Error(
                    "حساب المنصة غير نشط أو لا يملك دورًا صالحًا."
                );
            }

            const profile = await getPlatformProfile(
                user,
                platformRecord.role
            );

            return {
                ...result,
                profile,
            };
        }

        const context = await getSiteContext();

        if (context.type === "business") {
            if (normalizeStatus(context.owner.status) !== "active") {
                throw new Error("موقع النشاط غير مفعل حاليًا.");
            }

            const ownerUid = getOwnerUid(context.owner);

            if (!ownerUid) {
                throw new Error("تعذر تحديد حساب صاحب النشاط.");
            }

            const snapshot = await getDoc(
                getBusinessUserRef(ownerUid, user.uid)
            );

            const profile = snapshot.exists()
                ? await getLoginProfile(user)
                : await saveBusinessUserProfile(
                    user,
                    ownerUid,
                    {
                        name: user.displayName || "مستخدم Google",
                        phone: user.phoneNumber || "",
                        role: "customer",
                    }
                );

            return {
                ...result,
                profile,
            };
        }

        const snapshot = await getDoc(getRootUserRef(user.uid));

        if (!snapshot.exists()) {
            const profile = await saveOwnerProfile(user, {
                name: user.displayName || "صاحب نشاط",
                phone: user.phoneNumber || "",
            });

            return {
                ...result,
                profile,
            };
        }

        const profile = await getLoginProfile(user);

        return {
            ...result,
            profile,
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

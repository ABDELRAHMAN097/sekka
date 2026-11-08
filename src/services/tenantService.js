
import {
    collection,
    doc,
    getDoc,
    getDocs,
    setDoc,
    updateDoc,
    deleteDoc,
    query,
    where,
    serverTimestamp,
} from "firebase/firestore";
import { db } from "../config/firebase";

export const USERS_COLLECTION = "users";

export const BUSINESS_USER_ROLES = [
    "admin",
    "staff",
    "worker",
    "driver",
    "customer",
];

export const DEFAULT_MODULES = {
    editLanding: false,
    fleet: false,
    wallet: false,
    reports: false,
    users: false,
    customDomain: false,
};

const normalizeSlug = (value) =>
    typeof value === "string" ? value.trim().toLowerCase() : "";

const normalizeDomain = (value) => {
    if (typeof value !== "string") return "";

    return value
        .trim()
        .toLowerCase()
        .replace(/^https?:\/\//, "")
        .replace(/^www\./, "")
        .split("/")[0]
        .split(":")[0];
};

const normalizeBusinessOwner = (snapshot) => {
    if (!snapshot?.exists()) return null;

    const data = snapshot.data();

    return {
        ...data,
        ownerUid: snapshot.id,
        subscription: data.subscription || null,
    };
};

const getDateValue = (value) => {
    if (!value) return null;

    if (typeof value?.toDate === "function") {
        const date = value.toDate();
        return Number.isNaN(date.getTime()) ? null : date;
    }

    if (typeof value?.seconds === "number") {
        const date = new Date(value.seconds * 1000);
        return Number.isNaN(date.getTime()) ? null : date;
    }

    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
};

const getOwnerRef = (ownerUid) => {
    if (!ownerUid || typeof ownerUid !== "string") {
        throw new Error("معرّف صاحب النشاط غير صحيح.");
    }

    return doc(db, USERS_COLLECTION, ownerUid);
};

const getOwnerUsersRef = (ownerUid) =>
    collection(db, USERS_COLLECTION, ownerUid, "users");

const getOwnerModulesRef = (ownerUid) =>
    collection(db, USERS_COLLECTION, ownerUid, "modules");

const getOwnerSettingsRef = (ownerUid) =>
    collection(db, USERS_COLLECTION, ownerUid, "settings");

export const createDefaultBusinessOwnerData = ({
    name = "",
    email = "",
    phone = "",
    slug = "",
    domain = "",
} = {}) => ({
    name: name.trim(),
    email: email.trim().toLowerCase(),
    phone: phone.trim(),
    role: "business_owner",
    status: "pending",
    slug: normalizeSlug(slug),
    domain: normalizeDomain(domain),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
});

export const getBusinessOwner = async (ownerUid) => {
    if (!ownerUid) return null;

    try {
        const snapshot = await getDoc(getOwnerRef(ownerUid));

        if (!snapshot.exists()) return null;

        const owner = normalizeBusinessOwner(snapshot);

        return owner.role === "business_owner" ? owner : null;
    } catch (error) {
        console.error("Error fetching business owner:", error);
        throw error;
    }
};

export const getBusinessOwnerBySlug = async (slug) => {
    const normalizedSlug = normalizeSlug(slug);
    if (!normalizedSlug) return null;

    try {
        const ownersRef = collection(db, USERS_COLLECTION);
        const ownerQuery = query(
            ownersRef,
            where("slug", "==", normalizedSlug)
        );
        const snapshot = await getDocs(ownerQuery);

        const ownerDoc = snapshot.docs.find(
            (item) => item.data().role === "business_owner"
        );

        return ownerDoc ? normalizeBusinessOwner(ownerDoc) : null;
    } catch (error) {
        console.error("Error resolving business owner by slug:", error);
        throw error;
    }
};

export const getBusinessOwnerByDomain = async (domain) => {
    const normalizedDomain = normalizeDomain(domain);
    if (!normalizedDomain) return null;

    try {
        const ownersRef = collection(db, USERS_COLLECTION);
        const ownerQuery = query(
            ownersRef,
            where("domain", "==", normalizedDomain)
        );
        const snapshot = await getDocs(ownerQuery);

        const ownerDoc = snapshot.docs.find(
            (item) => item.data().role === "business_owner"
        );

        return ownerDoc ? normalizeBusinessOwner(ownerDoc) : null;
    } catch (error) {
        console.error("Error resolving business owner by domain:", error);
        throw error;
    }
};

export const resolveBusinessOwner = async (identifier) => {
    if (!identifier || typeof identifier !== "string") return null;

    const value = identifier.trim().toLowerCase();
    if (!value) return null;

    const isDomain =
        value.includes(".") ||
        value.includes("://");

    return isDomain
        ? getBusinessOwnerByDomain(value)
        : getBusinessOwnerBySlug(value);
};

export const createBusinessOwner = async (ownerUid, ownerData) => {
    if (!ownerUid || !ownerData || typeof ownerData !== "object") {
        throw new Error("بيانات صاحب النشاط غير مكتملة.");
    }

    const ownerRef = getOwnerRef(ownerUid);
    const existing = await getDoc(ownerRef);

    if (existing.exists()) {
        throw new Error("يوجد حساب مسجل بالفعل بهذا المعرّف.");
    }

    const data = createDefaultBusinessOwnerData({
        name: ownerData.name,
        email: ownerData.email,
        phone: ownerData.phone,
        slug: ownerData.slug,
        domain: ownerData.domain,
    });

    await setDoc(ownerRef, {
        ...data,
        imageUrl: ownerData.imageUrl || "",
        address: ownerData.address || "",
        description: ownerData.description || "",
        subscription: null,
        role: "business_owner",
        status: "pending",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
    });

    return true;
};

export const updateBusinessOwner = async (ownerUid, data) => {
    if (!ownerUid || !data || typeof data !== "object") {
        throw new Error("بيانات التحديث غير صحيحة.");
    }

    const allowedFields = [
    "name",
    "email",
    "phone",
    "slug",
    "domain",
    "imageUrl",
    "address",
    "description",
];

    const updates = {};

    allowedFields.forEach((field) => {
        if (data[field] !== undefined) {
            updates[field] = data[field];
        }
    });

    if (updates.slug !== undefined) {
        updates.slug = normalizeSlug(updates.slug);
    }

    if (updates.domain !== undefined) {
        updates.domain = normalizeDomain(updates.domain);
    }

    if (Object.keys(updates).length === 0) return false;

    updates.updatedAt = serverTimestamp();

    await updateDoc(getOwnerRef(ownerUid), updates);

    return true;
};

export const getAllBusinessOwners = async () => {
    try {
        const ownersRef = collection(db, USERS_COLLECTION);
        const ownersQuery = query(
            ownersRef,
            where("role", "==", "business_owner")
        );
        const snapshot = await getDocs(ownersQuery);

        return snapshot.docs.map(normalizeBusinessOwner);
    } catch (error) {
        console.error("Error fetching business owners:", error);
        throw error;
    }
};

export const updateBusinessOwnerStatus = async (ownerUid, status) => {
    const allowedStatuses = ["pending", "active", "suspended", "blocked"];

    if (!ownerUid || !allowedStatuses.includes(status)) {
        throw new Error("معرّف صاحب النشاط أو الحالة غير صحيحة.");
    }

    await updateDoc(getOwnerRef(ownerUid), {
        status,
        updatedAt: serverTimestamp(),
    });

    return true;
};

export const getBusinessOwnerUsers = async (
    ownerUid,
    { role, status } = {}
) => {
    if (!ownerUid) return [];

    try {
        const snapshot = await getDocs(getOwnerUsersRef(ownerUid));

        return snapshot.docs
            .map((item) => ({
                ...item.data(),
                id: item.id,
                uid: item.id,
                ownerUid,
            }))
            .filter((item) => !role || item.role === role)
            .filter((item) => !status || item.status === status);
    } catch (error) {
        console.error("Error fetching business users:", error);
        throw error;
    }
};

export const getBusinessOwnerUser = async (ownerUid, userUid) => {
    if (!ownerUid || !userUid) return null;

    try {
        const userRef = doc(
            db,
            USERS_COLLECTION,
            ownerUid,
            "users",
            userUid
        );
        const snapshot = await getDoc(userRef);

        if (!snapshot.exists()) return null;

        return {
            ...snapshot.data(),
            id: snapshot.id,
            uid: snapshot.id,
            ownerUid,
        };
    } catch (error) {
        console.error("Error fetching business user:", error);
        throw error;
    }
};

export const addBusinessOwnerUser = async (ownerUid, userData) => {
    if (!ownerUid || !userData?.uid) {
        throw new Error("بيانات المستخدم غير مكتملة.");
    }

    if (!BUSINESS_USER_ROLES.includes(userData.role)) {
        throw new Error("نوع المستخدم غير مسموح به.");
    }

    const userRef = doc(
        db,
        USERS_COLLECTION,
        ownerUid,
        "users",
        userData.uid
    );

    const existing = await getDoc(userRef);

    if (existing.exists()) {
        throw new Error("هذا المستخدم مسجل بالفعل لدى هذا النشاط.");
    }

    await setDoc(userRef, {
        uid: userData.uid,
        name: userData.name || "",
        email: userData.email || "",
        phone: userData.phone || "",
        imageUrl: userData.imageUrl || "",
        role: userData.role,
        status: "active",
        permissions: userData.permissions || {},
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
    });

    return true;
};

export const updateBusinessOwnerUser = async (
    ownerUid,
    userUid,
    updates
) => {
    if (!ownerUid || !userUid || !updates) {
        throw new Error("بيانات التحديث غير مكتملة.");
    }

    const allowedFields = [
        "name",
        "phone",
        "email",
        "imageUrl",
        "role",
        "status",
        "permissions",
    ];

    const data = {};

    allowedFields.forEach((field) => {
        if (updates[field] !== undefined) {
            data[field] = updates[field];
        }
    });

    if (
        data.role !== undefined &&
        !BUSINESS_USER_ROLES.includes(data.role)
    ) {
        throw new Error("نوع المستخدم غير مسموح به.");
    }

    if (
        data.status !== undefined &&
        !["active", "blocked", "suspended"].includes(data.status)
    ) {
        throw new Error("حالة المستخدم غير صحيحة.");
    }

    if (Object.keys(data).length === 0) return false;

    data.updatedAt = serverTimestamp();

    const userRef = doc(
        db,
        USERS_COLLECTION,
        ownerUid,
        "users",
        userUid
    );

    await updateDoc(userRef, data);

    return true;
};

export const removeBusinessOwnerUser = async (ownerUid, userUid) => {
    if (!ownerUid || !userUid) return false;

    await deleteDoc(
        doc(db, USERS_COLLECTION, ownerUid, "users", userUid)
    );

    return true;
};

export const getBusinessOwnerModules = async (ownerUid) => {
    if (!ownerUid) return { ...DEFAULT_MODULES };

    try {
        const owner = await getBusinessOwner(ownerUid);

        if (!owner) return { ...DEFAULT_MODULES };

        const snapshot = await getDocs(getOwnerModulesRef(ownerUid));

        const modules = { ...DEFAULT_MODULES };

        snapshot.docs.forEach((item) => {
            if (Object.hasOwn(DEFAULT_MODULES, item.id)) {
                modules[item.id] = item.data().enabled === true;
            }
        });

        return modules;
    } catch (error) {
        console.error("Error fetching business modules:", error);
        throw error;
    }
};

export const updateBusinessOwnerModules = async (
    ownerUid,
    modules
) => {
    if (!ownerUid || !modules || typeof modules !== "object") {
        throw new Error("بيانات الموديولات غير صحيحة.");
    }

    const entries = Object.entries(modules);

    if (!entries.length) return true;

    for (const [moduleKey, enabled] of entries) {
        if (!Object.hasOwn(DEFAULT_MODULES, moduleKey)) {
            throw new Error(`الموديول ${moduleKey} غير معتمد.`);
        }

        if (typeof enabled !== "boolean") {
            throw new Error(`قيمة الموديول ${moduleKey} غير صحيحة.`);
        }
    }

    await Promise.all(
        entries.map(([moduleKey, enabled]) => {
            const moduleRef = doc(
                db,
                USERS_COLLECTION,
                ownerUid,
                "modules",
                moduleKey
            );

            return setDoc(
                moduleRef,
                {
                    enabled,
                    updatedAt: serverTimestamp(),
                },
                { merge: true }
            );
        })
    );

    return true;
};

export const getBusinessOwnerSubscription = async (ownerUid) => {
    const owner = await getBusinessOwner(ownerUid);
    return owner?.subscription || null;
};

export const updateBusinessOwnerSubscription = async (
    ownerUid,
    subscription
) => {
    if (!ownerUid || !subscription || typeof subscription !== "object") {
        throw new Error("بيانات الاشتراك غير صحيحة.");
    }

    await updateDoc(getOwnerRef(ownerUid), {
        subscription: {
            ...subscription,
            updatedAt: serverTimestamp(),
        },
        updatedAt: serverTimestamp(),
    });

    return true;
};

export const calculateDaysRemaining = (endDate) => {
    const end = getDateValue(endDate);

    if (!end) return null;

    const diffTime = end.getTime() - Date.now();

    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
};

export const checkExpiringSubscriptions = (owners = []) =>
    owners.filter((owner) => {
        const days = calculateDaysRemaining(
            owner.subscription?.endDate
        );

        return (
            owner.status === "active" &&
            owner.subscription?.status === "active" &&
            days !== null &&
            days >= 0 &&
            days <= 3
        );
    });

export const recordPaymentReminderSent = async (ownerUid) => {
    if (!ownerUid) return false;

    await updateDoc(getOwnerRef(ownerUid), {
        "subscription.lastReminderSentAt": serverTimestamp(),
        updatedAt: serverTimestamp(),
    });

    return true;
};

export const getBusinessOwnerLanding = async (ownerUid) => {
    if (!ownerUid) return null;

    const landingRef = doc(
        db,
        USERS_COLLECTION,
        ownerUid,
        "settings",
        "landingPage"
    );

    const snapshot = await getDoc(landingRef);

    return snapshot.exists() ? snapshot.data() : null;
};

export const saveBusinessOwnerLanding = async (
    ownerUid,
    landingData
) => {
    if (!ownerUid || !landingData || typeof landingData !== "object") {
        throw new Error("بيانات صفحة الموقع غير صحيحة.");
    }

    const landingRef = doc(
        db,
        USERS_COLLECTION,
        ownerUid,
        "settings",
        "landingPage"
    );

    await setDoc(
        landingRef,
        {
            ...landingData,
            updatedAt: serverTimestamp(),
        },
        { merge: true }
    );

    return true;
};

export const initializeBusinessOwnerLanding = async (
    ownerUid,
    ownerName = ""
) => {
    if (!ownerUid) return false;

    try {
        const landingRef = doc(
            db,
            USERS_COLLECTION,
            ownerUid,
            "settings",
            "landingPage"
        );

        const existing = await getDoc(landingRef);

        if (existing.exists()) return true;

        const displayName = ownerName || "متجر سِكّة لتأجير السيارات";

        await setDoc(landingRef, {
            hero: {
                ar: {
                    title: `أهلاً بكم في ${displayName}`,
                    subtitle: "خدمات ليموزين وتأجير سيارات فاخرة على مدار الساعة.",
                    description: "نقدم لكم تجربة نقل مميزة تجمع بين الراحة والرفاهية والأمان.",
                    buttonText: "احجز رحلتك الآن",
                    buttonLink: "#booking",
                },
                en: {
                    title: `Welcome to ${displayName}`,
                    subtitle: "Premium limousine and car rental services.",
                    description: "Experience comfort, luxury and safety.",
                    buttonText: "Book Your Ride",
                    buttonLink: "#booking",
                },
                image: {
                    imageUrl: "https://images.unsplash.com/photo-1618843479313-40f8afb4b4d8?auto=format&fit=crop&w=1400&q=90",
                    publicId: "",
                    alt: displayName,
                },
            },
            services: {
                ar: {
                    eyebrow: "خدماتنا المميزة",
                    title: "خيارات تنقل مصممة لأجلك",
                    description: "مجموعة متكاملة من الخدمات لتلبية احتياجاتك.",
                },
                en: {
                    eyebrow: "Our Services",
                    title: "Transportation tailored for you",
                    description: "A range of services designed around your needs.",
                },
                cards: {
                    "service-1": {
                        id: "service-1",
                        icon: "car",
                        ar: {
                            title: "تأجير سيارات فاخرة",
                            description: "أحدث طرازات السيارات للمناسبات ورجال الأعمال.",
                        },
                        en: {
                            title: "Luxury Car Rental",
                            description: "Modern luxury cars for business and events.",
                        },
                    },
                    "service-2": {
                        id: "service-2",
                        icon: "driver",
                        ar: {
                            title: "توصيل مطارات وسياحة",
                            description: "خدمات استقبال وتوصيل باحترافية.",
                        },
                        en: {
                            title: "Airport Transfers",
                            description: "Professional airport pickup and transfers.",
                        },
                    },
                },
            },
            featuredCars: [],
            gallery: [],
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
        });

        return true;
    } catch (error) {
        console.error("Error initializing business landing:", error);
        return false;
    }
};


export const diagnoseBusinessOwner = async (ownerUid) => {
    const report = {
        ownerUid,
        exists: false,
        landingConfigured: false,
        modulesConfigured: false,
        enabledModules: [],
        disabledModules: [],
        subscriptionStatus: "unknown",
        daysRemaining: null,
        issues: [],
    };

    if (!ownerUid) {
        report.issues.push("لم يتم تحديد صاحب النشاط.");
        return report;
    }

    try {
        const owner = await getBusinessOwner(ownerUid);

        if (!owner) {
            report.issues.push("حساب صاحب النشاط غير موجود.");
            return report;
        }

        report.exists = true;

        const modulesSnapshot = await getDocs(
            getOwnerModulesRef(ownerUid)
        );

        const configuredModules = new Set(
            modulesSnapshot.docs
                .map((item) => item.id)
                .filter((moduleKey) =>
                    Object.hasOwn(DEFAULT_MODULES, moduleKey)
                )
        );

        report.modulesConfigured =
            configuredModules.size === Object.keys(DEFAULT_MODULES).length;

        report.enabledModules = modulesSnapshot.docs
            .filter(
                (item) =>
                    Object.hasOwn(DEFAULT_MODULES, item.id) &&
                    item.data().enabled === true
            )
            .map((item) => item.id);

        report.disabledModules = Object.keys(DEFAULT_MODULES).filter(
            (moduleKey) => !report.enabledModules.includes(moduleKey)
        );

        if (!report.modulesConfigured) {
            report.issues.push(
                "لم يتم إعداد جميع موديولات النشاط."
            );
        }

        const subscription = owner.subscription || null;

        if (!subscription) {
            report.issues.push("بيانات الاشتراك غير موجودة.");
        } else {
            report.subscriptionStatus = subscription.status || "unknown";

            const daysRemaining = calculateDaysRemaining(
                subscription.endDate
            );

            report.daysRemaining = daysRemaining;

            if (subscription.status !== "active") {
                report.issues.push("الاشتراك غير نشط.");
            }

            if (daysRemaining === null) {
                report.issues.push(
                    "تاريخ انتهاء الاشتراك غير محدد أو غير صالح."
                );
            } else if (daysRemaining <= 0) {
                report.issues.push("انتهى الاشتراك.");
            } else if (daysRemaining <= 3) {
                report.issues.push(
                    "الاشتراك ينتهي خلال 3 أيام أو أقل."
                );
            }
        }

        if (owner.status !== "active") {
            report.issues.push(
                `حالة النشاط الحالية: ${owner.status || "غير محددة"}.`
            );
        }

        const landing = await getBusinessOwnerLanding(ownerUid);

        report.landingConfigured = Boolean(landing);

        if (!report.landingConfigured) {
            report.issues.push("لم يتم إعداد صفحة الموقع.");
        }

    } catch (error) {
        console.error("Error diagnosing business owner:", error);
        report.issues.push(`خطأ أثناء الفحص: ${error.message}`);
    }

    return report;
};

export const autoRepairBusinessOwner = async (ownerUid) => {
    const repairs = [];

    if (!ownerUid) {
        return {
            success: false,
            error: "لم يتم تحديد صاحب النشاط.",
            repairs,
        };
    }

    try {
        const owner = await getBusinessOwner(ownerUid);

        if (!owner) {
            return {
                success: false,
                error: "صاحب النشاط غير موجود.",
                repairs,
            };
        }

        const landing = await getBusinessOwnerLanding(ownerUid);

        if (!landing) {
            const initialized = await initializeBusinessOwnerLanding(
                ownerUid,
                owner.name || ""
            );

            if (!initialized) {
                return {
                    success: false,
                    error: "تعذر إنشاء صفحة الموقع.",
                    repairs,
                };
            }

            repairs.push("تم إنشاء صفحة الموقع الافتراضية.");
        }

        return {
            success: true,
            repairs: repairs.length
                ? repairs
                : ["بيانات النشاط سليمة ولا تحتاج إلى إصلاح."],
        };
    } catch (error) {
        return {
            success: false,
            error: error.message,
            repairs,
        };
    }
};

export const generateWhatsAppReminderUrl = (owner) => {
    const rawPhone = owner?.phone || "";
    let cleanPhone = rawPhone.replace(/[^0-9]/g, "");

    if (cleanPhone.startsWith("01")) {
        cleanPhone = `2${cleanPhone}`;
    }

    if (!cleanPhone) return "";

    const subscription = owner?.subscription || {};
    const days = calculateDaysRemaining(subscription.endDate);
    const endDate = getDateValue(subscription.endDate);
    const endDateStr = endDate
        ? endDate.toLocaleDateString("ar-EG")
        : "غير محدد";

    let daysText;

    if (days === null) {
        daysText = "تاريخ انتهاء الاشتراك غير محدد";
    } else if (days < 0) {
        daysText = "تجاوز تاريخ انتهاء الاشتراك";
    } else if (days === 0) {
        daysText = "ينتهي اليوم";
    } else {
        daysText = `سينتهي خلال ${days} أيام (بتاريخ ${endDateStr})`;
    }

    const message = `مرحباً بك ${owner?.name || "عزيزنا الشريك"}،
حالة اشتراككم في منصة SEKKA - سِكّة (باقة: ${subscription.plan || "غير محددة"}) هي: ${daysText}.
يرجى التواصل معنا لمراجعة بيانات الاشتراك وتجديده عند الحاجة.
شكراً لاختياركم منصة سِكّة!`;

    return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;
};

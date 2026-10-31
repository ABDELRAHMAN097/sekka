
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

export const TENANTS_COLLECTION = "tenants";
export const DEFAULT_TENANT_ID = import.meta.env.VITE_TENANT_ID || "";

export const DEFAULT_MODULES = {
    editLanding: true,
    fleet: true,
    wallet: true,
    reports: true,
    users: true,
    customDomain: false,
};

export const createDefaultTenantData = (id, name, slug) => {
    const now = new Date();
    const expiry = new Date();
    expiry.setMonth(expiry.getMonth() + 1);

    return {
        id: id || slug,
        slug: slug || id,
        name: name || "متجر جديد",
        role: "tenant_owner",
        status: "active",
        domain: "",
        ownerEmail: "",
        ownerPhone: "",
        subscription: {
            plan: "pro",
            billingCycle: "monthly",
            startDate: now.toISOString(),
            endDate: expiry.toISOString(),
            price: 2500,
            currency: "EGP",
            autoRenew: true,
            lastReminderSentAt: null,
            status: "active",
        },
        modules: { ...DEFAULT_MODULES },
        cloudinary: {
            cloudName: import.meta.env.VITE_CLOUDINARY_CLOUD_NAME || "",
            uploadPreset: import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET || "",
        },
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
    };
};

const normalizeTenant = (tenantDoc) => {
    const data = tenantDoc.data();

    return {
        ...data,
        id: tenantDoc.id,
        modules: { ...(data.modules || {}) },
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

export const getTenant = async (tenantId) => {
    if (!tenantId) return null;

    try {
        const tenantRef = doc(db, TENANTS_COLLECTION, tenantId);
        const snap = await getDoc(tenantRef);

        if (!snap.exists()) return null;

        return normalizeTenant(snap);
    } catch (error) {
        console.error(`Error fetching tenant [${tenantId}]:`, error);
        throw error;
    }
};

/**
 * Resolves a tenant by either document ID, slug, or custom domain.
 */
export const resolveTenant = async (identifier) => {
    if (!identifier || typeof identifier !== "string") return null;

    const trimmed = identifier.trim();
    if (!trimmed) return null;

    try {
        // 1. Direct document ID lookup
        const docRef = doc(db, TENANTS_COLLECTION, trimmed);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
            return normalizeTenant(docSnap);
        }

        // 2. Query by slug
        const tenantsRef = collection(db, TENANTS_COLLECTION);
        const slugQuery = query(tenantsRef, where("slug", "==", trimmed.toLowerCase()));
        const slugSnap = await getDocs(slugQuery);
        if (!slugSnap.empty) {
            return normalizeTenant(slugSnap.docs[0]);
        }

        // 3. Query by domain
        const domainQuery = query(tenantsRef, where("domain", "==", trimmed.toLowerCase()));
        const domainSnap = await getDocs(domainQuery);
        if (!domainSnap.empty) {
            return normalizeTenant(domainSnap.docs[0]);
        }

        return null;
    } catch (error) {
        console.error(`Error resolving tenant [${identifier}]:`, error);
        return null;
    }
};

export const getTenantBySlug = async (slug) => {
    if (!slug) return null;
    return resolveTenant(slug);
};

export const getTenantByDomain = async (domain) => {
    if (!domain) return null;
    return resolveTenant(domain);
};

/**
 * Subcollection: /tenants/{tenantId}/customers
 */
export const getTenantCustomers = async (tenantId) => {
    if (!tenantId) return [];
    try {
        const customersRef = collection(db, TENANTS_COLLECTION, tenantId, "customers");
        const snap = await getDocs(customersRef);
        return snap.docs.map((d) => ({ id: d.id, uid: d.id, ...d.data() }));
    } catch (error) {
        console.error(`Error fetching customers for tenant [${tenantId}]:`, error);
        return [];
    }
};

/**
 * Subcollection: /tenants/{tenantId}/members
 */
export const getTenantMembers = async (tenantId) => {
    if (!tenantId) return [];
    try {
        const membersRef = collection(db, TENANTS_COLLECTION, tenantId, "members");
        const snap = await getDocs(membersRef);
        return snap.docs.map((d) => ({ id: d.id, uid: d.id, ...d.data() }));
    } catch (error) {
        console.error(`Error fetching members for tenant [${tenantId}]:`, error);
        return [];
    }
};

export const addTenantCustomer = async (tenantId, customerData) => {
    if (!tenantId || !customerData?.uid) return false;
    try {
        const customerRef = doc(db, TENANTS_COLLECTION, tenantId, "customers", customerData.uid);
        await setDoc(customerRef, {
            ...customerData,
            role: customerData.role !== undefined ? customerData.role : "",
            status: customerData.status || "active",
            createdAt: customerData.createdAt || serverTimestamp(),
            updatedAt: serverTimestamp(),
        }, { merge: true });
        return true;
    } catch (error) {
        console.error(`Error adding customer to tenant [${tenantId}]:`, error);
        return false;
    }
};

export const addTenantMember = async (tenantId, memberData) => {
    if (!tenantId || !memberData?.uid) return false;
    try {
        const memberRef = doc(db, TENANTS_COLLECTION, tenantId, "members", memberData.uid);
        await setDoc(memberRef, {
            ...memberData,
            role: memberData.role || "tenant_staf",
            status: memberData.status || "active",
            createdAt: memberData.createdAt || serverTimestamp(),
            updatedAt: serverTimestamp(),
        }, { merge: true });
        return true;
    } catch (error) {
        console.error(`Error adding member to tenant [${tenantId}]:`, error);
        return false;
    }
};

export const removeTenantCustomer = async (tenantId, customerId) => {
    if (!tenantId || !customerId) return false;
    try {
        await deleteDoc(doc(db, TENANTS_COLLECTION, tenantId, "customers", customerId));
        return true;
    } catch (error) {
        console.error(`Error removing customer [${customerId}] from tenant [${tenantId}]:`, error);
        return false;
    }
};

export const removeTenantMember = async (tenantId, memberId) => {
    if (!tenantId || !memberId) return false;
    try {
        await deleteDoc(doc(db, TENANTS_COLLECTION, tenantId, "members", memberId));
        return true;
    } catch (error) {
        console.error(`Error removing member [${memberId}] from tenant [${tenantId}]:`, error);
        return false;
    }
};

export const getAllTenants = async () => {
    try {
        const tenantsRef = collection(db, TENANTS_COLLECTION);
        const snap = await getDocs(tenantsRef);

        return snap.docs.map(normalizeTenant);
    } catch (error) {
        console.error("Error fetching all tenants:", error);
        throw error;
    }
};

export const createTenant = async (tenantId, tenantData) => {
    const id = tenantId || tenantData?.slug || tenantData?.id;

    if (!id || !tenantData || typeof tenantData !== "object") {
        throw new Error("بيانات التاجر غير مكتملة.");
    }

    try {
        const tenantRef = doc(db, TENANTS_COLLECTION, id);
        const existingTenant = await getDoc(tenantRef);

        if (existingTenant.exists()) {
            throw new Error("يوجد تاجر بهذا المعرّف بالفعل.");
        }

        await setDoc(tenantRef, {
            ...tenantData,
            id,
            updatedAt: serverTimestamp(),
        });

        return true;
    } catch (error) {
        console.error(`Error creating tenant [${id}]:`, error);
        throw error;
    }
};

export const saveTenant = async (tenantId, tenantData) => {
    return createTenant(tenantId, tenantData);
};

export const updateTenantModules = async (tenantId, modules) => {
    if (!tenantId || !modules || typeof modules !== "object") {
        throw new Error("معرّف التاجر أو بيانات الموديولات غير صحيحة.");
    }

    try {
        const tenantRef = doc(db, TENANTS_COLLECTION, tenantId);
        const tenantSnap = await getDoc(tenantRef);

        if (!tenantSnap.exists()) {
            throw new Error("التاجر غير موجود.");
        }

        await updateDoc(tenantRef, {
            modules: { ...modules },
            updatedAt: serverTimestamp(),
        });

        return true;
    } catch (error) {
        console.error(`Error updating tenant modules [${tenantId}]:`, error);
        throw error;
    }
};

export const updateTenantSubscription = async (tenantId, subscription) => {
    if (!tenantId || !subscription || typeof subscription !== "object") {
        throw new Error("معرّف التاجر أو بيانات الاشتراك غير صحيحة.");
    }

    try {
        const tenantRef = doc(db, TENANTS_COLLECTION, tenantId);
        const tenantSnap = await getDoc(tenantRef);

        if (!tenantSnap.exists()) {
            throw new Error("التاجر غير موجود.");
        }

        await updateDoc(tenantRef, {
            subscription: { ...subscription },
            updatedAt: serverTimestamp(),
        });

        return true;
    } catch (error) {
        console.error(`Error updating tenant subscription [${tenantId}]:`, error);
        throw error;
    }
};

export const updateTenantStatus = async (tenantId, status) => {
    if (!tenantId || !status) {
        throw new Error("معرّف التاجر أو الحالة غير صحيحة.");
    }

    try {
        const tenantRef = doc(db, TENANTS_COLLECTION, tenantId);
        const tenantSnap = await getDoc(tenantRef);

        if (!tenantSnap.exists()) {
            throw new Error("التاجر غير موجود.");
        }

        await updateDoc(tenantRef, {
            status,
            updatedAt: serverTimestamp(),
        });

        return true;
    } catch (error) {
        console.error(`Error updating tenant status [${tenantId}]:`, error);
        throw error;
    }
};

export const calculateDaysRemaining = (endDate) => {
    const end = getDateValue(endDate);

    if (!end) return null;

    const now = new Date();
    const diffTime = end.getTime() - now.getTime();

    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
};

export const checkExpiringSubscriptions = (tenants = []) => {
    return tenants.filter((tenant) => {
        const days = calculateDaysRemaining(tenant.subscription?.endDate);

        return (
            tenant.status === "active" &&
            tenant.subscription?.status === "active" &&
            days !== null &&
            days >= 0 &&
            days <= 3
        );
    });
};

export const recordPaymentReminderSent = async (tenantId) => {
    if (!tenantId) return false;

    try {
        const tenantRef = doc(db, TENANTS_COLLECTION, tenantId);
        const tenantSnap = await getDoc(tenantRef);

        if (!tenantSnap.exists()) {
            throw new Error("التاجر غير موجود.");
        }

        await updateDoc(tenantRef, {
            "subscription.lastReminderSentAt": new Date().toISOString(),
            updatedAt: serverTimestamp(),
        });

        return true;
    } catch (error) {
        console.error(`Error recording payment reminder [${tenantId}]:`, error);
        return false;
    }
};

export const diagnoseTenant = async (tenantId) => {
    const report = {
        tenantId,
        existsInFirestore: false,
        landingConfigured: false,
        modulesConfigured: false,
        subscriptionStatus: "unknown",
        daysRemaining: null,
        issues: [],
    };

    if (!tenantId) {
        report.issues.push("لم يتم تحديد معرّف التاجر.");
        return report;
    }

    try {
        const tenantRef = doc(db, TENANTS_COLLECTION, tenantId);
        const tenantSnap = await getDoc(tenantRef);

        if (!tenantSnap.exists()) {
            report.issues.push(
                "مستند التاجر غير موجود في Firestore. لم يتم إنشاء بيانات تلقائية."
            );
            return report;
        }

        const data = tenantSnap.data();
        const subscription = data.subscription || null;
        const daysRemaining = calculateDaysRemaining(subscription?.endDate);

        report.existsInFirestore = true;
        report.modulesConfigured =
            !!data.modules &&
            typeof data.modules === "object" &&
            Object.keys(data.modules).length > 0;
        report.daysRemaining = daysRemaining;

        if (!subscription) {
            report.subscriptionStatus = "unknown";
            report.issues.push("بيانات الاشتراك غير موجودة.");
        } else if (subscription.status) {
            report.subscriptionStatus = subscription.status;
        } else if (daysRemaining === null) {
            report.subscriptionStatus = "unknown";
            report.issues.push("تاريخ انتهاء الاشتراك غير موجود أو غير صالح.");
        } else {
            report.subscriptionStatus =
                daysRemaining > 0 ? "active" : "expired";
        }

        if (daysRemaining !== null) {
            if (daysRemaining >= 0 && daysRemaining <= 3) {
                report.issues.push("الاشتراك ينتهي خلال 3 أيام أو أقل.");
            } else if (daysRemaining < 0) {
                report.issues.push("تاريخ انتهاء الاشتراك قد مضى.");
            }
        }

        if (!report.modulesConfigured) {
            report.issues.push("بيانات الموديولات غير موجودة أو غير مكتملة.");
        }

        const landingRef = doc(
            db,
            TENANTS_COLLECTION,
            tenantId,
            "config",
            "landing"
        );
        const landingSnap = await getDoc(landingRef);

        report.landingConfigured = landingSnap.exists();

        if (!report.landingConfigured) {
            report.issues.push(
                "لم يتم ضبط صفحة لاندينج مخصصة لهذا التاجر بعد."
            );
        }
    } catch (error) {
        console.error(`Error diagnosing tenant [${tenantId}]:`, error);
        report.issues.push(`خطأ أثناء الفحص: ${error.message}`);
    }

    return report;
};

export const initializeTenantLanding = async (
    tenantId,
    tenantName = ""
) => {
    if (!tenantId) return false;

    try {
        const tenantRef = doc(db, TENANTS_COLLECTION, tenantId);
        const tenantSnap = await getDoc(tenantRef);

        if (!tenantSnap.exists()) {
            console.error(
                `Cannot initialize landing: tenant [${tenantId}] does not exist.`
            );
            return false;
        }

        const landingDocRef = doc(
            db,
            TENANTS_COLLECTION,
            tenantId,
            "config",
            "landing"
        );
        const existingSnap = await getDoc(landingDocRef);

        if (existingSnap.exists()) return true;

        const displayName =
            tenantName ||
            tenantSnap.data()?.name ||
            "متجر سِكّة لتأجير السيارات";

        await setDoc(landingDocRef, {
            hero: {
                ar: {
                    title: `أهلاً بكم في ${displayName}`,
                    subtitle:
                        "خدمات ليموزين وتأجير سيارات فاخرة على مدار الساعة.",
                    description:
                        "نقدم لكم تجربة نقل مميزة تجمع بين الراحة، الرفاهية والأمان مع سائقين محترفين وأحدث أسطول سيارات.",
                    buttonText: "احجز رحلتك الآن",
                    buttonLink: "#booking",
                },
                en: {
                    title: `Welcome to ${displayName}`,
                    subtitle:
                        "Premium limousine and car rental services around the clock.",
                    description:
                        "Experience ultimate luxury, safety and comfort with professional drivers and high-end fleet.",
                    buttonText: "Book Your Ride",
                    buttonLink: "#booking",
                },
                image: {
                    imageUrl:
                        "https://images.unsplash.com/photo-1618843479313-40f8afb4b4d8?auto=format&fit=crop&w=1400&q=90",
                    publicId: "",
                    alt: displayName,
                },
            },
            services: {
                ar: {
                    eyebrow: "خدماتنا المميزة",
                    title: "خيارات تنقل مصممة لأجلك",
                    description:
                        "مجموعة متكاملة من الخدمات الفاخرة لتلبية كافة احتياجاتك اليومية والخاصة.",
                },
                en: {
                    eyebrow: "Our Services",
                    title: "Transportation tailored for you",
                    description:
                        "A comprehensive range of luxury services to satisfy all your travel needs.",
                },
                cards: {
                    "service-1": {
                        id: "service-1",
                        icon: "car",
                        ar: {
                            title: "تأجير سيارات فاخرة",
                            description:
                                "أحدث طرازات السيارات الفاخرة للمناسبات ورجال الأعمال.",
                        },
                        en: {
                            title: "Luxury Car Rental",
                            description:
                                "The newest luxury car models for business and events.",
                        },
                    },
                    "service-2": {
                        id: "service-2",
                        icon: "driver",
                        ar: {
                            title: "توصيل مطارات وسياحة",
                            description:
                                "خدمة استقبال وتوصيل من وإلى جميع المطارات بأعلى مستوى.",
                        },
                        en: {
                            title: "Airport Transfers",
                            description:
                                "Meet and greet airport transfers with utmost punctuality.",
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
        console.error(
            `Error initializing landing for tenant [${tenantId}]:`,
            error
        );
        return false;
    }
};

export const autoRepairTenant = async (tenantId) => {
    const repairs = [];

    if (!tenantId) {
        return {
            success: false,
            error: "لم يتم تحديد معرّف التاجر.",
            repairs,
        };
    }

    try {
        const tenantRef = doc(db, TENANTS_COLLECTION, tenantId);
        const tenantSnap = await getDoc(tenantRef);

        if (!tenantSnap.exists()) {
            return {
                success: false,
                error: "التاجر غير موجود. أنشئ التاجر أولاً من لوحة المنصة.",
                repairs,
            };
        }

        const tenantData = tenantSnap.data();

        const landingRef = doc(
            db,
            TENANTS_COLLECTION,
            tenantId,
            "config",
            "landing"
        );
        const landingSnap = await getDoc(landingRef);

        if (!landingSnap.exists()) {
            const initialized = await initializeTenantLanding(
                tenantId,
                tenantData.name || ""
            );

            if (!initialized) {
                return {
                    success: false,
                    error: "تعذر إنشاء صفحة الهبوط الافتراضية.",
                    repairs,
                };
            }

            repairs.push("تم إنشاء صفحة هبوط افتراضية لمسار التاجر.");
        }

        return {
            success: true,
            repairs:
                repairs.length > 0
                    ? repairs
                    : ["سجلات التاجر الحالية سليمة ولا تتطلب إصلاحاً."],
        };
    } catch (error) {
        console.error(`Error auto-repairing tenant [${tenantId}]:`, error);

        return {
            success: false,
            error: error.message,
            repairs,
        };
    }
};

export const generateWhatsAppReminderUrl = (tenant) => {
    const rawPhone = tenant?.ownerPhone || "";
    let cleanPhone = rawPhone.replace(/[^0-9]/g, "");

    if (cleanPhone.startsWith("01")) {
        cleanPhone = `2${cleanPhone}`;
    }

    if (!cleanPhone) return "";

    const subscription = tenant?.subscription || {};
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
        daysText = `سينتهي خلال ${days} ${
            days === 1 ? "يوم" : "أيام"
        } (بتاريخ ${endDateStr})`;
    }

    const msg = `مرحباً بك ${tenant?.name || "عزيزنا الشريك"}،
نحيطكم علماً بأن حالة اشتراككم في منصة SEKKA - سِكّة (باقة: ${
        subscription.plan || "غير محددة"
    }) هي: ${daysText}.
يرجى التواصل معنا لمراجعة بيانات الاشتراك وتجديده عند الحاجة.
شكراً لاختياركم منصة سِكّة!`;

    return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(msg)}`;
};

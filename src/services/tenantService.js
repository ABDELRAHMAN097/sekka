import {
    collection,
    doc,
    getDoc,
    getDocs,
    setDoc,
    updateDoc,
    serverTimestamp,
    query,
    where,
    orderBy,
} from "firebase/firestore";
import { db } from "../config/firebase";

export const TENANTS_COLLECTION = "tenants";
export const DEFAULT_TENANT_ID = import.meta.env.VITE_TENANT_ID || "abu-hady";

/**
 * Default modules configuration for any new or existing tenant
 */
export const DEFAULT_MODULES = {
    editLanding: true,  // تعديل اللاندينج باج
    fleet: true,        // أسطول السيارات
    wallet: true,       // المحفظة والمدفوعات
    reports: true,      // التقارير المتقدمة
    users: true,        // إدارة الموظفين والسائقين
    customDomain: false // ربط دومين مخصص
};

/**
 * Standard Tenant template structure
 */
export const createDefaultTenantData = (id, name, slug) => {
    const now = new Date();
    const expiry = new Date();
    expiry.setMonth(expiry.getMonth() + 1); // 1 month by default

    return {
        id: id || slug,
        slug: slug || id,
        name: name || "متجر جديد",
        status: "active", // active | suspended | expired | trial
        domain: "",
        ownerEmail: "",
        ownerPhone: "",
        subscription: {
            plan: "pro", // starter | pro | enterprise
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

/**
 * Fetches tenant data by tenantId (slug or id)
 */
export const getTenant = async (tenantId) => {
    if (!tenantId) return null;
    try {
        const tenantRef = doc(db, TENANTS_COLLECTION, tenantId);
        const snap = await getDoc(tenantRef);

        if (snap.exists()) {
            const data = snap.data();
            return {
                id: snap.id,
                ...data,
                modules: { ...DEFAULT_MODULES, ...(data.modules || {}) },
                subscription: {
                    plan: "pro",
                    currency: "EGP",
                    price: 2500,
                    status: "active",
                    ...(data.subscription || {}),
                },
            };
        }

        // If it's the primary default tenant (abu-hady) and needs initialization
        if (tenantId === "abu-hady") {
            const defaultAbuHady = {
                id: "abu-hady",
                slug: "abu-hady",
                name: "أبو هادي لخدمات الليموزين وتأجير السيارات",
                status: "active",
                domain: "",
                subscription: {
                    plan: "pro",
                    billingCycle: "monthly",
                    startDate: new Date("2026-10-01").toISOString(),
                    endDate: new Date("2026-11-01").toISOString(),
                    price: 2500,
                    currency: "EGP",
                    autoRenew: true,
                    lastReminderSentAt: null,
                    status: "active",
                },
                modules: { ...DEFAULT_MODULES },
            };
            return defaultAbuHady;
        }

        return null;
    } catch (error) {
        console.error(`Error fetching tenant [${tenantId}]:`, error);
        return null;
    }
};

/**
 * Fetches all tenants for SEKKA Master Admin Dashboard
 */
export const getAllTenants = async () => {
    try {
        const tenantsRef = collection(db, TENANTS_COLLECTION);
        const snap = await getDocs(tenantsRef);

        const tenants = [];
        snap.forEach((docItem) => {
            const data = docItem.data();
            tenants.push({
                id: docItem.id,
                ...data,
                modules: { ...DEFAULT_MODULES, ...(data.modules || {}) },
                subscription: {
                    plan: "pro",
                    currency: "EGP",
                    price: 2500,
                    status: "active",
                    ...(data.subscription || {}),
                },
            });
        });

        // Ensure abu-hady is in the list if not yet written
        if (!tenants.some((t) => t.id === "abu-hady" || t.slug === "abu-hady")) {
            tenants.unshift({
                id: "abu-hady",
                slug: "abu-hady",
                name: "أبو هادي لخدمات الليموزين وتأجير السيارات",
                status: "active",
                domain: "",
                subscription: {
                    plan: "pro",
                    billingCycle: "monthly",
                    startDate: new Date("2026-10-01").toISOString(),
                    endDate: new Date("2026-11-01").toISOString(),
                    price: 2500,
                    currency: "EGP",
                    autoRenew: true,
                    lastReminderSentAt: null,
                    status: "active",
                },
                modules: { ...DEFAULT_MODULES },
            });
        }

        return tenants;
    } catch (error) {
        console.error("Error fetching all tenants:", error);
        return [];
    }
};

/**
 * Creates or overwrites a tenant
 */
export const saveTenant = async (tenantId, tenantData) => {
    try {
        const id = tenantId || tenantData.slug || tenantData.id;
        const tenantRef = doc(db, TENANTS_COLLECTION, id);
        await setDoc(
            tenantRef,
            {
                ...tenantData,
                id,
                updatedAt: serverTimestamp(),
            },
            { merge: true }
        );
        return true;
    } catch (error) {
        console.error("Error saving tenant:", error);
        throw error;
    }
};

/**
 * Toggles or updates specific modules for a tenant
 */
export const updateTenantModules = async (tenantId, modules) => {
    try {
        const tenantRef = doc(db, TENANTS_COLLECTION, tenantId);
        await setDoc(
            tenantRef,
            {
                modules,
                updatedAt: serverTimestamp(),
            },
            { merge: true }
        );
        return true;
    } catch (error) {
        console.error("Error updating tenant modules:", error);
        throw error;
    }
};

/**
 * Updates subscription details for a tenant
 */
export const updateTenantSubscription = async (tenantId, subscription) => {
    try {
        const tenantRef = doc(db, TENANTS_COLLECTION, tenantId);
        await setDoc(
            tenantRef,
            {
                subscription,
                updatedAt: serverTimestamp(),
            },
            { merge: true }
        );
        return true;
    } catch (error) {
        console.error("Error updating tenant subscription:", error);
        throw error;
    }
};

/**
 * Updates status of a tenant (active, suspended, expired)
 */
export const updateTenantStatus = async (tenantId, status) => {
    try {
        const tenantRef = doc(db, TENANTS_COLLECTION, tenantId);
        await updateDoc(tenantRef, {
            status,
            updatedAt: serverTimestamp(),
        });
        return true;
    } catch (error) {
        console.error("Error updating tenant status:", error);
        throw error;
    }
};

/**
 * Calculates remaining days in subscription
 */
export const calculateDaysRemaining = (endDate) => {
    if (!endDate) return 0;
    const end = new Date(endDate);
    const now = new Date();
    const diffTime = end.getTime() - now.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
};

/**
 * Identifies tenants with subscription expiring in <= 3 days
 */
export const checkExpiringSubscriptions = (tenants = []) => {
    return tenants.filter((tenant) => {
        const days = calculateDaysRemaining(tenant.subscription?.endDate);
        return days <= 3;
    });
};

/**
 * Records that a payment reminder alert was sent to the tenant
 */
export const recordPaymentReminderSent = async (tenantId) => {
    try {
        const tenantRef = doc(db, TENANTS_COLLECTION, tenantId);
        await setDoc(
            tenantRef,
            {
                subscription: {
                    lastReminderSentAt: new Date().toISOString(),
                },
                updatedAt: serverTimestamp(),
            },
            { merge: true }
        );
        return true;
    } catch (error) {
        console.error("Error recording payment reminder:", error);
        return false;
    }
};

/**
 * Diagnostics & health check for a tenant's database records
 */
export const diagnoseTenant = async (tenantId) => {
    const report = {
        tenantId,
        existsInFirestore: false,
        landingConfigured: false,
        modulesConfigured: false,
        subscriptionStatus: "unknown",
        daysRemaining: 0,
        issues: [],
    };

    try {
        const tenantDoc = await getDoc(doc(db, TENANTS_COLLECTION, tenantId));
        if (tenantDoc.exists()) {
            report.existsInFirestore = true;
            const data = tenantDoc.data();
            report.modulesConfigured = !!data.modules;
            report.daysRemaining = calculateDaysRemaining(data.subscription?.endDate);
            report.subscriptionStatus = report.daysRemaining <= 0 ? "expired" : "active";

            if (report.daysRemaining <= 3 && report.daysRemaining > 0) {
                report.issues.push("الاشتراك ينتهي خلال أقل من 3 أيام.");
            } else if (report.daysRemaining <= 0) {
                report.issues.push("الاشتراك منتهي الصلاحية.");
            }
        } else {
            report.issues.push("المستند غير موجود في Firestore، جاري استخدام القيم الافتراضية.");
        }

        // Check landing config
        const landingDoc = await getDoc(doc(db, TENANTS_COLLECTION, tenantId, "config", "landing"));
        if (landingDoc.exists()) {
            report.landingConfigured = true;
        } else {
            // Check fallback landingPage/settings
            const rootLanding = await getDoc(doc(db, "landingPage", "settings"));
            if (rootLanding.exists() && tenantId === "abu-hady") {
                report.landingConfigured = true;
                report.issues.push("اللاندينج تعمل عبر المسار القديم landingPage/settings، يوصى بالترحيل لمسار التاجر.");
            } else {
                report.issues.push("لم يتم ضبط صفحة لاندينج باج مخصصة لهذا التاجر بعد.");
            }
        }
    } catch (err) {
        report.issues.push(`خطأ أثناء الفحص: ${err.message}`);
    }

    return report;
};

/**
 * Initializes default landing page for a new tenant
 */
export const initializeTenantLanding = async (tenantId, tenantName = "") => {
    try {
        const landingDocRef = doc(db, TENANTS_COLLECTION, tenantId, "config", "landing");
        const existingSnap = await getDoc(landingDocRef);
        if (existingSnap.exists()) return true;

        const displayName = tenantName || (tenantId === "abu-hady" ? "أبو هادي لخدمات الليموزين" : tenantId);

        await setDoc(landingDocRef, {
            hero: {
                ar: {
                    title: `أهلاً بكم في ${displayName}`,
                    subtitle: "خدمات ليموزين وتأجير سيارات فاخرة على مدار الساعة.",
                    description: "نقدم لكم تجربة نقل مميزة تجمع بين الراحة، الرفاهية والأمان مع سائقين محترفين وأحدث أسطول سيارات.",
                    buttonText: "احجز رحلتك الآن",
                    buttonLink: "#booking",
                },
                en: {
                    title: `Welcome to ${displayName}`,
                    subtitle: "Premium limousine and car rental services around the clock.",
                    description: "Experience ultimate luxury, safety and comfort with professional drivers and high-end fleet.",
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
                    description: "مجموعة متكاملة من الخدمات الفاخرة لتلبية كافة احتياجاتك اليومية والخاصة.",
                },
                en: {
                    eyebrow: "Our Services",
                    title: "Transportation tailored for you",
                    description: "A comprehensive range of luxury services to satisfy all your travel needs.",
                },
                cards: {
                    "service-1": {
                        id: "service-1",
                        icon: "car",
                        ar: { title: "تأجير سيارات فاخرة", description: "أحدث طرازات السيارات الفاخرة للمناسبات ورجال الأعمال." },
                        en: { title: "Luxury Car Rental", description: "The newest luxury car models for business and events." },
                    },
                    "service-2": {
                        id: "service-2",
                        icon: "driver",
                        ar: { title: "توصيل مطارات وسياحة", description: "خدمة استقبال وتوصيل من وإلى جميع المطارات بأعلى مستوى." },
                        en: { title: "Airport Transfers", description: "Meet and greet airport transfers with utmost punctuality." },
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
        console.error(`Error initializing landing for tenant [${tenantId}]:`, error);
        return false;
    }
};

/**
 * 1-Click Auto-Repair for any merchant / tenant
 * Creates missing documents, migrates legacy landing if abu-hady, repairs subscription
 */
export const autoRepairTenant = async (tenantId) => {
    const repairs = [];
    try {
        const tenantRef = doc(db, TENANTS_COLLECTION, tenantId);
        const tenantSnap = await getDoc(tenantRef);

        if (!tenantSnap.exists()) {
            const defaultData = createDefaultTenantData(
                tenantId,
                tenantId === "abu-hady" ? "أبو هادي لخدمات الليموزين وتأجير السيارات" : tenantId,
                tenantId
            );
            await setDoc(tenantRef, defaultData);
            repairs.push("تم إنشاء مستند التاجر الرئيسي في قاعدة البيانات بنجاح.");
        }

        // Check landing doc
        const landingRef = doc(db, TENANTS_COLLECTION, tenantId, "config", "landing");
        const landingSnap = await getDoc(landingRef);

        if (!landingSnap.exists()) {
            if (tenantId === "abu-hady") {
                const legacyLandingRef = doc(db, "landingPage", "settings");
                const legacySnap = await getDoc(legacyLandingRef);
                if (legacySnap.exists()) {
                    await setDoc(landingRef, {
                        ...legacySnap.data(),
                        updatedAt: serverTimestamp(),
                    });
                    repairs.push("تم نسخ وترحيل بيانات اللاندينج القديمة (landingPage/settings) إلى مسار أبو هادي المخصص.");
                } else {
                    await initializeTenantLanding(tenantId, "أبو هادي لخدمات الليموزين");
                    repairs.push("تم توليد لاندينج باج افتراضية لأبو هادي.");
                }
            } else {
                await initializeTenantLanding(tenantId);
                repairs.push("تم تهيئة صفحة هبوط أولية للتاجر بنجاح.");
            }
        }

        return {
            success: true,
            repairs: repairs.length > 0 ? repairs : ["جميع سجلات التاجر سليمة ومحدثة ولا تتطلب إصلاح."],
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

/**
 * Generates WhatsApp reminder URL with pre-filled Arabic message
 */
export const generateWhatsAppReminderUrl = (tenant) => {
    const rawPhone = tenant.ownerPhone || "";
    // Normalize phone number (strip non-digits, ensure country code)
    let cleanPhone = rawPhone.replace(/[^0-9]/g, "");
    if (cleanPhone.startsWith("01")) {
        cleanPhone = "2" + cleanPhone; // Egypt default prefix
    }

    const days = calculateDaysRemaining(tenant.subscription?.endDate);
    const endDateStr = tenant.subscription?.endDate
        ? new Date(tenant.subscription.endDate).toLocaleDateString("ar-EG")
        : "قريباً";

    const daysText =
        days <= 0
            ? "منتهي الصلاحية حالياً"
            : `سينتهي خلال ${days} ${days === 1 ? "يوم" : "أيام"} (بتاريخ ${endDateStr})`;

    const msg = `مرحباً بك ${tenant.name || "عزيزنا الشريك"}،
نحيطكم علماً بأن اشتراككم في منصة SEKKA - سِكّة (باقة: ${tenant.subscription?.plan || "Pro"}) ${daysText}.
يرجى التواصل لتجديد الاشتراك لضمان استمرار عمل موقعكم ولوحة التحكم ومزامنة البيانات دون أي انقطاع.
شكراً لاختياركم منصة سِكّة!`;

    return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(msg)}`;
};


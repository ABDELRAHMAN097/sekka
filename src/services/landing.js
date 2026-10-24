import {
    doc,
    getDoc,
    setDoc,
    serverTimestamp,
    onSnapshot,
} from "firebase/firestore";

import { db } from "../config/firebase";



/* =========================================================
   DEFAULT LANDING DATA
========================================================= */

export const defaultLandingData = {
    hero: {
        ar: {
            title: "الفخامة تبدأ من هنا.",
            subtitle: "استمتع بتجربة قيادة استثنائية.",
            description:
                "اكتشف مجموعتنا المميزة من السيارات الفاخرة واستمتع بتجربة تأجير تناسب احتياجاتك.",
            buttonText: "احجز سيارتك",
            buttonLink: "/booking",
        },

        en: {
            title: "Drive Luxury.",
            subtitle: "Experience Excellence.",
            description:
                "Discover our premium collection of luxury cars and enjoy an exceptional driving experience.",
            buttonText: "Book a Car",
            buttonLink: "/booking",
        },

        image: {
            imageUrl: "",
            publicId: "",
            alt: "",
        },
    },

    services: {
        ar: {
            eyebrow: "خدماتنا",
            title: "خدمات مصممة لتجربة استثنائية",
            description:
                "نقدم لك مجموعة متكاملة من الخدمات التي تجعل كل رحلة أكثر راحة وفخامة.",
        },

        en: {
            eyebrow: "Our Services",
            title: "Services designed for an exceptional experience",
            description:
                "A complete range of services designed to make every journey more comfortable and luxurious.",
        },

        cards: {
            "service-1": {
                id: "service-1",
                icon: "car",
                ar: {
                    title: "تأجير سيارات فاخرة",
                    description:
                        "مجموعة مميزة من السيارات الفاخرة لتناسب جميع احتياجاتك.",
                },
                en: {
                    title: "Luxury Car Rental",
                    description:
                        "A premium fleet of luxury cars designed for every occasion.",
                },
            },

            "service-2": {
                id: "service-2",
                icon: "driver",
                ar: {
                    title: "سائق خاص",
                    description:
                        "خدمة سائق احترافية تمنحك الراحة والخصوصية طوال رحلتك.",
                },
                en: {
                    title: "Private Chauffeur",
                    description:
                        "Professional chauffeur service built around comfort and privacy.",
                },
            },

            "service-3": {
                id: "service-3",
                icon: "airport",
                ar: {
                    title: "استقبال من المطار",
                    description:
                        "انتقال فاخر ومريح من وإلى المطار في الوقت المناسب.",
                },
                en: {
                    title: "Airport Transfer",
                    description:
                        "Premium airport transfers with punctual and comfortable service.",
                },
            },
        },
    },

    featuredCars: [],
    gallery: [],
};

/* =========================================================
   NORMALIZE LANDING DATA
========================================================= */

export const normalizeLandingData = (data = {}) => {
    return {
        ...defaultLandingData,
        ...data,

        hero: {
            ...defaultLandingData.hero,
            ...(data.hero || {}),

            ar: {
                ...defaultLandingData.hero.ar,
                ...(data.hero?.ar || {}),
            },

            en: {
                ...defaultLandingData.hero.en,
                ...(data.hero?.en || {}),
            },

            image: {
                ...defaultLandingData.hero.image,
                ...(data.hero?.image || {}),
            },
        },

        services: {
            ...defaultLandingData.services,
            ...(data.services || {}),

            ar: {
                ...defaultLandingData.services.ar,
                ...(data.services?.ar || {}),
            },

            en: {
                ...defaultLandingData.services.en,
                ...(data.services?.en || {}),
            },

            cards: {
                ...defaultLandingData.services.cards,
                ...(data.services?.cards || {}),
            },
        },

        featuredCars: Array.isArray(data.featuredCars)
            ? data.featuredCars
            : [],

        gallery: Array.isArray(data.gallery)
            ? data.gallery
            : [],
    };
};

/* =========================================================
   MULTI-TENANT DOCUMENT REFERENCES & CACHE SETTINGS
========================================================= */

const platformLandingRef = doc(db, "landingPage", "settings");

export const getLandingDocRef = (tenantId = null) => {
    const effectiveTenantId = tenantId || import.meta.env.VITE_TENANT_ID || null;
    if (!effectiveTenantId) {
        return platformLandingRef;
    }
    return doc(db, "tenants", effectiveTenantId, "config", "landing");
};

const getCacheKey = (tenantId = null) => {
    const id = tenantId || import.meta.env.VITE_TENANT_ID || "platform";
    return `sekka_landing_cache_${id}_v2`;
};

const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes cache TTL

const memoryCacheMap = {};
const memoryCacheTimestamps = {};

/* =========================================================
   LOCAL / STORAGE CACHE HELPERS (PER TENANT)
========================================================= */

const getStorageCache = (tenantId = null) => {
    if (typeof window === "undefined") return null;
    try {
        const key = getCacheKey(tenantId);
        const raw = localStorage.getItem(key);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (Date.now() - parsed.timestamp < CACHE_TTL_MS) {
            return parsed.data;
        }
    } catch {
        // ignore parse/storage errors
    }
    return null;
};

const setStorageCache = (data, tenantId = null) => {
    if (typeof window === "undefined") return;
    try {
        const key = getCacheKey(tenantId);
        localStorage.setItem(
            key,
            JSON.stringify({
                timestamp: Date.now(),
                data,
            })
        );
    } catch {
        // storage quota full or disabled
    }
};

export const getCachedLandingData = (tenantId = null) => {
    const id = tenantId || "platform";
    const mem = memoryCacheMap[id];
    const timestamp = memoryCacheTimestamps[id] || 0;
    if (mem && Date.now() - timestamp < CACHE_TTL_MS) {
        return mem;
    }
    const stored = getStorageCache(id);
    if (stored) {
        memoryCacheMap[id] = stored;
        memoryCacheTimestamps[id] = Date.now();
        return stored;
    }
    return null;
};

export const invalidateLandingCache = (tenantId = null) => {
    const id = tenantId || "platform";
    delete memoryCacheMap[id];
    delete memoryCacheTimestamps[id];
    if (typeof window !== "undefined") {
        try {
            localStorage.removeItem(getCacheKey(id));
        } catch {
            // ignore
        }
    }
};

/* =========================================================
   GET LANDING PAGE (PER TENANT, CACHED)
========================================================= */

export const getLandingPage = async ({ forceRefresh = false, tenantId = null } = {}) => {
    const effectiveTenantId = tenantId || import.meta.env.VITE_TENANT_ID || null;

    // 1. Check Cache first to avoid consuming Firestore read quota
    if (!forceRefresh) {
        const cached = getCachedLandingData(effectiveTenantId);
        if (cached) {
            return cached;
        }
    }

    try {
        const landingDocRef = getLandingDocRef(effectiveTenantId);
        let snapshot = await getDoc(landingDocRef);

        // Fallback to platform settings if tenant landing isn't configured yet
        if (!snapshot.exists() && effectiveTenantId) {
            const platformSnap = await getDoc(platformLandingRef);
            if (platformSnap.exists()) {
                const platformData = normalizeLandingData(platformSnap.data());
                return platformData;
            }
        }

        const normalized = snapshot.exists()
            ? normalizeLandingData(snapshot.data())
            : defaultLandingData;

        // 2. Store in Memory and Storage Cache
        memoryCacheMap[effectiveTenantId] = normalized;
        memoryCacheTimestamps[effectiveTenantId] = Date.now();
        setStorageCache(normalized, effectiveTenantId);

        return normalized;
    } catch (error) {
        console.error(`Error fetching landing page for [${effectiveTenantId}]:`, error);
        const stale = memoryCacheMap[effectiveTenantId] || getStorageCache(effectiveTenantId);
        if (stale) return stale;
        return defaultLandingData;
    }
};

/* =========================================================
   SAVE LANDING PAGE (ISOLATED PER TENANT)
========================================================= */

export const saveLandingPage = async (data, { tenantId = null } = {}) => {
    const effectiveTenantId = tenantId || import.meta.env.VITE_TENANT_ID || null;

    try {
        const normalizedData = normalizeLandingData(data);
        const landingDocRef = getLandingDocRef(effectiveTenantId);

        await setDoc(
            landingDocRef,
            {
                ...normalizedData,
                updatedAt: serverTimestamp(),
            },
            { merge: true }
        );

        // Update local caches immediately
        const cacheId = effectiveTenantId || "platform";
        memoryCacheMap[cacheId] = normalizedData;
        memoryCacheTimestamps[cacheId] = Date.now();
        setStorageCache(normalizedData, effectiveTenantId);

        // Notify active windows/components
        if (typeof window !== "undefined") {
            window.dispatchEvent(
                new CustomEvent(`landingPageUpdated_${cacheId}`, {
                    detail: normalizedData,
                })
            );
            window.dispatchEvent(
                new CustomEvent("landingPageUpdated", {
                    detail: normalizedData,
                })
            );
        }

        return true;
    } catch (error) {
        console.error(`Error saving landing page for [${effectiveTenantId || "platform"}]:`, error);
        throw error;
    }
};

/* =========================================================
   REAL-TIME LANDING PAGE (PER TENANT)
========================================================= */

export const subscribeToLandingPage = (callback, onError, { tenantId = null } = {}) => {
    const effectiveTenantId = tenantId || import.meta.env.VITE_TENANT_ID || null;
    const cacheId = effectiveTenantId || "platform";

    // Immediately emit cached data to avoid visual loading lag
    const cached = getCachedLandingData(effectiveTenantId);
    if (cached) {
        callback(cached);
    }

    const landingDocRef = getLandingDocRef(effectiveTenantId);

    return onSnapshot(
        landingDocRef,
        async (snapshot) => {
            if (snapshot.exists()) {
                const data = normalizeLandingData(snapshot.data());
                memoryCacheMap[cacheId] = data;
                memoryCacheTimestamps[cacheId] = Date.now();
                setStorageCache(data, effectiveTenantId);
                callback(data);
            } else if (effectiveTenantId) {
                // If tenant landing doc doesn't exist yet, check platform settings doc
                try {
                    const platformSnap = await getDoc(platformLandingRef);
                    const data = platformSnap.exists()
                        ? normalizeLandingData(platformSnap.data())
                        : defaultLandingData;
                    memoryCacheMap[cacheId] = data;
                    memoryCacheTimestamps[cacheId] = Date.now();
                    setStorageCache(data, effectiveTenantId);
                    callback(data);
                } catch {
                    callback(defaultLandingData);
                }
            } else {
                callback(defaultLandingData);
            }
        },
        (error) => {
            console.error(`Landing realtime error for [${cacheId}]:`, error);
            if (onError) onError(error);
        }
    );
};
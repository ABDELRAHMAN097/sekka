
import {
    doc,
    getDoc,
    setDoc,
    serverTimestamp,
    onSnapshot,
} from "firebase/firestore";

import { db } from "../config/firebase";

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

const platformLandingRef = doc(db, "landingPage", "settings");

export const getLandingDocRef = () => platformLandingRef;

const CACHE_KEY = "sekka_platform_landing_v1";
const CACHE_TTL_MS = 10 * 60 * 1000;

let memoryCache = null;
let memoryCacheTimestamp = 0;

const getStorageCache = () => {
    if (typeof window === "undefined") return null;

    try {
        const raw = localStorage.getItem(CACHE_KEY);

        if (!raw) return null;

        const parsed = JSON.parse(raw);

        if (
            !parsed?.timestamp ||
            Date.now() - parsed.timestamp >= CACHE_TTL_MS ||
            !parsed.data
        ) {
            return null;
        }

        return normalizeLandingData(parsed.data);
    } catch {
        return null;
    }
};

const setStorageCache = (data) => {
    if (typeof window === "undefined") return;

    try {
        localStorage.setItem(
            CACHE_KEY,
            JSON.stringify({
                timestamp: Date.now(),
                data,
            })
        );
    } catch {
        return;
    }
};

const updateCache = (data) => {
    const normalized = normalizeLandingData(data);

    memoryCache = normalized;
    memoryCacheTimestamp = Date.now();

    setStorageCache(normalized);

    return normalized;
};

export const getCachedLandingData = () => {
    if (
        memoryCache &&
        Date.now() - memoryCacheTimestamp < CACHE_TTL_MS
    ) {
        return memoryCache;
    }

    const stored = getStorageCache();

    if (stored) {
        memoryCache = stored;
        memoryCacheTimestamp = Date.now();

        return stored;
    }

    return null;
};

export const invalidateLandingCache = () => {
    memoryCache = null;
    memoryCacheTimestamp = 0;

    if (typeof window !== "undefined") {
        try {
            localStorage.removeItem(CACHE_KEY);
        } catch {
            return;
        }
    }
};

export const getLandingPage = async ({ forceRefresh = false } = {}) => {
    if (!forceRefresh) {
        const cached = getCachedLandingData();

        if (cached) return cached;
    }

    try {
        const snapshot = await getDoc(platformLandingRef);

        const data = snapshot.exists()
            ? normalizeLandingData(snapshot.data())
            : defaultLandingData;

        return updateCache(data);
    } catch (error) {
        console.error("Error fetching Sekka landing page:", error);

        const stale = memoryCache || getStorageCache();

        if (stale) return stale;

        return defaultLandingData;
    }
};

export const saveLandingPage = async (data) => {
    try {
        const normalizedData = normalizeLandingData(data);

        await setDoc(
            platformLandingRef,
            {
                ...normalizedData,
                updatedAt: serverTimestamp(),
            },
            { merge: true }
        );

        updateCache(normalizedData);

        if (typeof window !== "undefined") {
            window.dispatchEvent(
                new CustomEvent("landingPageUpdated_platform", {
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
        console.error("Error saving Sekka landing page:", error);
        throw error;
    }
};

export const subscribeToLandingPage = (callback, onError) => {
    const cached = getCachedLandingData();

    if (cached) {
        callback(cached);
    }

    return onSnapshot(
        platformLandingRef,
        (snapshot) => {
            const data = snapshot.exists()
                ? normalizeLandingData(snapshot.data())
                : defaultLandingData;

            callback(updateCache(data));
        },
        (error) => {
            console.error("Sekka landing realtime error:", error);

            if (onError) {
                onError(error);
            }
        }
    );
};

import { initializeApp } from "firebase/app";
import {
    getFirestore,
    doc,
    getDoc,
    setDoc,
    getDocs,
    collection,
    updateDoc,
    serverTimestamp,
} from "firebase/firestore";
import fs from "fs";
import path from "path";

// 1. Parse .env
const envPath = path.resolve(process.cwd(), ".env");
const envContent = fs.readFileSync(envPath, "utf-8");
const envVars = {};
for (const line of envContent.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const [key, ...rest] = trimmed.split("=");
    if (key && rest.length > 0) {
        envVars[key.trim()] = rest.join("=").trim();
    }
}

const firebaseConfig = {
    apiKey: envVars.VITE_FIREBASE_API_KEY,
    authDomain: envVars.VITE_FIREBASE_AUTH_DOMAIN,
    databaseURL: envVars.VITE_FIREBASE_DATABASE_URL,
    projectId: envVars.VITE_FIREBASE_PROJECT_ID,
    storageBucket: envVars.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: envVars.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: envVars.VITE_FIREBASE_APP_ID,
    measurementId: envVars.VITE_FIREBASE_MEASUREMENT_ID,
};

console.log("Connecting to Firebase project:", firebaseConfig.projectId);
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function migrate() {
    console.log("\n🚀 Starting Firestore Multi-Tenant Schema Migration for SEKKA...");

    // 1. Update/Enrich tenants/abu-hady
    console.log("\n1️⃣ Updating document: tenants/abu-hady...");
    const abuHadyRef = doc(db, "tenants", "abu-hady");
    const abuHadySnap = await getDoc(abuHadyRef);
    const existingAbuHadyData = abuHadySnap.exists() ? abuHadySnap.data() : {};

    const now = new Date();
    const expiry = new Date();
    expiry.setMonth(expiry.getMonth() + 1);

    const enrichedAbuHady = {
        ...existingAbuHadyData,
        id: "abu-hady",
        slug: "abu-hady",
        name: existingAbuHadyData.name || "أبو هادي لخدمات الليموزين وتأجير السيارات",
        status: existingAbuHadyData.status || "active",
        domain: existingAbuHadyData.domain || "abuhady.sekka.app",
        ownerEmail: existingAbuHadyData.ownerEmail || "abuhady@sekka.app",
        ownerPhone: existingAbuHadyData.ownerPhone || "01012345678",
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
            ...(existingAbuHadyData.subscription || {}),
        },
        modules: {
            editLanding: true,
            fleet: true,
            wallet: true,
            reports: true,
            users: true,
            customDomain: false,
            ...(existingAbuHadyData.modules || {}),
        },
        cloudinary: {
            cloudName: envVars.VITE_CLOUDINARY_CLOUD_NAME || "dtdpkfkw2",
            uploadPreset: envVars.VITE_CLOUDINARY_UPLOAD_PRESET || "abu_hady_landing",
            ...(existingAbuHadyData.cloudinary || {}),
        },
        updatedAt: serverTimestamp(),
    };

    await setDoc(abuHadyRef, enrichedAbuHady, { merge: true });
    console.log("✅ tenants/abu-hady updated successfully with subscription, modules, and cloudinary schema.");

    // 2. Migrate landing page data to tenants/abu-hady/config/landing
    console.log("\n2️⃣ Migrating landing data to tenants/abu-hady/config/landing...");
    const legacyLandingRef = doc(db, "landingPage", "settings");
    const tenantLandingRef = doc(db, "tenants", "abu-hady", "config", "landing");

    let landingDataToCopy = null;
    const legacySnap = await getDoc(legacyLandingRef);
    if (legacySnap.exists()) {
        console.log("Found existing landing data in landingPage/settings. Migrating...");
        landingDataToCopy = legacySnap.data();
    } else {
        console.log("landingPage/settings not found, using default landing template.");
    }

    if (landingDataToCopy) {
        await setDoc(tenantLandingRef, {
            ...landingDataToCopy,
            updatedAt: serverTimestamp(),
        }, { merge: true });
        console.log("✅ Copied existing landingPage/settings into tenants/abu-hady/config/landing.");
    } else {
        // Fallback default
        await setDoc(tenantLandingRef, {
            hero: {
                ar: {
                    title: "أبو هادي لخدمات الليموزين",
                    subtitle: "الفخامة تبدأ من هنا. استمتع بتجربة قيادة استثنائية.",
                    description: "اكتشف مجموعتنا المميزة من السيارات الفاخرة واستمتع بتجربة تأجير تناسب احتياجاتك.",
                    buttonText: "احجز سيارتك",
                    buttonLink: "#booking",
                },
                en: {
                    title: "Abu Hady Limousine Services",
                    subtitle: "Drive Luxury. Experience Excellence.",
                    description: "Discover our premium collection of luxury cars and enjoy an exceptional driving experience.",
                    buttonText: "Book a Car",
                    buttonLink: "#booking",
                },
                image: {
                    imageUrl: "https://images.unsplash.com/photo-1618843479313-40f8afb4b4d8?auto=format&fit=crop&w=1400&q=90",
                    publicId: "",
                    alt: "Abu Hady Luxury Fleet",
                },
            },
            services: {
                ar: {
                    eyebrow: "خدماتنا",
                    title: "خدمات مصممة لتجربة استثنائية",
                    description: "نقدم لك مجموعة متكاملة من الخدمات التي تجعل كل رحلة أكثر راحة وفخامة.",
                },
                en: {
                    eyebrow: "Our Services",
                    title: "Services designed for an exceptional experience",
                    description: "A complete range of services designed to make every journey more comfortable and luxurious.",
                },
            },
            featuredCars: [],
            gallery: [],
            updatedAt: serverTimestamp(),
        }, { merge: true });
        console.log("✅ Initialized default template in tenants/abu-hady/config/landing.");
    }

    // 3. Update existing users with tenantId: "abu-hady"
    console.log("\n3️⃣ Inspecting and updating users collection with tenantId...");
    const usersSnap = await getDocs(collection(db, "users"));
    console.log(`Found ${usersSnap.size} user documents in 'users' collection.`);

    let updatedUsersCount = 0;
    for (const userDoc of usersSnap.docs) {
        const userData = userDoc.data();
        if (!userData.tenantId) {
            await updateDoc(doc(db, "users", userDoc.id), {
                tenantId: "abu-hady",
                updatedAt: serverTimestamp(),
            });
            updatedUsersCount++;
        }
    }
    console.log(`✅ Updated ${updatedUsersCount} users with tenantId: "abu-hady".`);

    console.log("\n🎉 MULTI-TENANT SCHEMA MIGRATION COMPLETED SUCCESSFULLY!");
    process.exit(0);
}

migrate().catch((err) => {
    console.error("❌ Migration error:", err);
    process.exit(1);
});

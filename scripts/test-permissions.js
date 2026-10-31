import { initializeApp } from "firebase/app";
import { getFirestore, doc, getDoc, setDoc } from "firebase/firestore";
import fs from "fs";
import path from "path";

const envPath = path.resolve(process.cwd(), ".env");
const envContent = fs.readFileSync(envPath, "utf-8");
const envVars = {};
for (const line of envContent.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const [key, ...rest] = trimmed.split("=");
    if (key && rest.length > 0) envVars[key.trim()] = rest.join("=").trim();
}

const firebaseConfig = {
    apiKey: envVars.VITE_FIREBASE_API_KEY,
    authDomain: envVars.VITE_FIREBASE_AUTH_DOMAIN,
    databaseURL: envVars.VITE_FIREBASE_DATABASE_URL,
    projectId: envVars.VITE_FIREBASE_PROJECT_ID,
    storageBucket: envVars.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: envVars.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: envVars.VITE_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function testPermissions() {
    console.log("Testing unauthenticated read on users/test...");
    try {
        const snap = await getDoc(doc(db, "users", "test"));
        console.log("Read users/test result exists:", snap.exists());
    } catch (e) {
        console.error("Read users/test FAILED:", e.message, e.code);
    }

    console.log("Testing unauthenticated write on users/test...");
    try {
        await setDoc(doc(db, "users", "test"), { test: true });
        console.log("Write users/test SUCCEEDED");
    } catch (e) {
        console.error("Write users/test FAILED:", e.message, e.code);
    }
}

testPermissions().then(() => process.exit(0));

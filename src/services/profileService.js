
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { updateProfile } from "firebase/auth";
import { auth, db } from "../config/firebase";
import { USERS_COLLECTION, getSearchFields } from "./userUtils";

const PROFILE_FIELDS = ["name", "phone", "imageUrl"];
const SEARCH_FIELDS = ["name", "phone", "email"];

export const getUserProfile = async (uid) => {
    if (!uid) return null;

    try {
        const snapshot = await getDoc(doc(db, USERS_COLLECTION, uid));
        return snapshot.exists()
            ? { id: snapshot.id, ...snapshot.data() }
            : null;
    } catch (error) {
        console.error("Error fetching user profile:", error);
        throw error;
    }
};

export const updateUserProfileData = async (userId, data = {}) => {
    const currentUser = auth.currentUser;
    const targetId = userId || currentUser?.uid;

    if (!targetId) throw new Error("User ID is required.");
    if (targetId !== currentUser?.uid) {
        throw new Error("You can only update your own profile.");
    }

    const userRef = doc(db, USERS_COLLECTION, targetId);
    const existingSnapshot = await getDoc(userRef);
    const existingData = existingSnapshot.exists() ? existingSnapshot.data() : {};

    const cleanData = Object.fromEntries(
        PROFILE_FIELDS
            .filter((key) => data[key] !== undefined)
            .map((key) => [key, data[key]])
    );

    const updates = {
        ...cleanData,
        updatedAt: serverTimestamp(),
    };

    if (!existingSnapshot.exists()) {
        updates.uid = targetId;
        updates.name = cleanData.name ?? currentUser.displayName ?? "";
        updates.email = currentUser.email ?? "";
        updates.phone = cleanData.phone ?? currentUser.phoneNumber ?? "";
        updates.role = "customer";
        updates.status = "active";
        updates.createdAt = serverTimestamp();
    }

    if (SEARCH_FIELDS.some((key) => data[key] !== undefined)) {
        Object.assign(
            updates,
            getSearchFields({
                name: cleanData.name ?? existingData.name ?? currentUser.displayName ?? "",
                email: existingData.email ?? currentUser.email ?? "",
                phone: cleanData.phone ?? existingData.phone ?? currentUser.phoneNumber ?? "",
            })
        );
    }

    await setDoc(userRef, updates, { merge: true });

    const authUpdates = {};
    if (cleanData.name !== undefined && cleanData.name !== currentUser.displayName) {
        authUpdates.displayName = cleanData.name;
    }
    if (cleanData.imageUrl !== undefined && cleanData.imageUrl !== currentUser.photoURL) {
        authUpdates.photoURL = cleanData.imageUrl;
    }

    if (Object.keys(authUpdates).length) {
        await updateProfile(currentUser, authUpdates);
    }

    return true;
};

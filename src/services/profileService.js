
import {
    doc,
    getDoc,
    updateDoc,
    serverTimestamp,
} from "firebase/firestore";
import { updateProfile } from "firebase/auth";
import { auth, db } from "../config/firebase";

const USERS_COLLECTION = "users";

const PROFILE_FIELDS = [
    "name",
    "phone",
    "imageUrl",
    "dateOfBirth",
    "city",
    "address",
    "documents",
    "driverInfo",
    "imagePublicId",
    "publicId",
];

const getProfileRef = (uid, ownerUid) => {
    const isBusinessUser = ownerUid && ownerUid !== uid;

    return isBusinessUser
        ? doc(db, USERS_COLLECTION, ownerUid, USERS_COLLECTION, uid)
        : doc(db, USERS_COLLECTION, uid);
};

export const getUserProfile = async (uid, ownerUid = null) => {
    if (!uid) return null;

    const isBusinessUser = ownerUid && ownerUid !== uid;
    const snapshot = await getDoc(getProfileRef(uid, ownerUid));

    if (!snapshot.exists()) return null;

    return {
        ...snapshot.data(),
        id: snapshot.id,
        uid: snapshot.id,
        ...(isBusinessUser ? { ownerUid } : {}),
    };
};

export const updateUserProfileData = async (
    userId,
    data = {},
    ownerUid = null
) => {
    const currentUser = auth.currentUser;
    const uid = userId || currentUser?.uid;

    if (!currentUser || !uid) {
        throw new Error("Authentication is required.");
    }

    if (uid !== currentUser.uid) {
        throw new Error("You can only update your own profile.");
    }

    if (!data || typeof data !== "object" || Array.isArray(data)) {
        throw new Error("Invalid profile data.");
    }

    const cleanData = Object.fromEntries(
        PROFILE_FIELDS
            .filter((field) => data[field] !== undefined)
            .map((field) => [field, data[field]])
    );

    if (data.avatar !== undefined && data.imageUrl === undefined) {
        cleanData.imageUrl = data.avatar;
    }

    if (!Object.keys(cleanData).length) return true;

    const profileRef = getProfileRef(uid, ownerUid);
    const snapshot = await getDoc(profileRef);

    if (!snapshot.exists()) {
        throw new Error("User profile not found.");
    }

    await updateDoc(profileRef, {
        ...cleanData,
        updatedAt: serverTimestamp(),
    });

    const authUpdates = {};

    if (
        cleanData.name !== undefined &&
        cleanData.name !== currentUser.displayName
    ) {
        authUpdates.displayName = cleanData.name;
    }

    if (
        cleanData.imageUrl !== undefined &&
        cleanData.imageUrl !== currentUser.photoURL
    ) {
        authUpdates.photoURL = cleanData.imageUrl;
    }

    if (Object.keys(authUpdates).length) {
        await updateProfile(currentUser, authUpdates);
    }

    return true;
};

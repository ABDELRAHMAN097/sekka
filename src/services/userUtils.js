import {
    doc,
    updateDoc,
} from "firebase/firestore";
import { db } from "../config/firebase";

export const USERS_COLLECTION = "users";

export const DEFAULT_PAGE_SIZE = 5;
export const MAX_PAGE_SIZE = 50;
export const MAX_SEARCH_VALUES = 30;

export const BUSINESS_USER_ROLES = [
    "admin",
    "staff",
    "worker",
    "driver",
    "customer",
];

export const BUSINESS_USER_STATUSES = [
    "active",
    "inactive",
    "blocked",
    "suspended",
];

export const convertArabicNumerals = (value) => {
    const arabicDigits = "٠١٢٣٤٥٦٧٨٩";
    const persianDigits = "۰۱۲۳۴۵۶۷۸۹";

    return String(value ?? "")
        .replace(/[٠-٩]/g, (digit) => arabicDigits.indexOf(digit))
        .replace(/[۰-۹]/g, (digit) => persianDigits.indexOf(digit));
};

export const normalizeArabic = (value) => {
    return convertArabicNumerals(value)
        .replace(/[\u064B-\u065F\u0670]/g, "")
        .replace(/\u0640/g, "")
        .replace(/[أإآٱ]/g, "ا")
        .replace(/ة/g, "ه")
        .replace(/ى/g, "ي")
        .toLowerCase()
        .trim()
        .replace(/\s+/g, " ");
};

export const normalizeText = (value) => normalizeArabic(value);

export const normalizePhone = (value) => {
    return convertArabicNumerals(value).replace(/\D/g, "");
};

export const getSearchFields = ({
    name = "",
    displayName = "",
    email = "",
    phone = "",
    phoneNumber = "",
}) => ({
    nameNormalized: normalizeArabic(name || displayName),
    emailNormalized: String(email ?? "").toLowerCase().trim(),
    phoneNormalized: normalizePhone(phone || phoneNumber),
});

export const saveUserSearchFields = async (
    ownerUid,
    userId,
    userData
) => {
    if (!ownerUid || !userId || !userData) {
        return;
    }

    const searchFields = getSearchFields(userData);

    const hasSearchFields =
        userData.nameNormalized === searchFields.nameNormalized &&
        userData.emailNormalized === searchFields.emailNormalized &&
        userData.phoneNormalized === searchFields.phoneNormalized;

    if (hasSearchFields) {
        return;
    }

    await updateDoc(
        doc(db, USERS_COLLECTION, ownerUid, "users", userId),
        searchFields
    );
};

export const chunkArray = (array, size) => {
    const chunks = [];

    for (let index = 0; index < array.length; index += size) {
        chunks.push(array.slice(index, index + size));
    }

    return chunks;
};

export const mapUser = (docSnap, ownerUid = null) => {
    const data = docSnap.data() || {};

    return {
        id: docSnap.id,
        uid: data.uid || docSnap.id,
        ...data,
        ownerUid: ownerUid || data.ownerUid || "",
    };
};

export const parseSearchTargets = (queryStr) => {
    if (!queryStr) return [];

    const hasDelimiter = /[,،;|\n]/.test(queryStr);

    if (hasDelimiter) {
        return queryStr
            .split(/[,،;|\n]+/)
            .map((value) => value.trim())
            .filter(Boolean);
    }

    const trimmed = queryStr.trim();
    const spaceTokens = trimmed.split(/\s+/).filter(Boolean);

    if (spaceTokens.length > 1) {
        const areAllPhonesOrEmails = spaceTokens.every(
            (token) =>
                token.includes("@") ||
                /^\d{6,}$/.test(normalizePhone(token))
        );

        if (areAllPhonesOrEmails) {
            return spaceTokens;
        }
    }

    return [trimmed];
};
import {
    collection,
    doc,
    getDoc,
    getDocs,
    updateDoc,
    serverTimestamp,
} from "firebase/firestore";

import { db } from "../config/firebase";

import {
    USERS_COLLECTION,
    DEFAULT_PAGE_SIZE,
    MAX_PAGE_SIZE,
    BUSINESS_USER_ROLES,
    BUSINESS_USER_STATUSES,
    normalizeArabic,
    normalizePhone,
    getSearchFields,
    mapUser,
} from "./userUtils";

const getBusinessUsersCollection = (ownerUid) => {
    if (!ownerUid) {
        throw new Error("لم يتم تحديد صاحب النشاط.");
    }

    return collection(
        db,
        USERS_COLLECTION,
        ownerUid,
        "users"
    );
};

const getBusinessUserDocument = (ownerUid, userId) => {
    if (!ownerUid || !userId) {
        throw new Error("بيانات المستخدم أو النشاط غير مكتملة.");
    }

    return doc(
        db,
        USERS_COLLECTION,
        ownerUid,
        "users",
        userId
    );
};

const normalizePageSize = (pageSize) => {
    const parsed = Number(pageSize) || DEFAULT_PAGE_SIZE;

    return Math.min(
        Math.max(parsed, 1),
        MAX_PAGE_SIZE
    );
};

const matchesSearchField = (user, searchValue, searchBy) => {
    const name = normalizeArabic(
        user.name || user.displayName || ""
    );

    const email = String(user.email || "")
        .toLowerCase()
        .trim();

    const phone = normalizePhone(
        user.phone || user.phoneNumber || ""
    );

    const normalizedSearch = normalizeArabic(searchValue);
    const normalizedPhoneSearch = normalizePhone(searchValue);
    const normalizedEmailSearch = String(searchValue)
        .toLowerCase()
        .trim();

    switch (searchBy) {
        case "name":
            return name.includes(normalizedSearch);

        case "email":
            return email.includes(normalizedEmailSearch);

        case "phone":
            return phone.includes(normalizedPhoneSearch);

        default:
            return (
                name.includes(normalizedSearch) ||
                email.includes(normalizedEmailSearch) ||
                phone.includes(normalizedPhoneSearch)
            );
    }
};

const matchesFilters = (user, role, status) => {
    const roleMatches =
        !role || role === "all" || user.role === role;

    const statusMatches =
        !status || status === "all" || user.status === status;

    return roleMatches && statusMatches;
};

const getOwnerUidFromOptions = (options = {}) => {
    return options.ownerUid || "";
};

export const getAllUsers = async ({
    ownerUid,
    pageSize = DEFAULT_PAGE_SIZE,
    role = "all",
    status = "all",
    cursor = 0,
} = {}) => {
    const usersCollection = getBusinessUsersCollection(ownerUid);

    const snapshot = await getDocs(usersCollection);

    const allUsers = snapshot.docs
        .map((document) => mapUser(document, ownerUid))
        .filter((user) => matchesFilters(user, role, status))
        .sort((first, second) =>
            first.id.localeCompare(second.id)
        );

    const safePageSize = normalizePageSize(pageSize);
    const startIndex = Math.max(Number(cursor) || 0, 0);

    const users = allUsers.slice(
        startIndex,
        startIndex + safePageSize
    );

    const nextCursor =
        startIndex + safePageSize < allUsers.length
            ? startIndex + safePageSize
            : null;

    return {
        users,
        lastDoc: nextCursor,
        nextCursor,
        hasNextPage: nextCursor !== null,
        total: allUsers.length,
    };
};

export const searchUsers = async (options = {}) => {
    const ownerUid = getOwnerUidFromOptions(options);

    const {
        searchQuery = "",
        searchTerm = "",
        query: queryValue = "",
        searchBy = "all",
        role = "all",
        status = "all",
        limitResults = 100,
    } = options;

    const searchValue = String(
        searchQuery || searchTerm || queryValue || ""
    ).trim();

    if (!searchValue) {
        return {
            users: [],
            total: 0,
        };
    }

    const usersCollection = getBusinessUsersCollection(ownerUid);
    const snapshot = await getDocs(usersCollection);

    const normalizedLimit = Math.max(
        Number(limitResults) || 100,
        1
    );

    const users = snapshot.docs
        .map((document) => mapUser(document, ownerUid))
        .filter((user) => matchesFilters(user, role, status))
        .filter((user) =>
            matchesSearchField(user, searchValue, searchBy)
        )
        .sort((first, second) =>
            first.id.localeCompare(second.id)
        );

    return {
        users: users.slice(0, normalizedLimit),
        total: users.length,
    };
};

export const getUserStats = async (options = {}) => {
    const ownerUid =
        typeof options === "string"
            ? options
            : getOwnerUidFromOptions(options);

    const usersCollection = getBusinessUsersCollection(ownerUid);
    const snapshot = await getDocs(usersCollection);

    const users = snapshot.docs.map((document) =>
        mapUser(document, ownerUid)
    );

    const stats = {
        total: users.length,
        customers: 0,
        drivers: 0,
        admins: 0,
        staff: 0,
        workers: 0,
        management: 0,
        superAdmins: 0,
    };

    users.forEach((user) => {
        switch (user.role) {
            case "customer":
                stats.customers += 1;
                break;

            case "driver":
                stats.drivers += 1;
                break;

            case "admin":
                stats.admins += 1;
                break;

            case "staff":
                stats.staff += 1;
                break;

            case "worker":
                stats.workers += 1;
                break;

            default:
                break;
        }
    });

    stats.management =
        stats.admins +
        stats.staff +
        stats.workers;

    return stats;
};

export const getUsersCountByRole = async (
    ownerUid,
    role = "all"
) => {
    const usersCollection = getBusinessUsersCollection(ownerUid);
    const snapshot = await getDocs(usersCollection);

    const users = snapshot.docs.map((document) =>
        mapUser(document, ownerUid)
    );

    if (!role || role === "all") {
        return users.length;
    }

    return users.filter((user) => user.role === role).length;
};

export const updateUserAccount = async (
    userId,
    {
        ownerUid,
        role,
        status,
    } = {}
) => {
    const userRef = getBusinessUserDocument(ownerUid, userId);
    const userSnapshot = await getDoc(userRef);

    if (!userSnapshot.exists()) {
        throw new Error("المستخدم غير موجود داخل هذا النشاط.");
    }

    const currentUser = userSnapshot.data();

    if (currentUser.role === "business_owner") {
        throw new Error("لا يمكن تعديل حساب صاحب النشاط من إدارة المستخدمين.");
    }

    const updates = {};

    if (role !== undefined) {
        if (!BUSINESS_USER_ROLES.includes(role)) {
            throw new Error("الدور المحدد غير مسموح به.");
        }

        updates.role = role;
    }

    if (status !== undefined) {
        if (!BUSINESS_USER_STATUSES.includes(status)) {
            throw new Error("حالة الحساب المحددة غير مسموح بها.");
        }

        updates.status = status;
    }

    if (!Object.keys(updates).length) {
        throw new Error("لم يتم تحديد أي بيانات لتحديثها.");
    }

    updates.updatedAt = serverTimestamp();

    await updateDoc(userRef, updates);

    return {
        id: userId,
        ...currentUser,
        ...updates,
    };
};

export const updateUserRole = async (
    userId,
    newRole,
    ownerUid
) => {
    return updateUserAccount(userId, {
        ownerUid,
        role: newRole,
    });
};

export const updateUserStatus = async (
    userId,
    newStatus,
    ownerUid
) => {
    return updateUserAccount(userId, {
        ownerUid,
        status: newStatus,
    });
};

export const getBusinessUser = async (ownerUid, userId) => {
    const userRef = getBusinessUserDocument(ownerUid, userId);
    const snapshot = await getDoc(userRef);

    if (!snapshot.exists()) {
        return null;
    }

    return mapUser(snapshot, ownerUid);
};

export const refreshUserSearchFields = async (
    ownerUid,
    userId
) => {
    const userRef = getBusinessUserDocument(ownerUid, userId);
    const snapshot = await getDoc(userRef);

    if (!snapshot.exists()) {
        throw new Error("المستخدم غير موجود.");
    }

    const userData = snapshot.data();
    const searchFields = getSearchFields(userData);

    await updateDoc(userRef, {
        ...searchFields,
        updatedAt: serverTimestamp(),
    });

    return true;
};
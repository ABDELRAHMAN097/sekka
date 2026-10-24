import {
    collection,
    getDocs,
    getDoc,
    setDoc,
    deleteDoc,
    doc,
    updateDoc,
    query,
    where,
    orderBy,
    limit,
    startAfter,
    getCountFromServer,
    documentId,
    serverTimestamp,
} from "firebase/firestore";
import { db } from "../config/firebase";
import {
    USERS_COLLECTION,
    DEFAULT_PAGE_SIZE,
    MAX_PAGE_SIZE,
    mapUser,
    parseSearchTargets,
    normalizeArabic,
    normalizePhone,
} from "./userUtils";

/**
 * Helper to fetch and merge tenant customers & members
 */
const getTenantUsersList = async (tenantId) => {
    if (!tenantId || tenantId === "all") return [];

    try {
        const [customersSnap, membersSnap] = await Promise.all([
            getDocs(collection(db, "tenants", tenantId, "customers")),
            getDocs(collection(db, "tenants", tenantId, "members")),
        ]);

        const usersMap = new Map();

        // 1. Process customers
        customersSnap.docs.forEach((d) => {
            const data = d.data() || {};
            usersMap.set(d.id, {
                id: d.id,
                uid: d.id,
                name: data.name || data.displayName || "",
                email: data.email || "",
                phone: data.phone || data.phoneNumber || "",
                role: data.role || "customer",
                status: data.status || "active",
                createdAt: data.createdAt || null,
                tenantId,
                isCustomer: true,
                isMember: false,
            });
        });

        // 2. Process members (staff, drivers, tenant_owner, admin)
        membersSnap.docs.forEach((d) => {
            const data = d.data() || {};
            const existing = usersMap.get(d.id) || {};
            usersMap.set(d.id, {
                ...existing,
                id: d.id,
                uid: d.id,
                name: data.name || existing.name || "",
                email: data.email || existing.email || "",
                phone: data.phone || existing.phone || "",
                role: data.role || "staff",
                status: data.status || existing.status || "active",
                createdAt: data.createdAt || existing.createdAt || null,
                tenantId,
                isCustomer: false,
                isMember: true,
            });
        });

        return Array.from(usersMap.values());
    } catch (error) {
        console.error(`Error loading users for tenant [${tenantId}]:`, error);
        return [];
    }
};

/**
 * Fetches paginated users.
 * - If tenantId is provided: fetches from /tenants/{tenantId}/customers & /members
 * - If no tenantId: fetches from root /users collection
 */
export const getAllUsers = async ({
    pageSize = DEFAULT_PAGE_SIZE,
    role = "all",
    status = "all",
    cursor = null,
    tenantId = null,
} = {}) => {
    try {
        const safePageSize = Math.min(
            Math.max(Number(pageSize) || DEFAULT_PAGE_SIZE, 1),
            MAX_PAGE_SIZE
        );

        // Merchant-specific query (Customers & Members)
        if (tenantId && tenantId !== "all") {
            const allTenantUsers = await getTenantUsersList(tenantId);

            // Filter by role and status
            const filtered = allTenantUsers.filter((u) => {
                if (role && role !== "all") {
                    const uRole = String(u.role || "").toLowerCase();
                    if (uRole !== role.toLowerCase()) return false;
                }
                if (status && status !== "all") {
                    const uStatus = String(u.status || "").toLowerCase();
                    if (uStatus !== status.toLowerCase()) return false;
                }
                return true;
            });

            // Pagination over filtered array
            const startIndex = cursor && typeof cursor === "number" ? cursor : 0;
            const pageUsers = filtered.slice(startIndex, startIndex + safePageSize);
            const nextCursor = startIndex + safePageSize < filtered.length ? startIndex + safePageSize : null;
            const hasNextPage = startIndex + safePageSize < filtered.length;

            return {
                users: pageUsers,
                lastDoc: nextCursor,
                hasNextPage,
            };
        }

        // Platform-wide Super Admin query (root /users)
        const usersRef = collection(db, USERS_COLLECTION);
        const constraints = [];

        if (role && role !== "all") {
            constraints.push(where("role", "==", role));
        }

        if (status && status !== "all") {
            constraints.push(where("status", "==", status));
        }

        constraints.push(orderBy(documentId(), "asc"));

        if (cursor) {
            constraints.push(startAfter(cursor));
        }

        constraints.push(limit(safePageSize + 1));

        let querySnapshot;
        try {
            const usersQuery = query(usersRef, ...constraints);
            querySnapshot = await getDocs(usersQuery);
        } catch (queryErr) {
            console.warn(
                "Firestore query requires index or failed, falling back to base query:",
                queryErr
            );

            const fallbackConstraints = [limit(safePageSize + 1)];
            const fallbackQuery = query(usersRef, ...fallbackConstraints);
            querySnapshot = await getDocs(fallbackQuery);
        }

        const documents = querySnapshot.docs;
        const hasNextPage = documents.length > safePageSize;
        const pageDocuments = hasNextPage
            ? documents.slice(0, safePageSize)
            : documents;

        const users = pageDocuments.map(mapUser);
        const lastDoc =
            pageDocuments.length > 0
                ? pageDocuments[pageDocuments.length - 1]
                : null;

        return {
            users,
            lastDoc,
            hasNextPage,
        };
    } catch (error) {
        console.error("Error fetching paginated users:", error);
        throw error;
    }
};

/**
 * Searches users across fields with support for Arabic normalization,
 * multiple search tokens, phone, email, name, role, and status.
 */
export const searchUsers = async ({
    searchQuery = "",
    searchBy = "all",
    role = "all",
    status = "all",
    limitResults = 100,
    tenantId = null,
} = {}) => {
    try {
        const targets = parseSearchTargets(searchQuery);
        if (!targets.length) {
            return [];
        }

        let allUsers = [];

        if (tenantId && tenantId !== "all") {
            allUsers = await getTenantUsersList(tenantId);
        } else {
            const usersRef = collection(db, USERS_COLLECTION);
            let snapshot;
            try {
                const constraints = [];
                if (role && role !== "all") {
                    constraints.push(where("role", "==", role));
                }
                if (status && status !== "all") {
                    constraints.push(where("status", "==", status));
                }
                const q = constraints.length > 0 ? query(usersRef, ...constraints) : query(usersRef);
                snapshot = await getDocs(q);
            } catch (indexError) {
                console.warn("Firestore indexed query error, falling back to all users scan:", indexError);
                snapshot = await getDocs(usersRef);
            }
            allUsers = snapshot.docs.map(mapUser);
        }

        const parsedTargets = targets.map((t) => {
            const normText = normalizeArabic(t);
            const normPhone = normalizePhone(t);
            const normEmail = String(t).toLowerCase().trim();
            const words = normText.split(/\s+/).filter(Boolean);
            return {
                raw: t,
                normText,
                normPhone,
                normEmail,
                words,
            };
        });

        const scoredUsers = [];

        for (const user of allUsers) {
            const userRole = String(user.role || "").toLowerCase();
            const userStatus = String(user.status || "").toLowerCase();

            if (role && role !== "all" && userRole !== role.toLowerCase()) {
                continue;
            }

            if (status && status !== "all" && userStatus !== status.toLowerCase()) {
                continue;
            }

            const userName = normalizeArabic(user.name || user.displayName || "");
            const userEmail = String(user.email || "").toLowerCase().trim();
            const userPhone = normalizePhone(user.phone || user.phoneNumber || "");
            const userId = String(user.id || user.uid || "").toLowerCase().trim();

            let bestScore = 0;

            for (const target of parsedTargets) {
                let matchScore = 0;

                const checkName = () => {
                    if (!target.normText) return 0;
                    if (userName === target.normText) return 100;
                    if (userName.startsWith(target.normText)) return 60;
                    if (userName.includes(target.normText)) return 40;
                    if (target.words.length > 1 && target.words.every((w) => userName.includes(w))) {
                        return 35;
                    }
                    return 0;
                };

                const checkEmail = () => {
                    if (!target.normEmail) return 0;
                    if (userEmail === target.normEmail) return 100;
                    if (userEmail.startsWith(target.normEmail)) return 60;
                    if (userEmail.includes(target.normEmail)) return 30;
                    return 0;
                };

                const checkPhone = () => {
                    if (!target.normPhone || target.normPhone.length < 2) return 0;
                    if (userPhone === target.normPhone) return 100;
                    if (userPhone.endsWith(target.normPhone) || userPhone.startsWith(target.normPhone)) return 60;
                    if (userPhone.includes(target.normPhone)) return 40;
                    return 0;
                };

                const checkId = () => {
                    if (!target.normEmail) return 0;
                    if (userId === target.normEmail) return 100;
                    if (userId.includes(target.normEmail)) return 40;
                    return 0;
                };

                if (searchBy === "name") {
                    matchScore = checkName();
                } else if (searchBy === "email") {
                    matchScore = checkEmail();
                } else if (searchBy === "phone") {
                    matchScore = checkPhone();
                } else {
                    matchScore = Math.max(checkName(), checkEmail(), checkPhone(), checkId());
                }

                if (matchScore > bestScore) {
                    bestScore = matchScore;
                }
            }

            if (bestScore > 0) {
                scoredUsers.push({ user, score: bestScore });
            }
        }

        scoredUsers.sort((a, b) => b.score - a.score);

        return scoredUsers.slice(0, limitResults).map((item) => item.user);
    } catch (error) {
        console.error("Error searching users:", error);
        return [];
    }
};

/**
 * Fetches user statistics grouped by role.
 */
export const getUserStats = async ({ tenantId = null } = {}) => {
    try {
        if (tenantId && tenantId !== "all") {
            const [customersSnap, membersSnap] = await Promise.all([
                getCountFromServer(collection(db, "tenants", tenantId, "customers")),
                getDocs(collection(db, "tenants", tenantId, "members")),
            ]);

            const customersCount = customersSnap.data().count;

            let drivers = 0;
            let management = 0;

            membersSnap.docs.forEach((d) => {
                const role = String(d.data().role || "").toLowerCase();
                if (role === "driver") {
                    drivers += 1;
                } else {
                    management += 1;
                }
            });

            return {
                total: customersCount + membersSnap.docs.length,
                customers: customersCount,
                drivers,
                admins: management,
                superAdmins: 0,
                management,
            };
        }

        // Platform-wide stats
        const usersRef = collection(db, USERS_COLLECTION);
        const totalQuery = query(usersRef);
        const customersQuery = query(usersRef, where("role", "==", "customer"));
        const driversQuery = query(usersRef, where("role", "==", "driver"));
        const adminsQuery = query(usersRef, where("role", "==", "admin"));
        const superAdminsQuery = query(usersRef, where("role", "==", "super_admin"));

        const [
            totalSnapshot,
            customersSnapshot,
            driversSnapshot,
            adminsSnapshot,
            superAdminsSnapshot,
        ] = await Promise.all([
            getCountFromServer(totalQuery),
            getCountFromServer(customersQuery),
            getCountFromServer(driversQuery),
            getCountFromServer(adminsQuery),
            getCountFromServer(superAdminsQuery),
        ]);

        const total = totalSnapshot.data().count;
        const customers = customersSnapshot.data().count;
        const drivers = driversSnapshot.data().count;
        const admins = adminsSnapshot.data().count;
        const superAdmins = superAdminsSnapshot.data().count;

        return {
            total,
            customers,
            drivers,
            admins,
            superAdmins,
            management: admins + superAdmins,
        };
    } catch (error) {
        console.error("Error fetching user statistics:", error);
        throw error;
    }
};

/**
 * Fetches total count of users filtered by role.
 */
export const getUsersCountByRole = async (role = "all") => {
    try {
        const usersRef = collection(db, USERS_COLLECTION);

        const usersQuery =
            role === "all"
                ? query(usersRef)
                : query(usersRef, where("role", "==", role));

        const snapshot = await getCountFromServer(usersQuery);
        return snapshot.data().count;
    } catch (error) {
        console.error("Error fetching users count:", error);
        throw error;
    }
};

/**
 * Updates a user's role and/or status across Firestore:
 * - When in a merchant context:
 *   - If role is "customer": saved to /tenants/{tenantId}/customers, removed from /members
 *   - If role is promoted (e.g. driver, staff, admin): saved to /tenants/{tenantId}/members, removed from /customers
 *   - Also updates root /users/{userId} document
 */
export const updateUserAccount = async (userId, { role, status, tenantId = null } = {}) => {
    try {
        if (!userId) throw new Error("userId is required.");

        // Fetch existing data from root /users or subcollections for consistency
        const userRef = doc(db, USERS_COLLECTION, userId);
        const userSnap = await getDoc(userRef);
        const existingData = userSnap.exists() ? userSnap.data() : {};

        const effectiveTenant = tenantId || existingData.tenantId || null;

        // If merchant tenant is known, manage subcollections
        if (effectiveTenant && effectiveTenant !== "all") {
            const customerRef = doc(db, "tenants", effectiveTenant, "customers", userId);
            const memberRef = doc(db, "tenants", effectiveTenant, "members", userId);

            if (role !== undefined) {
                if (role === "customer") {
                    // Demote / keep as customer
                    await setDoc(customerRef, {
                        uid: userId,
                        name: existingData.name || existingData.displayName || "عميل",
                        email: existingData.email || "",
                        phone: existingData.phone || existingData.phoneNumber || "",
                        role: "customer",
                        status: status !== undefined ? status : (existingData.status || "active"),
                        updatedAt: serverTimestamp(),
                    }, { merge: true });

                    // Remove from members
                    try {
                        await deleteDoc(memberRef);
                    } catch (e) {
                        // ignore if doc didn't exist
                    }
                } else {
                    // Promote to member (driver, staff, admin, tenant_owner)
                    await setDoc(memberRef, {
                        uid: userId,
                        name: existingData.name || existingData.displayName || "عضو",
                        email: existingData.email || "",
                        phone: existingData.phone || existingData.phoneNumber || "",
                        role: role,
                        status: status !== undefined ? status : (existingData.status || "active"),
                        updatedAt: serverTimestamp(),
                    }, { merge: true });

                    // Remove from customers
                    try {
                        await deleteDoc(customerRef);
                    } catch (e) {
                        // ignore
                    }
                }
            } else if (status !== undefined) {
                // Update status in whichever subcollection the user exists
                try {
                    const cSnap = await getDoc(customerRef);
                    if (cSnap.exists()) {
                        await updateDoc(customerRef, { status, updatedAt: serverTimestamp() });
                    }
                } catch {}

                try {
                    const mSnap = await getDoc(memberRef);
                    if (mSnap.exists()) {
                        await updateDoc(memberRef, { status, updatedAt: serverTimestamp() });
                    }
                } catch {}
            }
        }

        // Always update root /users document
        const rootUpdates = {
            updatedAt: serverTimestamp(),
        };

        if (role !== undefined) {
            rootUpdates.role = role;
        }

        if (status !== undefined) {
            rootUpdates.status = status;
        }

        if (effectiveTenant && effectiveTenant !== "all") {
            rootUpdates.tenantId = effectiveTenant;
        }

        if (userSnap.exists()) {
            await updateDoc(userRef, rootUpdates);
        } else {
            await setDoc(userRef, {
                uid: userId,
                name: "مستخدم",
                role: role || "customer",
                status: status || "active",
                ...rootUpdates,
                createdAt: serverTimestamp(),
            });
        }

        return true;
    } catch (error) {
        console.error("Error updating user account:", error);
        throw error;
    }
};

/**
 * Updates a user's role.
 */
export const updateUserRole = async (userId, newRole, tenantId = null) => {
    return updateUserAccount(userId, { role: newRole, tenantId });
};

/**
 * Updates a user's status.
 */
export const updateUserStatus = async (userId, newStatus, tenantId = null) => {
    return updateUserAccount(userId, { status: newStatus, tenantId });
};

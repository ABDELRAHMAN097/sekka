import {
    useCallback,
    useEffect,
    useRef,
    useState,
} from "react";

import {
    getAllUsers,
    getUserStats,
    searchUsers,
    updateUserAccount,
} from "@/services/userService";

import { useBusiness } from "@/context/TenantContext";

const PAGE_SIZE = 5;
const SEARCH_DELAY = 350;
const MIN_SEARCH_LENGTH = 2;

const INITIAL_STATS = {
    total: 0,
    customers: 0,
    drivers: 0,
    management: 0,
    admins: 0,
    staff: 0,
    workers: 0,
    superAdmins: 0,
};

export const useUsers = () => {
    const {
        ownerUid,
        loadingBusiness,
    } = useBusiness();

    const [users, setUsers] = useState([]);
    const [regularLoading, setRegularLoading] = useState(true);
    const [regularCurrentPage, setRegularCurrentPage] = useState(1);
    const [regularHasNextPage, setRegularHasNextPage] = useState(false);

    const [searchQuery, setSearchQuery] = useState("");
    const [searchResults, setSearchResults] = useState([]);
    const [searchLoading, setSearchLoading] = useState(false);
    const [isDebouncing, setIsDebouncing] = useState(false);
    const [searchPage, setSearchPage] = useState(1);

    const [searchBy, setSearchBy] = useState("all");
    const [roleFilter, setRoleFilter] = useState("all");
    const [statusFilter, setStatusFilter] = useState("all");

    const [stats, setStats] = useState(INITIAL_STATS);
    const [statsLoading, setStatsLoading] = useState(true);

    const cursorsRef = useRef([0]);
    const usersRequestRef = useRef(0);
    const searchRequestRef = useRef(0);
    const statsRequestRef = useRef(0);
    const searchTimerRef = useRef(null);

    const isSearching = searchQuery.trim().length >= MIN_SEARCH_LENGTH;

    const fetchUsersPage = useCallback(async ({
        page = 1,
        reset = false,
    } = {}) => {
        if (!ownerUid) {
            setUsers([]);
            setRegularHasNextPage(false);
            setRegularLoading(false);
            return;
        }

        const requestId = ++usersRequestRef.current;

        setRegularLoading(true);

        try {
            const cursor = reset
                ? 0
                : cursorsRef.current[page - 1] ?? 0;

            const result = await getAllUsers({
                ownerUid,
                pageSize: PAGE_SIZE,
                role: roleFilter,
                status: statusFilter,
                cursor,
            });

            if (requestId !== usersRequestRef.current) {
                return;
            }

            setUsers(result.users || []);
            setRegularCurrentPage(page);
            setRegularHasNextPage(Boolean(result.hasNextPage));

            if (reset) {
                cursorsRef.current = [0];
            }

            if (result.nextCursor !== null && result.nextCursor !== undefined) {
                cursorsRef.current[page] = result.nextCursor;
            }
        } catch (error) {
            if (requestId === usersRequestRef.current) {
                console.error("Failed to fetch business users:", error);
                setUsers([]);
                setRegularHasNextPage(false);
            }
        } finally {
            if (requestId === usersRequestRef.current) {
                setRegularLoading(false);
            }
        }
    }, [ownerUid, roleFilter, statusFilter]);

    const fetchStats = useCallback(async () => {
        if (!ownerUid) {
            setStats(INITIAL_STATS);
            setStatsLoading(false);
            return;
        }

        const requestId = ++statsRequestRef.current;

        setStatsLoading(true);

        try {
            const result = await getUserStats({ ownerUid });

            if (requestId !== statsRequestRef.current) {
                return;
            }

            setStats({
                ...INITIAL_STATS,
                ...result,
            });
        } catch (error) {
            if (requestId === statsRequestRef.current) {
                console.error("Failed to fetch user stats:", error);
                setStats(INITIAL_STATS);
            }
        } finally {
            if (requestId === statsRequestRef.current) {
                setStatsLoading(false);
            }
        }
    }, [ownerUid]);

    const runSearch = useCallback(async (
        value = searchQuery
    ) => {
        const trimmedQuery = value.trim();

        if (
            !ownerUid ||
            trimmedQuery.length < MIN_SEARCH_LENGTH
        ) {
            setSearchResults([]);
            setSearchLoading(false);
            setSearchPage(1);
            return;
        }

        const requestId = ++searchRequestRef.current;

        setSearchLoading(true);

        try {
            const result = await searchUsers({
                ownerUid,
                searchQuery: trimmedQuery,
                searchBy,
                role: roleFilter,
                status: statusFilter,
                limitResults: 100,
            });

            if (requestId !== searchRequestRef.current) {
                return;
            }

            setSearchResults(result.users || []);
            setSearchPage(1);
        } catch (error) {
            if (requestId === searchRequestRef.current) {
                console.error("Failed to search business users:", error);
                setSearchResults([]);
            }
        } finally {
            if (requestId === searchRequestRef.current) {
                setSearchLoading(false);
            }
        }
    }, [
        ownerUid,
        searchQuery,
        searchBy,
        roleFilter,
        statusFilter,
    ]);

    useEffect(() => {
        if (loadingBusiness) {
            return;
        }

        cursorsRef.current = [0];
        setRegularCurrentPage(1);
        setSearchResults([]);
        setSearchQuery("");
        setSearchPage(1);

        fetchUsersPage({
            page: 1,
            reset: true,
        });

        fetchStats();
    }, [
        ownerUid,
        loadingBusiness,
        fetchUsersPage,
        fetchStats,
    ]);

    useEffect(() => {
        if (searchTimerRef.current) {
            clearTimeout(searchTimerRef.current);
        }

        if (loadingBusiness) {
            return;
        }

        const trimmedQuery = searchQuery.trim();

        if (trimmedQuery.length < MIN_SEARCH_LENGTH) {
            searchRequestRef.current += 1;
            setSearchResults([]);
            setSearchLoading(false);
            setIsDebouncing(false);
            setSearchPage(1);
            return;
        }

        setIsDebouncing(true);

        searchTimerRef.current = setTimeout(() => {
            setIsDebouncing(false);
            runSearch(trimmedQuery);
        }, SEARCH_DELAY);

        return () => {
            if (searchTimerRef.current) {
                clearTimeout(searchTimerRef.current);
            }
        };
    }, [
        searchQuery,
        searchBy,
        roleFilter,
        statusFilter,
        ownerUid,
        loadingBusiness,
        runSearch,
    ]);

    useEffect(() => {
        return () => {
            if (searchTimerRef.current) {
                clearTimeout(searchTimerRef.current);
            }

            usersRequestRef.current += 1;
            searchRequestRef.current += 1;
            statsRequestRef.current += 1;
        };
    }, []);

    const handleSearch = useCallback((value) => {
        setSearchQuery(value);
        setSearchPage(1);
    }, []);

    const handleSearchByChange = useCallback((value) => {
        setSearchBy(value);
        setSearchPage(1);
    }, []);

    const handleRoleFilterChange = useCallback((value) => {
        cursorsRef.current = [0];
        setRoleFilter(value);
        setRegularCurrentPage(1);
        setSearchPage(1);
    }, []);

    const handleStatusFilterChange = useCallback((value) => {
        cursorsRef.current = [0];
        setStatusFilter(value);
        setRegularCurrentPage(1);
        setSearchPage(1);
    }, []);

    const handleNextPage = useCallback(() => {
        if (isSearching) {
            const maxPage = Math.ceil(searchResults.length / PAGE_SIZE);

            setSearchPage((currentPage) =>
                Math.min(currentPage + 1, maxPage)
            );

            return;
        }

        if (!regularHasNextPage) {
            return;
        }

        fetchUsersPage({
            page: regularCurrentPage + 1,
        });
    }, [
        isSearching,
        searchResults.length,
        regularHasNextPage,
        regularCurrentPage,
        fetchUsersPage,
    ]);

    const handlePreviousPage = useCallback(() => {
        if (isSearching) {
            setSearchPage((currentPage) =>
                Math.max(currentPage - 1, 1)
            );

            return;
        }

        if (regularCurrentPage <= 1) {
            return;
        }

        fetchUsersPage({
            page: regularCurrentPage - 1,
        });
    }, [
        isSearching,
        regularCurrentPage,
        fetchUsersPage,
    ]);

    const refreshUsers = useCallback(async () => {
        searchRequestRef.current += 1;
        usersRequestRef.current += 1;

        setSearchQuery("");
        setSearchResults([]);
        setSearchPage(1);
        setRegularCurrentPage(1);

        cursorsRef.current = [0];

        await Promise.all([
            fetchUsersPage({
                page: 1,
                reset: true,
            }),
            fetchStats(),
        ]);
    }, [
        fetchUsersPage,
        fetchStats,
    ]);

    const handleUserUpdate = useCallback(async (
        userId,
        payload
    ) => {
        if (!ownerUid) {
            throw new Error("لم يتم تحديد النشاط الحالي.");
        }

        const updates = typeof payload === "string"
            ? { role: payload }
            : payload;

        await updateUserAccount(userId, {
            ...updates,
            ownerUid,
        });

        if (isSearching) {
            await runSearch(searchQuery);
        } else {
            await fetchUsersPage({
                page: regularCurrentPage,
            });
        }

        await fetchStats();
    }, [
        ownerUid,
        isSearching,
        searchQuery,
        runSearch,
        fetchUsersPage,
        regularCurrentPage,
        fetchStats,
    ]);

    const handleRoleUpdate = useCallback(async (
        userId,
        payload
    ) => {
        return handleUserUpdate(userId, payload);
    }, [handleUserUpdate]);

    const filteredUsers = isSearching
        ? searchResults.slice(
            (searchPage - 1) * PAGE_SIZE,
            searchPage * PAGE_SIZE
        )
        : users;

    const totalSearchResults = searchResults.length;

    const currentPage = isSearching
        ? searchPage
        : regularCurrentPage;

    const hasNextPage = isSearching
        ? searchPage * PAGE_SIZE < totalSearchResults
        : regularHasNextPage;

    return {
        users,
        filteredUsers,
        totalSearchResults,

        loading: regularLoading || loadingBusiness,
        searchLoading,
        isDebouncing,
        statsLoading,

        searchQuery,
        searchBy,
        handleSearch,
        handleSearchByChange,

        roleFilter,
        statusFilter,
        handleRoleFilterChange,
        handleStatusFilterChange,

        handleRoleChange: handleRoleFilterChange,
        handleStatusChange: handleStatusFilterChange,

        stats,

        currentPage,
        hasNextPage,
        handleNextPage,
        handlePreviousPage,

        refreshUsers,
        handleRoleUpdate,
        handleUserUpdate,

        isSearching,
    };
};
export default useUsers;
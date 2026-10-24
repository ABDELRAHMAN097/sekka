
import { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
    getAllTenants,
    createTenant,
    updateTenantModules,
    updateTenantSubscription,
    updateTenantStatus,
    calculateDaysRemaining,
    checkExpiringSubscriptions,
    recordPaymentReminderSent,
    diagnoseTenant,
    autoRepairTenant,
    generateWhatsAppReminderUrl,
    createDefaultTenantData,
    DEFAULT_MODULES,
} from "@/services/tenantService";
import { useTenant } from "@/context/TenantContext";
import {
    FiUsers,
    FiCheckCircle,
    FiAlertTriangle,
    FiDollarSign,
    FiActivity,
    FiPlus,
    FiSearch,
    FiExternalLink,
    FiSettings,
    FiRefreshCw,
    FiTool,
    FiCalendar,
    FiX,
    FiLock,
    FiUnlock,
} from "react-icons/fi";
import { FaWhatsapp } from "react-icons/fa";

const MODULES = [
    { key: "editLanding", title: "محرر صفحة الهبوط (Edit Landing)", desc: "تمكين التاجر من تعديل نصوص وصور موقعه" },
    { key: "fleet", title: "أسطول السيارات (Fleet)", desc: "إضافة وتعديل السيارات والأسعار" },
    { key: "wallet", title: "المحفظة والمدفوعات (Wallet)", desc: "إدارة الحركات المالية والأرصدة" },
    { key: "reports", title: "التقارير المتقدمة (Reports)", desc: "عرض إحصائيات الرحلات والأداء" },
    { key: "users", title: "إدارة الموظفين والسائقين (Users)", desc: "صلاحيات المشرفين والسائقين" },
    { key: "customDomain", title: "ربط دومين مخصص (Custom Domain)", desc: "توجيه المتجر على دومين خارجي خاص" },
];

const formatDate = (value) => {
    if (!value) return "—";

    let date;

    if (typeof value?.toDate === "function") {
        date = value.toDate();
    } else if (typeof value === "object" && typeof value.seconds === "number") {
        date = new Date(value.seconds * 1000);
    } else {
        date = new Date(value);
    }

    return Number.isNaN(date.getTime())
        ? "—"
        : date.toLocaleDateString("ar-EG");
};

const getSubscriptionDays = (subscription) => {
    if (!subscription?.endDate) return null;

    const days = calculateDaysRemaining(subscription.endDate);

    return Number.isFinite(days) ? days : null;
};

const getSubscriptionLabel = (tenant) => {
    const days = getSubscriptionDays(tenant.subscription);

    if (tenant.status === "suspended") return "الحساب معلّق";
    if (tenant.subscription?.status === "suspended") return "الاشتراك معلّق";
    if (days === null) return "تاريخ الانتهاء غير محدد";
    if (days < 0) return "منتهي";
    if (days <= 3) return days === 0 ? "ينتهي اليوم" : `متبقي ${days} أيام`;

    return `متبقي ${days} يوم`;
};

const isSubscriptionActive = (tenant) => {
    const days = getSubscriptionDays(tenant.subscription);

    return (
        tenant.status === "active" &&
        tenant.subscription?.status === "active" &&
        days !== null &&
        days >= 0
    );
};

const getModules = (tenant) => ({
    ...DEFAULT_MODULES,
    ...(tenant.modules || {}),
});

export default function SekkaMasterDashboard() {
    const { switchTenant } = useTenant();
    const navigate = useNavigate();
    const { locale = "ar" } = useParams();

    const [tenants, setTenants] = useState([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const [statusFilter, setStatusFilter] = useState("all");

    const [showAddModal, setShowAddModal] = useState(false);
    const [selectedTenantForModules, setSelectedTenantForModules] = useState(null);
    const [selectedTenantForSub, setSelectedTenantForSub] = useState(null);
    const [selectedTenantForDiag, setSelectedTenantForDiag] = useState(null);
    const [diagReport, setDiagReport] = useState(null);
    const [diagLoading, setDiagLoading] = useState(false);
    const [actionLoading, setActionLoading] = useState(false);
    const [errorMessage, setErrorMessage] = useState("");
    const [successMessage, setSuccessMessage] = useState("");

    const [newMerchant, setNewMerchant] = useState({
        name: "",
        slug: "",
        ownerEmail: "",
        ownerPhone: "",
        plan: "pro",
        price: "2500",
        durationMonths: "1",
    });

    const loadTenants = useCallback(async (showRefresh = true) => {
        try {
            if (showRefresh) setRefreshing(true);

            const data = await getAllTenants();
            setTenants(Array.isArray(data) ? data : []);
            setErrorMessage("");
        } catch (error) {
            console.error("Error loading tenants:", error);
            setErrorMessage("تعذر تحميل بيانات المتاجر. حاول تحديث الصفحة.");
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    useEffect(() => {
        loadTenants(false);
    }, [loadTenants]);

    const expiringTenants = useMemo(
        () => checkExpiringSubscriptions(tenants),
        [tenants]
    );

    const metrics = useMemo(() => {
        const total = tenants.length;
        const active = tenants.filter(isSubscriptionActive).length;

        const totalRevenue = tenants.reduce((sum, tenant) => {
            if (!isSubscriptionActive(tenant)) return sum;

            const price = Number(tenant.subscription?.price);

            return Number.isFinite(price) && price > 0
                ? sum + price
                : sum;
        }, 0);

        return {
            total,
            active,
            expiringSoon: expiringTenants.length,
            totalRevenue,
            healthRate: total
                ? Math.round((active / total) * 100)
                : 100,
        };
    }, [tenants, expiringTenants]);

    const filteredTenants = useMemo(() => {
        const normalizedQuery = searchQuery.trim().toLowerCase();

        return tenants.filter((tenant) => {
            const matchesSearch =
                (tenant.name || "").toLowerCase().includes(normalizedQuery) ||
                (tenant.slug || "").toLowerCase().includes(normalizedQuery) ||
                (tenant.ownerPhone || "").includes(searchQuery.trim());

            if (!matchesSearch) return false;

            const days = getSubscriptionDays(tenant.subscription);

            if (statusFilter === "active") {
                return isSubscriptionActive(tenant);
            }

            if (statusFilter === "expiring") {
                return (
                    tenant.status === "active" &&
                    tenant.subscription?.status === "active" &&
                    days !== null &&
                    days >= 0 &&
                    days <= 3
                );
            }

            if (statusFilter === "expired") {
                return days !== null && days < 0;
            }

            if (statusFilter === "suspended") {
                return tenant.status === "suspended";
            }

            return true;
        });
    }, [tenants, searchQuery, statusFilter]);

    const handleImpersonate = (tenant) => {
        if (!tenant?.id) {
            setErrorMessage("معرّف المتجر غير موجود.");
            return;
        }

        try {
            switchTenant(tenant.id);
            navigate(`/${locale}/dashboard`);
        } catch (error) {
            console.error("Tenant switch error:", error);
            setErrorMessage("تعذر الدخول إلى لوحة تحكم المتجر.");
        }
    };

    const handleSendReminder = async (tenant) => {
        const waUrl = generateWhatsAppReminderUrl(tenant);

        if (!waUrl) {
            setErrorMessage("لا يمكن إرسال التذكير: رقم هاتف التاجر غير موجود أو غير صالح.");
            return;
        }

        try {
            setErrorMessage("");
            await recordPaymentReminderSent(tenant.id);

            const openedWindow = window.open(
                waUrl,
                "_blank",
                "noopener,noreferrer"
            );

            if (!openedWindow) {
                setSuccessMessage("تم تسجيل التذكير. افتح رابط واتساب يدويًا إذا منع المتصفح النافذة.");
            } else {
                setSuccessMessage("تم تسجيل وقت التذكير وفتح واتساب.");
            }

            await loadTenants();
        } catch (error) {
            console.error("Reminder error:", error);
            setErrorMessage("تعذر تسجيل التذكير. لم يتم تأكيد حفظه.");
        }
    };

    const handleOpenDiagnostics = async (tenant) => {
        setSelectedTenantForDiag(tenant);
        setDiagLoading(true);
        setDiagReport(null);
        setErrorMessage("");

        try {
            const report = await diagnoseTenant(tenant.id);
            setDiagReport(report);
        } catch (error) {
            console.error("Diagnostics error:", error);
            setErrorMessage("تعذر فحص بيانات المتجر.");
        } finally {
            setDiagLoading(false);
        }
    };

    const handleRunAutoRepair = async (tenantId) => {
        setActionLoading(true);
        setErrorMessage("");
        setSuccessMessage("");

        try {
            const result = await autoRepairTenant(tenantId);

            if (!result?.success) {
                setErrorMessage(
                    result?.message ||
                    "لم يؤكد النظام نجاح الإصلاح. راجع سجل الأخطاء."
                );
                return;
            }

            const report = await diagnoseTenant(tenantId);
            setDiagReport(report);
            setSuccessMessage("تم تنفيذ الإصلاح. راجع نتيجة التشخيص للتأكد من حالة المتجر.");
            await loadTenants();
        } catch (error) {
            console.error("Auto repair error:", error);
            setErrorMessage("تعذر إكمال الإصلاح التلقائي.");
        } finally {
            setActionLoading(false);
        }
    };

    const handleToggleModule = async (moduleKey) => {
        if (!selectedTenantForModules || actionLoading) return;

        const tenantId = selectedTenantForModules.id;
        const currentModules = getModules(selectedTenantForModules);
        const updatedModules = {
            ...currentModules,
            [moduleKey]: currentModules[moduleKey] !== true,
        };

        setActionLoading(true);
        setErrorMessage("");
        setSuccessMessage("");

        try {
            await updateTenantModules(tenantId, updatedModules);

            setSelectedTenantForModules((previous) =>
                previous
                    ? { ...previous, modules: updatedModules }
                    : previous
            );

            setTenants((previous) =>
                previous.map((tenant) =>
                    tenant.id === tenantId
                        ? { ...tenant, modules: updatedModules }
                        : tenant
                )
            );

            setSuccessMessage("تم تحديث صلاحيات الموديولات.");
        } catch (error) {
            console.error("Module update error:", error);
            setErrorMessage("تعذر تحديث الموديولات.");
        } finally {
            setActionLoading(false);
        }
    };

    const handleExtendSubscription = async (monthsToAdd) => {
        if (!selectedTenantForSub || actionLoading) return;

        const tenant = selectedTenantForSub;
        const currentEnd = tenant.subscription?.endDate
            ? new Date(
                typeof tenant.subscription.endDate?.toDate === "function"
                    ? tenant.subscription.endDate.toDate()
                    : tenant.subscription.endDate
            )
            : new Date();

        if (Number.isNaN(currentEnd.getTime())) {
            setErrorMessage("تاريخ انتهاء الاشتراك غير صالح. راجع البيانات قبل التمديد.");
            return;
        }

        const baseDate =
            currentEnd.getTime() > Date.now()
                ? currentEnd
                : new Date();

        baseDate.setMonth(baseDate.getMonth() + Number(monthsToAdd));

        const updatedSubscription = {
            ...(tenant.subscription || {}),
            endDate: baseDate.toISOString(),
            status: "active",
        };

        setActionLoading(true);
        setErrorMessage("");
        setSuccessMessage("");

        try {
            await updateTenantSubscription(
                tenant.id,
                updatedSubscription
            );

            await updateTenantStatus(tenant.id, "active");

            setSelectedTenantForSub(null);
            setSuccessMessage("تم تمديد الاشتراك وتنشيط المتجر.");
            await loadTenants();
        } catch (error) {
            console.error("Subscription update error:", error);
            setErrorMessage("تعذر تحديث الاشتراك. تحقق من الاتصال والصلاحيات.");
        } finally {
            setActionLoading(false);
        }
    };

    const handleToggleTenantStatus = async () => {
        if (!selectedTenantForSub || actionLoading) return;

        const tenant = selectedTenantForSub;
        const nextStatus =
            tenant.status === "active"
                ? "suspended"
                : "active";

        setActionLoading(true);
        setErrorMessage("");
        setSuccessMessage("");

        try {
            await updateTenantStatus(tenant.id, nextStatus);

            setSelectedTenantForSub((previous) =>
                previous
                    ? { ...previous, status: nextStatus }
                    : previous
            );

            setSuccessMessage(
                nextStatus === "active"
                    ? "تم تنشيط حساب المتجر."
                    : "تم تعليق حساب المتجر."
            );

            await loadTenants();
        } catch (error) {
            console.error("Tenant status error:", error);
            setErrorMessage("تعذر تغيير حالة المتجر.");
        } finally {
            setActionLoading(false);
        }
    };

    const handleCreateMerchant = async (event) => {
        event.preventDefault();

        if (actionLoading) return;

        const name = newMerchant.name.trim();
        const safeSlug = newMerchant.slug
            .toLowerCase()
            .trim()
            .replace(/[^a-z0-9_-]/g, "-")
            .replace(/-+/g, "-")
            .replace(/^[-_]+|[-_]+$/g, "");

        if (!name || !safeSlug) {
            setErrorMessage("اكتب اسم المتجر ومعرّفًا إنجليزيًا صالحًا.");
            return;
        }

        const durationMonths = Number(newMerchant.durationMonths);
        const price = Number(newMerchant.price);

        if (
            !Number.isInteger(durationMonths) ||
            durationMonths < 1 ||
            durationMonths > 36
        ) {
            setErrorMessage("مدة الاشتراك يجب أن تكون من شهر إلى 36 شهرًا.");
            return;
        }

        if (!Number.isFinite(price) || price < 0) {
            setErrorMessage("اكتب سعرًا صالحًا للاشتراك.");
            return;
        }

        if (tenants.some((tenant) =>
            tenant.id === safeSlug || tenant.slug === safeSlug
        )) {
            setErrorMessage("هذا المعرّف مستخدم بالفعل. اختر معرّفًا آخر.");
            return;
        }

        setActionLoading(true);
        setErrorMessage("");
        setSuccessMessage("");

        try {
            const defaultData = createDefaultTenantData(
                safeSlug,
                name,
                safeSlug
            );

            const endDate = new Date();
            endDate.setMonth(endDate.getMonth() + durationMonths);

            const payload = {
                ...defaultData,
                id: safeSlug,
                slug: safeSlug,
                name,
                status: "active",
                ownerEmail: newMerchant.ownerEmail.trim(),
                ownerPhone: newMerchant.ownerPhone.trim(),
                subscription: {
                    ...defaultData.subscription,
                    plan: newMerchant.plan,
                    price,
                    currency: "EGP",
                    startDate: new Date().toISOString(),
                    endDate: endDate.toISOString(),
                    status: "active",
                },
                modules: { ...DEFAULT_MODULES },
            };

            await createTenant(safeSlug, payload);

            const repairResult = await autoRepairTenant(safeSlug);

            setShowAddModal(false);
            setNewMerchant({
                name: "",
                slug: "",
                ownerEmail: "",
                ownerPhone: "",
                plan: "pro",
                price: "2500",
                durationMonths: "1",
            });

            await loadTenants();

            if (repairResult?.success) {
                setSuccessMessage("تم إنشاء المتجر وتهيئة صفحة الهبوط الخاصة به.");
            } else {
                setSuccessMessage(
                    "تم إنشاء المتجر. قد تحتاج صفحة الهبوط إلى التهيئة؛ راجع التشخيص."
                );
            }
        } catch (error) {
            console.error("Merchant create error:", error);

            if (error?.code === "already-exists") {
                setErrorMessage("هذا المتجر موجود بالفعل، ولم يتم استبدال بياناته.");
            } else {
                setErrorMessage(
                    error?.message ||
                    "تعذر إنشاء المتجر. تأكد من أن خدمة createTenant موجودة وصلاحيات Firestore تسمح بالإنشاء."
                );
            }
        } finally {
            setActionLoading(false);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-[#0d1117] flex flex-col items-center justify-center gap-3 text-white">
                <div className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                <p className="text-gray-400 text-sm">
                    جاري تحميل بيانات منظومة منصة SEKKA...
                </p>
            </div>
        );
    }

    return (
        <div
            className="min-h-screen bg-[#0B0F19] text-gray-100 p-4 sm:p-6 lg:p-8 font-sans"
            dir="rtl"
        >
            <div className="max-w-7xl mx-auto space-y-8">
                <header className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 pb-6 border-b border-gray-800">
                    <div>
                        <div className="flex items-center gap-3">
                            <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-400 flex items-center justify-center shadow-lg shadow-emerald-500/20 font-black text-white text-xl">
                                S
                            </div>
                            <div>
                                <div className="flex items-center gap-2 flex-wrap">
                                    <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white">
                                        SEKKA - سِكّة
                                    </h1>
                                    <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                                        Master Admin Console
                                    </span>
                                </div>
                                <p className="text-sm text-gray-400 mt-0.5">
                                    إدارة التجار، الاشتراكات، الصلاحيات والتحكم المركزي في منظومة النظام متعدد المتاجر
                                </p>
                            </div>
                        </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                        <button
                            onClick={() => loadTenants()}
                            disabled={refreshing}
                            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-gray-800/80 hover:bg-gray-800 text-gray-300 hover:text-white border border-gray-700 transition text-sm cursor-pointer disabled:opacity-50"
                        >
                            <FiRefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin text-emerald-400" : ""}`} />
                            <span>تحديث</span>
                        </button>

                        <button
                            onClick={() => {
                                setErrorMessage("");
                                setSuccessMessage("");
                                setShowAddModal(true);
                            }}
                            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold transition shadow-lg shadow-emerald-600/25 text-sm cursor-pointer"
                        >
                            <FiPlus className="w-4 h-4" />
                            <span>إضافة تاجر جديد</span>
                        </button>
                    </div>
                </header>

                {(errorMessage || successMessage) && (
                    <div
                        className={`p-4 rounded-xl border text-sm ${
                            errorMessage
                                ? "bg-red-500/10 border-red-500/30 text-red-300"
                                : "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
                        }`}
                    >
                        <div className="flex items-start justify-between gap-3">
                            <p>{errorMessage || successMessage}</p>
                            <button
                                type="button"
                                onClick={() => {
                                    setErrorMessage("");
                                    setSuccessMessage("");
                                }}
                                className="shrink-0 opacity-80 hover:opacity-100"
                                aria-label="إغلاق الرسالة"
                            >
                                <FiX />
                            </button>
                        </div>
                    </div>
                )}

                <section className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
                    <MetricCard
                        label="إجمالي المتاجر"
                        value={metrics.total}
                        description="تاجر مسجل بالنظام"
                        icon={<FiUsers className="w-4 h-4 text-emerald-400" />}
                    />
                    <MetricCard
                        label="الاشتراكات النشطة"
                        value={metrics.active}
                        description="حسابات باشتراكات سارية"
                        icon={<FiCheckCircle className="w-4 h-4 text-teal-400" />}
                        valueClass="text-emerald-400"
                    />
                    <MetricCard
                        label="تنبيهات التجديد"
                        value={metrics.expiringSoon}
                        description="خلال 3 أيام أو أقل"
                        icon={<FiAlertTriangle className="w-4 h-4 text-amber-400" />}
                        valueClass={metrics.expiringSoon ? "text-amber-400" : "text-gray-300"}
                    />
                    <MetricCard
                        label="الإيراد الشهري التقديري"
                        value={`${metrics.totalRevenue.toLocaleString("ar-EG")} ج.م`}
                        description="قيمة الاشتراكات النشطة المسجلة"
                        icon={<FiDollarSign className="w-4 h-4 text-emerald-400" />}
                    />
                    <MetricCard
                        label="استقرار المنظومة"
                        value={`${metrics.healthRate}%`}
                        description="نسبة المتاجر ذات الاشتراكات السارية"
                        icon={<FiActivity className="w-4 h-4 text-emerald-400" />}
                        valueClass="text-emerald-400"
                        className="col-span-2 md:col-span-4 lg:col-span-1"
                    />
                </section>

                {expiringTenants.length > 0 && (
                    <section className="p-5 rounded-2xl bg-gradient-to-r from-amber-950/40 via-yellow-950/20 to-amber-900/30 border border-amber-500/40 space-y-4">
                        <div className="flex items-center justify-between flex-wrap gap-2">
                            <div className="flex items-center gap-2.5">
                                <span className="p-2 rounded-xl bg-amber-500/20 text-amber-400">
                                    <FiAlertTriangle className="w-5 h-5" />
                                </span>
                                <div>
                                    <h3 className="text-base font-bold text-amber-300">
                                        مركز تنبيهات تجديد الاشتراكات
                                    </h3>
                                    <p className="text-xs text-amber-200/80">
                                        مراجعة الاشتراكات التي قاربت على الانتهاء وإرسال التذكير عبر واتساب.
                                    </p>
                                </div>
                            </div>
                            <span className="text-xs px-3 py-1 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 font-bold">
                                {expiringTenants.length} متجر
                            </span>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 pt-2">
                            {expiringTenants.map((tenant) => {
                                const days = getSubscriptionDays(tenant.subscription);
                                const lastReminder = tenant.subscription?.lastReminderSentAt;

                                return (
                                    <div
                                        key={tenant.id}
                                        className="p-3.5 rounded-xl bg-gray-900/80 border border-amber-500/30 flex flex-col justify-between gap-3"
                                    >
                                        <div className="flex items-start justify-between gap-2">
                                            <div className="min-w-0">
                                                <h4 className="font-bold text-white text-sm">
                                                    {tenant.name || tenant.id}
                                                </h4>
                                                <p className="text-xs text-gray-400 font-mono break-words">
                                                    @{tenant.slug || tenant.id} • {tenant.ownerPhone || "بدون هاتف"}
                                                </p>
                                            </div>
                                            <span className={`shrink-0 text-xs px-2 py-0.5 rounded-full font-bold ${
                                                days === 0
                                                    ? "bg-red-500/20 text-red-400 border border-red-500/30"
                                                    : "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                                            }`}>
                                                {days === 0 ? "ينتهي اليوم" : `باقي ${days} أيام`}
                                            </span>
                                        </div>

                                        <div className="flex items-center justify-between flex-wrap gap-2 pt-2 border-t border-gray-800 text-xs">
                                            <span className="text-gray-400">
                                                {lastReminder
                                                    ? `آخر تذكير: ${formatDate(lastReminder)}`
                                                    : "لم يتم تسجيل تذكير"}
                                            </span>
                                            <button
                                                type="button"
                                                onClick={() => handleSendReminder(tenant)}
                                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold transition"
                                            >
                                                <FaWhatsapp className="w-3.5 h-3.5" />
                                                إرسال تذكير
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </section>
                )}

                <section className="bg-gray-900/50 rounded-2xl border border-gray-800 p-5 space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                        <div className="relative flex-1 max-w-md">
                            <FiSearch className="absolute start-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={(event) => setSearchQuery(event.target.value)}
                                placeholder="ابحث باسم المتجر أو الرابط المختصر أو الهاتف..."
                                className="w-full bg-gray-800/80 border border-gray-700/80 rounded-xl ps-10 pe-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-emerald-500 transition"
                            />
                        </div>

                        <div className="flex flex-wrap items-center gap-1.5 p-1 rounded-xl bg-gray-800/60 border border-gray-700/60 text-xs">
                            {[
                                { key: "all", label: "الكل" },
                                { key: "active", label: "النشطة" },
                                { key: "expiring", label: "أوشك على الانتهاء" },
                                { key: "expired", label: "منتهية" },
                                { key: "suspended", label: "معلقة" },
                            ].map((tab) => (
                                <button
                                    key={tab.key}
                                    type="button"
                                    onClick={() => setStatusFilter(tab.key)}
                                    className={`px-3 py-1.5 rounded-lg transition font-medium ${
                                        statusFilter === tab.key
                                            ? "bg-emerald-600 text-white shadow-sm font-bold"
                                            : "text-gray-400 hover:text-white"
                                    }`}
                                >
                                    {tab.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="overflow-x-auto rounded-xl border border-gray-800">
                        <table className="w-full text-right text-sm">
                            <thead className="bg-gray-800/50 text-gray-400 text-xs uppercase font-semibold border-b border-gray-800">
                                <tr>
                                    <th className="px-4 py-3.5">التاجر / المتجر</th>
                                    <th className="px-4 py-3.5">التواصل</th>
                                    <th className="px-4 py-3.5">الباقة والسعر</th>
                                    <th className="px-4 py-3.5">صلاحية الاشتراك</th>
                                    <th className="px-4 py-3.5">الموديولات المفعلة</th>
                                    <th className="px-4 py-3.5 text-center">التحكم والإجراءات</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-800/60">
                                {filteredTenants.length === 0 ? (
                                    <tr>
                                        <td colSpan="6" className="px-4 py-12 text-center text-gray-500">
                                            لا توجد متاجر مطابقة لبحثك الحالي.
                                        </td>
                                    </tr>
                                ) : (
                                    filteredTenants.map((tenant) => {
                                        const days = getSubscriptionDays(tenant.subscription);
                                        const isExpiring = days !== null && days >= 0 && days <= 3;
                                        const isExpired = days !== null && days < 0;
                                        const modules = getModules(tenant);
                                        const activeModulesCount = MODULES.filter(
                                            (module) => modules[module.key] === true
                                        ).length;

                                        return (
                                            <tr key={tenant.id} className="hover:bg-gray-800/30 transition group">
                                                <td className="px-4 py-4">
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500/20 to-teal-500/10 border border-emerald-500/30 flex items-center justify-center font-bold text-emerald-400 text-sm">
                                                            {tenant.name?.charAt(0) || "T"}
                                                        </div>
                                                        <div>
                                                            <div className="font-bold text-white group-hover:text-emerald-400 transition flex items-center gap-1.5">
                                                                <span>{tenant.name || "متجر بدون اسم"}</span>
                                                                {tenant.id === "abu-hady" && (
                                                                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-semibold">
                                                                        التاجر الأول
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <div className="text-xs text-gray-500 font-mono flex items-center gap-2 mt-0.5">
                                                                <span>slug: {tenant.slug || tenant.id}</span>
                                                                {tenant.domain && (
                                                                    <a
                                                                        href={`https://${tenant.domain}`}
                                                                        target="_blank"
                                                                        rel="noreferrer"
                                                                        className="text-emerald-400 hover:underline inline-flex items-center gap-0.5"
                                                                    >
                                                                        <span>{tenant.domain}</span>
                                                                        <FiExternalLink className="w-3 h-3" />
                                                                    </a>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </td>

                                                <td className="px-4 py-4 text-xs">
                                                    <div className="text-gray-300 font-medium">{tenant.ownerPhone || "—"}</div>
                                                    <div className="text-gray-500 truncate max-w-[160px]">{tenant.ownerEmail || "—"}</div>
                                                </td>

                                                <td className="px-4 py-4">
                                                    <span className="inline-block px-2.5 py-1 rounded-lg text-xs font-bold uppercase bg-gray-800 text-emerald-400 border border-emerald-500/20">
                                                        {tenant.subscription?.plan || "غير محددة"}
                                                    </span>
                                                    <div className="text-xs text-gray-400 mt-1">
                                                        {tenant.subscription?.price != null
                                                            ? `${Number(tenant.subscription.price).toLocaleString("ar-EG")} ج.م / شهر`
                                                            : "السعر غير محدد"}
                                                    </div>
                                                </td>

                                                <td className="px-4 py-4">
                                                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold ${
                                                        tenant.status === "suspended"
                                                            ? "bg-red-500/20 text-red-400 border border-red-500/30"
                                                            : isExpired
                                                            ? "bg-red-500/20 text-red-400 border border-red-500/30"
                                                            : isExpiring
                                                            ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                                                            : days === null
                                                            ? "bg-gray-700 text-gray-300 border border-gray-600"
                                                            : "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                                                    }`}>
                                                        {getSubscriptionLabel(tenant)}
                                                    </span>
                                                    <div className="text-xs text-gray-500 mt-1">
                                                        ينتهي: {formatDate(tenant.subscription?.endDate)}
                                                    </div>
                                                </td>

                                                <td className="px-4 py-4">
                                                    <button
                                                        type="button"
                                                        onClick={() => setSelectedTenantForModules(tenant)}
                                                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-gray-800/90 hover:bg-gray-700 text-gray-300 text-xs border border-gray-700 transition"
                                                    >
                                                        <FiSettings className="w-3.5 h-3.5 text-emerald-400" />
                                                        <span>{activeModulesCount} من {MODULES.length} مفعلة</span>
                                                    </button>
                                                </td>

                                                <td className="px-4 py-4 text-center">
                                                    <div className="inline-flex items-center gap-1.5">
                                                        <button
                                                            type="button"
                                                            onClick={() => handleImpersonate(tenant)}
                                                            title="الانتقال إلى لوحة تحكم التاجر"
                                                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-600/90 hover:bg-emerald-600 text-white font-bold text-xs transition"
                                                        >
                                                            <span>دخول كتاجر</span>
                                                            <FiExternalLink className="w-3 h-3" />
                                                        </button>

                                                        <button
                                                            type="button"
                                                            onClick={() => setSelectedTenantForSub(tenant)}
                                                            title="إدارة الاشتراك وحالة المتجر"
                                                            className="p-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-700 transition"
                                                        >
                                                            <FiCalendar className="w-4 h-4 text-amber-400" />
                                                        </button>

                                                        <button
                                                            type="button"
                                                            onClick={() => handleSendReminder(tenant)}
                                                            title="إرسال تذكير عبر واتساب"
                                                            className="p-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-700 transition"
                                                        >
                                                            <FaWhatsapp className="w-4 h-4 text-emerald-400" />
                                                        </button>

                                                        <button
                                                            type="button"
                                                            onClick={() => handleOpenDiagnostics(tenant)}
                                                            title="فحص بيانات المتجر"
                                                            className="p-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-700 transition"
                                                        >
                                                            <FiTool className="w-4 h-4 text-cyan-400" />
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>
                </section>
            </div>

            {showAddModal && (
                <Modal onClose={() => !actionLoading && setShowAddModal(false)}>
                    <h3 className="text-xl font-bold text-white mb-1">
                        إضافة متجر جديد لمنصة SEKKA
                    </h3>
                    <p className="text-xs text-gray-400 mb-5">
                        سيتم إنشاء سجل مستقل للمتجر وتهيئة صفحة الهبوط الخاصة به دون نقل بيانات المنصة.
                    </p>

                    <form onSubmit={handleCreateMerchant} className="space-y-4">
                        <div>
                            <label className="block text-xs font-semibold text-gray-300 mb-1">
                                اسم المتجر / الشركة
                            </label>
                            <input
                                type="text"
                                required
                                value={newMerchant.name}
                                onChange={(event) =>
                                    setNewMerchant((previous) => ({
                                        ...previous,
                                        name: event.target.value,
                                    }))
                                }
                                placeholder="مثال: الفارس لتأجير السيارات"
                                className="form-input"
                            />
                        </div>

                        <div>
                            <label className="block text-xs font-semibold text-gray-300 mb-1">
                                المعرّف الإنجليزي (Slug / ID)
                            </label>
                            <input
                                type="text"
                                required
                                value={newMerchant.slug}
                                onChange={(event) =>
                                    setNewMerchant((previous) => ({
                                        ...previous,
                                        slug: event.target.value,
                                    }))
                                }
                                placeholder="al-faris"
                                className="form-input font-mono"
                            />
                            <span className="text-[11px] text-gray-500 mt-1 block">
                                حروف إنجليزية وأرقام وشرطة فقط.
                            </span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                                <label className="block text-xs font-semibold text-gray-300 mb-1">
                                    هاتف المالك / الواتساب
                                </label>
                                <input
                                    type="tel"
                                    value={newMerchant.ownerPhone}
                                    onChange={(event) =>
                                        setNewMerchant((previous) => ({
                                            ...previous,
                                            ownerPhone: event.target.value,
                                        }))
                                    }
                                    placeholder="010XXXXXXXX"
                                    className="form-input"
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-semibold text-gray-300 mb-1">
                                    البريد الإلكتروني
                                </label>
                                <input
                                    type="email"
                                    value={newMerchant.ownerEmail}
                                    onChange={(event) =>
                                        setNewMerchant((previous) => ({
                                            ...previous,
                                            ownerEmail: event.target.value,
                                        }))
                                    }
                                    placeholder="owner@domain.com"
                                    className="form-input"
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <div>
                                <label className="block text-xs font-semibold text-gray-300 mb-1">
                                    نوع الباقة
                                </label>
                                <select
                                    value={newMerchant.plan}
                                    onChange={(event) =>
                                        setNewMerchant((previous) => ({
                                            ...previous,
                                            plan: event.target.value,
                                        }))
                                    }
                                    className="form-input"
                                >
                                    <option value="starter">Starter</option>
                                    <option value="pro">Pro (احترافي)</option>
                                    <option value="enterprise">Enterprise</option>
                                </select>
                            </div>

                            <div>
                                <label className="block text-xs font-semibold text-gray-300 mb-1">
                                    المدة (أشهر)
                                </label>
                                <input
                                    type="number"
                                    min="1"
                                    max="36"
                                    required
                                    value={newMerchant.durationMonths}
                                    onChange={(event) =>
                                        setNewMerchant((previous) => ({
                                            ...previous,
                                            durationMonths: event.target.value,
                                        }))
                                    }
                                    className="form-input"
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-semibold text-gray-300 mb-1">
                                    السعر الشهري (ج.م)
                                </label>
                                <input
                                    type="number"
                                    min="0"
                                    required
                                    value={newMerchant.price}
                                    onChange={(event) =>
                                        setNewMerchant((previous) => ({
                                            ...previous,
                                            price: event.target.value,
                                        }))
                                    }
                                    className="form-input"
                                />
                            </div>
                        </div>

                        <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-800">
                            <button
                                type="button"
                                disabled={actionLoading}
                                onClick={() => setShowAddModal(false)}
                                className="px-4 py-2 rounded-xl bg-gray-800 text-gray-300 hover:text-white text-sm disabled:opacity-50"
                            >
                                إلغاء
                            </button>
                            <button
                                type="submit"
                                disabled={actionLoading}
                                className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm shadow-lg shadow-emerald-600/30 disabled:opacity-50"
                            >
                                {actionLoading ? "جاري الإنشاء..." : "إنشاء المتجر"}
                            </button>
                        </div>
                    </form>
                </Modal>
            )}

            {selectedTenantForModules && (
                <Modal onClose={() => !actionLoading && setSelectedTenantForModules(null)}>
                    <h3 className="text-lg font-bold text-white mb-1">
                        التحكم في الموديولات: {selectedTenantForModules.name}
                    </h3>
                    <p className="text-xs text-gray-400 mb-5">
                        الموديول غير المفعّل صراحةً يظهر على أنه معطّل.
                    </p>

                    <div className="space-y-3">
                        {MODULES.map((module) => {
                            const enabled =
                                selectedTenantForModules.modules?.[module.key] === true;

                            return (
                                <div
                                    key={module.key}
                                    className="p-3 rounded-xl bg-gray-800/60 border border-gray-700/60 flex items-center justify-between gap-3"
                                >
                                    <div>
                                        <div className="font-bold text-sm text-white flex items-center gap-1.5">
                                            {enabled
                                                ? <FiUnlock className="text-emerald-400 w-3.5 h-3.5" />
                                                : <FiLock className="text-red-400 w-3.5 h-3.5" />}
                                            <span>{module.title}</span>
                                        </div>
                                        <p className="text-xs text-gray-400 mt-0.5">
                                            {module.desc}
                                        </p>
                                    </div>

                                    <button
                                        type="button"
                                        disabled={actionLoading}
                                        onClick={() => handleToggleModule(module.key)}
                                        className={`px-3 py-1 rounded-lg text-xs font-bold transition disabled:opacity-50 ${
                                            enabled
                                                ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                                                : "bg-red-500/20 text-red-400 border border-red-500/30"
                                        }`}
                                    >
                                        {enabled ? "مفعّل" : "معطّل"}
                                    </button>
                                </div>
                            );
                        })}
                    </div>

                    <div className="mt-6 pt-4 border-t border-gray-800 flex justify-end">
                        <button
                            type="button"
                            onClick={() => setSelectedTenantForModules(null)}
                            className="px-4 py-2 rounded-xl bg-gray-800 hover:bg-gray-700 text-white text-sm font-semibold"
                        >
                            إغلاق
                        </button>
                    </div>
                </Modal>
            )}

            {selectedTenantForSub && (
                <Modal onClose={() => !actionLoading && setSelectedTenantForSub(null)}>
                    <h3 className="text-lg font-bold text-white mb-1">
                        إدارة اشتراك: {selectedTenantForSub.name}
                    </h3>
                    <p className="text-xs text-gray-400 mb-5">
                        تمديد الاشتراك أو تعليق حساب المتجر.
                    </p>

                    <div className="p-3.5 rounded-xl bg-gray-800/60 border border-gray-700 mb-5 text-xs space-y-2">
                        <div className="flex justify-between text-gray-300 gap-3">
                            <span>الباقة الحالية:</span>
                            <strong className="text-emerald-400 uppercase">
                                {selectedTenantForSub.subscription?.plan || "غير محددة"}
                            </strong>
                        </div>
                        <div className="flex justify-between text-gray-300 gap-3">
                            <span>تاريخ الانتهاء:</span>
                            <strong>{formatDate(selectedTenantForSub.subscription?.endDate)}</strong>
                        </div>
                        <div className="flex justify-between text-gray-300 gap-3">
                            <span>حالة الاشتراك:</span>
                            <strong>{getSubscriptionLabel(selectedTenantForSub)}</strong>
                        </div>
                    </div>

                    <label className="block text-xs font-semibold text-gray-300 mb-2">
                        تمديد الاشتراك لـ:
                    </label>
                    <div className="grid grid-cols-3 gap-2.5 mb-5">
                        {[
                            { months: 1, title: "+ شهر", description: "شهر واحد" },
                            { months: 3, title: "+ 3 أشهر", description: "ربع سنوي" },
                            { months: 12, title: "+ سنة", description: "12 شهرًا" },
                        ].map((option) => (
                            <button
                                key={option.months}
                                type="button"
                                onClick={() => handleExtendSubscription(option.months)}
                                disabled={actionLoading}
                                className="p-3 rounded-xl bg-gray-800 hover:bg-emerald-600/20 border border-gray-700 hover:border-emerald-500/50 text-center transition disabled:opacity-50"
                            >
                                <div className="font-bold text-sm text-white">
                                    {option.title}
                                </div>
                                <div className="text-[11px] text-gray-400">
                                    {option.description}
                                </div>
                            </button>
                        ))}
                    </div>

                    <div className="flex justify-between items-center gap-3 pt-4 border-t border-gray-800 text-xs">
                        <button
                            type="button"
                            disabled={actionLoading}
                            onClick={handleToggleTenantStatus}
                            className={`px-3 py-1.5 rounded-lg font-bold border transition disabled:opacity-50 ${
                                selectedTenantForSub.status === "active"
                                    ? "bg-red-500/20 text-red-400 border-red-500/30"
                                    : "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
                            }`}
                        >
                            {selectedTenantForSub.status === "active"
                                ? "تعليق حساب المتجر"
                                : "تنشيط حساب المتجر"}
                        </button>

                        <button
                            type="button"
                            disabled={actionLoading}
                            onClick={() => setSelectedTenantForSub(null)}
                            className="px-4 py-2 rounded-xl bg-gray-800 text-gray-300 hover:text-white disabled:opacity-50"
                        >
                            إغلاق
                        </button>
                    </div>
                </Modal>
            )}

            {selectedTenantForDiag && (
                <Modal onClose={() => !actionLoading && setSelectedTenantForDiag(null)}>
                    <div className="flex items-center gap-2 mb-1">
                        <FiTool className="w-5 h-5 text-cyan-400" />
                        <h3 className="text-lg font-bold text-white">
                            تشخيص وإصلاح: {selectedTenantForDiag.name}
                        </h3>
                    </div>
                    <p className="text-xs text-gray-400 mb-5">
                        فحص سجل التاجر وصفحة الهبوط المخصصة له.
                    </p>

                    {diagLoading ? (
                        <div className="p-8 text-center text-gray-400 text-xs">
                            <div className="w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                            جاري فحص بيانات المتجر...
                        </div>
                    ) : diagReport ? (
                        <div className="space-y-4">
                            <div className="p-3.5 rounded-xl bg-gray-800/80 border border-gray-700/80 space-y-3 text-xs">
                                <DiagnosticRow
                                    label="سجل التاجر في Firestore"
                                    value={diagReport.existsInFirestore ? "موجود" : "غير موجود"}
                                    good={diagReport.existsInFirestore}
                                />
                                <DiagnosticRow
                                    label="صفحة الهبوط"
                                    value={diagReport.landingConfigured ? "مهيأة" : "غير مهيأة"}
                                    good={diagReport.landingConfigured}
                                />
                                <DiagnosticRow
                                    label="حالة الاشتراك"
                                    value={
                                        diagReport.daysRemaining == null
                                            ? "تاريخ الانتهاء غير محدد"
                                            : `${diagReport.subscriptionStatus} (${diagReport.daysRemaining} يوم)`
                                    }
                                    good={
                                        diagReport.subscriptionStatus === "active" &&
                                        diagReport.daysRemaining != null &&
                                        diagReport.daysRemaining >= 0
                                    }
                                />
                            </div>

                            {diagReport.issues?.length > 0 && (
                                <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs space-y-1">
                                    <strong className="text-amber-400 block font-bold mb-1">
                                        ملاحظات الفحص:
                                    </strong>
                                    {diagReport.issues.map((issue, index) => (
                                        <div key={`${index}-${issue}`} className="text-amber-200/90">
                                            • {issue}
                                        </div>
                                    ))}
                                </div>
                            )}

                            <div className="pt-3 border-t border-gray-800 flex items-center justify-between gap-3">
                                <button
                                    type="button"
                                    onClick={() => handleRunAutoRepair(selectedTenantForDiag.id)}
                                    disabled={actionLoading || !diagReport.existsInFirestore}
                                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs shadow-lg disabled:opacity-50"
                                >
                                    <FiRefreshCw className={`w-3.5 h-3.5 ${actionLoading ? "animate-spin" : ""}`} />
                                    إصلاح صفحة الهبوط
                                </button>

                                <button
                                    type="button"
                                    onClick={() => setSelectedTenantForDiag(null)}
                                    className="px-4 py-2 rounded-xl bg-gray-800 text-gray-300 hover:text-white text-xs"
                                >
                                    إغلاق
                                </button>
                            </div>
                        </div>
                    ) : (
                        <p className="text-sm text-gray-400">
                            لم تصل نتيجة التشخيص. أغلق النافذة وحاول مرة أخرى.
                        </p>
                    )}
                </Modal>
            )}

            <style>{`
                .form-input {
                    width: 100%;
                    background: #1f2937;
                    border: 1px solid #374151;
                    border-radius: 0.75rem;
                    padding: 0.625rem 0.875rem;
                    font-size: 0.875rem;
                    color: white;
                    outline: none;
                }
                .form-input:focus {
                    border-color: #10b981;
                }
                .form-input::placeholder {
                    color: #6b7280;
                }
            `}</style>
        </div>
    );
}

function MetricCard({
    label,
    value,
    description,
    icon,
    valueClass = "text-white",
    className = "",
}) {
    return (
        <div className={`p-4 rounded-2xl bg-gray-900/60 border border-gray-800/80 backdrop-blur-sm ${className}`}>
            <div className="flex items-center justify-between gap-2 text-gray-400 mb-2">
                <span className="text-xs font-semibold">{label}</span>
                {icon}
            </div>
            <div className={`text-xl sm:text-2xl lg:text-3xl font-black ${valueClass}`}>
                {value}
            </div>
            <div className="text-xs text-gray-400 mt-1">{description}</div>
        </div>
    );
}

function Modal({ children, onClose }) {
    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
            onMouseDown={(event) => {
                if (event.target === event.currentTarget) onClose();
            }}
        >
            <div className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6 shadow-2xl relative">
                <button
                    type="button"
                    onClick={onClose}
                    className="absolute start-4 top-4 text-gray-400 hover:text-white"
                    aria-label="إغلاق"
                >
                    <FiX className="w-5 h-5" />
                </button>
                {children}
            </div>
        </div>
    );
}

function DiagnosticRow({ label, value, good }) {
    return (
        <div className="flex justify-between items-center gap-3">
            <span className="text-gray-400">{label}:</span>
            <span className={good ? "text-emerald-400 font-bold" : "text-amber-400 font-bold"}>
                {value}
            </span>
        </div>
    );
}

import { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
    getAllTenants,
    saveTenant,
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
import { useAuth } from "@/context/AuthContext";
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
    FiShield,
    FiClock,
    FiMessageSquare,
    FiTool,
    FiCalendar,
    FiX,
    FiLock,
    FiUnlock,
    FiChevronLeft,
} from "react-icons/fi";
import { FaWhatsapp } from "react-icons/fa";

export default function SekkaMasterDashboard() {
    const { switchTenant } = useTenant();
    const { isSuperAdmin } = useAuth();
    const navigate = useNavigate();
    const { locale = "ar" } = useParams();

    // Data states
    const [tenants, setTenants] = useState([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const [statusFilter, setStatusFilter] = useState("all");

    // Modal states
    const [showAddModal, setShowAddModal] = useState(false);
    const [selectedTenantForModules, setSelectedTenantForModules] = useState(null);
    const [selectedTenantForSub, setSelectedTenantForSub] = useState(null);
    const [selectedTenantForDiag, setSelectedTenantForDiag] = useState(null);
    const [diagReport, setDiagReport] = useState(null);
    const [diagLoading, setDiagLoading] = useState(false);
    const [actionLoading, setActionLoading] = useState(false);

    // New merchant form
    const [newMerchant, setNewMerchant] = useState({
        name: "",
        slug: "",
        ownerEmail: "",
        ownerPhone: "",
        plan: "pro",
        price: 2500,
        durationMonths: 1,
    });

    // Load all merchants
    const loadTenants = useCallback(async () => {
        try {
            setRefreshing(true);
            const data = await getAllTenants();
            setTenants(data);
        } catch (err) {
            console.error("Error loading tenants:", err);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    useEffect(() => {
        loadTenants();
    }, [loadTenants]);

    // Expiring subscriptions (<= 3 days)
    const expiringTenants = useMemo(() => {
        return checkExpiringSubscriptions(tenants);
    }, [tenants]);

    // KPI Metrics calculation
    const metrics = useMemo(() => {
        const total = tenants.length;
        const active = tenants.filter((t) => t.status === "active").length;
        const expiringSoon = expiringTenants.length;
        const totalRevenue = tenants.reduce((acc, t) => {
            const price = Number(t.subscription?.price) || 2500;
            return acc + price;
        }, 0);

        return {
            total,
            active,
            expiringSoon,
            totalRevenue,
            healthRate: total > 0 ? Math.round((active / total) * 100) : 100,
        };
    }, [tenants, expiringTenants]);

    // Filtered list
    const filteredTenants = useMemo(() => {
        return tenants.filter((tenant) => {
            const matchesSearch =
                (tenant.name || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
                (tenant.slug || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
                (tenant.ownerPhone || "").includes(searchQuery);

            if (!matchesSearch) return false;

            const days = calculateDaysRemaining(tenant.subscription?.endDate);

            if (statusFilter === "active") return tenant.status === "active" && days > 0;
            if (statusFilter === "expiring") return days <= 3 && days > 0;
            if (statusFilter === "expired") return days <= 0;
            if (statusFilter === "suspended") return tenant.status === "suspended";

            return true;
        });
    }, [tenants, searchQuery, statusFilter]);

    // Jump / Impersonate a merchant
    const handleImpersonate = (tenant) => {
        switchTenant(tenant.id || tenant.slug);
        navigate(`/${locale}/dashboard`);
    };

    // Send payment alert & record in Firestore
    const handleSendReminder = async (tenant) => {
        try {
            await recordPaymentReminderSent(tenant.id);
            const waUrl = generateWhatsAppReminderUrl(tenant);
            window.open(waUrl, "_blank");
            loadTenants();
        } catch (err) {
            console.error("Error sending reminder:", err);
        }
    };

    // Diagnostics runner
    const handleOpenDiagnostics = async (tenant) => {
        setSelectedTenantForDiag(tenant);
        setDiagLoading(true);
        setDiagReport(null);
        try {
            const report = await diagnoseTenant(tenant.id);
            setDiagReport(report);
        } catch (err) {
            console.error("Diag error:", err);
        } finally {
            setDiagLoading(false);
        }
    };

    // Auto-repair runner
    const handleRunAutoRepair = async (tenantId) => {
        setActionLoading(true);
        try {
            const res = await autoRepairTenant(tenantId);
            const report = await diagnoseTenant(tenantId);
            setDiagReport(report);
            loadTenants();
        } catch (err) {
            console.error("Auto repair error:", err);
        } finally {
            setActionLoading(false);
        }
    };

    // Toggle single module
    const handleToggleModule = async (moduleKey, currentValue) => {
        if (!selectedTenantForModules) return;
        setActionLoading(true);
        try {
            const updatedModules = {
                ...(selectedTenantForModules.modules || DEFAULT_MODULES),
                [moduleKey]: !currentValue,
            };
            await updateTenantModules(selectedTenantForModules.id, updatedModules);
            setSelectedTenantForModules((prev) => ({
                ...prev,
                modules: updatedModules,
            }));
            loadTenants();
        } catch (err) {
            console.error("Module update error:", err);
        } finally {
            setActionLoading(false);
        }
    };

    // Extend subscription
    const handleExtendSubscription = async (monthsToAdd) => {
        if (!selectedTenantForSub) return;
        setActionLoading(true);
        try {
            const currentEnd = selectedTenantForSub.subscription?.endDate
                ? new Date(selectedTenantForSub.subscription.endDate)
                : new Date();
            const baseDate = currentEnd.getTime() > Date.now() ? currentEnd : new Date();
            baseDate.setMonth(baseDate.getMonth() + Number(monthsToAdd));

            const updatedSub = {
                ...(selectedTenantForSub.subscription || {}),
                endDate: baseDate.toISOString(),
                status: "active",
            };

            await updateTenantSubscription(selectedTenantForSub.id, updatedSub);
            await updateTenantStatus(selectedTenantForSub.id, "active");
            setSelectedTenantForSub(null);
            loadTenants();
        } catch (err) {
            console.error("Subscription update error:", err);
        } finally {
            setActionLoading(false);
        }
    };

    // Create New Merchant
    const handleCreateMerchant = async (e) => {
        e.preventDefault();
        if (!newMerchant.name.trim() || !newMerchant.slug.trim()) return;

        setActionLoading(true);
        try {
            const safeSlug = newMerchant.slug.toLowerCase().trim().replace(/[^a-z0-9_-]/g, "-");
            const defaultData = createDefaultTenantData(safeSlug, newMerchant.name, safeSlug);

            const endDate = new Date();
            endDate.setMonth(endDate.getMonth() + Number(newMerchant.durationMonths || 1));

            const payload = {
                ...defaultData,
                ownerEmail: newMerchant.ownerEmail || "",
                ownerPhone: newMerchant.ownerPhone || "",
                subscription: {
                    ...defaultData.subscription,
                    plan: newMerchant.plan,
                    price: Number(newMerchant.price) || 2500,
                    endDate: endDate.toISOString(),
                },
            };

            await saveTenant(safeSlug, payload);
            await autoRepairTenant(safeSlug); // initializes landing page & verifies docs
            setShowAddModal(false);
            setNewMerchant({
                name: "",
                slug: "",
                ownerEmail: "",
                ownerPhone: "",
                plan: "pro",
                price: 2500,
                durationMonths: 1,
            });
            loadTenants();
        } catch (err) {
            console.error("Merchant create error:", err);
        } finally {
            setActionLoading(false);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-[#0d1117] flex flex-col items-center justify-center gap-3 text-white">
                <div className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                <p className="text-gray-400 text-sm">جاري تحميل بيانات منظومة منصة SEKKA...</p>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#0B0F19] text-gray-100 p-4 sm:p-6 lg:p-8 font-sans" dir="rtl">
            <div className="max-w-7xl mx-auto space-y-8">

                {/* =========================================================
                   HEADER: Platform Branding & Master Controls
                ========================================================= */}
                <header className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 pb-6 border-b border-gray-800">
                    <div>
                        <div className="flex items-center gap-3">
                            <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-400 flex items-center justify-center shadow-lg shadow-emerald-500/20 font-black text-white text-xl">
                                S
                            </div>
                            <div>
                                <div className="flex items-center gap-2">
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
                            onClick={loadTenants}
                            disabled={refreshing}
                            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-gray-800/80 hover:bg-gray-800 text-gray-300 hover:text-white border border-gray-700 transition text-sm cursor-pointer"
                        >
                            <FiRefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin text-emerald-400" : ""}`} />
                            <span>تحديث</span>
                        </button>

                        <button
                            onClick={() => setShowAddModal(true)}
                            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold transition shadow-lg shadow-emerald-600/25 text-sm cursor-pointer"
                        >
                            <FiPlus className="w-4 h-4" />
                            <span>إضافة تاجر جديد</span>
                        </button>
                    </div>
                </header>

                {/* =========================================================
                   KPI METRICS CARDS
                ========================================================= */}
                <section className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
                    <div className="p-4 rounded-2xl bg-gray-900/60 border border-gray-800/80 backdrop-blur-sm">
                        <div className="flex items-center justify-between text-gray-400 mb-2">
                            <span className="text-xs font-semibold">إجمالي المتاجر</span>
                            <FiUsers className="w-4 h-4 text-emerald-400" />
                        </div>
                        <div className="text-2xl sm:text-3xl font-black text-white">{metrics.total}</div>
                        <div className="text-xs text-gray-400 mt-1">تاجر مسجل بالنظام</div>
                    </div>

                    <div className="p-4 rounded-2xl bg-gray-900/60 border border-gray-800/80 backdrop-blur-sm">
                        <div className="flex items-center justify-between text-gray-400 mb-2">
                            <span className="text-xs font-semibold">الاشتراكات النشطة</span>
                            <FiCheckCircle className="w-4 h-4 text-teal-400" />
                        </div>
                        <div className="text-2xl sm:text-3xl font-black text-emerald-400">{metrics.active}</div>
                        <div className="text-xs text-gray-400 mt-1">حسابات تعمل بسلاسة</div>
                    </div>

                    <div className={`p-4 rounded-2xl bg-gray-900/60 border ${metrics.expiringSoon > 0 ? "border-amber-500/50 bg-amber-950/20" : "border-gray-800/80"} backdrop-blur-sm`}>
                        <div className="flex items-center justify-between text-gray-400 mb-2">
                            <span className="text-xs font-semibold">تنبيهات التجديد (≤ 3 أيام)</span>
                            <FiAlertTriangle className={`w-4 h-4 ${metrics.expiringSoon > 0 ? "text-amber-400 animate-pulse" : "text-gray-500"}`} />
                        </div>
                        <div className={`text-2xl sm:text-3xl font-black ${metrics.expiringSoon > 0 ? "text-amber-400" : "text-gray-300"}`}>
                            {metrics.expiringSoon}
                        </div>
                        <div className="text-xs text-amber-400/80 mt-1">بحاجة للتنبيه والتجديد</div>
                    </div>

                    <div className="p-4 rounded-2xl bg-gray-900/60 border border-gray-800/80 backdrop-blur-sm">
                        <div className="flex items-center justify-between text-gray-400 mb-2">
                            <span className="text-xs font-semibold">الإيراد الشهري (MRR)</span>
                            <FiDollarSign className="w-4 h-4 text-emerald-400" />
                        </div>
                        <div className="text-xl sm:text-2xl font-black text-white">
                            {metrics.totalRevenue.toLocaleString()} <span className="text-xs font-normal text-gray-400">ج.م</span>
                        </div>
                        <div className="text-xs text-gray-400 mt-1">قيمة الاشتراكات المقدرة</div>
                    </div>

                    <div className="col-span-2 md:col-span-4 lg:col-span-1 p-4 rounded-2xl bg-gray-900/60 border border-gray-800/80 backdrop-blur-sm">
                        <div className="flex items-center justify-between text-gray-400 mb-2">
                            <span className="text-xs font-semibold">استقرار المنظومة</span>
                            <FiActivity className="w-4 h-4 text-emerald-400" />
                        </div>
                        <div className="text-2xl sm:text-3xl font-black text-emerald-400">{metrics.healthRate}%</div>
                        <div className="text-xs text-emerald-500/80 mt-1">جاهزية وعزل سحابي</div>
                    </div>
                </section>

                {/* =========================================================
                   3-DAYS PAYMENT REMINDER ALERT CENTER
                ========================================================= */}
                {expiringTenants.length > 0 && (
                    <section className="p-5 rounded-2xl bg-gradient-to-r from-amber-950/40 via-yellow-950/20 to-amber-900/30 border border-amber-500/40 space-y-4">
                        <div className="flex items-center justify-between flex-wrap gap-2">
                            <div className="flex items-center gap-2.5">
                                <span className="p-2 rounded-xl bg-amber-500/20 text-amber-400">
                                    <FiAlertTriangle className="w-5 h-5 animate-bounce" />
                                </span>
                                <div>
                                    <h3 className="text-base font-bold text-amber-300">
                                        مركز التنبيهات الآلية بالدفع (تنتهي الاشتراكات خلال 3 أيام أو أقل)
                                    </h3>
                                    <p className="text-xs text-amber-200/80">
                                        يمكنك إرسال رسالة تذكير احترافية ومباشرة عبر الواتساب وتسجيل وقت التنبيه بضغطة زر واحدة.
                                    </p>
                                </div>
                            </div>
                            <span className="text-xs px-3 py-1 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 font-bold">
                                {expiringTenants.length} تاجر يستحق التنبيه
                            </span>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 pt-2">
                            {expiringTenants.map((t) => {
                                const days = calculateDaysRemaining(t.subscription?.endDate);
                                const isReminded = !!t.subscription?.lastReminderSentAt;

                                return (
                                    <div
                                        key={t.id}
                                        className="p-3.5 rounded-xl bg-gray-900/80 border border-amber-500/30 flex flex-col justify-between gap-3"
                                    >
                                        <div className="flex items-start justify-between">
                                            <div>
                                                <h4 className="font-bold text-white text-sm">{t.name}</h4>
                                                <p className="text-xs text-gray-400 font-mono">@{t.slug} • {t.ownerPhone || "بدون هاتف"}</p>
                                            </div>
                                            <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${days <= 0 ? "bg-red-500/20 text-red-400 border border-red-500/30" : "bg-amber-500/20 text-amber-300 border border-amber-500/30"}`}>
                                                {days <= 0 ? "منتهي اليوم" : `باقي ${days} أيام`}
                                            </span>
                                        </div>

                                        <div className="flex items-center justify-between pt-2 border-t border-gray-800 text-xs">
                                            <span className="text-gray-400">
                                                {isReminded ? `تم التنبيه: ${new Date(t.subscription.lastReminderSentAt).toLocaleDateString("ar-EG")}` : "لم يتم التنبيه بعد"}
                                            </span>

                                            <button
                                                onClick={() => handleSendReminder(t)}
                                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold transition shadow-sm cursor-pointer"
                                            >
                                                <FaWhatsapp className="w-3.5 h-3.5" />
                                                <span>إرسال تنبيه واتساب</span>
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </section>
                )}

                {/* =========================================================
                   MERCHANTS DIRECTORY TABLE & SEARCH
                ========================================================= */}
                <section className="bg-gray-900/50 rounded-2xl border border-gray-800 p-5 space-y-4">
                    {/* Filters & Search Row */}
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                        <div className="relative flex-1 max-w-md">
                            <FiSearch className="absolute start-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder="ابحث باسم المتجر أو الرابط المختصر أو الهاتف..."
                                className="w-full bg-gray-800/80 border border-gray-700/80 rounded-xl ps-10 pe-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-emerald-500 transition"
                            />
                        </div>

                        {/* Status Filters */}
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
                                    onClick={() => setStatusFilter(tab.key)}
                                    className={`px-3 py-1.5 rounded-lg transition font-medium cursor-pointer ${
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

                    {/* Table */}
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
                                        const days = calculateDaysRemaining(tenant.subscription?.endDate);
                                        const isExpiring = days <= 3 && days > 0;
                                        const isExpired = days <= 0;
                                        const modules = tenant.modules || DEFAULT_MODULES;
                                        const activeModulesCount = Object.values(modules).filter(Boolean).length;

                                        return (
                                            <tr
                                                key={tenant.id}
                                                className="hover:bg-gray-800/30 transition group"
                                            >
                                                {/* Merchant name & slug */}
                                                <td className="px-4 py-4">
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500/20 to-teal-500/10 border border-emerald-500/30 flex items-center justify-center font-bold text-emerald-400 text-sm">
                                                            {tenant.name?.charAt(0) || "T"}
                                                        </div>
                                                        <div>
                                                            <div className="font-bold text-white group-hover:text-emerald-400 transition flex items-center gap-1.5">
                                                                <span>{tenant.name}</span>
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

                                                {/* Contact */}
                                                <td className="px-4 py-4 text-xs">
                                                    <div className="text-gray-300 font-medium">{tenant.ownerPhone || "—"}</div>
                                                    <div className="text-gray-500 truncate max-w-[160px]">{tenant.ownerEmail || "—"}</div>
                                                </td>

                                                {/* Plan & Price */}
                                                <td className="px-4 py-4">
                                                    <span className="inline-block px-2.5 py-1 rounded-lg text-xs font-bold uppercase bg-gray-800 text-emerald-400 border border-emerald-500/20">
                                                        {tenant.subscription?.plan || "Pro"}
                                                    </span>
                                                    <div className="text-xs text-gray-400 mt-1">
                                                        {tenant.subscription?.price || 2500} ج.م / شهر
                                                    </div>
                                                </td>

                                                {/* Subscription & Days remaining */}
                                                <td className="px-4 py-4">
                                                    <div className="flex items-center gap-2">
                                                        <span
                                                            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold ${
                                                                isExpired
                                                                    ? "bg-red-500/20 text-red-400 border border-red-500/30"
                                                                    : isExpiring
                                                                    ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                                                                    : "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                                                            }`}
                                                        >
                                                            {isExpired
                                                                ? "منتهي"
                                                                : isExpiring
                                                                ? `متبقي ${days} أيام`
                                                                : `متبقي ${days} يوم`}
                                                        </span>
                                                    </div>
                                                    <div className="text-xs text-gray-500 mt-1">
                                                        ينتهي: {tenant.subscription?.endDate ? new Date(tenant.subscription.endDate).toLocaleDateString("ar-EG") : "—"}
                                                    </div>
                                                </td>

                                                {/* Modules */}
                                                <td className="px-4 py-4">
                                                    <button
                                                        onClick={() => setSelectedTenantForModules(tenant)}
                                                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-gray-800/90 hover:bg-gray-700 text-gray-300 text-xs border border-gray-700 transition cursor-pointer"
                                                    >
                                                        <FiSettings className="w-3.5 h-3.5 text-emerald-400" />
                                                        <span>{activeModulesCount} من 6 مفعلة</span>
                                                    </button>
                                                </td>

                                                {/* Actions */}
                                                <td className="px-4 py-4 text-center">
                                                    <div className="inline-flex items-center gap-1.5">
                                                        {/* 1. Fast Impersonation / Jump */}
                                                        <button
                                                            onClick={() => handleImpersonate(tenant)}
                                                            title="الانتقال لداشبورد هذا التاجر والعمل كمسؤول له"
                                                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-600/90 hover:bg-emerald-600 text-white font-bold text-xs transition shadow-sm cursor-pointer"
                                                        >
                                                            <span>دخول كتاجر</span>
                                                            <FiExternalLink className="w-3 h-3" />
                                                        </button>

                                                        {/* 2. Extend Subscription */}
                                                        <button
                                                            onClick={() => setSelectedTenantForSub(tenant)}
                                                            title="تجديد أو تعديل مدة الاشتراك"
                                                            className="p-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white border border-gray-700 transition cursor-pointer"
                                                        >
                                                            <FiCalendar className="w-4 h-4 text-amber-400" />
                                                        </button>

                                                        {/* 3. WhatsApp Payment Reminder */}
                                                        <button
                                                            onClick={() => handleSendReminder(tenant)}
                                                            title="إرسال تنبيه بالدفع عبر واتساب"
                                                            className="p-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white border border-gray-700 transition cursor-pointer"
                                                        >
                                                            <FaWhatsapp className="w-4 h-4 text-emerald-400" />
                                                        </button>

                                                        {/* 4. Diagnostics & Auto-Repair */}
                                                        <button
                                                            onClick={() => handleOpenDiagnostics(tenant)}
                                                            title="فحص وحل أي مشكلة في بيانات المتجر"
                                                            className="p-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white border border-gray-700 transition cursor-pointer"
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

            {/* =========================================================
               MODAL 1: ADD NEW MERCHANT
            ========================================================= */}
            {showAddModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
                    <div className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-lg p-6 shadow-2xl relative">
                        <button
                            onClick={() => setShowAddModal(false)}
                            className="absolute start-4 top-4 text-gray-400 hover:text-white cursor-pointer"
                        >
                            <FiX className="w-5 h-5" />
                        </button>

                        <h3 className="text-xl font-bold text-white mb-1">إضافة متجر جديد لمنصة SEKKA</h3>
                        <p className="text-xs text-gray-400 mb-5">
                            سيتم إنشاء مسار منفصل للمتجر وتهيئة صفحة الهبوط وعزله بالكامل في قاعدة البيانات.
                        </p>

                        <form onSubmit={handleCreateMerchant} className="space-y-4">
                            <div>
                                <label className="block text-xs font-semibold text-gray-300 mb-1">اسم المتجر / الشركة</label>
                                <input
                                    type="text"
                                    required
                                    placeholder="مثال: الفارس لليموزين وتأجير السيارات"
                                    value={newMerchant.name}
                                    onChange={(e) => setNewMerchant({ ...newMerchant, name: e.target.value })}
                                    className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-semibold text-gray-300 mb-1">
                                    المعرّف الإنجليزي (Slug / ID)
                                </label>
                                <input
                                    type="text"
                                    required
                                    placeholder="al-faris"
                                    value={newMerchant.slug}
                                    onChange={(e) => setNewMerchant({ ...newMerchant, slug: e.target.value })}
                                    className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3.5 py-2 text-sm text-white font-mono focus:outline-none focus:border-emerald-500"
                                />
                                <span className="text-[11px] text-gray-500 mt-1 block">يستخدم كـ subdomain ولعزل بيانات التاجر (حروف إنجليزية وأرقام فقط)</span>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs font-semibold text-gray-300 mb-1">هاتف المالك / الواتساب</label>
                                    <input
                                        type="tel"
                                        placeholder="010XXXXXXXX"
                                        value={newMerchant.ownerPhone}
                                        onChange={(e) => setNewMerchant({ ...newMerchant, ownerPhone: e.target.value })}
                                        className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-gray-300 mb-1">البريد الإلكتروني</label>
                                    <input
                                        type="email"
                                        placeholder="owner@domain.com"
                                        value={newMerchant.ownerEmail}
                                        onChange={(e) => setNewMerchant({ ...newMerchant, ownerEmail: e.target.value })}
                                        className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-3 gap-3">
                                <div>
                                    <label className="block text-xs font-semibold text-gray-300 mb-1">نوع الباقة</label>
                                    <select
                                        value={newMerchant.plan}
                                        onChange={(e) => setNewMerchant({ ...newMerchant, plan: e.target.value })}
                                        className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
                                    >
                                        <option value="starter">Starter</option>
                                        <option value="pro">Pro (احترافي)</option>
                                        <option value="enterprise">Enterprise</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-gray-300 mb-1">المدة (أشهر)</label>
                                    <input
                                        type="number"
                                        min="1"
                                        max="36"
                                        value={newMerchant.durationMonths}
                                        onChange={(e) => setNewMerchant({ ...newMerchant, durationMonths: e.target.value })}
                                        className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-gray-300 mb-1">السعر الشهري (ج.م)</label>
                                    <input
                                        type="number"
                                        value={newMerchant.price}
                                        onChange={(e) => setNewMerchant({ ...newMerchant, price: e.target.value })}
                                        className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
                                    />
                                </div>
                            </div>

                            <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-800">
                                <button
                                    type="button"
                                    onClick={() => setShowAddModal(false)}
                                    className="px-4 py-2 rounded-xl bg-gray-800 text-gray-300 hover:text-white text-sm"
                                >
                                    إلغاء
                                </button>
                                <button
                                    type="submit"
                                    disabled={actionLoading}
                                    className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm shadow-lg shadow-emerald-600/30 cursor-pointer"
                                >
                                    {actionLoading ? "جاري الإنشاء..." : "إنشاء وتفعيل المتجر"}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* =========================================================
               MODAL 2: MODULES / FEATURE FLAGS
            ========================================================= */}
            {selectedTenantForModules && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
                    <div className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-md p-6 shadow-2xl relative">
                        <button
                            onClick={() => setSelectedTenantForModules(null)}
                            className="absolute start-4 top-4 text-gray-400 hover:text-white cursor-pointer"
                        >
                            <FiX className="w-5 h-5" />
                        </button>

                        <h3 className="text-lg font-bold text-white mb-1">
                            التحكم في الموديولات: {selectedTenantForModules.name}
                        </h3>
                        <p className="text-xs text-gray-400 mb-5">
                            يمكنك تفعيل أو قفل أي موديول لهذا التاجر حسب باقة اشتراكه.
                        </p>

                        <div className="space-y-3">
                            {[
                                { key: "editLanding", title: "محرر صفحة الهبوط (Edit Landing)", desc: "تمكين التاجر من تعديل نصوص وصور موقعه" },
                                { key: "fleet", title: "أسطول السيارات (Fleet)", desc: "إضافة وتعديل السيارات والأسعار" },
                                { key: "wallet", title: "المحفظة والمدفوعات (Wallet)", desc: "إدارة الحركات المالية والأرصدة" },
                                { key: "reports", title: "التقارير المتقدمة (Reports)", desc: "عرض إحصائيات الرحلات والأداء" },
                                { key: "users", title: "إدارة الموظفين والسائقين (Users)", desc: "صلاحيات المشرفين والسائقين" },
                                { key: "customDomain", title: "ربط دومين مخصص (Custom Domain)", desc: "توجيه المتجر على دومين خارجي خاص" },
                            ].map((mod) => {
                                const isEnabled = selectedTenantForModules.modules?.[mod.key] !== false;

                                return (
                                    <div
                                        key={mod.key}
                                        className="p-3 rounded-xl bg-gray-800/60 border border-gray-700/60 flex items-center justify-between gap-3"
                                    >
                                        <div>
                                            <div className="font-bold text-sm text-white flex items-center gap-1.5">
                                                {isEnabled ? <FiUnlock className="text-emerald-400 w-3.5 h-3.5" /> : <FiLock className="text-red-400 w-3.5 h-3.5" />}
                                                <span>{mod.title}</span>
                                            </div>
                                            <p className="text-xs text-gray-400 mt-0.5">{mod.desc}</p>
                                        </div>

                                        <button
                                            type="button"
                                            disabled={actionLoading}
                                            onClick={() => handleToggleModule(mod.key, isEnabled)}
                                            className={`px-3 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                                                isEnabled
                                                    ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/30"
                                                    : "bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30"
                                            }`}
                                        >
                                            {isEnabled ? "مفعّل" : "معطّل"}
                                        </button>
                                    </div>
                                );
                            })}
                        </div>

                        <div className="mt-6 pt-4 border-t border-gray-800 flex justify-end">
                            <button
                                onClick={() => setSelectedTenantForModules(null)}
                                className="px-4 py-2 rounded-xl bg-gray-800 hover:bg-gray-700 text-white text-sm font-semibold cursor-pointer"
                            >
                                إغلاق
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* =========================================================
               MODAL 3: SUBSCRIPTION EXTENSION & PLAN
            ========================================================= */}
            {selectedTenantForSub && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
                    <div className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-md p-6 shadow-2xl relative">
                        <button
                            onClick={() => setSelectedTenantForSub(null)}
                            className="absolute start-4 top-4 text-gray-400 hover:text-white cursor-pointer"
                        >
                            <FiX className="w-5 h-5" />
                        </button>

                        <h3 className="text-lg font-bold text-white mb-1">
                            إدارة اشتراك: {selectedTenantForSub.name}
                        </h3>
                        <p className="text-xs text-gray-400 mb-5">
                            تمديد مدة الاشتراك وتحديث حالة حساب التاجر.
                        </p>

                        <div className="p-3.5 rounded-xl bg-gray-800/60 border border-gray-700 mb-5 text-xs space-y-1.5">
                            <div className="flex justify-between text-gray-300">
                                <span>الباقة الحالية:</span>
                                <strong className="text-emerald-400 font-bold uppercase">{selectedTenantForSub.subscription?.plan || "Pro"}</strong>
                            </div>
                            <div className="flex justify-between text-gray-300">
                                <span>تاريخ الانتهاء الحالي:</span>
                                <strong>
                                    {selectedTenantForSub.subscription?.endDate
                                        ? new Date(selectedTenantForSub.subscription.endDate).toLocaleDateString("ar-EG")
                                        : "غير محدد"}
                                </strong>
                            </div>
                            <div className="flex justify-between text-gray-300">
                                <span>الأيام المتبقية:</span>
                                <strong className="text-amber-400 font-bold">
                                    {calculateDaysRemaining(selectedTenantForSub.subscription?.endDate)} يوم
                                </strong>
                            </div>
                        </div>

                        <label className="block text-xs font-semibold text-gray-300 mb-2">تمديد الاشتراك لـ:</label>
                        <div className="grid grid-cols-3 gap-2.5 mb-5">
                            <button
                                onClick={() => handleExtendSubscription(1)}
                                disabled={actionLoading}
                                className="p-3 rounded-xl bg-gray-800 hover:bg-emerald-600/20 hover:border-emerald-500/50 border border-gray-700 text-center transition cursor-pointer"
                            >
                                <div className="font-bold text-sm text-white">+ شهر</div>
                                <div className="text-[11px] text-gray-400">30 يوم</div>
                            </button>
                            <button
                                onClick={() => handleExtendSubscription(3)}
                                disabled={actionLoading}
                                className="p-3 rounded-xl bg-gray-800 hover:bg-emerald-600/20 hover:border-emerald-500/50 border border-gray-700 text-center transition cursor-pointer"
                            >
                                <div className="font-bold text-sm text-white">+ 3 أشهر</div>
                                <div className="text-[11px] text-gray-400">ربع سنوي</div>
                            </button>
                            <button
                                onClick={() => handleExtendSubscription(12)}
                                disabled={actionLoading}
                                className="p-3 rounded-xl bg-gray-800 hover:bg-emerald-600/20 hover:border-emerald-500/50 border border-gray-700 text-center transition cursor-pointer"
                            >
                                <div className="font-bold text-sm text-white">+ سنة كاملة</div>
                                <div className="text-[11px] text-gray-400">12 شهر</div>
                            </button>
                        </div>

                        <div className="flex justify-between items-center pt-4 border-t border-gray-800 text-xs">
                            <button
                                onClick={async () => {
                                    const nextStatus = selectedTenantForSub.status === "active" ? "suspended" : "active";
                                    await updateTenantStatus(selectedTenantForSub.id, nextStatus);
                                    setSelectedTenantForSub(null);
                                    loadTenants();
                                }}
                                className={`px-3 py-1.5 rounded-lg font-bold border transition cursor-pointer ${
                                    selectedTenantForSub.status === "active"
                                        ? "bg-red-500/20 text-red-400 border-red-500/30 hover:bg-red-500/30"
                                        : "bg-emerald-500/20 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/30"
                                }`}
                            >
                                {selectedTenantForSub.status === "active" ? "تعليق حساب المتجر" : "تنشيط حساب المتجر"}
                            </button>

                            <button
                                onClick={() => setSelectedTenantForSub(null)}
                                className="px-4 py-2 rounded-xl bg-gray-800 text-gray-300 hover:text-white"
                            >
                                إلغاء
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* =========================================================
               MODAL 4: DIAGNOSTICS & 1-CLICK AUTO-REPAIR
            ========================================================= */}
            {selectedTenantForDiag && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
                    <div className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-lg p-6 shadow-2xl relative">
                        <button
                            onClick={() => setSelectedTenantForDiag(null)}
                            className="absolute start-4 top-4 text-gray-400 hover:text-white cursor-pointer"
                        >
                            <FiX className="w-5 h-5" />
                        </button>

                        <div className="flex items-center gap-2 mb-1">
                            <FiTool className="w-5 h-5 text-cyan-400" />
                            <h3 className="text-lg font-bold text-white">
                                تشخيص وإصلاح: {selectedTenantForDiag.name}
                            </h3>
                        </div>
                        <p className="text-xs text-gray-400 mb-5">
                            فحص سلامة المستندات في Firestore، توافق اللاندينج باج، وحل المشاكل تلقائياً.
                        </p>

                        {diagLoading ? (
                            <div className="p-8 text-center text-gray-400 text-xs">
                                <div className="w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                                جاري فحص سجلات وقواعد بيانات التاجر...
                            </div>
                        ) : diagReport ? (
                            <div className="space-y-4">
                                <div className="p-3.5 rounded-xl bg-gray-800/80 border border-gray-700/80 space-y-2 text-xs">
                                    <div className="flex justify-between items-center">
                                        <span className="text-gray-400">سجل التاجر في Firestore:</span>
                                        <span className={diagReport.existsInFirestore ? "text-emerald-400 font-bold" : "text-red-400 font-bold"}>
                                            {diagReport.existsInFirestore ? "موجود وسليم" : "غير موجود"}
                                        </span>
                                    </div>
                                    <div className="flex justify-between items-center">
                                        <span className="text-gray-400">إعدادات اللاندينج باج (Landing):</span>
                                        <span className={diagReport.landingConfigured ? "text-emerald-400 font-bold" : "text-amber-400 font-bold"}>
                                            {diagReport.landingConfigured ? "مهيأة بالمسار المخصص" : "غير مهيأة"}
                                        </span>
                                    </div>
                                    <div className="flex justify-between items-center">
                                        <span className="text-gray-400">حالة الاشتراك:</span>
                                        <span className="text-emerald-400 font-bold">
                                            {diagReport.subscriptionStatus} ({diagReport.daysRemaining} يوم متبقي)
                                        </span>
                                    </div>
                                </div>

                                {diagReport.issues?.length > 0 && (
                                    <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs space-y-1">
                                        <strong className="text-amber-400 block font-bold mb-1">ملاحظات الفحص:</strong>
                                        {diagReport.issues.map((issue, idx) => (
                                            <div key={idx} className="text-amber-200/90">• {issue}</div>
                                        ))}
                                    </div>
                                )}

                                <div className="pt-3 border-t border-gray-800 flex items-center justify-between">
                                    <button
                                        onClick={() => handleRunAutoRepair(selectedTenantForDiag.id)}
                                        disabled={actionLoading}
                                        className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs shadow-lg shadow-cyan-600/25 transition cursor-pointer"
                                    >
                                        <FiRefreshCw className={`w-3.5 h-3.5 ${actionLoading ? "animate-spin" : ""}`} />
                                        <span>إصلاح ومزامنة تلقائية بضغطة زر</span>
                                    </button>

                                    <button
                                        onClick={() => setSelectedTenantForDiag(null)}
                                        className="px-4 py-2 rounded-xl bg-gray-800 text-gray-300 hover:text-white text-xs cursor-pointer"
                                    >
                                        إغلاق
                                    </button>
                                </div>
                            </div>
                        ) : null}
                    </div>
                </div>
            )}
        </div>
    );
}

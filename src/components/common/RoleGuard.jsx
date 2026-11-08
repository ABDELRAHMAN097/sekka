
import {
    Navigate,
    Outlet,
    useLocation,
    useParams,
} from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { toast } from "react-toastify";
import { useEffect, useRef } from "react";

const ROLE_LABELS = {
    super_admin: "سوبر أدمن",
    platform_admin: "مسؤول المنصة",
    platform_staff: "فريق المنصة",
    business_owner: "صاحب النشاط",
    admin: "مسؤول النشاط",
    staff: "موظف النشاط",
    worker: "عامل النشاط",
    driver: "سائق",
    customer: "عميل",
};

const STATUS_MESSAGES = {
    pending: "حسابك قيد المراجعة، وسيتم تفعيل الحساب بعد موافقة إدارة منصة سِكّة.",
    blocked: "تم إيقاف حسابك. يرجى التواصل مع إدارة منصة سِكّة.",
    suspended: "حسابك موقوف مؤقتًا. يرجى التواصل مع إدارة منصة سِكّة.",
    inactive: "حسابك غير مفعّل حاليًا. يرجى التواصل مع إدارة منصة سِكّة.",
};

export default function RoleGuard({
    allowedRoles = [],
    redirectPath = "",
}) {
    const {
        user,
        profile,
        role,
        canAccessDashboard,
        hasRole,
        loading,
    } = useAuth();

    const { locale = "ar" } = useParams();
    const location = useLocation();
    const hasWarnedRef = useRef(false);

    const accountStatus = String(
        profile?.status || "active"
    ).toLowerCase().trim();

    const normalizedRole = String(
        role || profile?.role || ""
    ).toLowerCase().trim();

    const isCustomer = normalizedRole === "customer";

    const isAccountActive = accountStatus === "active";

    const isAllowed =
        Boolean(user) &&
        isAccountActive &&
        (
            allowedRoles.length === 0
                ? Boolean(canAccessDashboard)
                : hasRole(allowedRoles)
        );

    const redirectTo = redirectPath || `/${locale}`;

    useEffect(() => {
        if (loading || !user || isAllowed || hasWarnedRef.current) {
            return;
        }

        if (accountStatus !== "active") {
            toast.warn(
                STATUS_MESSAGES[accountStatus] ||
                "حسابك غير متاح حاليًا."
            );
        } else if (isCustomer) {
            toast.warn(
                "حساب العميل لا يملك صلاحية دخول لوحة التحكم."
            );
        } else {
            toast.warn(
                "عذراً، لا تملك صلاحية الوصول إلى هذه الصفحة."
            );
        }

        hasWarnedRef.current = true;
    }, [
        loading,
        user,
        isAllowed,
        accountStatus,
        isCustomer,
    ]);

    useEffect(() => {
        if (!user || isAllowed) {
            hasWarnedRef.current = false;
        }
    }, [user, isAllowed]);

    if (loading) {
        return (
            <div className="min-h-screen bg-[#0B0C10] flex flex-col items-center justify-center gap-3 text-white">
                <div className="w-12 h-12 border-4 border-[#10B981] border-t-transparent rounded-full animate-spin" />
                <p className="text-[#9CA3AF] text-sm">
                    جاري التحقق من الصلاحيات والأمان...
                </p>
            </div>
        );
    }

    if (!user) {
        return (
            <Navigate
                to={`/${locale}/login`}
                state={{ from: location }}
                replace
            />
        );
    }

    if (!isAccountActive || isCustomer || !canAccessDashboard) {
        return (
            <Navigate
                to={redirectTo}
                replace
            />
        );
    }

    if (!isAllowed) {
        return (
            <div className="min-h-[70vh] flex flex-col items-center justify-center text-center p-6 bg-white rounded-2xl shadow-sm my-6 mx-2">
                <div className="w-16 h-16 rounded-2xl bg-red-100 flex items-center justify-center text-red-600 mb-4">
                    <span className="text-3xl font-bold">🚫</span>
                </div>

                <h2 className="text-2xl font-bold text-gray-900 mb-2">
                    غير مصرح لك بالوصول (403)
                </h2>

                <p className="text-gray-500 max-w-md mb-6 text-sm">
                    رتبتك الحالية (
                    {ROLE_LABELS[normalizedRole] || normalizedRole || "غير محدد"}
                    ) لا تملك صلاحية الوصول إلى هذه الصفحة.
                </p>

                <a
                    href={`/${locale}/dashboard`}
                    className="px-6 py-2.5 bg-primary-color hover:bg-primary-hover text-white rounded-xl font-medium transition shadow-sm"
                >
                    العودة للداشبورد
                </a>
            </div>
        );
    }

    return <Outlet />;
}

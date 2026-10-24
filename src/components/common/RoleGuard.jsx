
import { Navigate, Outlet, useLocation, useParams } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { toast } from "react-toastify";
import { useEffect, useRef } from "react";

const ROLE_LABELS = {
    platform_admin: "مسؤول المنصة",
    tenant_owner: "مالك النشاط",
    tenant_admin: "مسؤول النشاط",
    driver: "سائق",
    customer: "عميل",
    admin: "أدمن قديم",
    super_admin: "مسؤول قديم",
};

export default function RoleGuard({
    allowedRoles = [],
    redirectPath = "",
}) {
    const {
        user,
        role,
        isCustomer,
        isPlatformAdmin,
        loading,
    } = useAuth();

    const { locale = "ar" } = useParams();
    const location = useLocation();
    const hasWarnedRef = useRef(false);

    const isAllowed =
        Boolean(user) &&
        (
            isPlatformAdmin ||
            allowedRoles.length === 0 ||
            allowedRoles.includes(role)
        );

    useEffect(() => {
        if (
            !loading &&
            user &&
            isCustomer &&
            !isAllowed &&
            !hasWarnedRef.current
        ) {
            toast.warn(
                "عذراً، حساب العميل لا يملك صلاحية دخول لوحة التحكم."
            );
            hasWarnedRef.current = true;
        }

        if (!user || !isCustomer) {
            hasWarnedRef.current = false;
        }
    }, [loading, user, isCustomer, isAllowed]);

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

    if (isCustomer && !isAllowed) {
        return (
            <Navigate
                to={redirectPath || `/${locale}`}
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
                    {ROLE_LABELS[role] || role || "غير محدد"}
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

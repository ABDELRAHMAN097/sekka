
import { Outlet } from "react-router-dom";
import { useTenant } from "@/context/TenantContext";
import { useAuth } from "@/context/AuthContext";
import { FiLock } from "react-icons/fi";

export default function ModuleGuard({ moduleKey, children }) {
    const { isModuleEnabled, tenantName, tenantId, loadingTenant } = useTenant();
    const { isPlatformAdmin, isSuperAdmin, loading: authLoading } = useAuth();

    // 1. Wait for auth state to finish loading before evaluating permissions
    if (authLoading) {
        return (
            <div className="min-h-[60vh] flex flex-col items-center justify-center p-6 text-center">
                <div className="w-10 h-10 border-4 border-primary-color border-t-transparent rounded-full animate-spin mb-3" />
                <p className="text-gray-400 text-sm">جاري التحقق من الصلاحيات...</p>
            </div>
        );
    }

    // 2. Platform Admins and Super Admins ALWAYS have full access to all platform modules
    if (isPlatformAdmin || isSuperAdmin) {
        return children || <Outlet />;
    }

    // 3. In platform-level mode (no tenant specified), modules are not locked by merchant plan limits
    if (!tenantId) {
        return children || <Outlet />;
    }

    // 4. Wait for tenant data to load before deciding to lock
    if (loadingTenant) {
        return (
            <div className="min-h-[60vh] flex flex-col items-center justify-center p-6 text-center">
                <div className="w-10 h-10 border-4 border-primary-color border-t-transparent rounded-full animate-spin mb-3" />
                <p className="text-gray-400 text-sm">جاري التحقق من باقة النشاط...</p>
            </div>
        );
    }

    // 5. Merchant plan restriction
    if (!moduleKey || !isModuleEnabled(moduleKey)) {
        return (
            <div className="min-h-[60vh] flex flex-col items-center justify-center p-6 text-center">
                <div className="max-w-md p-8 rounded-2xl bg-card border border-border shadow-sm">
                    <div className="w-16 h-16 rounded-2xl bg-amber-500/10 text-amber-500 flex items-center justify-center mx-auto mb-4 text-3xl font-bold">
                        <FiLock className="w-8 h-8" />
                    </div>

                    <h3 className="text-xl font-bold text-primary-color mb-2">
                        هذا الموديول غير مفعّل في باقتكم
                    </h3>

                    <p className="text-gray-400 text-sm mb-6 leading-relaxed">
                        {moduleKey
                            ? `موديول (${moduleKey}) غير متاح حالياً ضمن خطة نشاط (${tenantName || "الحالي"}). يرجى التواصل مع إدارة منصة SEKKA - سِكّة لتفعيل الموديول.`
                            : "لم يتم تحديد الموديول المطلوب لهذه الصفحة. يرجى مراجعة إعدادات المسارات."}
                    </p>

                    <a
                        href="https://wa.me/201012345678"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center justify-center px-5 py-2.5 rounded-xl bg-primary-color hover:bg-primary-hover text-white text-sm font-bold transition shadow-sm"
                    >
                        طلب تفعيل الموديول
                    </a>
                </div>
            </div>
        );
    }

    return children || <Outlet />;
}

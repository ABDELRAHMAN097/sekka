
import { Outlet } from "react-router-dom";
import { useTenant } from "@/context/TenantContext";
import { useAuth } from "@/context/AuthContext";
import { FiLock } from "react-icons/fi";

export default function ModuleGuard({ moduleKey, children }) {
    const { isModuleEnabled, tenantName, isImpersonating } = useTenant();
    const { isPlatformAdmin } = useAuth();

    const canBypassModuleGuard = isPlatformAdmin && !isImpersonating;

    if (canBypassModuleGuard) {
        return children || <Outlet />;
    }

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

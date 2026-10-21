import { Outlet } from "react-router-dom";
import { useTenant } from "@/context/TenantContext";
import { useAuth } from "@/context/AuthContext";
import { FiLock } from "react-icons/fi";

/**
 * Guards routes based on active tenant's enabled modules.
 * Super Admins bypass module restrictions.
 */
export default function ModuleGuard({ moduleKey, children }) {
    const { isModuleEnabled, tenantName, isImpersonating } = useTenant();
    const { isSuperAdmin } = useAuth();

    // Allow super admin to bypass unless specifically evaluating customer view
    if (isSuperAdmin && !isImpersonating) {
        return children || <Outlet />;
    }

    if (!isModuleEnabled(moduleKey)) {
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
                        موديول ({moduleKey}) غير متاح حالياً ضمن خطة متجر ({tenantName}). يرجى التواصل مع إدارة منصة SEKKA - سِكّة لترقية الباقة وتفعيل الموديول فوراً.
                    </p>
                    <a
                        href="https://wa.me/201012345678"
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center justify-center px-5 py-2.5 rounded-xl bg-primary-color hover:bg-primary-hover text-white text-sm font-bold transition shadow-sm"
                    >
                        طلب ترقية الباقة عبر الدعم الفني
                    </a>
                </div>
            </div>
        );
    }

    return children || <Outlet />;
}

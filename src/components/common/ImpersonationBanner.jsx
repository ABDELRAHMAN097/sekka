import { useTenant } from "@/context/TenantContext";
import { useNavigate, useParams } from "react-router-dom";
import { FiAlertCircle, FiArrowRight, FiShield } from "react-icons/fi";

export default function ImpersonationBanner() {
    const { isImpersonating, tenantName, tenantId, exitImpersonation, daysRemaining } = useTenant();
    const navigate = useNavigate();
    const { locale = "ar" } = useParams();

    if (!isImpersonating) return null;

    const handleExit = () => {
        exitImpersonation();
        navigate(`/${locale}/sekka-admin`);
    };

    return (
        <aside
            aria-label="Super Admin Impersonation Notice"
            className="w-full bg-gradient-to-r from-amber-600 via-yellow-600 to-amber-700 text-white px-4 py-2.5 shadow-md border-b border-amber-400/40 relative z-50"
        >
            <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3 text-xs sm:text-sm">
                <div className="flex items-center gap-2.5">
                    <span className="p-1.5 rounded-lg bg-black/20 text-amber-200">
                        <FiShield className="w-4 h-4 animate-pulse" />
                    </span>
                    <div>
                        <span className="font-bold">وضع المشرف العام (منصة SEKKA): </span>
                        <span>أنت تتصفح حالياً داشبورد التاجر </span>
                        <strong className="underline underline-offset-2 font-black text-amber-100">
                            {tenantName}
                        </strong>
                        <span className="text-amber-200 ms-1 font-mono">[{tenantId}]</span>
                        {daysRemaining <= 3 && (
                            <span className="ms-2 px-2 py-0.5 rounded-full bg-red-600 text-white font-bold text-xs animate-bounce inline-block">
                                تنبيه: ينتهي الاشتراك خلال {daysRemaining > 0 ? `${daysRemaining} أيام` : "فترة وجيزة"}
                            </span>
                        )}
                    </div>
                </div>

                <button
                    onClick={handleExit}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-black/30 hover:bg-black/50 text-white font-semibold transition border border-white/20 shadow-sm cursor-pointer"
                >
                    <span>العودة للوحة تحكم سِكّة</span>
                    <FiArrowRight className="w-3.5 h-3.5 rtl:rotate-180" />
                </button>
            </div>
        </aside>
    );
}



import { Outlet, useLocation, useParams } from "react-router-dom";
import { useEffect, useState } from "react";
import Sidebar from "../components/Sidebar";
import TopNavbar from "../components/TopNavbar";
import { pageTitles } from "../components/sidebarData";
import { useI18n } from "@/i18n/i18n/context";
import ImpersonationBanner from "@/components/common/ImpersonationBanner";
import { useTenant } from "@/context/TenantContext";

export default function DashboardLayout({ children }) {
    const location = useLocation();
    const { locale } = useParams();
    const { t } = useI18n();
    const { isExpiringSoon, isExpired, daysRemaining, isImpersonating } = useTenant();

    const currentPage = location.pathname.split("/").pop();

    const currentTitle =
        t(`pages.${currentPage}`) ||
        t(currentPage) ||
        pageTitles[`/${currentPage}`]?.[locale] ||
        pageTitles["/dashboard"]?.[locale] ||
        "Dashboard";

    const [isSidebarOpen, setIsSidebarOpen] = useState(
        window.innerWidth >= 1024
    );

    useEffect(() => {
        const handleResize = () => {
            setIsSidebarOpen(window.innerWidth >= 1024);
        };

        window.addEventListener("resize", handleResize);

        return () => {
            window.removeEventListener("resize", handleResize);
        };
    }, []);

    return (
        <div className="min-h-screen w-full flex flex-col">
            <ImpersonationBanner />

            <div className="flex-1 w-full flex">
                {isSidebarOpen && (
                    <div
                        className="fixed inset-0 z-40 bg-black/40 lg:hidden"
                        onClick={() => setIsSidebarOpen(false)}
                    />
                )}

                <Sidebar
                    isOpen={isSidebarOpen}
                    setIsOpen={setIsSidebarOpen}
                />

                <div
                    className={`flex-1 min-w-0 min-h-screen flex flex-col transition-all duration-300 ${
                        isSidebarOpen ? "lg:ms-[270px]" : "lg:ms-[20px]"
                    }`}
                >
                    <TopNavbar
                        onMenuClick={() => setIsSidebarOpen(!isSidebarOpen)}
                    />

                    {/* Merchant Expiry Alert (Only for merchants, not super admin impersonating) */}
                    {(isExpiringSoon || isExpired) && !isImpersonating && (
                        <div className="mx-2 mt-3 p-3 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-300 text-xs flex items-center justify-between gap-2">
                            <span>
                                ⚠️ تنبيه: اشتراك باقتكم في منصة SEKKA ينتهي خلال {daysRemaining > 0 ? `${daysRemaining} أيام` : "فترة وجيزة"}. يرجى التجديد لضمان استمرار عمل المتجر بدون انقطاع.
                            </span>
                            <a
                                href="https://wa.me/201023671214"
                                target="_blank"
                                rel="noreferrer"
                                className="px-3 py-1 rounded-lg bg-amber-500 text-black font-bold text-xs shrink-0"
                            >
                                تجديد الاشتراك الآن
                            </a>
                        </div>
                    )}

                    <section className="flex items-center mx-2 my-4 p-3 sm:p-2 bg-background border border-border rounded-t-lg shadow-sm">
                        <h2 className="text-base sm:text-lg md:text-2xl font-bold text-primary-color truncate">
                            {currentTitle}
                        </h2>
                    </section>

                    <main className="flex-1 px-2">
                        {children || <Outlet />}
                    </main>
                </div>
            </div>
        </div>
    );
}


import {
    HiOutlineChartSquareBar,
    HiOutlineClipboardList,
    HiOutlineCreditCard,
    HiOutlineUsers,
} from "react-icons/hi";
import { FiUser, FiShield } from "react-icons/fi";
import { TbFileText, TbSettings } from "react-icons/tb";

export const menuItems = [
    {
        name: "SekkaAdmin",
        path: "/sekka-admin",
        icon: FiShield,
        allowedRoles: ["super_admin", "platform_admin", "platform_staf", "platform_staff"],
        isMasterAdmin: true,
    },
    {
        name: "Dashboard",
        path: "/dashboard",
        icon: HiOutlineChartSquareBar,
        allowedRoles: ["driver", "tenant_driver", "admin", "super_admin", "tenant_owner", "tenant_admin", "staff", "tenant_staf", "tenant_staff"],
    },
    {
        name: "Profile",
        path: "/profile",
        icon: FiUser,
        allowedRoles: ["driver", "tenant_driver", "admin", "super_admin", "tenant_owner", "tenant_admin", "staff", "tenant_staf", "tenant_staff"],
    },
    {
        name: "Users",
        path: "/users",
        icon: HiOutlineUsers,
        moduleKey: "users",
        allowedRoles: ["admin", "super_admin", "platform_admin", "tenant_owner", "tenant_admin", "tenant_staf", "tenant_staff"],
    },
    {
        name: "EditLanding",
        path: "/EditLanding",
        icon: HiOutlineUsers,
        moduleKey: "editLanding",
        allowedRoles: ["admin", "super_admin", "platform_admin", "tenant_owner", "tenant_admin", "tenant_staf", "tenant_staff"],
    },
    {
        name: "LandingPage",
        path: "/LandingPage",
        icon: HiOutlineClipboardList,
        moduleKey: "editLanding",
        hasSubmenu: true,
        allowedRoles: ["admin", "super_admin", "platform_admin", "tenant_owner", "tenant_admin", "tenant_staf", "tenant_staff"],
    },
    {
        name: "Wallet",
        path: "/wallet",
        icon: HiOutlineCreditCard,
        moduleKey: "wallet",
        hasSubmenu: true,
        allowedRoles: ["admin", "super_admin", "platform_admin", "tenant_owner", "tenant_admin", "tenant_staf", "tenant_staff"],
    },
    {
        name: "Reports",
        path: "/reports",
        icon: TbFileText,
        moduleKey: "reports",
        allowedRoles: ["admin", "super_admin", "platform_admin", "tenant_owner", "tenant_admin", "tenant_staf", "tenant_staff"],
    },
    {
        name: "Settings",
        path: "/setting",
        icon: TbSettings,
        hasSubmenu: true,
        allowedRoles: ["admin", "super_admin", "platform_admin", "tenant_owner", "tenant_admin", "tenant_staf", "tenant_staff"],
    },
];

export const pageTitles = {
    "/sekka-admin": {
        en: "SEKKA Master Control",
        ar: "إدارة منصة سِكّة المركزية",
    },
    "/dashboard": {
        en: "Dashboard",
        ar: "لوحة التحكم",
    },
    "/profile": {
        en: "Profile",
        ar: "الملف الشخصي",
    },
    "/users": {
        en: "Users & Roles",
        ar: "المستخدمون والأدوار",
    },
    "/EditLanding": {
        en: "Create Car",
        ar: "إنشاء سيارة",
    },
    "/LandingPage": {
        en: "Landing Page",
        ar: "الصفحة الرئيسية",
    },
    "/wallet": {
        en: "Wallet",
        ar: "المحفظة",
    },
    "/reports": {
        en: "Reports",
        ar: "التقارير",
    },
    "/setting": {
        en: "Settings",
        ar: "الإعدادات",
    },
};


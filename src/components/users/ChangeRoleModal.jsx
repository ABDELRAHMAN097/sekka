import { useEffect, useState } from "react";
import {
    FiUser,
    FiShield,
    FiX,
    FiSlash,
    FiPauseCircle,
    FiCheckCircle,
    FiAlertCircle,
} from "react-icons/fi";

const ROLES = [
    ["customer", "عميل (Customer)"],
    ["driver", "سائق (Driver)"],
    ["worker", "عامل / موظف (Worker)"],
    ["staff", "موظف (Staff)"],
    ["admin", "مسؤول (Admin)"],
];

const STATUSES = [
    ["active", "نشط", "text-success border-success/30 bg-success/10"],
     ["inactive", "غير نشط", "text-text-muted border-border bg-card"],
    ["blocked", "محظور", "text-error border-error/30 bg-error/10"],
    ["suspended", "موقوف مؤقتًا", "text-warning border-warning/30 bg-warning/10"],
];

const STATUS_LABELS = {
    active: "نشط",
    inactive: "غير نشط",
    blocked: "محظور",
    suspended: "موقوف مؤقتًا",
};

const ChangeRoleModal = ({
    isOpen,
    user,
    onClose,
    onConfirm,
    loading = false,
}) => {
    const [role, setRole] = useState("customer");
    const [status, setStatus] = useState("active");
    const [error, setError] = useState("");

    const isBusinessOwner = user?.role === "business_owner";
    const isBusy = loading;

    useEffect(() => {
        if (!user) return;

        const currentRole = String(user.role || "customer")
            .toLowerCase()
            .trim();

        setRole(ROLES.some(([value]) => value === currentRole)
            ? currentRole
            : "customer"
        );

        const currentStatus = String(user.status || "active")
            .toLowerCase()
            .trim();

        setStatus(
            STATUSES.some(([value]) => value === currentStatus)
                ? currentStatus
                : "active"
        );

        setError("");
    }, [user, isOpen]);

    if (!isOpen || !user) {
        return null;
    }

    const handleSubmit = async (event) => {
        event.preventDefault();
        setError("");

        if (isBusinessOwner) {
            setError("لا يمكن تعديل صاحب النشاط من قائمة مستخدمي النشاط.");
            return;
        }

        if (!user.id) {
            setError("معرّف المستخدم غير موجود.");
            return;
        }

        const roleChanged = role !== user.role;
        const statusChanged = status !== (user.status || "active");

        if (!roleChanged && !statusChanged) {
            onClose();
            return;
        }

        try {
            await onConfirm(user.id, {
                role,
                status,
            });
        } catch (err) {
            setError(err?.message || "حدث خطأ أثناء تحديث بيانات المستخدم.");
        }
    };

    const handleQuickAction = async (newStatus) => {
        if (isBusy || isBusinessOwner) return;

        setError("");

        if (newStatus === (user.status || "active")) {
            setStatus(newStatus);
            return;
        }

        try {
            await onConfirm(user.id, {
                role,
                status: newStatus,
            });

            setStatus(newStatus);
        } catch (err) {
            setError(err?.message || "تعذر تحديث حالة المستخدم.");
        }
    };

    const isBlocked = status === "blocked";
    const isSuspended = status === "suspended";
    const isActive = status === "active";

    return (
        <div
            dir="rtl"
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xs p-4 animate-in fade-in duration-200"
        >
            <div className="relative w-full max-w-lg rounded-3xl border border-border bg-surface p-6 shadow-2xl shadow-black/60">
                <div className="flex items-start justify-between border-b border-border pb-4">
                    <div className="flex items-center gap-3">
                        {user.imageUrl || user.avatar || user.photoURL ? (
                            <img
                                src={user.imageUrl || user.avatar || user.photoURL}
                                alt={user.name || "User"}
                                className="h-11 w-11 rounded-2xl border border-primary-color/30 object-cover shrink-0"
                            />
                        ) : (
                            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-primary-color/30 bg-primary-color/10 text-primary-color">
                                <FiUser size={20} />
                            </div>
                        )}

                        <div>
                            <h2 className="text-lg font-bold text-text-primary">
                                إدارة حساب المستخدم
                            </h2>
                            <p className="mt-0.5 text-xs text-text-muted">
                                {user.name || user.displayName || user.email || "مستخدم"}
                            </p>
                        </div>
                    </div>

                    <button
                        type="button"
                        onClick={onClose}
                        disabled={isBusy}
                        aria-label="إغلاق"
                        className="rounded-xl p-2 text-text-muted transition hover:bg-card hover:text-text-primary disabled:opacity-50"
                    >
                        <FiX size={18} />
                    </button>
                </div>

                <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-border bg-card/40 p-3 text-xs">
                    <div className="space-y-0.5 text-text-secondary">
                        <p className="font-semibold text-text-primary">
                            {user.email || "—"}
                        </p>
                        <p dir="ltr" className="text-right text-[11px] text-text-muted">
                            {user.phone || user.phoneNumber || user.id}
                        </p>
                    </div>

                    <div className="flex items-center gap-2">
                        <span className="rounded-lg border border-border bg-surface px-2.5 py-1 text-[11px] font-semibold text-text-secondary">
                            الدور الحالي: {user.role || "عميل"}
                        </span>

                        <span
                            className={`rounded-lg border px-2.5 py-1 text-[11px] font-semibold ${
                                user.status === "active"
                                    ? "border-success/30 bg-success/10 text-success"
                                    : user.status === "blocked"
                                    ? "border-error/30 bg-error/10 text-error"
                                    : user.status === "suspended"
                                    ? "border-warning/30 bg-warning/10 text-warning"
                                    : "border-border bg-surface text-text-muted"
                            }`}
                        >
                            الحالة: {STATUS_LABELS[user.status] || user.status || "نشط"}
                        </span>
                    </div>
                </div>

                {isBusinessOwner ? (
                    <div className="mt-5 rounded-xl border border-warning/30 bg-warning/10 p-4 text-sm text-warning">
                        لا يمكن تعديل حساب صاحب النشاط من إدارة مستخدمي النشاط.
                    </div>
                ) : (
                    <form onSubmit={handleSubmit} className="mt-5 space-y-4">
                        <div>
                            <label className="mb-1.5 flex items-center gap-1.5 text-xs font-bold text-text-secondary">
                                <FiShield className="text-primary-color" size={14} />
                                تغيير الدور والصلاحية
                            </label>

                            <select
                                value={role}
                                onChange={(e) => setRole(e.target.value)}
                                disabled={isBusy}
                                className="h-11 w-full rounded-xl border border-border bg-card px-4 text-sm font-semibold text-text-primary outline-none transition focus:border-primary-color focus:ring-2 focus:ring-primary-color/20"
                            >
                                {ROLES.map(([value, label]) => (
                                    <option key={value} value={value}>
                                        {label}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label className="mb-1.5 flex items-center gap-1.5 text-xs font-bold text-text-secondary">
                                <FiAlertCircle className="text-accent" size={14} />
                                تغيير حالة الحساب
                            </label>

                            <select
                                value={status}
                                onChange={(e) => setStatus(e.target.value)}
                                disabled={isBusy}
                                className="h-11 w-full rounded-xl border border-border bg-card px-4 text-sm font-semibold text-text-primary outline-none transition focus:border-primary-color focus:ring-2 focus:ring-primary-color/20"
                            >
                                {STATUSES.map(([value, label]) => (
                                    <option key={value} value={value}>
                                        {label}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div className="border-t border-border pt-3">
                            <label className="mb-2 block text-xs font-bold text-text-muted">
                                إجراءات سريعة:
                            </label>

                            <div className="grid grid-cols-3 gap-2">
                                <button
                                    type="button"
                                    onClick={() => handleQuickAction("blocked")}
                                    disabled={isBusy}
                                    className={`flex items-center justify-center gap-1.5 rounded-xl border px-2 py-2.5 text-xs font-bold transition active:scale-95 disabled:opacity-50 ${
                                        isBlocked
                                            ? "border-error bg-error text-white"
                                            : "border-error/40 bg-error/10 text-error hover:bg-error/20"
                                    }`}
                                >
                                    <FiSlash size={14} />
                                    حظر
                                </button>

                                <button
                                    type="button"
                                    onClick={() => handleQuickAction("suspended")}
                                    disabled={isBusy}
                                    className={`flex items-center justify-center gap-1.5 rounded-xl border px-2 py-2.5 text-xs font-bold transition active:scale-95 disabled:opacity-50 ${
                                        isSuspended
                                            ? "border-warning bg-warning text-black"
                                            : "border-warning/40 bg-warning/10 text-warning hover:bg-warning/20"
                                    }`}
                                >
                                    <FiPauseCircle size={14} />
                                    إيقاف
                                </button>

                                <button
                                    type="button"
                                    onClick={() => handleQuickAction("active")}
                                    disabled={isBusy}
                                    className={`flex items-center justify-center gap-1.5 rounded-xl border px-2 py-2.5 text-xs font-bold transition active:scale-95 disabled:opacity-50 ${
                                        isActive
                                            ? "border-success bg-success text-black"
                                            : "border-success/40 bg-success/10 text-success hover:bg-success/20"
                                    }`}
                                >
                                    <FiCheckCircle size={14} />
                                    تفعيل
                                </button>
                            </div>
                        </div>

                        {error && (
                            <p className="rounded-xl border border-error/30 bg-error/10 p-3 text-xs font-semibold text-error">
                                {error}
                            </p>
                        )}

                        <div className="mt-6 flex gap-3 border-t border-border pt-3">
                            <button
                                type="button"
                                onClick={onClose}
                                disabled={isBusy}
                                className="flex-1 rounded-xl border border-border bg-card px-4 py-3 text-sm font-semibold text-text-secondary transition hover:bg-card/80 hover:text-text-primary disabled:opacity-50"
                            >
                                إلغاء
                            </button>

                            <button
                                type="submit"
                                disabled={isBusy}
                                className="flex-1 rounded-xl bg-primary-color px-4 py-3 text-sm font-bold text-background shadow-lg shadow-primary-color/20 transition hover:bg-primary-hover active:scale-95 disabled:opacity-50"
                            >
                                {isBusy ? "جاري الحفظ..." : "حفظ التغييرات"}
                            </button>
                        </div>
                    </form>
                )}

                {isBusinessOwner && (
                    <button
                        type="button"
                        onClick={onClose}
                        className="mt-5 w-full rounded-xl border border-border bg-card px-4 py-3 text-sm font-semibold text-text-secondary transition hover:bg-card/80"
                    >
                        إغلاق
                    </button>
                )}
            </div>
        </div>
    );
};

export default ChangeRoleModal;
import { Link, useNavigate, useParams } from "react-router-dom";
import { CgMail } from "react-icons/cg";
import { RiLockPasswordFill } from "react-icons/ri";
import { FaEye, FaEyeSlash, FaGoogle } from "react-icons/fa";
import { IoIosArrowDropleftCircle } from "react-icons/io";
import { useFormik } from "formik";
import { useState } from "react";
import { toast } from "react-toastify";
import { motion, MotionConfig } from "framer-motion";
import {
    loginWithEmail,
    signInWithGoogle,
} from "@/services/authService";
import { getUserProfile } from "@/services/profileService";
import { loginSchema } from "@/validations/authSchemas";
import { useTenant } from "@/context/TenantContext";

const containerVariants = {
    hidden: {},
    show: {
        transition: { staggerChildren: 0.07, delayChildren: 0.05 },
    },
};

const itemVariants = {
    hidden: { opacity: 0, y: 14 },
    show: {
        opacity: 1,
        y: 0,
        transition: { duration: 0.45, ease: [0.22, 1, 0.36, 1] },
    },
};

const fieldClass = (invalid) =>
    `group w-full flex items-center gap-3 rounded-xl border bg-surface/70 px-4 py-3 shadow-sm transition-colors duration-200 focus-within:ring-2 ${
        invalid
            ? "border-error focus-within:ring-error/30"
            : "border-border hover:border-text-muted focus-within:border-accent focus-within:ring-accent/25"
    }`;

const iconClass =
    "text-lg shrink-0 text-text-muted transition-colors group-focus-within:text-accent";

const inputClass =
    "w-full bg-transparent outline-none border-none text-text-primary placeholder:text-text-muted text-sm";

export default function Login() {
    const [showPassword, setShowPassword] = useState(false);
    const navigate = useNavigate();
    const { locale = "en" } = useParams();
    const { tenantId } = useTenant();
    const DASHBOARD_ROLES = [
        "admin",
        "super_admin",
        "tenant_owner",
        "tenant_admin",
        "staff",
        "tenant_staf",
        "tenant_staff",
        "driver",
        "tenant_driver",
        "platform_admin",
        "platform_staf",
        "platform_staff",
    ];
    const formik = useFormik({
        initialValues: {
            email: "",
            password: "",
        },
        validationSchema: loginSchema,
        onSubmit: async (values, { setSubmitting }) => {
            try {
                const userCredential = await loginWithEmail(
                    values.email.trim(),
                    values.password,
                    tenantId || null
                );
                const firebaseUser = userCredential.user;
                const profile = await getUserProfile(
                    firebaseUser.uid
                );
                const role = String(profile?.role || "customer").toLowerCase().trim();
                const canAccessDashboard =
                    DASHBOARD_ROLES.includes(role);
                toast.success("تم تسجيل الدخول بنجاح!");
                if (canAccessDashboard) {
                    navigate(`/${locale}/dashboard`, {
                        replace: true,
                    });
                } else {
                    navigate(`/${locale}`, {
                        replace: true,
                    });
                }
            } catch (error) {
                console.error(
                    "❌ Error signing in:",
                    error
                );
                switch (error?.code) {
                    case "auth/invalid-credential":
                    case "auth/user-not-found":
                    case "auth/wrong-password":
                        toast.error(
                            "البريد الإلكتروني أو كلمة المرور غير صحيحة."
                        );
                        break;
                    case "auth/invalid-email":
                        toast.error(
                            "صيغة البريد الإلكتروني غير صحيحة."
                        );
                        break;
                    case "auth/user-disabled":
                        toast.error(
                            "تم تعطيل هذا الحساب. يرجى التواصل مع الدعم."
                        );
                        break;
                    case "auth/network-request-failed":
                        toast.error(
                            "تعذر الاتصال بالخادم. تحقق من اتصال الإنترنت."
                        );
                        break;
                    case "auth/too-many-requests":
                        toast.error(
                            "تم إجراء محاولات كثيرة خاطئة. حاول مرة أخرى لاحقًا."
                        );
                        break;
                    case "permission-denied":
                    case "firestore/permission-denied":
                        toast.error(
                            "تم تسجيل الدخول، ولكن تعذر تحميل بيانات الحساب."
                        );
                        break;
                    default:
                        toast.error(
                            "حدث خطأ أثناء تسجيل الدخول. حاول مرة أخرى."
                        );
                }
            } finally {
                setSubmitting(false);
            }
        },
    });
    const handleGoogleSignIn = async () => {
        try {
            const result = await signInWithGoogle(tenantId || null);
            console.log(
                "✅ Google authentication success:",
                result.user
            );
            const firebaseUser = result.user;
            const profile = await getUserProfile(
                firebaseUser.uid
            );
            console.log(
                "✅ Google user profile:",
                profile
            );
            const role = String(profile?.role || "customer").toLowerCase().trim();
            const canAccessDashboard =
                DASHBOARD_ROLES.includes(role);
            toast.success(
                "تم تسجيل الدخول بنجاح باستخدام Google!"
            );
            if (canAccessDashboard) {
                navigate(`/${locale}/dashboard`, {
                    replace: true,
                });
            } else {
                navigate(`/${locale}`, {
                    replace: true,
                });
            }
        } catch (error) {
            console.error(
                "❌ Google Sign In Error:",
                error
            );
            switch (error?.code) {
                case "auth/popup-closed-by-user":
                    toast.error("تم إغلاق نافذة Google.");
                    break;
                case "auth/popup-blocked":
                    toast.error(
                        "المتصفح منع نافذة Google. اسمح بالنوافذ المنبثقة."
                    );
                    break;
                case "auth/cancelled-popup-request":
                    toast.error(
                        "تم إلغاء عملية تسجيل الدخول."
                    );
                    break;
                case "auth/account-exists-with-different-credential":
                    toast.error(
                        "هذا البريد مرتبط بطريقة تسجيل دخول أخرى."
                    );
                    break;
                case "auth/network-request-failed":
                    toast.error(
                        "تعذر الاتصال بالخادم. تحقق من اتصال الإنترنت."
                    );
                    break;
                case "permission-denied":
                case "firestore/permission-denied":
                    toast.error(
                        "تم تسجيل الدخول باستخدام Google، ولكن تعذر تحميل بيانات الحساب."
                    );
                    break;
                default:
                    toast.error(
                        "حدث خطأ أثناء تسجيل الدخول باستخدام Google."
                    );
            }
        }
    };

    const emailInvalid = Boolean(
        formik.touched.email && formik.errors.email
    );
    const passwordInvalid = Boolean(
        formik.touched.password && formik.errors.password
    );

    return (
        <MotionConfig reducedMotion="user">
            <motion.div
                className="w-full flex flex-col gap-7"
                variants={containerVariants}
                initial="hidden"
                animate="show"
            >
                <motion.div
                    variants={itemVariants}
                    className="w-full flex flex-col gap-3 items-start justify-start"
                >
                    <span
                        aria-hidden="true"
                        className="h-0.5 w-10 rounded-full bg-accent"
                    />
                    <h1 className="text-2xl md:text-4xl font-bold text-text-primary leading-tight">
                        مرحباً بعودتك 👋
                    </h1>
                    <p className="text-text-secondary text-sm md:text-base leading-relaxed max-w-md">
                        سجل دخولك للوصول إلى أسطول سياراتك المفضل وتفاصيل حجزك
                    </p>
                </motion.div>

                <motion.form
                    variants={containerVariants}
                    className="flex flex-col items-start justify-start gap-5 w-full"
                    onSubmit={formik.handleSubmit}
                >
                    <motion.div
                        variants={itemVariants}
                        className="flex flex-col gap-1.5 w-full"
                    >
                        <label
                            htmlFor="login-email"
                            className="text-text-secondary text-sm font-medium"
                        >
                            البريد الإلكتروني
                        </label>
                        <div className={fieldClass(emailInvalid)}>
                            <CgMail className={iconClass} />
                            <input
                                id="login-email"
                                className={inputClass}
                                type="email"
                                name="email"
                                autoComplete="email"
                                placeholder="example@gmail.com"
                                value={formik.values.email}
                                onChange={formik.handleChange}
                                onBlur={formik.handleBlur}
                                aria-invalid={emailInvalid}
                                aria-describedby={
                                    emailInvalid
                                        ? "login-email-error"
                                        : undefined
                                }
                            />
                        </div>
                        {emailInvalid && (
                            <p
                                id="login-email-error"
                                role="alert"
                                className="text-error text-xs"
                            >
                                {formik.errors.email}
                            </p>
                        )}
                    </motion.div>

                    <motion.div
                        variants={itemVariants}
                        className="flex flex-col gap-1.5 w-full"
                    >
                        <div className="flex items-center justify-between w-full">
                            <label
                                htmlFor="login-password"
                                className="text-text-secondary text-sm font-medium"
                            >
                                كلمة المرور
                            </label>
                            <Link
                                to={`/${locale}/forgot-password`}
                                className="text-xs text-text-muted hover:text-accent focus-visible:text-accent focus-visible:outline-none focus-visible:underline transition-colors"
                            >
                                نسيت كلمة المرور؟
                            </Link>
                        </div>
                        <div className={fieldClass(passwordInvalid)}>
                            <RiLockPasswordFill className={iconClass} />
                            <input
                                id="login-password"
                                className={inputClass}
                                type={
                                    showPassword
                                        ? "text"
                                        : "password"
                                }
                                name="password"
                                autoComplete="current-password"
                                placeholder="******"
                                value={formik.values.password}
                                onChange={formik.handleChange}
                                onBlur={formik.handleBlur}
                                aria-invalid={passwordInvalid}
                                aria-describedby={
                                    passwordInvalid
                                        ? "login-password-error"
                                        : undefined
                                }
                            />
                            <button
                                type="button"
                                onClick={() =>
                                    setShowPassword(
                                        (prev) => !prev
                                    )
                                }
                                className="rounded-md p-1 text-text-secondary hover:text-accent focus-visible:outline-2 focus-visible:outline-accent transition-colors cursor-pointer"
                                aria-label={
                                    showPassword
                                        ? "إخفاء كلمة المرور"
                                        : "إظهار كلمة المرور"
                                }
                            >
                                {showPassword ? (
                                    <FaEyeSlash />
                                ) : (
                                    <FaEye />
                                )}
                            </button>
                        </div>
                        {passwordInvalid && (
                            <p
                                id="login-password-error"
                                role="alert"
                                className="text-error text-xs"
                            >
                                {formik.errors.password}
                            </p>
                        )}
                    </motion.div>

                    <motion.button
                        variants={itemVariants}
                        whileHover={
                            formik.isSubmitting ? undefined : { y: -2 }
                        }
                        whileTap={
                            formik.isSubmitting
                                ? undefined
                                : { scale: 0.98 }
                        }
                        type="submit"
                        disabled={formik.isSubmitting}
                        aria-busy={formik.isSubmitting}
                        className="w-full mt-1 bg-primary-color text-white px-4 py-3 rounded-xl hover:bg-primary-hover transition-colors shadow-lg shadow-primary-color/20 flex items-center justify-center gap-2 font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
                    >
                        {formik.isSubmitting && (
                            <span
                                aria-hidden="true"
                                className="size-4 rounded-full border-2 border-white/40 border-t-white animate-spin motion-reduce:animate-none"
                            />
                        )}
                        {formik.isSubmitting
                            ? "جاري تسجيل الدخول..."
                            : "تسجيل الدخول"}
                        {!formik.isSubmitting && (
                            <span>
                                <IoIosArrowDropleftCircle className="text-lg" />
                            </span>
                        )}
                    </motion.button>

                    <motion.div
                        variants={itemVariants}
                        aria-hidden="true"
                        className="flex w-full items-center gap-3 text-xs text-text-muted"
                    >
                        <span className="h-px flex-1 bg-border" />
                        <span>أو</span>
                        <span className="h-px flex-1 bg-border" />
                    </motion.div>

                    <motion.button
                        variants={itemVariants}
                        whileHover={{ y: -2 }}
                        whileTap={{ scale: 0.98 }}
                        type="button"
                        onClick={handleGoogleSignIn}
                        className="w-full bg-card/70 text-text-primary px-4 py-3 rounded-xl border border-border hover:border-text-muted hover:bg-card transition-colors flex items-center justify-center gap-2 font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent cursor-pointer"
                    >
                        <span className="font-bold text-lg">
                            <FaGoogle />
                        </span>
                        تسجيل الدخول باستخدام Google
                    </motion.button>
                </motion.form>

                <motion.div
                    variants={itemVariants}
                    className="flex items-center justify-center gap-1.5 text-sm"
                >
                    <span className="text-text-muted">
                        ليس لديك حساب؟
                    </span>
                    <Link
                        to={`/${locale}/register${typeof window !== "undefined" && window.location.search ? window.location.search : (tenantId ? `?tenant=${tenantId}` : "")}`}
                        className="text-primary-color font-semibold hover:text-accent focus-visible:text-accent focus-visible:outline-none focus-visible:underline transition-colors"
                    >
                        إنشاء حساب جديد
                    </Link>
                </motion.div>
            </motion.div>
        </MotionConfig>
    );
}
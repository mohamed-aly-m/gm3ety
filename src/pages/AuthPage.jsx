import React, { useState, useEffect } from "react";
import { useNavigate, Link, useLocation } from "react-router-dom";
import {
  User,
  Mail,
  Phone,
  Lock,
  Eye,
  EyeOff,
  UserPlus,
  LogIn,
  KeyRound,
  CheckCircle2,
  AlertCircle,
  LogOut,
  Wallet,
  ShieldCheck,
  UserCheck,
  Send,
  Key,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { api } from "../services/api";
import { calculatePercentage, calculatePayoutAmount } from "../utils/calculations";
import Button from "../components/ui/Button";
import Card from "../components/ui/Card";
import Input from "../components/ui/Input";

export default function AuthPage() {
  const {
    user,
    login,
    register,
    logout,
    resetPasswordForEmail,
    updatePassword,
    recoveryMode,
    authError,
    setAuthError,
  } = useAuth();

  const navigate = useNavigate();
  const location = useLocation();

  const fromPath =
    location.state?.from?.pathname ||
    (typeof location.state?.from === "string" ? location.state.from : "/");

  // Mode: 'login' | 'register' | 'reset' | 'reset_confirm'
  const [mode, setMode] = useState("login");

  // Form State
  const [name, setName] = useState("");
  const [mobile, setMobile] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  // Status & Messaging
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  // Check URL params for reset_confirm mode
  useEffect(() => {
    const searchParams = new URLSearchParams(location.search);
    if (searchParams.get("mode") === "reset_confirm" || recoveryMode) {
      setMode("reset_confirm");
    }
  }, [location.search, recoveryMode]);

  // Auto-redirect authenticated user away from /auth if not in recovery mode
  useEffect(() => {
    if (user && !recoveryMode && mode !== "reset_confirm") {
      const targetPath = fromPath === "/auth" ? "/" : fromPath;
      navigate(targetPath, { replace: true });
    }
  }, [user, recoveryMode, mode, fromPath, navigate]);

  // Dynamic Icon for Top Header Badge
  const HeaderIcon =
    mode === "login"
      ? UserCheck
      : mode === "register"
      ? UserPlus
      : mode === "reset_confirm"
      ? Key
      : KeyRound;

  // Auto-save pending draft association if user just logged in or registered
  const processPendingAssociationSave = async (authenticatedUserId) => {
    const rawDraft = sessionStorage.getItem("gam3ety_pending_assoc");
    if (!rawDraft) return null;

    try {
      const draft = JSON.parse(rawDraft);
      const totalPool = (Number(draft.shareValue) || 0) * (Number(draft.totalShares) || 0);

      // 1. Create Association
      const newAssoc = {
        userId: authenticatedUserId,
        name: draft.assocName.trim(),
        shareValue: Number(draft.shareValue),
        totalShares: Number(draft.totalShares),
        startDate: draft.startDate,
        status: "active",
      };
      const createdAssoc = await api.createAssociation(newAssoc);
      const actualAssocId = createdAssoc.id;

      // 2. Save People concurrently
      const personIdMapping = {};
      await Promise.all(
        (draft.people || []).map((p) =>
          api.addPerson({
            associationId: actualAssocId,
            name: p.name,
            phone: p.phone,
          }).then((savedPerson) => {
            personIdMapping[p.id] = savedPerson.id;
            return savedPerson;
          })
        )
      );

      // 3. Save Shares
      const sharesList = draft.shares || [];
      await Promise.all(
        sharesList.map((sh) => {
          const processedContributors = (sh.contributors || []).map((c) => {
            const pct = calculatePercentage(c.contributedAmount, draft.shareValue);
            const payout = calculatePayoutAmount(pct, totalPool);
            return {
              personId: personIdMapping[c.personId] || c.personId,
              contributedAmount: Number(c.contributedAmount),
              percentage: pct,
              payoutAmount: payout,
            };
          });

          return api.createShare({
            associationId: actualAssocId,
            shareOrder: sh.shareOrder,
            contributors: processedContributors,
          });
        })
      );

      sessionStorage.removeItem("gam3ety_pending_assoc");
      return actualAssocId;
    } catch (err) {
      console.error("فشل في حفظ الجمعية المعلقة تلقائياً:", err);
      return null;
    }
  };

  // Handle Login Submission
  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg("");
    setSuccessMsg("");

    if (!mobile.trim() || !password) {
      setErrorMsg("يرجى إدخال رقم الموبايل أو البريد الإلكتروني وكلمة المرور");
      return;
    }

    setLoading(true);
    const res = await login(mobile.trim(), password);
    setLoading(false);

    if (res.success) {
      const createdAssocId = await processPendingAssociationSave(res.user.id);
      if (createdAssocId) {
        navigate(`/association/${createdAssocId}`);
      } else {
        const targetPath = fromPath === "/auth" ? "/" : fromPath;
        navigate(targetPath, { replace: true });
      }
    } else {
      setErrorMsg(res.error || "فشل تسجيل الدخول. تحقق من البيانات المدخلة.");
    }
  };

  // Handle Register Submission
  const handleRegisterSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg("");
    setSuccessMsg("");

    if (!name.trim()) {
      setErrorMsg("اسم منظم الجمعية مطلوب");
      return;
    }
    if (!mobile.trim()) {
      setErrorMsg("رقم الموبايل مطلوب للتواصل");
      return;
    }
    if (!email.trim() || !email.includes("@")) {
      setErrorMsg("يرجى إدخال بريد إلكتروني صالح");
      return;
    }
    if (password.length < 6) {
      setErrorMsg("كلمة المرور يجب ألا تقل عن 6 أحرف أو أرقام");
      return;
    }
    if (password !== confirmPassword) {
      setErrorMsg("كلمتا المرور غير متطابقتين");
      return;
    }

    setLoading(true);
    const res = await register(name.trim(), mobile.trim(), email.trim(), password);
    setLoading(false);

    if (res.success) {
      const createdAssocId = await processPendingAssociationSave(res.user.id);
      if (createdAssocId) {
        navigate(`/association/${createdAssocId}`);
      } else {
        const targetPath = fromPath === "/auth" ? "/" : fromPath;
        navigate(targetPath, { replace: true });
      }
    } else {
      setErrorMsg(res.error || "فشل إنشاء الحساب.");
    }
  };

  // Handle Password Reset Request
  const handleResetRequest = async (e) => {
    e.preventDefault();
    setErrorMsg("");
    setSuccessMsg("");

    if (!email.trim() || !email.includes("@")) {
      setErrorMsg("يرجى إدخال البريد الإلكتروني لإرسال رابط إعادة التعيين");
      return;
    }

    setLoading(true);
    try {
      await resetPasswordForEmail(email.trim());
      setSuccessMsg("تم إرسال رابط إعادة تعيين كلمة المرور إلى بريدك الإلكتروني بنجاح.");
    } catch (err) {
      setErrorMsg(err.message || "حدث خطأ أثناء إرسال الرابط.");
    } finally {
      setLoading(false);
    }
  };

  // Handle Update Password
  const handleUpdatePassword = async (e) => {
    e.preventDefault();
    setErrorMsg("");
    setSuccessMsg("");

    if (password.length < 6) {
      setErrorMsg("كلمة المرور الجديدة يجب ألا تقل عن 6 أحرف أو أرقام");
      return;
    }
    if (password !== confirmPassword) {
      setErrorMsg("كلمتا المرور غير متطابقتين");
      return;
    }

    setLoading(true);
    try {
      await updatePassword(password);
      setSuccessMsg("تم تغيير كلمة المرور بنجاح! يمكنك الآن المتابعة.");
      setTimeout(() => {
        navigate("/");
      }, 1500);
    } catch (err) {
      setErrorMsg(err.message || "حدث خطأ أثناء تحديث كلمة المرور.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto py-6 px-2">
      {/* Already logged in profile card */}
      {user && mode !== "reset_confirm" ? (
        <Card className="space-y-5 text-center p-6 border border-app shadow-md">
          <div className="w-16 h-16 rounded-full bg-sky-700 text-white flex items-center justify-center mx-auto text-xl font-bold shadow-md">
            {user.name.charAt(0)}
          </div>

          <div className="space-y-1">
            <h2 className="text-xl font-bold text-app-primary">{user.name}</h2>
            <p className="text-xs text-app-secondary">{user.email || user.mobile}</p>
            {user.mobile && <p className="text-xs text-app-secondary font-mono">{user.mobile}</p>}
          </div>

          <div className="pt-4 border-t border-app flex flex-col gap-2.5">
            <Link to="/">
              <Button variant="primary" className="w-full">
                <Wallet className="w-4 h-4" />
                <span>الذهاب إلى جمعياتي</span>
              </Button>
            </Link>

            <Button
              variant="danger"
              className="w-full"
              onClick={async () => {
                await logout();
                setMode("login");
              }}
            >
              <LogOut className="w-4 h-4" />
              <span>تسجيل الخروج</span>
            </Button>
          </div>
        </Card>
      ) : (
        <Card className="space-y-5 p-6 border border-app shadow-md">
          {/* Header */}
          <div className="text-center space-y-2 border-b border-app pb-4">
            <div className="w-12 h-12 rounded-2xl bg-sky-700 text-white flex items-center justify-center mx-auto shadow-md">
              <HeaderIcon className="w-6 h-6 stroke-2" />
            </div>

            <h1 className="text-2xl font-black text-app-primary">
              {mode === "login" && "دخول منظم الجمعية"}
              {mode === "register" && "إنشاء حساب منظم جديد"}
              {mode === "reset" && "استعادة كلمة المرور"}
              {mode === "reset_confirm" && "تعيين كلمة المرور الجديدة"}
            </h1>

            <p className="text-xs text-app-secondary">
              {mode === "login" && "أدخل بياناتك لمتابعة وإدارة جمعياتك"}
              {mode === "register" && "أنشئ حسابك لإدارة جمعياتك بكل سهولة وأمان"}
              {mode === "reset" && "أدخل بريدك الإلكتروني لاستلام رابط إعادة التعيين"}
              {mode === "reset_confirm" && "أدخل كلمة المرور الجديدة لحسابك"}
            </p>
          </div>

          {/* Feedback Messages */}
          {errorMsg && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-300 text-xs font-semibold border border-rose-200 dark:border-rose-900">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-300 text-xs font-semibold border border-emerald-200 dark:border-emerald-900">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* Form */}
          {mode === "login" && (
            <form onSubmit={handleLoginSubmit} className="space-y-4">
              <Input
                label="رقم الموبايل أو البريد الإلكتروني"
                type="text"
                placeholder="01xxxxxxxxx أو yourname@example.com"
                value={mobile}
                onChange={(e) => setMobile(e.target.value)}
                icon={User}
                required
              />

              <div className="relative">
                <Input
                  label="كلمة المرور"
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  icon={Lock}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute left-3 top-8.5 text-app-secondary hover:text-app-primary"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>

              <div className="flex justify-start">
                <button
                  type="button"
                  onClick={() => {
                    setMode("reset");
                    setErrorMsg("");
                    setSuccessMsg("");
                  }}
                  className="text-xs text-sky-600 dark:text-sky-400 hover:underline font-semibold cursor-pointer"
                >
                  نسيت كلمة المرور؟
                </button>
              </div>

              <Button
                type="submit"
                variant="primary"
                size="lg"
                className="w-full font-bold"
                disabled={loading}
              >
                <LogIn className="w-4 h-4" />
                <span>{loading ? "جاري التحقق والدخول..." : "تسجيل الدخول"}</span>
              </Button>

              <div className="text-center pt-2 border-t border-app text-xs text-app-secondary">
                <span>ليس لديك حساب منظم؟ </span>
                <button
                  type="button"
                  onClick={() => {
                    setMode("register");
                    setErrorMsg("");
                    setSuccessMsg("");
                  }}
                  className="text-sky-600 dark:text-sky-400 font-bold hover:underline cursor-pointer"
                >
                  إنشاء حساب جديد الآن
                </button>
              </div>
            </form>
          )}

          {mode === "register" && (
            <form onSubmit={handleRegisterSubmit} className="space-y-3.5">
              <Input
                label="الاسم الكامل للمنظم"
                type="text"
                placeholder="مثال: محمد علي"
                value={name}
                onChange={(e) => setName(e.target.value)}
                icon={User}
                required
              />

              <Input
                label="رقم الموبايل"
                type="tel"
                placeholder="01xxxxxxxxx"
                value={mobile}
                onChange={(e) => setMobile(e.target.value)}
                icon={Phone}
                required
              />

              <Input
                label="البريد الإلكتروني"
                type="email"
                placeholder="yourname@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                icon={Mail}
                required
              />

              <div className="relative">
                <Input
                  label="كلمة المرور (6 أحرف على الأقل)"
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  icon={Lock}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute left-3 top-8.5 text-app-secondary hover:text-app-primary"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>

              <Input
                label="تأكيد كلمة المرور"
                type={showPassword ? "text" : "password"}
                placeholder="••••••••"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                icon={Lock}
                required
              />

              <Button
                type="submit"
                variant="primary"
                size="lg"
                className="w-full font-bold"
                disabled={loading}
              >
                <UserPlus className="w-4 h-4" />
                <span>{loading ? "جاري إنشاء الحساب..." : "إنشاء الحساب رسمياً"}</span>
              </Button>

              <div className="text-center pt-2 border-t border-app text-xs text-app-secondary">
                <span>لديك حساب بالفعل؟ </span>
                <button
                  type="button"
                  onClick={() => {
                    setMode("login");
                    setErrorMsg("");
                    setSuccessMsg("");
                  }}
                  className="text-sky-600 dark:text-sky-400 font-bold hover:underline cursor-pointer"
                >
                  تسجيل الدخول
                </button>
              </div>
            </form>
          )}

          {mode === "reset" && (
            <form onSubmit={handleResetRequest} className="space-y-4">
              <Input
                label="البريد الإلكتروني المسجل"
                type="email"
                placeholder="yourname@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                icon={Mail}
                required
              />

              <Button
                type="submit"
                variant="primary"
                size="lg"
                className="w-full font-bold"
                disabled={loading}
              >
                <Send className="w-4 h-4" />
                <span>{loading ? "جاري إرسال الرابط..." : "إرسال رابط استعادة كلمة المرور"}</span>
              </Button>

              <div className="text-center pt-2 border-t border-app text-xs text-app-secondary">
                <button
                  type="button"
                  onClick={() => {
                    setMode("login");
                    setErrorMsg("");
                    setSuccessMsg("");
                  }}
                  className="text-sky-600 dark:text-sky-400 font-bold hover:underline cursor-pointer"
                >
                  العودة لتسجيل الدخول
                </button>
              </div>
            </form>
          )}

          {mode === "reset_confirm" && (
            <form onSubmit={handleUpdatePassword} className="space-y-4">
              <Input
                label="كلمة المرور الجديدة"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                icon={Lock}
                required
              />

              <Input
                label="تأكيد كلمة المرور الجديدة"
                type="password"
                placeholder="••••••••"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                icon={Lock}
                required
              />

              <Button
                type="submit"
                variant="primary"
                size="lg"
                className="w-full font-bold"
                disabled={loading}
              >
                <Key className="w-4 h-4" />
                <span>{loading ? "جاري حفظ كلمة المرور..." : "حفظ كلمة المرور الجديدة"}</span>
              </Button>
            </form>
          )}
        </Card>
      )}
    </div>
  );
}

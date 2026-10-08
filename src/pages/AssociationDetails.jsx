import React, { useEffect, useState, useMemo } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import {
  Wallet,
  Calendar,
  Users,
  CheckCircle2,
  AlertCircle,
  FileSpreadsheet,
  Printer,
  ArrowRight,
  ArrowLeftRight,
  PlusCircle,
  RefreshCw,
  Clock,
  Coins,
  Search,
  User,
  ShieldCheck,
  ChevronDown,
  Trash2,
  Sparkles,
  Phone,
  Lock,
} from "lucide-react";
import { api } from "../services/api";
import { associationCache } from "../services/associationCache";
import { migrateAssociationDeliveryStatus } from "../services/deliveryMigration";
import { useAuth } from "../context/AuthContext";
import {
  calculateMonthlyDue,
  calculatePaidAmount,
  getPaymentStatus,
  calculatePercentage,
  calculatePayoutAmount,
  getShareDueDate,
  getCalculatedEndDate,
  formatArabicDate,
} from "../utils/calculations";
import {
  exportAssociationToExcel,
  exportSinglePersonToExcel,
  exportPaymentsToExcel,
  printAssociationView,
} from "../services/exportService";
import Button from "../components/ui/Button";
import Card from "../components/ui/Card";
import Badge from "../components/ui/Badge";
import Input from "../components/ui/Input";
import Modal from "../components/ui/Modal";

export default function AssociationDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  // Core Data
  const [association, setAssociation] = useState(null);
  const [people, setPeople] = useState([]);
  const [shares, setShares] = useState([]);
  const [payments, setPayments] = useState([]);
  const [cycles, setCycles] = useState([]);
  const [loading, setLoading] = useState(true);

  // Error & Status handling
  const [fetchError, setFetchError] = useState(null);

  // Active Tab: 'shares' | 'payments' | 'export'
  const [activeTab, setActiveTab] = useState("shares");
  const [selectedCycle, setSelectedCycle] = useState(1);

  // Modals
  const [isSwapModalOpen, setIsSwapModalOpen] = useState(false);
  const [swapShareAIndex, setSwapShareAIndex] = useState(0);
  const [swapShareBIndex, setSwapShareBIndex] = useState(1);
  const [swapping, setSwapping] = useState(false);
  const [swapError, setSwapError] = useState(null);

  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [payPersonId, setPayPersonId] = useState("");
  const [payAmount, setPayAmount] = useState("");
  const [payNote, setPayNote] = useState("");
  const [payDate, setPayDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [savingPayment, setSavingPayment] = useState(false);
  const [paymentError, setPaymentError] = useState(null);

  const [selectedPersonForExport, setSelectedPersonForExport] = useState("");
  const [isPrintReportModalOpen, setIsPrintReportModalOpen] = useState(false);
  const [isPrintMemberModalOpen, setIsPrintMemberModalOpen] = useState(false);
  const [isMobileLockInfoOpen, setIsMobileLockInfoOpen] = useState(false);

  // Sync document.body print target classes and attributes for strict print isolation
  useEffect(() => {
    if (isPrintReportModalOpen) {
      document.body.classList.add("print-roles-target");
      document.body.setAttribute("data-print-target", "roles");
    } else {
      document.body.classList.remove("print-roles-target");
      if (document.body.getAttribute("data-print-target") === "roles") {
        document.body.removeAttribute("data-print-target");
      }
    }
    return () => {
      document.body.classList.remove("print-roles-target");
      document.body.removeAttribute("data-print-target");
    };
  }, [isPrintReportModalOpen]);

  useEffect(() => {
    if (isPrintMemberModalOpen) {
      document.body.classList.add("print-member-target");
      document.body.setAttribute("data-print-target", "member");
    } else {
      document.body.classList.remove("print-member-target");
      if (document.body.getAttribute("data-print-target") === "member") {
        document.body.removeAttribute("data-print-target");
      }
    }
    return () => {
      document.body.classList.remove("print-member-target");
      document.body.removeAttribute("data-print-target");
    };
  }, [isPrintMemberModalOpen]);

  // Intercept Ctrl+P keyboard shortcut when a report modal is open
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "p") {
        if (isPrintReportModalOpen) {
          e.preventDefault();
          handlePrintRoles();
        } else if (isPrintMemberModalOpen) {
          e.preventDefault();
          handlePrintMember();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isPrintReportModalOpen, isPrintMemberModalOpen]);

  const handlePrintRoles = () => {
    document.body.classList.add("print-roles-target");
    document.body.setAttribute("data-print-target", "roles");
    document.body.classList.remove("print-member-target");
    // Ensure DOM & attributes are fully painted before opening print dialog
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        window.print();
      });
    });
  };

  const handlePrintMember = () => {
    document.body.classList.add("print-member-target");
    document.body.setAttribute("data-print-target", "member");
    document.body.classList.remove("print-roles-target");
    // Ensure DOM & attributes are fully painted before opening print dialog
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        window.print();
      });
    });
  };

  const [isRenewModalOpen, setIsRenewModalOpen] = useState(false);
  const [renewStartDate, setRenewStartDate] = useState(() => new Date().toISOString().split("T")[0]);

  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deletingAssoc, setDeletingAssoc] = useState(false);
  const [deleteAssocError, setDeleteAssocError] = useState(null);

  // Server-backed turn delivery confirmation (Supabase Source of Truth)
  const [togglingShareId, setTogglingShareId] = useState(null);
  const [deliveryError, setDeliveryError] = useState(null);

  const handleToggleShareDelivery = async (shareId, currentStatus) => {
    setDeliveryError(null);
    setTogglingShareId(shareId);
    const newStatus = !currentStatus;

    try {
      await api.toggleShareDelivery(shareId, id, newStatus);
      // Immediately reflect new status in component state
      setShares((prevShares) =>
        prevShares.map((sh) =>
          sh.id === shareId ? { ...sh, isDelivered: newStatus } : sh
        )
      );
    } catch (err) {
      console.error("[GM3ETY Delivery Toggle Error]:", err);
      setDeliveryError(err.message || "تعذر حفظ حالة التسليم في قاعدة البيانات");
    } finally {
      setTogglingShareId(null);
    }
  };

  useEffect(() => {
    const cached = associationCache.get(id);
    if (cached) {
      setAssociation(cached.association);
      setPeople(cached.people || []);
      setShares(cached.shares || []);
      setPayments(cached.payments || []);
      setCycles(cached.cycles || []);
      if (cached.people && cached.people.length > 0) {
        setPayPersonId(cached.people[0].id);
        setSelectedPersonForExport(cached.people[0].id);
      }
      setLoading(false);
      fetchAssociationDetails(true);
    } else {
      setLoading(true);
      fetchAssociationDetails(false);
    }
  }, [id, user]);

  const fetchAssociationDetails = async (isBackground = false) => {
    if (!isBackground) setLoading(true);
    setFetchError(null);

    const results = await Promise.allSettled([
      api.getAssociationById(id),
      api.getPeopleByAssociation(id),
      api.getSharesByAssociation(id),
      api.getPaymentsByAssociation(id),
      api.getCyclesByAssociation(id),
    ]);

    // 1. Process Association
    if (results[0].status === "rejected") {
      const err = results[0].reason;
      console.error("Fetch Association Error:", err);
      const msg = err?.message || String(err);
      setFetchError({
        title: "تعذر تحميل الجمعية",
        message: msg.includes("42501")
          ? "حسابك الحالي لا يمتلك صلاحية لقراءة هذه الجمعية. تأكد من تسجيل الدخول بحساب المنظم."
          : "تعذر الاتصال بقاعدة البيانات. يرجى إعادة المحاولة.",
        detail: msg,
      });
      setLoading(false);
      return;
    }

    const assocData = results[0].value;
    if (!assocData) {
      setFetchError({
        title: "الجمعية غير موجودة",
        message: "لم يتم العثور على جمعية بهذا المعرف في قاعدة البيانات.",
      });
      setLoading(false);
      return;
    }

    setAssociation(assocData);

    // 2. Child resources
    const peopleData = results[1].status === "fulfilled" ? results[1].value || [] : [];
    let sharesData = results[2].status === "fulfilled" ? results[2].value || [] : [];
    const paymentsData = results[3].status === "fulfilled" ? results[3].value || [] : [];
    const cyclesData = results[4].status === "fulfilled" ? results[4].value || [] : [];

    sharesData.sort((a, b) => Number(a.shareOrder) - Number(b.shareOrder));
    cyclesData.sort((a, b) => Number(a.cycleIndex) - Number(b.cycleIndex));

    setPeople(peopleData);
    setShares(sharesData);
    setPayments(paymentsData);
    setCycles(cyclesData);

    if (peopleData.length > 0) {
      setPayPersonId((prev) => {
        const exists = peopleData.some((p) => p.id === prev);
        return exists ? prev : peopleData[0].id;
      });
      setSelectedPersonForExport((prev) => {
        const exists = peopleData.some((p) => p.id === prev);
        return exists ? prev : peopleData[0].id;
      });
    }

    associationCache.set(id, {
      association: assocData,
      people: peopleData,
      shares: sharesData,
      payments: paymentsData,
      cycles: cyclesData,
    });

    setLoading(false);

    // One-time automatic idempotent migration of legacy localStorage delivery flags to Supabase
    migrateAssociationDeliveryStatus(id, sharesData, (updatedShareId, newStatus) => {
      setShares((prev) =>
        prev.map((s) => (s.id === updatedShareId ? { ...s, isDelivered: newStatus } : s))
      );
    }).catch((migErr) => {
      console.warn("[Delivery Migration Warning]:", migErr);
    });
  };

  // Lookup map for cycle index by cycle ID
  const cycleIndexMap = useMemo(() => {
    const map = new Map();
    cycles.forEach((c) => {
      map.set(String(c.id), Number(c.cycleIndex));
    });
    return map;
  }, [cycles]);

  // Enrich payments with cycleIndex so both historical and new payments have clean cycle numbers
  const enrichedPayments = useMemo(() => {
    return payments.map((p) => {
      const mappedIdx = cycleIndexMap.get(String(p.cycleId || p.cycle_id));
      return {
        ...p,
        cycleIndex: mappedIdx !== undefined ? mappedIdx : p.cycleIndex ?? 1,
      };
    });
  }, [payments, cycleIndexMap]);

  // Has financial collection started?
  const collectionStarted = payments.some(
    (p) => (p.paymentType === "payment" || p.payment_type === "payment") && Number(p.amount || p.paid_amount) > 0
  );

  // Total calculations
  const shareVal = association?.shareValue || 0;
  const countShares = association?.totalShares || shares.length || 1;
  const totalPoolPerCycle = Math.round(shareVal * countShares);
  const totalAssociationTarget = totalPoolPerCycle * countShares;

  // Total collected so far
  const totalCollectedAll = payments.reduce((sum, p) => {
    const isPay = (p.paymentType || p.payment_type) === "payment";
    const amt = Number(p.amount || p.paid_amount) || 0;
    return isPay ? sum + amt : sum - amt;
  }, 0);

  // Payment Submission
  const handleRecordPayment = async (e) => {
    e.preventDefault();
    if (!payPersonId || !payAmount || Number(payAmount) <= 0) return;

    // 1. Locate the real database cycle row in association_cycles
    const targetCycle = cycles.find((c) => Number(c.cycleIndex) === Number(selectedCycle));
    if (!targetCycle) {
      setPaymentError(`تعذر العثور على دورة الشهر ${selectedCycle} في جدول association_cycles بقاعدة البيانات. يرجى إعادة تحميل الصفحة.`);
      return;
    }

    setSavingPayment(true);
    setPaymentError(null);
    try {
      const newPay = {
        associationId: id,
        personId: payPersonId,
        cycleId: targetCycle.id, // REAL ID from association_cycles!
        cycleIndex: targetCycle.cycleIndex,
        amount: Math.round(Number(payAmount)),
        paymentDate: payDate,
        receiptNote: payNote.trim() || `سداد قسط الشهر ${selectedCycle}`,
      };

      const saved = await api.addPayment(newPay);
      const updatedPayments = [saved, ...payments];
      setPayments(updatedPayments);
      associationCache.update(id, { payments: updatedPayments });

      setIsPaymentModalOpen(false);
      setPayAmount("");
      setPayNote("");
      setPaymentError(null);
    } catch (err) {
      console.error("[GM3ETY Payment Recording Error]:", err);
      const rawMsg = err?.message || String(err);
      let friendly = rawMsg;
      if (rawMsg.includes("42501") || rawMsg.includes("permission denied")) {
        friendly = "خطأ في صلاحيات قاعدة البيانات (42501). يرجى التأكد من تطبيق سياسات الأمان RLS المحدثة (GM3ETY_DATA_INTEGRITY_FIX.sql) وتسجيل الدخول بحساب منشئ الجمعية.";
      } else if (rawMsg.includes("foreign key") || rawMsg.includes("association_cycles")) {
        friendly = "خطأ في ربط الدورة (association_cycles). تأكد من وجود الدورة وتطابق الجمعية.";
      } else if (rawMsg.includes("Failed to fetch") || rawMsg.includes("NetworkError")) {
        friendly = "تعذر الاتصال بالخادم، يرجى التحقق من اتصالك بالإنترنت.";
      }
      setPaymentError(`تعذر تسجيل الدفعة: ${friendly}`);
    } finally {
      setSavingPayment(false);
    }
  };

  // Open Payment modal for specific person
  const openPaymentForPerson = (personId, suggestedAmount) => {
    setPayPersonId(personId);
    setPayAmount(suggestedAmount > 0 ? String(suggestedAmount) : "");
    setPaymentError(null);
    setIsPaymentModalOpen(true);
  };

  // Turn Swap handler (Atomic RPC)
  const handleSwapTurns = async () => {
    setSwapError(null);
    if (swapShareAIndex === swapShareBIndex) {
      setSwapError("يرجى اختيار دورين مختلفين للتبديل.");
      return;
    }

    const shareA = shares[swapShareAIndex];
    const shareB = shares[swapShareBIndex];
    if (!shareA || !shareB) return;

    setSwapping(true);
    try {
      await api.swapSharesTurns(shareA.id, shareB.id);
      setIsSwapModalOpen(false);
      setSwapError(null);
      await fetchAssociationDetails(false);
    } catch (err) {
      console.error("[GM3ETY Turn Swap Error]:", err);
      setSwapError(`فشلت عملية تبديل الأدوار: ${err.message || "حدث خطأ غير متوقع أثناء التبديل"}`);
    } finally {
      setSwapping(false);
    }
  };

  // Delete Association
  const handleDeleteAssociation = async () => {
    if (!id) return;
    setDeletingAssoc(true);
    setDeleteAssocError(null);
    try {
      await api.deleteAssociation(id);
      associationCache.invalidate(id);
      setIsDeleteModalOpen(false);
      navigate("/");
    } catch (err) {
      console.error("[GM3ETY Delete Error]:", err);
      setDeleteAssocError(err.message || "حدث خطأ غير متوقع أثناء حذف الجمعية");
    } finally {
      setDeletingAssoc(false);
    }
  };

  // Duplicate / Renew Association
  const handleRenewAssociation = () => {
    const template = {
      name: `${association.name} (دورة جديدة)`,
      shareValue: association.shareValue,
      totalShares: association.totalShares,
      startDate: renewStartDate,
      people: people.map((p) => ({ ...p, oldId: p.id })),
      shares: shares.map((sh) => ({
        ...sh,
        contributors: (sh.contributors || []).map((c) => ({ ...c })),
      })),
    };
    navigate("/create", { state: { templateAssociation: template, mode: "renew" } });
  };

  if (loading) {
    return (
      <div className="py-24 text-center space-y-3">
        <div className="w-10 h-10 border-4 border-sky-600 border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-app-secondary text-sm font-semibold">جاري تحميل بيانات الجمعية...</p>
      </div>
    );
  }

  if (fetchError) {
    return (
      <Card className="max-w-xl mx-auto my-12 text-center p-8 space-y-4 border border-rose-300 dark:border-rose-900">
        <AlertCircle className="w-12 h-12 text-rose-500 mx-auto" />
        <h2 className="text-xl font-bold text-app-primary">{fetchError.title}</h2>
        <p className="text-xs text-app-secondary leading-relaxed">{fetchError.message}</p>
        {fetchError.detail && (
          <pre className="text-[11px] p-3 rounded-lg bg-black/5 dark:bg-white/5 text-rose-700 dark:text-rose-300 overflow-x-auto text-left font-mono">
            {fetchError.detail}
          </pre>
        )}
        <div className="pt-2 flex justify-center gap-3">
          <Link to="/">
            <Button variant="outline">العودة للرئيسية</Button>
          </Link>
          <Button variant="primary" onClick={() => fetchAssociationDetails(false)}>
            <RefreshCw className="w-4 h-4" />
            <span>إعادة المحاولة</span>
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-6 pb-12">
      {/* SCREEN PAGE CONTENT — ISOLATED AND HIDDEN WHEN REPORT PRINT IS ACTIVE */}
      <div className="space-y-6 print-page-content">
        {/* TOP HEADER & ACTIONS */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-app pb-4">
        <div className="flex items-center gap-3">
          <Link to="/" className="p-2 rounded-xl hover:bg-black/5 dark:hover:bg-white/10 transition-colors">
            <ArrowRight className="w-5 h-5 text-app-secondary" />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-black text-app-primary">{association.name}</h1>
              <Badge variant={association.status === "completed" ? "success" : "info"}>
                {association.status === "completed" ? "منتهية" : "نشطة"}
              </Badge>
              {collectionStarted && (
                <Badge variant="warning" className="flex items-center gap-1">
                  <Lock className="w-3 h-3" />
                  <span>التحصيل نشط (الهيكل مقفل)</span>
                </Badge>
              )}
            </div>
            <p className="text-xs text-app-secondary mt-0.5">
              تاريخ البداية: {association.startDate} | تاريخ النهاية: {association.endDate}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap sm:flex-nowrap items-center gap-2 w-full sm:w-auto">
          {!collectionStarted && (
            <Link to={`/association/${id}/edit`} className="flex-1 sm:flex-initial">
              <Button variant="outline" size="sm" className="w-full text-xs">
                تعديل الجمعية
              </Button>
            </Link>
          )}

          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsRenewModalOpen(true)}
            className="flex-1 sm:flex-initial text-xs text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-700"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>تجديد دورة</span>
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsDeleteModalOpen(true)}
            className="text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 p-2 shrink-0"
            title="حذف الجمعية"
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* OVERVIEW METRICS CARDS */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
        <Card className="space-y-1">
          <span className="text-xs text-app-secondary block">قيمة الحصة الشهرية:</span>
          <strong className="text-lg font-black text-app-primary block">
            {shareVal.toLocaleString()} ج
          </strong>
          <span className="text-[11px] text-app-secondary">{countShares} حصص / شهور</span>
        </Card>

        <Card className="space-y-1">
          <span className="text-xs text-app-secondary block">إجمالي القبض شهرياً:</span>
          <strong className="text-lg font-black text-sky-700 dark:text-sky-300 block">
            {totalPoolPerCycle.toLocaleString()} ج
          </strong>
          <span className="text-[11px] text-app-secondary">لكل دورة شهرية</span>
        </Card>

        <Card className="space-y-1">
          <span className="text-xs text-app-secondary block">إجمالي المحصل حتى الآن:</span>
          <strong className="text-lg font-black text-emerald-600 dark:text-emerald-400 block">
            {totalCollectedAll.toLocaleString()} ج
          </strong>
          <span className="text-[11px] text-app-secondary">
            من إجمالي مستهدف: {totalAssociationTarget.toLocaleString()} ج
          </span>
        </Card>

        <Card className="space-y-1">
          <span className="text-xs text-app-secondary block">عدد المشتركين:</span>
          <strong className="text-lg font-black text-app-primary block">
            {people.length} أشخاص
          </strong>
          <span className="text-[11px] text-app-secondary">
            {shares.filter((s) => (s.contributors || []).length > 1).length} حصص مقسمة
          </span>
        </Card>
      </div>

      {/* COLLECTION FREEZE WARNING BANNER (RESPONSIVE: DETAILED DESKTOP, COMPACT MOBILE) */}
      {collectionStarted && (
        <>
          {/* Desktop Banner */}
          <div className="hidden sm:flex p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-900 dark:text-amber-200 text-xs items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Lock className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
              <div>
                <strong className="font-bold block">الجمعية في مرحلة التحصيل المالي النشط</strong>
                <span>تم إقفال تعديل أو حذف أو إضافة الأعضاء والأسهم تلقائياً لحماية الحسابات والالتزامات المالية.</span>
              </div>
            </div>
            <Badge variant="warning">مقفل للحماية</Badge>
          </div>

          {/* Mobile Compact Notice */}
          <div className="sm:hidden p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-900 dark:text-amber-200 text-xs flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 truncate">
              <Lock className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
              <span className="font-bold truncate text-[11px]">التحصيل نشط — الهيكل مقفل للحماية</span>
            </div>
            <button
              type="button"
              onClick={() => setIsMobileLockInfoOpen(true)}
              className="text-[10px] font-bold px-2 py-1 rounded-lg bg-amber-500/20 text-amber-800 dark:text-amber-300 hover:bg-amber-500/30 cursor-pointer shrink-0"
            >
              تفاصيل
            </button>
          </div>
        </>
      )}

      {/* TABS NAVIGATION */}
      <div className="flex items-center gap-2 border-b border-app pb-2">
        <button
          onClick={() => setActiveTab("shares")}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
            activeTab === "shares"
              ? "bg-sky-700 text-white shadow-xs"
              : "text-app-secondary hover:bg-black/5 dark:hover:bg-white/10"
          }`}
        >
          جدول الأدوار والاستلام ({shares.length})
        </button>
        <button
          onClick={() => setActiveTab("payments")}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
            activeTab === "payments"
              ? "bg-sky-700 text-white shadow-xs"
              : "text-app-secondary hover:bg-black/5 dark:hover:bg-white/10"
          }`}
        >
          متابعة وسجل المدفوعات ({payments.length})
        </button>
        <button
          onClick={() => setActiveTab("export")}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
            activeTab === "export"
              ? "bg-sky-700 text-white shadow-xs"
              : "text-app-secondary hover:bg-black/5 dark:hover:bg-white/10"
          }`}
        >
          تصدير وطباعة الكشوفات
        </button>
      </div>

      {/* TAB 1: SHARES & TURNS */}
      {activeTab === "shares" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-app-primary">
              جدول تسليم الأدوار وترتيب الحصص شهرياً:
            </h3>

            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsSwapModalOpen(true)}
              className="text-xs font-bold"
            >
              <ArrowLeftRight className="w-3.5 h-3.5" />
              <span>تبديل ترتيب دورين</span>
            </Button>
          </div>

          {deliveryError && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-700 dark:text-rose-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{deliveryError}</span>
            </div>
          )}

          <div className="space-y-3">
            {shares.map((share, idx) => {
              const isDelivered = Boolean(share.isDelivered);
              const shareDueDate = getShareDueDate(association.startDate, share.shareOrder);
              const shareDueDateFormatted = formatArabicDate(shareDueDate);

              return (
                <Card
                  key={share.id}
                  className={`p-4 transition-all space-y-3 ${
                    isDelivered
                      ? "border-emerald-500/50 bg-emerald-50/20 dark:bg-emerald-950/10"
                      : "border-app"
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-app/50 pb-2.5">
                    <div className="flex items-center gap-3">
                      <span className="w-8 h-8 rounded-xl bg-sky-700 text-white flex items-center justify-center font-bold text-xs shadow-xs">
                        #{share.shareOrder}
                      </span>
                      <div>
                        <strong className="text-app-primary font-bold text-sm block">
                          دور الشهر رقم {share.shareOrder} (موعد الاستحقاق: {shareDueDateFormatted})
                        </strong>
                        <span className="text-app-secondary text-xs">
                          إجمالي القبض للدور: {totalPoolPerCycle.toLocaleString()} جنيه
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <Badge variant={isDelivered ? "success" : "warning"}>
                        {isDelivered ? "تم تسليم القبض" : "في انتظار الصرف"}
                      </Badge>

                      <button
                        type="button"
                        disabled={togglingShareId === share.id}
                        onClick={() => handleToggleShareDelivery(share.id, isDelivered)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors cursor-pointer flex items-center gap-1 ${
                          isDelivered
                            ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300"
                            : "bg-sky-100 text-sky-800 dark:bg-sky-950/60 dark:text-sky-300 hover:bg-sky-200"
                        } ${togglingShareId === share.id ? "opacity-50 cursor-wait" : ""}`}
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>
                          {togglingShareId === share.id
                            ? "جاري الحفظ..."
                            : isDelivered
                            ? "تم التسليم"
                            : "تأكيد التسليم"}
                        </span>
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <span className="text-xs font-bold text-app-secondary block">
                      المستلم / المستلمون في هذا الدور:
                    </span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                      {(share.contributors || []).map((c, cIdx) => {
                        const person = people.find((p) => p.id === (c.personId ?? c.person_id));
                        const contribAmt = Number(
                          c.monthly_contribution ?? c.monthlyContribution ?? c.contributedAmount ?? c.contributed_amount
                        ) || 0;
                        const pct = calculatePercentage(contribAmt, shareVal);
                        const payout = calculatePayoutAmount(pct, totalPoolPerCycle);

                        return (
                          <div
                            key={cIdx}
                            className="p-2.5 rounded-xl bg-black/5 dark:bg-white/5 border border-app text-xs flex justify-between items-center"
                          >
                            <div className="truncate pl-2">
                              <strong className="font-bold text-app-primary block truncate">
                                {person?.name || "عضو"}
                              </strong>
                              <span className="text-[11px] text-app-secondary font-mono">
                                {person?.phone || ""}
                              </span>
                            </div>
                            <div className="text-right whitespace-nowrap">
                              <strong className="text-sky-700 dark:text-sky-300 block font-bold">
                                {payout.toLocaleString()} ج
                              </strong>
                              <span className="text-[11px] text-app-secondary">نسبة {pct}%</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 2: PAYMENTS TRACKING */}
      {activeTab === "payments" && (
        <div className="space-y-5">
          {/* Cycle Selector */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-2xl bg-card-app border border-app shadow-xs">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-app-secondary whitespace-nowrap">
                اختر دورة الشهر للمتابعة:
              </span>
              <select
                value={selectedCycle}
                onChange={(e) => setSelectedCycle(Number(e.target.value))}
                className="px-3 py-1.5 rounded-xl border border-app bg-app text-app-primary text-xs font-bold focus:outline-none"
              >
                {cycles.length > 0 ? (
                  cycles.map((c) => (
                    <option key={c.id} value={c.cycleIndex}>
                      الشهر {c.cycleIndex} ({formatArabicDate(c.dueDate)})
                    </option>
                  ))
                ) : (
                  Array.from({ length: countShares }, (_, i) => i + 1).map((c) => (
                    <option key={c} value={c}>
                      الشهر {c} ({formatArabicDate(getShareDueDate(association.startDate, c))})
                    </option>
                  ))
                )}
              </select>
            </div>

            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                if (people.length > 0) {
                  setPayPersonId(people[0].id);
                  const currentCycleObj = cycles.find((c) => Number(c.cycleIndex) === Number(selectedCycle));
                  const due = calculateMonthlyDue(shares, people[0].id, shareVal);
                  const paid = calculatePaidAmount(enrichedPayments, people[0].id, currentCycleObj?.id || selectedCycle);
                  setPayAmount(String(Math.max(0, due - paid)));
                }
                setIsPaymentModalOpen(true);
              }}
            >
              <PlusCircle className="w-4 h-4" />
              <span>تسجيل دفعة جديدة</span>
            </Button>
          </div>

          {/* Members Status in selected cycle */}
          <div className="space-y-2.5">
            <h3 className="text-xs font-bold text-app-secondary uppercase tracking-wider">
              حالة سداد أعضاء الجمعية في الشهر {selectedCycle}:
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {people.map((person) => {
                const currentCycleObj = cycles.find((c) => Number(c.cycleIndex) === Number(selectedCycle));
                const due = calculateMonthlyDue(shares, person.id, shareVal);
                const paid = calculatePaidAmount(enrichedPayments, person.id, currentCycleObj?.id || selectedCycle);
                const statusInfo = getPaymentStatus(due, paid);

                return (
                  <Card key={person.id} className="p-4 space-y-3 border-app">
                    <div className="flex items-start justify-between gap-2 border-b border-app/50 pb-2">
                      <div>
                        <strong className="text-sm font-bold text-app-primary block">
                          {person.name}
                        </strong>
                        <span className="text-xs text-app-secondary font-mono flex items-center gap-1 mt-0.5">
                          <Phone className="w-3 h-3 text-app-secondary" />
                          <span>{person.phone}</span>
                        </span>
                      </div>

                      <Badge
                        variant={
                          statusInfo.status === "paid"
                            ? "success"
                            : statusInfo.status === "partial"
                            ? "warning"
                            : "danger"
                        }
                      >
                        {statusInfo.statusText}
                      </Badge>
                    </div>

                    <div className="grid grid-cols-3 gap-2 text-xs bg-black/5 dark:bg-white/5 p-2.5 rounded-xl">
                      <div>
                        <span className="text-app-secondary block text-[11px]">المطلوب:</span>
                        <strong className="text-app-primary font-bold">
                          {statusInfo.dueAmount.toLocaleString()} ج
                        </strong>
                      </div>
                      <div>
                        <span className="text-app-secondary block text-[11px]">المدفوع:</span>
                        <strong className="text-emerald-600 dark:text-emerald-400 font-bold">
                          {statusInfo.paidAmount.toLocaleString()} ج
                        </strong>
                      </div>
                      <div>
                        <span className="text-app-secondary block text-[11px]">المتبقي:</span>
                        <strong className="text-rose-600 dark:text-rose-400 font-bold">
                          {statusInfo.remainingAmount.toLocaleString()} ج
                        </strong>
                      </div>
                    </div>

                    {statusInfo.remainingAmount > 0 && (
                      <div className="pt-1 flex justify-end">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openPaymentForPerson(person.id, statusInfo.remainingAmount)}
                          className="text-xs"
                        >
                          <PlusCircle className="w-3.5 h-3.5" />
                          <span>سداد ({statusInfo.remainingAmount.toLocaleString()} ج)</span>
                        </Button>
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          </div>

          {/* Historical Payments Log */}
          {payments.length > 0 && (
            <div className="space-y-3 pt-4 border-t border-app">
              <h3 className="text-xs font-bold text-app-secondary uppercase tracking-wider">
                سجل المدفوعات التاريخي ({payments.length} حركة):
              </h3>

              <div className="bg-card-app rounded-2xl border border-app overflow-x-auto shadow-xs">
                <table className="w-full text-xs text-right border-collapse">
                  <thead>
                    <tr className="border-b border-app bg-black/5 dark:bg-white/5 text-app-secondary font-bold">
                      <th className="p-3">العضو المسدد</th>
                      <th className="p-3">الدورة / الشهر</th>
                      <th className="p-3">المبلغ المسدد</th>
                      <th className="p-3">تاريخ الدفع</th>
                      <th className="p-3">ملاحظات</th>
                      <th className="p-3 text-center">إلغاء / استرجاع</th>
                    </tr>
                  </thead>
                  <tbody>
                    {enrichedPayments.map((p) => {
                      const person = people.find((item) => item.id === p.personId);
                      const isReversal = p.paymentType === "reversal";

                      return (
                        <tr
                          key={p.id}
                          className={`border-b border-app/40 hover:bg-black/5 dark:hover:bg-white/5 transition-colors ${
                            isReversal ? "opacity-60 bg-rose-50/30 dark:bg-rose-950/10" : ""
                          }`}
                        >
                          <td className="p-3 font-bold text-app-primary">
                            {person?.name || "عضو"}
                          </td>
                          <td className="p-3">الشهر {p.cycleIndex}</td>
                          <td className={`p-3 font-bold ${isReversal ? "text-rose-500" : "text-emerald-600 dark:text-emerald-400"}`}>
                            {isReversal ? `-${p.amount.toLocaleString()}` : `+${p.amount.toLocaleString()}`} ج
                          </td>
                          <td className="p-3 text-app-secondary">{p.paymentDate}</td>
                          <td className="p-3 text-app-secondary">{p.receiptNote || "-"}</td>
                          <td className="p-3 text-center">
                            {!isReversal && (
                              <button
                                type="button"
                                onClick={async () => {
                                  if (confirm("هل تريد عمل استرجاع (Reversal) لهذه الدفعة؟")) {
                                    try {
                                      const rev = await api.reversalPayment(p.id, "استرجاع مسدد");
                                      setPayments((prev) => [rev, ...prev]);
                                    } catch (err) {
                                      console.error("[GM3ETY Reversal Error]:", err);
                                      alert(`تعذر استرجاع الدفعة: ${err.message || "حدث خطأ أثناء الاسترجاع"}`);
                                    }
                                  }
                                }}
                                className="text-rose-500 hover:underline cursor-pointer"
                              >
                                استرجاع
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: EXPORTS */}
      {activeTab === "export" && (
        <Card className="space-y-6 border border-app p-6">
          <div>
            <h3 className="text-lg font-bold text-app-primary">تصدير وطباعة تقارير الجمعية</h3>
            <p className="text-xs text-app-secondary mt-1">
              استخرج كشوفات Excel جاهزة، اطبع جدول الأدوار والاستلام بضغطة زر، أو عاين الموقف المالي لكل عضو.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
            <Card className="p-4 space-y-3 text-center border-app hover:border-emerald-500/50 transition-colors">
              <FileSpreadsheet className="w-7 h-7 text-emerald-600 mx-auto" />
              <strong className="text-xs font-bold text-app-primary block">
                كشف الأدوار الكلي (Excel)
              </strong>
              <Button
                variant="outline"
                size="sm"
                className="w-full text-xs"
                onClick={() => exportAssociationToExcel(association, shares, people)}
              >
                تحميل Excel
              </Button>
            </Card>

            <Card className="p-4 space-y-3 text-center border-app hover:border-emerald-500/50 transition-colors">
              <FileSpreadsheet className="w-7 h-7 text-emerald-600 mx-auto" />
              <strong className="text-xs font-bold text-app-primary block">
                سجل المدفوعات (Excel)
              </strong>
              <Button
                variant="outline"
                size="sm"
                className="w-full text-xs"
                onClick={() => exportPaymentsToExcel(association, enrichedPayments, people)}
              >
                تحميل Excel
              </Button>
            </Card>

            <Card className="p-4 space-y-3 text-center border-app hover:border-sky-500/50 transition-colors bg-sky-50/10 dark:bg-sky-950/10">
              <Printer className="w-7 h-7 text-sky-600 mx-auto" />
              <strong className="text-xs font-bold text-app-primary block">
                طباعة PDF — جدول الأدوار
              </strong>
              <Button
                variant="primary"
                size="sm"
                className="w-full text-xs"
                onClick={() => setIsPrintReportModalOpen(true)}
              >
                معاينة وطباعة
              </Button>
            </Card>

            <Card className="p-4 space-y-3 text-center border-app hover:border-sky-500/50 transition-colors">
              <Printer className="w-7 h-7 text-sky-600 mx-auto" />
              <strong className="text-xs font-bold text-app-primary block">
                طباعة الشاشة الكاملة
              </strong>
              <Button
                variant="outline"
                size="sm"
                className="w-full text-xs"
                onClick={() => printAssociationView()}
              >
                طباعة الآن
              </Button>
            </Card>

            <Card className="p-4 space-y-3 text-center border-app hover:border-amber-500/50 transition-colors">
              <User className="w-7 h-7 text-amber-600 mx-auto" />
              <strong className="text-xs font-bold text-app-primary block">
                كشف عضو محدد (PDF و Excel)
              </strong>
              <select
                value={selectedPersonForExport}
                onChange={(e) => setSelectedPersonForExport(e.target.value)}
                className="w-full px-2 py-1 rounded-lg border border-app bg-app text-xs font-semibold"
              >
                {people.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <div className="flex flex-col gap-1.5 pt-1">
                <Button
                  variant="primary"
                  size="sm"
                  className="w-full text-xs"
                  onClick={() => setIsPrintMemberModalOpen(true)}
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>تحميل كشف العضو (PDF)</span>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full text-xs"
                  onClick={() => {
                    const targetP = people.find((p) => p.id === selectedPersonForExport);
                    if (targetP) {
                      exportSinglePersonToExcel(association, targetP, shares, enrichedPayments);
                    }
                  }}
                >
                  <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                  <span>تحميل كشف Excel للعضو</span>
                </Button>
              </div>
            </Card>
          </div>

          {/* INTERACTIVE MEMBER INSPECTION CARD */}
          {(() => {
            const targetPerson = people.find((p) => p.id === selectedPersonForExport);
            if (!targetPerson) return null;

            const memberMonthlyDue = calculateMonthlyDue(shares, targetPerson.id, shareVal);
            const memberTotalDue = memberMonthlyDue * countShares;
            const memberPayments = enrichedPayments.filter((p) => String(p.personId) === String(targetPerson.id));
            const memberPaidTotal = memberPayments.reduce((sum, p) => {
              const isPay = (p.paymentType || p.payment_type) === "payment";
              const amt = Number(p.amount || p.paid_amount) || 0;
              return isPay ? sum + amt : sum - amt;
            }, 0);
            const memberRemainingTotal = Math.max(0, memberTotalDue - memberPaidTotal);

            // Receiving turns for this member
            const memberTurns = [];
            shares.forEach((sh) => {
              const contribs = (sh.contributors || []).filter(
                (c) => String(c.personId ?? c.person_id) === String(targetPerson.id)
              );
              contribs.forEach((c) => {
                const contribAmt = Number(
                  c.monthly_contribution ?? c.monthlyContribution ?? c.contributedAmount ?? c.contributed_amount
                ) || 0;
                const pct = calculatePercentage(contribAmt, shareVal);
                const payout = calculatePayoutAmount(pct, totalPoolPerCycle);
                const dueDate = getShareDueDate(association.startDate, sh.shareOrder);
                memberTurns.push({
                  shareOrder: sh.shareOrder,
                  dueDateFormatted: formatArabicDate(dueDate),
                  percentage: pct,
                  payoutAmount: payout,
                  isDelivered: Boolean(sh.isDelivered),
                });
              });
            });

            return (
              <div className="p-5 border border-sky-300/60 dark:border-sky-800/60 bg-sky-50/30 dark:bg-sky-950/20 space-y-4 rounded-2xl">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-app/60 pb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-10 h-10 rounded-xl bg-sky-700 text-white flex items-center justify-center font-bold text-sm shadow-xs">
                      {targetPerson.name.charAt(0)}
                    </div>
                    <div>
                      <h4 className="text-sm font-black text-app-primary flex items-center gap-2">
                        <span>{targetPerson.name}</span>
                        <span className="text-xs font-normal text-app-secondary font-mono">({targetPerson.phone})</span>
                      </h4>
                      <span className="text-[11px] text-app-secondary">
                        الموقف المالي الشامل للعضو داخل هذه الجمعية
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      variant="primary"
                      size="sm"
                      className="text-xs self-start sm:self-auto"
                      onClick={() => setIsPrintMemberModalOpen(true)}
                    >
                      <Printer className="w-3.5 h-3.5" />
                      <span>طباعة كشف العضو (PDF)</span>
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-xs self-start sm:self-auto bg-card-app"
                      onClick={() => exportSinglePersonToExcel(association, targetPerson, shares, enrichedPayments)}
                    >
                      <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                      <span>تحميل كشف Excel للعضو</span>
                    </Button>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                  <div className="p-3 rounded-xl bg-card-app border border-app shadow-2xs">
                    <span className="text-[11px] text-app-secondary block">القسط الشهري:</span>
                    <strong className="text-sm font-black text-app-primary">
                      {memberMonthlyDue.toLocaleString()} ج
                    </strong>
                  </div>
                  <div className="p-3 rounded-xl bg-card-app border border-app shadow-2xs">
                    <span className="text-[11px] text-app-secondary block">إجمالي المطلوب (كامل الجمعية):</span>
                    <strong className="text-sm font-black text-app-primary">
                      {memberTotalDue.toLocaleString()} ج
                    </strong>
                  </div>
                  <div className="p-3 rounded-xl bg-card-app border border-app shadow-2xs">
                    <span className="text-[11px] text-app-secondary block">إجمالي ما دفعه:</span>
                    <strong className="text-sm font-black text-emerald-600 dark:text-emerald-400">
                      {memberPaidTotal.toLocaleString()} ج
                    </strong>
                  </div>
                  <div className="p-3 rounded-xl bg-card-app border border-app shadow-2xs">
                    <span className="text-[11px] text-app-secondary block">المتبقي عليه:</span>
                    <strong className="text-sm font-black text-rose-600 dark:text-rose-400">
                      {memberRemainingTotal.toLocaleString()} ج
                    </strong>
                  </div>
                </div>

                {/* Member Receiving Turns */}
                <div className="space-y-2 pt-1">
                  <strong className="text-xs font-bold text-app-primary block">
                    أدوار استلام (قبض) هذا العضو ({memberTurns.length} دور):
                  </strong>
                  {memberTurns.length === 0 ? (
                    <p className="text-xs text-app-secondary">لم يتم تعيين أي دور استلام لهذا العضو في جدول الأسهم.</p>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                      {memberTurns.map((turn, tIdx) => (
                        <div
                          key={tIdx}
                          className="p-3 rounded-xl bg-card-app border border-app text-xs flex justify-between items-center shadow-2xs"
                        >
                          <div>
                            <div className="flex items-center gap-1.5 font-bold text-app-primary">
                              <span className="w-5 h-5 rounded-md bg-sky-700 text-white flex items-center justify-center text-[10px]">
                                #{turn.shareOrder}
                              </span>
                              <span>الدور {turn.shareOrder}</span>
                            </div>
                            <span className="text-[11px] text-app-secondary block mt-0.5">
                              الاستحقاق: {turn.dueDateFormatted}
                            </span>
                          </div>
                          <div className="text-right">
                            <strong className="text-sky-700 dark:text-sky-300 font-bold block">
                              {turn.payoutAmount.toLocaleString()} ج
                            </strong>
                            <Badge variant={turn.isDelivered ? "success" : "warning"} className="text-[10px] mt-0.5">
                              {turn.isDelivered ? "تم الاستلام" : "في الانتظار"}
                            </Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })()}
        </Card>
      )}
      </div>

      {/* RECORD PAYMENT MODAL */}
      <Modal
        isOpen={isPaymentModalOpen}
        onClose={() => {
          setIsPaymentModalOpen(false);
          setPaymentError(null);
        }}
        title={`تسجيل دفعة مالية (الشهر ${selectedCycle})`}
      >
        <form onSubmit={handleRecordPayment} className="space-y-4">
          {paymentError && (
            <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-300 dark:border-rose-900 text-rose-700 dark:text-rose-300 text-xs flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <strong className="font-bold block">تعذر تسجيل الدفعة</strong>
                <p className="leading-relaxed">{paymentError}</p>
              </div>
            </div>
          )}

          <div className="space-y-1">
            <label className="text-xs font-bold text-app-primary">المشترك المسدد:</label>
            <select
              value={payPersonId}
              onChange={(e) => setPayPersonId(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-app bg-app text-app-primary text-xs font-semibold focus:outline-none"
              required
            >
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.phone})
                </option>
              ))}
            </select>
          </div>

          <Input
            label="المبلغ المسدد (بالجنيه EGP)"
            type="number"
            placeholder="مثال: 1000"
            value={payAmount}
            onChange={(e) => setPayAmount(e.target.value)}
            required
          />

          <Input
            label="تاريخ الدفع"
            type="date"
            value={payDate}
            onChange={(e) => setPayDate(e.target.value)}
            required
          />

          <Input
            label="ملاحظات الإيصال (اختياري)"
            placeholder="مثال: سداد عبر فودافون كاش / إنستاباي"
            value={payNote}
            onChange={(e) => setPayNote(e.target.value)}
          />

          <div className="flex justify-end gap-2 pt-2 border-t border-app">
            <Button
              variant="secondary"
              onClick={() => {
                setIsPaymentModalOpen(false);
                setPaymentError(null);
              }}
            >
              إلغاء
            </Button>
            <Button variant="primary" type="submit" disabled={savingPayment}>
              {savingPayment ? "جاري التسجيل..." : "تأكيد تسجيل الدفعة"}
            </Button>
          </div>
        </form>
      </Modal>

      {/* SWAP SHARES MODAL (ATOMIC RPC) */}
      <Modal
        isOpen={isSwapModalOpen}
        onClose={() => {
          setIsSwapModalOpen(false);
          setSwapError(null);
        }}
        title="تبديل ترتيب دورين في الجمعية (Atomic Swap)"
      >
        <div className="space-y-4">
          <p className="text-xs text-app-secondary">
            اختر دورين لتبديل المستحقين والمساهمين بينهما بطريقة ذرية ومؤمنة في قاعدة البيانات.
          </p>

          {swapError && (
            <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-300 dark:border-rose-900 text-rose-700 dark:text-rose-300 text-xs flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <strong className="font-bold block">خطأ في التبديل</strong>
                <p className="leading-relaxed">{swapError}</p>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <label className="text-xs font-bold text-app-primary">الدور الأول:</label>
            <select
              value={swapShareAIndex}
              onChange={(e) => setSwapShareAIndex(Number(e.target.value))}
              className="w-full px-3 py-2 rounded-xl border border-app bg-app text-app-primary text-xs font-semibold"
            >
              {shares.map((s, idx) => {
                const sDueDate = formatArabicDate(getShareDueDate(association.startDate, s.shareOrder));
                return (
                  <option key={s.id} value={idx}>
                    الدور #{s.shareOrder} (موعد الاستحقاق: {sDueDate})
                  </option>
                );
              })}
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-app-primary">الدور الثاني:</label>
            <select
              value={swapShareBIndex}
              onChange={(e) => setSwapShareBIndex(Number(e.target.value))}
              className="w-full px-3 py-2 rounded-xl border border-app bg-app text-app-primary text-xs font-semibold"
            >
              {shares.map((s, idx) => {
                const sDueDate = formatArabicDate(getShareDueDate(association.startDate, s.shareOrder));
                return (
                  <option key={s.id} value={idx}>
                    الدور #{s.shareOrder} (موعد الاستحقاق: {sDueDate})
                  </option>
                );
              })}
            </select>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-app">
            <Button
              variant="secondary"
              onClick={() => {
                setIsSwapModalOpen(false);
                setSwapError(null);
              }}
            >
              إلغاء
            </Button>
            <Button variant="primary" onClick={handleSwapTurns} disabled={swapping}>
              {swapping ? "جاري التبديل الذري..." : "تأكيد التبديل"}
            </Button>
          </div>
        </div>
      </Modal>

      {/* PRINTABLE PDF REPORT MODAL — ROLES & DELIVERY */}
      <Modal
        isOpen={isPrintReportModalOpen}
        onClose={() => setIsPrintReportModalOpen(false)}
        title="كشف طباعة جدول الأدوار والاستلام (PDF)"
        maxWidth="max-w-5xl"
      >
        <div id="roles-print-area" className="print-area print-report space-y-4 p-1 sm:p-2 text-app-primary">
          <div className="p-4 bg-slate-50 dark:bg-white/5 rounded-2xl border border-slate-300 dark:border-app space-y-2 text-center">
            <h2 className="text-lg font-black text-app-primary">
              كشف جدول الأدوار واستلام الجمعية — {association.name}
            </h2>
            <p className="text-xs text-app-secondary">
              جدول تسليم واستلام الأدوار الشهرية الرسمية — بداية الجمعية: {formatArabicDate(association.startDate)} | نهاية الجمعية: {formatArabicDate(association.endDate)}
            </p>
            <div className="flex flex-wrap justify-center gap-3 sm:gap-6 text-xs font-bold pt-1 text-sky-700 dark:text-sky-300">
              <span className="bg-sky-50 dark:bg-sky-950/40 px-2.5 py-1 rounded-lg border border-sky-200 dark:border-sky-800">
                قيمة الحصة: {shareVal.toLocaleString()} ج
              </span>
              <span className="bg-sky-50 dark:bg-sky-950/40 px-2.5 py-1 rounded-lg border border-sky-200 dark:border-sky-800">
                إجمالي القبض للدور: {totalPoolPerCycle.toLocaleString()} ج
              </span>
              <span className="bg-sky-50 dark:bg-sky-950/40 px-2.5 py-1 rounded-lg border border-sky-200 dark:border-sky-800">
                عدد الأدوار: {countShares} شهور
              </span>
              <span className="bg-sky-50 dark:bg-sky-950/40 px-2.5 py-1 rounded-lg border border-sky-200 dark:border-sky-800">
                إجمالي المستهدف: {totalAssociationTarget.toLocaleString()} ج
              </span>
            </div>
          </div>

          <div className="border border-slate-300 dark:border-app rounded-xl overflow-x-auto shadow-2xs">
            <table className="w-full text-xs text-right border-collapse table-fixed">
              <thead>
                <tr className="bg-slate-100 dark:bg-white/10 border-b border-slate-300 dark:border-app text-app-primary font-bold">
                  <th className="w-[10%] p-2.5 text-center border-l border-slate-200 dark:border-white/10">رقم الدور</th>
                  <th className="w-[16%] p-2.5 text-center border-l border-slate-200 dark:border-white/10">موعد الاستحقاق</th>
                  <th className="w-[24%] p-2.5 text-right border-l border-slate-200 dark:border-white/10">اسم المستلم</th>
                  <th className="w-[16%] p-2.5 text-center border-l border-slate-200 dark:border-white/10">رقم الهاتف</th>
                  <th className="w-[10%] p-2.5 text-center border-l border-slate-200 dark:border-white/10">النسبة</th>
                  <th className="w-[12%] p-2.5 text-left border-l border-slate-200 dark:border-white/10">مبلغ القبض</th>
                  <th className="w-[12%] p-2.5 text-center">توقيع الاستلام</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-white/10">
                {shares.flatMap((share) => {
                  const shareDueDate = getShareDueDate(association.startDate, share.shareOrder);
                  const shareDueDateFormatted = formatArabicDate(shareDueDate);
                  const contributors = share.contributors || share.share_contributors || [];

                  if (contributors.length === 0) {
                    return [
                      <tr key={`empty-${share.id}`} className="hover:bg-black/5 dark:hover:bg-white/5">
                        <td className="p-2.5 text-center font-bold border-l border-slate-200 dark:border-white/10">#{share.shareOrder}</td>
                        <td className="p-2.5 text-center text-app-secondary border-l border-slate-200 dark:border-white/10">{shareDueDateFormatted}</td>
                        <td className="p-2.5 text-right text-app-secondary border-l border-slate-200 dark:border-white/10">لم يحدد</td>
                        <td className="p-2.5 text-center text-app-secondary border-l border-slate-200 dark:border-white/10 font-mono">-</td>
                        <td className="p-2.5 text-center text-app-secondary border-l border-slate-200 dark:border-white/10">0%</td>
                        <td className="p-2.5 text-left font-bold border-l border-slate-200 dark:border-white/10">0 ج</td>
                        <td className="p-2.5 text-center text-app-secondary font-mono">
                          ___________
                        </td>
                      </tr>,
                    ];
                  }

                  return contributors.map((c, cIdx) => {
                    const person = people.find((p) => p.id === (c.personId ?? c.person_id));
                    const contribAmt = Number(
                      c.monthly_contribution ?? c.monthlyContribution ?? c.contributedAmount ?? c.contributed_amount
                    ) || 0;
                    const pct = calculatePercentage(contribAmt, shareVal);
                    const payout = calculatePayoutAmount(pct, totalPoolPerCycle);

                    return (
                      <tr
                        key={`${share.id}-${cIdx}`}
                        className="hover:bg-black/5 dark:hover:bg-white/5 odd:bg-transparent even:bg-slate-50/50 dark:even:bg-white/[0.02]"
                      >
                        <td className="p-2.5 text-center font-bold border-l border-slate-200 dark:border-white/10">#{share.shareOrder}</td>
                        <td className="p-2.5 text-center text-app-secondary border-l border-slate-200 dark:border-white/10">{shareDueDateFormatted}</td>
                        <td className="p-2.5 text-right font-bold text-app-primary border-l border-slate-200 dark:border-white/10 break-words">{person?.name || "عضو"}</td>
                        <td className="p-2.5 text-center text-app-secondary font-mono border-l border-slate-200 dark:border-white/10">{person?.phone || "-"}</td>
                        <td className="p-2.5 text-center text-app-secondary border-l border-slate-200 dark:border-white/10">{pct}%</td>
                        <td className="p-2.5 text-left font-bold text-sky-700 dark:text-sky-300 border-l border-slate-200 dark:border-white/10 whitespace-nowrap">
                          {payout.toLocaleString()} ج
                        </td>
                        <td className="p-2.5 text-center text-app-secondary font-mono">
                          ___________
                        </td>
                      </tr>
                    );
                  });
                })}
              </tbody>
            </table>
          </div>

          <div className="pt-3 border-t border-slate-200 dark:border-white/10 flex flex-col sm:flex-row justify-between items-center gap-3 text-xs text-app-secondary">
            <div>
              <span>تاريخ استخراج التقرير: {formatArabicDate(new Date())}</span>
              <span className="mx-2">•</span>
              <span>نظام جمعيتي الرسمي</span>
            </div>
            <div className="text-center font-bold text-app-primary">
              <span>توقيع مسؤول الجمعية: ____________________</span>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-3 border-t border-app no-print">
          <Button variant="secondary" onClick={() => setIsPrintReportModalOpen(false)}>
            إغلاق
          </Button>
          <Button variant="primary" onClick={handlePrintRoles}>
            <Printer className="w-4 h-4" />
            <span>طباعة المستند (Ctrl + P)</span>
          </Button>
        </div>
      </Modal>

      {/* PRINTABLE PDF REPORT MODAL — MEMBER STATEMENT */}
      {(() => {
        const targetPerson = people.find((p) => p.id === selectedPersonForExport);
        if (!targetPerson) return null;

        const memberMonthlyDue = calculateMonthlyDue(shares, targetPerson.id, shareVal);
        const memberTotalDue = memberMonthlyDue * countShares;
        const memberPayments = enrichedPayments.filter((p) => String(p.personId) === String(targetPerson.id));
        const memberPaidTotal = memberPayments.reduce((sum, p) => {
          const isPay = (p.paymentType || p.payment_type) === "payment";
          const amt = Number(p.amount || p.paid_amount) || 0;
          return isPay ? sum + amt : sum - amt;
        }, 0);
        const memberRemainingTotal = Math.max(0, memberTotalDue - memberPaidTotal);

        const memberTurns = [];
        shares.forEach((sh) => {
          const contribs = (sh.contributors || []).filter(
            (c) => String(c.personId ?? c.person_id) === String(targetPerson.id)
          );
          contribs.forEach((c) => {
            const contribAmt = Number(
              c.monthly_contribution ?? c.monthlyContribution ?? c.contributedAmount ?? c.contributed_amount
            ) || 0;
            const pct = calculatePercentage(contribAmt, shareVal);
            const payout = calculatePayoutAmount(pct, totalPoolPerCycle);
            const dueDate = getShareDueDate(association.startDate, sh.shareOrder);
            memberTurns.push({
              shareOrder: sh.shareOrder,
              dueDateFormatted: formatArabicDate(dueDate),
              percentage: pct,
              payoutAmount: payout,
              isDelivered: Boolean(sh.isDelivered),
            });
          });
        });

        let memberStatusBadgeVariant = "warning";
        let memberStatusText = "لم يبدأ السداد";
        if (memberRemainingTotal === 0 && memberTotalDue > 0) {
          memberStatusBadgeVariant = "success";
          memberStatusText = "مسدد بالكامل";
        } else if (memberPaidTotal > 0) {
          memberStatusBadgeVariant = "info";
          memberStatusText = "سداد جاري ومستمر";
        }

        return (
          <Modal
            isOpen={isPrintMemberModalOpen}
            onClose={() => setIsPrintMemberModalOpen(false)}
            title="كشف حساب وموقف مالي لعضو الجمعية (PDF)"
            maxWidth="max-w-4xl"
          >
            <div id="member-print-area" className="print-area print-report space-y-4 p-1 sm:p-2 text-app-primary">
              {/* Document Header */}
              <div className="p-4 bg-slate-50 dark:bg-white/5 rounded-2xl border border-slate-300 dark:border-app space-y-2 text-center">
                <div className="flex justify-between items-center text-xs text-app-secondary border-b border-slate-200 dark:border-white/10 pb-2">
                  <span>منظومة جمعيتي (GM3ETY)</span>
                  <span className="font-bold">كشف حساب عضو معتمد</span>
                  <span>تاريخ الإصدار: {formatArabicDate(new Date())}</span>
                </div>
                <h2 className="text-lg font-black text-app-primary pt-1">
                  كشف حساب وموقف مالي — {association.name}
                </h2>
                <p className="text-xs text-app-secondary">
                  تاريخ بداية الجمعية: {formatArabicDate(association.startDate)} | تاريخ نهاية الجمعية: {formatArabicDate(association.endDate)} | إجمالي المدة: {countShares} شهور
                </p>
              </div>

              {/* Member Profile & Financial Status */}
              <div className="p-4 rounded-xl border border-slate-300 dark:border-app bg-white dark:bg-white/5 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200 dark:border-white/10 pb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-sky-700 text-white flex items-center justify-center font-bold text-sm">
                      {targetPerson.name.charAt(0)}
                    </div>
                    <div>
                      <h3 className="text-base font-black text-app-primary flex items-center gap-2">
                        <span>{targetPerson.name}</span>
                        <span className="text-xs font-normal text-app-secondary font-mono">({targetPerson.phone || "بدون هاتف"})</span>
                      </h3>
                      <span className="text-xs text-app-secondary">الموقف المالي الشامل للعضو داخل الجمعية</span>
                    </div>
                  </div>
                  <Badge variant={memberStatusBadgeVariant} className="self-start sm:self-auto text-xs py-1 px-3">
                    حالة العضو: {memberStatusText}
                  </Badge>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-center">
                  <div className="p-2.5 rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/[0.02]">
                    <span className="text-[11px] text-app-secondary block">القسط الشهري:</span>
                    <strong className="text-sm font-black text-app-primary">
                      {memberMonthlyDue.toLocaleString()} ج.م
                    </strong>
                  </div>
                  <div className="p-2.5 rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/[0.02]">
                    <span className="text-[11px] text-app-secondary block">إجمالي المطلوب (كامل الجمعية):</span>
                    <strong className="text-sm font-black text-app-primary">
                      {memberTotalDue.toLocaleString()} ج.م
                    </strong>
                  </div>
                  <div className="p-2.5 rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/[0.02]">
                    <span className="text-[11px] text-app-secondary block">إجمالي ما دفعه:</span>
                    <strong className="text-sm font-black text-emerald-600 dark:text-emerald-400">
                      {memberPaidTotal.toLocaleString()} ج.م
                    </strong>
                  </div>
                  <div className="p-2.5 rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/[0.02]">
                    <span className="text-[11px] text-app-secondary block">المتبقي عليه:</span>
                    <strong className="text-sm font-black text-rose-600 dark:text-rose-400">
                      {memberRemainingTotal.toLocaleString()} ج.م
                    </strong>
                  </div>
                </div>
              </div>

              {/* Member Turns Table */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold text-app-primary">
                  جدول أدوار الاستلام (القبض) الخاصة بالعضو:
                </h4>
                {memberTurns.length === 0 ? (
                  <div className="p-3 text-center text-xs text-app-secondary border border-dashed border-slate-300 dark:border-white/20 rounded-xl">
                    لا توجد أدوار استلام مسجلة لهذا العضو في هذه الجمعية (عضو مساهم فقط).
                  </div>
                ) : (
                  <div className="border border-slate-300 dark:border-app rounded-xl overflow-x-auto shadow-2xs">
                    <table className="w-full text-xs text-right border-collapse table-fixed">
                      <thead>
                        <tr className="bg-slate-100 dark:bg-white/10 border-b border-slate-300 dark:border-app font-bold">
                          <th className="w-[15%] p-2.5 text-center border-l border-slate-200 dark:border-white/10">رقم الدور</th>
                          <th className="w-[25%] p-2.5 text-center border-l border-slate-200 dark:border-white/10">موعد الاستحقاق</th>
                          <th className="w-[20%] p-2.5 text-center border-l border-slate-200 dark:border-white/10">نسبة المساهمة</th>
                          <th className="w-[20%] p-2.5 text-left border-l border-slate-200 dark:border-white/10">مبلغ القبض</th>
                          <th className="w-[20%] p-2.5 text-center">حالة الاستلام</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 dark:divide-white/10">
                        {memberTurns.map((turn, tIdx) => (
                          <tr key={`turn-${tIdx}`} className="odd:bg-transparent even:bg-slate-50/50 dark:even:bg-white/[0.02]">
                            <td className="p-2.5 text-center font-bold border-l border-slate-200 dark:border-white/10">#{turn.shareOrder}</td>
                            <td className="p-2.5 text-center text-app-secondary border-l border-slate-200 dark:border-white/10">{turn.dueDateFormatted}</td>
                            <td className="p-2.5 text-center text-app-secondary border-l border-slate-200 dark:border-white/10">{turn.percentage}%</td>
                            <td className="p-2.5 text-left font-bold text-sky-700 dark:text-sky-300 border-l border-slate-200 dark:border-white/10">
                              {turn.payoutAmount.toLocaleString()} ج.م
                            </td>
                            <td className="p-2.5 text-center">
                              {turn.isDelivered ? (
                                <span className="text-emerald-700 dark:text-emerald-300 font-bold">تم الاستلام ✓</span>
                              ) : (
                                <span className="text-slate-500 font-semibold">في الانتظار ⏳</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Signatures & Notes */}
              <div className="pt-4 border-t border-slate-300 dark:border-white/10 space-y-4">
                <div className="p-2.5 rounded-lg border border-dashed border-slate-300 dark:border-white/20 text-xs text-app-secondary">
                  <strong>ملاحظات:</strong> ............................................................................................................................................
                </div>

                <div className="grid grid-cols-2 gap-8 text-xs text-center pt-2">
                  <div className="space-y-6">
                    <p className="font-bold text-app-primary">توقيع العضو المستلم / المساهم</p>
                    <div className="border-b border-dashed border-slate-400 w-3/4 mx-auto"></div>
                  </div>
                  <div className="space-y-6">
                    <p className="font-bold text-app-primary">توقيع واعتماد مسؤول الجمعية</p>
                    <div className="border-b border-dashed border-slate-400 w-3/4 mx-auto"></div>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap justify-between items-center gap-2 pt-3 border-t border-app no-print">
              <Button
                variant="outline"
                size="sm"
                className="text-xs"
                onClick={() => exportSinglePersonToExcel(association, targetPerson, shares, enrichedPayments)}
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                <span>تحميل كشف Excel للعضو</span>
              </Button>
              <div className="flex gap-2">
                <Button variant="secondary" onClick={() => setIsPrintMemberModalOpen(false)}>
                  إغلاق
                </Button>
                <Button variant="primary" onClick={handlePrintMember}>
                  <Printer className="w-4 h-4" />
                  <span>طباعة / حفظ PDF (Ctrl + P)</span>
                </Button>
              </div>
            </div>
          </Modal>
        );
      })()}

      {/* MOBILE LOCK INFO MODAL */}
      <Modal
        isOpen={isMobileLockInfoOpen}
        onClose={() => setIsMobileLockInfoOpen(false)}
        title="حالة القفل المالي للجمعية"
      >
        <div className="space-y-3 text-xs leading-relaxed text-app-primary">
          <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400 font-bold">
            <Lock className="w-4 h-4" />
            <span>الجمعية في مرحلة التحصيل المالي النشط</span>
          </div>
          <p className="text-app-secondary">
            نظراً لوجود مدفوعات مسجلة بالفعل، تم إقفال تعديل أو حذف أو إضافة الأعضاء والأسهم تلقائياً لحماية الحسابات والالتزامات المالية المتبادلة بين المشتركين.
          </p>
          <div className="flex justify-end pt-2">
            <Button variant="secondary" onClick={() => setIsMobileLockInfoOpen(false)}>
              إغلاق
            </Button>
          </div>
        </div>
      </Modal>

      {/* RENEW MODAL */}
      <Modal
        isOpen={isRenewModalOpen}
        onClose={() => setIsRenewModalOpen(false)}
        title="تجديد دورة جديدة لنفس الجمعية"
      >
        <div className="space-y-4">
          <p className="text-xs text-app-secondary">
            سيتم نسخ كافة أسماء الأعضاء والحصص والمساهمات إلى نموذج إنشاء جمعية جديدة بضغطة واحدة مع تحديد تاريخ بداية جديد.
          </p>

          <Input
            label="تاريخ بداية الدورة الجديدة"
            type="date"
            value={renewStartDate}
            onChange={(e) => setRenewStartDate(e.target.value)}
            required
          />

          <div className="flex justify-end gap-2 pt-2 border-t border-app">
            <Button variant="secondary" onClick={() => setIsRenewModalOpen(false)}>
              إلغاء
            </Button>
            <Button variant="primary" onClick={handleRenewAssociation}>
              متابعة لإنشاء الدورة الجديدة
            </Button>
          </div>
        </div>
      </Modal>

      {/* DELETE MODAL */}
      <Modal
        isOpen={isDeleteModalOpen}
        onClose={() => {
          if (!deletingAssoc) {
            setIsDeleteModalOpen(false);
            setDeleteAssocError(null);
          }
        }}
        title="حذف الجمعية نهائياً"
      >
        <div className="space-y-4 text-center">
          <Trash2 className="w-12 h-12 text-rose-500 mx-auto" />
          <h3 className="text-base font-bold text-app-primary">
            هل أنت متأكد من رغبتك في حذف هذه الجمعية؟
          </h3>
          <p className="text-xs text-app-secondary leading-relaxed">
            سيتم حذف الجمعية وكافة الحصص والأعضاء وسجلات الدفع المرتبطة بها نهائياً.
          </p>

          {deleteAssocError && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-xs font-semibold text-right flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{deleteAssocError}</span>
            </div>
          )}

          <div className="flex justify-center gap-3 pt-2">
            <Button
              variant="secondary"
              onClick={() => {
                setIsDeleteModalOpen(false);
                setDeleteAssocError(null);
              }}
              disabled={deletingAssoc}
            >
              إلغاء
            </Button>
            <Button variant="danger" onClick={handleDeleteAssociation} disabled={deletingAssoc}>
              {deletingAssoc ? "جاري الحذف..." : "تأكيد الحذف النهائي"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Wallet,
  PlusCircle,
  Users,
  PieChart,
  Trash2,
  ArrowLeft,
  Sparkles,
  ShieldCheck,
  Lock,
  UserCheck,
  AlertCircle,
} from "lucide-react";
import { api } from "../services/api";
import { useAuth } from "../context/AuthContext";
import Button from "../components/ui/Button";
import Card from "../components/ui/Card";
import Badge from "../components/ui/Badge";
import Modal from "../components/ui/Modal";

export default function HomePage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [associations, setAssociations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState("all"); // 'all' | 'active' | 'completed'

  // Delete modal state
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [associationToDelete, setAssociationToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState(null);

  useEffect(() => {
    fetchAssociations();
  }, [user]);

  const fetchAssociations = async () => {
    setLoading(true);
    try {
      if (user) {
        const data = await api.getAssociations();
        setAssociations(data.filter((a) => String(a.userId) === String(user.id)));
      } else {
        setAssociations([]);
      }
    } catch (err) {
      console.error("خطأ في جلب الجمعيات:", err);
    } finally {
      setLoading(false);
    }
  };

  const confirmDeleteAssociation = (assoc) => {
    setAssociationToDelete(assoc);
    setDeleteError(null);
    setDeleteModalOpen(true);
  };

  const handleDeleteAssociation = async () => {
    if (!associationToDelete?.id) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      const id = associationToDelete.id;
      await api.deleteAssociation(id);
      setAssociations((prev) => prev.filter((a) => a.id !== id));
      setDeleteModalOpen(false);
      setAssociationToDelete(null);
    } catch (err) {
      console.error("Delete Error:", err);
      setDeleteError(err?.message || "حدث خطأ غير متوقع أثناء حذف الجمعية");
    } finally {
      setDeleting(false);
    }
  };

  const filteredAssociations = associations.filter((item) => {
    if (filterStatus === "active") return item.status === "active";
    if (filterStatus === "completed") return item.status === "completed";
    return true;
  });

  return (
    <div className="space-y-8 pb-12">
      {/* HERO SECTION */}
      <section className="relative overflow-hidden rounded-3xl bg-linear-to-br from-sky-700 via-sky-800 to-indigo-900 text-white p-6 md:p-10 shadow-lg">
        <div className="absolute -left-10 -bottom-10 w-64 h-64 bg-white/10 rounded-full blur-2xl pointer-events-none" />
        <div className="absolute -right-10 -top-10 w-64 h-64 bg-sky-400/20 rounded-full blur-2xl pointer-events-none" />

        <div className="relative z-10 max-w-3xl space-y-5">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/15 backdrop-blur-md text-sky-100 text-xs font-semibold border border-white/20">
            <Sparkles className="w-4 h-4 text-amber-300" />
            <span>نظام إداري حديث ومبتكر للجمعيات الادخارية</span>
          </div>

          <h1 className="text-3xl md:text-5xl font-black leading-tight text-white">
            جمعيتي – Gam3ety <br />
            <span className="text-sky-200 text-xl md:text-2xl font-bold">
              إدارة مرنة بدون تعقيد أو قيود
            </span>
          </h1>

          <p className="text-sky-100/90 text-sm md:text-base leading-relaxed max-w-2xl">
            منصتك الاحترافية لإدارة جمعيات الادخار الدورية. احسب الحصص والمستحقات، ونظّم
            المساهمين والنسب المئوية، مع سرية تامة وتصدير كشوفات PDF و Excel بكل سهولة.
          </p>

          {/* Quick Action Buttons */}
          <div className="flex flex-wrap items-center gap-3 pt-2">
            <Link to={user ? "/create" : "/auth"}>
              <Button size="lg" className="bg-amber-400 hover:bg-amber-500 text-slate-900 font-bold border-none shadow-md">
                <PlusCircle className="w-5 h-5" />
                <span>{user ? "بدء جمعية جديدة" : "تسجيل الدخول لبدء جمعية"}</span>
              </Button>
            </Link>

            {!user && (
              <Link to="/auth">
                <Button size="lg" variant="outline" className="border-white/30 text-white hover:bg-white/10">
                  <UserCheck className="w-5 h-5" />
                  <span>حساب منظم جديد</span>
                </Button>
              </Link>
            )}
          </div>
        </div>
      </section>

      {/* CORE FEATURES HIGHLIGHT */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="border-sky-500/50 hover:border-0 hover:shadow-black transition-all">
          <div className="w-12 h-12 rounded-2xl bg-sky-500/10 text-sky-600 dark:text-sky-400 flex items-center justify-center mb-4">
            <Users className="w-6 h-6" />
          </div>
          <h3 className="text-lg font-bold text-app-primary mb-2">عدد الأشخاص مستقل عن الحصص</h3>
          <p className="text-xs text-app-secondary leading-relaxed">
            يمكن لأي عدد من الأشخاص المشاركة في أي عدد من الحصص (مثل 16 شخصاً في جمعية من 10 حصص).
          </p>
        </Card>

        <Card className="border-emerald-500/50 hover:border-0 hover:shadow-black transition-all">
          <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mb-4">
            <PieChart className="w-6 h-6" />
          </div>
          <h3 className="text-lg font-bold text-app-primary mb-2">حصة كاملة أو متقسمة</h3>
          <p className="text-xs text-app-secondary leading-relaxed">
            الشخص يمكنه امتلاك حصة كاملة أو المساهمة بنسبة جزئية، ويقوم النظام بحساب مبالغ الاستلام والنسب تلقائياً.
          </p>
        </Card>

        <Card className="border-indigo-500/50 hover:border-0 hover:shadow-black transition-all">
          <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mb-4">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <h3 className="text-lg font-bold text-app-primary mb-2">خصوصية تامة للبيانات</h3>
          <p className="text-xs text-app-secondary leading-relaxed">
            بيانات الجمعيات خاصة بمنظم الجمعية فقط ولا يمكن لأي مستخدم آخر الوصول إليها.
          </p>
        </Card>
      </section>

      {/* MY ASSOCIATIONS SECTION */}
      <section className="space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-app pb-4">
          <div>
            <h2 className="text-2xl font-black text-app-primary flex items-center gap-2">
              <Wallet className="w-6 h-6 text-app-secondary" />
              <span>{user ? `جمعيات المنظم (${user.name})` : "جمعياتي الخاضعة للإدارة"}</span>
            </h2>
            <p className="text-xs text-app-secondary mt-1">
              {user
                ? "إدارة متابعة الأدوار وحالات السداد والتصدير لجمعياتك."
                : "قم بتسجيل الدخول للاطلاع على جمعياتك الخاصة بخصوصية وأمان 100%."}
            </p>
          </div>

          {user && (
            <div className="flex items-center gap-2 bg-black/5 dark:bg-white/5 p-1 rounded-xl border border-app text-xs font-semibold">
              <button
                onClick={() => setFilterStatus("all")}
                className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                  filterStatus === "all"
                    ? "btn-app-primary text-white shadow-xs"
                    : "text-app-primary hover:bg-black/5 dark:hover:bg-white/10"
                }`}
              >
                الكل ({associations.length})
              </button>
              <button
                onClick={() => setFilterStatus("active")}
                className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                  filterStatus === "active"
                    ? "btn-app-primary text-white shadow-xs"
                    : "text-app-primary hover:bg-black/5 dark:hover:bg-white/10"
                }`}
              >
                النشطة ({associations.filter((a) => a.status === "active").length})
              </button>
              <button
                onClick={() => setFilterStatus("completed")}
                className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                  filterStatus === "completed"
                    ? "btn-app-primary text-white shadow-xs"
                    : "text-app-primary hover:bg-black/5 dark:hover:bg-white/10"
                }`}
              >
                المنتهية ({associations.filter((a) => a.status === "completed").length})
              </button>
            </div>
          )}
        </div>

        {/* If user is NOT logged in: Privacy Guard Banner */}
        {!user ? (
          <Card className="text-center py-12 space-y-4 border-dashed border-2 border-sky-400/40">
            <div className="w-16 h-16 rounded-full bg-sky-500/10 text-sky-600 dark:text-sky-400 flex items-center justify-center mx-auto">
              <Lock className="w-8 h-8" />
            </div>
            <div className="max-w-md mx-auto space-y-1">
              <h3 className="text-lg font-bold text-app-primary">بيانات الجمعيات محمية وتخضع للخصوصية</h3>
              <p className="text-xs text-app-secondary leading-relaxed">
                لكل منظم حساب خاص به ورقم موبايل ومفتاح أمان. يرجى تسجيل الدخول لعرض وتتبع جمعياتك.
              </p>
            </div>
            <div className="pt-2">
              <Link to="/auth">
                <Button variant="primary" size="md">
                  <UserCheck className="w-4 h-4" />
                  <span>تسجيل الدخول إلى حساب المنظم</span>
                </Button>
              </Link>
            </div>
          </Card>
        ) : loading ? (
          <div className="py-12 text-center text-app-secondary animate-pulse font-medium">
            جاري تحميل الجمعيات الخاصة بك...
          </div>
        ) : filteredAssociations.length === 0 ? (
          <Card className="text-center py-12 space-y-4">
            <div className="w-16 h-16 rounded-full bg-black/5 dark:bg-white/5 flex items-center justify-center mx-auto text-app-secondary">
              <Wallet className="w-8 h-8" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-app-primary">لا توجد جمعيات خاصة بحسابك حالياً</h3>
              <p className="text-xs text-app-secondary mt-1">
                قم بإنشاء أول جمعية لك الآن لإضافة الأعضاء والحصص.
              </p>
            </div>
            <Link to="/create" className="inline-block">
              <Button variant="primary" size="md">
                <PlusCircle className="w-4 h-4" />
                <span>إنشاء جمعية جديدة</span>
              </Button>
            </Link>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {filteredAssociations.map((assoc) => {
              const totalPoolPerCycle = (assoc.shareValue || 0) * (assoc.totalShares || 0);

              return (
                <Card
                  key={assoc.id}
                  className="flex flex-col justify-between hover:shadow-lg transition-all border border-app hover:border-app-secondary"
                >
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-bold text-lg text-app-primary leading-snug">
                        {assoc.name}
                      </h3>

                      <Badge
                        variant={
                          assoc.status === "completed"
                            ? "success"
                            : assoc.status === "active"
                            ? "info"
                            : "warning"
                        }
                      >
                        {assoc.status === "completed"
                          ? "منتهية"
                          : assoc.status === "active"
                          ? "نشطة"
                          : "مسودة"}
                      </Badge>
                    </div>

                    <div className="grid grid-cols-2 gap-2 bg-black/5 dark:bg-white/5 p-3 rounded-xl text-xs">
                      <div>
                        <span className="text-app-secondary block">قيمة الحصة:</span>
                        <strong className="text-app-primary text-sm">
                          {assoc.shareValue?.toLocaleString()} ج
                        </strong>
                      </div>
                      <div>
                        <span className="text-app-secondary block">عدد الحصص/الشهور:</span>
                        <strong className="text-app-primary text-sm">
                          {assoc.totalShares} حصة
                        </strong>
                      </div>
                      <div className="col-span-2 pt-2 border-t border-app/50 flex justify-between items-center">
                        <span className="text-app-secondary">إجمالي القبض شهرياً:</span>
                        <strong className="text-sky-600 dark:text-sky-400 text-sm font-extrabold">
                          {totalPoolPerCycle.toLocaleString()} جنيه
                        </strong>
                      </div>
                    </div>
                  </div>

                  <div className="pt-4 mt-4 border-t border-app flex items-center justify-between gap-2">
                    <button
                      onClick={() => navigate(`/association/${assoc.id}`)}
                      className="flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-xl btn-app-primary text-white font-semibold text-xs hover:opacity-90 transition-opacity cursor-pointer"
                    >
                      <span>تفاصيل الجمعية والتصدير</span>
                      <ArrowLeft className="w-4 h-4" />
                    </button>

                    <button
                      onClick={() => confirmDeleteAssociation(assoc)}
                      className="p-2 rounded-xl text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors border border-rose-200 dark:border-rose-900/50 cursor-pointer"
                      title="حذف الجمعية نهائياً"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      {/* DELETE CONFIRMATION MODAL */}
      <Modal
        isOpen={deleteModalOpen}
        onClose={() => setDeleteModalOpen(false)}
        title="تأكيد مسح الجمعية نهائياً"
      >
        <div className="space-y-5 text-center">
          <div className="w-16 h-16 rounded-2xl bg-rose-500/10 text-rose-600 dark:text-rose-400 flex items-center justify-center mx-auto border border-rose-500/20 shadow-xs">
            <Trash2 className="w-8 h-8 stroke-2" />
          </div>

          <div className="space-y-1.5">
            <h3 className="text-lg font-black text-app-primary">
              هل أنت متأكد من حذف جمعية ({associationToDelete?.name})؟
            </h3>
            <p className="text-xs text-app-secondary leading-relaxed max-w-sm mx-auto">
              تنبيه هام: سيتم مسح هذه الجمعية وكافة بيانات المشتركين والحصص التابعة لها نهائياً من قاعدة البيانات، ولن تتمكن من التراجع عن هذه الخطوة.
            </p>
          </div>

          {deleteError && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-xs font-semibold text-right flex items-start gap-2 max-w-sm mx-auto">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{deleteError}</span>
            </div>
          )}

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-3 border-t border-app">
            <Button
              variant="secondary"
              className="w-full sm:w-auto"
              onClick={() => {
                setDeleteModalOpen(false);
                setDeleteError(null);
              }}
              disabled={deleting}
            >
              إلغاء والتراجع
            </Button>
            <Button
              variant="danger"
              className="w-full sm:w-auto"
              onClick={handleDeleteAssociation}
              disabled={deleting}
            >
              <Trash2 className="w-4 h-4" />
              <span>{deleting ? "جاري الحذف النهائي..." : "تأكيد مسح الجمعية نهائياً"}</span>
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

import React, { useState } from "react";
import {
  X,
  ChevronRight,
  ChevronLeft,
  CheckCircle2,
  Calendar,
  UserPlus,
  Layers,
  Lock,
  ArrowLeftRight,
  FileSpreadsheet,
  FileText,
  Sparkles,
  HelpCircle,
  ShieldCheck,
  Check,
  Phone,
  User,
  Clock,
  Printer,
  Share2,
  RotateCw,
  SlidersHorizontal,
  Coins
} from "lucide-react";
import Modal from "../ui/Modal";

const GUIDE_STEPS = [
  {
    id: 1,
    title: "إعداد الجمعية وتفاصيلها الأساسية",
    subtitle: "تحديد اسم الجمعية، قيمة القسط، عدد الشهور، وتاريخ أول دفعة",
    icon: Calendar,
    color: "from-sky-500 to-blue-600",
    bullets: [
      {
        title: "اسم الجمعية:",
        desc: "اكتب اسم مميز لجمعيتك تعرفه بيه (زي: جمعية العيلة، جمعية الشغل، أو جمعية الخير)."
      },
      {
        title: "قيمة القسط الشهري:",
        desc: "المبلغ الثابت اللي هيدفعه كل سهم في ميعاد السداد من كل شهر."
      },
      {
        title: "مدة الجمعية وتاريخ البداية:",
        desc: "بتحدد مدة الجمعية بالشهور وتاريخ أول قسط عشان المشتركين يجهّزوا أمورهم."
      },
      {
        title: "الميزان المظبوط:",
        desc: "لازم عدد الأسهم يساوي عدد الشهور بالظبط (مثلاً 10 شهور = 10 أسهم) عشان كل شهر يكون له سهم كامل يتقبض."
      }
    ],
    tip: "فكرة ممتازة: اختار يوم بداية يناسب مواعيد نزول المرتبات، علشان السداد يكون سهل ومنتظم للجميع."
  },
  {
    id: 2,
    title: "إضافة المشتركين بسهولة",
    subtitle: "إدخال المشتركين واحد واحد أو لصق القائمة كلها مرة واحدة",
    icon: UserPlus,
    color: "from-emerald-500 to-teal-600",
    bullets: [
      {
        title: "إدخال فردي سريع:",
        desc: "بتسجل اسم العضو ورقم موبايله في ثواني معدودة."
      },
      {
        title: "لصق القائمة مرة واحدة (Bulk Import):",
        desc: "لو عندك قائمة بالأسماء والأرقام على الواتساب، انسخها والصقها هنا كلها بضغطة واحدة والنظام بيرتبهم فوراً."
      },
      {
        title: "أهمية أرقام الموبايل:",
        desc: "بتساعدك تتواصل مع الأعضاء وتبعث لهم كشوف الحساب ومواعيدهم بكل سهولة."
      },
      {
        title: "حرية التعديل:",
        desc: "تقدر تعدل أو تحذف أي عضو براحتك في أي وقت قبل ما تبدأ في تحصيل الفلوس."
      }
    ],
    tip: "توفير وقت كبير: ميزة اللصق السريع بتغنيك عن كتابة الأسماء واحداً تلو الآخر، جربها وهتلاحظ سهولتها."
  },
  {
    id: 3,
    title: "توزيع أدوار القبض والأنصبة",
    subtitle: "مين يقبض في أي شهر، مع إمكانية الاشتراك بنصف سهم أو ربع سهم",
    icon: Layers,
    color: "from-indigo-500 to-purple-600",
    bullets: [
      {
        title: "تحديد شهر القبض:",
        desc: "بتختار لكل مشترك الشهر اللي يناسبه عشان يستلم فيه مبلغ الجمعية المتفق عليه."
      },
      {
        title: "مشاركة بنصف أو ربع سهم:",
        desc: "لو عضو مش هيقدر يدفع سهم كامل، يقدر يشترك بنص سهم (0.5) أو ربع سهم (0.25)."
      },
      {
        title: "عضوين في نفس الشهر:",
        desc: "في حالة الأسهم المجزأة، يقدر اتنين يشتركوا سوا في نفس شهر القبض، والمبلغ يتقسم بينهم بالعدل."
      },
      {
        title: "مؤشر التوزيع التام:",
        desc: "النظام بيوضحلك في شريط لطيف إن كل الشهور اتوزعت بالكامل ومفيش أي شهر ناقص."
      }
    ],
    tip: "مرونة عالية: العضو الواحد يقدر كمان يشترك بأكتر من سهم لو حابب يقبض أكتر من مرة خلال الجمعية."
  },
  {
    id: 4,
    title: "متابعة السداد والتحصيل الشهري",
    subtitle: "تسجيل الأقساط أولاً بأول، وحفظ الحسابات تلقائياً",
    icon: Lock,
    color: "from-amber-500 to-orange-600",
    bullets: [
      {
        title: "تسجيل الدفع بضغطة زر:",
        desc: "أول ما المشترك يدفع قسطه، بتضغط قصاد اسمه (تم الدفع) وبكده خلاص اتسجل."
      },
      {
        title: "شاشة متابعة واضحة:",
        desc: "بتشوف مين دفع ومين لسه بنظرة واحدة وبألوان مميزة ومريحة."
      },
      {
        title: "حماية وأمان الحسابات:",
        desc: "أول ما تسجل أول دفعة، النظام بيثبت هيكل الجمعية تلقائياً عشان يحافظ على حقوق كل الأعضاء وميلخبطش الفلوس."
      },
      {
        title: "حساب السيولة المجمّعة:",
        desc: "النظام بيحسب تلقائياً إجمالي المبالغ اللي اتجمّعت ونسبة التحصيل لكل شهر."
      }
    ],
    tip: "ملاحظة مهمة: تسجيل الأقساط بانتظام أول بأول بيمنع أي نسيان ويضمن الشفافية وراحة البال للجميع."
  },
  {
    id: 5,
    title: "تسليم القبض وتبديل الأدوار",
    subtitle: "توثيق استلام مبلغ الشهر، وتبديل المواعيد بين الأعضاء بكل سهولة",
    icon: ArrowLeftRight,
    color: "from-violet-500 to-fuchsia-600",
    bullets: [
      {
        title: "توثيق تسليم المبلغ:",
        desc: "أول ما المستحق يستلم فلوس الجمعية في شهره، بتضغط زر (تم التسليم) لتوثيق الاستلام رسمياً."
      },
      {
        title: "تبديل المواعيد بين المشتركين:",
        desc: "تقدر تبدّل ميعاد القبض بين أي عضوين بضغطة زر واحدة، والنظام بيظبط المواعيد تلقائياً."
      },
      {
        title: "أمان وسرعة:",
        desc: "التبديل بيتم في لحظة بدون أي تعقيد وبدون أي تأثير على سلامة الحسابات ومواعيد باقي الأعضاء."
      },
      {
        title: "حفظ سجل المدفوعات:",
        desc: "لو بدلت ميعاد القبض بين عضوين، كل الدفعات السابقة اللي دفعوها بتفضل محفوظة زي ما هي من غير أي تغيير."
      }
    ],
    tip: "حل عملي: لو حد حصلت له ظروف طارئة ومحتاج يقبض بدري، تقدر تبدل دوره فوراً مع عضو تاني يكون متفق معاه."
  },
  {
    id: 6,
    title: "كشوف الحساب وتجديد الجمعية",
    subtitle: "طباعة تقارير A4، تصدير ملفات إكسيل، وتجديد دورة جديدة",
    icon: FileSpreadsheet,
    color: "from-rose-500 to-red-600",
    bullets: [
      {
        title: "كشف حساب مفصل للمشترك (PDF):",
        desc: "بتطلع كشف شيك ومرتب بمقاس A4 لكل عضو، مكتوب فيه أسهمه وشهور دفعه وميعاد قبضه."
      },
      {
        title: "كشف الجمعية الشامل (Excel):",
        desc: "تقدر تنزل جدول الجمعية بالكامل في ملف إكسيل عشان تحتفظ بنسخة عندك في أي وقت."
      },
      {
        title: "مشاركة كشف الحساب عبر واتساب (قريباً ⏳):",
        desc: "ميزة قادمة تتيح لك إرسال كشف الحساب وتذكيرات الأقساط مباشرة لرقم المشترك على واتساب."
      },
      {
        title: "تجديد الدورة بضغطة واحدة:",
        desc: "لما الجمعية تخلص، تقدر تبدأ دورة جديدة على طول بنفس الأعضاء والأسهم بدون ما تضطر تكتبهم من أول وجديد."
      }
    ],
    tip: "الوضوح سر النجاح: مشاركة الكشوف المعتمدة مع الأعضاء بتزرع الثقة وبتمنع أي لبس أو خلاف."
  }
];

// Miniature realistic mockups simulating actual GM3ETY UI screens
function StepMockup({ stepId }) {
  switch (stepId) {
    case 1:
      return (
        <div className="w-full max-w-lg mx-auto bg-card-app border border-app rounded-xl p-3 sm:p-4 text-right shadow-xs space-y-3">
          <div className="flex items-center justify-between border-b border-app pb-2">
            <span className="text-xs font-bold text-app-primary flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-sky-600" />
              بيانات الجمعية الأساسية
            </span>
            <span className="text-[10px] bg-sky-100 dark:bg-sky-950 text-sky-700 dark:text-sky-300 font-bold px-2 py-0.5 rounded-full">
              خطوة 1 من 4
            </span>
          </div>

          <div className="space-y-2">
            <div>
              <span className="text-[11px] text-app-secondary font-semibold block mb-1">اسم الجمعية</span>
              <div className="px-3 py-1.5 rounded-lg bg-app border border-app text-xs font-bold text-app-primary">
                جمعية الأصدقاء 2026
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <span className="text-[11px] text-app-secondary font-semibold block mb-1">قيمة السهم الشهري</span>
                <div className="px-3 py-1.5 rounded-lg bg-app border border-app text-xs font-bold text-emerald-600 dark:text-emerald-400">
                  2,000 ج.م
                </div>
              </div>
              <div>
                <span className="text-[11px] text-app-secondary font-semibold block mb-1">عدد الشهور (الأسهم)</span>
                <div className="px-3 py-1.5 rounded-lg bg-app border border-app text-xs font-bold text-app-primary">
                  10 شهور
                </div>
              </div>
            </div>

            <div className="p-2 rounded-lg bg-sky-50 dark:bg-sky-950/50 border border-sky-200 dark:border-sky-800/60 flex items-center justify-between text-[11px]">
              <span className="text-sky-800 dark:text-sky-200 font-bold">مجموع القبض الشهري:</span>
              <span className="text-sky-700 dark:text-sky-300 font-black">20,000 ج.م / شهر</span>
            </div>
          </div>
        </div>
      );

    case 2:
      return (
        <div className="w-full max-w-lg mx-auto bg-card-app border border-app rounded-xl p-3 sm:p-4 text-right shadow-xs space-y-3">
          <div className="flex items-center justify-between border-b border-app pb-2">
            <span className="text-xs font-bold text-app-primary flex items-center gap-1.5">
              <UserPlus className="w-3.5 h-3.5 text-emerald-600" />
              إضافة المشتركين (3 مسجلين)
            </span>
            <span className="text-[10px] bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 font-bold px-2 py-0.5 rounded-full">
              ميزة اللصق السريع متاحة 📋
            </span>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex-1 px-2.5 py-1.5 rounded-lg bg-app border border-app text-xs text-app-secondary truncate">
              محمد إبراهيم — 01012345678
            </div>
            <div className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-bold shrink-0">
              + إضافة
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between p-2 rounded-lg bg-app/80 border border-app text-xs">
              <span className="font-bold text-app-primary flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                أحمد محمود (01012345678)
              </span>
              <span className="text-[10px] text-app-secondary bg-black/5 dark:bg-white/10 px-2 py-0.5 rounded-md font-semibold">
                سهم كامل
              </span>
            </div>
            <div className="flex items-center justify-between p-2 rounded-lg bg-app/80 border border-app text-xs">
              <span className="font-bold text-app-primary flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-teal-500"></span>
                سارة خليل (01187654321)
              </span>
              <span className="text-[10px] text-app-secondary bg-black/5 dark:bg-white/10 px-2 py-0.5 rounded-md font-semibold">
                نصف سهم (0.5)
              </span>
            </div>
          </div>
        </div>
      );

    case 3:
      return (
        <div className="w-full max-w-lg mx-auto bg-card-app border border-app rounded-xl p-3 sm:p-4 text-right shadow-xs space-y-2.5">
          <div className="flex items-center justify-between border-b border-app pb-2">
            <span className="text-xs font-bold text-app-primary flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-indigo-600" />
              جدول شهور القبض وتوزيع الأدوار
            </span>
            <span className="text-[10px] bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 font-bold px-2 py-0.5 rounded-full">
              مكتمل 10 / 10 ✓
            </span>
          </div>

          <div className="space-y-1.5">
            <div className="p-2.5 rounded-lg bg-app border border-indigo-200 dark:border-indigo-900/60 flex items-center justify-between text-xs">
              <div>
                <span className="font-black text-indigo-600 dark:text-indigo-400 block text-[11px]">الدور 1 — مايو 2026</span>
                <span className="font-bold text-app-primary">أحمد محمود (سهم كامل)</span>
              </div>
              <span className="font-black text-xs text-emerald-600 bg-emerald-50 dark:bg-emerald-950/60 px-2 py-1 rounded-md border border-emerald-200 dark:border-emerald-800">
                20,000 ج.م
              </span>
            </div>

            <div className="p-2.5 rounded-lg bg-app border border-purple-200 dark:border-purple-900/60 flex items-center justify-between text-xs">
              <div>
                <span className="font-black text-purple-600 dark:text-purple-400 block text-[11px]">الدور 2 — يونيو 2026 (سهم مجزأ)</span>
                <span className="font-bold text-app-primary">سارة (0.5) + هاني علي (0.5)</span>
              </div>
              <span className="font-black text-xs text-purple-600 bg-purple-50 dark:bg-purple-950/60 px-2 py-1 rounded-md border border-purple-200 dark:border-purple-800">
                10,000 ج.م لكل عضو
              </span>
            </div>
          </div>
        </div>
      );

    case 4:
      return (
        <div className="w-full max-w-lg mx-auto bg-card-app border border-app rounded-xl p-3 sm:p-4 text-right shadow-xs space-y-2.5">
          <div className="flex items-center justify-between border-b border-app pb-2">
            <span className="text-xs font-bold text-app-primary flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5 text-amber-600" />
              تحصيل شهر مايو (16,000 من 20,000 ج.م)
            </span>
            <span className="text-[10px] bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 font-extrabold px-2 py-0.5 rounded-full">
              80% محصل
            </span>
          </div>

          <div className="w-full bg-black/5 dark:bg-white/10 h-2 rounded-full overflow-hidden">
            <div className="bg-emerald-500 h-full w-[80%] rounded-full"></div>
          </div>

          <div className="space-y-1 text-xs">
            <div className="flex items-center justify-between p-1.5 rounded-lg bg-app">
              <span className="font-semibold text-app-primary">أحمد محمود</span>
              <span className="text-[11px] font-bold text-emerald-600 bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 rounded-md flex items-center gap-1">
                <Check className="w-3 h-3 stroke-3" /> تم الدفع
              </span>
            </div>
            <div className="flex items-center justify-between p-1.5 rounded-lg bg-app">
              <span className="font-semibold text-app-primary">كريم حسن</span>
              <span className="text-[11px] font-bold text-emerald-600 bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 rounded-md flex items-center gap-1">
                <Check className="w-3 h-3 stroke-3" /> تم الدفع
              </span>
            </div>
            <div className="flex items-center justify-between p-1.5 rounded-lg bg-app">
              <span className="font-semibold text-app-primary">محمود سعيد</span>
              <span className="text-[11px] font-bold text-amber-600 bg-amber-50 dark:bg-amber-950/60 px-2 py-0.5 rounded-md flex items-center gap-1">
                <Clock className="w-3 h-3" /> في الانتظار
              </span>
            </div>
          </div>
        </div>
      );

    case 5:
      return (
        <div className="w-full max-w-lg mx-auto bg-card-app border border-app rounded-xl p-3 sm:p-4 text-right shadow-xs space-y-3">
          <div className="flex items-center justify-between border-b border-app pb-2">
            <span className="text-xs font-bold text-app-primary flex items-center gap-1.5">
              <ArrowLeftRight className="w-3.5 h-3.5 text-violet-600" />
              تسليم القبض وتبديل الأدوار
            </span>
            <span className="text-[10px] bg-violet-100 dark:bg-violet-950 text-violet-700 dark:text-violet-300 font-bold px-2 py-0.5 rounded-full">
              بضغطة واحدة
            </span>
          </div>

          <div className="p-2.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 flex items-center justify-between text-xs">
            <div>
              <span className="text-[10px] text-emerald-700 dark:text-emerald-300 font-bold block">مستحق شهر مايو (20,000 ج)</span>
              <span className="font-bold text-app-primary">أحمد محمود</span>
            </div>
            <span className="px-3 py-1 rounded-lg bg-emerald-600 text-white font-black text-xs shadow-xs flex items-center gap-1">
              <Check className="w-3.5 h-3.5 stroke-3" /> تم تسليم القبض
            </span>
          </div>

          <div className="p-2.5 rounded-lg bg-app border border-app flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <span className="px-2 py-1 rounded-md bg-sky-100 dark:bg-sky-950 text-sky-800 dark:text-sky-300 font-bold text-[11px]">
                أحمد (شهر 1)
              </span>
              <ArrowLeftRight className="w-3.5 h-3.5 text-app-secondary" />
              <span className="px-2 py-1 rounded-md bg-purple-100 dark:bg-purple-950 text-purple-800 dark:text-purple-300 font-bold text-[11px]">
                سارة (شهر 4)
              </span>
            </div>
            <span className="px-2.5 py-1 rounded-lg bg-sky-700 hover:bg-sky-800 text-white font-bold text-[11px] shadow-xs">
              تبديل الميعاد ⇄
            </span>
          </div>
        </div>
      );

    case 6:
      return (
        <div className="w-full max-w-lg mx-auto bg-card-app border border-app rounded-xl p-3 sm:p-4 text-right shadow-xs space-y-3">
          <div className="flex items-center justify-between border-b border-app pb-2">
            <span className="text-xs font-bold text-app-primary flex items-center gap-1.5">
              <FileSpreadsheet className="w-3.5 h-3.5 text-rose-600" />
              الكشوفات والتقارير المعتمدة
            </span>
            <span className="text-[10px] bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300 font-bold px-2 py-0.5 rounded-full">
              تصدير وطباعة
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="p-2 rounded-lg bg-app border border-app hover:border-sky-500/40 flex items-center gap-2">
              <Printer className="w-4 h-4 text-sky-600 shrink-0" />
              <div className="truncate">
                <span className="font-bold text-app-primary block text-[11px]">كشف حساب A4 (PDF)</span>
                <span className="text-[9px] text-app-secondary">جاهز للطباعة فوراً</span>
              </div>
            </div>

            <div className="p-2 rounded-lg bg-app border border-app hover:border-emerald-500/40 flex items-center gap-2">
              <FileSpreadsheet className="w-4 h-4 text-emerald-600 shrink-0" />
              <div className="truncate">
                <span className="font-bold text-app-primary block text-[11px]">تصدير إكسيل (XLSX)</span>
                <span className="text-[9px] text-app-secondary">مصفوفة الجمعية كاملة</span>
              </div>
            </div>

            <div className="p-2 rounded-lg bg-app border border-app flex items-center gap-2 opacity-90">
              <Share2 className="w-4 h-4 text-emerald-500 shrink-0" />
              <div className="truncate">
                <span className="font-bold text-app-primary block text-[11px]">واتساب (قريباً ⏳)</span>
                <span className="text-[9px] text-app-secondary">إرسال كشف العضو</span>
              </div>
            </div>

            <div className="p-2 rounded-lg bg-app border border-app hover:border-purple-500/40 flex items-center gap-2">
              <RotateCw className="w-4 h-4 text-purple-600 shrink-0" />
              <div className="truncate">
                <span className="font-bold text-app-primary block text-[11px]">تجديد الجمعية</span>
                <span className="text-[9px] text-app-secondary">دورة جديدة بنفس الأسماء</span>
              </div>
            </div>
          </div>
        </div>
      );

    default:
      return null;
  }
}

export default function GuideModal({ isOpen, onClose }) {
  const [currentStep, setCurrentStep] = useState(1);
  const [imageErrorMap, setImageErrorMap] = useState({});

  const stepData = GUIDE_STEPS.find((s) => s.id === currentStep) || GUIDE_STEPS[0];
  const StepIcon = stepData.icon;

  const handleNext = () => {
    if (currentStep < GUIDE_STEPS.length) {
      setCurrentStep((prev) => prev + 1);
    } else {
      onClose();
    }
  };

  const handlePrev = () => {
    if (currentStep > 1) {
      setCurrentStep((prev) => prev - 1);
    }
  };

  const handleImageError = (stepId) => {
    setImageErrorMap((prev) => ({ ...prev, [stepId]: true }));
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="دليل استخدام وإدارة الجمعية"
      maxWidth="max-w-3xl"
    >
      <div className="space-y-5 text-right" dir="rtl">
        {/* Top Progress & Stepper Bar */}
        <div className="bg-app p-2.5 sm:p-3 rounded-2xl border border-app">
          {/* Stepper Buttons */}
          <div className="grid grid-cols-6 gap-1.5 sm:gap-2">
            {GUIDE_STEPS.map((step) => {
              const isCurrent = step.id === currentStep;
              const isPast = step.id < currentStep;
              return (
                <button
                  key={step.id}
                  type="button"
                  onClick={() => setCurrentStep(step.id)}
                  className={`
                    flex flex-col items-center justify-center p-2 rounded-xl transition-all duration-200 text-xs font-bold cursor-pointer
                    ${
                      isCurrent
                        ? "bg-sky-700 text-white shadow-md scale-102 ring-2 ring-sky-400/40"
                        : isPast
                        ? "bg-sky-100 text-sky-800 dark:bg-sky-950/70 dark:text-sky-300 hover:bg-sky-200 dark:hover:bg-sky-900/60"
                        : "bg-black/5 dark:bg-white/5 text-app-secondary hover:bg-black/10 dark:hover:bg-white/10"
                    }
                  `}
                  title={step.title}
                >
                  <div className="flex items-center gap-1">
                    {isPast ? (
                      <Check className="w-3.5 h-3.5 stroke-3 text-sky-700 dark:text-sky-300" />
                    ) : (
                      <span>{step.id}</span>
                    )}
                  </div>
                  <span className="hidden md:inline truncate max-w-[70px] text-[11px] mt-0.5 font-normal">
                    {step.title.split(" ")[0]}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Progress Percent Bar */}
          <div className="mt-2.5 h-1.5 w-full bg-black/5 dark:bg-white/10 rounded-full overflow-hidden">
            <div
              className="h-full bg-linear-to-r from-sky-600 to-indigo-600 transition-all duration-300"
              style={{ width: `${(currentStep / GUIDE_STEPS.length) * 100}%` }}
            />
          </div>
        </div>

        {/* Current Step Header */}
        <div className="flex items-start gap-3.5 p-3.5 sm:p-4 rounded-2xl bg-card-app border border-app shadow-xs">
          <div
            className={`w-11 h-11 sm:w-12 sm:h-12 rounded-xl bg-linear-to-br ${stepData.color} flex items-center justify-center text-white shrink-0 shadow-md`}
          >
            <StepIcon className="w-5 h-5 sm:w-6 sm:h-6" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className="px-2.5 py-0.5 rounded-full text-[11px] sm:text-xs font-black bg-sky-100 text-sky-800 dark:bg-sky-950/80 dark:text-sky-300 border border-sky-300 dark:border-sky-800">
                الخطوة {stepData.id} من {GUIDE_STEPS.length}
              </span>
              <h4 className="text-base sm:text-lg font-black text-app-primary">
                {stepData.title}
              </h4>
            </div>
            <p className="text-xs sm:text-sm text-app-secondary leading-relaxed font-medium">
              {stepData.subtitle}
            </p>
          </div>
        </div>

        {/* Step Visual / Image Container with Mockup UI */}
        <div className="rounded-2xl border border-app bg-app/40 overflow-hidden relative p-3 sm:p-4">
          {!imageErrorMap[stepData.id] ? (
            <div className="relative">
              <img
                src={`/guide/step${stepData.id}.webp`}
                alt={stepData.title}
                onError={() => handleImageError(stepData.id)}
                className="max-h-[200px] w-auto mx-auto object-contain rounded-xl shadow-xs"
              />
            </div>
          ) : null}

          {/* Fallback & Default: Interactive Miniature Mockup Card */}
          {imageErrorMap[stepData.id] && (
            <StepMockup stepId={stepData.id} />
          )}
        </div>

        {/* Step Bullet Points */}
        <div className="space-y-2.5">
          <h5 className="text-xs sm:text-sm font-black text-app-primary flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-sky-600 dark:text-sky-400" />
            <span>تفاصيل سهلة ومهمة للمرحلة دي:</span>
          </h5>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {stepData.bullets.map((bullet, idx) => (
              <div
                key={idx}
                className="p-3 rounded-xl bg-app/60 border border-app/80 flex items-start gap-2.5 hover:border-sky-500/40 transition-colors"
              >
                <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                <div className="text-xs leading-relaxed">
                  <span className="font-bold text-app-primary block mb-0.5">
                    {bullet.title}
                  </span>
                  <span className="text-app-secondary font-medium">
                    {bullet.desc}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Helpful Tip Box */}
        {stepData.tip && (
          <div className="p-3 sm:p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-900 dark:text-amber-200 text-xs flex items-center gap-2.5 leading-relaxed font-medium">
            <HelpCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
            <span>{stepData.tip}</span>
          </div>
        )}

        {/* Modal Navigation Buttons */}
        <div className="flex items-center justify-between pt-3 border-t border-app gap-3">
          <div className="flex items-center gap-2">
            {currentStep > 1 && (
              <button
                type="button"
                onClick={handlePrev}
                className="px-3.5 py-2 rounded-xl border border-app text-app-primary hover:bg-black/5 dark:hover:bg-white/10 text-xs sm:text-sm font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <ChevronRight className="w-4 h-4" />
                <span>السابق</span>
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              className="px-3 py-2 rounded-xl text-app-secondary hover:text-app-primary hover:bg-black/5 dark:hover:bg-white/10 text-xs sm:text-sm font-semibold transition-colors cursor-pointer"
            >
              إغلاق
            </button>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-app-secondary font-bold hidden sm:inline">
              {currentStep} من {GUIDE_STEPS.length}
            </span>

            <button
              type="button"
              onClick={handleNext}
              className="px-5 py-2.5 rounded-xl bg-sky-700 hover:bg-sky-800 text-white text-xs sm:text-sm font-black flex items-center gap-2 shadow-md hover:shadow-lg transition-all cursor-pointer"
            >
              <span>{currentStep === GUIDE_STEPS.length ? "فهمت الدورة بالكامل" : "الخطوة التالية"}</span>
              {currentStep === GUIDE_STEPS.length ? (
                <Check className="w-4 h-4 stroke-3" />
              ) : (
                <ChevronLeft className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

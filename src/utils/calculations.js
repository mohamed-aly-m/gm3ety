// دوال الحسابات المالية الدقيقة لمنظومة جمعيتي (GM3ETY)
// جميع الحسابات النقدية تخزن وتحسب كأعداد صحيحة بالجنيه المصري (INTEGER EGP) بدون كسور

/**
 * حساب النسبة المئوية لمساهمة المشترك في الحصة
 * @param {number} contributedAmount - مبلغ المساهمة الشهري
 * @param {number} shareValue - القيمة الإجمالية للحصة
 * @returns {number} النسبة المئوية
 */
export const calculatePercentage = (contributedAmount, shareValue) => {
  const amount = Number(contributedAmount) || 0;
  const total = Number(shareValue) || 0;
  if (total <= 0) return 0;
  return Number(((amount / total) * 100).toFixed(2));
};

/**
 * حساب النسب المئوية لمجموعة مساهمين مع معالجة الكسور التراكمية لضمان مجموع 100.00%
 * @param {Array} contributors - قائمة المساهمين في الحصة
 * @param {number} shareValue - القيمة الإجمالية للحصة
 * @returns {number[]} مصفوفة النسب
 */
export const calculateContributorPercentages = (contributors = [], shareValue = 0) => {
  const total = Number(shareValue) || 0;
  if (total <= 0 || !Array.isArray(contributors) || contributors.length === 0) {
    return (contributors || []).map(() => 0);
  }

  const sumContributed = contributors.reduce(
    (sum, c) => sum + (Number(c?.monthly_contribution ?? c?.contributedAmount ?? c?.contributed_amount) || 0),
    0
  );

  const rawPcts = contributors.map((c) => {
    const amt = Number(c?.monthly_contribution ?? c?.contributedAmount ?? c?.contributed_amount) || 0;
    return Number(((amt / total) * 100).toFixed(2));
  });

  const sumPcts = Number(rawPcts.reduce((sum, p) => sum + p, 0).toFixed(2));

  // إذا تم استيفاء مبلغ الحصة بالكامل وكان هناك فارق تقريب بسيط، يتم تعديله لضمان 100%
  if (sumContributed === total && sumPcts !== 100 && rawPcts.length > 0) {
    const diff = Number((100 - sumPcts).toFixed(2));
    const lastIdx = rawPcts.length - 1;
    rawPcts[lastIdx] = Number((rawPcts[lastIdx] + diff).toFixed(2));
  }

  return rawPcts;
};

/**
 * حساب مبلغ القبض المستحق للمساهم كعدد صحيح (INTEGER EGP)
 * @param {number} percentage - نسبة المساهمة (0-100)
 * @param {number} totalPool - إجمالي مجمع الجمعية للدورة الواحدة
 * @returns {number} مبلغ القبض كـ INTEGER EGP
 */
export const calculatePayoutAmount = (percentage, totalPool) => {
  const pct = Number(percentage) || 0;
  const pot = Number(totalPool) || 0;
  if (pct <= 0 || pot <= 0) return 0;
  return Math.round((pct / 100) * pot);
};

/**
 * حساب تاريخ استحقاق الحصة حسب ترتيب الدور وتاريخ البداية
 * @param {string} startDateStr - تاريخ بداية الجمعية (YYYY-MM-DD)
 * @param {number} order - رقم الدور/الحصة (1, 2, ...)
 * @returns {string} تاريخ الاستحقاق (YYYY-MM-DD)
 */
export const getShareDueDate = (startDateStr, order = 1) => {
  if (!startDateStr) return "";
  let str = startDateStr;
  if (startDateStr instanceof Date) {
    const y = startDateStr.getFullYear();
    const m = String(startDateStr.getMonth() + 1).padStart(2, "0");
    const d = String(startDateStr.getDate()).padStart(2, "0");
    str = `${y}-${m}-${d}`;
  }
  const parts = String(str).split("-");
  if (parts.length !== 3) return String(str);

  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1;
  const day = parseInt(parts[2], 10);
  if (isNaN(year) || isNaN(month) || isNaN(day)) return String(str);

  const targetDate = new Date(year, month + (Number(order) - 1), day);
  const y = targetDate.getFullYear();
  const m = String(targetDate.getMonth() + 1).padStart(2, "0");
  const d = String(targetDate.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

/**
 * حساب تاريخ نهاية الجمعية التلقائي
 * @param {string} startDateStr - تاريخ البداية
 * @param {number} monthsCount - عدد الشهور
 * @returns {string} تاريخ النهاية (YYYY-MM-DD)
 */
export const getCalculatedEndDate = (startDateStr, monthsCount = 1) => {
  if (!startDateStr || !monthsCount) return "";
  return getShareDueDate(startDateStr, Number(monthsCount) || 1);
};

/**
 * أسماء الشهور الميلادية باللغة العربية
 */
const ARABIC_MONTHS = [
  "يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو",
  "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"
];

/**
 * تنسيق التاريخ باللغة العربية القياسية (مثال: 1 فبراير 2026)
 * @param {string|Date} dateStr - تاريخ بصيغة YYYY-MM-DD أو كائن Date
 * @returns {string} التاريخ منسقاً بالعربية
 */
export const formatArabicDate = (dateStr) => {
  if (!dateStr) return "";
  try {
    let str = dateStr;
    if (dateStr instanceof Date) {
      const y = dateStr.getFullYear();
      const m = String(dateStr.getMonth() + 1).padStart(2, "0");
      const d = String(dateStr.getDate()).padStart(2, "0");
      str = `${y}-${m}-${d}`;
    }
    const parts = String(str).split("-");
    if (parts.length === 3) {
      const year = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10);
      const day = parseInt(parts[2], 10);
      if (!isNaN(year) && !isNaN(month) && !isNaN(day) && month >= 1 && month <= 12) {
        return `${day} ${ARABIC_MONTHS[month - 1]} ${year}`;
      }
    }
  } catch (err) {
    console.warn("formatArabicDate formatting error:", err);
  }
  return String(dateStr);
};

/**
 * حساب القسط الشهري المطلوب من شخص معين داخل الجمعية كعدد صحيح (INTEGER EGP)
 * قاعدة العمل: القسط الشهري للعضو = مجموع مساهماته الشهرية في جميع الأسهم التي يشارك فيها داخل الجمعية
 * ممنوع القسمة على عدد الأسهم أو عدد الأشخاص أو استخدام أي مضاعف عشوائي
 * @param {Array} shares - قائمة الحصص
 * @param {string} personId - معرف العضو
 * @param {number} defaultShareValue - القيمة الافتراضية في حال عدم وجود مساهمات مسجلة
 * @returns {number} القسط الشهري المستحق كـ INTEGER EGP
 */
export const calculateMonthlyDue = (shares = [], personId, defaultShareValue = 0) => {
  if (!personId) return 0;

  if (Array.isArray(shares) && shares.length > 0) {
    let totalMonthlyContribution = 0;
    let foundContributor = false;

    shares.forEach((share) => {
      const contributors = share.contributors || share.share_contributors || [];
      contributors.forEach((c) => {
        const cPersonId = c.person_id ?? c.personId;
        if (String(cPersonId) === String(personId)) {
          foundContributor = true;
          totalMonthlyContribution += Number(
            c.monthly_contribution ?? c.contributedAmount ?? c.contributed_amount
          ) || 0;
        }
      });
    });

    if (foundContributor) {
      return Math.round(totalMonthlyContribution);
    }
  }

  if (Number(defaultShareValue) > 0) {
    return Math.round(Number(defaultShareValue));
  }

  return 0;
};

/**
 * الاسم البديل لقاعدة العمل الصريحة: monthlyMemberObligation
 */
export const monthlyMemberObligation = calculateMonthlyDue;

/**
 * حساب إجمالي المدفوعات المسجلة لشخص في شهر/دورة معينة كعدد صحيح (INTEGER EGP)
 * مع الأخذ في الاعتبار عمليات الـ reversal
 * @param {Array} payments - قائمة المدفوعات
 * @param {string} personId - معرف العضو
 * @param {number|string} cycleIndex - رقم الدورة
 * @returns {number} إجمالي المدفوع الفعلي كـ INTEGER EGP
 */
export const calculatePaidAmount = (payments = [], personId, cycleIdentifier) => {
  if (!Array.isArray(payments) || !personId || cycleIdentifier === undefined || cycleIdentifier === null) {
    return 0;
  }

  const strPersonId = String(personId);
  const targetCycle = String(cycleIdentifier);

  // حساب المدفوعات الأساسية
  const normalPayments = payments.filter((p) => {
    const pPersonId = String(p.person_id ?? p.personId ?? "");
    const pCycleId = String(p.cycle_id ?? p.cycleId ?? "");
    const pCycleIndex = String(p.cycleIndex ?? p.cycle_index ?? "");
    const pType = p.payment_type ?? p.paymentType ?? "payment";

    const matchesCycle = pCycleId === targetCycle || pCycleIndex === targetCycle;
    return pPersonId === strPersonId && matchesCycle && pType === "payment";
  });

  // حساب عمليات الإلغاء/الاسترجاع (reversals)
  const reversalPayments = payments.filter((p) => {
    const pPersonId = String(p.person_id ?? p.personId ?? "");
    const pCycleId = String(p.cycle_id ?? p.cycleId ?? "");
    const pCycleIndex = String(p.cycleIndex ?? p.cycle_index ?? "");
    const pType = p.payment_type ?? p.paymentType ?? "";

    const matchesCycle = pCycleId === targetCycle || pCycleIndex === targetCycle;
    return pPersonId === strPersonId && matchesCycle && pType === "reversal";
  });

  const totalPaid = normalPayments.reduce(
    (sum, p) => sum + (Number(p.paid_amount ?? p.amount) || 0),
    0
  );

  const totalReversed = reversalPayments.reduce(
    (sum, p) => sum + (Number(p.paid_amount ?? p.amount) || 0),
    0
  );

  return Math.max(0, Math.round(totalPaid - totalReversed));
};

/**
 * حساب حالة السداد والمبلغ المتبقي لشخص في دورة معينة
 * @param {number} monthlyDue - القسط المطلوب
 * @param {number} paidAmount - المبلغ المدفوع
 * @returns {object} { dueAmount, paidAmount, remainingAmount, status, statusText }
 */
export const getPaymentStatus = (monthlyDue, paidAmount) => {
  const due = Math.round(Number(monthlyDue) || 0);
  const paid = Math.round(Number(paidAmount) || 0);
  const remaining = Math.max(0, due - paid);

  let status = "unpaid"; // لم يسدد
  let statusText = "غير مسدد";

  if (paid >= due && due > 0) {
    status = "paid";
    statusText = "مسدد بالكامل";
  } else if (paid > 0 && paid < due) {
    status = "partial";
    statusText = "سداد جزئي";
  }

  return {
    dueAmount: due,
    paidAmount: paid,
    remainingAmount: remaining,
    status,
    statusText,
  };
};

import * as XLSX from "xlsx";
import {
  getShareDueDate,
  formatArabicDate,
  calculatePercentage,
  calculatePayoutAmount,
} from "../utils/calculations.js";

/**
 * 1. تصدير جدول الحصص والمستلمين للجمعية كاملة إلى ملف Excel
 */
export const exportAssociationToExcel = (association, shares = [], people = []) => {
  if (!association) return;

  const peopleMap = (people || []).reduce((acc, p) => {
    acc[p.id] = p;
    return acc;
  }, {});

  const shareVal = Number(association.shareValue ?? association.monthly_share_amount) || 0;
  const countShares = Number(association.totalShares ?? association.total_shares) || shares.length || 1;
  const totalPoolPerCycle = Math.round(shareVal * countShares);
  const startDate = association.startDate ?? association.start_date;

  const rows = [];

  shares.forEach((share) => {
    const order = Number(share.shareOrder ?? share.share_order ?? 1);
    const dueDateRaw = getShareDueDate(startDate, order);
    const dueDateFormatted = formatArabicDate(dueDateRaw);
    const contributors = share.contributors || share.share_contributors || [];

    if (contributors.length === 0) {
      rows.push({
        "رقم الحصة / الدور": order,
        "موعد الاستحقاق": dueDateFormatted,
        "المستلم / المساهم": "لم يحدد",
        "رقم الهاتف": "-",
        "مبلغ القبض (ج.م)": 0,
        "نسبة المساهمة": "0%",
      });
    } else {
      contributors.forEach((c) => {
        const pId = c.personId ?? c.person_id;
        const personObj = peopleMap[pId];
        const contributed = Number(c.monthlyContribution ?? c.contributedAmount ?? c.monthly_contribution) || 0;
        const pct = calculatePercentage(contributed, shareVal);
        const payout = calculatePayoutAmount(pct, totalPoolPerCycle);

        rows.push({
          "رقم الحصة / الدور": order,
          "موعد الاستحقاق": dueDateFormatted,
          "المستلم / المساهم": personObj?.name || "غير معروف",
          "رقم الهاتف": personObj?.phone || "-",
          "مبلغ القبض (ج.م)": payout,
          "نسبة المساهمة": `${pct}%`,
        });
      });
    }
  });

  const worksheet = XLSX.utils.json_to_sheet(rows);
  worksheet["!views"] = [{ RTL: true }];
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "جدول الأدوار");

  const cleanAssocName = String(association.name || "جمعيتي").trim().replace(/[/\\?%*:|"<>]/g, "_");
  const fileName = `GM3ETY_${cleanAssocName}_كشف_الأدوار.xlsx`;
  XLSX.writeFile(workbook, fileName);
};

/**
 * 2. تصدير كشف دور عضو واحد محدد إلى ملف Excel
 */
export const exportSinglePersonToExcel = (association, person, shares = [], payments = []) => {
  if (!association || !person) return;

  const shareVal = Number(association.shareValue ?? association.monthly_share_amount) || 0;
  const countShares = Number(association.totalShares ?? association.total_shares) || shares.length || 1;
  const totalPoolPerCycle = Math.round(shareVal * countShares);
  const startDate = association.startDate ?? association.start_date;

  const rows = [];

  // 1. الأدوار المستحق استلامها من قِبل هذا العضو
  shares.forEach((share) => {
    const order = Number(share.shareOrder ?? share.share_order ?? 1);
    const dueDateRaw = getShareDueDate(startDate, order);
    const dueDateFormatted = formatArabicDate(dueDateRaw);
    const contributors = share.contributors || share.share_contributors || [];

    const userContributions = contributors.filter(
      (c) => String(c.personId ?? c.person_id) === String(person.id)
    );

    userContributions.forEach((c) => {
      const contributed = Number(c.monthlyContribution ?? c.contributedAmount ?? c.monthly_contribution) || 0;
      const pct = calculatePercentage(contributed, shareVal);
      const payout = calculatePayoutAmount(pct, totalPoolPerCycle);

      rows.push({
        "النوع": "دور استلام (قبض)",
        "رقم الحصة / الشهر": order,
        "موعد الاستحقاق": dueDateFormatted,
        "نسبة المساهمة": `${pct}%`,
        "المبلغ المستحق القبض": payout,
        "مبلغ المساهمة الشهري": contributed,
      });
    });
  });

  // 2. حركات الدفع المسجلة لهذا العضو
  (payments || [])
    .filter((pay) => String(pay.personId ?? pay.person_id) === String(person.id))
    .forEach((pay) => {
      const isReversal = (pay.paymentType ?? pay.payment_type) === "reversal";
      const cycleNum = pay.cycleIndex ?? pay.cycle_index ?? pay.cycleId ?? pay.cycle_id ?? 1;
      const payDate = pay.paymentDate ?? pay.paidAt ?? pay.paid_at ?? "-";
      const payAmount = Number(pay.amount ?? pay.paid_amount) || 0;

      rows.push({
        "النوع": isReversal ? "استرجاع دفعة" : "سداد قسط",
        "رقم الحصة / الشهر": cycleNum,
        "موعد الاستحقاق": payDate,
        "نسبة المساهمة": "-",
        "المبلغ المستحق القبض": "-",
        "مبلغ المساهمة الشهري": isReversal ? -payAmount : payAmount,
        "ملاحظات": pay.receiptNote ?? pay.receipt_note ?? "دفعة مسددة",
      });
    });

  const worksheet = XLSX.utils.json_to_sheet(rows);
  worksheet["!views"] = [{ RTL: true }];
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, `كشف_${person.name}`);

  const cleanAssocName = String(association.name || "جمعيتي").trim().replace(/[/\\?%*:|"<>]/g, "_");
  const cleanPersonName = String(person.name || "عضو").trim().replace(/[/\\?%*:|"<>]/g, "_");
  const fileName = `GM3ETY_${cleanAssocName}_كشف_${cleanPersonName}.xlsx`;
  XLSX.writeFile(workbook, fileName);
};

/**
 * 3. تصدير سجل المدفوعات إلى ملف Excel
 */
export const exportPaymentsToExcel = (association, payments = [], people = []) => {
  if (!association) return;

  const peopleMap = (people || []).reduce((acc, p) => {
    if (p?.id) {
      acc[String(p.id)] = p.name || "عضو";
    }
    return acc;
  }, {});

  const rows = (payments || []).map((pay) => {
    const personKey = String(pay.personId ?? pay.person_id ?? "");
    const memberName = peopleMap[personKey] || pay.personName || pay.person_name || "غير معروف";
    const cycleNum = pay.cycleIndex ?? pay.cycle_index ?? pay.cycleId ?? pay.cycle_id ?? 1;
    const payAmount = Number(pay.amount ?? pay.paid_amount) || 0;
    const isReversal = (pay.paymentType ?? pay.payment_type) === "reversal";
    const payDate = pay.paymentDate ?? pay.paidAt ?? pay.paid_at ?? "-";
    const note = pay.receiptNote ?? pay.receipt_note ?? "";

    return {
      "اسم العضو": memberName,
      "رقم الشهر / الدورة": cycleNum,
      "المبلغ المدفوع (ج.م)": payAmount,
      "نوع الحركة": isReversal ? "استرجاع" : "سداد",
      "تاريخ الدفع": payDate,
      "ملاحظات الإيصال": note,
    };
  });

  const worksheet = XLSX.utils.json_to_sheet(rows);
  worksheet["!views"] = [{ RTL: true }];
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "سجل المدفوعات");

  const cleanAssocName = String(association.name || "جمعيتي").trim().replace(/[/\\?%*:|"<>]/g, "_");
  const fileName = `GM3ETY_${cleanAssocName}_سجل_المدفوعات.xlsx`;
  XLSX.writeFile(workbook, fileName);
};

/**
 * 4. تشغيل أمر الطباعة / حفظ PDF في المتصفح
 */
export const printAssociationView = () => {
  window.print();
};

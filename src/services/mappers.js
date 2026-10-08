// Explicit, bi-directional mappers and validators between Application Layer and Supabase Database Schemas
// STRICTLY conforming to Supabase staging schema:
// - profiles: (id UUID, name TEXT, mobile TEXT, email TEXT, created_at TIMESTAMPTZ)
// - associations: (id TEXT, owner_id UUID, name TEXT, monthly_share_amount INT, total_shares INT, duration_months INT, start_date DATE, status TEXT, started_at TIMESTAMPTZ, created_at TIMESTAMPTZ)
// - people: (id TEXT, association_id TEXT, name TEXT, phone TEXT, created_at TIMESTAMPTZ)
// - shares: (id TEXT, association_id TEXT, share_order INT, created_at TIMESTAMPTZ)
// - share_contributors: (id TEXT, association_id TEXT, share_id TEXT, person_id TEXT, monthly_contribution INT, created_at TIMESTAMPTZ)
// - payments: (id TEXT, association_id TEXT, person_id TEXT, cycle_id TEXT, paid_amount INT, payment_type TEXT, reversal_of_payment_id TEXT, idempotency_key TEXT, request_fingerprint TEXT, receipt_note TEXT, paid_at TIMESTAMPTZ, created_at TIMESTAMPTZ)

import {
  getCalculatedEndDate,
  getShareDueDate,
  calculatePercentage,
  calculateContributorPercentages,
  calculatePayoutAmount,
} from "../utils/calculations.js";

export function formatSupabaseError(actionName, error) {
  if (!error) return `${actionName}: خطأ غير معروف`;
  const code = error.code ? ` (رمز: ${error.code})` : "";
  const details = error.details ? ` - التفاصيل: ${error.details}` : "";
  let hint = error.hint ? ` - اقتراح: ${error.hint}` : "";

  if (error.code === "42501") {
    hint = " - إرشاد: تم رفض العملية بسبب صلاحيات الوصول (RLS). يرجى التأكد من تسجيل الدخول بحساب مالك الجمعية وتطبيق سياسات RLS الصحيحة.";
  } else if (error.code === "PGRST204" || (error.message && error.message.includes("schema cache"))) {
    hint = " - إرشاد: العمود أو الدالة غير موجودة في حافظة المخطط. تأكد من توافق الأعمدة.";
  }

  console.error(`[GAM3ETY SUPABASE ERROR] ${actionName}:`, {
    message: error.message,
    code: error.code,
    details: error.details,
    hint: error.hint,
  });

  return `${actionName}: ${error.message}${code}${details}${hint}`;
}

// ============================================================================
// 1. ASSOCIATIONS
// ============================================================================

export function mapAssociationFromSupabase(item) {
  if (!item) return null;

  const monthlyShareAmount = Math.round(Number(item.monthly_share_amount) || 0);
  const totalShares = Math.max(1, Math.round(Number(item.total_shares) || 1));
  const durationMonths = Math.max(
    1,
    Math.round(Number(item.duration_months) || totalShares)
  );
  const startDate = item.start_date || "";
  const endDate = getCalculatedEndDate(startDate, durationMonths);

  return {
    id: String(item.id),
    userId: item.owner_id ? String(item.owner_id) : "",
    ownerId: item.owner_id ? String(item.owner_id) : "",
    name: String(item.name || "").trim(),
    shareValue: monthlyShareAmount,
    monthlyShareAmount,
    totalShares,
    durationMonths,
    startDate,
    endDate,
    status: item.status || "draft",
    startedAt: item.started_at || null,
    createdAt: item.created_at || new Date().toISOString(),
  };
}

export function mapAssociationToSupabase(data) {
  const shareVal = Math.round(Number(data.shareValue ?? data.monthlyShareAmount ?? data.monthly_share_amount) || 0);
  const countShares = Math.max(1, Math.round(Number(data.totalShares ?? data.total_shares) || 1));
  const rawDuration = data.durationMonths ?? data.duration_months;
  if (rawDuration !== undefined && rawDuration !== null && Math.round(Number(rawDuration)) !== countShares) {
    throw new Error("قاعدة النظام: عدد الحصص يجب أن يساوي مدة الجمعية بالأشهر (total_shares === duration_months)");
  }
  const durationMonths = countShares;

  const status = data.status;

  const res = {
    owner_id: data.ownerId || data.userId || data.owner_id,
    name: String(data.name || "").trim(),
    monthly_share_amount: shareVal,
    total_shares: countShares,
    duration_months: durationMonths,
    start_date: data.startDate || data.start_date,
    status: status,
  };

  if (status === "active" || status === "completed") {
    res.started_at =
      data.startedAt ||
      data.started_at ||
      new Date().toISOString();
  } else if (status === "draft") {
    res.started_at = null;
  }

  if (data.id) res.id = String(data.id);
  return res;
}

export function validateAssociationPayload(payload) {
  if (!payload.name || typeof payload.name !== "string" || !payload.name.trim()) {
    throw new Error("اسم الجمعية مطلوب ولا يمكن أن يكون فارغاً");
  }
  if (!payload.monthly_share_amount || Number(payload.monthly_share_amount) <= 0) {
    throw new Error("قيمة الحصة الشهرية يجب أن تكون أكبر من صفر");
  }
  if (!payload.total_shares || Number(payload.total_shares) <= 0) {
    throw new Error("عدد الحصص الكلية يجب أن يكون أكبر من صفر");
  }
  if (!payload.start_date) {
    throw new Error("تاريخ بداية الجمعية مطلوب");
  }
  if (
    payload.duration_months !== undefined &&
    payload.duration_months !== null &&
    Number(payload.total_shares) !== Number(payload.duration_months)
  ) {
    throw new Error("قاعدة النظام: عدد الحصص يجب أن يساوي مدة الجمعية بالأشهر (total_shares === duration_months)");
  }
}

// ============================================================================
// 2. PEOPLE
// ============================================================================

export function mapPersonFromSupabase(item) {
  if (!item) return null;
  return {
    id: String(item.id),
    associationId: String(item.association_id),
    name: String(item.name || "").trim(),
    phone: item.phone ? String(item.phone).trim() : "غير مسجل",
    createdAt: item.created_at || new Date().toISOString(),
  };
}

export function mapPersonToSupabase(data) {
  const res = {
    association_id: String(data.associationId || data.association_id),
    name: String(data.name || "").trim(),
    phone: data.phone && String(data.phone).trim() ? String(data.phone).trim() : "غير مسجل",
  };
  if (data.id) res.id = String(data.id);
  return res;
}

export function validatePersonPayload(payload) {
  if (!payload.association_id) {
    throw new Error("معرف الجمعية مطلوب لإضافة المشترك");
  }
  if (!payload.name || !payload.name.trim()) {
    throw new Error("اسم المشترك مطلوب ولا يمكن أن يكون فارغاً");
  }
}

// ============================================================================
// 3. SHARES & SHARE CONTRIBUTORS
// ============================================================================

export function mapShareFromSupabase(
  item,
  associationStartDate = "",
  shareValue = 0,
  totalShares = 1
) {
  if (!item) return null;

  const orderNumber = Math.max(1, Math.round(Number(item.share_order ?? item.shareOrder) || 1));
  const calculatedDueDate = getShareDueDate(associationStartDate, orderNumber);

  const sValue = Math.round(Number(shareValue) || 0);
  const countShares = Math.max(1, Math.round(Number(totalShares) || 1));
  const totalPool = sValue * countShares;

  const rawContributors = item.share_contributors || item.contributors || [];
  const contributors = rawContributors.map((c) => {
    const contribAmt = Math.round(
      Number(c.monthly_contribution ?? c.contributedAmount ?? c.contributed_amount) || 0
    );
    const pct = sValue > 0 ? calculatePercentage(contribAmt, sValue) : Number(c.percentage || 0);
    const payout = calculatePayoutAmount(pct, totalPool);

    return {
      id: c.id ? String(c.id) : undefined,
      shareId: String(c.share_id || item.id),
      personId: String(c.person_id || c.personId),
      contributedAmount: contribAmt,
      monthlyContribution: contribAmt,
      percentage: pct,
      payoutAmount: payout,
    };
  });

  return {
    id: String(item.id),
    associationId: String(item.association_id || item.associationId),
    shareOrder: orderNumber,
    dueDate: calculatedDueDate,
    isDelivered: Boolean(item.is_delivered ?? item.isDelivered ?? false),
    contributors: contributors,
    createdAt: item.created_at || new Date().toISOString(),
  };
}

export function mapShareToSupabase(data) {
  const res = {
    association_id: String(data.associationId || data.association_id),
    share_order: Math.max(1, Math.round(Number(data.shareOrder || data.share_order || 1))),
  };
  if (data.id) res.id = String(data.id);
  if (data.isDelivered !== undefined || data.is_delivered !== undefined) {
    res.is_delivered = Boolean(data.isDelivered ?? data.is_delivered);
  }
  // STRICT: Do NOT send status or due_date to shares table!
  return res;
}

export function mapContributorToSupabase(c, shareId, associationId) {
  const personId = c.personId || c.person_id;
  if (!personId) {
    throw new Error("معرف المشترك مطلوب لإضافته في مساهمي السهم");
  }

  const res = {
    association_id: String(associationId || c.association_id || c.associationId),
    share_id: String(shareId),
    person_id: String(personId),
    monthly_contribution: Math.round(
      Number(c.monthlyContribution ?? c.contributedAmount ?? c.monthly_contribution ?? c.contributed_amount) || 0
    ),
  };
  if (c.id) res.id = String(c.id);
  // STRICT: Do NOT send percentage or payout_amount to Supabase!
  return res;
}

export function validateSharePayload(payload) {
  if (!payload.association_id) {
    throw new Error("معرف الجمعية مطلوب لإنشاء السهم");
  }
  if (!payload.share_order || Number(payload.share_order) < 1) {
    throw new Error("رقم ترتيب السهم/الشهر غير صالح");
  }
}

// ============================================================================
// 4. PAYMENTS
// ============================================================================
// 4. CYCLES & PAYMENTS
// ============================================================================

export function mapCycleFromSupabase(item) {
  if (!item) return null;
  return {
    id: String(item.id),
    associationId: String(item.association_id),
    cycleIndex: Number(item.cycle_index),
    dueDate: item.due_date,
    status: item.status || "open",
    createdAt: item.created_at,
  };
}

export function mapPaymentFromSupabase(item) {
  if (!item) return null;

  const cycleId = String(item.cycle_id || "");
  const paidAt = item.paid_at || item.created_at || new Date().toISOString();
  const paymentDate = paidAt.includes("T") ? paidAt.split("T")[0] : paidAt;

  return {
    id: String(item.id),
    associationId: String(item.association_id),
    personId: String(item.person_id),
    cycleId: cycleId,
    cycleIndex: item.cycle_index ? Number(item.cycle_index) : undefined,
    amount: Math.round(Number(item.paid_amount) || 0),
    paidAmount: Math.round(Number(item.paid_amount) || 0),
    paymentType: item.payment_type || "payment",
    reversalOfPaymentId: item.reversal_of_payment_id || null,
    idempotencyKey: item.idempotency_key || null,
    receiptNote: item.receipt_note || "",
    paidAt: paidAt,
    paymentDate: paymentDate,
    createdAt: item.created_at || paidAt,
  };
}

export function mapPaymentToSupabase(data) {
  const paidAmount = Math.round(Number(data.amount ?? data.paidAmount ?? data.paid_amount) || 0);
  const cycleId = String(data.cycleId || data.cycle_id || "");
  const paidAt = data.paidAt
    ? new Date(data.paidAt).toISOString()
    : data.paymentDate
    ? new Date(data.paymentDate).toISOString()
    : new Date().toISOString();

  const res = {
    association_id: String(data.associationId || data.association_id),
    person_id: String(data.personId || data.person_id),
    cycle_id: cycleId,
    paid_amount: paidAmount,
    payment_type: data.paymentType || data.payment_type || "payment",
    reversal_of_payment_id: data.reversalOfPaymentId || data.reversal_of_payment_id || null,
    idempotency_key: data.idempotencyKey || data.idempotency_key || null,
    request_fingerprint: data.requestFingerprint || data.request_fingerprint || null,
    receipt_note: data.receiptNote || data.receipt_note || "",
    paid_at: paidAt,
  };

  if (data.id) res.id = String(data.id);
  // STRICT: Do NOT send cycle_index, payment_date, transaction_type, etc.!
  return res;
}

export function validatePaymentPayload(payload) {
  if (!payload.association_id) {
    throw new Error("معرف الجمعية مطلوب لتسجيل الدفعة المالية");
  }
  if (!payload.person_id) {
    throw new Error("معرف المشترك المسدد مطلوب لتسجيل الدفعة المالية");
  }
  if (!payload.cycle_id || payload.cycle_id.trim() === "") {
    throw new Error("معرف دورة الشهر (cycle_id) غير صالح");
  }
  if (payload.paid_amount === undefined || Number(payload.paid_amount) <= 0) {
    throw new Error("المبلغ المدفوع يجب أن يكون أكبر من صفر");
  }
}

// ============================================================================
// 5. PROFILES / USERS
// ============================================================================

export function mapUserFromSupabase(item) {
  if (!item) return null;
  return {
    id: String(item.id),
    name: item.name || "منظم الجمعية",
    mobile: item.mobile || "",
    email: item.email || "",
    createdAt: item.created_at || new Date().toISOString().split("T")[0],
  };
}

export function mapUserToSupabase(data) {
  return {
    id: String(data.id),
    name: String(data.name || "").trim(),
    mobile: data.mobile ? String(data.mobile).trim() : null,
    email: data.email ? String(data.email).trim().toLowerCase() : null,
  };
}

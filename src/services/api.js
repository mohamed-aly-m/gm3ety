import { supabase, isSupabaseConfigured } from "../lib/supabase.js";
import {
  formatSupabaseError,
  mapAssociationFromSupabase,
  mapAssociationToSupabase,
  validateAssociationPayload,
  mapPersonFromSupabase,
  mapPersonToSupabase,
  validatePersonPayload,
  mapShareFromSupabase,
  mapShareToSupabase,
  mapContributorToSupabase,
  validateSharePayload,
  mapPaymentFromSupabase,
  mapPaymentToSupabase,
  validatePaymentPayload,
  mapCycleFromSupabase,
  mapUserFromSupabase,
  mapUserToSupabase,
} from "./mappers.js";
import {
  generateAssociationId,
  generatePersonId,
  generateShareId,
  generateContributorId,
  generatePaymentId,
} from "../utils/idGenerator.js";
import { getShareDueDate } from "../utils/calculations.js";
import { associationCache } from "./associationCache.js";

const ensureConfigured = () => {
  if (!isSupabaseConfigured()) {
    throw new Error("إعدادات الاتصال بقاعدة بيانات Supabase غير متوفرة في ملف .env");
  }
};

/**
 * فحص ما إذا كان قد بدأ التحصيل المالي في الجمعية.
 * إذا كان هناك أي دفعة مسجلة، يتم تجميد هيكل الجمعية (منع إضافة/تعديل/حذف الأشخاص والأسهم).
 */
export async function isAssociationCollectionStarted(associationId) {
  ensureConfigured();
  const { data, error } = await supabase
    .from("payments")
    .select("id")
    .eq("association_id", associationId)
    .eq("payment_type", "payment")
    .limit(1);

  if (error) {
    console.error("[COLLECTION CHECK ERROR]", error);
    throw new Error(formatSupabaseError("فحص حالة التحصيل المالي", error));
  }

  return Array.isArray(data) && data.length > 0;
}

// ============================================================================
// 1. USER & PROFILES SERVICE
// ============================================================================
export const userService = {
  async getProfile(userId) {
    ensureConfigured();
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .maybeSingle();

    if (error) throw new Error(formatSupabaseError(`جلب الملف الشخصي (${userId})`, error));
    return mapUserFromSupabase(data);
  },

  async ensureProfile(authUser) {
    if (!authUser?.id) return null;
    ensureConfigured();

    // 1. Check if profile already exists for this authenticated user (Idempotent check)
    const { data: existing, error: fetchErr } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", authUser.id)
      .maybeSingle();

    if (existing) {
      return mapUserFromSupabase(existing);
    }

    // 2. Profile missing -> Idempotently insert new profile row
    let rawName =
      authUser.user_metadata?.name ||
      authUser.user_metadata?.full_name ||
      authUser.email?.split("@")[0] ||
      "منظم الجمعية";
    rawName = String(rawName).trim();
    if (rawName.length < 2) {
      rawName = "منظم الجمعية";
    }

    const newProfile = {
      id: authUser.id,
      name: rawName,
      mobile: authUser.user_metadata?.mobile || authUser.user_metadata?.phone_number || null,
      email: authUser.email ? String(authUser.email).trim().toLowerCase() : null,
    };

    const { data: inserted, error: insertErr } = await supabase
      .from("profiles")
      .upsert(newProfile, { onConflict: "id", ignoreDuplicates: true })
      .select()
      .maybeSingle();

    if (insertErr) {
      console.warn(`[GAM3ETY PROFILES] Profile upsert warning (${authUser.id}):`, insertErr.message);
      // Fallback check in case a concurrent call already inserted the row
      const { data: retry } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", authUser.id)
        .maybeSingle();
      if (retry) return mapUserFromSupabase(retry);
      throw new Error(formatSupabaseError(`تهيئة الملف الشخصي (${authUser.id})`, insertErr));
    }

    return mapUserFromSupabase(inserted || newProfile);
  },

  async updateProfile(userId, profileData) {
    ensureConfigured();
    const mapped = mapUserToSupabase({ id: userId, ...profileData });
    const { data, error } = await supabase
      .from("profiles")
      .upsert(mapped)
      .select()
      .single();

    if (error) throw new Error(formatSupabaseError(`تحديث الملف الشخصي (${userId})`, error));
    return mapUserFromSupabase(data);
  },
};

// ============================================================================
// 2. ASSOCIATIONS SERVICE
// ============================================================================
export const associationService = {
  async getAssociations() {
    ensureConfigured();
    const { data: userSession } = await supabase.auth.getUser();
    let query = supabase.from("associations").select("*").order("created_at", { ascending: false });

    if (userSession?.user) {
      query = query.eq("owner_id", userSession.user.id);
    }

    const { data, error } = await query;
    if (error) throw new Error(formatSupabaseError("جلب قائمة الجمعيات", error));
    return (data || []).map(mapAssociationFromSupabase);
  },

  async getAssociationById(id) {
    ensureConfigured();
    const { data, error } = await supabase
      .from("associations")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (error) throw new Error(formatSupabaseError(`جلب تفاصيل الجمعية (${id})`, error));
    return mapAssociationFromSupabase(data);
  },

  async createAssociation(data) {
    ensureConfigured();
    const { data: authData } = await supabase.auth.getUser();
    const currentUserId = authData?.user?.id;
    if (!currentUserId) {
      throw new Error("يجب تسجيل الدخول كمنظم لإنشاء جمعية جديدة");
    }

    // Defensive guarantee: Ensure profile row exists for authenticated user before inserting association
    await userService.ensureProfile(authData.user);

    const newId = data.id || generateAssociationId();
    const mapped = mapAssociationToSupabase({
      ...data,
      id: newId,
      ownerId: currentUserId,
    });
    validateAssociationPayload(mapped);

    const { data: created, error } = await supabase
      .from("associations")
      .insert([mapped])
      .select()
      .single();

    if (error) throw new Error(formatSupabaseError("إنشاء الجمعية", error));
    return mapAssociationFromSupabase(created);
  },

  async updateAssociation(id, data) {
    ensureConfigured();
    const mapped = {};
    if (data.name !== undefined) mapped.name = String(data.name).trim();
    if (data.shareValue !== undefined || data.monthlyShareAmount !== undefined || data.monthly_share_amount !== undefined) {
      mapped.monthly_share_amount = Math.round(Number(data.shareValue ?? data.monthlyShareAmount ?? data.monthly_share_amount));
    }
    if (data.totalShares !== undefined || data.total_shares !== undefined) {
      mapped.total_shares = Math.max(1, Math.round(Number(data.totalShares ?? data.total_shares)));
    }
    if (data.durationMonths !== undefined || data.duration_months !== undefined) {
      mapped.duration_months = Math.max(1, Math.round(Number(data.durationMonths ?? data.duration_months)));
    }
    if (data.status !== undefined) mapped.status = data.status;
    if (data.startDate !== undefined || data.start_date !== undefined) {
      mapped.start_date = data.startDate || data.start_date;
    }

    const { data: updated, error } = await supabase
      .from("associations")
      .update(mapped)
      .eq("id", id)
      .select()
      .single();

    if (error) throw new Error(formatSupabaseError(`تعديل الجمعية (${id})`, error));
    return mapAssociationFromSupabase(updated);
  },

  async editAssociationStructure({
    associationId,
    name,
    shareValue,
    totalShares,
    startDate,
    people,
    shares,
  }) {
    ensureConfigured();
    const countShares = Math.max(1, Math.round(Number(totalShares) || 1));
    const sVal = Math.round(Number(shareValue) || 1000);

    const generateUUID = () => {
      if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
        return crypto.randomUUID();
      }
      return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
      });
    };

    // Sanitize people and map any temporary IDs to valid UUIDs
    const idMap = {};
    const sanitizedPeople = (people || []).map((p) => {
      let actualId = p.id;
      if (!actualId || String(actualId).startsWith("temp_") || String(actualId).startsWith("p_temp_")) {
        actualId = generateUUID();
        if (p.id) idMap[p.id] = actualId;
      }
      return {
        id: actualId,
        name: String(p.name || "").trim(),
        phone: p.phone && String(p.phone).trim() ? String(p.phone).trim() : "غير مسجل",
      };
    });

    // Sanitize shares and map contributor person_id to matching UUIDs
    const sanitizedShares = (shares || []).map((sh) => {
      let actualShareId = sh.id;
      if (!actualShareId || String(actualShareId).startsWith("temp_") || String(actualShareId).startsWith("sh_temp_")) {
        actualShareId = generateUUID();
      }

      return {
        id: actualShareId,
        share_order: sh.share_order ?? sh.shareOrder,
        contributors: (sh.contributors || []).map((c) => {
          let actualContribId = c.id;
          if (!actualContribId || String(actualContribId).startsWith("temp_") || String(actualContribId).startsWith("sc_temp_")) {
            actualContribId = generateUUID();
          }
          const rawPersonId = c.person_id ?? c.personId;
          const mappedPersonId = idMap[rawPersonId] || rawPersonId;
          return {
            id: actualContribId,
            person_id: mappedPersonId,
            monthly_contribution: Math.round(Number(c.monthly_contribution ?? c.contributedAmount) || 0),
          };
        }),
      };
    });

    const { data: rpcRes, error: rpcErr } = await supabase.rpc("edit_association_structure", {
      p_association_id: String(associationId),
      p_name: String(name).trim(),
      p_share_value: sVal,
      p_total_shares: countShares,
      p_start_date: startDate,
      p_people: sanitizedPeople,
      p_shares: sanitizedShares,
    });

    if (rpcErr) {
      throw new Error(formatSupabaseError("تعديل الجمعية ذرياً (edit_association_structure)", rpcErr));
    }

    associationCache.invalidate(associationId);
    return rpcRes;
  },

  async deleteAssociation(id) {
    ensureConfigured();

    if (!id || String(id).trim() === "") {
      throw new Error("معرف الجمعية غير صالح أو مفقود لحذفها");
    }

    const { data: rpcRes, error: rpcErr } = await supabase.rpc("delete_association", {
      p_association_id: String(id),
    });

    if (rpcErr) {
      console.error("[DELETE ASSOCIATION RPC ERROR]", rpcErr);
      throw new Error(formatSupabaseError(`حذف الجمعية ذرياً (${id})`, rpcErr));
    }

    if (!rpcRes?.success) {
      throw new Error(`فشلت عملية حذف الجمعية (${id}). تأكد من الصلاحيات والمطابقة.`);
    }

    associationCache.invalidate(id);
    return { success: true, ...rpcRes };
  },
};

// ============================================================================
// 3. PEOPLE SERVICE
// ============================================================================
export const peopleService = {
  async getPeopleByAssociation(associationId) {
    ensureConfigured();
    const { data, error } = await supabase
      .from("people")
      .select("*")
      .eq("association_id", associationId)
      .order("created_at", { ascending: true });

    if (error) throw new Error(formatSupabaseError(`جلب أعضاء الجمعية (${associationId})`, error));
    return (data || []).map(mapPersonFromSupabase);
  },

  async addPerson(personData) {
    ensureConfigured();
    const assocId = personData.associationId || personData.association_id;
    const hasStarted = await isAssociationCollectionStarted(assocId);
    if (hasStarted) {
      throw new Error("لا يمكن إضافة أعضاء جدد بعد بدء تحصيل الجمعية لحماية الحسابات المالية.");
    }

    const personId = personData.id || generatePersonId();
    const mapped = mapPersonToSupabase({ ...personData, id: personId });
    validatePersonPayload(mapped);

    const { data: created, error } = await supabase
      .from("people")
      .insert([mapped])
      .select()
      .single();

    if (error) throw new Error(formatSupabaseError("إضافة عضو جديد", error));
    return mapPersonFromSupabase(created);
  },

  async updatePerson(id, personData) {
    ensureConfigured();
    const assocId = personData.associationId || personData.association_id;
    if (assocId) {
      const hasStarted = await isAssociationCollectionStarted(assocId);
      if (hasStarted) {
        throw new Error("لا يمكن تعديل بيانات الأعضاء بعد بدء تحصيل الجمعية.");
      }
    }

    const mapped = {};
    if (personData.name !== undefined) mapped.name = String(personData.name).trim();
    if (personData.phone !== undefined) mapped.phone = String(personData.phone).trim();

    const { data: updated, error } = await supabase
      .from("people")
      .update(mapped)
      .eq("id", id)
      .select()
      .single();

    if (error) throw new Error(formatSupabaseError(`تحديث بيانات العضو (${id})`, error));
    return mapPersonFromSupabase(updated);
  },

  async deletePerson(id, associationId) {
    ensureConfigured();
    if (associationId) {
      const hasStarted = await isAssociationCollectionStarted(associationId);
      if (hasStarted) {
        throw new Error("لا يمكن حذف أي عضو بعد بدء تحصيل الجمعية لحماية الالتزامات المالية.");
      }
    }

    const { error } = await supabase.from("people").delete().eq("id", id);
    if (error) throw new Error(formatSupabaseError(`حذف العضو (${id})`, error));
    return { success: true };
  },
};

// ============================================================================
// 4. SHARES & CONTRIBUTORS SERVICE
// ============================================================================
export const sharesService = {
  async getSharesByAssociation(associationId) {
    ensureConfigured();
    const { data, error } = await supabase
      .from("shares")
      .select("*, share_contributors(*)")
      .eq("association_id", associationId)
      .order("share_order", { ascending: true });

    if (error) throw new Error(formatSupabaseError(`جلب جدول الحصص (${associationId})`, error));
    return (data || []).map((item) => mapShareFromSupabase(item));
  },

  async createShare(shareData) {
    ensureConfigured();
    const assocId = shareData.associationId || shareData.association_id;
    const shareId = shareData.id || generateShareId();

    const mappedShare = mapShareToSupabase({ ...shareData, id: shareId, associationId: assocId });
    validateSharePayload(mappedShare);

    const { data: createdShare, error: shareErr } = await supabase
      .from("shares")
      .insert([mappedShare])
      .select()
      .single();

    if (shareErr) throw new Error(formatSupabaseError("إنشاء الحصة في جدول الأسهم", shareErr));

    if (Array.isArray(shareData.contributors) && shareData.contributors.length > 0) {
      const contributorRows = shareData.contributors.map((c) => {
        const cId = c.id || generateContributorId();
        return mapContributorToSupabase({ ...c, id: cId }, createdShare.id, assocId);
      });

      const { error: contribErr } = await supabase
        .from("share_contributors")
        .insert(contributorRows);

      if (contribErr) {
        throw new Error(formatSupabaseError("إضافة مساهمي السهم", contribErr));
      }
    }

    const { data: fullShare, error: fetchErr } = await supabase
      .from("shares")
      .select("*, share_contributors(*)")
      .eq("id", createdShare.id)
      .maybeSingle();

    if (fetchErr) {
      console.warn("فشل جلب تفاصيل السهم المكتمل بعد الإدراج:", fetchErr);
    }

    return mapShareFromSupabase(fullShare || createdShare);
  },

  async updateShare(id, shareData) {
    ensureConfigured();
    const assocId = shareData.associationId || shareData.association_id;
    if (assocId) {
      const hasStarted = await isAssociationCollectionStarted(assocId);
      if (hasStarted) {
        throw new Error("لا يمكن تعديل هيكل الحصص أو المساهمين بعد بدء التحصيل.");
      }
    }

    if (Array.isArray(shareData.contributors)) {
      // Clear old contributors and re-insert updated contributors atomically
      const { error: delErr } = await supabase
        .from("share_contributors")
        .delete()
        .eq("share_id", id);

      if (delErr) throw new Error(formatSupabaseError(`تحديث مساهمي الحصة (${id})`, delErr));

      if (shareData.contributors.length > 0) {
        const contributorRows = shareData.contributors.map((c) => {
          const cId = c.id || generateContributorId();
          return mapContributorToSupabase({ ...c, id: cId }, id, assocId);
        });

        const { error: insErr } = await supabase
          .from("share_contributors")
          .insert(contributorRows);

        if (insErr) throw new Error(formatSupabaseError(`إدراج المساهمين الجدد للحصة (${id})`, insErr));
      }
    }

    const { data: fullShare, error: fetchErr } = await supabase
      .from("shares")
      .select("*, share_contributors(*)")
      .eq("id", id)
      .maybeSingle();

    if (fetchErr) {
      console.warn("فشل جلب تفاصيل السهم بعد التعديل:", fetchErr);
    }

    return mapShareFromSupabase(fullShare || { id });
  },

  async swapTurns(shareAId, shareBId) {
    ensureConfigured();
    // STRICT: Swap MUST be atomic and handled via PostgreSQL RPC. No unsafe client fallback.
    const { data: rpcRes, error: rpcErr } = await supabase.rpc("swap_share_turns", {
      p_share_id_a: String(shareAId),
      p_share_id_b: String(shareBId),
    });

    if (rpcErr) {
      throw new Error(formatSupabaseError("تبديل دور الحصتين (swap_share_turns RPC)", rpcErr));
    }

    if (!rpcRes?.success) {
      throw new Error("فشلت عملية تبديل الأدوار. تأكد من تطابق الصلاحيات والجمعية.");
    }

    return { success: true };
  },

  async toggleShareDelivery(shareId, associationId, isDelivered) {
    ensureConfigured();
    if (!shareId || !associationId) {
      throw new Error("معرف السهم ومعرف الجمعية مطلوبان لتحديث حالة التسليم");
    }

    const { data, error } = await supabase
      .from("shares")
      .update({ is_delivered: Boolean(isDelivered) })
      .eq("id", shareId)
      .eq("association_id", associationId)
      .select("*, share_contributors(*)")
      .single();

    if (error) {
      throw new Error(formatSupabaseError(`تحديث حالة تسليم السهم (${shareId})`, error));
    }

    // Synchronize Cache immediately
    const cached = associationCache.get(associationId);
    if (cached && Array.isArray(cached.shares)) {
      const updatedShares = cached.shares.map((sh) =>
        sh.id === shareId ? { ...sh, isDelivered: Boolean(isDelivered) } : sh
      );
      associationCache.update(associationId, { shares: updatedShares });
    }

    return mapShareFromSupabase(data);
  },

  async deleteShare(id, associationId) {
    ensureConfigured();
    if (associationId) {
      const hasStarted = await isAssociationCollectionStarted(associationId);
      if (hasStarted) {
        throw new Error("لا يمكن حذف أي حصة بعد بدء تحصيل الجمعية.");
      }
    }

    await supabase.from("share_contributors").delete().eq("share_id", id);
    const { error } = await supabase.from("shares").delete().eq("id", id);
    if (error) throw new Error(formatSupabaseError(`حذف الحصة (${id})`, error));
    return { success: true };
  },

  async deleteSharesByAssociation(associationId) {
    ensureConfigured();
    const hasStarted = await isAssociationCollectionStarted(associationId);
    if (hasStarted) {
      throw new Error("لا يمكن تعديل أو حذف هيكل الحصص بعد بدء التحصيل المالي.");
    }

    // 1. Delete payment_allocations if exist
    try {
      const { error: allocErr } = await supabase.from("payment_allocations").delete().eq("association_id", associationId);
      if (allocErr && allocErr.code !== "42P01" && allocErr.code !== "PGRST116") {
        console.warn("[DELETE ALLOCATIONS WARNING]", allocErr.message);
      }
    } catch (_) {}

    // 2. Delete contribution_obligations before share_contributors to satisfy ON DELETE RESTRICT FK
    const { error: obErr } = await supabase
      .from("contribution_obligations")
      .delete()
      .eq("association_id", associationId);
    if (obErr && obErr.code !== "42P01") {
      throw new Error(formatSupabaseError(`حذف التزامات المساهمات (${associationId})`, obErr));
    }

    const { error: contribErr } = await supabase
      .from("share_contributors")
      .delete()
      .eq("association_id", associationId);
    if (contribErr) {
      throw new Error(formatSupabaseError(`حذف مساهمي الحصص (${associationId})`, contribErr));
    }

    const { error: shareErr } = await supabase
      .from("shares")
      .delete()
      .eq("association_id", associationId);
    if (shareErr) {
      throw new Error(formatSupabaseError(`حذف الحصص (${associationId})`, shareErr));
    }

    return { success: true };
  },
};

// ============================================================================
// 5. PAYMENTS SERVICE
// ============================================================================
export const paymentsService = {
  async getPaymentsByAssociation(associationId) {
    ensureConfigured();
    const { data, error } = await supabase
      .from("payments")
      .select("*")
      .eq("association_id", associationId)
      .order("paid_at", { ascending: false });

    if (error) throw new Error(formatSupabaseError(`جلب المدفوعات للجمعية (${associationId})`, error));
    return (data || []).map(mapPaymentFromSupabase);
  },

  async addPayment(paymentData) {
    ensureConfigured();
    const newId = paymentData.id || generatePaymentId();
    const mapped = mapPaymentToSupabase({ ...paymentData, id: newId });
    validatePaymentPayload(mapped);

    const { data: created, error } = await supabase
      .from("payments")
      .insert([mapped])
      .select()
      .single();

    if (error) throw new Error(formatSupabaseError("تسجيل الدفعة المالية", error));
    return mapPaymentFromSupabase(created);
  },

  async reversalPayment(originalPaymentId, reason = "استرجاع دفعة") {
    ensureConfigured();
    // 1. Fetch original payment
    const { data: orig, error: origErr } = await supabase
      .from("payments")
      .select("*")
      .eq("id", originalPaymentId)
      .single();

    if (origErr || !orig) {
      throw new Error(formatSupabaseError(`استرجاع الدفعة الأصلية (${originalPaymentId})`, origErr));
    }

    // 2. Create reversal record
    const reversalId = generatePaymentId();
    const reversalRecord = {
      id: reversalId,
      association_id: orig.association_id,
      person_id: orig.person_id,
      cycle_id: orig.cycle_id,
      paid_amount: orig.paid_amount,
      payment_type: "reversal",
      reversal_of_payment_id: orig.id,
      receipt_note: reason,
      paid_at: new Date().toISOString(),
    };

    const { data: createdReversal, error: revErr } = await supabase
      .from("payments")
      .insert([reversalRecord])
      .select()
      .single();

    if (revErr) throw new Error(formatSupabaseError("تسجيل عملية استرجاع الدفعة", revErr));
    return mapPaymentFromSupabase(createdReversal);
  },

  async deletePayment(id) {
    ensureConfigured();
    // For non-audit deletion if allowed:
    const { error } = await supabase.from("payments").delete().eq("id", id);
    if (error) throw new Error(formatSupabaseError(`حذف الدفعة (${id})`, error));
    return { success: true };
  },
};

// ============================================================================
// 6. CYCLES SERVICE
// ============================================================================
export const cyclesService = {
  async getCyclesByAssociation(associationId) {
    ensureConfigured();
    const { data, error } = await supabase
      .from("association_cycles")
      .select("*")
      .eq("association_id", associationId)
      .order("cycle_index", { ascending: true });

    if (error) {
      console.error("[CYCLES FETCH ERROR]", error);
      throw new Error(formatSupabaseError(`جلب دورات الجمعية (${associationId})`, error));
    }
    return (data || []).map(mapCycleFromSupabase);
  },

  async createCycles(associationId, startDate, totalShares) {
    ensureConfigured();
    const count = Math.max(1, Math.round(Number(totalShares) || 1));

    // 1. Check existing cycles for this association to guarantee idempotency and avoid duplicates
    const { data: existing, error: checkErr } = await supabase
      .from("association_cycles")
      .select("cycle_index")
      .eq("association_id", associationId);

    if (checkErr) {
      console.warn(`[CYCLES CHECK WARNING] (${associationId}):`, checkErr.message);
    }

    const existingIndexes = new Set((existing || []).map((c) => Number(c.cycle_index)));
    const cyclesToInsert = [];

    for (let i = 1; i <= count; i++) {
      if (existingIndexes.has(i)) continue;

      const dueDate = getShareDueDate(startDate, i);
      const cycleId =
        typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
          ? crypto.randomUUID()
          : `cycle_${associationId}_${i}_${Math.random().toString(36).substring(2, 10)}`;

      cyclesToInsert.push({
        id: cycleId,
        association_id: associationId,
        cycle_index: i,
        due_date: dueDate,
        status: "open",
      });
    }

    if (cyclesToInsert.length > 0) {
      const { error } = await supabase
        .from("association_cycles")
        .insert(cyclesToInsert);

      if (error) {
        console.error("[CYCLES CREATION ERROR]", error);
        throw new Error(formatSupabaseError(`إنشاء دورات الجمعية (${associationId})`, error));
      }
    }

    return cyclesService.getCyclesByAssociation(associationId);
  },

  async syncCycles(associationId, startDate, totalShares) {
    ensureConfigured();
    const count = Math.max(1, Math.round(Number(totalShares) || 1));

    // Guard: Cannot sync/modify cycles if collection has started
    const hasStarted = await isAssociationCollectionStarted(associationId);
    if (hasStarted) {
      throw new Error("لا يمكن تعديل دورات الجمعية بعد بدء التحصيل المالي.");
    }

    // 1. Fetch current cycles
    const { data: existing, error: fetchErr } = await supabase
      .from("association_cycles")
      .select("*")
      .eq("association_id", associationId)
      .order("cycle_index", { ascending: true });

    if (fetchErr) {
      throw new Error(formatSupabaseError(`جلب دورات الجمعية للمزامنة (${associationId})`, fetchErr));
    }

    const currentCycles = existing || [];

    // 2. If existing count > count, delete excess cycles (indices > count)
    const excessCycles = currentCycles.filter((c) => Number(c.cycle_index) > count);
    if (excessCycles.length > 0) {
      const excessIds = excessCycles.map((c) => c.id);
      const { error: delErr } = await supabase
        .from("association_cycles")
        .delete()
        .in("id", excessIds);
      if (delErr) {
        throw new Error(formatSupabaseError(`حذف الدورات الزائدة (${associationId})`, delErr));
      }
    }

    // 3. Update existing cycles (1 .. min(currentCount, count)) with updated due_dates
    const toUpdate = currentCycles.filter((c) => Number(c.cycle_index) <= count);
    for (const c of toUpdate) {
      const expectedDue = getShareDueDate(startDate, Number(c.cycle_index));
      if (c.due_date !== expectedDue) {
        const { error: updErr } = await supabase
          .from("association_cycles")
          .update({ due_date: expectedDue })
          .eq("id", c.id);
        if (updErr) {
          throw new Error(formatSupabaseError(`تحديث موعد استحقاق الدورة (${c.cycle_index})`, updErr));
        }
      }
    }

    // 4. If count > currentCount, insert missing cycles
    const existingIndexes = new Set(currentCycles.map((c) => Number(c.cycle_index)));
    const missingCycles = [];
    for (let i = 1; i <= count; i++) {
      if (!existingIndexes.has(i)) {
        const dueDate = getShareDueDate(startDate, i);
        const cycleId =
          typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
            ? crypto.randomUUID()
            : `cycle_${associationId}_${i}_${Math.random().toString(36).substring(2, 10)}`;

        missingCycles.push({
          id: cycleId,
          association_id: associationId,
          cycle_index: i,
          due_date: dueDate,
          status: "open",
        });
      }
    }

    if (missingCycles.length > 0) {
      const { error: insErr } = await supabase
        .from("association_cycles")
        .insert(missingCycles);
      if (insErr) {
        throw new Error(formatSupabaseError(`إضافة الدورات الجديدة (${associationId})`, insErr));
      }
    }

    return cyclesService.getCyclesByAssociation(associationId);
  },
};

// ============================================================================
// UNIFIED API OBJECT
// ============================================================================
export const api = {
  // Profiles
  getProfile: userService.getProfile,
  ensureProfile: userService.ensureProfile,
  updateProfile: userService.updateProfile,

  // Associations
  getAssociations: associationService.getAssociations,
  getAssociationById: associationService.getAssociationById,
  createAssociation: associationService.createAssociation,
  updateAssociation: associationService.updateAssociation,
  editAssociationStructure: associationService.editAssociationStructure,
  deleteAssociation: associationService.deleteAssociation,

  // People
  getPeopleByAssociation: peopleService.getPeopleByAssociation,
  addPerson: peopleService.addPerson,
  updatePerson: peopleService.updatePerson,
  deletePerson: peopleService.deletePerson,

  // Shares & Contributors
  getSharesByAssociation: sharesService.getSharesByAssociation,
  createShare: sharesService.createShare,
  updateShare: sharesService.updateShare,
  toggleShareDelivery: sharesService.toggleShareDelivery,
  swapSharesTurns: sharesService.swapTurns,
  deleteShare: sharesService.deleteShare,
  deleteSharesByAssociation: sharesService.deleteSharesByAssociation,

  // Payments
  getPaymentsByAssociation: paymentsService.getPaymentsByAssociation,
  addPayment: paymentsService.addPayment,
  reversalPayment: paymentsService.reversalPayment,
  deletePayment: paymentsService.deletePayment,

  // Association Cycles
  getCyclesByAssociation: cyclesService.getCyclesByAssociation,
  createCycles: cyclesService.createCycles,
  syncCycles: cyclesService.syncCycles,

  // Cache
  cache: associationCache,

  // Business logic guards
  isAssociationCollectionStarted,
};

export { associationCache };


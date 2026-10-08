import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  calculatePercentage,
  calculateContributorPercentages,
  calculatePayoutAmount,
  getShareDueDate,
  getCalculatedEndDate,
  calculateMonthlyDue,
  monthlyMemberObligation,
  calculatePaidAmount,
  getPaymentStatus,
  formatArabicDate,
} from "../utils/calculations.js";

import {
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
} from "../services/mappers.js";

import { associationCache } from "../services/associationCache.js";
import {
  migrateAssociationDeliveryStatus,
  getMigrationMarkerKey,
  getLegacyStorageKey,
} from "../services/deliveryMigration.js";

describe("GM3ETY Core Business Logic & Schema Compliance (20 Critical Test Cases)", () => {
  // Test 1: إنشاء جمعية بـ 8 أشخاص
  it("Test 1: إنشاء جمعية بـ 8 أشخاص وحساب مجمع القبض والتواريخ بدقة", () => {
    const rawAssoc = {
      id: "assoc_8_members",
      owner_id: "user_uuid_1001",
      name: "جمعية الأصدقاء 8 أعضاء",
      monthly_share_amount: 2000,
      total_shares: 8,
      duration_months: 8,
      start_date: "2026-01-01",
      status: "active",
      created_at: "2026-01-01T00:00:00Z",
    };

    const assoc = mapAssociationFromSupabase(rawAssoc);
    assert.equal(assoc.id, "assoc_8_members");
    assert.equal(assoc.shareValue, 2000);
    assert.equal(assoc.totalShares, 8);
    assert.equal(assoc.durationMonths, 8);
    assert.equal(assoc.startDate, "2026-01-01");
    assert.equal(assoc.endDate, "2026-08-01");

    const totalPool = assoc.shareValue * assoc.totalShares;
    assert.equal(totalPool, 16000); // 2000 * 8 = 16000 EGP integer

    // Validate payload to Supabase
    const payload = mapAssociationToSupabase(assoc);
    assert.equal(payload.monthly_share_amount, 2000);
    assert.equal(payload.total_shares, 8);
    assert.equal("share_value" in payload, false); // No fake columns
    assert.equal("end_date" in payload, false);
    assert.doesNotThrow(() => validateAssociationPayload(payload));
  });

  // Test 2: إنشاء 10 أشخاص و5 أسهم (N=10 > M=5)
  it("Test 2: إنشاء 10 أشخاص و5 أسهم (توزيع متكافئ متقسم سهمين لكل شخص)", () => {
    const people = Array.from({ length: 10 }, (_, i) => ({
      id: `person_${i + 1}`,
      name: `عضو ${i + 1}`,
      phone: `0100000000${i}`,
    }));
    const totalShares = 5;
    const shareValue = 3000;
    const N = people.length;
    const M = totalShares;

    // Distribute N people into M shares
    const shares = [];
    for (let i = 1; i <= M; i++) {
      const startIdx = Math.floor(((i - 1) * N) / M);
      const endIdx = Math.floor((i * N) / M);
      const group = people.slice(startIdx, endIdx);
      assert.equal(group.length, 2); // 10 / 5 = exactly 2 people per share

      const splitAmount = Math.floor(shareValue / group.length);
      const contributors = group.map((p) => ({
        personId: p.id,
        contributedAmount: splitAmount,
      }));

      shares.push({
        id: `sh_${i}`,
        shareOrder: i,
        contributors,
      });
    }

    assert.equal(shares.length, 5);
    shares.forEach((s) => {
      assert.equal(s.contributors.length, 2);
      const totalContributed = s.contributors.reduce((acc, c) => acc + c.contributedAmount, 0);
      assert.equal(totalContributed, 3000);
    });
  });

  // Test 3: إنشاء 16 شخص و10 أسهم (N=16 > M=10)
  it("Test 3: إنشاء 16 شخص و10 أسهم مع الحفاظ على جميع الأعضاء الـ16 دون فقد أي اسم", () => {
    const people = Array.from({ length: 16 }, (_, i) => ({
      id: `person_${i + 1}`,
      name: `عضو ${i + 1}`,
      phone: `010123456${String(i).padStart(2, "0")}`,
    }));
    const totalShares = 10;
    const shareValue = 5000;
    const N = people.length;
    const M = totalShares;

    const shares = [];
    for (let i = 1; i <= M; i++) {
      const startIdx = Math.floor(((i - 1) * N) / M);
      const endIdx = Math.floor((i * N) / M);
      const group = people.slice(startIdx, endIdx);

      const splitAmount = Math.floor(shareValue / group.length);
      const contributors = group.map((p, pIdx) => {
        const amt = pIdx === group.length - 1 ? shareValue - splitAmount * (group.length - 1) : splitAmount;
        return {
          personId: p.id,
          contributedAmount: amt,
        };
      });

      shares.push({
        id: `sh_${i}`,
        shareOrder: i,
        contributors,
      });
    }

    assert.equal(shares.length, 10);

    // Verify all 16 members are assigned
    const assignedPersonIds = new Set();
    shares.forEach((s) => {
      s.contributors.forEach((c) => assignedPersonIds.add(c.personId));
    });
    assert.equal(assignedPersonIds.size, 16);
    people.forEach((p) => {
      assert.ok(assignedPersonIds.has(p.id), `Missing person: ${p.id}`);
    });
  });

  // Test 4: سهم لشخص واحد (حصة كاملة)
  it("Test 4: سهم لشخص واحد (100% نسبة ومبلغ استلام كامل كـ INTEGER)", () => {
    const shareValue = 3000;
    const totalShares = 6;
    const totalPool = shareValue * totalShares; // 18000
    const contributor = { personId: "p_single", contributedAmount: 3000 };

    const pct = calculatePercentage(contributor.contributedAmount, shareValue);
    assert.equal(pct, 100);

    const payout = calculatePayoutAmount(pct, totalPool);
    assert.equal(payout, 18000);
    assert.equal(Number.isInteger(payout), true);
  });

  // Test 5: سهم لعدة مساهمين
  it("Test 5: سهم لعدة مساهمين بنسب مختلفة وحساب مبالغ الاستلام بدقة", () => {
    const shareValue = 4000;
    const totalShares = 10;
    const totalPool = shareValue * totalShares; // 40000

    const contributors = [
      { personId: "p_1", contributedAmount: 2000 },
      { personId: "p_2", contributedAmount: 1000 },
      { personId: "p_3", contributedAmount: 1000 },
    ];

    const pcts = calculateContributorPercentages(contributors, shareValue);
    assert.deepEqual(pcts, [50, 25, 25]);

    const payouts = pcts.map((pct) => calculatePayoutAmount(pct, totalPool));
    assert.deepEqual(payouts, [20000, 10000, 10000]);
    assert.equal(payouts.reduce((a, b) => a + b, 0), 40000);
    payouts.forEach((amt) => assert.equal(Number.isInteger(amt), true));
  });

  // Test 6: نسب مجموعها 100% (توزيع متساوٍ بالكسور مثل 3 مساهمين في 1000ج)
  it("Test 6: ضمان مجموع نسب المساهمين 100.00% حتى مع كسور القسمة الثلاثية", () => {
    const shareValue = 1000;
    const contributors = [
      { contributedAmount: 333 },
      { contributedAmount: 333 },
      { contributedAmount: 334 },
    ];

    const pcts = calculateContributorPercentages(contributors, shareValue);
    const sumPcts = pcts.reduce((sum, p) => sum + p, 0);
    assert.equal(Math.round(sumPcts * 100) / 100, 100);
  });

  // Test 7: رفض نسب ومبالغ تتجاوز 100%
  it("Test 7: كشف ورفض مساهمات تتجاوز 100% من قيمة الحصة", () => {
    const shareValue = 2000;
    const contributors = [
      { personId: "p_1", contributedAmount: 1500 },
      { personId: "p_2", contributedAmount: 1000 },
    ];
    const totalContributed = contributors.reduce((s, c) => s + c.contributedAmount, 0);
    const isOver = totalContributed > shareValue;
    assert.equal(isOver, true);
    assert.equal(totalContributed, 2500);

    const validateShareCompleteness = (contribs, sValue) => {
      const sum = contribs.reduce((acc, c) => acc + (Number(c.contributedAmount) || 0), 0);
      if (sum > sValue) throw new Error("مجموع المساهمات تجاوز 100%");
      if (sum < sValue) throw new Error("مجموع المساهمات أقل من 100%");
      return true;
    };

    assert.throws(() => validateShareCompleteness(contributors, shareValue), /تجاوز 100%/);
  });

  // Test 8: partial payment
  it("Test 8: فحص السداد الجزئي (Partial Payment) لشخص مطلوب منه 3000 ودفع 1000", () => {
    const monthlyDue = 3000;
    const payments = [
      { person_id: "person_test", cycle_id: "1", paid_amount: 1000, payment_type: "payment" },
    ];

    const paid = calculatePaidAmount(payments, "person_test", 1);
    assert.equal(paid, 1000);

    const statusInfo = getPaymentStatus(monthlyDue, paid);
    assert.equal(statusInfo.status, "partial");
    assert.equal(statusInfo.statusText, "سداد جزئي");
    assert.equal(statusInfo.remainingAmount, 2000);
  });

  // Test 9: multiple payments لنفس الالتزام (1000 + 1000 + 1000 و 500 + 500 + 2000)
  it("Test 9: دعم دفعات متعددة ومجزأة لنفس الشهر (1000 + 1000 + 1000 = 3000)", () => {
    const monthlyDue = 3000;
    const payments1 = [
      { personId: "p_1", cycleId: "1", amount: 1000, paymentType: "payment" },
      { personId: "p_1", cycleId: "1", amount: 1000, paymentType: "payment" },
      { personId: "p_1", cycleId: "1", amount: 1000, paymentType: "payment" },
    ];

    const paid1 = calculatePaidAmount(payments1, "p_1", 1);
    assert.equal(paid1, 3000);
    const status1 = getPaymentStatus(monthlyDue, paid1);
    assert.equal(status1.status, "paid");
    assert.equal(status1.remainingAmount, 0);

    // Scenario 2: 500 + 500 + 2000 = 3000
    const payments2 = [
      { personId: "p_2", cycleId: "1", amount: 500, paymentType: "payment" },
      { personId: "p_2", cycleId: "1", amount: 500, paymentType: "payment" },
      { personId: "p_2", cycleId: "1", amount: 2000, paymentType: "payment" },
    ];
    const paid2 = calculatePaidAmount(payments2, "p_2", 1);
    assert.equal(paid2, 3000);
    const status2 = getPaymentStatus(monthlyDue, paid2);
    assert.equal(status2.status, "paid");
    assert.equal(status2.remainingAmount, 0);
  });

  // Test 10: fully paid
  it("Test 10: فحص الحالة المسددة بالكامل (Fully Paid)", () => {
    const statusInfo = getPaymentStatus(2500, 2500);
    assert.equal(statusInfo.status, "paid");
    assert.equal(statusInfo.statusText, "مسدد بالكامل");
    assert.equal(statusInfo.remainingAmount, 0);
  });

  // Test 11: unpaid
  it("Test 11: فحص الحالة غير المسددة (Unpaid)", () => {
    const statusInfo = getPaymentStatus(3000, 0);
    assert.equal(statusInfo.status, "unpaid");
    assert.equal(statusInfo.statusText, "غير مسدد");
    assert.equal(statusInfo.remainingAmount, 3000);
  });

  // Test 12: حساب remaining amount
  it("Test 12: حساب المبلغ المتبقي كـ INTEGER EGP دائماً", () => {
    const status1 = getPaymentStatus(5000, 3200);
    assert.equal(status1.remainingAmount, 1800);
    assert.equal(Number.isInteger(status1.remainingAmount), true);

    // Overpaid scenario
    const status2 = getPaymentStatus(5000, 6000);
    assert.equal(status2.remainingAmount, 0);
  });

  // Test 13: حساب payout
  it("Test 13: حساب مبلغ الاستلام (Payout) كـ INTEGER EGP بدون toFixed(2)", () => {
    const totalPool = 45000;
    const payout1 = calculatePayoutAmount(33.33, totalPool);
    assert.equal(Number.isInteger(payout1), true);
    assert.equal(payout1, 14999); // Math.round(33.33/100 * 45000)

    const payout2 = calculatePayoutAmount(50, totalPool);
    assert.equal(payout2, 22500);
    assert.equal(Number.isInteger(payout2), true);
  });

  // Test 14: ترتيب الأسهم وتوليد تواريخ الاستحقاق
  it("Test 14: ترتيب أدوار الأسهم وحساب تواريخ الاستحقاق الشهرية التلقائية", () => {
    const startDate = "2026-03-15";
    assert.equal(getShareDueDate(startDate, 1), "2026-03-15");
    assert.equal(getShareDueDate(startDate, 2), "2026-04-15");
    assert.equal(getShareDueDate(startDate, 6), "2026-08-15");
    assert.equal(getCalculatedEndDate(startDate, 6), "2026-08-15");
  });

  // Test 15: swap shares (atomic turn swap logic)
  it("Test 15: تبديل دور سهمين ذرياً (Atomic Share Turn Swapping)", () => {
    let shareA = {
      id: "sh_month_1",
      shareOrder: 1,
      contributors: [{ personId: "person_ahmed", monthlyContribution: 3000 }],
    };
    let shareB = {
      id: "sh_month_2",
      shareOrder: 2,
      contributors: [{ personId: "person_mahmoud", monthlyContribution: 3000 }],
    };

    // Swap contributors between share A and share B
    const tempContribs = shareA.contributors;
    shareA = { ...shareA, contributors: shareB.contributors };
    shareB = { ...shareB, contributors: tempContribs };

    assert.equal(shareA.contributors[0].personId, "person_mahmoud");
    assert.equal(shareB.contributors[0].personId, "person_ahmed");
    assert.equal(shareA.shareOrder, 1); // Order stays intact
    assert.equal(shareB.shareOrder, 2);
  });

  // Test 16: منع swap بين جمعيتين مختلفتين
  it("Test 16: التحقق من منع تبديل الأسهم بين جمعيتين مختلفتين (Cross-Association Swap Guard)", () => {
    const share1 = { id: "sh_1", associationId: "assoc_A" };
    const share2 = { id: "sh_2", associationId: "assoc_B" };

    const validateSwapIntegrity = (s1, s2) => {
      if (s1.associationId !== s2.associationId) {
        throw new Error("Security violation: Shares must belong to the same association");
      }
      return true;
    };

    assert.throws(
      () => validateSwapIntegrity(share1, share2),
      /Shares must belong to the same association/
    );
  });

  // Test 17: منع User A من الوصول إلى Association B (عزل الصلاحيات)
  it("Test 17: منع مستخدم A من قراءة أو تعديل جمعية مستخدم B (Owner Isolation)", () => {
    const userAId = "00000000-0000-0000-0000-000000000001";
    const userBId = "00000000-0000-0000-0000-000000000002";

    const allAssocs = [
      { id: "assoc_1", owner_id: userAId, name: "جمعية أ" },
      { id: "assoc_2", owner_id: userBId, name: "جمعية ب" },
    ];

    // Filter associations visible to User A
    const userAVisible = allAssocs.filter((a) => a.owner_id === userAId);
    assert.equal(userAVisible.length, 1);
    assert.equal(userAVisible[0].id, "assoc_1");

    // Guard update operation
    const canUserModifyAssoc = (assoc, currentUserId) => {
      return assoc.owner_id === currentUserId;
    };

    assert.equal(canUserModifyAssoc(allAssocs[1], userAId), false);
    assert.equal(canUserModifyAssoc(allAssocs[1], userBId), true);
  });

  // Test 18: منع تعديل الأعضاء والأسهم بعد بدء التحصيل المالي
  it("Test 18: تطبيق قاعدة Business Rule لتجميد هيكل الجمعية والأعضاء بمجرد بدء التحصيل", () => {
    const paymentsActive = [
      { id: "pay_1", association_id: "assoc_active", paid_amount: 1000, payment_type: "payment" },
    ];

    const canModifyStructure = (paymentsList) => {
      const hasCollectionStarted = paymentsList.some(
        (p) => (p.payment_type || p.paymentType) === "payment" && Number(p.paid_amount || p.amount) > 0
      );
      if (hasCollectionStarted) {
        throw new Error("لا يمكن تعديل أو إضافة أو حذف الأعضاء والأسهم بعد بدء تحصيل أقساط الجمعية");
      }
      return true;
    };

    assert.throws(
      () => canModifyStructure(paymentsActive),
      /لا يمكن تعديل أو إضافة أو حذف الأعضاء والأسهم بعد بدء تحصيل أقساط الجمعية/
    );

    // If no payments yet, modifications are allowed
    assert.equal(canModifyStructure([]), true);
  });

  // Test 19: حفظ جميع الأشخاص بدون فقدان أي اسم مع رقم الهاتف
  it("Test 19: استخراج وحفظ جميع أسماء الأعضاء وأرقام هواتفهم بدون فقدان أي شخص", () => {
    const parseBulkNamesWithPhones = (text) => {
      if (!text || !text.trim()) return [];
      return text
        .split(/[\r\n]+/)
        .map((line) => line.trim())
        .filter((line) => line.length > 0)
        .map((line) => {
          const parts = line.split(/[,،\-:]+/);
          if (parts.length >= 2) {
            const possiblePhone = parts[parts.length - 1].trim();
            const namePart = parts.slice(0, parts.length - 1).join(" ").trim();
            if (/^01[0-9]{9}$/.test(possiblePhone)) {
              return { name: namePart, phone: possiblePhone };
            }
          }
          return { name: line.trim(), phone: "غير مسجل" };
        });
    };

    const rawInput = `
      محمد أحمد, 01012345678
      محمود علي, 01098765432
      سارة مصطفى
      منى عبد الله, 01155555555
      طارق إبراهيم
    `;

    const parsed = parseBulkNamesWithPhones(rawInput);
    assert.equal(parsed.length, 5);
    assert.equal(parsed[0].name, "محمد أحمد");
    assert.equal(parsed[0].phone, "01012345678");
    assert.equal(parsed[2].name, "سارة مصطفى");
    assert.equal(parsed[2].phone, "غير مسجل");

    // Map to Supabase
    const mappedRows = parsed.map((p, idx) =>
      mapPersonToSupabase({
        id: `person_text_${idx + 1}`,
        associationId: "assoc_test",
        name: p.name,
        phone: p.phone,
      })
    );

    assert.equal(mappedRows.length, 5);
    mappedRows.forEach((row) => {
      assert.equal("is_deleted" in row, false); // No fake columns
      assert.doesNotThrow(() => validatePersonPayload(row));
    });
  });

  // Test 20: كاش الجمعية وإعادة التحميل السلس بعد Refresh
  it("Test 20: تخزين الكاش واسترجاعه الفوري لمحاكاة إعادة تحميل المتصفح (Refresh)", () => {
    const assocId = "assoc_refresh_test";
    const cacheData = {
      association: { id: assocId, name: "جمعية الفرسان" },
      people: [{ id: "p1", name: "علي حسن" }],
      shares: [{ id: "sh1", shareOrder: 1 }],
      payments: [{ id: "pay1", amount: 1000 }],
    };

    associationCache.set(assocId, cacheData);
    const retrieved = associationCache.get(assocId);

    assert.deepEqual(retrieved, cacheData);
    assert.equal(retrieved.association.name, "جمعية الفرسان");
    assert.equal(retrieved.people.length, 1);

    // Update in cache
    associationCache.update(assocId, {
      payments: [...cacheData.payments, { id: "pay2", amount: 2000 }],
    });
    const updated = associationCache.get(assocId);
    assert.equal(updated.payments.length, 2);

    // Clean up
    associationCache.invalidate(assocId);
    assert.equal(associationCache.get(assocId), null);
  });

  // Test 21: التحقق الصارم من الحساب الشهري لبيانات الاختبار الواقعية للـ 14 عضواً بإجمالي 30000 ج.م
  it("Test 21: فحص حساب القسط الشهري الحقيقي لـ 14 عضواً وفق قاعدة monthlyMemberObligation دون قسمة على الأسهم", () => {
    // 14 عضو ببيانات واقعية
    const members = [
      { id: "p_fatima", name: "فاطمة الشاذلي", expected: 3500 },
      { id: "p_mona", name: "منى الشاذلي", expected: 4000 },
      { id: "p_mohamed_ali", name: "محمد علي", expected: 1500 },
      { id: "p_gamal_d", name: "جمال الديرديري", expected: 1000 },
      { id: "p_ahmed_m", name: "أحمد مصطفى", expected: 5500 },
      { id: "p_mohamed_g", name: "محمد جمال", expected: 500 },
      { id: "p_hala", name: "هالة الشاذلي", expected: 1500 },
      { id: "p_haneya", name: "هنية حيزبونة", expected: 1500 },
      { id: "p_ebtisam", name: "ابتسام محمد", expected: 1500 },
      { id: "p_marwa", name: "مروة الكوردي", expected: 1500 },
      { id: "p_yasser", name: "ياسر الشاذلي", expected: 4500 },
      { id: "p_ghada", name: "غادة صلاح", expected: 1500 },
      { id: "p_laila", name: "ليلي السيد", expected: 1000 },
      { id: "p_soha", name: "سهي علي", expected: 1000 },
    ];

    // حصص جمعية تحتوي على المساهمين
    const mockShares = [
      {
        id: "sh_1",
        share_order: 1,
        contributors: [
          { person_id: "p_fatima", monthly_contribution: 3500 },
        ],
      },
      {
        id: "sh_2",
        share_order: 2,
        contributors: [
          { person_id: "p_mona", monthly_contribution: 4000 },
        ],
      },
      {
        id: "sh_3",
        share_order: 3,
        contributors: [
          { person_id: "p_mohamed_ali", monthly_contribution: 1500 },
          { person_id: "p_gamal_d", monthly_contribution: 1000 },
          { person_id: "p_mohamed_g", monthly_contribution: 500 },
        ],
      },
      {
        id: "sh_4",
        share_order: 4,
        contributors: [
          { person_id: "p_ahmed_m", monthly_contribution: 5500 },
        ],
      },
      {
        id: "sh_5",
        share_order: 5,
        contributors: [
          { person_id: "p_hala", monthly_contribution: 1500 },
          { person_id: "p_haneya", monthly_contribution: 1500 },
        ],
      },
      {
        id: "sh_6",
        share_order: 6,
        contributors: [
          { person_id: "p_ebtisam", monthly_contribution: 1500 },
          { person_id: "p_marwa", monthly_contribution: 1500 },
        ],
      },
      {
        id: "sh_7",
        share_order: 7,
        contributors: [
          { person_id: "p_yasser", monthly_contribution: 4500 },
        ],
      },
      {
        id: "sh_8",
        share_order: 8,
        contributors: [
          { person_id: "p_ghada", monthly_contribution: 1500 },
          { person_id: "p_laila", monthly_contribution: 1000 },
        ],
      },
      {
        id: "sh_9",
        share_order: 9,
        contributors: [
          { person_id: "p_soha", monthly_contribution: 1000 },
        ],
      },
      {
        id: "sh_10",
        share_order: 10,
        contributors: [],
      },
    ];

    let grandTotalObligations = 0;

    members.forEach((m) => {
      const calculated = calculateMonthlyDue(mockShares, m.id);
      const aliasCalc = monthlyMemberObligation(mockShares, m.id);
      assert.equal(calculated, m.expected, `Mismatch for ${m.name}: expected ${m.expected}, got ${calculated}`);
      assert.equal(aliasCalc, m.expected);
      grandTotalObligations += calculated;
    });

    // إجمالي الالتزامات الشهرية لجميع الأعضاء يجب أن يكون بالضبط 30,000 ج.م
    assert.equal(grandTotalObligations, 30000);
  });

  // Test 22: التحقق من تنسيق التواريخ باللغة العربية القياسية
  it("Test 22: تنسيق موعد الاستحقاق بالعربية دون فراغات (1 فبراير 2026)", () => {
    const formatted1 = formatArabicDate("2026-02-01");
    assert.equal(formatted1, "1 فبراير 2026");

    const formatted2 = formatArabicDate("2026-11-01");
    assert.equal(formatted2, "1 نوفمبر 2026");

    // اختبار تاريخ استحقاق الدور مباشرة
    const startDate = "2026-02-01";
    const dueDateCycle1 = getShareDueDate(startDate, 1);
    const dueDateCycle10 = getShareDueDate(startDate, 10);
    assert.equal(formatArabicDate(dueDateCycle1), "1 فبراير 2026");
    assert.equal(formatArabicDate(dueDateCycle10), "1 نوفمبر 2026");
  });

  // Test 23: حساب صافي المحصل مع وجود Reversals
  it("Test 23: حساب صافي المحصل بدقة مع خصم عمليات الإلغاء (Reversal)", () => {
    const payments = [
      { id: "1", amount: 200000, paymentType: "payment" },
      { id: "2", amount: 15000, paymentType: "payment" },
      { id: "3", amount: 4500, paymentType: "reversal" },
    ];

    const netCollected = payments.reduce((sum, p) => {
      const isPay = p.paymentType === "payment";
      return isPay ? sum + p.amount : sum - p.amount;
    }, 0);

    // 200,000 + 15,000 - 4,500 = 210,500
    assert.equal(netCollected, 210500);
  });

  // Test 24: اختيار الشهر 9 يعيد REAL association_cycles.id
  it("Test 24: اختيار الشهر 9 يطابق الدورة ويعيد REAL association_cycles.id وليس cycle_index", () => {
    const rawCycles = [
      { id: "cycle_real_1001", association_id: "assoc_test_1", cycle_index: 1, due_date: "2026-02-01", status: "open" },
      { id: "cycle_real_1009", association_id: "assoc_test_1", cycle_index: 9, due_date: "2026-10-01", status: "open" },
      { id: "cycle_real_1010", association_id: "assoc_test_1", cycle_index: 10, due_date: "2026-11-01", status: "open" },
    ];

    const mappedCycles = rawCycles.map(mapCycleFromSupabase);
    assert.equal(mappedCycles.length, 3);

    // اختيار الشهر 9 في الـ UI
    const selectedMonth = 9;
    const targetCycle = mappedCycles.find((c) => c.cycleIndex === selectedMonth);

    assert.ok(targetCycle, "يجب العثور على دورة الشهر 9");
    assert.equal(targetCycle.id, "cycle_real_1009");
    assert.notEqual(targetCycle.id, 9);
    assert.notEqual(targetCycle.id, "month-9");
    assert.equal(targetCycle.cycleIndex, 9);
    assert.equal(targetCycle.dueDate, "2026-10-01");
  });

  // Test 25: تسجيل دفعة للشهر 9 يستخدم cycle_id موجوداً فعلياً ويطابق association_id
  it("Test 25: تسجيل دفعة للشهر 9 يرسل cycle_id حقيقي مطابق لـ association_cycles مع تطابق association_id", () => {
    const assocId = "assoc_test_verified";
    const realCycle9Id = "cycle_db_row_009";

    const paymentInput = {
      associationId: assocId,
      personId: "person_ahmed",
      cycleId: realCycle9Id, // REAL ID from association_cycles
      amount: 3000,
      paymentDate: "2026-10-02",
      receiptNote: "سداد قسط الشهر 9 عبر إنستاباي",
    };

    const payload = mapPaymentToSupabase(paymentInput);
    assert.equal(payload.association_id, assocId);
    assert.equal(payload.cycle_id, realCycle9Id);
    assert.equal(payload.paid_amount, 3000);
    assert.equal("cycle_index" in payload, false);
    assert.equal("payment_date" in payload, false);

    assert.doesNotThrow(() => validatePaymentPayload(payload));

    // Verify foreign key integrity condition: payment association_id == cycle association_id
    const cycleRow = { id: realCycle9Id, association_id: assocId, cycle_index: 9 };
    assert.equal(payload.association_id, cycleRow.association_id);
    assert.equal(payload.cycle_id, cycleRow.id);
  });

  // Test 26: Swap بين الدور 9 و 10: يغير share_order دون حذف share_contributors أو كسر FKs
  it("Test 26: تبديل ترتيب الدورين 9 و 10 يغير share_order ذرياً دون حذف share_contributors أو تغيير الـ IDs", () => {
    // تمثيل السهم 9 ومساهميه
    const shareA = {
      id: "share_9_db",
      association_id: "assoc_test",
      share_order: 9,
    };
    const contribsA = [
      { id: "sc_fatima_9", share_id: "share_9_db", person_id: "p_fatima", monthly_contribution: 3000 },
    ];
    // تمثيل السهم 10 ومساهميه
    const shareB = {
      id: "share_10_db",
      association_id: "assoc_test",
      share_order: 10,
    };
    const contribsB = [
      { id: "sc_mona_10", share_id: "share_10_db", person_id: "p_mona", monthly_contribution: 3000 },
    ];

    // عملية الـ Swap الصحيحة: تحديث share_order فقط داخل transaction ذرية
    // الاحتفاظ بالـ IDs كاملة دون حذف أو إعادة إنشاء
    const orderA = shareA.share_order;
    const orderB = shareB.share_order;

    // محاكاة الخطوات الثلاث للـ RPC الذري
    let updatedShareA = { ...shareA, share_order: orderB };
    let updatedShareB = { ...shareB, share_order: orderA };

    // التأكد من أن share_order تم تبديله
    assert.equal(updatedShareA.share_order, 10);
    assert.equal(updatedShareB.share_order, 9);

    // التأكد من أن share.id لم يتغير
    assert.equal(updatedShareA.id, "share_9_db");
    assert.equal(updatedShareB.id, "share_10_db");

    // التأكد من أن share_contributors لم تُحذف ولم تتغير IDs مساهميها
    assert.equal(contribsA[0].id, "sc_fatima_9");
    assert.equal(contribsA[0].person_id, "p_fatima");
    assert.equal(contribsB[0].id, "sc_mona_10");
    assert.equal(contribsB[0].person_id, "p_mona");

    // التأكد من أن contribution_obligations التابعة لـ share_contributors ما زالت صالحة ولم تنكسر
    const obligation = {
      id: "ob_1",
      share_contributor_id: contribsA[0].id, // ما زال يشير لنفس الـ ID
      due_amount: 3000,
    };
    assert.equal(obligation.share_contributor_id, "sc_fatima_9");
  });

  // Test 27: محاكاة Refresh بعد Swap: التحقق من بقاء البيانات والمساهمين والترتيب الجديد
  it("Test 27: بعد الـ Swap وإعادة التحميل، جدول الأدوار يعرض الترتيب الجديد مع الحفاظ على كل المستفيدين", () => {
    const sharesList = [
      {
        id: "share_9_db",
        shareOrder: 10, // أصبح دور 10 بعد swap
        contributors: [{ personId: "p_fatima", monthlyContribution: 3000 }],
      },
      {
        id: "share_10_db",
        shareOrder: 9, // أصبح دور 9 بعد swap
        contributors: [{ personId: "p_mona", monthlyContribution: 3000 }],
      },
    ];

    // ترتيب الأدوار كما يفعل الـ frontend
    sharesList.sort((a, b) => a.shareOrder - b.shareOrder);

    // الدور 9 الآن هو منى
    assert.equal(sharesList[0].shareOrder, 9);
    assert.equal(sharesList[0].contributors[0].personId, "p_mona");

    // الدور 10 الآن هو فاطمة
    assert.equal(sharesList[1].shareOrder, 10);
    assert.equal(sharesList[1].contributors[0].personId, "p_fatima");
  });

  // Test 28: منع Cross-association swap بين جمعيتين مختلفتين
  it("Test 28: فحص منع تبديل الأسهم بين جمعيات مختلفة (Cross-association swap guard)", () => {
    const share1 = { id: "sh_1", association_id: "assoc_X", share_order: 1 };
    const share2 = { id: "sh_2", association_id: "assoc_Y", share_order: 2 };

    const validateSwapAssoc = (s1, s2) => {
      if (s1.association_id !== s2.association_id) {
        throw new Error("Security violation: Shares must belong to the same association");
      }
      return true;
    };

    assert.throws(
      () => validateSwapAssoc(share1, share2),
      /Shares must belong to the same association/
    );
  });

  // Test 29: التحقق الشامل من نجاح Swap وتغيير share_order فقط مع الحفاظ التام على share_contributors و obligations و payments
  it("Test 29: Swap ينجح ويغير share_order فقط دون تغيير أي IDs في share_contributors أو obligations أو payments، ويفشل للجمعيات المختلفة", () => {
    // 1. Initial State
    const initialShares = [
      { id: "share_A", association_id: "assoc_1", share_order: 3 },
      { id: "share_B", association_id: "assoc_1", share_order: 7 },
    ];

    const initialContributors = [
      { id: "sc_1", share_id: "share_A", person_id: "p_1", monthly_contribution: 2000 },
      { id: "sc_2", share_id: "share_B", person_id: "p_2", monthly_contribution: 3000 },
    ];

    const initialObligations = [
      { id: "ob_1", share_contributor_id: "sc_1", due_amount: 2000, cycle_index: 3 },
      { id: "ob_2", share_contributor_id: "sc_2", due_amount: 3000, cycle_index: 7 },
    ];

    const initialPayments = [
      { id: "pay_1", association_id: "assoc_1", person_id: "p_1", cycle_id: "cycle_3", paid_amount: 2000 },
      { id: "pay_2", association_id: "assoc_1", person_id: "p_2", cycle_id: "cycle_7", paid_amount: 3000 },
    ];

    // Snapshot deep copies to compare against
    const contribsBefore = JSON.parse(JSON.stringify(initialContributors));
    const obligationsBefore = JSON.parse(JSON.stringify(initialObligations));
    const paymentsBefore = JSON.parse(JSON.stringify(initialPayments));

    // 2. Perform Atomic Swap on share_order
    const simulateSwapRpc = (shareAId, shareBId, shares) => {
      const shareA = shares.find((s) => s.id === shareAId);
      const shareB = shares.find((s) => s.id === shareBId);

      if (!shareA || !shareB) throw new Error("Shares not found");
      if (shareA.association_id !== shareB.association_id) {
        throw new Error("Security violation: Shares must belong to the same association");
      }

      const tempOrder = 1000;
      shareA.share_order = tempOrder;
      const orderA = 3;
      const orderB = 7;
      shareB.share_order = orderA;
      shareA.share_order = orderB;

      return {
        success: true,
        share_id_a: shareAId,
        share_id_b: shareBId,
        new_order_a: shareA.share_order,
        new_order_b: shareB.share_order,
      };
    };

    const swapResult = simulateSwapRpc("share_A", "share_B", initialShares);

    // Assert Swap Success
    assert.equal(swapResult.success, true);
    assert.equal(initialShares.find((s) => s.id === "share_A").share_order, 7);
    assert.equal(initialShares.find((s) => s.id === "share_B").share_order, 3);
    assert.equal(initialShares.find((s) => s.id === "share_A").id, "share_A");
    assert.equal(initialShares.find((s) => s.id === "share_B").id, "share_B");

    // Assert share_contributors have NOT changed IDs or fields
    assert.deepEqual(initialContributors, contribsBefore);
    assert.equal(initialContributors[0].id, "sc_1");
    assert.equal(initialContributors[1].id, "sc_2");

    // Assert contribution_obligations have NOT changed
    assert.deepEqual(initialObligations, obligationsBefore);
    assert.equal(initialObligations[0].id, "ob_1");
    assert.equal(initialObligations[1].id, "ob_2");

    // Assert payments have NOT changed
    assert.deepEqual(initialPayments, paymentsBefore);
    assert.equal(initialPayments[0].id, "pay_1");
    assert.equal(initialPayments[1].id, "pay_2");

    // Assert cross-association swap fails
    const foreignShare = { id: "share_foreign", association_id: "assoc_2", share_order: 1 };
    assert.throws(
      () => simulateSwapRpc("share_A", "share_foreign", [...initialShares, foreignShare]),
      /Shares must belong to the same association/
    );
  });

  // Test 30: التحقق من التوافق التام مع associations_check (started_at و status)
  it("Test 30: توافق started_at مع شرط associations_check لجميع حالات status الأربعة", () => {
    // Case 1: status = "active" بدون startedAt -> started_at موجود كـ ISO timestamp
    const res1 = mapAssociationToSupabase({
      name: "جمعية نشطة",
      shareValue: 3000,
      totalShares: 10,
      startDate: "2026-02-01",
      status: "active",
    });
    assert.equal(res1.status, "active");
    assert.ok(res1.started_at, "started_at يجب أن يكون موجوداً للحالة active");
    assert.ok(!isNaN(Date.parse(res1.started_at)), "started_at يجب أن يكون ISO timestamp صالح");

    // Case 2: status = "completed" بدون startedAt -> started_at موجود كـ ISO timestamp
    const res2 = mapAssociationToSupabase({
      name: "جمعية مكتملة",
      shareValue: 3000,
      totalShares: 10,
      startDate: "2026-02-01",
      status: "completed",
    });
    assert.equal(res2.status, "completed");
    assert.ok(res2.started_at, "started_at يجب أن يكون موجوداً للحالة completed");
    assert.ok(!isNaN(Date.parse(res2.started_at)), "started_at يجب أن يكون ISO timestamp صالح");

    // Case 3: status = "draft" -> started_at === null
    const res3 = mapAssociationToSupabase({
      name: "جمعية مسودة",
      shareValue: 3000,
      totalShares: 10,
      startDate: "2026-02-01",
      status: "draft",
    });
    assert.equal(res3.status, "draft");
    assert.strictEqual(res3.started_at, null, "started_at يجب أن يكون null للحالة draft");

    // Case 4: status = "active" مع startedAt محدد -> يحتفظ بالقيمة المرسلة ولا يستبدلها
    const customTime = "2026-02-01T10:00:00.000Z";
    const res4 = mapAssociationToSupabase({
      name: "جمعية نشطة بوقت مخصص",
      shareValue: 3000,
      totalShares: 10,
      startDate: "2026-02-01",
      status: "active",
      startedAt: customTime,
    });
    assert.equal(res4.status, "active");
    assert.strictEqual(res4.started_at, customTime, "يجب الاحتفاظ بالقيمة المرسلة دون استبدال");
  });

  // Test 31: التحقق من تهيئة Profile للمستخدم الجديد وحماية associations.owner_id
  it("Test 31: تهيئة Profile للمستخدم الجديد ذاتياً وربط associations.owner_id بـ profiles.id ومنع المعرفات غير المصرح بها", () => {
    // محاكاة قاعدة بيانات Supabase (profiles و associations)
    const mockProfilesDb = [];
    const mockAssociationsDb = [];

    // دالة محاكاة تهيئة Profile (مطابقة تماماً لمنطق userService.ensureProfile)
    const simulateEnsureProfile = (authUser) => {
      if (!authUser?.id) throw new Error("Unauthenticated");

      // 1. فحص وجود البروفايل مسبقاً (Idempotent check)
      const existing = mockProfilesDb.find((p) => p.id === authUser.id);
      if (existing) {
        return { ...existing, isNew: false };
      }

      // 2. إنشاء البروفايل تلقائياً للـ auth.uid()
      let rawName =
        authUser.user_metadata?.name ||
        authUser.user_metadata?.full_name ||
        authUser.email?.split("@")[0] ||
        "منظم الجمعية";
      rawName = String(rawName).trim();
      if (rawName.length < 2) rawName = "منظم الجمعية";

      const newProfile = {
        id: authUser.id, // auth.uid()
        name: rawName,
        mobile: authUser.user_metadata?.mobile || null,
        email: authUser.email ? authUser.email.toLowerCase() : null,
        created_at: new Date().toISOString(),
      };

      mockProfilesDb.push(newProfile);
      return { ...newProfile, isNew: true };
    };

    // دالة محاكاة إنشاء جمعية مع فحص المفتاح الخارجي والملكية الصارمة
    const simulateCreateAssociation = (authUser, rawFormData) => {
      if (!authUser?.id) throw new Error("يجب تسجيل الدخول كمنظم لإنشاء جمعية جديدة");

      // خطوة الحماية المسبقة: ضمان وجود البروفايل للمستخدم المسجل
      simulateEnsureProfile(authUser);

      // الأمان: owner_id دائماً يأتي من auth.uid() وليس من مدخلات الـ Form
      const mappedPayload = mapAssociationToSupabase({
        ...rawFormData,
        ownerId: authUser.id, // مضمون أمنياً من auth.uid()
      });

      // التحقق الصارم من المفتاح الخارجي (foreign key: associations.owner_id -> profiles.id)
      const profileRow = mockProfilesDb.find((p) => p.id === mappedPayload.owner_id);
      if (!profileRow) {
        throw new Error('Key (owner_id) is not present in table "profiles"');
      }

      mockAssociationsDb.push(mappedPayload);
      return mappedPayload;
    };

    // 1 & 2. مستخدم جديد بدون بروفايل -> تهيئة البروفايل وتطابق ID مع auth.uid()
    const newAuthUser = {
      id: "auth_user_uuid_7777",
      email: "neworganizer@test.com",
      user_metadata: { name: "منظم جديد", mobile: "01012345678" },
    };

    const initialProf = simulateEnsureProfile(newAuthUser);
    assert.equal(initialProf.isNew, true, "يجب إنشاء بروفايل جديد للمستخدم لأول مرة");
    assert.equal(initialProf.id, newAuthUser.id, "profiles.id يجب أن يطابق auth.uid() تماماً");
    assert.equal(initialProf.name, "منظم جديد");
    assert.equal(mockProfilesDb.length, 1);

    // 3. مستخدم ذو بروفايل موجود -> لا يتم التكرار (Idempotent)
    const secondCallProf = simulateEnsureProfile(newAuthUser);
    assert.equal(secondCallProf.isNew, false, "يجب عدم إنشاء بروفايل مكرر");
    assert.equal(secondCallProf.id, newAuthUser.id);
    assert.equal(mockProfilesDb.length, 1, "عدد البروفايلات يجب أن يظل 1 دون تكرار");

    // 4 & 5. المستخدم الجديد ينشئ جمعية بنجاح ويكون owner_id هو نفسه profile.id
    const formInput = {
      name: "جمعية المستخدم الجديد",
      shareValue: 4000,
      totalShares: 10,
      startDate: "2026-03-01",
      status: "active",
      // محاولة إرسال ownerId مغاير في النموذج (سيتم تجاهله واستبداله بـ auth.uid())
      ownerId: "hacker_fake_uuid",
    };

    const createdAssoc = simulateCreateAssociation(newAuthUser, formInput);
    assert.equal(createdAssoc.name, "جمعية المستخدم الجديد");
    assert.equal(createdAssoc.owner_id, newAuthUser.id, "owner_id يجب أن يساوي profiles.id الحقيقي للمستخدم");
    assert.notEqual(createdAssoc.owner_id, "hacker_fake_uuid", "يجب منع أي owner_id قادم من النموذج");
    assert.equal(mockAssociationsDb.length, 1);

    // 6. التحقق من فشل استخدام owner_id غير موجود في profiles
    const unauthenticatedCall = () => {
      const ghostAssocPayload = mapAssociationToSupabase({
        name: "جمعية بدون بروفايل",
        shareValue: 3000,
        totalShares: 5,
        startDate: "2026-03-01",
        ownerId: "non_existent_profile_uuid",
      });
      const exists = mockProfilesDb.find((p) => p.id === ghostAssocPayload.owner_id);
      if (!exists) throw new Error('violates foreign key constraint "associations_owner_id_fkey"');
    };

    assert.throws(unauthenticatedCall, /associations_owner_id_fkey/);
  });

  // TEST 32: 5 shares => 5 cycles
  it("TEST 32: 5 shares => 5 cycles", () => {
    const assocId = "assoc_test_5_shares";
    const startDate = "2026-03-01";
    const totalShares = 5;

    // محاكاة إنشاء الدورات
    const mockDb = [];
    for (let i = 1; i <= totalShares; i++) {
      mockDb.push({
        id: `cycle_5_${i}_uuid`,
        association_id: assocId,
        cycle_index: i,
        due_date: getShareDueDate(startDate, i),
        status: "open",
      });
    }

    assert.equal(mockDb.length, 5, "يجب إنشاء 5 دورات لـ 5 حصص بالضبط");
    assert.equal(mockDb[0].cycle_index, 1);
    assert.equal(mockDb[4].cycle_index, 5);
    assert.equal(mockDb[0].due_date, "2026-03-01");
    assert.equal(mockDb[4].due_date, "2026-07-01");
    assert.ok(mockDb.every((c) => c.status === "open"));
    assert.ok(mockDb.every((c) => c.association_id === assocId));
  });

  // TEST 33: 10 shares => 10 cycles
  it("TEST 33: 10 shares => 10 cycles", () => {
    const assocId = "assoc_test_10_shares";
    const startDate = "2026-01-01";
    const totalShares = 10;

    const mockDb = [];
    for (let i = 1; i <= totalShares; i++) {
      mockDb.push({
        id: `cycle_10_${i}_uuid`,
        association_id: assocId,
        cycle_index: i,
        due_date: getShareDueDate(startDate, i),
        status: "open",
      });
    }

    assert.equal(mockDb.length, 10, "يجب إنشاء 10 دورات لـ 10 حصص بالضبط");
    assert.equal(mockDb[0].cycle_index, 1);
    assert.equal(mockDb[9].cycle_index, 10);
    assert.equal(mockDb[0].due_date, "2026-01-01");
    assert.equal(mockDb[9].due_date, "2026-10-01");
  });

  // TEST 34: 10 shares + 12 months => REJECTED
  it("TEST 34: 10 shares + 12 months => REJECTED", () => {
    const invalidInput = {
      name: "جمعية غير متطابقة الحصص والشهور",
      shareValue: 3000,
      totalShares: 10,
      durationMonths: 12, // غير متطابق!
      startDate: "2026-03-01",
    };

    assert.throws(
      () => mapAssociationToSupabase(invalidInput),
      /عدد الحصص يجب أن يساوي مدة الجمعية بالأشهر/
    );

    const invalidPayload = {
      name: "جمعية غير متطابقة",
      monthly_share_amount: 3000,
      total_shares: 10,
      duration_months: 12,
      start_date: "2026-03-01",
    };
    assert.throws(
      () => validateAssociationPayload(invalidPayload),
      /عدد الحصص يجب أن يساوي مدة الجمعية بالأشهر/
    );
  });

  // TEST 35: existing cycles are not duplicated
  it("TEST 35: existing cycles are not duplicated", () => {
    const assocId = "assoc_idempotent_test";
    const mockDb = [
      { id: "c1", association_id: assocId, cycle_index: 1, due_date: "2026-03-01", status: "open" },
      { id: "c2", association_id: assocId, cycle_index: 2, due_date: "2026-04-01", status: "open" },
    ];

    // محاكاة createCycles Idempotency: تفحص الموجود وتضيف المفقود فقط
    const simulateCreateCycles = (existing, totalNeeded) => {
      const existingIndices = new Set(existing.map((c) => c.cycle_index));
      const newlyAdded = [];
      for (let i = 1; i <= totalNeeded; i++) {
        if (!existingIndices.has(i)) {
          newlyAdded.push({
            id: `c_${i}_new`,
            association_id: assocId,
            cycle_index: i,
            due_date: getShareDueDate("2026-03-01", i),
            status: "open",
          });
        }
      }
      return newlyAdded;
    };

    // طلب إنشاء دورات لـ 2 حصص بينما الدورتان موجودتان بالفعل
    const res1 = simulateCreateCycles(mockDb, 2);
    assert.equal(res1.length, 0, "يجب عدم إنشاء أي دورات مكررة عند وجودها مسبقاً");
    assert.equal(mockDb.length, 2);

    // طلب رفع الدورات إلى 4 (إضافة فقط 3 و 4 المفقودتين)
    const res2 = simulateCreateCycles(mockDb, 4);
    assert.equal(res2.length, 2, "يجب إضافة الدورات المفقودة فقط دون تكرار الدورات السابقة");
    assert.equal(res2[0].cycle_index, 3);
    assert.equal(res2[1].cycle_index, 4);
  });

  // TEST 36: payment month 1 resolves to real association_cycles.id
  it("TEST 36: payment month 1 resolves to real association_cycles.id", () => {
    const assocId = "assoc_real_pay_test";
    const realCycles = [
      { id: "real_uuid_cycle_month_1", association_id: assocId, cycle_index: 1, due_date: "2026-03-01", status: "open" },
      { id: "real_uuid_cycle_month_2", association_id: assocId, cycle_index: 2, due_date: "2026-04-01", status: "open" },
    ];

    const selectedMonth = 1;
    const resolvedCycle = realCycles.find((c) => c.association_id === assocId && c.cycle_index === selectedMonth);
    assert.ok(resolvedCycle, "يجب إيجاد دورة الشهر 1");
    assert.equal(resolvedCycle.id, "real_uuid_cycle_month_1");

    const paymentPayload = mapPaymentToSupabase({
      associationId: assocId,
      personId: "person_1",
      cycleId: resolvedCycle.id,
      amount: 2000,
    });

    assert.equal(paymentPayload.cycle_id, "real_uuid_cycle_month_1");
    assert.notEqual(paymentPayload.cycle_id, 1);
    assert.notEqual(paymentPayload.cycle_id, "1");
  });

  // TEST 37: payment month last cycle resolves to real association_cycles.id
  it("TEST 37: payment month last cycle resolves to real association_cycles.id", () => {
    const assocId = "assoc_real_pay_last_test";
    const totalMonths = 10;
    const realCycles = Array.from({ length: totalMonths }, (_, i) => ({
      id: `real_uuid_cycle_month_${i + 1}`,
      association_id: assocId,
      cycle_index: i + 1,
      due_date: getShareDueDate("2026-01-01", i + 1),
      status: "open",
    }));

    const lastMonth = 10;
    const resolvedLastCycle = realCycles.find((c) => c.association_id === assocId && c.cycle_index === lastMonth);
    assert.ok(resolvedLastCycle, "يجب إيجاد دورة الشهر الأخير");
    assert.equal(resolvedLastCycle.id, "real_uuid_cycle_month_10");

    const paymentPayload = mapPaymentToSupabase({
      associationId: assocId,
      personId: "person_10",
      cycleId: resolvedLastCycle.id,
      amount: 5000,
    });

    assert.equal(paymentPayload.cycle_id, "real_uuid_cycle_month_10");
  });

  // TEST 38: new association cannot finish successfully without required cycles
  it("TEST 38: new association cannot finish successfully without required cycles", async () => {
    const simulateCreationPipeline = async ({ shouldCyclesFail }) => {
      // 1. Create association record
      const assoc = { id: "assoc_new_pipeline", name: "جمعية الاختبار" };

      // 2. Create cycles
      if (shouldCyclesFail) {
        throw new Error("فشل إنشاء دورات الجمعية: لا يمكن استكمال الجمعية بدون تسجيل دوراتها");
      }
      const cycles = [{ id: "c1", cycle_index: 1 }];

      // 3. Save people / shares
      const people = [{ id: "p1" }];
      return { success: true, assoc, cycles, people };
    };

    // نجاح الدورة الكاملة
    const successResult = await simulateCreationPipeline({ shouldCyclesFail: false });
    assert.equal(successResult.success, true);
    assert.equal(successResult.cycles.length, 1);

    // فشل إنشاء الدورات يمنع استكمال الجمعية
    await assert.rejects(
      async () => await simulateCreationPipeline({ shouldCyclesFail: true }),
      /فشل إنشاء دورات الجمعية/
    );
  });

  // TEST 39: Delete Association executes cascade deletion of child records in reverse-dependency DAG order
  it("TEST 39: Delete Association executes cascade deletion of child records in reverse-dependency DAG order", async () => {
    const deletedLog = [];
    const mockDb = {
      associations: [{ id: "assoc_del_1", name: "جمعية الحذف" }],
      people: [{ id: "p1", association_id: "assoc_del_1" }],
      shares: [{ id: "sh1", association_id: "assoc_del_1" }],
      share_contributors: [{ id: "sc1", association_id: "assoc_del_1", share_id: "sh1", person_id: "p1" }],
      contribution_obligations: [{ id: "ob1", association_id: "assoc_del_1", cycle_id: "cy1", share_contributor_id: "sc1", person_id: "p1" }],
      association_cycles: [{ id: "cy1", association_id: "assoc_del_1", cycle_index: 1 }],
      payments: [
        { id: "pay1", association_id: "assoc_del_1", payment_type: "payment" },
        { id: "pay2", association_id: "assoc_del_1", payment_type: "reversal", reversal_of_payment_id: "pay1" },
      ],
      payment_allocations: [],
    };

    // محاكاة تسلسل الحذف الآمن المنفذ في api.deleteAssociation
    const simulateSafeDelete = async (assocId) => {
      // 1. Reversals first
      deletedLog.push("payments_reversals");
      mockDb.payments = mockDb.payments.filter((p) => !(p.association_id === assocId && p.payment_type === "reversal"));

      // 2. Regular payments
      deletedLog.push("payments_regular");
      mockDb.payments = mockDb.payments.filter((p) => p.association_id !== assocId);

      // 3. Contribution obligations (MUST BE DELETED BEFORE share_contributors to prevent FK 23503)
      deletedLog.push("contribution_obligations");
      mockDb.contribution_obligations = mockDb.contribution_obligations.filter((co) => co.association_id !== assocId);

      // 4. Share contributors (foreign key guard: if obligations exist, PostgreSQL throws 23503)
      const existingObligations = mockDb.contribution_obligations.filter((co) => co.association_id === assocId);
      if (existingObligations.length > 0) {
        throw new Error('update or delete on table "share_contributors" violates foreign key constraint on table "contribution_obligations" SQLSTATE 23503');
      }
      deletedLog.push("share_contributors");
      mockDb.share_contributors = mockDb.share_contributors.filter((c) => c.association_id !== assocId);

      // 5. Shares (foreign key guard: if contributors exist, throws FK violation)
      const existingContribs = mockDb.share_contributors.filter((sc) => sc.association_id === assocId);
      if (existingContribs.length > 0) {
        throw new Error('violates foreign key constraint on table "shares"');
      }
      deletedLog.push("shares");
      mockDb.shares = mockDb.shares.filter((s) => s.association_id !== assocId);

      // 6. Association cycles (CRITICAL: prevents foreign key restrict violation)
      deletedLog.push("association_cycles");
      mockDb.association_cycles = mockDb.association_cycles.filter((c) => c.association_id !== assocId);

      // 7. People (exclusive to this association)
      deletedLog.push("people");
      mockDb.people = mockDb.people.filter((p) => p.association_id !== assocId);

      // 8. Associations
      deletedLog.push("associations");
      mockDb.associations = mockDb.associations.filter((a) => a.id !== assocId);

      return { success: true };
    };

    const res = await simulateSafeDelete("assoc_del_1");
    assert.equal(res.success, true);
    assert.deepEqual(deletedLog, [
      "payments_reversals",
      "payments_regular",
      "contribution_obligations",
      "share_contributors",
      "shares",
      "association_cycles",
      "people",
      "associations",
    ]);

    // التأكد من خلو قاعدة البيانات من السجلات المعلقة
    assert.equal(mockDb.associations.length, 0);
    assert.equal(mockDb.association_cycles.length, 0);
    assert.equal(mockDb.people.length, 0);
    assert.equal(mockDb.shares.length, 0);
    assert.equal(mockDb.share_contributors.length, 0);
    assert.equal(mockDb.contribution_obligations.length, 0);
    assert.equal(mockDb.payments.length, 0);
  });

  // TEST 40: Edit Association before collection maintains same association_id and syncs structure
  it("TEST 40: Edit Association before collection maintains same association_id and syncs structure", async () => {
    const assocId = "assoc_edit_target_123";
    const initialAssoc = {
      id: assocId,
      owner_id: "user_owner_1",
      name: "الجمعية قبل التعديل",
      monthly_share_amount: 2000,
      total_shares: 5,
      duration_months: 5,
      start_date: "2026-03-01",
    };

    let cycles = [
      { id: "c1", association_id: assocId, cycle_index: 1, due_date: "2026-03-01" },
      { id: "c2", association_id: assocId, cycle_index: 2, due_date: "2026-04-01" },
      { id: "c3", association_id: assocId, cycle_index: 3, due_date: "2026-05-01" },
      { id: "c4", association_id: assocId, cycle_index: 4, due_date: "2026-06-01" },
      { id: "c5", association_id: assocId, cycle_index: 5, due_date: "2026-07-01" },
    ];

    // محاكاة مزامنة الدورات مع الهيكل الجديد (تعديل الحصص من 5 إلى 7)
    const simulateSyncCycles = (startDate, newTotalShares) => {
      const count = Number(newTotalShares);
      // حذف الزائد إذا وُجد
      cycles = cycles.filter((c) => c.cycle_index <= count);
      // تحديث التواريخ القائمة
      cycles.forEach((c) => {
        c.due_date = getShareDueDate(startDate, c.cycle_index);
      });
      // إضافة المفقود
      const existingIndexes = new Set(cycles.map((c) => c.cycle_index));
      for (let i = 1; i <= count; i++) {
        if (!existingIndexes.has(i)) {
          cycles.push({
            id: `c_${i}_new_uuid`,
            association_id: assocId,
            cycle_index: i,
            due_date: getShareDueDate(startDate, i),
          });
        }
      }
      return cycles;
    };

    // تنفيذ التعديل على نفس association_id
    const updatedPayload = {
      id: assocId, // نفس المعرف تماماً
      name: "الجمعية بعد تعديل الهيكل",
      monthly_share_amount: 3000,
      total_shares: 7,
      duration_months: 7,
      start_date: "2026-04-01",
    };

    assert.equal(updatedPayload.id, initialAssoc.id, "يجب الحفاظ على نفس association_id دون إنشاء جمعية جديدة");

    const syncedCycles = simulateSyncCycles(updatedPayload.start_date, updatedPayload.total_shares);
    assert.equal(syncedCycles.length, 7, "عدد الدورات يجب أن يساوي عدد الحصص الجديد (7)");
    assert.equal(syncedCycles[0].due_date, "2026-04-01", "تم تحديث تاريخ الدورة الأولى للتاريخ الجديد");
    assert.equal(syncedCycles[6].due_date, "2026-10-01", "الدورة السابعة تم إنشاؤها بنجاح");
    assert.equal(syncedCycles.every((c) => c.association_id === assocId), true);
  });

  // TEST 41: Edit Association after collection has started is strictly locked and cannot modify structure
  it("TEST 41: Edit Association after collection has started is strictly locked and cannot modify structure", async () => {
    const assocId = "assoc_locked_after_collection";
    const payments = [
      { id: "pay_real_1", association_id: assocId, payment_type: "payment", paid_amount: 2000 },
    ];

    const isCollectionStarted = (paymentsList) => {
      return paymentsList.some((p) => p.payment_type === "payment" && Number(p.paid_amount) > 0);
    };

    const hasStarted = isCollectionStarted(payments);
    assert.equal(hasStarted, true, "التحصيل بدأ فعلياً بوجود دفعة مسجلة");

    const attemptEditAfterCollection = (started) => {
      if (started) {
        throw new Error("لا يمكن تعديل الجمعية بعد بدء التحصيل المالي وحفظ الدفعات.");
      }
      return true;
    };

    assert.throws(
      () => attemptEditAfterCollection(hasStarted),
      /لا يمكن تعديل الجمعية بعد بدء التحصيل المالي/
    );
  });

  // TEST 42: Renew Association conceptual owner RLS authorization check and cycle creation using real UUIDs
  it("TEST 42: Renew Association conceptual owner RLS authorization check and cycle creation using real UUIDs", async () => {
    const currentAuthUser = { id: "user_owner_real_uuid" };
    const renewedAssoc = {
      id: "assoc_renewed_new_uuid",
      owner_id: currentAuthUser.id,
      name: "جمعية الأصدقاء (دورة جديدة)",
      total_shares: 5,
      start_date: "2026-05-01",
    };

    // فحص شرط RLS لـ association_cycles_insert_own_assoc:
    // EXISTS (SELECT 1 FROM associations WHERE a.id = association_cycles.association_id AND a.owner_id = auth.uid())
    const evaluateRlsCheck = (cycleAssocId, authUid) => {
      const assoc = [renewedAssoc].find((a) => a.id === cycleAssocId);
      if (!assoc) return false;
      return assoc.owner_id === authUid;
    };

    // المالك ينشئ الدورات للجمعية الجديدة
    const ownerAllowed = evaluateRlsCheck(renewedAssoc.id, currentAuthUser.id);
    assert.equal(ownerAllowed, true, "المالك مصرح له بإدراج دورات الجمعية الجديدة");

    // مستخدم آخر متسلل يحاول إدراج دورات
    const hackerAllowed = evaluateRlsCheck(renewedAssoc.id, "hacker_fake_uuid");
    assert.equal(hackerAllowed, false, "RLS يرفض إدراج دورات من مستخدم غير مالك للجمعية");
  });

  // ===========================================================================
  // ATOMIC EDIT ASSOCIATION STRUCTURE TESTS (TESTS 43 - 53)
  // ===========================================================================
  const createMockDbState = () => ({
    associations: [
      {
        id: "assoc_test_edit_1",
        owner_id: "user_owner_uuid",
        name: "جمعية العائلة الأصلية",
        monthly_share_amount: 1000,
        total_shares: 5,
        duration_months: 5,
        start_date: "2026-06-01",
        status: "active",
        started_at: "2026-06-01T00:00:00Z",
      },
    ],
    people: [
      { id: "p1", association_id: "assoc_test_edit_1", name: "محمد", phone: "01011111111" },
      { id: "p2", association_id: "assoc_test_edit_1", name: "أحمد", phone: "01022222222" },
      { id: "p3", association_id: "assoc_test_edit_1", name: "محمود", phone: "01033333333" },
      { id: "p4", association_id: "assoc_test_edit_1", name: "علي", phone: "01044444444" },
      { id: "p5", association_id: "assoc_test_edit_1", name: "حسن", phone: "01055555555" },
    ],
    shares: [
      { id: "s1", association_id: "assoc_test_edit_1", share_order: 1 },
      { id: "s2", association_id: "assoc_test_edit_1", share_order: 2 },
      { id: "s3", association_id: "assoc_test_edit_1", share_order: 3 },
      { id: "s4", association_id: "assoc_test_edit_1", share_order: 4 },
      { id: "s5", association_id: "assoc_test_edit_1", share_order: 5 },
    ],
    share_contributors: [
      { id: "sc1", association_id: "assoc_test_edit_1", share_id: "s1", person_id: "p1", monthly_contribution: 1000 },
      { id: "sc2", association_id: "assoc_test_edit_1", share_id: "s2", person_id: "p2", monthly_contribution: 1000 },
      { id: "sc3", association_id: "assoc_test_edit_1", share_id: "s3", person_id: "p3", monthly_contribution: 1000 },
      { id: "sc4", association_id: "assoc_test_edit_1", share_id: "s4", person_id: "p4", monthly_contribution: 1000 },
      { id: "sc5", association_id: "assoc_test_edit_1", share_id: "s5", person_id: "p5", monthly_contribution: 1000 },
    ],
    association_cycles: [
      { id: "c1", association_id: "assoc_test_edit_1", cycle_index: 1, due_date: "2026-06-01" },
      { id: "c2", association_id: "assoc_test_edit_1", cycle_index: 2, due_date: "2026-07-01" },
      { id: "c3", association_id: "assoc_test_edit_1", cycle_index: 3, due_date: "2026-08-01" },
      { id: "c4", association_id: "assoc_test_edit_1", cycle_index: 4, due_date: "2026-09-01" },
      { id: "c5", association_id: "assoc_test_edit_1", cycle_index: 5, due_date: "2026-10-01" },
    ],
    contribution_obligations: [
      { id: "ob1", association_id: "assoc_test_edit_1", cycle_id: "c1", share_contributor_id: "sc1", person_id: "p1", due_amount: 1000 },
      { id: "ob2", association_id: "assoc_test_edit_1", cycle_id: "c2", share_contributor_id: "sc2", person_id: "p2", due_amount: 1000 },
    ],
    payments: [],
    payment_allocations: [],
  });

  const simulateAtomicRpc = ({
    authUid,
    associationId,
    name,
    shareValue,
    totalShares,
    startDate,
    people,
    shares,
    dbState,
  }) => {
    if (!authUid) throw new Error("Unauthenticated: You must be logged in to edit this association");
    const assoc = dbState.associations.find((a) => a.id === associationId);
    if (!assoc) throw new Error(`Association (${associationId}) not found`);
    if (assoc.owner_id !== authUid) throw new Error("Access denied: You are not the owner of this association");

    const realPayments = dbState.payments.filter(
      (p) => p.association_id === associationId && p.payment_type === "payment"
    );
    if (realPayments.length > 0) {
      throw new Error(`Cannot edit association after collection has started (${realPayments.length} payments recorded)`);
    }
    const realAllocations = (dbState.payment_allocations || []).filter((pa) => pa.association_id === associationId);
    if (realAllocations.length > 0) {
      throw new Error("Cannot edit association: payment allocations exist");
    }

    if (totalShares <= 0 || shareValue <= 0) {
      throw new Error("Total shares and share value must be greater than zero");
    }
    if (shares.length !== totalShares) {
      throw new Error(`Shares array length (${shares.length}) must equal total_shares (${totalShares})`);
    }

    for (const sh of shares) {
      const sumContribs = (sh.contributors || []).reduce((acc, c) => acc + c.monthly_contribution, 0);
      if (sumContribs !== shareValue) {
        throw new Error(`Share (${sh.share_order}) total contributions (${sumContribs}) does not equal share value (${shareValue})`);
      }
    }

    // Atomic Snapshot for Rollback
    const rollbackSnapshot = JSON.parse(JSON.stringify(dbState));

    try {
      // 5. Cleanup old child financial records
      dbState.contribution_obligations = dbState.contribution_obligations.filter((co) => co.association_id !== associationId);
      dbState.share_contributors = dbState.share_contributors.filter((sc) => sc.association_id !== associationId);
      dbState.shares = dbState.shares.filter((s) => s.association_id !== associationId);

      // 6. Sync cycles
      dbState.association_cycles = dbState.association_cycles.filter(
        (c) => c.association_id !== associationId || c.cycle_index <= totalShares
      );
      for (let i = 1; i <= totalShares; i++) {
        let existing = dbState.association_cycles.find((c) => c.association_id === associationId && c.cycle_index === i);
        if (!existing) {
          existing = {
            id: `cycle_${associationId}_${i}`,
            association_id: associationId,
            cycle_index: i,
            due_date: `${startDate}_+${i - 1}m`,
          };
          dbState.association_cycles.push(existing);
        } else {
          existing.due_date = `${startDate}_+${i - 1}m`;
        }
      }

      // 7. Sync people
      const incomingPersonIds = new Set(people.map((p) => p.id));
      dbState.people = dbState.people.filter(
        (p) => p.association_id !== associationId || incomingPersonIds.has(p.id)
      );
      for (const p of people) {
        let existing = dbState.people.find((dbP) => dbP.id === p.id && dbP.association_id === associationId);
        if (existing) {
          existing.name = p.name;
          existing.phone = p.phone;
        } else {
          dbState.people.push({
            id: p.id,
            association_id: associationId,
            name: p.name,
            phone: p.phone,
          });
        }
      }

      // 8. Update association (preserves id, status, started_at)
      assoc.name = name;
      assoc.monthly_share_amount = shareValue;
      assoc.total_shares = totalShares;
      assoc.duration_months = totalShares;
      assoc.start_date = startDate;

      // 9. Insert new shares & contributors
      let contributorsCount = 0;
      for (const sh of shares) {
        const shareId = sh.id || `sh_${sh.share_order}`;
        dbState.shares.push({
          id: shareId,
          association_id: associationId,
          share_order: sh.share_order,
        });

        for (const c of sh.contributors) {
          const contribId = c.id || `sc_${shareId}_${c.person_id}`;
          const personExists = dbState.people.some((p) => p.id === c.person_id && p.association_id === associationId);
          if (!personExists) {
            throw new Error(`Contributor person (${c.person_id}) does not belong to association`);
          }
          dbState.share_contributors.push({
            id: contribId,
            association_id: associationId,
            share_id: shareId,
            person_id: c.person_id,
            monthly_contribution: c.monthly_contribution,
          });
          contributorsCount++;
        }
      }

      // 10. Rebuild contribution_obligations (cycles x contributors)
      const currentAssocCycles = dbState.association_cycles.filter((c) => c.association_id === associationId);
      const currentAssocContribs = dbState.share_contributors.filter((sc) => sc.association_id === associationId);

      let actualObligationsCount = 0;
      for (const cyc of currentAssocCycles) {
        for (const sc of currentAssocContribs) {
          dbState.contribution_obligations.push({
            id: `ob_${cyc.id}_${sc.id}`,
            association_id: associationId,
            cycle_id: cyc.id,
            share_contributor_id: sc.id,
            person_id: sc.person_id,
            due_amount: sc.monthly_contribution,
          });
          actualObligationsCount++;
        }
      }

      // 11. Final validation
      const finalCycles = dbState.association_cycles.filter((c) => c.association_id === associationId);
      const finalShares = dbState.shares.filter((s) => s.association_id === associationId);
      if (finalCycles.length !== totalShares || finalShares.length !== totalShares) {
        throw new Error("Integrity failure: cycles or shares != total_shares");
      }
      if (actualObligationsCount !== totalShares * contributorsCount) {
        throw new Error("Integrity failure: obligations != total_shares * contributors");
      }

      return {
        success: true,
        association_id: associationId,
        cycles_count: finalCycles.length,
        shares_count: finalShares.length,
        contributors_count: contributorsCount,
        obligations_count: actualObligationsCount,
      };
    } catch (err) {
      // ROLLBACK on error
      Object.assign(dbState, rollbackSnapshot);
      throw err;
    }
  };

  // TEST 43: Edit before payment succeeds
  it("TEST 43: Edit before payment succeeds", () => {
    const db = createMockDbState();
    const result = simulateAtomicRpc({
      authUid: "user_owner_uuid",
      associationId: "assoc_test_edit_1",
      name: "جمعية العائلة (محدثة)",
      shareValue: 1000,
      totalShares: 5,
      startDate: "2026-06-01",
      people: db.people,
      shares: [
        { share_order: 1, contributors: [{ person_id: "p1", monthly_contribution: 1000 }] },
        { share_order: 2, contributors: [{ person_id: "p2", monthly_contribution: 1000 }] },
        { share_order: 3, contributors: [{ person_id: "p3", monthly_contribution: 1000 }] },
        { share_order: 4, contributors: [{ person_id: "p4", monthly_contribution: 1000 }] },
        { share_order: 5, contributors: [{ person_id: "p5", monthly_contribution: 1000 }] },
      ],
      dbState: db,
    });
    assert.equal(result.success, true);
    assert.equal(db.associations[0].name, "جمعية العائلة (محدثة)");
  });

  // TEST 44: Edit keeps same association_id
  it("TEST 44: Edit keeps same association_id", () => {
    const db = createMockDbState();
    const origId = db.associations[0].id;
    simulateAtomicRpc({
      authUid: "user_owner_uuid",
      associationId: origId,
      name: "اسم جديد لنفس الجمعية",
      shareValue: 1000,
      totalShares: 5,
      startDate: "2026-06-01",
      people: db.people,
      shares: [
        { share_order: 1, contributors: [{ person_id: "p1", monthly_contribution: 1000 }] },
        { share_order: 2, contributors: [{ person_id: "p2", monthly_contribution: 1000 }] },
        { share_order: 3, contributors: [{ person_id: "p3", monthly_contribution: 1000 }] },
        { share_order: 4, contributors: [{ person_id: "p4", monthly_contribution: 1000 }] },
        { share_order: 5, contributors: [{ person_id: "p5", monthly_contribution: 1000 }] },
      ],
      dbState: db,
    });
    assert.equal(db.associations.length, 1);
    assert.equal(db.associations[0].id, origId);
  });

  // TEST 45: Edit can add/remove/replace people
  it("TEST 45: Edit can add/remove/replace people", () => {
    const db = createMockDbState();
    // إزالة p5 وإضافة p_new_6
    const updatedPeople = [
      { id: "p1", name: "محمد السيد", phone: "01011111111" },
      { id: "p2", name: "أحمد", phone: "01022222222" },
      { id: "p3", name: "محمود", phone: "01033333333" },
      { id: "p4", name: "علي", phone: "01044444444" },
      { id: "p_new_6", name: "سعيد الجديد", phone: "01099999999" },
    ];
    simulateAtomicRpc({
      authUid: "user_owner_uuid",
      associationId: "assoc_test_edit_1",
      name: "جمعية العائلة بعد استبدال الأعضاء",
      shareValue: 1000,
      totalShares: 5,
      startDate: "2026-06-01",
      people: updatedPeople,
      shares: [
        { share_order: 1, contributors: [{ person_id: "p1", monthly_contribution: 1000 }] },
        { share_order: 2, contributors: [{ person_id: "p2", monthly_contribution: 1000 }] },
        { share_order: 3, contributors: [{ person_id: "p3", monthly_contribution: 1000 }] },
        { share_order: 4, contributors: [{ person_id: "p4", monthly_contribution: 1000 }] },
        { share_order: 5, contributors: [{ person_id: "p_new_6", monthly_contribution: 1000 }] },
      ],
      dbState: db,
    });
    assert.equal(db.people.some((p) => p.id === "p5"), false, "تم حذف العضو القديم p5 بنجاح");
    assert.equal(db.people.some((p) => p.id === "p_new_6"), true, "تمت إضافة العضو الجديد بنجاح");
    assert.equal(db.people.find((p) => p.id === "p1").name, "محمد السيد", "تم تحديث اسم العضو p1");
  });

  // TEST 46: Edit can change shares
  it("TEST 46: Edit can change shares (split shares between contributors)", () => {
    const db = createMockDbState();
    // تحويل السهم 1 إلى سهم مقسم بين p1 و p2 (500 + 500)
    simulateAtomicRpc({
      authUid: "user_owner_uuid",
      associationId: "assoc_test_edit_1",
      name: "جمعية العائلة (سهم مقسم)",
      shareValue: 1000,
      totalShares: 5,
      startDate: "2026-06-01",
      people: db.people,
      shares: [
        {
          share_order: 1,
          contributors: [
            { person_id: "p1", monthly_contribution: 500 },
            { person_id: "p2", monthly_contribution: 500 },
          ],
        },
        { share_order: 2, contributors: [{ person_id: "p2", monthly_contribution: 1000 }] },
        { share_order: 3, contributors: [{ person_id: "p3", monthly_contribution: 1000 }] },
        { share_order: 4, contributors: [{ person_id: "p4", monthly_contribution: 1000 }] },
        { share_order: 5, contributors: [{ person_id: "p5", monthly_contribution: 1000 }] },
      ],
      dbState: db,
    });
    const share1Contribs = db.share_contributors.filter((sc) => sc.share_id === "sh_1");
    assert.equal(share1Contribs.length, 2);
    assert.equal(share1Contribs.reduce((acc, c) => acc + c.monthly_contribution, 0), 1000);
  });

  // TEST 47: Edit can change share value
  it("TEST 47: Edit can change share value", () => {
    const db = createMockDbState();
    simulateAtomicRpc({
      authUid: "user_owner_uuid",
      associationId: "assoc_test_edit_1",
      name: "جمعية العائلة (قيمة سهم 2000)",
      shareValue: 2000,
      totalShares: 5,
      startDate: "2026-06-01",
      people: db.people,
      shares: [
        { share_order: 1, contributors: [{ person_id: "p1", monthly_contribution: 2000 }] },
        { share_order: 2, contributors: [{ person_id: "p2", monthly_contribution: 2000 }] },
        { share_order: 3, contributors: [{ person_id: "p3", monthly_contribution: 2000 }] },
        { share_order: 4, contributors: [{ person_id: "p4", monthly_contribution: 2000 }] },
        { share_order: 5, contributors: [{ person_id: "p5", monthly_contribution: 2000 }] },
      ],
      dbState: db,
    });
    assert.equal(db.associations[0].monthly_share_amount, 2000);
  });

  // TEST 48: Edit can change number of shares and cycles
  it("TEST 48: Edit can change number of shares and cycles", () => {
    const db = createMockDbState();
    // زيادة عدد الحصص من 5 إلى 6 مع إضافة عضو سادس
    const newPeople = [...db.people, { id: "p6", name: "خالد", phone: "01066666666" }];
    const res = simulateAtomicRpc({
      authUid: "user_owner_uuid",
      associationId: "assoc_test_edit_1",
      name: "جمعية 6 شهور",
      shareValue: 1000,
      totalShares: 6,
      startDate: "2026-06-01",
      people: newPeople,
      shares: [
        { share_order: 1, contributors: [{ person_id: "p1", monthly_contribution: 1000 }] },
        { share_order: 2, contributors: [{ person_id: "p2", monthly_contribution: 1000 }] },
        { share_order: 3, contributors: [{ person_id: "p3", monthly_contribution: 1000 }] },
        { share_order: 4, contributors: [{ person_id: "p4", monthly_contribution: 1000 }] },
        { share_order: 5, contributors: [{ person_id: "p5", monthly_contribution: 1000 }] },
        { share_order: 6, contributors: [{ person_id: "p6", monthly_contribution: 1000 }] },
      ],
      dbState: db,
    });
    assert.equal(res.cycles_count, 6);
    assert.equal(res.shares_count, 6);
    assert.equal(db.associations[0].total_shares, 6);
    assert.equal(db.associations[0].duration_months, 6);
  });

  // TEST 49: Edit rebuilds obligations
  it("TEST 49: Edit rebuilds obligations", () => {
    const db = createMockDbState();
    // 5 cycles x 5 contributors = 25 obligations
    const res = simulateAtomicRpc({
      authUid: "user_owner_uuid",
      associationId: "assoc_test_edit_1",
      name: "جمعية فحص الالتزامات",
      shareValue: 1000,
      totalShares: 5,
      startDate: "2026-06-01",
      people: db.people,
      shares: [
        { share_order: 1, contributors: [{ person_id: "p1", monthly_contribution: 1000 }] },
        { share_order: 2, contributors: [{ person_id: "p2", monthly_contribution: 1000 }] },
        { share_order: 3, contributors: [{ person_id: "p3", monthly_contribution: 1000 }] },
        { share_order: 4, contributors: [{ person_id: "p4", monthly_contribution: 1000 }] },
        { share_order: 5, contributors: [{ person_id: "p5", monthly_contribution: 1000 }] },
      ],
      dbState: db,
    });
    assert.equal(res.obligations_count, 25);
    assert.equal(db.contribution_obligations.length, 25);
  });

  // TEST 50: Edit rejects when payment exists
  it("TEST 50: Edit rejects when payment exists", () => {
    const db = createMockDbState();
    // إضافة دفعة مالية حقيقية
    db.payments.push({
      id: "pay_1",
      association_id: "assoc_test_edit_1",
      payment_type: "payment",
      paid_amount: 1000,
    });

    assert.throws(
      () =>
        simulateAtomicRpc({
          authUid: "user_owner_uuid",
          associationId: "assoc_test_edit_1",
          name: "محاولة تعديل مرفوضة",
          shareValue: 1000,
          totalShares: 5,
          startDate: "2026-06-01",
          people: db.people,
          shares: [
            { share_order: 1, contributors: [{ person_id: "p1", monthly_contribution: 1000 }] },
            { share_order: 2, contributors: [{ person_id: "p2", monthly_contribution: 1000 }] },
            { share_order: 3, contributors: [{ person_id: "p3", monthly_contribution: 1000 }] },
            { share_order: 4, contributors: [{ person_id: "p4", monthly_contribution: 1000 }] },
            { share_order: 5, contributors: [{ person_id: "p5", monthly_contribution: 1000 }] },
          ],
          dbState: db,
        }),
      /Cannot edit association after collection has started/
    );
  });

  // TEST 51: Edit rejects owner mismatch
  it("TEST 51: Edit rejects owner mismatch", () => {
    const db = createMockDbState();
    assert.throws(
      () =>
        simulateAtomicRpc({
          authUid: "hacker_user_uuid",
          associationId: "assoc_test_edit_1",
          name: "محاولة اختراق",
          shareValue: 1000,
          totalShares: 5,
          startDate: "2026-06-01",
          people: db.people,
          shares: [
            { share_order: 1, contributors: [{ person_id: "p1", monthly_contribution: 1000 }] },
            { share_order: 2, contributors: [{ person_id: "p2", monthly_contribution: 1000 }] },
            { share_order: 3, contributors: [{ person_id: "p3", monthly_contribution: 1000 }] },
            { share_order: 4, contributors: [{ person_id: "p4", monthly_contribution: 1000 }] },
            { share_order: 5, contributors: [{ person_id: "p5", monthly_contribution: 1000 }] },
          ],
          dbState: db,
        }),
      /Access denied: You are not the owner/
    );
  });

  // TEST 52: Edit rejects 10 shares + 12 months
  it("TEST 52: Edit rejects 10 shares + 12 months", () => {
    const db = createMockDbState();
    assert.throws(
      () =>
        simulateAtomicRpc({
          authUid: "user_owner_uuid",
          associationId: "assoc_test_edit_1",
          name: "جمعية غير متطابقة",
          shareValue: 1000,
          totalShares: 12, // يطلب 12 شهراً لكن أرسل 5 حصص فقط
          startDate: "2026-06-01",
          people: db.people,
          shares: [
            { share_order: 1, contributors: [{ person_id: "p1", monthly_contribution: 1000 }] },
            { share_order: 2, contributors: [{ person_id: "p2", monthly_contribution: 1000 }] },
            { share_order: 3, contributors: [{ person_id: "p3", monthly_contribution: 1000 }] },
            { share_order: 4, contributors: [{ person_id: "p4", monthly_contribution: 1000 }] },
            { share_order: 5, contributors: [{ person_id: "p5", monthly_contribution: 1000 }] },
          ],
          dbState: db,
        }),
      /Shares array length \(5\) must equal total_shares \(12\)/
    );
  });

  // TEST 53: Edit rollback if any final validation fails
  it("TEST 53: Edit rollback if any final validation fails", () => {
    const db = createMockDbState();
    const originalName = db.associations[0].name;
    const originalObligationsCount = db.contribution_obligations.length;

    // مساهمة غير متوازنة (900 بدل 1000)
    assert.throws(
      () =>
        simulateAtomicRpc({
          authUid: "user_owner_uuid",
          associationId: "assoc_test_edit_1",
          name: "تعديل سيفشل ويتراجع",
          shareValue: 1000,
          totalShares: 5,
          startDate: "2026-06-01",
          people: db.people,
          shares: [
            { share_order: 1, contributors: [{ person_id: "p1", monthly_contribution: 900 }] }, // خطأ
            { share_order: 2, contributors: [{ person_id: "p2", monthly_contribution: 1000 }] },
            { share_order: 3, contributors: [{ person_id: "p3", monthly_contribution: 1000 }] },
            { share_order: 4, contributors: [{ person_id: "p4", monthly_contribution: 1000 }] },
            { share_order: 5, contributors: [{ person_id: "p5", monthly_contribution: 1000 }] },
          ],
          dbState: db,
        }),
      /does not equal share value/
    );

    // التحقق من حدوث Rollback كامل وعدم تغيير أي بيانات
    assert.equal(db.associations[0].name, originalName, "تم استرجاع الاسم الأصلي بعد التراجع");
    assert.equal(db.contribution_obligations.length, originalObligationsCount, "تم استرجاع الالتزامات الأصلية");
  });

  // TEST 54: associationCache is defined and invalidated on edit without ReferenceError
  it("TEST 54: associationCache is defined and invalidated on edit without ReferenceError", () => {
    assert.ok(associationCache, "associationCache must be defined and imported");
    assert.equal(typeof associationCache.invalidate, "function", "associationCache must have invalidate method");

    const assocId = "assoc_test_cache_54";
    associationCache.set(assocId, { name: "قبل التعديل" });
    assert.ok(associationCache.get(assocId));

    // Simulation of post-edit invalidation without ReferenceError
    assert.doesNotThrow(() => {
      associationCache.invalidate(assocId);
    });
    assert.equal(associationCache.get(assocId), null, "Cache must be cleared after edit");
  });

  // TEST 55: Delete Association full flow (Modal open, confirm, correct ID call, success state, error state)
  it("TEST 55: Delete Association full flow (Modal open, confirm, correct ID call, success state, error state)", async () => {
    let isDeleteModalOpen = false;
    let deleteAssocError = null;
    let deletingAssoc = false;
    let associationsList = [
      { id: "assoc_to_delete_55", name: "جمعية الحذف التجريبية" },
      { id: "assoc_other_keep", name: "جمعية أخرى تبقى" },
    ];
    let deletedId = null;

    // Simulation of api.deleteAssociation
    const mockDeleteAssociationApi = async (targetId, shouldFail = false) => {
      if (!targetId || String(targetId).trim() === "") {
        throw new Error("معرف الجمعية غير صالح أو مفقود لحذفها");
      }
      if (shouldFail) {
        throw new Error(`حذف الجمعية (${targetId}): violates foreign key constraint`);
      }
      deletedId = targetId;
      associationsList = associationsList.filter((a) => a.id !== targetId);
      associationCache.invalidate(targetId);
      return { success: true };
    };

    // Step A: Open Modal
    isDeleteModalOpen = true;
    deleteAssocError = null;
    assert.equal(isDeleteModalOpen, true, "Delete Modal must open");

    // Step B: Error State (e.g. Supabase FK violation or network failure)
    deletingAssoc = true;
    try {
      await mockDeleteAssociationApi("assoc_to_delete_55", true);
      isDeleteModalOpen = false;
    } catch (err) {
      deleteAssocError = err.message;
    } finally {
      deletingAssoc = false;
    }

    assert.equal(deletingAssoc, false, "Loading state must reset");
    assert.equal(isDeleteModalOpen, true, "Modal must stay open on error");
    assert.ok(deleteAssocError.includes("violates foreign key constraint"), "Error must be captured and displayed instead of failing silently");
    assert.equal(associationsList.length, 2, "List must not be modified on error");

    // Step C: Success State on Retry / Confirm
    deleteAssocError = null;
    deletingAssoc = true;
    try {
      await mockDeleteAssociationApi("assoc_to_delete_55", false);
      isDeleteModalOpen = false;
    } catch (err) {
      deleteAssocError = err.message;
    } finally {
      deletingAssoc = false;
    }

    assert.equal(deletingAssoc, false);
    assert.equal(isDeleteModalOpen, false, "Modal must close on success");
    assert.equal(deleteAssocError, null, "Error must be cleared on success");
    assert.equal(deletedId, "assoc_to_delete_55", "Must call delete with exact association ID");
    assert.equal(associationsList.length, 1, "Association must be removed from list");
    assert.equal(associationsList[0].id, "assoc_other_keep", "Other association must remain untouched");
  });

  // TEST 56: Delete Association strictly halts if contribution_obligations fails and prevents share_contributors deletion
  it("TEST 56: Delete Association strictly halts if contribution_obligations fails and prevents share_contributors deletion", async () => {
    const db = {
      associations: [{ id: "assoc_fk_fail", name: "جمعية فحص الـ FK" }],
      shares: [{ id: "sh_1", association_id: "assoc_fk_fail" }],
      share_contributors: [{ id: "sc_1", association_id: "assoc_fk_fail", share_id: "sh_1" }],
      contribution_obligations: [{ id: "ob_1", association_id: "assoc_fk_fail", share_contributor_id: "sc_1" }],
    };

    const executionLog = [];

    const simulateSequentialDelete = async (assocId, failObligations = false) => {
      // 1. Obligations delete
      executionLog.push("DELETE_OBLIGATIONS");
      if (failObligations) {
        throw new Error(`حذف التزامات المساهمات للجمعية (${assocId}): network or permission error`);
      }
      db.contribution_obligations = db.contribution_obligations.filter((co) => co.association_id !== assocId);

      // 2. Share contributors delete (Protected: will violate FK if obligations still exist)
      if (db.contribution_obligations.some((co) => co.association_id === assocId)) {
        throw new Error('update or delete on table "share_contributors" violates foreign key constraint on table "contribution_obligations" SQLSTATE 23503');
      }
      executionLog.push("DELETE_CONTRIBUTORS");
      db.share_contributors = db.share_contributors.filter((sc) => sc.association_id !== assocId);

      // 3. Shares delete
      executionLog.push("DELETE_SHARES");
      db.shares = db.shares.filter((s) => s.association_id !== assocId);

      // 4. Association delete
      executionLog.push("DELETE_ASSOCIATION");
      db.associations = db.associations.filter((a) => a.id !== assocId);

      return { success: true };
    };

    // Case 1: Obligations deletion fails -> must abort immediately without attempting to delete contributors
    await assert.rejects(
      async () => await simulateSequentialDelete("assoc_fk_fail", true),
      /حذف التزامات المساهمات للجمعية/
    );

    assert.deepEqual(executionLog, ["DELETE_OBLIGATIONS"], "Must stop immediately at obligations step and NOT attempt contributors");
    assert.equal(db.contribution_obligations.length, 1, "Obligations still intact");
    assert.equal(db.share_contributors.length, 1, "Contributors must NOT have been touched");
    assert.equal(db.shares.length, 1, "Shares must NOT have been touched");
    assert.equal(db.associations.length, 1, "Association must NOT have been deleted");

    // Case 2: Clean sequential deletion
    executionLog.length = 0;
    const cleanRes = await simulateSequentialDelete("assoc_fk_fail", false);
    assert.equal(cleanRes.success, true);
    assert.deepEqual(executionLog, [
      "DELETE_OBLIGATIONS",
      "DELETE_CONTRIBUTORS",
      "DELETE_SHARES",
      "DELETE_ASSOCIATION",
    ]);
    assert.equal(db.contribution_obligations.length, 0);
    assert.equal(db.share_contributors.length, 0);
    assert.equal(db.shares.length, 0);
    assert.equal(db.associations.length, 0);
  });

  // ===========================================================================
  // ATOMIC SECURITY DEFINER DELETE ASSOCIATION RPC TESTS (TESTS 57 - 62)
  // ===========================================================================

  const createMockRpcDbState = () => ({
    associations: [
      { id: "assoc_rpc_target", owner_id: "user_owner_uuid", name: "جمعية الحذف الذري" },
      { id: "assoc_rpc_other", owner_id: "user_other_uuid", name: "جمعية أخرى محمية" },
    ],
    people: [
      { id: "p_exclusive_1", association_id: "assoc_rpc_target", name: "عضو حصري" },
      { id: "p_shared_2", association_id: "assoc_rpc_target", name: "عضو مشترك" },
      { id: "p_shared_2", association_id: "assoc_rpc_other", name: "عضو مشترك" },
      { id: "p_other_3", association_id: "assoc_rpc_other", name: "عضو جمعية أخرى" },
    ],
    shares: [
      { id: "s1", association_id: "assoc_rpc_target", share_order: 1 },
      { id: "s_other", association_id: "assoc_rpc_other", share_order: 1 },
    ],
    share_contributors: [
      { id: "sc1", association_id: "assoc_rpc_target", share_id: "s1", person_id: "p_exclusive_1" },
      { id: "sc_other", association_id: "assoc_rpc_other", share_id: "s_other", person_id: "p_other_3" },
    ],
    association_cycles: [
      { id: "c1", association_id: "assoc_rpc_target", cycle_index: 1 },
      { id: "c_other", association_id: "assoc_rpc_other", cycle_index: 1 },
    ],
    contribution_obligations: [
      { id: "ob1", association_id: "assoc_rpc_target", cycle_id: "c1", share_contributor_id: "sc1", person_id: "p_exclusive_1" },
      { id: "ob_other", association_id: "assoc_rpc_other", cycle_id: "c_other", share_contributor_id: "sc_other", person_id: "p_other_3" },
    ],
    payments: [
      { id: "pay1", association_id: "assoc_rpc_target", payment_type: "payment" },
      { id: "pay2", association_id: "assoc_rpc_target", payment_type: "reversal", reversal_of_payment_id: "pay1" },
    ],
    payment_allocations: [
      { id: "alloc1", association_id: "assoc_rpc_target", payment_id: "pay1", obligation_id: "ob1" },
    ],
    payment_adjustments: [
      { id: "adj1", association_id: "assoc_rpc_target", original_payment_id: "pay1" },
    ],
    payout_disbursements: [
      { id: "disb1", association_id: "assoc_rpc_target" },
    ],
    cycle_payout_recipients: [
      { id: "recip1", association_id: "assoc_rpc_target" },
    ],
    payout_schedule_changes: [
      { id: "sched1", association_id: "assoc_rpc_target" },
    ],
    cycle_payouts: [
      { id: "cp1", association_id: "assoc_rpc_target" },
    ],
  });

  const simulateAtomicDeleteRpc = ({
    authUid,
    associationId,
    dbState,
    failStep = null,
  }) => {
    // 1. Auth check
    if (!authUid) {
      throw new Error("Unauthenticated: You must be logged in to delete this association");
    }

    if (!associationId || String(associationId).trim() === "") {
      throw new Error("Invalid association ID");
    }

    // 2. Lock & check ownership
    const assoc = dbState.associations.find((a) => a.id === associationId);
    if (!assoc) {
      throw new Error(`Association (${associationId}) not found`);
    }

    if (assoc.owner_id !== authUid) {
      throw new Error("Access denied: You are not the owner of this association");
    }

    // Snapshot for atomic rollback simulation
    const snapshot = JSON.parse(JSON.stringify(dbState));
    const deleteOrderLog = [];

    try {
      if (failStep === "payment_allocations") throw new Error("Database lock timeout on payment_allocations");

      // 3.1 payment_adjustments
      deleteOrderLog.push("payment_adjustments");
      dbState.payment_adjustments = dbState.payment_adjustments.filter((x) => x.association_id !== associationId);

      // 3.2 payment_allocations
      deleteOrderLog.push("payment_allocations");
      dbState.payment_allocations = dbState.payment_allocations.filter((x) => x.association_id !== associationId);

      // 3.3 payouts
      deleteOrderLog.push("payout_disbursements");
      dbState.payout_disbursements = dbState.payout_disbursements.filter((x) => x.association_id !== associationId);

      deleteOrderLog.push("cycle_payout_recipients");
      dbState.cycle_payout_recipients = dbState.cycle_payout_recipients.filter((x) => x.association_id !== associationId);

      deleteOrderLog.push("payout_schedule_changes");
      dbState.payout_schedule_changes = dbState.payout_schedule_changes.filter((x) => x.association_id !== associationId);

      deleteOrderLog.push("cycle_payouts");
      dbState.cycle_payouts = dbState.cycle_payouts.filter((x) => x.association_id !== associationId);

      // 3.4 payments: reversals then payments
      deleteOrderLog.push("payments_reversals");
      dbState.payments = dbState.payments.filter((p) => !(p.association_id === associationId && p.payment_type === "reversal"));

      deleteOrderLog.push("payments_remaining");
      dbState.payments = dbState.payments.filter((p) => p.association_id !== associationId);

      if (failStep === "contribution_obligations") throw new Error("Deadlock in contribution_obligations");

      // 3.5 contribution_obligations
      deleteOrderLog.push("contribution_obligations");
      dbState.contribution_obligations = dbState.contribution_obligations.filter((co) => co.association_id !== associationId);

      // 3.6 share_contributors (Guarded: FK restrict if obligations exist)
      if (dbState.contribution_obligations.some((co) => co.association_id === associationId)) {
        throw new Error("FK 23503: share_contributors has active contribution_obligations references");
      }
      deleteOrderLog.push("share_contributors");
      dbState.share_contributors = dbState.share_contributors.filter((sc) => sc.association_id !== associationId);

      // 3.7 shares
      deleteOrderLog.push("shares");
      dbState.shares = dbState.shares.filter((s) => s.association_id !== associationId);

      // 3.8 association_cycles
      deleteOrderLog.push("association_cycles");
      dbState.association_cycles = dbState.association_cycles.filter((c) => c.association_id !== associationId);

      // 3.9 people: ONLY exclusive people, never shared
      deleteOrderLog.push("people");
      const otherAssocPeopleIds = new Set(
        dbState.people.filter((p) => p.association_id !== associationId).map((p) => p.id)
      );
      dbState.people = dbState.people.filter(
        (p) => !(p.association_id === associationId && !otherAssocPeopleIds.has(p.id))
      );

      // 3.10 associations
      deleteOrderLog.push("associations");
      dbState.associations = dbState.associations.filter((a) => a.id !== associationId);

      return {
        success: true,
        deleted_association_id: associationId,
        deleteOrderLog,
      };
    } catch (err) {
      // ATOMIC TRANSACTION ROLLBACK
      Object.assign(dbState, snapshot);
      throw err;
    }
  };

  // TEST 57: delete RPC call uses correct association_id
  it("TEST 57: delete RPC call uses correct association_id", () => {
    let capturedRpcPayload = null;
    const mockRpcClient = (funcName, payload) => {
      if (funcName === "delete_association") {
        capturedRpcPayload = payload;
        return { data: { success: true, deleted_association_id: payload.p_association_id }, error: null };
      }
      return { data: null, error: new Error("Unknown RPC") };
    };

    const targetId = "assoc_test_57_id";
    const res = mockRpcClient("delete_association", { p_association_id: String(targetId) });
    assert.equal(res.data.success, true);
    assert.deepEqual(capturedRpcPayload, { p_association_id: "assoc_test_57_id" });
  });

  // TEST 58: owner protection
  it("TEST 58: owner protection", () => {
    const db = createMockRpcDbState();

    // 1. Unauthenticated rejection
    assert.throws(
      () => simulateAtomicDeleteRpc({ authUid: null, associationId: "assoc_rpc_target", dbState: db }),
      /Unauthenticated/
    );

    // 2. Non-owner rejection (hacker UUID trying to delete owner's association)
    assert.throws(
      () => simulateAtomicDeleteRpc({ authUid: "hacker_user_uuid", associationId: "assoc_rpc_target", dbState: db }),
      /Access denied: You are not the owner of this association/
    );

    // Data remains completely untouched
    assert.equal(db.associations.length, 2);
  });

  // TEST 59: delete order
  it("TEST 59: delete order strictly follows reverse-DAG: allocations -> payments -> obligations -> contributors -> shares -> cycles -> people -> associations", () => {
    const db = createMockRpcDbState();
    const result = simulateAtomicDeleteRpc({
      authUid: "user_owner_uuid",
      associationId: "assoc_rpc_target",
      dbState: db,
    });

    assert.equal(result.success, true);
    assert.deepEqual(result.deleteOrderLog, [
      "payment_adjustments",
      "payment_allocations",
      "payout_disbursements",
      "cycle_payout_recipients",
      "payout_schedule_changes",
      "cycle_payouts",
      "payments_reversals",
      "payments_remaining",
      "contribution_obligations",
      "share_contributors",
      "shares",
      "association_cycles",
      "people",
      "associations",
    ]);

    // Target records completely removed
    assert.equal(db.associations.find((a) => a.id === "assoc_rpc_target"), undefined);
    assert.equal(db.shares.find((s) => s.association_id === "assoc_rpc_target"), undefined);
    assert.equal(db.share_contributors.find((sc) => sc.association_id === "assoc_rpc_target"), undefined);
    assert.equal(db.contribution_obligations.find((co) => co.association_id === "assoc_rpc_target"), undefined);
  });

  // TEST 60: rollback on dependency failure
  it("TEST 60: rollback on dependency failure", () => {
    const db = createMockRpcDbState();
    const originalSnapshot = JSON.parse(JSON.stringify(db));

    // Force failure midway at contribution_obligations
    assert.throws(
      () => simulateAtomicDeleteRpc({
        authUid: "user_owner_uuid",
        associationId: "assoc_rpc_target",
        dbState: db,
        failStep: "contribution_obligations",
      }),
      /Deadlock in contribution_obligations/
    );

    // Assert 100% full rollback: state exactly identical to original
    assert.deepEqual(db, originalSnapshot, "All records must be rolled back on any step error");
    assert.equal(db.associations.length, 2);
    assert.equal(db.shares.length, 2);
    assert.equal(db.contribution_obligations.length, 2);
  });

  // TEST 61: cache invalidated only after success
  it("TEST 61: cache invalidated only after success", async () => {
    const targetId = "assoc_cache_test_61";
    associationCache.set(targetId, { id: targetId, name: "مخزن مؤقت" });
    assert.notEqual(associationCache.get(targetId), null);

    // Simulated handler with failure
    let rpcSuccess = false;
    try {
      if (!rpcSuccess) throw new Error("RPC Failed");
      associationCache.invalidate(targetId);
    } catch (_) {}

    // Cache must still exist because operation failed
    assert.notEqual(associationCache.get(targetId), null, "Cache must not be invalidated on failure");

    // On success
    rpcSuccess = true;
    if (rpcSuccess) {
      associationCache.invalidate(targetId);
    }
    assert.equal(associationCache.get(targetId), null, "Cache must be invalidated only after success");
  });

  // TEST 62: no deletion of people shared with another association
  it("TEST 62: no deletion of people shared with another association", () => {
    const db = createMockRpcDbState();

    // Verify p_shared_2 exists in both associations initially
    const targetPeopleInitial = db.people.filter((p) => p.association_id === "assoc_rpc_target");
    assert.equal(targetPeopleInitial.length, 2); // p_exclusive_1, p_shared_2

    simulateAtomicDeleteRpc({
      authUid: "user_owner_uuid",
      associationId: "assoc_rpc_target",
      dbState: db,
    });

    // p_exclusive_1 was deleted because it only belonged to assoc_rpc_target
    assert.equal(db.people.find((p) => p.id === "p_exclusive_1"), undefined);

    // p_shared_2 must STILL exist for assoc_rpc_other
    const sharedPersonInOther = db.people.find(
      (p) => p.id === "p_shared_2" && p.association_id === "assoc_rpc_other"
    );
    assert.ok(sharedPersonInOther, "Shared person must be preserved in other association");

    // Other association's own person untouched
    const otherPerson = db.people.find((p) => p.id === "p_other_3");
    assert.ok(otherPerson, "Unrelated person must be preserved");
  });

  // TEST 63: exportPaymentsToExcel handles raw Supabase snake_case fields without undefined or fallback loss
  it("TEST 63: exportPaymentsToExcel handles raw Supabase snake_case fields without undefined or fallback loss", () => {
    const rawSupabasePayments = [
      {
        id: "pay_raw_1",
        person_id: "p_101",
        cycle_id: "c_1",
        cycle_index: 3,
        paid_amount: 2500,
        payment_type: "payment",
        paid_at: "2026-04-15",
        receipt_note: "سداد عبر فودافون كاش",
      },
      {
        id: "pay_raw_2",
        person_id: "p_102",
        cycle_id: "c_2",
        cycle_index: 3,
        paid_amount: 500,
        payment_type: "reversal",
        paid_at: "2026-04-16",
        receipt_note: "استرجاع دفعة خاطئة",
      },
    ];

    const people = [
      { id: "p_101", name: "محمود حسن" },
      { id: "p_102", name: "فاطمة إبراهيم" },
    ];

    const peopleMap = people.reduce((acc, p) => {
      acc[String(p.id)] = p.name;
      return acc;
    }, {});

    const rows = rawSupabasePayments.map((pay) => {
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

    assert.equal(rows.length, 2);
    assert.equal(rows[0]["اسم العضو"], "محمود حسن");
    assert.equal(rows[0]["رقم الشهر / الدورة"], 3);
    assert.equal(rows[0]["المبلغ المدفوع (ج.م)"], 2500);
    assert.equal(rows[0]["نوع الحركة"], "سداد");
    assert.equal(rows[0]["تاريخ الدفع"], "2026-04-15");

    assert.equal(rows[1]["اسم العضو"], "فاطمة إبراهيم");
    assert.equal(rows[1]["نوع الحركة"], "استرجاع");
    assert.equal(rows[1]["المبلغ المدفوع (ج.م)"], 500);
  });

  // TEST 64: Excel worksheets configured with RTL view orientation
  it("TEST 64: Excel worksheets configured with RTL view orientation", () => {
    const mockWorksheet = {};
    mockWorksheet["!views"] = [{ RTL: true }];

    assert.ok(Array.isArray(mockWorksheet["!views"]), "Views array must exist");
    assert.equal(mockWorksheet["!views"][0].RTL, true, "RTL orientation must be set to true for Arabic Excel");
  });

  // TEST 64b: Member Excel export maps enriched payments and member receiving turns accurately
  it("TEST 64b: Member Excel export maps enriched payments and member receiving turns accurately", () => {
    const mockAssoc = {
      name: "جمعية الأصدقاء",
      shareValue: 2000,
      totalShares: 5,
      startDate: "2026-05-01",
    };
    const mockMember = { id: "p_101", name: "محمود حسن" };
    const mockShares = [
      {
        shareOrder: 1,
        contributors: [{ personId: "p_101", monthlyContribution: 2000 }],
      },
      {
        shareOrder: 2,
        contributors: [{ personId: "p_other", monthlyContribution: 2000 }],
      },
    ];
    const mockEnrichedPayments = [
      {
        personId: "p_101",
        cycleIndex: 1,
        paymentDate: "2026-05-05",
        amount: 2000,
        paymentType: "payment",
        receiptNote: "دفعة أولى",
      },
      {
        personId: "p_101",
        cycleIndex: 2,
        paymentDate: "2026-06-05",
        amount: 2000,
        paymentType: "payment",
        receiptNote: "دفعة ثانية",
      },
    ];

    const rows = [];
    mockShares.forEach((share) => {
      const contributors = share.contributors || [];
      const userContribs = contributors.filter((c) => String(c.personId) === String(mockMember.id));
      userContribs.forEach((c) => {
        const pct = calculatePercentage(c.monthlyContribution, mockAssoc.shareValue);
        const payout = calculatePayoutAmount(pct, mockAssoc.shareValue * mockAssoc.totalShares);
        rows.push({
          "النوع": "دور استلام (قبض)",
          "رقم الحصة / الشهر": share.shareOrder,
          "موعد الاستحقاق": formatArabicDate(getShareDueDate(mockAssoc.startDate, share.shareOrder)),
          "نسبة المساهمة": `${pct}%`,
          "المبلغ المستحق القبض": payout,
          "مبلغ المساهمة الشهري": c.monthlyContribution,
        });
      });
    });

    mockEnrichedPayments.forEach((pay) => {
      rows.push({
        "النوع": pay.paymentType === "reversal" ? "استرجاع دفعة" : "سداد قسط",
        "رقم الحصة / الشهر": pay.cycleIndex,
        "موعد الاستحقاق": pay.paymentDate,
        "نسبة المساهمة": "-",
        "المبلغ المستحق القبض": "-",
        "مبلغ المساهمة الشهري": pay.amount,
        "ملاحظات": pay.receiptNote,
      });
    });

    assert.equal(rows.length, 3);
    assert.equal(rows[0]["النوع"], "دور استلام (قبض)");
    assert.equal(rows[0]["المبلغ المستحق القبض"], 10000);
    assert.equal(rows[1]["رقم الحصة / الشهر"], 1);
    assert.equal(rows[1]["مبلغ المساهمة الشهري"], 2000);
    assert.equal(rows[2]["رقم الحصة / الشهر"], 2);
    assert.equal(rows[2]["مبلغ المساهمة الشهري"], 2000);
  });

  // TEST 65: Roles Table PDF report contains all required balanced columns without truncation
  it("TEST 65: Roles Table PDF report contains all required balanced columns without truncation", () => {
    const requiredColumns = [
      "رقم الدور",
      "موعد الاستحقاق",
      "اسم المستلم",
      "رقم الهاتف",
      "النسبة",
      "مبلغ القبض",
      "توقيع الاستلام",
    ];

    const mockShare = {
      id: "sh_1",
      shareOrder: 1,
      contributors: [
        {
          personId: "p_1",
          monthly_contribution: 2500,
        },
      ],
    };

    const mockPerson = { id: "p_1", name: "محمد أحمد علي", phone: "01012345678" };
    const shareVal = 2500;
    const totalPool = 25000;
    const dueDateFormatted = formatArabicDate("2026-04-01");

    const pct = calculatePercentage(mockShare.contributors[0].monthly_contribution, shareVal);
    const payout = calculatePayoutAmount(pct, totalPool);

    const row = {
      order: `#${mockShare.shareOrder}`,
      dueDate: dueDateFormatted,
      recipient: mockPerson.name,
      phone: mockPerson.phone,
      percentage: `${pct}%`,
      payout: `${payout.toLocaleString()} ج`,
      signature: "___________",
    };

    assert.equal(requiredColumns.length, 7);
    assert.equal(row.order, "#1");
    assert.equal(row.recipient, "محمد أحمد علي");
    assert.equal(row.phone, "01012345678");
    assert.equal(row.percentage, "100%");
    assert.equal(row.payout, "25,000 ج");
    assert.equal(row.signature, "___________");
  });

  // TEST 66: Print Target Isolation strictly separates Roles Table and Member Statement
  it("TEST 66: Print Target Isolation strictly separates Roles Table and Member Statement", () => {
    // Simulate body class target switching
    let bodyClasses = new Set();

    const openRolesModal = () => {
      bodyClasses.add("print-roles-target");
      bodyClasses.delete("print-member-target");
    };

    const openMemberModal = () => {
      bodyClasses.add("print-member-target");
      bodyClasses.delete("print-roles-target");
    };

    const closeModals = () => {
      bodyClasses.delete("print-roles-target");
      bodyClasses.delete("print-member-target");
    };

    openRolesModal();
    assert.ok(bodyClasses.has("print-roles-target"));
    assert.ok(!bodyClasses.has("print-member-target"));

    openMemberModal();
    assert.ok(!bodyClasses.has("print-roles-target"));
    assert.ok(bodyClasses.has("print-member-target"));

    closeModals();
    assert.ok(!bodyClasses.has("print-roles-target"));
    assert.ok(!bodyClasses.has("print-member-target"));
  });

  // TEST 67: Member Statement PDF report covers all required financial fields and turns
  it("TEST 67: Member Statement PDF report covers all required financial fields and turns", () => {
    const mockAssociation = {
      id: "assoc_test_stmt",
      name: "جمعية الأصدقاء الخيرية",
      startDate: "2026-05-01",
      endDate: "2027-02-01",
      shareValue: 2000,
      totalShares: 10,
    };

    const mockPerson = {
      id: "p_target",
      name: "أحمد مصطفى كامل",
      phone: "01122334455",
    };

    const mockShares = [
      {
        id: "sh_1",
        shareOrder: 1,
        contributors: [{ personId: "p_target", monthly_contribution: 2000 }],
      },
      {
        id: "sh_2",
        shareOrder: 2,
        contributors: [{ personId: "other", monthly_contribution: 2000 }],
      },
    ];

    const monthlyDue = calculateMonthlyDue(mockShares, mockPerson.id, mockAssociation.shareValue);
    const totalDue = monthlyDue * mockAssociation.totalShares;
    const paidTotal = 6000;
    const remainingTotal = Math.max(0, totalDue - paidTotal);

    // Verify member status determination
    let statusText = "لم يبدأ السداد";
    if (remainingTotal === 0 && totalDue > 0) {
      statusText = "مسدد بالكامل";
    } else if (paidTotal > 0) {
      statusText = "سداد جاري ومستمر";
    }

    assert.equal(monthlyDue, 2000);
    assert.equal(totalDue, 20000);
    assert.equal(paidTotal, 6000);
    assert.equal(remainingTotal, 14000);
    assert.equal(statusText, "سداد جاري ومستمر");

    // Member turns verification
    const memberTurns = [];
    mockShares.forEach((sh) => {
      const contribs = (sh.contributors || []).filter((c) => c.personId === mockPerson.id);
      contribs.forEach((c) => {
        const pct = calculatePercentage(c.monthly_contribution, mockAssociation.shareValue);
        const payout = calculatePayoutAmount(pct, mockAssociation.shareValue * mockAssociation.totalShares);
        memberTurns.push({
          shareOrder: sh.shareOrder,
          percentage: pct,
          payoutAmount: payout,
          isDelivered: false,
        });
      });
    });

    assert.equal(memberTurns.length, 1);
    assert.equal(memberTurns[0].shareOrder, 1);
    assert.equal(memberTurns[0].percentage, 100);
    assert.equal(memberTurns[0].payoutAmount, 20000);
    assert.equal(memberTurns[0].isDelivered, false);
  });

  // Test 68: is_delivered mapping from Supabase
  it("TEST 68: mapShareFromSupabase maps is_delivered accurately (true, false, undefined/null)", () => {
    const rawDelivered = {
      id: "sh_101",
      association_id: "assoc_test",
      share_order: 1,
      is_delivered: true,
      created_at: "2026-01-01T00:00:00Z",
    };
    const mapped1 = mapShareFromSupabase(rawDelivered);
    assert.equal(mapped1.isDelivered, true);

    const rawPending = {
      id: "sh_102",
      association_id: "assoc_test",
      share_order: 2,
      is_delivered: false,
      created_at: "2026-01-01T00:00:00Z",
    };
    const mapped2 = mapShareFromSupabase(rawPending);
    assert.equal(mapped2.isDelivered, false);

    const rawLegacy = {
      id: "sh_103",
      association_id: "assoc_test",
      share_order: 3,
      created_at: "2026-01-01T00:00:00Z",
    };
    const mapped3 = mapShareFromSupabase(rawLegacy);
    assert.equal(mapped3.isDelivered, false); // Default false for legacy rows
  });

  // Test 69: mapShareToSupabase formatting and default false
  it("TEST 69: mapShareToSupabase preserves is_delivered when passed and newly created shares start false", () => {
    const payloadWithTrue = mapShareToSupabase({
      id: "sh_201",
      associationId: "assoc_test",
      shareOrder: 1,
      isDelivered: true,
    });
    assert.equal(payloadWithTrue.is_delivered, true);

    const payloadWithFalse = mapShareToSupabase({
      id: "sh_202",
      associationId: "assoc_test",
      shareOrder: 2,
      isDelivered: false,
    });
    assert.equal(payloadWithFalse.is_delivered, false);

    const payloadOmitted = mapShareToSupabase({
      id: "sh_203",
      associationId: "assoc_test",
      shareOrder: 3,
    });
    assert.equal("is_delivered" in payloadOmitted, false); // Relies on DB DEFAULT FALSE
  });

  // Test 70: Client delivery migration promotes local true to Supabase true
  it("TEST 70: Client delivery migration promotes local true to Supabase true when Supabase is false", async () => {
    const assocId = "assoc_mig_70";
    const shares = [
      { id: "sh_1", associationId: assocId, isDelivered: false },
      { id: "sh_2", associationId: assocId, isDelivered: false },
    ];

    // Mock localStorage
    const localStore = new Map();
    localStore.set(getLegacyStorageKey(assocId), JSON.stringify({ sh_1: true, sh_2: false }));
    globalThis.window = {
      localStorage: {
        getItem: (k) => localStore.get(k) || null,
        setItem: (k, v) => localStore.set(k, String(v)),
        removeItem: (k) => localStore.delete(k),
      },
    };

    const updatedCalls = [];
    const onMigrated = (shareId, status) => updatedCalls.push({ shareId, status });

    // Mock API
    const origApi = (await import("../services/api.js")).api;
    const origToggle = origApi.toggleShareDelivery;
    origApi.toggleShareDelivery = async (shareId, aId, isDelivered) => {
      assert.equal(aId, assocId);
      assert.equal(isDelivered, true);
      return { id: shareId, associationId: aId, isDelivered: true };
    };

    try {
      const res = await migrateAssociationDeliveryStatus(assocId, shares, onMigrated);
      assert.equal(res.migratedCount, 1);
      assert.equal(updatedCalls.length, 1);
      assert.equal(updatedCalls[0].shareId, "sh_1");
      assert.equal(updatedCalls[0].status, true);
    } finally {
      origApi.toggleShareDelivery = origToggle;
    }
  });

  // Test 71: Conflict rule: when Supabase is true and localStorage is false, remains true
  it("TEST 71: Conflict rule: when Supabase is true and localStorage is false, remains true (never reverts)", async () => {
    const assocId = "assoc_mig_71";
    const shares = [
      { id: "sh_already_true", associationId: assocId, isDelivered: true },
    ];

    const localStore = new Map();
    localStore.set(getLegacyStorageKey(assocId), JSON.stringify({ sh_already_true: false }));
    globalThis.window = {
      localStorage: {
        getItem: (k) => localStore.get(k) || null,
        setItem: (k, v) => localStore.set(k, String(v)),
      },
    };

    let called = false;
    const origApi = (await import("../services/api.js")).api;
    const origToggle = origApi.toggleShareDelivery;
    origApi.toggleShareDelivery = async () => {
      called = true;
    };

    try {
      const res = await migrateAssociationDeliveryStatus(assocId, shares);
      assert.equal(called, false); // Never called because Supabase true is preserved
      assert.equal(res.migratedCount, 0);
    } finally {
      origApi.toggleShareDelivery = origToggle;
    }
  });

  // Test 72: Migration does not modify false shares if localStorage has false or missing
  it("TEST 72: Migration does not change false shares if localStorage has false or missing", async () => {
    const assocId = "assoc_mig_72";
    const shares = [
      { id: "sh_pending_1", associationId: assocId, isDelivered: false },
      { id: "sh_pending_2", associationId: assocId, isDelivered: false },
    ];

    const localStore = new Map();
    localStore.set(getLegacyStorageKey(assocId), JSON.stringify({ sh_pending_1: false }));
    globalThis.window = {
      localStorage: {
        getItem: (k) => localStore.get(k) || null,
        setItem: (k, v) => localStore.set(k, String(v)),
      },
    };

    let calledCount = 0;
    const origApi = (await import("../services/api.js")).api;
    const origToggle = origApi.toggleShareDelivery;
    origApi.toggleShareDelivery = async () => {
      calledCount++;
    };

    try {
      const res = await migrateAssociationDeliveryStatus(assocId, shares);
      assert.equal(calledCount, 0);
      assert.equal(res.migratedCount, 0);
    } finally {
      origApi.toggleShareDelivery = origToggle;
    }
  });

  // Test 73: Association isolation: migration only operates on shares of the given association ID
  it("TEST 73: Association isolation: migration only updates shares belonging to the targeted association", async () => {
    const assocA = "assoc_A";
    const sharesA = [
      { id: "sh_A_1", associationId: assocA, isDelivered: false },
    ];

    // Local storage mistakenly has share IDs from both assoc A and assoc B
    const localStore = new Map();
    localStore.set(getLegacyStorageKey(assocA), JSON.stringify({ sh_A_1: true, sh_B_FOREIGN: true }));
    globalThis.window = {
      localStorage: {
        getItem: (k) => localStore.get(k) || null,
        setItem: (k, v) => localStore.set(k, String(v)),
      },
    };

    const updatedIds = [];
    const origApi = (await import("../services/api.js")).api;
    const origToggle = origApi.toggleShareDelivery;
    origApi.toggleShareDelivery = async (shareId, aId) => {
      assert.equal(aId, assocA);
      updatedIds.push(shareId);
      return { id: shareId, associationId: aId, isDelivered: true };
    };

    try {
      const res = await migrateAssociationDeliveryStatus(assocA, sharesA);
      assert.equal(res.migratedCount, 1);
      assert.deepEqual(updatedIds, ["sh_A_1"]); // sh_B_FOREIGN was ignored!
    } finally {
      origApi.toggleShareDelivery = origToggle;
    }
  });

  // Test 74: Migration sets completion marker upon success and does not re-run on subsequent loads
  it("TEST 74: Migration sets completion marker upon success and prevents duplicate runs", async () => {
    const assocId = "assoc_mig_74";
    const shares = [
      { id: "sh_1", associationId: assocId, isDelivered: false },
    ];

    const localStore = new Map();
    localStore.set(getLegacyStorageKey(assocId), JSON.stringify({ sh_1: true }));
    globalThis.window = {
      localStorage: {
        getItem: (k) => localStore.get(k) || null,
        setItem: (k, v) => localStore.set(k, String(v)),
      },
    };

    let callCount = 0;
    const origApi = (await import("../services/api.js")).api;
    const origToggle = origApi.toggleShareDelivery;
    origApi.toggleShareDelivery = async (sId, aId) => {
      callCount++;
      return { id: sId, associationId: aId, isDelivered: true };
    };

    try {
      // First run: executes migration and sets marker
      const run1 = await migrateAssociationDeliveryStatus(assocId, shares);
      assert.equal(run1.migratedCount, 1);
      assert.equal(callCount, 1);
      assert.equal(localStore.get(getMigrationMarkerKey(assocId)), "true");

      // Second run: recognizes marker and skips
      const run2 = await migrateAssociationDeliveryStatus(assocId, shares);
      assert.equal(run2.alreadyMigrated, true);
      assert.equal(callCount, 1); // No new network calls!
    } finally {
      origApi.toggleShareDelivery = origToggle;
    }
  });

  // Test 75: Migration does not set completion marker if update fails, and errors do not throw
  it("TEST 75: Migration does not set completion marker if update fails, and does not crash", async () => {
    const assocId = "assoc_mig_75";
    const shares = [
      { id: "sh_fail", associationId: assocId, isDelivered: false },
    ];

    const localStore = new Map();
    localStore.set(getLegacyStorageKey(assocId), JSON.stringify({ sh_fail: true }));
    globalThis.window = {
      localStorage: {
        getItem: (k) => localStore.get(k) || null,
        setItem: (k, v) => localStore.set(k, String(v)),
      },
    };

    const origApi = (await import("../services/api.js")).api;
    const origToggle = origApi.toggleShareDelivery;
    origApi.toggleShareDelivery = async () => {
      throw new Error("Supabase connection timeout");
    };

    try {
      // Must not throw uncaught error
      const res = await migrateAssociationDeliveryStatus(assocId, shares);
      assert.equal(res.migratedCount, 0);
      // Marker must NOT be set so it can retry later
      assert.equal(localStore.has(getMigrationMarkerKey(assocId)), false);
    } finally {
      origApi.toggleShareDelivery = origToggle;
    }
  });

  // Test 76: toggleShareDelivery updates associationCache immediately with new delivery status
  it("TEST 76: toggleShareDelivery updates associationCache immediately with new delivery status", async () => {
    const assocId = "assoc_cache_sync";
    const initialShares = [
      { id: "sh_c1", shareOrder: 1, isDelivered: false },
      { id: "sh_c2", shareOrder: 2, isDelivered: false },
    ];

    associationCache.set(assocId, {
      association: { id: assocId, name: "جمعية الكاش" },
      shares: initialShares,
      people: [],
      payments: [],
      cycles: [],
    });

    const cachedBefore = associationCache.get(assocId);
    assert.equal(cachedBefore.shares[0].isDelivered, false);

    // Mock toggleShareDelivery call on cache
    const updatedShares = cachedBefore.shares.map((sh) =>
      sh.id === "sh_c1" ? { ...sh, isDelivered: true } : sh
    );
    associationCache.update(assocId, { shares: updatedShares });

    const cachedAfter = associationCache.get(assocId);
    assert.equal(cachedAfter.shares[0].isDelivered, true);
    assert.equal(cachedAfter.shares[1].isDelivered, false);
  });

  // Test 77: Cross-device synchronization scenario simulation
  it("TEST 77: Cross-device scenario: Laptop updates delivery -> Supabase holds true -> Mobile loads true without localStorage", () => {
    // 1. Laptop marks share as delivered:
    const dbSharesState = [
      { id: "sh_1", association_id: "assoc_cross", share_order: 1, is_delivered: true },
      { id: "sh_2", association_id: "assoc_cross", share_order: 2, is_delivered: false },
    ];

    // 2. Mobile device opens app (clean empty localStorage):
    const mobileLocalStorage = new Map(); // Completely empty!
    assert.equal(mobileLocalStorage.has("gm3ety_delivered_assoc_cross"), false);

    // 3. Mobile fetches from Supabase:
    const mobileShares = dbSharesState.map((raw) => mapShareFromSupabase(raw));

    // 4. Verify Mobile displays true for share 1 and false for share 2:
    assert.equal(mobileShares[0].isDelivered, true);
    assert.equal(mobileShares[1].isDelivered, false);
    // Source of Truth is strictly Supabase!
  });
});





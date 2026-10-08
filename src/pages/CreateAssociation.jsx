import React, { useState, useEffect } from "react";
import { useNavigate, useLocation, Link, useParams } from "react-router-dom";
import {
  PlusCircle,
  Users,
  Calendar,
  CheckCircle2,
  AlertCircle,
  Trash2,
  ArrowRight,
  ArrowLeft,
  PieChart,
  UserPlus,
  Coins,
  ChevronUp,
  ChevronDown,
  Sparkles,
  Lock,
  UserCheck,
  Phone,
  Edit3,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { api } from "../services/api";
import {
  calculatePercentage,
  calculateContributorPercentages,
  calculatePayoutAmount,
  getShareDueDate,
  getCalculatedEndDate,
} from "../utils/calculations";
import Button from "../components/ui/Button";
import Card from "../components/ui/Card";
import Input from "../components/ui/Input";
import Badge from "../components/ui/Badge";
import Modal from "../components/ui/Modal";
import { associationCache } from "../services/associationCache";

export default function CreateAssociation({ mode: propMode, editAssociationId: propEditId } = {}) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const params = useParams();

  const editAssociationId = propEditId || params?.id;
  const mode = propMode || (editAssociationId ? "edit" : location.state?.mode || "create");
  const isEditMode = mode === "edit" || Boolean(editAssociationId);
  const isRenewMode = mode === "renew" || Boolean(location.state?.templateAssociation && !isEditMode);

  // Wizard Step: 1 = Basic Info, 2 = People, 3 = Shares & Contributors, 4 = Review
  const [step, setStep] = useState(1);

  // Step 1: Basic Info
  const [assocName, setAssocName] = useState("");
  const [shareValue, setShareValue] = useState("1000");
  const [totalShares, setTotalShares] = useState("10");
  const [startDate, setStartDate] = useState(() => {
    const today = new Date();
    return today.toISOString().split("T")[0];
  });

  // Step 2: People List
  const [people, setPeople] = useState([]);
  const [newFullName, setNewFullName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [bulkNames, setBulkNames] = useState("");
  const [isBulkOpen, setIsBulkOpen] = useState(false);

  // Step 3: Shares List
  const [shares, setShares] = useState([]);

  // Form submission & Auth Guard Modal state
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);

  // Edit Mode state
  const [loadingEditData, setLoadingEditData] = useState(isEditMode);
  const [isLocked, setIsLocked] = useState(false);

  // Pre-fill state if navigating from "Renew / Duplicate Association"
  useEffect(() => {
    if (isEditMode) return;
    if (location.state?.templateAssociation) {
      const tmpl = location.state.templateAssociation;
      if (tmpl.name) setAssocName(tmpl.name);
      if (tmpl.shareValue) setShareValue(String(tmpl.shareValue));
      if (tmpl.totalShares) setTotalShares(String(tmpl.totalShares));
      if (tmpl.startDate) setStartDate(tmpl.startDate);

      if (tmpl.people && Array.isArray(tmpl.people)) {
        setPeople(tmpl.people);

        const oldToNewMap = {};
        tmpl.people.forEach((p) => {
          if (p.oldId) oldToNewMap[p.oldId] = p.id;
        });

        if (tmpl.shares && Array.isArray(tmpl.shares)) {
          const sVal = Math.round(Number(tmpl.shareValue) || 1000);
          const mappedShares = tmpl.shares.map((sh, idx) => ({
            id: `temp_sh_${idx + 1}`,
            shareOrder: idx + 1,
            dueDate: getShareDueDate(tmpl.startDate || startDate, idx + 1),
            ownershipType: (sh.contributors || []).length > 1 ? "split" : "full",
            contributors: (sh.contributors || []).map((c) => ({
              personId: oldToNewMap[c.personId] || c.personId,
              contributedAmount: Math.round(Number(c.contributedAmount) || sVal),
            })),
          }));
          setShares(mappedShares);
        }
      }
    }
  }, [location.state, isEditMode]);

  // Load existing association data if in "Edit Association" mode
  useEffect(() => {
    if (!isEditMode || !editAssociationId) return;

    let isMounted = true;
    const fetchExistingAssoc = async () => {
      setLoadingEditData(true);
      setErrorMsg("");
      try {
        const hasStarted = await api.isAssociationCollectionStarted(editAssociationId);
        if (hasStarted) {
          if (isMounted) {
            setIsLocked(true);
            setLoadingEditData(false);
          }
          return;
        }

        const [assocData, peopleData, sharesData] = await Promise.all([
          api.getAssociationById(editAssociationId),
          api.getPeopleByAssociation(editAssociationId),
          api.getSharesByAssociation(editAssociationId),
        ]);

        if (!isMounted) return;

        if (!assocData) {
          setErrorMsg("تعذر العثور على الجمعية المطلوبة للتعديل.");
          setLoadingEditData(false);
          return;
        }

        // Ownership verification
        if (user && assocData.ownerId && String(assocData.ownerId) !== String(user.id)) {
          setErrorMsg("غير مصرح لك بتعديل هذه الجمعية (أنت لست مالك الجمعية).");
          setLoadingEditData(false);
          return;
        }

        setAssocName(assocData.name || "");
        setShareValue(String(assocData.shareValue || 1000));
        setTotalShares(String(assocData.totalShares || 10));
        setStartDate(assocData.startDate || new Date().toISOString().split("T")[0]);

        setPeople(peopleData || []);

        const sVal = Math.round(Number(assocData.shareValue) || 1000);
        const mappedShares = (sharesData || []).map((sh, idx) => ({
          id: sh.id || `temp_sh_${idx + 1}`,
          shareOrder: sh.shareOrder || idx + 1,
          dueDate: getShareDueDate(assocData.startDate, idx + 1),
          ownershipType: (sh.contributors || []).length > 1 ? "split" : "full",
          contributors: (sh.contributors || []).map((c) => ({
            id: c.id,
            personId: c.personId,
            contributedAmount: Math.round(Number(c.contributedAmount || c.monthlyContribution) || sVal),
          })),
        }));
        setShares(mappedShares);
      } catch (err) {
        if (isMounted) {
          console.error("[EDIT ASSOC LOAD ERROR]", err);
          setErrorMsg(`حدث خطأ أثناء تحميل بيانات الجمعية: ${err.message || "خطأ غير معروف"}`);
        }
      } finally {
        if (isMounted) setLoadingEditData(false);
      }
    };

    fetchExistingAssoc();
    return () => {
      isMounted = false;
    };
  }, [isEditMode, editAssociationId, user]);

  // Total Pool Payout per cycle as INTEGER EGP
  const totalPoolPerCycle = Math.round((Number(shareValue) || 0) * (Number(totalShares) || 0));

  // Smart Auto-build shares structure ensuring 100% of ALL people are assigned across available shares
  const buildSharesStructure = (
    currentPeople = people,
    sharesCount = Number(totalShares) || 1,
    sValue = Math.round(Number(shareValue) || 1000)
  ) => {
    const initialShares = [];
    const N = currentPeople.length;
    const M = Math.max(1, sharesCount);

    if (N === 0) {
      for (let i = 1; i <= M; i++) {
        initialShares.push({
          id: `temp_sh_${i}`,
          shareOrder: i,
          dueDate: getShareDueDate(startDate, i),
          ownershipType: "full",
          contributors: [],
        });
      }
      return initialShares;
    }

    if (N <= M) {
      // Each person gets a share, remaining shares cycle through people
      for (let i = 1; i <= M; i++) {
        const defaultPerson = currentPeople[(i - 1) % N];
        initialShares.push({
          id: `temp_sh_${i}`,
          shareOrder: i,
          dueDate: getShareDueDate(startDate, i),
          ownershipType: "full",
          contributors: [
            {
              personId: defaultPerson.id,
              contributedAmount: sValue,
            },
          ],
        });
      }
    } else {
      // N > M: Distribute ALL N people fairly across M shares (some full, some split)
      for (let i = 1; i <= M; i++) {
        const startIdx = Math.floor(((i - 1) * N) / M);
        const endIdx = Math.floor((i * N) / M);
        const group = currentPeople.slice(startIdx, endIdx);

        if (group.length === 1) {
          initialShares.push({
            id: `temp_sh_${i}`,
            shareOrder: i,
            dueDate: getShareDueDate(startDate, i),
            ownershipType: "full",
            contributors: [
              {
                personId: group[0].id,
                contributedAmount: sValue,
              },
            ],
          });
        } else if (group.length > 1) {
          // Split share among group members as INTEGER EGP
          const splitAmount = Math.floor(sValue / group.length);
          const contributors = group.map((p, pIdx) => {
            const amt =
              pIdx === group.length - 1
                ? sValue - splitAmount * (group.length - 1)
                : splitAmount;
            return {
              personId: p.id,
              contributedAmount: amt,
            };
          });

          initialShares.push({
            id: `temp_sh_${i}`,
            shareOrder: i,
            dueDate: getShareDueDate(startDate, i),
            ownershipType: "split",
            contributors: contributors,
          });
        } else {
          // Fallback if group empty
          const fallbackPerson = currentPeople[(i - 1) % N];
          initialShares.push({
            id: `temp_sh_${i}`,
            shareOrder: i,
            dueDate: getShareDueDate(startDate, i),
            ownershipType: "full",
            contributors: [
              {
                personId: fallbackPerson.id,
                contributedAmount: sValue,
              },
            ],
          });
        }
      }
    }

    return initialShares;
  };

  // Add a Single Person (Name + Phone)
  const handleAddSinglePerson = (e) => {
    if (e) e.preventDefault();
    const fullName = newFullName.trim();
    if (!fullName) return;

    const newEntry = {
      id: `p_temp_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      name: fullName,
      phone: newPhone.trim() || "غير مسجل",
    };

    setPeople((prev) => [...prev, newEntry]);
    setNewFullName("");
    setNewPhone("");
  };

  // Helper to parse names and optional phones from bulk text
  const parseBulkText = (text) => {
    if (!text || !text.trim()) return [];
    return text
      .split(/[\r\n]+/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map((line) => {
        // Support line formats: "Name, Phone" or "Name - Phone" or just "Name"
        const parts = line.split(/[,،\-:]+/);
        if (parts.length >= 2) {
          const possiblePhone = parts[parts.length - 1].trim();
          const namePart = parts.slice(0, parts.length - 1).join(" ").trim();
          if (/^01[0-9]{9}$/.test(possiblePhone) || /^[0-9+]{8,}$/.test(possiblePhone)) {
            return { name: namePart, phone: possiblePhone };
          }
        }
        return { name: line.replace(/^[-•*\s]+/, "").trim(), phone: "غير مسجل" };
      });
  };

  // Commit Bulk Names
  const handleCommitBulkNames = () => {
    const parsed = parseBulkText(bulkNames);
    if (parsed.length === 0) return;

    const existingNamesSet = new Set(people.map((p) => p.name.trim()));
    const newEntries = parsed
      .filter((item) => !existingNamesSet.has(item.name.trim()))
      .map((item, idx) => ({
        id: `p_temp_${Date.now()}_${idx}_${Math.random().toString(36).substring(2, 6)}`,
        name: item.name,
        phone: item.phone || "غير مسجل",
      }));

    setPeople((prev) => [...prev, ...newEntries]);
    setBulkNames("");
  };

  // Transition from Step 2 to Step 3: Guarantees NO member is lost
  const handleProceedFromStep2 = () => {
    const additional = [];

    // Capture any pending single input
    if (newFullName.trim()) {
      additional.push({
        id: `p_temp_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        name: newFullName.trim(),
        phone: newPhone.trim() || "غير مسجل",
      });
    }

    // Capture any pending bulk textarea content
    if (bulkNames.trim()) {
      const parsed = parseBulkText(bulkNames);
      const existingNames = new Set([...people, ...additional].map((p) => p.name.trim()));
      parsed.forEach((item, idx) => {
        if (!existingNames.has(item.name.trim())) {
          additional.push({
            id: `p_temp_${Date.now()}_b${idx}_${Math.random().toString(36).substring(2, 6)}`,
            name: item.name,
            phone: item.phone || "غير مسجل",
          });
        }
      });
    }

    let finalPeople = [...people, ...additional];

    // Fallback if still 0 members: create default members
    const reqCount = Number(totalShares) || 10;
    if (finalPeople.length === 0) {
      for (let i = 1; i <= reqCount; i++) {
        finalPeople.push({
          id: `p_temp_${Date.now()}_${i}_${Math.random().toString(36).substring(2, 6)}`,
          name: `عضو ${i}`,
          phone: "غير مسجل",
        });
      }
    }

    setPeople(finalPeople);
    setNewFullName("");
    setNewPhone("");
    setBulkNames("");

    // Build initial shares structure for Step 3
    setShares(buildSharesStructure(finalPeople));
    setStep(3);
  };

  // Remove Person
  const handleRemovePerson = (id) => {
    const updated = people.filter((p) => p.id !== id);
    setPeople(updated);
    setShares(buildSharesStructure(updated));
  };

  // Update Person's Phone
  const handleUpdatePersonPhone = (id, newPhoneNumber) => {
    setPeople((prev) =>
      prev.map((p) => (p.id === id ? { ...p, phone: newPhoneNumber } : p))
    );
  };

  // Set ownership type: "full" | "split"
  const handleSetOwnershipType = (shareIndex, type) => {
    const updated = [...shares];
    const sValue = Math.round(Number(shareValue) || 1000);
    const targetShare = updated[shareIndex];

    targetShare.ownershipType = type;
    if (type === "full") {
      const existingPersonId = targetShare.contributors[0]?.personId || people[0]?.id;
      targetShare.contributors = existingPersonId
        ? [{ personId: existingPersonId, contributedAmount: sValue }]
        : [];
    } else if (type === "split") {
      if (targetShare.contributors.length === 0 && people[0]) {
        targetShare.contributors = [
          { personId: people[0].id, contributedAmount: Math.round(sValue / 2) },
        ];
      }
    }

    setShares(updated);
  };

  // Change single contributor person in a Full Share
  const handleFullPersonChange = (shareIndex, personId) => {
    const updated = [...shares];
    const sValue = Math.round(Number(shareValue) || 1000);
    updated[shareIndex].contributors = [{ personId, contributedAmount: sValue }];
    setShares(updated);
  };

  // Update Contributor amount or personId in a Split Share
  const handleUpdateContributor = (shareIndex, contributorIndex, field, value) => {
    const updated = [...shares];
    const targetContributors = updated[shareIndex].contributors;

    if (field === "personId") {
      targetContributors[contributorIndex].personId = value;
    } else if (field === "contributedAmount") {
      targetContributors[contributorIndex].contributedAmount = Math.round(Number(value) || 0);
    }

    setShares(updated);
  };

  // Add Contributor to a Split Share
  const handleAddContributor = (shareIndex) => {
    const updated = [...shares];
    const targetShare = updated[shareIndex];
    const sValue = Math.round(Number(shareValue) || 1000);

    const currentSum = targetShare.contributors.reduce(
      (acc, c) => acc + (Number(c.contributedAmount) || 0),
      0
    );
    const remainingNeeded = Math.max(0, sValue - currentSum);

    const usedIds = new Set(targetShare.contributors.map((c) => c.personId));
    const availablePerson = people.find((p) => !usedIds.has(p.id)) || people[0];

    if (availablePerson) {
      targetShare.contributors.push({
        personId: availablePerson.id,
        contributedAmount: remainingNeeded > 0 ? remainingNeeded : Math.round(sValue / 2),
      });
      setShares(updated);
    }
  };

  // Remove Contributor from a Split Share
  const handleRemoveContributor = (shareIndex, contributorIndex) => {
    const updated = [...shares];
    updated[shareIndex].contributors.splice(contributorIndex, 1);
    setShares(updated);
  };

  // Move Share Up or Down (Step 4 Reordering)
  const handleMoveShare = (index, direction) => {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= shares.length) return;

    const updated = [...shares];
    const temp = updated[index];
    updated[index] = updated[targetIndex];
    updated[targetIndex] = temp;

    updated.forEach((sh, idx) => {
      sh.shareOrder = idx + 1;
      sh.dueDate = getShareDueDate(startDate, idx + 1);
    });

    setShares(updated);
  };

  // Get list of unassigned people
  const getUnassignedPeople = (currentShares = shares, currentPeople = people) => {
    if (!Array.isArray(currentPeople) || currentPeople.length === 0) return [];

    const assignedPersonIds = new Set();
    (currentShares || []).forEach((sh) => {
      (sh.contributors || []).forEach((c) => {
        if (c.personId && Number(c.contributedAmount) > 0) {
          assignedPersonIds.add(c.personId);
        }
      });
    });

    return currentPeople.filter((p) => !assignedPersonIds.has(p.id));
  };

  // Auto distribute all members into available shares without removing anyone
  const handleAutoDistributeAllPeople = () => {
    setShares(buildSharesStructure(people));
  };

  // Validate that all shares sum to 100% and all members are assigned
  const checkSharesValidation = () => {
    const sValue = Math.round(Number(shareValue) || 0);
    const currentShares = shares.length > 0 ? shares : buildSharesStructure();
    if (currentShares.length === 0) return false;

    for (const sh of currentShares) {
      const sum = sh.contributors.reduce(
        (acc, c) => acc + (Number(c.contributedAmount) || 0),
        0
      );
      if (sum !== sValue) return false;
      if (sh.contributors.length === 0) return false;
    }

    const unassigned = getUnassignedPeople(currentShares, people);
    if (unassigned.length > 0) return false;

    return true;
  };

  // Save handler
  const handleSaveClick = () => {
    let finalShares = shares.length > 0 ? shares : buildSharesStructure();
    let unassigned = getUnassignedPeople(finalShares, people);

    if (unassigned.length > 0) {
      finalShares = buildSharesStructure(people);
      setShares(finalShares);
      unassigned = getUnassignedPeople(finalShares, people);
    }

    if (!checkSharesValidation()) {
      setErrorMsg("يرجى التأكد من أن جميع الحصص مكتملة 100% بدون زوائد أو نواقص.");
      return;
    }

    if (!user) {
      const pendingDraft = {
        assocName,
        shareValue,
        totalShares,
        startDate,
        people,
        shares: finalShares,
      };
      sessionStorage.setItem("gam3ety_pending_assoc", JSON.stringify(pendingDraft));
      setIsAuthModalOpen(true);
      return;
    }

    if (isEditMode && editAssociationId) {
      executeSaveEditAssociation(editAssociationId, finalShares);
    } else {
      executeSaveAssociation(user.id, finalShares);
    }
  };

  // Execute Edit Save to Supabase (same association_id) - 100% ATOMIC via PostgreSQL RPC
  const executeSaveEditAssociation = async (assocId, sharesToSave = shares) => {
    setSubmitting(true);
    setErrorMsg("");

    try {
      // 1. Guard check: cannot edit if collection started
      const hasStarted = await api.isAssociationCollectionStarted(assocId);
      if (hasStarted) {
        throw new Error("لا يمكن تعديل الجمعية بعد بدء التحصيل المالي وحفظ الدفعات.");
      }

      const sVal = Math.round(Number(shareValue));
      const countShares = Number(totalShares);

      // 2. Prepare people payload
      const peoplePayload = people.map((p) => ({
        id: p.id,
        name: p.name.trim(),
        phone: p.phone && p.phone.trim() ? p.phone.trim() : "غير مسجل",
      }));

      // 3. Prepare shares and contributors payload
      const sharesPayload = sharesToSave.map((sh) => ({
        id: sh.id,
        share_order: sh.shareOrder,
        contributors: (sh.contributors || []).map((c) => ({
          id: c.id,
          person_id: c.personId,
          monthly_contribution: Math.round(Number(c.contributedAmount) || 0),
        })),
      }));

      // 4. Execute atomic transaction in PostgreSQL
      await api.editAssociationStructure({
        associationId: assocId,
        name: assocName.trim(),
        shareValue: sVal,
        totalShares: countShares,
        startDate: startDate,
        people: peoplePayload,
        shares: sharesPayload,
      });

      associationCache.invalidate(assocId);
      navigate(`/association/${assocId}`);
    } catch (err) {
      console.error("خطأ أثناء حفظ تعديلات الجمعية:", err);
      setErrorMsg(`حدث خطأ أثناء حفظ تعديلات الجمعية: ${err.message || "حاول مرة أخرى."}`);
    } finally {
      setSubmitting(false);
    }
  };

  // Execute database save to Supabase
  const executeSaveAssociation = async (userId, sharesToSave = shares) => {
    setSubmitting(true);
    setErrorMsg("");

    try {
      // 1. Save Association record
      const newAssoc = {
        userId: userId,
        name: assocName.trim(),
        shareValue: Math.round(Number(shareValue)),
        totalShares: Number(totalShares),
        durationMonths: Number(totalShares),
        startDate: startDate,
        status: "active",
      };
      const createdAssoc = await api.createAssociation(newAssoc);
      const actualAssocId = createdAssoc.id;

      // 2. Save all association cycles (1 .. durationMonths) to enable payments
      await api.createCycles(actualAssocId, startDate, Number(totalShares));

      // 3. Save all people without losing any member
      const personIdMapping = {};
      await Promise.all(
        people.map((p) =>
          api.addPerson({
            associationId: actualAssocId,
            name: p.name.trim(),
            phone: p.phone && p.phone.trim() ? p.phone.trim() : "غير مسجل",
          }).then((savedPerson) => {
            personIdMapping[p.id] = savedPerson.id;
            return savedPerson;
          })
        )
      );

      // 3. Save shares and contributors using mapped person IDs
      await Promise.all(
        sharesToSave.map((sh) => {
          const pcts = calculateContributorPercentages(sh.contributors, Number(shareValue));
          const processedContributors = sh.contributors.map((c, idx) => {
            const pct = pcts[idx];
            const payout = calculatePayoutAmount(pct, totalPoolPerCycle);
            return {
              personId: personIdMapping[c.personId] || c.personId,
              contributedAmount: Math.round(Number(c.contributedAmount)),
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
      navigate(`/association/${actualAssocId}`);
    } catch (err) {
      console.error("خطأ أثناء حفظ الجمعية:", err);
      setErrorMsg(`حدث خطأ أثناء حفظ بيانات الجمعية: ${err.message || "حاول مرة أخرى."}`);
    } finally {
      setSubmitting(false);
    }
  };

  if (isLocked) {
    return (
      <div className="max-w-xl mx-auto py-12 px-4 space-y-4">
        <Card className="p-6 border border-app shadow-md space-y-4 text-center">
          <div className="w-14 h-14 rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center mx-auto">
            <Lock className="w-7 h-7" />
          </div>
          <h2 className="text-xl font-bold text-app-primary">الجمعية مقفلة للتعديل</h2>
          <p className="text-sm text-app-secondary leading-relaxed">
            تم بدء تحصيل الأقساط بالفعل، تم إيقاف التعديل لحماية الالتزامات المالية وحسابات المشتركين.
          </p>
          <div className="pt-2">
            <Link to={`/association/${editAssociationId}`}>
              <Button variant="primary">
                <ArrowRight className="w-4 h-4" />
                <span>العودة لصفحة الجمعية</span>
              </Button>
            </Link>
          </div>
        </Card>
      </div>
    );
  }

  if (loadingEditData) {
    return (
      <div className="py-24 text-center text-app-secondary space-y-3">
        <div className="w-10 h-10 border-4 border-sky-600 border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-sm font-semibold">جاري تحميل بيانات الجمعية للتعديل...</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto py-6 space-y-6">
      {/* HEADER & NAVIGATION BREADCRUMB */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-app pb-4">
        <div>
          <div className="flex items-center gap-2">
            {isEditMode ? (
              <Edit3 className="w-6 h-6 text-sky-600 dark:text-sky-400" />
            ) : (
              <PlusCircle className="w-6 h-6 text-sky-600 dark:text-sky-400" />
            )}
            <h1 className="text-2xl font-black text-app-primary">
              {isEditMode
                ? `تعديل الجمعية: ${assocName || ""}`
                : isRenewMode
                ? "تجديد دورة جديدة للجمعية"
                : "إنشاء جمعية جديدة"}
            </h1>
          </div>
          <p className="text-xs text-app-secondary mt-1">
            {isEditMode
              ? "تعديل بيانات الجمعية وهيكل المشتركين والأدوار قبل بدء مرحلة التحصيل المالي"
              : isRenewMode
              ? "بدء دورة جمعية جديدة بناءً على الجمعية السابقة مع إمكانية تعديل المشتركين والترتيب"
              : "أنشئ جمعيتك ووزع الأدوار والأقساط الشهرية بدقة ووضوح"}
          </p>
        </div>

        {isEditMode && editAssociationId && (
          <Link to={`/association/${editAssociationId}`}>
            <Button variant="ghost" size="sm" className="self-start sm:self-auto">
              <ArrowRight className="w-4 h-4" />
              <span>إلغاء والعودة للجمعية</span>
            </Button>
          </Link>
        )}
      </div>

      {/* STEPS INDICATOR */}
      <div className="bg-card-app p-2.5 sm:p-4 rounded-2xl border border-app shadow-xs">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-xs font-bold">
          <div
            className={`p-2 sm:p-2.5 rounded-xl transition-colors flex items-center justify-center gap-1.5 ${
              step >= 1 ? "bg-sky-700 text-white shadow-xs" : "bg-black/5 dark:bg-white/5 text-app-secondary"
            }`}
          >
            <span className="w-5 h-5 rounded-full bg-black/10 dark:bg-white/20 flex items-center justify-center text-[11px] shrink-0">1</span>
            <span className="truncate">البيانات الأساسية</span>
          </div>
          <div
            className={`p-2 sm:p-2.5 rounded-xl transition-colors flex items-center justify-center gap-1.5 ${
              step >= 2 ? "bg-sky-700 text-white shadow-xs" : "bg-black/5 dark:bg-white/5 text-app-secondary"
            }`}
          >
            <span className="w-5 h-5 rounded-full bg-black/10 dark:bg-white/20 flex items-center justify-center text-[11px] shrink-0">2</span>
            <span className="truncate">إضافة المشتركين</span>
          </div>
          <div
            className={`p-2 sm:p-2.5 rounded-xl transition-colors flex items-center justify-center gap-1.5 ${
              step >= 3 ? "bg-sky-700 text-white shadow-xs" : "bg-black/5 dark:bg-white/5 text-app-secondary"
            }`}
          >
            <span className="w-5 h-5 rounded-full bg-black/10 dark:bg-white/20 flex items-center justify-center text-[11px] shrink-0">3</span>
            <span className="truncate">توزيع الحصص</span>
          </div>
          <div
            className={`p-2 sm:p-2.5 rounded-xl transition-colors flex items-center justify-center gap-1.5 ${
              step >= 4 ? "bg-sky-700 text-white shadow-xs" : "bg-black/5 dark:bg-white/5 text-app-secondary"
            }`}
          >
            <span className="w-5 h-5 rounded-full bg-black/10 dark:bg-white/20 flex items-center justify-center text-[11px] shrink-0">4</span>
            <span className="truncate">المراجعة والاعتماد</span>
          </div>
        </div>
      </div>

      {errorMsg && (
        <div className="flex items-center gap-2 p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-300 text-xs font-semibold border border-rose-200 dark:border-rose-900">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* STEP 1: BASIC INFO */}
      {step === 1 && (
        <Card className="space-y-5 border border-app shadow-md">
          <h2 className="text-lg font-bold text-app-primary border-b border-app pb-3 flex items-center gap-2">
            <Coins className="w-5 h-5 text-sky-600 dark:text-sky-400" />
            <span>1. البيانات الأساسية للجمعية</span>
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="col-span-2">
              <Input
                label="اسم الجمعية"
                placeholder="مثال: جمعية الأصدقاء 2026"
                value={assocName}
                onChange={(e) => setAssocName(e.target.value)}
                required
              />
            </div>

            <Input
              label="قيمة الحصة / القسط الأساسي (بالجنيه EGP)"
              type="number"
              placeholder="1000"
              value={shareValue}
              onChange={(e) => setShareValue(e.target.value)}
              required
            />

            <Input
              label="عدد الحصص / الدورات الشهرية"
              type="number"
              placeholder="مثال: 10 أو 12"
              value={totalShares}
              onChange={(e) => setTotalShares(e.target.value)}
              required
            />

            <Input
              label="تاريخ بداية الجمعية"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              required
            />

            <Input
              label="تاريخ النهاية التلقائي"
              type="date"
              value={getCalculatedEndDate(startDate, totalShares)}
              disabled
              helperText="محسوب تلقائياً حسب عدد الشهور والحصص"
            />
          </div>

          <div className="bg-sky-50 dark:bg-sky-950/40 border border-sky-200 dark:border-sky-800 p-4 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
            <div>
              <span className="text-app-secondary block">إجمالي مبلغ القبض الذي يتم توزيعه كل شهر:</span>
              <strong className="text-sky-700 dark:text-sky-300 text-lg font-extrabold">
                {totalPoolPerCycle.toLocaleString()} جنيه
              </strong>
            </div>
            <div className="text-right">
              <span className="text-app-secondary block">مدة الجمعية:</span>
              <strong className="text-app-primary font-bold">{totalShares} شهور / حصص</strong>
            </div>
          </div>

          <div className="flex justify-end pt-3">
            <Button
              variant="primary"
              disabled={!assocName.trim() || !shareValue || !totalShares}
              onClick={() => setStep(2)}
            >
              <span>التالي: إضافة الأشخاص</span>
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </div>
        </Card>
      )}

      {/* STEP 2: PEOPLE MANAGEMENT */}
      {step === 2 && (
        <Card className="space-y-5 border border-app shadow-md">
          <div className="flex items-center justify-between border-b border-app pb-3">
            <div>
              <h2 className="text-lg font-bold text-app-primary flex items-center gap-2">
                <Users className="w-5 h-5 text-sky-600 dark:text-sky-400" />
                <span>2. قائمة المشتركين والأعضاء</span>
              </h2>
              <p className="text-xs text-app-secondary mt-0.5">
                تذكر: عدد الأشخاص مستقل تماماً عن عدد الحصص (مثال: 16 شخصاً في 10 حصص). ورقم الهاتف حقل أساسي.
              </p>
            </div>
            <Badge variant="info">{people.length} أشخاص</Badge>
          </div>

          <div className="space-y-4 bg-black/5 dark:bg-white/5 p-4 rounded-2xl border border-app">
            {/* SINGLE ADD FORM WITH PHONE NUMBER */}
            <form onSubmit={handleAddSinglePerson} className="space-y-3 bg-card-app p-4 rounded-2xl border border-app shadow-xs">
              <strong className="text-sm font-bold text-app-primary block border-b border-app pb-2">
                إضافة عضو جديد (الاسم ورقم الموبايل)
              </strong>

              <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
                <div className="sm:col-span-6">
                  <Input
                    label="اسم العضو بالكامل"
                    placeholder="مثال: أحمد محمود علي"
                    value={newFullName}
                    onChange={(e) => setNewFullName(e.target.value)}
                  />
                </div>

                <div className="sm:col-span-4">
                  <Input
                    label="رقم الموبايل"
                    placeholder="01xxxxxxxxx"
                    value={newPhone}
                    onChange={(e) => setNewPhone(e.target.value)}
                  />
                </div>

                <div className="sm:col-span-2">
                  <Button
                    type="submit"
                    variant="primary"
                    size="md"
                    disabled={!newFullName.trim()}
                    className="w-full font-bold whitespace-nowrap"
                  >
                    <PlusCircle className="w-4 h-4" />
                    <span>إضافة</span>
                  </Button>
                </div>
              </div>
            </form>

            {/* BULK TEXTAREA */}
            <div className="border border-app rounded-2xl overflow-hidden bg-card-app transition-all">
              <button
                type="button"
                onClick={() => setIsBulkOpen(!isBulkOpen)}
                className="w-full px-4 py-3 bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 text-right flex items-center justify-between text-xs font-bold text-app-primary transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <PlusCircle className="w-4 h-4 text-sky-600 dark:text-sky-400" />
                  <span>طريقة سريعة: لصق قائمة أسماء جماعية (كل اسم في سطر)</span>
                </div>
                {isBulkOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>

              {isBulkOpen && (
                <div className="p-4 space-y-3 border-t border-app bg-app">
                  <span className="text-xs text-app-secondary block">
                    انسخ قائمة الأسماء والصقها هنا. يمكنك كتابة الاسم والموبايل مفصولين بفاصلة (مثال: أحمد محمود, 01012345678).
                  </span>
                  <textarea
                    rows={4}
                    className="w-full px-4 py-3 rounded-xl border border-app bg-card-app text-app-primary text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-sky-500/50 resize-y"
                    placeholder="أحمد محمد, 01012345678&#10;محمود علي&#10;سارة السيد..."
                    value={bulkNames}
                    onChange={(e) => setBulkNames(e.target.value)}
                  />
                  {bulkNames.trim() && (
                    <Button
                      type="button"
                      size="sm"
                      variant="primary"
                      onClick={handleCommitBulkNames}
                      className="font-bold"
                    >
                      <PlusCircle className="w-4 h-4" />
                      <span>تأكيد واستخراج ({parseBulkText(bulkNames).length}) أسماء</span>
                    </Button>
                  )}
                </div>
              )}
            </div>

            {/* CONFIRMED PEOPLE LIST */}
            {people.length > 0 && (
              <div className="space-y-2 pt-3 border-t border-app">
                <strong className="text-xs font-bold text-app-primary block">
                  الأعضاء المسجلون ({people.length} أعضاء):
                </strong>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 max-h-64 overflow-y-auto p-1">
                  {people.map((p) => (
                    <div
                      key={p.id}
                      className="flex items-center justify-between p-2 rounded-xl bg-card-app border border-app text-xs shadow-xs"
                    >
                      <div className="truncate pl-2">
                        <strong className="block font-bold text-app-primary truncate">{p.name}</strong>
                        <span className="text-[11px] text-app-secondary font-mono">{p.phone}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemovePerson(p.id)}
                        className="p-1 rounded-md text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors cursor-pointer"
                        title="حذف العضو"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between pt-3 border-t border-app">
            <Button variant="secondary" onClick={() => setStep(1)}>
              <ArrowRight className="w-4 h-4" />
              <span>السابق</span>
            </Button>

            <Button variant="primary" onClick={handleProceedFromStep2}>
              <span>التالي: تشكيل وتوزيع الحصص</span>
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </div>
        </Card>
      )}

      {/* STEP 3: SHARES & CONTRIBUTORS ASSIGNMENT */}
      {step === 3 && (
        <div className="space-y-5">
          <Card className="space-y-4 border border-app shadow-md">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-app pb-3">
              <div>
                <h2 className="text-lg font-bold text-app-primary flex items-center gap-2">
                  <PieChart className="w-5 h-5 text-sky-600 dark:text-sky-400" />
                  <span>3. تشكيل وتوزيع الحصص والمساهمين</span>
                </h2>
                <p className="text-xs text-app-secondary mt-0.5">
                  حدد ملكية كل حصة (حصة كاملة لشخص واحد أو متقسمة بين عدة مساهمين).
                </p>
              </div>

              <Badge variant={checkSharesValidation() ? "success" : "warning"}>
                {checkSharesValidation() ? "جميع الحصص مكتملة 100%" : "توجد حصص غير مكتملة"}
              </Badge>
            </div>

            <div className="space-y-4">
              {getUnassignedPeople().length > 0 && (
                <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-800 dark:text-amber-300 text-xs font-semibold">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="w-5 h-5 shrink-0 text-amber-600 dark:text-amber-400" />
                    <div>
                      <strong className="block font-bold text-sm">
                        تنبيه: يوجد أعضاء لم يشاركوا في أي حصة بعد ({getUnassignedPeople().map((p) => p.name).join("، ")})
                      </strong>
                      <span>اضغط على الزر لتوزيع جميع الأعضاء تلقائياً دون حذف أي عضو!</span>
                    </div>
                  </div>

                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleAutoDistributeAllPeople}
                    className="whitespace-nowrap border-amber-500 text-amber-800 dark:text-amber-200 hover:bg-amber-500/20"
                  >
                    <span>توزيع جميع الأعضاء تلقائياً</span>
                  </Button>
                </div>
              )}

              {shares.map((share, index) => {
                const sValue = Math.round(Number(shareValue) || 1000);
                const totalContributed = share.contributors.reduce(
                  (sum, c) => sum + (Number(c.contributedAmount) || 0),
                  0
                );
                const isComplete = totalContributed === sValue;
                const isOver = totalContributed > sValue;
                const remaining = sValue - totalContributed;

                return (
                  <div
                    key={share.id}
                    className={`p-4 rounded-2xl border transition-all space-y-3 ${
                      isComplete
                        ? "bg-app border-emerald-500/40"
                        : isOver
                        ? "bg-rose-50/50 dark:bg-rose-950/20 border-rose-500/50"
                        : "bg-amber-50/40 dark:bg-amber-950/20 border-amber-500/40"
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-app/50 pb-2.5">
                      <div className="flex items-center gap-2">
                        <span className="w-7 h-7 rounded-xl bg-sky-700 text-white flex items-center justify-center font-bold text-xs shadow-sm">
                          #{share.shareOrder}
                        </span>
                        <div>
                          <strong className="text-app-primary text-sm font-bold block">
                            الحصة رقم {share.shareOrder} (موعد الاستلام: {share.dueDate})
                          </strong>
                          <span className="text-app-secondary text-xs">
                            قيمة الاستلام الكامل: {totalPoolPerCycle.toLocaleString()} جنيه
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {isComplete ? (
                          <Badge variant="success">مكتملة 100%</Badge>
                        ) : isOver ? (
                          <Badge variant="danger">تجاوزت بـ {totalContributed - sValue}ج</Badge>
                        ) : (
                          <Badge variant="warning">
                            متبقي {remaining}ج ({calculatePercentage(remaining, sValue)}%)
                          </Badge>
                        )}

                        <div className="flex bg-black/10 dark:bg-white/10 p-1 rounded-xl text-xs font-bold">
                          <button
                            type="button"
                            onClick={() => handleSetOwnershipType(index, "full")}
                            className={`px-2.5 py-1 rounded-lg transition-colors cursor-pointer ${
                              share.ownershipType === "full"
                                ? "bg-sky-700 text-white shadow-xs"
                                : "text-app-primary hover:bg-black/5"
                            }`}
                          >
                            حصة كاملة
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSetOwnershipType(index, "split")}
                            className={`px-2.5 py-1 rounded-lg transition-colors cursor-pointer ${
                              share.ownershipType === "split"
                                ? "bg-sky-700 text-white shadow-xs"
                                : "text-app-primary hover:bg-black/5"
                            }`}
                          >
                            متقسمة (أسهم)
                          </button>
                        </div>
                      </div>
                    </div>

                    {share.ownershipType === "full" && (
                      <div className="flex flex-col sm:flex-row items-center gap-3 pt-1">
                        <label className="text-xs font-bold text-app-secondary whitespace-nowrap">
                          صاحب الحصة بالكامل:
                        </label>
                        <select
                          value={share.contributors[0]?.personId || ""}
                          onChange={(e) => handleFullPersonChange(index, e.target.value)}
                          className="w-full sm:w-64 px-3 py-2 rounded-xl border border-app bg-app text-app-primary text-xs font-semibold focus:outline-none"
                        >
                          {people.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name} (يدفع {sValue}ج - يستلم {totalPoolPerCycle.toLocaleString()}ج)
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    {share.ownershipType === "split" && (
                      <div className="space-y-3 pt-1">
                        <div className="text-xs font-bold text-app-secondary flex items-center justify-between">
                          <span>المساهمون في هذه الحصة:</span>
                          <button
                            type="button"
                            onClick={() => handleAddContributor(index)}
                            className="text-sky-600 dark:text-sky-400 hover:underline flex items-center gap-1 cursor-pointer"
                          >
                            <PlusCircle className="w-3.5 h-3.5" />
                            <span>إضافة مساهم جديد</span>
                          </button>
                        </div>

                        {share.contributors.map((c, cIdx) => {
                          const pct = calculatePercentage(c.contributedAmount, sValue);
                          const payout = calculatePayoutAmount(pct, totalPoolPerCycle);

                          return (
                            <div
                              key={cIdx}
                              className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center bg-black/5 dark:bg-white/5 p-2.5 rounded-xl border border-app/50 text-xs"
                            >
                              <div className="sm:col-span-5">
                                <select
                                  value={c.personId}
                                  onChange={(e) =>
                                    handleUpdateContributor(index, cIdx, "personId", e.target.value)
                                  }
                                  className="w-full px-2.5 py-1.5 rounded-lg border border-app bg-app text-app-primary text-xs font-semibold"
                                >
                                  {people.map((p) => (
                                    <option key={p.id} value={p.id}>
                                      {p.name}
                                    </option>
                                  ))}
                                </select>
                              </div>

                              <div className="sm:col-span-3">
                                <input
                                  type="number"
                                  value={c.contributedAmount}
                                  onChange={(e) =>
                                    handleUpdateContributor(index, cIdx, "contributedAmount", e.target.value)
                                  }
                                  className="w-full px-2.5 py-1.5 rounded-lg border border-app bg-app text-app-primary text-xs font-semibold"
                                  placeholder="مبلغ المساهمة"
                                />
                              </div>

                              <div className="sm:col-span-3 text-app-secondary text-right font-medium">
                                <span className="block font-bold text-app-primary">{pct}%</span>
                                <span>يستلم: {payout.toLocaleString()} ج</span>
                              </div>

                              <div className="sm:col-span-1 text-center">
                                <button
                                  type="button"
                                  onClick={() => handleRemoveContributor(index, cIdx)}
                                  className="p-1 rounded-md text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 cursor-pointer"
                                  title="إزالة المساهم"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="flex items-center justify-between pt-4 border-t border-app">
              <Button variant="secondary" onClick={() => setStep(2)}>
                <ArrowRight className="w-4 h-4" />
                <span>السابق</span>
              </Button>

              <Button
                variant="primary"
                disabled={!checkSharesValidation()}
                onClick={() => setStep(4)}
              >
                <span>التالي: مراجعة وترتيب الأدوار</span>
                <ArrowLeft className="w-4 h-4" />
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* STEP 4: REVIEW & REORDER & SAVE */}
      {step === 4 && (
        <Card className="space-y-5 border border-app shadow-md">
          <div className="flex items-center justify-between border-b border-app pb-3">
            <div>
              <h2 className="text-lg font-bold text-app-primary flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                <span>4. مراجعة وترتيب أدوار الاستلام وحفظ الجمعية</span>
              </h2>
              <p className="text-xs text-app-secondary mt-0.5">
                يمكنك التقديم والتأخير بين الأدوار بسهولة عبر الأزرار قبل الاعتماد النهائي.
              </p>
            </div>
            <Badge variant="success">جاهزة للحفظ والتأسيس ({shares.length} حصص)</Badge>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-sky-50 dark:bg-sky-950/40 p-4 rounded-2xl border border-sky-200 dark:border-sky-800 text-xs">
            <div>
              <span className="text-app-secondary block">اسم الجمعية:</span>
              <strong className="text-app-primary font-bold text-sm">{assocName}</strong>
            </div>
            <div>
              <span className="text-app-secondary block">قيمة الحصة:</span>
              <strong className="text-app-primary font-bold text-sm">
                {Math.round(Number(shareValue)).toLocaleString()} ج
              </strong>
            </div>
            <div>
              <span className="text-app-secondary block">عدد الحصص/الأشخاص:</span>
              <strong className="text-app-primary font-bold text-sm">
                {totalShares} حصة / {people.length} أشخاص
              </strong>
            </div>
            <div>
              <span className="text-app-secondary block">إجمالي القبض شهرياً:</span>
              <strong className="text-sky-700 dark:text-sky-300 font-extrabold text-sm">
                {totalPoolPerCycle.toLocaleString()} ج
              </strong>
            </div>
          </div>

          <div className="space-y-2.5">
            <h3 className="text-xs font-bold text-app-secondary uppercase tracking-wider">
              جدول الأدوار النهائي (يمكنك تعديل الترتيب بالأسهم):
            </h3>

            {shares.map((sh, index) => (
              <div
                key={sh.id}
                className="flex items-center justify-between p-3.5 rounded-2xl bg-app border border-app text-xs font-semibold"
              >
                <div className="flex items-center gap-3">
                  <div className="flex flex-col gap-1">
                    <button
                      type="button"
                      disabled={index === 0}
                      onClick={() => handleMoveShare(index, -1)}
                      className="p-1 rounded-md bg-black/5 dark:bg-white/10 hover:bg-black/10 disabled:opacity-30 cursor-pointer"
                      title="تقديم هذا الدور"
                    >
                      <ChevronUp className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      disabled={index === shares.length - 1}
                      onClick={() => handleMoveShare(index, 1)}
                      className="p-1 rounded-md bg-black/5 dark:bg-white/10 hover:bg-black/10 disabled:opacity-30 cursor-pointer"
                      title="تأخير هذا الدور"
                    >
                      <ChevronDown className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <span className="w-8 h-8 rounded-xl bg-sky-700 text-white flex items-center justify-center font-bold text-xs shadow-sm">
                    #{sh.shareOrder}
                  </span>

                  <div>
                    <strong className="text-app-primary font-bold text-sm block">
                      دور شهر: {sh.dueDate}
                    </strong>
                    <div className="text-app-secondary text-xs flex flex-wrap gap-2 mt-0.5">
                      {sh.contributors.map((c, i) => {
                        const pName = people.find((p) => p.id === c.personId)?.name || "عضو";
                        const pct = calculatePercentage(c.contributedAmount, Number(shareValue));
                        const payout = calculatePayoutAmount(pct, totalPoolPerCycle);
                        return (
                          <span key={i} className="bg-black/5 dark:bg-white/5 px-2 py-0.5 rounded-md">
                            {pName} ({pct}% - {payout.toLocaleString()}ج)
                          </span>
                        );
                      })}
                    </div>
                  </div>
                </div>

                <Badge variant="info">الشهر {sh.shareOrder}</Badge>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between pt-4 border-t border-app">
            <Button variant="secondary" onClick={() => setStep(3)}>
              <ArrowRight className="w-4 h-4" />
              <span>السابق</span>
            </Button>

            <Button
              variant="primary"
              size="lg"
              onClick={handleSaveClick}
              disabled={submitting}
            >
              <Sparkles className="w-5 h-5 text-amber-300" />
              <span>
                {submitting
                  ? "جاري الحفظ..."
                  : isEditMode
                  ? "حفظ تعديلات الجمعية"
                  : "حفظ وتأسيس الجمعية رسمياً"}
              </span>
            </Button>
          </div>
        </Card>
      )}

      {/* AUTH GUARD MODAL */}
      <Modal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        title="تنبيه: يلزم تسجيل الدخول لحفظ الجمعية"
      >
        <div className="space-y-4 text-center">
          <div className="w-16 h-16 rounded-full bg-sky-500/10 text-sky-600 dark:text-sky-400 flex items-center justify-center mx-auto">
            <Lock className="w-8 h-8" />
          </div>

          <div>
            <h3 className="text-lg font-bold text-app-primary">
              تجربة رائعة! لتأسيس الجمعية وحفظ بياناتك بخصوصية
            </h3>
            <p className="text-xs text-app-secondary mt-1 leading-relaxed">
              تم حفظ الجمعية التي أنشأتها مؤقتاً! يرجى تسجيل الدخول أو إنشاء حساب جديد لحفظها تلقائياً باسمك فوراً.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
            <Link to="/auth" className="w-full sm:w-auto">
              <Button variant="primary" className="w-full">
                <UserCheck className="w-4 h-4" />
                <span>تسجيل الدخول / حساب جديد لحفظ الجمعية</span>
              </Button>
            </Link>

            <Button variant="secondary" onClick={() => setIsAuthModalOpen(false)}>
              إلغاء
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

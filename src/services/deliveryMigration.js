/**
 * ============================================================================
 * GM3ETY — Safe Client-to-Supabase Delivery Migration Service
 * ============================================================================
 * Handles automatic, idempotent migration of legacy browser localStorage delivery
 * flags (`gm3ety_delivered_<associationId>`) directly into Supabase (`public.shares.is_delivered`).
 *
 * Conflict Rules:
 * - Supabase is the single Source of Truth.
 * - If Supabase = true, localStorage = false => Keep Supabase true (never downgrade).
 * - If Supabase = false, localStorage = true => Promote true to Supabase.
 * - Migration runs once per association per browser, setting a completion marker
 *   `gm3ety_delivery_migration_v1_<associationId>`.
 * - If migration fails or is interrupted, the completion marker is NOT set, allowing retry.
 * - Never throws or disrupts UI loading if migration fails.
 */

import { api } from "./api.js";

const MIGRATION_VERSION = "v1";

export function getMigrationMarkerKey(associationId) {
  return `gm3ety_delivery_migration_${MIGRATION_VERSION}_${associationId}`;
}

export function getLegacyStorageKey(associationId) {
  return `gm3ety_delivered_${associationId}`;
}

/**
 * Migrates local delivery state for a single association into Supabase.
 *
 * @param {string} associationId - Association ID
 * @param {Array} shares - Current shares belonging to this association (from Supabase)
 * @param {Function} [onShareMigrated] - Callback(shareId, newStatus) when a share is updated
 * @returns {Promise<{ migratedCount: number, alreadyMigrated: boolean }>}
 */
export async function migrateAssociationDeliveryStatus(
  associationId,
  shares = [],
  onShareMigrated = null
) {
  if (!associationId || !Array.isArray(shares) || shares.length === 0) {
    return { migratedCount: 0, alreadyMigrated: false };
  }

  // 1. Check if already migrated on this browser
  const markerKey = getMigrationMarkerKey(associationId);
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      const alreadyDone = window.localStorage.getItem(markerKey);
      if (alreadyDone === "true") {
        return { migratedCount: 0, alreadyMigrated: true };
      }
    }
  } catch (storageErr) {
    console.warn("[Delivery Migration] localStorage check error:", storageErr);
  }

  // 2. Read legacy localStorage
  const legacyKey = getLegacyStorageKey(associationId);
  let localData = null;
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      const raw = window.localStorage.getItem(legacyKey);
      if (raw) {
        localData = JSON.parse(raw);
      }
    }
  } catch (parseErr) {
    console.warn(`[Delivery Migration] Could not parse legacy localStorage (${legacyKey}):`, parseErr);
  }

  // If no legacy data exists for this association on this device, mark as migrated
  if (!localData || typeof localData !== "object") {
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        window.localStorage.setItem(markerKey, "true");
      }
    } catch (_) {}
    return { migratedCount: 0, alreadyMigrated: false };
  }

  // 3. Find candidate shares:
  // Must belong to this association, have localData[shareId] === true, and current isDelivered !== true
  const sharesToMigrate = shares.filter((sh) => {
    const isLocalTrue = Boolean(localData[sh.id]);
    const isSupabaseTrue = Boolean(sh.isDelivered || sh.is_delivered);
    // Conflict Rule: Only promote if local is true and Supabase is currently false
    return isLocalTrue && !isSupabaseTrue;
  });

  if (sharesToMigrate.length === 0) {
    // All already aligned or nothing to promote
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        window.localStorage.setItem(markerKey, "true");
      }
    } catch (_) {}
    return { migratedCount: 0, alreadyMigrated: false };
  }

  // 4. Promote each share to Supabase
  let successCount = 0;
  let allSucceeded = true;

  for (const sh of sharesToMigrate) {
    try {
      await api.toggleShareDelivery(sh.id, associationId, true);
      successCount++;
      if (typeof onShareMigrated === "function") {
        onShareMigrated(sh.id, true);
      }
    } catch (apiErr) {
      console.error(`[Delivery Migration] Failed to update share ${sh.id} in Supabase:`, apiErr);
      allSucceeded = false;
      // Do not continue if error is permission/network; stop loop to retry later
      break;
    }
  }

  // 5. If all candidates succeeded, mark migration as complete on this browser
  if (allSucceeded && successCount === sharesToMigrate.length) {
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        window.localStorage.setItem(markerKey, "true");
      }
    } catch (setErr) {
      console.warn("[Delivery Migration] Failed to set completion marker:", setErr);
    }
  }

  return { migratedCount: successCount, alreadyMigrated: false };
}

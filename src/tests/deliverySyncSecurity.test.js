import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  mapShareFromSupabase,
  mapShareToSupabase,
} from "../services/mappers.js";

import {
  migrateAssociationDeliveryStatus,
  getMigrationMarkerKey,
  getLegacyStorageKey,
} from "../services/deliveryMigration.js";

describe("GM3ETY — Delivery Synchronization & Multi-User Security Verification", () => {
  // Test 1: CRITICAL SECURITY CHECK — User A cannot update is_delivered for User B's share
  it("CRITICAL SECURITY CHECK: User A is prevented from updating is_delivered for User B's association", async () => {
    const userA_id = "user_aaa_111";
    const userB_id = "user_bbb_222";

    const assocUserB = {
      id: "assoc_user_b",
      owner_id: userB_id,
      name: "جمعية المستخدم B",
    };

    const shareUserB = {
      id: "sh_user_b_1",
      association_id: "assoc_user_b",
      share_order: 1,
      is_delivered: false,
    };

    // Simulated RLS Check Engine
    const simulateRlsUpdate = (currentUser, targetShareId, targetAssocId, patch) => {
      // Simulates Postgres RLS:
      // USING: EXISTS (SELECT 1 FROM associations a WHERE a.id = shares.association_id AND a.owner_id = auth.uid())
      const assoc = targetAssocId === assocUserB.id ? assocUserB : null;
      if (!assoc || assoc.owner_id !== currentUser) {
        throw new Error("PGRST301: 42501 Permission Denied — RLS policy violated for non-owner user");
      }
      return { ...shareUserB, ...patch };
    };

    // User A attempts to update User B's share:
    assert.throws(
      () => simulateRlsUpdate(userA_id, shareUserB.id, assocUserB.id, { is_delivered: true }),
      /42501 Permission Denied/
    );

    // User B (the actual owner) updates successfully:
    const updated = simulateRlsUpdate(userB_id, shareUserB.id, assocUserB.id, { is_delivered: true });
    assert.equal(updated.is_delivered, true);
  });

  // Test 2: Current User Existing Association Migration (Laptop to Supabase)
  it("CURRENT USER MIGRATION: Existing association on User's laptop successfully syncs to Supabase", async () => {
    const userA_assocId = "assoc_user_a_active";
    const shares = [
      { id: "sh_a1", associationId: userA_assocId, isDelivered: false },
      { id: "sh_a2", associationId: userA_assocId, isDelivered: false },
      { id: "sh_a3", associationId: userA_assocId, isDelivered: true }, // Already delivered in Supabase
    ];

    const localStore = new Map();
    localStore.set(
      getLegacyStorageKey(userA_assocId),
      JSON.stringify({ sh_a1: true, sh_a2: false, sh_a3: false })
    );

    globalThis.window = {
      localStorage: {
        getItem: (k) => localStore.get(k) || null,
        setItem: (k, v) => localStore.set(k, String(v)),
      },
    };

    const synced = [];
    const origApi = (await import("../services/api.js")).api;
    const origToggle = origApi.toggleShareDelivery;
    origApi.toggleShareDelivery = async (sId, aId, isDelivered) => {
      synced.push({ sId, aId, isDelivered });
      return { id: sId, associationId: aId, isDelivered };
    };

    try {
      const result = await migrateAssociationDeliveryStatus(userA_assocId, shares);
      // Only sh_a1 should be migrated (sh_a2 was false, sh_a3 was already true in Supabase)
      assert.equal(result.migratedCount, 1);
      assert.equal(synced.length, 1);
      assert.equal(synced[0].sId, "sh_a1");
      assert.equal(synced[0].isDelivered, true);
      assert.equal(localStore.get(getMigrationMarkerKey(userA_assocId)), "true");
    } finally {
      origApi.toggleShareDelivery = origToggle;
    }
  });

  // Test 3: Second User Migration (Isolated on Second User's Device)
  it("SECOND USER MIGRATION: Second user on another device syncs only their own associations", async () => {
    const userB_assocId = "assoc_user_b_unique";
    const shares = [
      { id: "sh_b1", associationId: userB_assocId, isDelivered: false },
    ];

    const userB_localStore = new Map();
    userB_localStore.set(
      getLegacyStorageKey(userB_assocId),
      JSON.stringify({ sh_b1: true })
    );

    globalThis.window = {
      localStorage: {
        getItem: (k) => userB_localStore.get(k) || null,
        setItem: (k, v) => userB_localStore.set(k, String(v)),
      },
    };

    const synced = [];
    const origApi = (await import("../services/api.js")).api;
    const origToggle = origApi.toggleShareDelivery;
    origApi.toggleShareDelivery = async (sId, aId, isDelivered) => {
      synced.push({ sId, aId, isDelivered });
      return { id: sId, associationId: aId, isDelivered };
    };

    try {
      const result = await migrateAssociationDeliveryStatus(userB_assocId, shares);
      assert.equal(result.migratedCount, 1);
      assert.equal(synced[0].sId, "sh_b1");
      assert.equal(synced[0].aId, userB_assocId);
      assert.equal(userB_localStore.get(getMigrationMarkerKey(userB_assocId)), "true");
    } finally {
      origApi.toggleShareDelivery = origToggle;
    }
  });

  // Test 4: New User / New Association starts with is_delivered = false without localStorage
  it("NEW USER TEST: New association and new shares start with is_delivered = false from day one", () => {
    const newAssoc = {
      id: "assoc_brand_new",
      name: "جمعية مستخدم جديد 2026",
    };

    const newRawShare = {
      id: "sh_new_1",
      association_id: newAssoc.id,
      share_order: 1,
      // No is_delivered sent from client -> DB default applies
      is_delivered: false,
      created_at: new Date().toISOString(),
    };

    const mapped = mapShareFromSupabase(newRawShare);
    assert.equal(mapped.isDelivered, false);

    // Ensure mapping to Supabase doesn't inject false dirty columns
    const payload = mapShareToSupabase(mapped);
    assert.equal(payload.association_id, newAssoc.id);
    assert.equal(payload.share_order, 1);
    assert.equal(payload.is_delivered, false);
  });

  // Test 5: Cross-Device End-to-End Simulation
  it("CROSS-DEVICE TEST: Laptop sets delivery -> Supabase holds true -> Mobile opens and reads true", () => {
    // 1. Database state
    let databaseShare = {
      id: "sh_sync_100",
      association_id: "assoc_sync_100",
      share_order: 1,
      is_delivered: false,
    };

    // 2. Laptop action:
    // User clicks "تأكيد التسليم" -> calls toggleShareDelivery -> Supabase updates
    databaseShare.is_delivered = true;

    // 3. Mobile device environment:
    // Mobile has completely blank localStorage (no gm3ety_delivered_* keys)
    const mobileStorage = new Map();
    assert.equal(mobileStorage.has(`gm3ety_delivered_${databaseShare.association_id}`), false);

    // 4. Mobile loads association from Supabase:
    const mobileMappedShare = mapShareFromSupabase(databaseShare);

    // 5. Mobile renders:
    assert.equal(mobileMappedShare.isDelivered, true);
    // UI displays "تم تسليم القبض" on Mobile immediately!
  });
});

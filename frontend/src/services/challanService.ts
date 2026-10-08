import { db, markRecordAsDeleted, getDeletedRecordIdsSet } from './db';
import type { Challan, Product, ProductUnit } from '../types';
import { saveRecordToFirestore, fetchCollectionFromFirestore } from './firebase';
import { b2bBusinessService } from './b2bBusinessService';
import { stockTransactionService } from './stockTransactionService';

const DEFAULT_VPS_BACKEND = 'https://solar.187.126.120.54.sslip.io';
const BACKEND_URL = import.meta.env.DEV ? '' : (import.meta.env.VITE_BACKEND_URL || DEFAULT_VPS_BACKEND);

let lastChallanRemoteSync = 0;
const CHALLAN_SYNC_INTERVAL = 30 * 1000; // 30 seconds fresh sync throttle
let activeChallanSyncPromise: Promise<void> | null = null;

let lastReconciliationTime = 0;

export const challanService = {

  async getChallansByLeadId(leadId: string): Promise<Challan[]> {
    if (!leadId) return [];
    try {
      const all = await this.getChallans();
      const cleanLeadId = String(leadId).trim();
      return all.filter(c => String(c.leadId || '').trim() === cleanLeadId);
    } catch (err) {
      console.warn('Error fetching challans by leadId:', err);
      const local = await db.challans.where({ leadId }).toArray().catch(() => []);
      return local;
    }
  },
  async getChallans(forceFresh: boolean = false): Promise<Challan[]> {
    const deletedIds = await getDeletedRecordIdsSet(forceFresh);
    const localChallans = await db.challans.orderBy('createdAt').reverse().toArray();
    const validLocal = localChallans.filter(c => !deletedIds.has(c.id) && (!c.leadId || !deletedIds.has(c.leadId)));

    const syncRemote = async () => {
      if (activeChallanSyncPromise) return activeChallanSyncPromise;
      activeChallanSyncPromise = (async () => {
        try {
          lastChallanRemoteSync = Date.now();
          const remoteChallans = await fetchCollectionFromFirestore<Challan>('challans', 25000);
          if (Array.isArray(remoteChallans) && remoteChallans.length > 0) {
            const freshDeleted = await getDeletedRecordIdsSet(true);
            const validRemote = remoteChallans.filter(c => !freshDeleted.has(c.id) && (!c.leadId || !freshDeleted.has(c.leadId)));
            const validRemoteIds = new Set(validRemote.map(c => c.id));

            if (validRemote.length > 0) {
              await db.challans.bulkPut(validRemote);

              // Clean up stale deleted local challans only when a valid remote list is confirmed
              const currentLocal = await db.challans.toArray().catch(() => []);
              for (const lc of currentLocal) {
                if (!validRemoteIds.has(lc.id) || freshDeleted.has(lc.id) || (lc.leadId && freshDeleted.has(lc.leadId))) {
                  const age = Date.now() - new Date(lc.createdAt || 0).getTime();
                  if (age > 2 * 60 * 1000 || freshDeleted.has(lc.id) || (lc.leadId && freshDeleted.has(lc.leadId))) {
                    await db.challans.delete(lc.id).catch(() => {});
                  }
                }
              }
            }
          }
        } catch (err) {
          console.warn("Background challans sync note:", err);
        } finally {
          activeChallanSyncPromise = null;
        }
      })();
      return activeChallanSyncPromise;
    };

    if (validLocal.length === 0 || forceFresh) {
      await syncRemote();
      const freshDeleted = await getDeletedRecordIdsSet();
      const refreshed = await db.challans.orderBy('createdAt').reverse().toArray();
      return refreshed.filter(c => !freshDeleted.has(c.id) && (!c.leadId || !freshDeleted.has(c.leadId)));
    }

    if (Date.now() - lastChallanRemoteSync > CHALLAN_SYNC_INTERVAL) {
      syncRemote().catch(() => {});
    }

    return validLocal;
  },

  /**
   * Reconciles product stock & unit serial numbers against all existing active challans.
   * If any product has serial numbers dispatched in a challan but marked 'available',
   * or if available stock count does not match the active units count, it fixes them automatically!
   */
  async reconcileProductStockWithChallans(force: boolean = false): Promise<number> {
    const now = Date.now();
    if (!force && now - lastReconciliationTime < 30000) {
      return 0; // Throttle: do not run more than once per 30 seconds
    }
    lastReconciliationTime = now;

    const deletedIds = await getDeletedRecordIdsSet();
    const challans = await db.challans.toArray().catch(() => []);
    const activeChallans = challans.filter(c => !deletedIds.has(c.id) && c.status !== 'cancelled' && (!c.leadId || !deletedIds.has(c.leadId)));
    // Map: productId -> Map(cleanSerial -> { challanNumber, dispatchedAt })
    const prodIdDispatchedMap = new Map<string, Map<string, { challanNumber: string; dispatchedAt: string }>>();
    // Map: productId -> Set of active challan numbers that include this product
    const prodIdActiveChallans = new Map<string, Set<string>>();

    for (const ch of activeChallans) {
      for (const item of ch.items || []) {
        const prodId = item.productId && !item.productId.startsWith('custom_') ? item.productId.trim() : null;
        if (!prodId) continue;

        if (ch.challanNumber) {
          if (!prodIdActiveChallans.has(prodId)) {
            prodIdActiveChallans.set(prodId, new Set());
          }
          prodIdActiveChallans.get(prodId)!.add(ch.challanNumber.trim().toUpperCase());
        }

        for (const sn of item.serialNumbers || []) {
          const clean = (sn || '').trim().toLowerCase();
          if (!clean) continue;

          const dispatchInfo = {
            challanNumber: ch.challanNumber,
            dispatchedAt: ch.createdAt
          };

          if (!prodIdDispatchedMap.has(prodId)) {
            prodIdDispatchedMap.set(prodId, new Map());
          }
          prodIdDispatchedMap.get(prodId)!.set(clean, dispatchInfo);
        }
      }
    }

    const products = await db.products.toArray().catch(() => []);
    const updatedProducts: Product[] = [];

    for (const p of products) {
      if (deletedIds.has(p.id)) continue;
      let hasChange = false;

      let units: ProductUnit[] = p.productUnits && Array.isArray(p.productUnits) && p.productUnits.length > 0
        ? p.productUnits.map(u => ({ ...u }))
        : (p.serialNumbers && Array.isArray(p.serialNumbers) && p.serialNumbers.length > 0
            ? p.serialNumbers.map((sn, idx) => ({
                id: `unit_${p.id}_${idx + 1}`,
                unitNumber: idx + 1,
                serialNumber: sn,
                status: 'available' as const,
                addedAt: p.createdAt || '2026-01-01T00:00:00.000Z'
              }))
            : []);

      if (units.length > 0) {
        const thisProdIdMap = prodIdDispatchedMap.get(p.id);
        const activeChallanNumsForProduct = prodIdActiveChallans.get(p.id);

        units = units.map(u => {
          const cleanSn = (u.serialNumber || '').trim().toLowerCase();
          const dispatchInfo = cleanSn ? thisProdIdMap?.get(cleanSn) : null;

          if (dispatchInfo) {
            // Unit is confirmed dispatched in an active delivery challan for THIS specific product
            if (u.status !== 'sold' || !u.notes?.includes(dispatchInfo.challanNumber)) {
              hasChange = true;
              return {
                ...u,
                status: 'sold' as const,
                dispatchedAt: dispatchInfo.dispatchedAt,
                notes: u.notes
                  ? (u.notes.includes(dispatchInfo.challanNumber) ? u.notes : `${u.notes} • Dispatched via ${dispatchInfo.challanNumber}`)
                  : `Dispatched via ${dispatchInfo.challanNumber}`
              };
            }
          } else {
            // Unit is NOT dispatched with this serial number in any active delivery challan for this product!
            if (u.status === 'sold' || u.status === 'dispatched') {
              // Check if it was dispatched via an active challan without specific serials
              let isLegitimatelyDispatched = false;
              if (activeChallanNumsForProduct && activeChallanNumsForProduct.size > 0 && u.notes) {
                for (const chNum of activeChallanNumsForProduct) {
                  if (u.notes.toUpperCase().includes(chNum)) {
                    isLegitimatelyDispatched = true;
                    break;
                  }
                }
              }

              if (!isLegitimatelyDispatched) {
                // Not in any active delivery challan for this product!
                // Self-heal: revert status back to available and clear invalid dispatch notes
                hasChange = true;
                const cleanNotes = (u.notes || '').replace(/Dispatched via\s+[^\s•,;]+/g, '').replace(/•\s*$/, '').trim();
                return {
                  ...u,
                  status: 'available' as const,
                  dispatchedAt: undefined,
                  notes: cleanNotes || undefined
                };
              }
            }
          }
          return u;
        });

        const availCount = units.filter(u => u.status === 'available' || !u.status).length;
        if (p.stockQuantity !== availCount) {
          hasChange = true;
        }

        if (hasChange) {
          updatedProducts.push({
            ...p,
            stockQuantity: availCount,
            productUnits: units,
            serialNumbers: units.filter(u => u.status === 'available' || !u.status).map(u => u.serialNumber)
          });
        }
      }
    }

    if (updatedProducts.length > 0) {
      // Local Dexie save
      await db.transaction('rw', db.products, async () => {
        for (const prod of updatedProducts) {
          await db.products.put(prod);
        }
      });

      // Background Non-blocking sync to MongoDB Atlas
      for (const prod of updatedProducts) {
        saveRecordToFirestore('products', prod.id, prod).catch(() => {});
      }

      console.log(`✅ Auto-reconciled & healed stock for ${updatedProducts.length} product(s) against active delivery challans.`);
    }

    return updatedProducts.length;
  },

  async createChallan(cData: Omit<Challan, 'id' | 'createdAt' | 'challanNumber'>): Promise<string> {
    // 1. Stock Check Validation (Warning for low stock, skip custom items)
    for (const item of cData.items) {
      if (!item.productId || item.productId.startsWith('custom_')) continue;
      const product = await db.products.get(item.productId);
      const available = product ? product.stockQuantity : 0;
      if (product && available < item.qty) {
        console.warn(`Product ${product.name} has recorded stock (${available}) less than dispatch qty (${item.qty})`);
      }
    }

    // 2. Auto-save B2B Business info if B2B Challan
    let b2bBusinessId = cData.b2bBusinessId;
    if (cData.type === 'b2b' && cData.businessName && cData.businessAddress) {
      try {
        const savedBusiness = await b2bBusinessService.saveOrUpdateBusiness({
          id: b2bBusinessId,
          businessName: cData.businessName,
          gstNumber: cData.gstNumber,
          businessAddress: cData.businessAddress,
          contactPerson: cData.contactPerson,
          mobileNumber: cData.mobileNumber,
          email: cData.email
        });
        b2bBusinessId = savedBusiness.id;
      } catch (err) {
        console.warn("B2B Business auto-save note:", err);
      }
    }

    const id = 'ch_' + Math.random().toString(36).substring(2, 11);
    const dateCode = new Date().getFullYear().toString();
    const randNum = Math.floor(1000 + Math.random() * 9000);
    const challanNumber = `CH-${dateCode}-${randNum}`;
    const createdAt = new Date().toISOString();

    const newChallan: Challan = {
      ...cData,
      id,
      b2bBusinessId,
      challanNumber,
      createdAt
    };

    // Calculate product stock & serial unit status updates
    const updatedProducts: Product[] = [];
    for (const item of cData.items) {
      if (!item.productId || item.productId.startsWith('custom_')) continue;
      const product = await db.products.get(item.productId);
      if (!product) continue;

      const dispatchedSerials = (item.serialNumbers || []).map(s => s.trim().toLowerCase());
      const dispatchedSet = new Set(dispatchedSerials);

      // Normalize product units if missing
      let units: ProductUnit[] = product.productUnits && Array.isArray(product.productUnits) && product.productUnits.length > 0
        ? product.productUnits.map(u => ({ ...u }))
        : (product.serialNumbers && Array.isArray(product.serialNumbers) && product.serialNumbers.length > 0
            ? product.serialNumbers.map((sn, idx) => ({
                id: `unit_${idx + 1}_${Date.now()}_${idx}`,
                unitNumber: idx + 1,
                serialNumber: sn,
                status: 'available' as const,
                addedAt: product.createdAt || createdAt
              }))
            : []);

      if (dispatchedSet.size > 0 && units.length > 0) {
        units = units.map(u => {
          const cleanSn = (u.serialNumber || '').trim().toLowerCase();
          if (dispatchedSet.has(cleanSn)) {
            return {
              ...u,
              status: 'sold' as const,
              dispatchedAt: createdAt,
              notes: u.notes || `Dispatched via ${challanNumber}`
            };
          }
          return u;
        });
      } else if (units.length > 0) {
        // If specific serials were not selected, mark first available units as sold
        let remaining = item.qty;
        units = units.map(u => {
          if (remaining > 0 && (u.status === 'available' || !u.status)) {
            remaining--;
            return {
              ...u,
              status: 'sold' as const,
              dispatchedAt: createdAt,
              notes: u.notes || `Dispatched via ${challanNumber}`
            };
          }
          return u;
        });
      }

      const availableCount = units.length > 0
        ? units.filter(u => u.status === 'available' || !u.status).length
        : Math.max(0, (product.stockQuantity || 0) - item.qty);

      updatedProducts.push({
        ...product,
        stockQuantity: availableCount,
        productUnits: units.length > 0 ? units : undefined,
        serialNumbers: units.length > 0
          ? units.filter(u => u.status === 'available' || !u.status).map(u => u.serialNumber)
          : product.serialNumbers
      });
    }

    // 1. Pure Dexie Transaction (NO external asynchronous network awaits inside!)
    try {
      await db.transaction('rw', [db.challans, db.products], async () => {
        await db.challans.put(newChallan);
        for (const prod of updatedProducts) {
          await db.products.put(prod);
        }
      });
    } catch (dbErr) {
      console.warn("Local DB transaction note, attempting individual updates:", dbErr);
      await db.challans.put(newChallan);
      for (const prod of updatedProducts) {
        await db.products.put(prod).catch(() => {});
      }
    }

    // 2. Non-blocking Firestore & REST API Sync in background AFTER transaction committed
    for (const prod of updatedProducts) {
      saveRecordToFirestore('products', prod.id, prod).catch(err =>
        console.warn("Firestore product stock sync note:", err)
      );
      if (BACKEND_URL) {
        fetch(`${BACKEND_URL}/api/products`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(prod)
        }).catch(err => console.warn("Backend API product sync note:", err));
      }
    }

    saveRecordToFirestore('challans', id, newChallan).catch(err =>
      console.warn("Firestore challan save note:", err)
    );
    if (BACKEND_URL) {
      fetch(`${BACKEND_URL}/api/challans`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newChallan)
      }).catch(err => console.warn("Backend API challan sync note:", err));
    }

    // 3. Log Stock Transaction History
    const challanTypeLabel = cData.type === 'b2b' ? 'B2B' : 'Lead';
    for (const item of cData.items) {
      try {
        await stockTransactionService.addTransaction({
          challanId: id,
          challanNumber,
          challanType: challanTypeLabel,
          productId: item.productId || 'custom_item',
          productName: item.productName,
          quantityDeducted: item.qty,
          serialNumbers: item.serialNumbers,
          timestamp: createdAt
        });
      } catch (err) {
        console.warn("Stock transaction log note:", err);
      }
    }

    // 4. Dispatch realtime update so all open pages (Products, Leads, etc.) re-render immediately
    window.dispatchEvent(new CustomEvent('app-realtime-update'));

    return id;
  },

  async getChallanById(id: string): Promise<Challan | undefined> {
    return db.challans.get(id);
  },

  async updateChallan(id: string, updatedChallan: Challan): Promise<void> {
    const oldChallan = await db.challans.get(id);
    if (!oldChallan) {
      throw new Error("Challan not found");
    }

    // Stock check validation for edit
    for (const newItem of updatedChallan.items) {
      const targetProduct = await db.products.get(newItem.productId);
      const oldItem = oldChallan.items.find(item => item.productId === newItem.productId);
      const originalQty = oldItem ? oldItem.qty : 0;
      const availableBuffer = (targetProduct ? targetProduct.stockQuantity : 0) + originalQty;

      if (!targetProduct || availableBuffer < newItem.qty) {
        throw new Error("Insufficient stock available.");
      }
    }

    // Auto-update B2B Business info if edited
    if (updatedChallan.type === 'b2b' && updatedChallan.businessName && updatedChallan.businessAddress) {
      try {
        const savedBusiness = await b2bBusinessService.saveOrUpdateBusiness({
          id: updatedChallan.b2bBusinessId,
          businessName: updatedChallan.businessName,
          gstNumber: updatedChallan.gstNumber,
          businessAddress: updatedChallan.businessAddress,
          contactPerson: updatedChallan.contactPerson,
          mobileNumber: updatedChallan.mobileNumber,
          email: updatedChallan.email
        });
        updatedChallan.b2bBusinessId = savedBusiness.id;
      } catch (err) {
        console.warn("B2B Business update note:", err);
      }
    }

    // Track all products that need updating
    const productsMap = new Map<string, Product>();

    // Step 1: Revert old items
    for (const oldItem of oldChallan.items) {
      if (!oldItem.productId || oldItem.productId.startsWith('custom_')) continue;
      const product = await db.products.get(oldItem.productId);
      if (!product) continue;

      let units = product.productUnits && Array.isArray(product.productUnits)
        ? product.productUnits.map(u => ({ ...u }))
        : [];

      const oldSerialsSet = new Set((oldItem.serialNumbers || []).map(s => s.trim().toLowerCase()));
      if (oldSerialsSet.size > 0 && units.length > 0) {
        units = units.map(u => {
          const cleanSn = (u.serialNumber || '').trim().toLowerCase();
          if (oldSerialsSet.has(cleanSn)) {
            return { ...u, status: 'available' as const, dispatchedAt: undefined };
          }
          return u;
        });
      } else if (units.length > 0) {
        let remainingToRevert = oldItem.qty;
        for (let i = units.length - 1; i >= 0 && remainingToRevert > 0; i--) {
          if (units[i].status === 'sold' || units[i].status === 'dispatched') {
            units[i].status = 'available';
            units[i].dispatchedAt = undefined;
            remainingToRevert--;
          }
        }
      }

      const availCount = units.length > 0
        ? units.filter(u => u.status === 'available' || !u.status).length
        : (product.stockQuantity || 0) + oldItem.qty;

      productsMap.set(product.id, {
        ...product,
        stockQuantity: availCount,
        productUnits: units.length > 0 ? units : undefined,
        serialNumbers: units.length > 0
          ? units.filter(u => u.status === 'available' || !u.status).map(u => u.serialNumber)
          : product.serialNumbers
      });
    }

    // Step 2: Apply new items
    const now = new Date().toISOString();
    for (const newItem of updatedChallan.items) {
      if (!newItem.productId || newItem.productId.startsWith('custom_')) continue;
      const baseProduct = productsMap.get(newItem.productId) || await db.products.get(newItem.productId);
      if (!baseProduct) continue;

      let units = baseProduct.productUnits && Array.isArray(baseProduct.productUnits)
        ? baseProduct.productUnits.map(u => ({ ...u }))
        : [];

      const newSerialsSet = new Set((newItem.serialNumbers || []).map(s => s.trim().toLowerCase()));
      if (newSerialsSet.size > 0 && units.length > 0) {
        units = units.map(u => {
          const cleanSn = (u.serialNumber || '').trim().toLowerCase();
          if (newSerialsSet.has(cleanSn)) {
            return {
              ...u,
              status: 'sold' as const,
              dispatchedAt: now,
              notes: u.notes || `Dispatched via ${updatedChallan.challanNumber}`
            };
          }
          return u;
        });
      } else if (units.length > 0) {
        let remainingToMark = newItem.qty;
        units = units.map(u => {
          if (remainingToMark > 0 && (u.status === 'available' || !u.status)) {
            remainingToMark--;
            return {
              ...u,
              status: 'sold' as const,
              dispatchedAt: now,
              notes: u.notes || `Dispatched via ${updatedChallan.challanNumber}`
            };
          }
          return u;
        });
      }

      const availCount = units.length > 0
        ? units.filter(u => u.status === 'available' || !u.status).length
        : Math.max(0, (baseProduct.stockQuantity || 0) - newItem.qty);

      productsMap.set(baseProduct.id, {
        ...baseProduct,
        stockQuantity: availCount,
        productUnits: units.length > 0 ? units : undefined,
        serialNumbers: units.length > 0
          ? units.filter(u => u.status === 'available' || !u.status).map(u => u.serialNumber)
          : baseProduct.serialNumbers
      });
    }

    const updatedProductsList = Array.from(productsMap.values());

    // 1. Pure Dexie Transaction (NO external async awaits inside)
    try {
      await db.transaction('rw', [db.challans, db.products], async () => {
        await db.challans.put(updatedChallan);
        for (const prod of updatedProductsList) {
          await db.products.put(prod);
        }
      });
    } catch (dbErr) {
      console.warn("Local DB transaction note in updateChallan:", dbErr);
      await db.challans.put(updatedChallan);
      for (const prod of updatedProductsList) {
        await db.products.put(prod).catch(() => {});
      }
    }

    // 2. Background Non-blocking Firestore & REST API Sync
    for (const prod of updatedProductsList) {
      saveRecordToFirestore('products', prod.id, prod).catch(err =>
        console.warn("Firestore product stock sync note:", err)
      );
      if (BACKEND_URL) {
        fetch(`${BACKEND_URL}/api/products`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(prod)
        }).catch(err => console.warn("Backend API product sync note:", err));
      }
    }

    saveRecordToFirestore('challans', id, updatedChallan).catch(err =>
      console.warn("Firestore challan save note:", err)
    );
    if (BACKEND_URL) {
      fetch(`${BACKEND_URL}/api/challans`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedChallan)
      }).catch(err => console.warn("Backend API challan sync note:", err));
    }

    // 3. Log Stock Transactions for updated challan items
    const challanTypeLabel = updatedChallan.type === 'b2b' ? 'B2B' : 'Lead';
    for (const item of updatedChallan.items) {
      await stockTransactionService.addTransaction({
        challanId: updatedChallan.id,
        challanNumber: updatedChallan.challanNumber,
        challanType: challanTypeLabel,
        productId: item.productId,
        productName: item.productName,
        quantityDeducted: item.qty,
        serialNumbers: item.serialNumbers,
        timestamp: now
      }).catch(() => {});
    }

    window.dispatchEvent(new CustomEvent('app-realtime-update'));
  },

  async requestChallanEdit(id: string, updatedChallan: Challan, customReason?: string): Promise<{ success: boolean; requiresApproval: boolean; requestId?: string }> {
    const { useAuthStore } = await import('../store/authStore');
    const currentRole = useAuthStore.getState().currentRole;
    const currentUser = useAuthStore.getState().currentUser;
    const isSuperAdmin = currentRole === 'super_admin' || currentUser?.role === 'super_admin';

    if (isSuperAdmin) {
      await this.updateChallan(id, updatedChallan);
      return { success: true, requiresApproval: false };
    }

    const previousData = await db.challans.get(id);
    if (!previousData) {
      throw new Error(`Delivery Challan #${id} not found.`);
    }

    const { deletionRequestService } = await import('./deletionRequestService');
    const reqId = await deletionRequestService.requestEdit({
      entityType: 'challan',
      entityId: id,
      entityName: `Delivery Challan "${updatedChallan.challanNumber}" (${updatedChallan.type === 'b2b' ? updatedChallan.businessName : updatedChallan.leadName})`,
      previousData,
      updatedData: updatedChallan,
      reason: customReason || `Delivery challan edit requested by ${currentUser?.fullName || 'Inventory/Admin'}`
    });

    return { success: true, requiresApproval: true, requestId: reqId };
  },

  async deleteChallan(id: string, skipApprovalCheck = false, customReason?: string): Promise<{ success: boolean; requiresApproval?: boolean }> {
    if (!id) return { success: false };

    const { useAuthStore } = await import('../store/authStore');
    const currentRole = useAuthStore.getState().currentRole;
    const currentUser = useAuthStore.getState().currentUser;
    const isSuperAdmin = currentRole === 'super_admin' || currentUser?.role === 'super_admin';

    if (!isSuperAdmin && !skipApprovalCheck) {
      const challan = await db.challans.get(id);
      const chName = challan ? `Delivery Challan ${challan.challanNumber} (${challan.type === 'b2b' ? challan.businessName : challan.leadName})` : `Challan #${id}`;
      const itemSnapshot = {
        ...challan,
        itemsCount: Array.isArray(challan?.items) ? challan.items.length : 0,
        totalDispatchedUnits: Array.isArray(challan?.items) ? challan.items.reduce((sum, it) => sum + (it.qty || 0), 0) : 0,
      };

      const { deletionRequestService } = await import('./deletionRequestService');
      await deletionRequestService.requestDeletion({
        entityType: 'challan',
        entityId: id,
        entityName: chName,
        metadata: { leadId: challan?.leadId },
        reason: customReason || `Delete delivery challan requested by ${currentUser?.fullName || 'Inventory/Admin'}`,
        itemSnapshot
      });
      return { success: true, requiresApproval: true };
    }

    // Always mark as deleted FIRST so background sync never resurrects it!
    await markRecordAsDeleted(id, 'challans');

    const challan = await db.challans.get(id);
    const restoredProducts: Product[] = [];

    if (challan) {
      for (const item of challan.items) {
        if (!item.productId || item.productId.startsWith('custom_')) continue;
        const product = await db.products.get(item.productId);
        if (!product) continue;

        let units = product.productUnits && Array.isArray(product.productUnits)
          ? product.productUnits.map(u => ({ ...u }))
          : [];

        const dispatchedSerialsSet = new Set((item.serialNumbers || []).map(s => s.trim().toLowerCase()));
        if (dispatchedSerialsSet.size > 0 && units.length > 0) {
          units = units.map(u => {
            const cleanSn = (u.serialNumber || '').trim().toLowerCase();
            if (dispatchedSerialsSet.has(cleanSn)) {
              return { ...u, status: 'available' as const, dispatchedAt: undefined };
            }
            return u;
          });
        } else if (units.length > 0) {
          let remainingToRevert = item.qty;
          for (let i = units.length - 1; i >= 0 && remainingToRevert > 0; i--) {
            if (units[i].status === 'sold' || units[i].status === 'dispatched') {
              units[i].status = 'available';
              units[i].dispatchedAt = undefined;
              remainingToRevert--;
            }
          }
        }

        const availCount = units.length > 0
          ? units.filter(u => u.status === 'available' || !u.status).length
          : (product.stockQuantity || 0) + item.qty;

        restoredProducts.push({
          ...product,
          stockQuantity: availCount,
          productUnits: units.length > 0 ? units : undefined,
          serialNumbers: units.length > 0
            ? units.filter(u => u.status === 'available' || !u.status).map(u => u.serialNumber)
            : product.serialNumbers
        });
      }

      // 1. Pure Dexie transaction
      try {
        await db.transaction('rw', [db.challans, db.products], async () => {
          for (const prod of restoredProducts) {
            await db.products.put(prod);
          }
          await db.challans.delete(id);
        });
      } catch (dbErr) {
        console.warn("Local DB transaction note in deleteChallan:", dbErr);
        for (const prod of restoredProducts) {
          await db.products.put(prod).catch(() => {});
        }
        await db.challans.delete(id);
      }

      // 2. Background Non-blocking sync AFTER transaction
      for (const prod of restoredProducts) {
        saveRecordToFirestore('products', prod.id, prod).catch(err =>
          console.warn("Firestore product stock sync note:", err)
        );
        if (BACKEND_URL) {
          fetch(`${BACKEND_URL}/api/products`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(prod)
          }).catch(err => console.warn("Backend API product sync note:", err));
        }
      }
    } else {
      await db.challans.delete(id);
    }

    try {
      const { deleteRecordFromFirestore } = await import('./firebase');
      await deleteRecordFromFirestore('challans', id);
    } catch (e) {
      console.warn("Firestore delete challan note:", e);
    }
    if (BACKEND_URL) {
      fetch(`${BACKEND_URL}/api/challans/${id}`, { method: 'DELETE' }).catch(() => {});
    }

    window.dispatchEvent(new CustomEvent('app-realtime-update'));
    return { success: true };
  }
};

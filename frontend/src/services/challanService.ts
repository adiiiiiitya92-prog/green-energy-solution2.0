import { db, markRecordAsDeleted, getDeletedRecordIdsSet } from './db';
import type { Challan, Product } from '../types';
import { saveRecordToFirestore, fetchCollectionFromFirestore } from './firebase';
import { b2bBusinessService } from './b2bBusinessService';
import { stockTransactionService } from './stockTransactionService';

export const challanService = {
  async getChallans(): Promise<Challan[]> {
    const deletedIds = await getDeletedRecordIdsSet();
    const localChallans = await db.challans.orderBy('createdAt').reverse().toArray();
    const validLocal = localChallans.filter(c => !deletedIds.has(c.id) && (!c.leadId || !deletedIds.has(c.leadId)));

    const syncRemote = async () => {
      try {
        const remoteChallans = await fetchCollectionFromFirestore<Challan>('challans');
        if (remoteChallans && remoteChallans.length > 0) {
          const freshDeleted = await getDeletedRecordIdsSet();
          const validRemote = remoteChallans.filter(c => !freshDeleted.has(c.id) && (!c.leadId || !freshDeleted.has(c.leadId)));
          if (validRemote.length > 0) {
            await db.challans.bulkPut(validRemote);
          }
        }
      } catch (err) {
        console.warn("Background challans sync note:", err);
      }
    };

    if (validLocal.length > 0) {
      syncRemote();
      return validLocal;
    }

    await syncRemote();
    const freshDeleted = await getDeletedRecordIdsSet();
    const refreshed = await db.challans.orderBy('createdAt').reverse().toArray();
    return refreshed.filter(c => !freshDeleted.has(c.id) && (!c.leadId || !freshDeleted.has(c.leadId)));
  },

  async createChallan(cData: Omit<Challan, 'id' | 'createdAt' | 'challanNumber'>): Promise<string> {
    // 1. Stock Check Validation
    for (const item of cData.items) {
      const product = await db.products.get(item.productId);
      const available = product ? product.stockQuantity : 0;
      if (!product || available < item.qty) {
        throw new Error("Insufficient stock available.");
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

    await db.transaction('rw', [db.challans, db.products], async () => {
      await db.challans.add(newChallan);

      for (const item of cData.items) {
        const product = await db.products.get(item.productId);
        if (product) {
          const updatedStock = Math.max(0, product.stockQuantity - item.qty);
          let updatedUnits = product.productUnits;

          if (item.serialNumbers && item.serialNumbers.length > 0 && product.productUnits) {
            updatedUnits = product.productUnits.map(u => {
              if (item.serialNumbers?.includes(u.serialNumber)) {
                return { ...u, status: 'sold' as const };
              }
              return u;
            });
          }

          const updateObj: Partial<Product> = { stockQuantity: updatedStock };
          if (updatedUnits) updateObj.productUnits = updatedUnits;

          await db.products.update(item.productId, updateObj);
          saveRecordToFirestore('products', item.productId, { ...product, ...updateObj });
        }
      }
    });

    // 3. Log Stock Transaction History
    const challanTypeLabel = cData.type === 'b2b' ? 'B2B' : 'Lead';
    for (const item of cData.items) {
      await stockTransactionService.addTransaction({
        challanId: id,
        challanNumber,
        challanType: challanTypeLabel,
        productId: item.productId,
        productName: item.productName,
        quantityDeducted: item.qty,
        timestamp: createdAt
      });
    }

    saveRecordToFirestore('challans', id, newChallan);
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

    await db.transaction('rw', [db.challans, db.products], async () => {
      // Step 1: Revert old items stock & serial statuses
      for (const oldItem of oldChallan.items) {
        const product = await db.products.get(oldItem.productId);
        if (product) {
          const revertedStock = product.stockQuantity + oldItem.qty;
          let revertedUnits = product.productUnits;
          if (oldItem.serialNumbers && oldItem.serialNumbers.length > 0 && product.productUnits) {
            revertedUnits = product.productUnits.map(u => {
              if (oldItem.serialNumbers?.includes(u.serialNumber)) {
                return { ...u, status: 'available' as const };
              }
              return u;
            });
          }
          const updateObj: Partial<Product> = { stockQuantity: revertedStock };
          if (revertedUnits) updateObj.productUnits = revertedUnits;
          await db.products.update(oldItem.productId, updateObj);
          saveRecordToFirestore('products', oldItem.productId, { ...product, ...updateObj });
        }
      }

      // Step 2: Apply new items stock & serial statuses
      for (const newItem of updatedChallan.items) {
        const product = await db.products.get(newItem.productId);
        if (product) {
          const finalStock = Math.max(0, product.stockQuantity - newItem.qty);
          let finalUnits = product.productUnits;
          if (newItem.serialNumbers && newItem.serialNumbers.length > 0 && product.productUnits) {
            finalUnits = product.productUnits.map(u => {
              if (newItem.serialNumbers?.includes(u.serialNumber)) {
                return { ...u, status: 'sold' as const };
              }
              return u;
            });
          }
          const updateObj: Partial<Product> = { stockQuantity: finalStock };
          if (finalUnits) updateObj.productUnits = finalUnits;
          await db.products.update(newItem.productId, updateObj);
          saveRecordToFirestore('products', newItem.productId, { ...product, ...updateObj });
        }
      }

      await db.challans.put(updatedChallan);
    });

    // Log Stock Transactions for updated challan items
    const challanTypeLabel = updatedChallan.type === 'b2b' ? 'B2B' : 'Lead';
    const now = new Date().toISOString();
    for (const item of updatedChallan.items) {
      await stockTransactionService.addTransaction({
        challanId: updatedChallan.id,
        challanNumber: updatedChallan.challanNumber,
        challanType: challanTypeLabel,
        productId: item.productId,
        productName: item.productName,
        quantityDeducted: item.qty,
        timestamp: now
      });
    }

    saveRecordToFirestore('challans', id, updatedChallan);
  },

  async deleteChallan(id: string, skipApprovalCheck = false): Promise<{ success: boolean; requiresApproval?: boolean }> {
    if (!id) return { success: false };

    const { useAuthStore } = await import('../store/authStore');
    const currentRole = useAuthStore.getState().currentRole;
    const currentUser = useAuthStore.getState().currentUser;
    const isSuperAdmin = currentRole === 'super_admin' || currentUser?.role === 'super_admin';

    if (!isSuperAdmin && !skipApprovalCheck) {
      const challan = await db.challans.get(id);
      const chName = challan ? `Delivery Challan ${challan.challanNumber}` : `Challan #${id}`;
      const { deletionRequestService } = await import('./deletionRequestService');
      await deletionRequestService.requestDeletion({
        entityType: 'challan',
        entityId: id,
        entityName: chName,
        metadata: { leadId: challan?.leadId },
        reason: `Delete delivery challan requested by ${currentUser?.fullName || 'Admin/Employee'}`
      });
      return { success: true, requiresApproval: true };
    }

    // Always mark as deleted FIRST so background sync never resurrects it!
    await markRecordAsDeleted(id, 'challans');

    const challan = await db.challans.get(id);
    if (challan) {
      await db.transaction('rw', [db.challans, db.products], async () => {
        for (const item of challan.items) {
          const product = await db.products.get(item.productId);
          if (product) {
            const restoredStock = product.stockQuantity + item.qty;
            let restoredUnits = product.productUnits;
            if (item.serialNumbers && item.serialNumbers.length > 0 && product.productUnits) {
              restoredUnits = product.productUnits.map(u => {
                if (item.serialNumbers?.includes(u.serialNumber)) {
                  return { ...u, status: 'available' as const };
                }
                return u;
              });
            }
            const updateObj: Partial<Product> = { stockQuantity: restoredStock };
            if (restoredUnits) updateObj.productUnits = restoredUnits;
            await db.products.update(item.productId, updateObj);
            saveRecordToFirestore('products', item.productId, { ...product, ...updateObj });
          }
        }
        await db.challans.delete(id);
      });
    } else {
      await db.challans.delete(id);
    }

    try {
      const { deleteRecordFromFirestore } = await import('./firebase');
      await deleteRecordFromFirestore('challans', id);
    } catch (e) {
      console.warn("Firestore delete challan note:", e);
    }

    window.dispatchEvent(new CustomEvent('app-realtime-update'));
    return { success: true };
  }
};

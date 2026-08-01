import { db, markRecordAsDeleted, getDeletedRecordIdsSet } from './db';
import type { Challan } from '../types';
import { saveRecordToFirestore, fetchCollectionFromFirestore } from './firebase';

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
    const id = 'ch_' + Math.random().toString(36).substring(2, 11);
    const dateCode = new Date().getFullYear().toString();
    const randNum = Math.floor(1000 + Math.random() * 9000);
    const challanNumber = `CH-${dateCode}-${randNum}`;

    const newChallan: Challan = {
      ...cData,
      id,
      challanNumber,
      createdAt: new Date().toISOString()
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

    saveRecordToFirestore('challans', id, updatedChallan);
  },

  async deleteChallan(id: string): Promise<void> {
    const challan = await db.challans.get(id);
    if (!challan) return;

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

    await markRecordAsDeleted(id, 'challans');

    try {
      const { deleteRecordFromFirestore } = await import('./firebase');
      await deleteRecordFromFirestore('challans', id);
    } catch (e) {
      console.warn("Firestore delete challan note:", e);
    }
  }
};

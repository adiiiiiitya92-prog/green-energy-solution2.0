import { db } from './db';
import type { Challan } from '../types';
import { saveRecordToFirestore, fetchCollectionFromFirestore } from './firebase';

export const challanService = {
  async getChallans(): Promise<Challan[]> {
    try {
      const remoteChallans = await fetchCollectionFromFirestore<Challan>('challans');
      if (remoteChallans && remoteChallans.length > 0) {
        await db.challans.bulkPut(remoteChallans);
      }
    } catch (err) {
      console.warn("Firestore challans sync note:", err);
    }
    return db.challans.orderBy('createdAt').reverse().toArray();
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
          await db.products.update(item.productId, {
            stockQuantity: updatedStock
          });
          saveRecordToFirestore('products', item.productId, { ...product, stockQuantity: updatedStock });
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
      for (const oldItem of oldChallan.items) {
        const product = await db.products.get(oldItem.productId);
        if (product) {
          const revertedStock = product.stockQuantity + oldItem.qty;
          await db.products.update(oldItem.productId, {
            stockQuantity: revertedStock
          });
        }
      }

      for (const newItem of updatedChallan.items) {
        const product = await db.products.get(newItem.productId);
        if (product) {
          const finalStock = Math.max(0, product.stockQuantity - newItem.qty);
          await db.products.update(newItem.productId, {
            stockQuantity: finalStock
          });
          saveRecordToFirestore('products', newItem.productId, { ...product, stockQuantity: finalStock });
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
          await db.products.update(item.productId, { stockQuantity: restoredStock });
          saveRecordToFirestore('products', item.productId, { ...product, stockQuantity: restoredStock });
        }
      }
      await db.challans.delete(id);
    });

    try {
      const { deleteRecordFromFirestore } = await import('./firebase');
      await deleteRecordFromFirestore('challans', id);
    } catch (e) {
      console.warn("Firestore delete challan note:", e);
    }
  }
};

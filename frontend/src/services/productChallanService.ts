import { db, markRecordAsDeleted, getDeletedRecordIdsSet } from './db';
import type { ProductChallan } from '../types';
import { saveRecordToFirestore, deleteRecordFromFirestore, fetchCollectionFromFirestore } from './firebase';
import { getNextNumber, seedLocalCounter } from './counterService';

let lastRemoteSync = 0;
const SYNC_INTERVAL = 15 * 60 * 1000;

export interface ProductChallanFilters {
  customerName?: string; // prefix/substring
  challanNo?: string;
  createdBy?: string;
  productId?: string;
  dateFrom?: string; // YYYY-MM-DD
  dateTo?: string; // YYYY-MM-DD
}

async function syncRemote() {
  try {
    lastRemoteSync = Date.now();
    const remote = await fetchCollectionFromFirestore<ProductChallan>('productChallans');
    if (Array.isArray(remote) && remote.length > 0) {
      const deleted = await getDeletedRecordIdsSet();
      const valid = remote.filter(c => !deleted.has(c.id));
      if (valid.length > 0) await db.productChallans.bulkPut(valid);
    }
  } catch (err) {
    console.warn('Product challan sync note:', err);
  }
}

function matchesFilters(c: ProductChallan, f?: ProductChallanFilters): boolean {
  if (!f) return true;
  if (f.customerName) {
    const q = f.customerName.trim().toLowerCase();
    if (!(c.customerSnapshot?.name || '').toLowerCase().includes(q)) return false;
  }
  if (f.challanNo) {
    if (!(c.challanNo || '').toLowerCase().includes(f.challanNo.trim().toLowerCase())) return false;
  }
  if (f.createdBy && c.createdBy !== f.createdBy) return false;
  if (f.productId && !(c.items || []).some(i => i.productId === f.productId)) return false;
  if (f.dateFrom && (c.date || '') < f.dateFrom) return false;
  if (f.dateTo && (c.date || '') > f.dateTo) return false;
  return true;
}

export const productChallanService = {
  /**
   * Paginated, newest-first list with query-level (indexed) ordering + filters.
   * Reads only from the locally-synced Dexie mirror (0 network reads per keystroke);
   * cloud mirror is refreshed in the background on an interval.
   */
  async getProductChallans(opts?: { page?: number; pageSize?: number; filters?: ProductChallanFilters }): Promise<{ items: ProductChallan[]; total: number }> {
    const page = Math.max(1, opts?.page || 1);
    const pageSize = opts?.pageSize || 20;

    const deleted = await getDeletedRecordIdsSet();
    let all = await db.productChallans.orderBy('createdAt').reverse().toArray();
    all = all.filter(c => !deleted.has(c.id) && matchesFilters(c, opts?.filters));

    if (all.length === 0 && Date.now() - lastRemoteSync > SYNC_INTERVAL) {
      await syncRemote();
      const fresh = await getDeletedRecordIdsSet();
      all = (await db.productChallans.orderBy('createdAt').reverse().toArray())
        .filter(c => !fresh.has(c.id) && matchesFilters(c, opts?.filters));
    } else if (Date.now() - lastRemoteSync > SYNC_INTERVAL) {
      syncRemote().catch(() => {});
    }

    const total = all.length;
    const start = (page - 1) * pageSize;
    return { items: all.slice(start, start + pageSize), total };
  },

  async getById(id: string): Promise<ProductChallan | undefined> {
    return db.productChallans.get(id);
  },

  async createProductChallan(data: Omit<ProductChallan, 'id' | 'challanNo' | 'createdAt' | 'status'>): Promise<ProductChallan> {
    // Seed local counter from max existing to avoid restarting at 1 offline
    try {
      const existing = await db.productChallans.toArray();
      const maxSeq = existing.reduce((m, c) => {
        const n = parseInt((c.challanNo || '').replace(/\D/g, ''), 10);
        return isNaN(n) ? m : Math.max(m, n);
      }, 0);
      if (maxSeq > 0) await seedLocalCounter('productChallan', maxSeq);
    } catch (_) {}

    const { number } = await getNextNumber({ key: 'productChallan', prefix: 'SWH-', pad: 4 });
    const id = 'pchallan_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
    const now = new Date().toISOString();
    const challan: ProductChallan = {
      ...data,
      id,
      challanNo: number,
      status: 'active',
      createdAt: now,
      updatedAt: now
    };

    await db.productChallans.put(challan);
    saveRecordToFirestore('productChallans', id, challan).catch(err => console.warn('Firestore product challan save note:', err));
    window.dispatchEvent(new CustomEvent('app-realtime-update'));
    return challan;
  },

  async updateProductChallan(challan: ProductChallan): Promise<void> {
    const deleted = await getDeletedRecordIdsSet();
    if (deleted.has(challan.id)) return;
    const updated = { ...challan, updatedAt: new Date().toISOString() };
    await db.productChallans.put(updated);
    saveRecordToFirestore('productChallans', challan.id, updated).catch(err => console.warn('Firestore product challan update note:', err));
    window.dispatchEvent(new CustomEvent('app-realtime-update'));
  },

  async cancelProductChallan(id: string, reason?: string): Promise<void> {
    const existing = await db.productChallans.get(id);
    if (!existing) return;
    await this.updateProductChallan({ ...existing, status: 'cancelled', cancelledReason: reason || 'Cancelled' });
  },

  async deleteProductChallan(id: string): Promise<void> {
    if (!id) return;
    await db.productChallans.delete(id);
    await markRecordAsDeleted(id, 'productChallans');
    deleteRecordFromFirestore('productChallans', id).catch(err => console.warn('Firestore product challan delete note:', err));
    window.dispatchEvent(new CustomEvent('app-realtime-update'));
  }
};

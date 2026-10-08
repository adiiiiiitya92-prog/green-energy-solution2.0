import { db } from './db';
import type { StockTransaction, Product } from '../types';
import { saveRecordToFirestore, fetchCollectionFromFirestore } from './firebase';

const DEFAULT_VPS_BACKEND = 'https://solar.187.126.120.54.sslip.io';
const BACKEND_URL = import.meta.env.DEV ? '' : (import.meta.env.VITE_BACKEND_URL || DEFAULT_VPS_BACKEND);

export const stockTransactionService = {
  async addTransaction(txn: Omit<StockTransaction, 'id'>): Promise<string> {
    const id = 'stk_txn_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);
    const newTxn: StockTransaction = {
      ...txn,
      id,
      timestamp: txn.timestamp || new Date().toISOString()
    };

    // 1. Instant local IndexedDB storage
    await db.stockTransactions.put(newTxn);

    // 2. Non-blocking Firestore Sync
    saveRecordToFirestore('stockTransactions', id, newTxn).catch(err => {
      console.warn("Firestore stock transaction save note:", err);
    });

    // 3. Non-blocking Express Backend API Sync
    fetch(`${BACKEND_URL}/api/stock-transactions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newTxn)
    }).catch(err => {
      console.warn("Backend API stock transaction sync note:", err);
    });

    // 4. Notify app of state change
    window.dispatchEvent(new CustomEvent('app-realtime-update'));

    return id;
  },

  async addTransactionsBulk(txns: Omit<StockTransaction, 'id'>[]): Promise<void> {
    for (const txn of txns) {
      await this.addTransaction(txn);
    }
  },

  // Helper: Log New Product Catalog Entry
  async logProductCreated(
    product: Product,
    initialStock: number,
    user?: { id?: string; name?: string; role?: string },
    notes?: string
  ): Promise<string> {
    return this.addTransaction({
      type: 'product_created',
      productId: product.id,
      productName: product.name,
      brand: product.brand,
      category: product.category,
      unit: product.unit || 'Nos',
      quantityAdded: initialStock,
      previousStock: 0,
      newStock: initialStock,
      serialNumbers: product.serialNumbers,
      notes: notes || `New product introduced to catalog with initial stock of ${initialStock} ${product.unit || 'Nos'}`,
      performedBy: user,
      timestamp: product.createdAt || new Date().toISOString()
    });
  },

  // Helper: Log Stock Inward / Batch Addition
  async logStockInward(params: {
    product: { id: string; name: string; brand?: string; category?: string; unit?: string };
    quantityAdded: number;
    previousStock: number;
    newStock: number;
    serialNumbers?: string[];
    batchNumber?: string;
    notes?: string;
    user?: { id?: string; name?: string; role?: string };
    timestamp?: string;
  }): Promise<string> {
    return this.addTransaction({
      type: 'stock_inward',
      productId: params.product.id,
      productName: params.product.name,
      brand: params.product.brand,
      category: params.product.category,
      unit: params.product.unit || 'Nos',
      quantityAdded: params.quantityAdded,
      previousStock: params.previousStock,
      newStock: params.newStock,
      serialNumbers: params.serialNumbers,
      batchNumber: params.batchNumber,
      notes: params.notes || `Stock inward batch of +${params.quantityAdded} ${params.product.unit || 'Nos'} added`,
      performedBy: params.user,
      timestamp: params.timestamp || new Date().toISOString()
    });
  },

  // Helper: Log Stock Manual Adjustment
  async logStockAdjustment(params: {
    product: { id: string; name: string; brand?: string; category?: string; unit?: string };
    previousStock: number;
    newStock: number;
    notes?: string;
    user?: { id?: string; name?: string; role?: string };
  }): Promise<string> {
    const diff = params.newStock - params.previousStock;
    return this.addTransaction({
      type: 'stock_adjustment',
      productId: params.product.id,
      productName: params.product.name,
      brand: params.product.brand,
      category: params.product.category,
      unit: params.product.unit || 'Nos',
      quantityAdded: diff > 0 ? diff : undefined,
      quantityDeducted: diff < 0 ? Math.abs(diff) : undefined,
      previousStock: params.previousStock,
      newStock: params.newStock,
      notes: params.notes || `Stock adjusted from ${params.previousStock} to ${params.newStock} (net ${diff >= 0 ? '+' + diff : diff})`,
      performedBy: params.user,
      timestamp: new Date().toISOString()
    });
  },

  async getTransactions(): Promise<StockTransaction[]> {
    const local = await db.stockTransactions.orderBy('timestamp').reverse().toArray();

    const syncRemote = async () => {
      try {
        let remote = await fetchCollectionFromFirestore<StockTransaction>('stockTransactions');
        if (!Array.isArray(remote) || remote.length === 0) {
          try {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), 2000);
            const res = await fetch(`${BACKEND_URL}/api/stock-transactions`, { signal: controller.signal });
            clearTimeout(timer);
            if (res.ok) {
              const apiTxns = await res.json();
              if (Array.isArray(apiTxns)) {
                remote = apiTxns;
              }
            }
          } catch (_) {}
        }

        if (Array.isArray(remote) && remote.length > 0) {
          await db.stockTransactions.bulkPut(remote);
        }
      } catch (err) {
        console.warn("Background stock transactions sync note:", err);
      }
    };

    if (local.length > 0) {
      syncRemote();
      return local;
    }

    await syncRemote();
    return db.stockTransactions.orderBy('timestamp').reverse().toArray();
  },

  async getTransactionsByChallan(challanId: string): Promise<StockTransaction[]> {
    return db.stockTransactions.where('challanId').equals(challanId).toArray();
  },

  async getTransactionsByProduct(productId: string): Promise<StockTransaction[]> {
    return db.stockTransactions.where('productId').equals(productId).toArray();
  }
};

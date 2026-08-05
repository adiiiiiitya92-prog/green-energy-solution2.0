import { db } from './db';
import type { StockTransaction } from '../types';
import { saveRecordToFirestore, fetchCollectionFromFirestore } from './firebase';

export const stockTransactionService = {
  async addTransaction(txn: Omit<StockTransaction, 'id'>): Promise<string> {
    const id = 'stk_txn_' + Math.random().toString(36).substring(2, 11);
    const newTxn: StockTransaction = {
      ...txn,
      id
    };

    await db.stockTransactions.add(newTxn);
    saveRecordToFirestore('stockTransactions', id, newTxn);
    return id;
  },

  async addTransactionsBulk(txns: Omit<StockTransaction, 'id'>[]): Promise<void> {
    for (const txn of txns) {
      await this.addTransaction(txn);
    }
  },

  async getTransactions(): Promise<StockTransaction[]> {
    const local = await db.stockTransactions.orderBy('timestamp').reverse().toArray();

    const syncRemote = async () => {
      try {
        const remote = await fetchCollectionFromFirestore<StockTransaction>('stockTransactions');
        if (remote && remote.length > 0) {
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

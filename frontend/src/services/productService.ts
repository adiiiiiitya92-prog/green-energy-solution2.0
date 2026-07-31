import { db } from './db';
import type { Product } from '../types';
import { saveRecordToFirestore, deleteRecordFromFirestore, fetchCollectionFromFirestore } from './firebase';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || '';

export const productService = {
  async getProducts(): Promise<Product[]> {
    const localProds = await db.products.orderBy('name').toArray();

    const syncRemote = async () => {
      try {
        let remoteProds = await fetchCollectionFromFirestore<Product>('products');
        if (!Array.isArray(remoteProds) || remoteProds.length === 0) {
          try {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), 2000);
            const res = await fetch(`${BACKEND_URL}/api/products`, { signal: controller.signal });
            clearTimeout(timer);
            if (res.ok) {
              const apiProds = await res.json();
              if (Array.isArray(apiProds)) {
                remoteProds = apiProds;
              }
            }
          } catch (_) {}
        }

        if (Array.isArray(remoteProds) && remoteProds.length > 0) {
          const remoteIds = new Set(remoteProds.map(p => p.id));
          const currentLocal = await db.products.toArray();
          const deletedIds = currentLocal.filter(p => !remoteIds.has(p.id)).map(p => p.id);

          await db.products.bulkPut(remoteProds);
          if (deletedIds.length > 0) {
            await db.products.bulkDelete(deletedIds);
          }
        }
      } catch (err) {
        console.warn("Background product sync note:", err);
      }
    };

    if (localProds.length > 0) {
      syncRemote();
      return localProds;
    }

    await syncRemote();
    return db.products.orderBy('name').toArray();
  },

  async createProduct(pData: Omit<Product, 'id' | 'createdAt'>): Promise<string> {
    const id = 'prod_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
    const newProduct: Product = {
      ...pData,
      id,
      createdAt: new Date().toISOString()
    };

    // 1. Instant local IndexedDB storage
    await db.products.put(newProduct);

    // 2. Non-blocking Firestore & REST API Sync in background
    saveRecordToFirestore('products', id, newProduct).catch(err => console.warn("Firestore product save note:", err));
    fetch(`${BACKEND_URL}/api/products`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newProduct)
    }).catch(err => console.warn("Express Backend API product sync note:", err));

    return id;
  },

  async updateProduct(product: Product): Promise<void> {
    // 1. Instant local IndexedDB storage
    await db.products.put(product);

    // 2. Non-blocking Firestore & REST API Sync in background
    saveRecordToFirestore('products', product.id, product).catch(err => console.warn("Firestore product update note:", err));
    fetch(`${BACKEND_URL}/api/products`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(product)
    }).catch(err => console.warn("Express Backend API product update note:", err));
  },

  async deleteProduct(id: string): Promise<void> {
    // 1. Instant local IndexedDB storage
    await db.products.delete(id);

    // 2. Non-blocking Firestore & REST API Sync in background
    deleteRecordFromFirestore('products', id).catch(err => console.warn("Firestore product delete note:", err));
    fetch(`${BACKEND_URL}/api/products/${id}`, {
      method: 'DELETE'
    }).catch(err => console.warn("Express Backend API product delete note:", err));
  }
};

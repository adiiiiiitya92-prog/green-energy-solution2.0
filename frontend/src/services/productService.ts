import { db } from './db';
import type { Product } from '../types';
import { saveRecordToFirestore, deleteRecordFromFirestore, fetchCollectionFromFirestore } from './firebase';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || '';

export const productService = {
  async getProducts(): Promise<Product[]> {
    try {
      let remoteProds = await fetchCollectionFromFirestore<Product>('products');
      if (!Array.isArray(remoteProds) || remoteProds.length === 0) {
        try {
          const res = await fetch(`${BACKEND_URL}/api/products`);
          if (res.ok) {
            const apiProds = await res.json();
            if (Array.isArray(apiProds)) {
              remoteProds = apiProds;
            }
          }
        } catch (_) {}
      }

      if (Array.isArray(remoteProds)) {
        const remoteIds = new Set(remoteProds.map(p => p.id));
        const localProds = await db.products.toArray();
        const deletedIds = localProds.filter(p => !remoteIds.has(p.id)).map(p => p.id);

        if (remoteProds.length > 0) {
          await db.products.bulkPut(remoteProds);
        }
        if (deletedIds.length > 0) {
          await db.products.bulkDelete(deletedIds);
        }

        return await db.products.orderBy('name').toArray();
      }
    } catch (err) {
      console.warn("Firestore products sync note, returning local cache:", err);
    }

    return db.products.orderBy('name').toArray();
  },

  async createProduct(pData: Omit<Product, 'id' | 'createdAt'>): Promise<string> {
    const id = 'prod_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
    const newProduct: Product = {
      ...pData,
      id,
      createdAt: new Date().toISOString()
    };

    // 1. IndexedDB local storage
    await db.products.put(newProduct);

    // 2. Firebase Firestore Cloud Storage
    await saveRecordToFirestore('products', id, newProduct);

    // 3. Express Backend REST API
    try {
      await fetch(`${BACKEND_URL}/api/products`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newProduct)
      });
      console.log(`🚀 Product saved to Express Backend API [${id}]`);
    } catch (err) {
      console.warn("Express Backend API product sync note:", err);
    }

    return id;
  },

  async updateProduct(product: Product): Promise<void> {
    await db.products.put(product);
    await saveRecordToFirestore('products', product.id, product);

    try {
      await fetch(`${BACKEND_URL}/api/products`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(product)
      });
    } catch (err) {
      console.warn("Express Backend API product update note:", err);
    }
  },

  async deleteProduct(id: string): Promise<void> {
    await db.products.delete(id);
    await deleteRecordFromFirestore('products', id);

    try {
      await fetch(`${BACKEND_URL}/api/products/${id}`, {
        method: 'DELETE'
      });
    } catch (err) {
      console.warn("Express Backend API product delete note:", err);
    }
  }
};

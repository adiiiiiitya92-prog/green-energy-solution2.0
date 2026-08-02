import { db, markRecordAsDeleted, getDeletedRecordIdsSet } from './db';
import type { Product } from '../types';
import { saveRecordToFirestore, deleteRecordFromFirestore, fetchCollectionFromFirestore } from './firebase';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || '';

export const productService = {
  async getProducts(): Promise<Product[]> {
    const deletedIds = await getDeletedRecordIdsSet();
    const localProds = await db.products.orderBy('name').toArray();
    const validLocal = localProds.filter(p => !deletedIds.has(p.id));

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
          const freshDeleted = await getDeletedRecordIdsSet();
          const validRemote = remoteProds.filter(p => !freshDeleted.has(p.id));
          const remoteIds = new Set(validRemote.map(p => p.id));
          const currentLocal = await db.products.toArray();
          const deletedIdsList = currentLocal.filter(p => !remoteIds.has(p.id) || freshDeleted.has(p.id)).map(p => p.id);

          if (validRemote.length > 0) {
            await db.products.bulkPut(validRemote);
          }
          if (deletedIdsList.length > 0) {
            await db.products.bulkDelete(deletedIdsList);
          }
        }
      } catch (err) {
        console.warn("Background product sync note:", err);
      }
    };

    if (validLocal.length > 0) {
      syncRemote();
      return validLocal;
    }

    await syncRemote();
    const freshDeleted = await getDeletedRecordIdsSet();
    const refreshed = await db.products.orderBy('name').toArray();
    return refreshed.filter(p => !freshDeleted.has(p.id));
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
    const deletedIds = await getDeletedRecordIdsSet();
    if (deletedIds.has(product.id)) return;

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

  async deleteProduct(id: string, skipApprovalCheck = false): Promise<{ success: boolean; requiresApproval?: boolean }> {
    if (!id) return { success: false };

    const { useAuthStore } = await import('../store/authStore');
    const currentRole = useAuthStore.getState().currentRole;
    const currentUser = useAuthStore.getState().currentUser;
    const isSuperAdmin = currentRole === 'super_admin' || currentUser?.role === 'super_admin';

    if (!isSuperAdmin && !skipApprovalCheck) {
      const prod = await db.products.get(id);
      const prodName = prod ? `Product "${prod.name}" (${prod.category})` : `Product #${id}`;
      const { deletionRequestService } = await import('./deletionRequestService');
      await deletionRequestService.requestDeletion({
        entityType: 'product',
        entityId: id,
        entityName: prodName,
        reason: `Delete product requested by ${currentUser?.fullName || 'Admin/Employee'}`
      });
      return { success: true, requiresApproval: true };
    }

    // 1. Instant local IndexedDB storage
    await db.products.delete(id);
    await markRecordAsDeleted(id, 'products');

    // 2. Non-blocking Firestore & REST API Sync in background
    deleteRecordFromFirestore('products', id).catch(err => console.warn("Firestore product delete note:", err));
    fetch(`${BACKEND_URL}/api/products/${id}`, {
      method: 'DELETE'
    }).catch(err => console.warn("Express Backend API product delete note:", err));

    return { success: true };
  }
};

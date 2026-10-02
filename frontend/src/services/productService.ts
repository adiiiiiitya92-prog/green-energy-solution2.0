import { db, markRecordAsDeleted, getDeletedRecordIdsSet } from './db';
import type { Product } from '../types';
import { saveRecordToFirestore, deleteRecordFromFirestore, fetchCollectionFromFirestore } from './firebase';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || '';

let lastProductRemoteSync = 0;
const PRODUCT_SYNC_INTERVAL = 15 * 60 * 1000;

export const productService = {
  async getProducts(): Promise<Product[]> {
    const deletedIds = await getDeletedRecordIdsSet();
    const localProds = await db.products.orderBy('name').toArray();
    const validLocal = localProds.filter(p => !deletedIds.has(p.id));

    const syncRemote = async () => {
      try {
        lastProductRemoteSync = Date.now();
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
          if (validRemote.length > 0) {
            await db.products.bulkPut(validRemote);
            if (typeof window !== 'undefined') {
              window.dispatchEvent(new CustomEvent('app-realtime-update'));
            }
          }
        }
      } catch (err) {
        console.warn("Background product sync note:", err);
      }
    };

    if (validLocal.length === 0) {
      await syncRemote();
      const freshDeleted = await getDeletedRecordIdsSet();
      const refreshed = await db.products.orderBy('name').toArray();
      return refreshed.filter(p => !freshDeleted.has(p.id));
    }

    if (Date.now() - lastProductRemoteSync > PRODUCT_SYNC_INTERVAL) {
      syncRemote().catch(() => {});
    }

    return validLocal;
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

    // 3. Automatically record Product Creation & Initial Stock History
    try {
      const { stockTransactionService } = await import('./stockTransactionService');
      const { useAuthStore } = await import('../store/authStore');
      const currentUser = useAuthStore.getState().currentUser;
      const userSummary = currentUser ? { id: currentUser.id, name: currentUser.fullName, role: currentUser.role } : undefined;
      await stockTransactionService.logProductCreated(newProduct, newProduct.stockQuantity || 0, userSummary);
    } catch (logErr) {
      console.warn("Stock transaction log on create note:", logErr);
    }

    window.dispatchEvent(new CustomEvent('app-realtime-update'));
    return id;
  },

  async updateProduct(product: Product, options?: { skipHistoryLog?: boolean; logNotes?: string }): Promise<void> {
    const deletedIds = await getDeletedRecordIdsSet();
    if (deletedIds.has(product.id)) return;

    const previousData = await db.products.get(product.id);

    // 1. Instant local IndexedDB storage
    await db.products.put(product);

    // 2. Non-blocking Firestore & REST API Sync in background
    saveRecordToFirestore('products', product.id, product).catch(err => console.warn("Firestore product update note:", err));
    fetch(`${BACKEND_URL}/api/products`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(product)
    }).catch(err => console.warn("Express Backend API product update note:", err));

    // 3. Automatically record Stock Changes if not explicitly skipped
    if (!options?.skipHistoryLog && previousData && previousData.stockQuantity !== product.stockQuantity) {
      try {
        const { stockTransactionService } = await import('./stockTransactionService');
        const { useAuthStore } = await import('../store/authStore');
        const currentUser = useAuthStore.getState().currentUser;
        const userSummary = currentUser ? { id: currentUser.id, name: currentUser.fullName, role: currentUser.role } : undefined;
        const prevQty = previousData.stockQuantity || 0;
        const newQty = product.stockQuantity || 0;
        const diff = newQty - prevQty;

        if (diff > 0) {
          await stockTransactionService.logStockInward({
            product,
            quantityAdded: diff,
            previousStock: prevQty,
            newStock: newQty,
            notes: options?.logNotes || `Stock updated: +${diff} ${product.unit || 'Nos'} added`,
            user: userSummary
          });
        } else if (diff < 0) {
          await stockTransactionService.logStockAdjustment({
            product,
            previousStock: prevQty,
            newStock: newQty,
            notes: options?.logNotes || `Stock adjusted from ${prevQty} to ${newQty}`,
            user: userSummary
          });
        }
      } catch (logErr) {
        console.warn("Stock transaction log on update note:", logErr);
      }
    }

    window.dispatchEvent(new CustomEvent('app-realtime-update'));
  },

  async requestProductEdit(updatedProduct: Product, customReason?: string): Promise<{ success: boolean; requiresApproval: boolean; requestId?: string }> {
    const { useAuthStore } = await import('../store/authStore');
    const currentRole = useAuthStore.getState().currentRole;
    const currentUser = useAuthStore.getState().currentUser;
    const isSuperAdmin = currentRole === 'super_admin' || currentUser?.role === 'super_admin';

    if (isSuperAdmin) {
      await this.updateProduct(updatedProduct);
      return { success: true, requiresApproval: false };
    }

    const previousData = await db.products.get(updatedProduct.id);
    if (!previousData) {
      throw new Error(`Product #${updatedProduct.id} not found.`);
    }

    const { deletionRequestService } = await import('./deletionRequestService');
    const reqId = await deletionRequestService.requestEdit({
      entityType: 'product',
      entityId: updatedProduct.id,
      entityName: `Product "${updatedProduct.name}" (${updatedProduct.category})`,
      previousData,
      updatedData: updatedProduct,
      reason: customReason || `Product update requested by ${currentUser?.fullName || 'Inventory Manager'}`
    });

    return { success: true, requiresApproval: true, requestId: reqId };
  },

  async deleteProduct(id: string, skipApprovalCheck = false, customReason?: string): Promise<{ success: boolean; requiresApproval?: boolean }> {
    if (!id) return { success: false };

    const { useAuthStore } = await import('../store/authStore');
    const currentRole = useAuthStore.getState().currentRole;
    const currentUser = useAuthStore.getState().currentUser;
    const isSuperAdmin = currentRole === 'super_admin' || currentUser?.role === 'super_admin';

    if (!isSuperAdmin && !skipApprovalCheck) {
      const prod = await db.products.get(id);
      const prodName = prod ? `Product "${prod.name}" (${prod.category})` : `Product #${id}`;
      const itemSnapshot = {
        ...prod,
        unitsCount: Array.isArray(prod?.units) ? prod.units.length : 0,
        availableUnitsCount: Array.isArray(prod?.units) ? prod.units.filter((u: any) => u.status === 'available').length : 0,
      };

      const { deletionRequestService } = await import('./deletionRequestService');
      await deletionRequestService.requestDeletion({
        entityType: 'product',
        entityId: id,
        entityName: prodName,
        reason: customReason || `Delete product requested by ${currentUser?.fullName || 'Inventory/Admin'}`,
        itemSnapshot
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

    window.dispatchEvent(new CustomEvent('app-realtime-update'));
    return { success: true };
  }
};

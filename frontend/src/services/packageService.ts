import { db, markRecordAsDeleted, getDeletedRecordIdsSet } from './db';
import type { Package } from '../types';
import { saveRecordToFirestore, fetchCollectionFromFirestore, deleteRecordFromFirestore } from './firebase';

export const packageService = {
  async getPackages(): Promise<Package[]> {
    const deletedIds = await getDeletedRecordIdsSet();
    const local = await db.packages.orderBy('createdAt').reverse().toArray();
    const validLocal = local.filter(p => !deletedIds.has(p.id));

    const syncRemote = async () => {
      try {
        const remote = await fetchCollectionFromFirestore<Package>('packages');
        if (remote && remote.length > 0) {
          const freshDeleted = await getDeletedRecordIdsSet();
          const validRemote = remote.filter(p => !freshDeleted.has(p.id));
          if (validRemote.length > 0) {
            await db.packages.bulkPut(validRemote);
          }
        }
      } catch (err) {
        console.warn("Background packages sync note:", err);
      }
    };

    if (validLocal.length > 0) {
      syncRemote();
      return validLocal;
    }

    await syncRemote();
    const freshDeleted = await getDeletedRecordIdsSet();
    const refreshed = await db.packages.orderBy('createdAt').reverse().toArray();
    return refreshed.filter(p => !freshDeleted.has(p.id));
  },

  async getPackageById(id: string): Promise<Package | undefined> {
    return db.packages.get(id);
  },

  async savePackage(pData: Omit<Package, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }): Promise<Package> {
    const now = new Date().toISOString();
    const id = pData.id || 'pkg_' + Math.random().toString(36).substring(2, 11);

    const commercialTotal = (pData.commercialItems || []).reduce((sum, i) => sum + (Number(i.qty) * Number(i.rate) || 0), 0);
    const bomTotal = (pData.bomItems || []).reduce((sum, i) => sum + (Number(i.qty) * Number(i.rate) || 0), 0);
    const combinedTotal = commercialTotal + bomTotal;

    const pkgRecord: Package = {
      ...pData,
      id,
      status: pData.status || 'active',
      commercialItems: pData.commercialItems || [],
      bomItems: pData.bomItems || [],
      calculatedCommercialTotal: commercialTotal,
      calculatedBomTotal: bomTotal,
      calculatedCombinedTotal: combinedTotal,
      finalPrice: pData.finalPrice !== undefined ? Number(pData.finalPrice) : combinedTotal,
      createdAt: pData.id ? (await db.packages.get(pData.id))?.createdAt || now : now,
      updatedAt: now
    };

    await db.packages.put(pkgRecord);
    saveRecordToFirestore('packages', id, pkgRecord);
    return pkgRecord;
  },

  async duplicatePackage(id: string): Promise<Package> {
    const original = await db.packages.get(id);
    if (!original) {
      throw new Error("Original package not found to duplicate");
    }

    const newId = 'pkg_' + Math.random().toString(36).substring(2, 11);
    const now = new Date().toISOString();

    const duplicated: Package = {
      ...original,
      id: newId,
      name: `${original.name} (Copy)`,
      code: original.code ? `${original.code}-COPY` : undefined,
      createdAt: now,
      updatedAt: now
    };

    await db.packages.add(duplicated);
    saveRecordToFirestore('packages', newId, duplicated);
    return duplicated;
  },

  async deletePackage(id: string): Promise<void> {
    await markRecordAsDeleted(id, 'packages');
    await db.packages.delete(id);
    try {
      await deleteRecordFromFirestore('packages', id);
    } catch (e) {
      console.warn("Firestore delete package note:", e);
    }
  },

  async searchPackages(query: string, statusOnly?: 'active' | 'inactive'): Promise<Package[]> {
    const all = await this.getPackages();
    const q = query.trim().toLowerCase();

    return all.filter(p => {
      if (statusOnly && p.status !== statusOnly) return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        (p.code && p.code.toLowerCase().includes(q)) ||
        (p.description && p.description.toLowerCase().includes(q))
      );
    });
  }
};

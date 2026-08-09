import { db, markRecordAsDeleted, getDeletedRecordIdsSet } from './db';
import type { B2BBusiness } from '../types';
import { saveRecordToFirestore, fetchCollectionFromFirestore, deleteRecordFromFirestore } from './firebase';

export const b2bBusinessService = {
  async getBusinesses(): Promise<B2BBusiness[]> {
    const deletedIds = await getDeletedRecordIdsSet();
    const local = await db.b2bBusinesses.orderBy('createdAt').reverse().toArray();
    const validLocal = local.filter(b => !deletedIds.has(b.id));

    const syncFromChallans = async (existing: B2BBusiness[]) => {
      try {
        const existingNames = new Set(existing.map(b => b.businessName.trim().toLowerCase()));
        const challans = await db.challans.toArray();
        const now = new Date().toISOString();

        for (const ch of challans) {
          if (ch.type === 'b2b' && ch.businessName && ch.businessName.trim()) {
            const normName = ch.businessName.trim().toLowerCase();
            if (!existingNames.has(normName)) {
              existingNames.add(normName);
              const newId = ch.b2bBusinessId || 'b2b_' + Math.random().toString(36).substring(2, 11);
              const newBiz: B2BBusiness = {
                id: newId,
                businessName: ch.businessName.trim(),
                gstNumber: ch.gstNumber || '',
                businessAddress: ch.businessAddress || '',
                contactPerson: ch.contactPerson || '',
                mobileNumber: ch.mobileNumber || '',
                email: ch.email || '',
                createdAt: ch.createdAt || now,
                updatedAt: now
              };
              await db.b2bBusinesses.put(newBiz);
              saveRecordToFirestore('b2bBusinesses', newId, newBiz);
              existing.push(newBiz);
            }
          }
        }
      } catch (err) {
        console.warn("Sync B2B businesses from challans note:", err);
      }
    };

    const syncRemote = async () => {
      try {
        const remote = await fetchCollectionFromFirestore<B2BBusiness>('b2bBusinesses');
        if (remote && remote.length > 0) {
          const freshDeleted = await getDeletedRecordIdsSet();
          const validRemote = remote.filter(b => !freshDeleted.has(b.id));
          if (validRemote.length > 0) {
            await db.b2bBusinesses.bulkPut(validRemote);
          }
        }
      } catch (err) {
        console.warn("Background B2B businesses sync note:", err);
      }
    };

    if (validLocal.length > 0) {
      syncRemote();
      await syncFromChallans(validLocal);
      return validLocal;
    }

    await syncRemote();
    const freshDeleted = await getDeletedRecordIdsSet();
    const refreshed = await db.b2bBusinesses.orderBy('createdAt').reverse().toArray();
    const result = refreshed.filter(b => !freshDeleted.has(b.id));
    await syncFromChallans(result);
    return result;
  },

  async getBusinessById(id: string): Promise<B2BBusiness | undefined> {
    return db.b2bBusinesses.get(id);
  },

  async saveOrUpdateBusiness(bData: {
    id?: string;
    businessName: string;
    gstNumber?: string;
    businessAddress?: string;
    contactPerson?: string;
    mobileNumber?: string;
    email?: string;
  }): Promise<B2BBusiness> {
    const trimmedName = bData.businessName.trim();
    if (!trimmedName) {
      throw new Error("Business Name is required");
    }

    let existing: B2BBusiness | undefined = undefined;

    if (bData.id) {
      existing = await db.b2bBusinesses.get(bData.id);
    }

    if (!existing) {
      const allLocal = await db.b2bBusinesses.toArray();
      existing = allLocal.find(
        b => b.businessName.trim().toLowerCase() === trimmedName.toLowerCase()
      );
    }

    const now = new Date().toISOString();

    if (existing) {
      const updatedBusiness: B2BBusiness = {
        ...existing,
        businessName: trimmedName,
        gstNumber: bData.gstNumber !== undefined ? bData.gstNumber : existing.gstNumber,
        businessAddress: bData.businessAddress !== undefined ? bData.businessAddress : existing.businessAddress,
        contactPerson: bData.contactPerson !== undefined ? bData.contactPerson : existing.contactPerson,
        mobileNumber: bData.mobileNumber !== undefined ? bData.mobileNumber : existing.mobileNumber,
        email: bData.email !== undefined ? bData.email : existing.email,
        updatedAt: now
      };

      await db.b2bBusinesses.put(updatedBusiness);
      saveRecordToFirestore('b2bBusinesses', updatedBusiness.id, updatedBusiness);
      window.dispatchEvent(new CustomEvent('app-realtime-update'));
      return updatedBusiness;
    } else {
      const newId = bData.id || 'b2b_' + Math.random().toString(36).substring(2, 11);
      const newBusiness: B2BBusiness = {
        id: newId,
        businessName: trimmedName,
        gstNumber: bData.gstNumber || '',
        businessAddress: bData.businessAddress || '',
        contactPerson: bData.contactPerson || '',
        mobileNumber: bData.mobileNumber || '',
        email: bData.email || '',
        createdAt: now,
        updatedAt: now
      };

      await db.b2bBusinesses.put(newBusiness);
      saveRecordToFirestore('b2bBusinesses', newId, newBusiness);
      window.dispatchEvent(new CustomEvent('app-realtime-update'));
      return newBusiness;
    }
  },

  async updateBusiness(id: string, updates: Partial<B2BBusiness>): Promise<B2BBusiness> {
    const existing = await db.b2bBusinesses.get(id);
    if (!existing) {
      throw new Error("Business not found");
    }

    const updated: B2BBusiness = {
      ...existing,
      ...updates,
      updatedAt: new Date().toISOString()
    };

    await db.b2bBusinesses.put(updated);
    saveRecordToFirestore('b2bBusinesses', id, updated);
    return updated;
  },

  async deleteBusiness(id: string): Promise<void> {
    await markRecordAsDeleted(id, 'b2bBusinesses');
    await db.b2bBusinesses.delete(id);
    try {
      await deleteRecordFromFirestore('b2bBusinesses', id);
    } catch (e) {
      console.warn("Firestore delete B2B business note:", e);
    }
  },

  async searchBusinesses(query: string): Promise<B2BBusiness[]> {
    const q = query.trim().toLowerCase();
    if (!q) return this.getBusinesses();
    const all = await this.getBusinesses();
    return all.filter(b => 
      b.businessName.toLowerCase().includes(q) ||
      (b.mobileNumber && b.mobileNumber.toLowerCase().includes(q)) ||
      (b.gstNumber && b.gstNumber.toLowerCase().includes(q)) ||
      (b.contactPerson && b.contactPerson.toLowerCase().includes(q))
    );
  }
};

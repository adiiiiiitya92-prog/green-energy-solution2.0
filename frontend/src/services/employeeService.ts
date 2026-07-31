import { db } from './db';
import type { Profile } from '../types';
import { saveRecordToFirestore, fetchCollectionFromFirestore } from './firebase';

export const employeeService = {
  async getEmployees(): Promise<Profile[]> {
    const localProfiles = await db.profiles.where('role').anyOf(['admin', 'field_employee', 'inventory_manager']).toArray();

    const syncRemote = async () => {
      try {
        const remoteProfiles = await fetchCollectionFromFirestore<Profile>('profiles');
        if (Array.isArray(remoteProfiles) && remoteProfiles.length > 0) {
          await db.profiles.bulkPut(remoteProfiles);
        }
      } catch (err) {
        console.warn("Background profile sync note:", err);
      }
    };

    if (localProfiles.length > 0) {
      syncRemote();
      return localProfiles;
    }

    await syncRemote();
    return db.profiles.where('role').anyOf(['admin', 'field_employee', 'inventory_manager']).toArray();
  },

  async getAllProfiles(): Promise<Profile[]> {
    const localProfiles = await db.profiles.toArray();

    const syncRemote = async () => {
      try {
        const remoteProfiles = await fetchCollectionFromFirestore<Profile>('profiles');
        if (Array.isArray(remoteProfiles) && remoteProfiles.length > 0) {
          await db.profiles.bulkPut(remoteProfiles);
        }
      } catch (err) {
        console.warn("Background profile sync note:", err);
      }
    };

    if (localProfiles.length > 0) {
      syncRemote();
      return localProfiles;
    }

    await syncRemote();
    return db.profiles.toArray();
  },

  async createEmployee(pData: Omit<Profile, 'id' | 'createdAt' | 'isActive'>): Promise<string> {
    const id = 'p_' + Math.random().toString(36).substring(2, 11);
    const newProfile: Profile = {
      ...pData,
      id,
      isActive: true,
      createdAt: new Date().toISOString()
    };
    await db.profiles.add(newProfile);
    saveRecordToFirestore('profiles', id, newProfile);
    return id;
  },

  async toggleEmployeeStatus(id: string): Promise<void> {
    const profile = await db.profiles.get(id);
    if (profile) {
      profile.isActive = !profile.isActive;
      await db.profiles.put(profile);
      saveRecordToFirestore('profiles', id, profile);
    }
  },

  async deleteEmployee(id: string): Promise<void> {
    await db.profiles.delete(id);
    try {
      const { deleteRecordFromFirestore } = await import('./firebase');
      await deleteRecordFromFirestore('profiles', id);
    } catch (e) {
      console.warn("Firestore delete profile note:", e);
    }
  }
};

import { db, markRecordAsDeleted, getDeletedRecordIdsSet } from './db';
import type { Profile } from '../types';
import { saveRecordToFirestore, fetchCollectionFromFirestore } from './firebase';

let lastProfileRemoteSync = 0;
const PROFILE_SYNC_INTERVAL = 15 * 60 * 1000;

export const employeeService = {
  async getEmployees(): Promise<Profile[]> {
    const deletedIds = await getDeletedRecordIdsSet();
    const localProfiles = await db.profiles.where('role').anyOf(['admin', 'field_employee', 'inventory_manager', 'dealer']).toArray();
    const validLocal = localProfiles.filter(p => !deletedIds.has(p.id));

    const syncRemote = async () => {
      try {
        lastProfileRemoteSync = Date.now();
        const remoteProfiles = await fetchCollectionFromFirestore<Profile>('profiles');
        if (Array.isArray(remoteProfiles) && remoteProfiles.length > 0) {
          const freshDeleted = await getDeletedRecordIdsSet();
          const validRemote = remoteProfiles.filter(p => !freshDeleted.has(p.id));
          if (validRemote.length > 0) {
            await db.profiles.bulkPut(validRemote);
          }
        }
      } catch (err) {
        console.warn("Background profile sync note:", err);
      }
    };

    if (validLocal.length === 0) {
      await syncRemote();
      const freshDeleted = await getDeletedRecordIdsSet();
      const refreshed = await db.profiles.where('role').anyOf(['admin', 'field_employee', 'inventory_manager', 'dealer']).toArray();
      return refreshed.filter(p => !freshDeleted.has(p.id));
    }

    if (Date.now() - lastProfileRemoteSync > PROFILE_SYNC_INTERVAL) {
      syncRemote().catch(() => {});
    }

    return validLocal;
  },

  async getAllProfiles(): Promise<Profile[]> {
    const deletedIds = await getDeletedRecordIdsSet();
    const localProfiles = await db.profiles.toArray();
    const validLocal = localProfiles.filter(p => !deletedIds.has(p.id));

    const syncRemote = async () => {
      try {
        lastProfileRemoteSync = Date.now();
        const remoteProfiles = await fetchCollectionFromFirestore<Profile>('profiles');
        if (Array.isArray(remoteProfiles) && remoteProfiles.length > 0) {
          const freshDeleted = await getDeletedRecordIdsSet();
          const validRemote = remoteProfiles.filter(p => !freshDeleted.has(p.id));
          if (validRemote.length > 0) {
            await db.profiles.bulkPut(validRemote);
          }
        }
      } catch (err) {
        console.warn("Background profile sync note:", err);
      }
    };

    if (validLocal.length === 0) {
      await syncRemote();
      const freshDeleted = await getDeletedRecordIdsSet();
      const refreshed = await db.profiles.toArray();
      return refreshed.filter(p => !freshDeleted.has(p.id));
    }

    if (Date.now() - lastProfileRemoteSync > PROFILE_SYNC_INTERVAL) {
      syncRemote().catch(() => {});
    }

    return validLocal;
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
    window.dispatchEvent(new CustomEvent('app-realtime-update'));
    return id;
  },

  async updateEmployee(id: string, updates: Partial<Profile>): Promise<Profile> {
    const profile = await db.profiles.get(id);
    if (!profile) {
      throw new Error(`Employee profile with id "${id}" was not found.`);
    }
    const updatedProfile: Profile = {
      ...profile,
      ...updates,
      id // preserve existing id
    };
    await db.profiles.put(updatedProfile);
    saveRecordToFirestore('profiles', id, updatedProfile);

    // Sync session storage if this user is currently authenticated
    try {
      const storedUserId = localStorage.getItem('ges_user_id');
      if (storedUserId === id) {
        localStorage.setItem('ges_user_profile', JSON.stringify(updatedProfile));
        if (updatedProfile.email) {
          localStorage.setItem('ges_user_email', updatedProfile.email.toLowerCase());
        }
      }
      const { useAuthStore } = await import('../store/authStore');
      const auth = useAuthStore.getState();
      if (auth.currentUser?.id === id) {
        useAuthStore.setState({
          currentUser: updatedProfile,
          currentRole: updatedProfile.role
        });
      }
      if (auth.originalUser?.id === id) {
        useAuthStore.setState({
          originalUser: updatedProfile
        });
      }
    } catch (err) {
      console.warn('Session sync note:', err);
    }

    window.dispatchEvent(new CustomEvent('app-realtime-update'));
    return updatedProfile;
  },

  async toggleEmployeeStatus(id: string): Promise<void> {
    const profile = await db.profiles.get(id);
    if (profile) {
      profile.isActive = !profile.isActive;
      await db.profiles.put(profile);
      saveRecordToFirestore('profiles', id, profile);
      window.dispatchEvent(new CustomEvent('app-realtime-update'));
    }
  },

  async deleteEmployee(id: string, skipApprovalCheck = false, customReason?: string): Promise<{ success: boolean; requiresApproval?: boolean }> {
    const { useAuthStore } = await import('../store/authStore');
    const currentRole = useAuthStore.getState().currentRole;
    const currentUser = useAuthStore.getState().currentUser;
    const isSuperAdmin = currentRole === 'super_admin' || currentUser?.role === 'super_admin';

    if (!isSuperAdmin && !skipApprovalCheck) {
      const emp = await db.profiles.get(id);
      const empName = emp ? `Employee "${emp.fullName}" (${emp.role.replace('_', ' ')})` : `Employee #${id}`;
      const itemSnapshot = { ...emp };
      const { deletionRequestService } = await import('./deletionRequestService');
      await deletionRequestService.requestDeletion({
        entityType: 'employee',
        entityId: id,
        entityName: empName,
        reason: customReason || `Delete employee profile requested by ${currentUser?.fullName || 'Admin'}`,
        itemSnapshot
      });
      return { success: true, requiresApproval: true };
    }

    await db.profiles.delete(id);
    await markRecordAsDeleted(id, 'profiles');
    try {
      const { deleteRecordFromFirestore } = await import('./firebase');
      await deleteRecordFromFirestore('profiles', id);
    } catch (e) {
      console.warn("Firestore delete profile note:", e);
    }
    window.dispatchEvent(new CustomEvent('app-realtime-update'));
    return { success: true };
  }
};

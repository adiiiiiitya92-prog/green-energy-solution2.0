import { db, markRecordAsDeleted, getDeletedRecordIdsSet } from './db';
import type { ScheduledFieldVisit } from '../types';
import {
  saveRecordToFirestore,
  fetchCollectionFromFirestore,
  deleteRecordFromFirestore
} from './firebase';

let lastSync = 0;
const SYNC_INTERVAL = 60 * 1000;

export const fieldVisitScheduleService = {
  async getAll(): Promise<ScheduledFieldVisit[]> {
    const deleted = await getDeletedRecordIdsSet();
    const local = await db.scheduledFieldVisits.toArray();
    const valid = local.filter(v => !deleted.has(v.id));

    const sync = async () => {
      try {
        lastSync = Date.now();
        const remote = await fetchCollectionFromFirestore<ScheduledFieldVisit>(
          'scheduledFieldVisits',
          3000
        );
        if (Array.isArray(remote) && remote.length > 0) {
          const freshDeleted = await getDeletedRecordIdsSet();
          const validRemote = remote.filter(r => !freshDeleted.has(r.id));
          if (validRemote.length > 0) await db.scheduledFieldVisits.bulkPut(validRemote);
        }
      } catch (e) {
        console.warn('Field visit schedule sync note:', e);
      }
    };

    if (valid.length === 0) {
      await sync();
      const refreshed = await db.scheduledFieldVisits.toArray();
      return refreshed.filter(v => !deleted.has(v.id));
    }
    if (Date.now() - lastSync > SYNC_INTERVAL) sync().catch(() => {});
    return valid.sort(
      (a, b) => new Date(b.scheduledDate).getTime() - new Date(a.scheduledDate).getTime()
    );
  },

  async getByEmployee(employeeId: string): Promise<ScheduledFieldVisit[]> {
    const all = await this.getAll();
    return all.filter(v => v.assignedToId === employeeId);
  },

  async getByLead(leadId: string): Promise<ScheduledFieldVisit[]> {
    const all = await this.getAll();
    return all.filter(v => v.leadId === leadId);
  },

  async create(
    data: Omit<ScheduledFieldVisit, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<ScheduledFieldVisit> {
    const id =
      'sfv_' + Math.random().toString(36).substring(2, 10) + '_' + Date.now().toString(36);
    const now = new Date().toISOString();
    const record: ScheduledFieldVisit = { id, createdAt: now, updatedAt: now, ...data };
    await db.scheduledFieldVisits.put(record);
    saveRecordToFirestore('scheduledFieldVisits', id, record);
    window.dispatchEvent(new CustomEvent('app-realtime-update'));
    return record;
  },

  async update(
    id: string,
    patch: Partial<Omit<ScheduledFieldVisit, 'id' | 'createdAt'>>
  ): Promise<ScheduledFieldVisit> {
    const existing = await db.scheduledFieldVisits.get(id);
    if (!existing) throw new Error('Scheduled visit not found');
    const updated: ScheduledFieldVisit = {
      ...existing,
      ...patch,
      updatedAt: new Date().toISOString()
    };
    await db.scheduledFieldVisits.put(updated);
    saveRecordToFirestore('scheduledFieldVisits', id, updated);
    window.dispatchEvent(new CustomEvent('app-realtime-update'));
    return updated;
  },

  async markDone(id: string, notes?: string): Promise<ScheduledFieldVisit> {
    return this.update(id, {
      status: 'done',
      completedAt: new Date().toISOString(),
      completionNotes: notes
    });
  },

  async remove(id: string): Promise<void> {
    await markRecordAsDeleted(id, 'scheduledFieldVisits');
    await db.scheduledFieldVisits.delete(id);
    deleteRecordFromFirestore('scheduledFieldVisits', id).catch(() => {});
    window.dispatchEvent(new CustomEvent('app-realtime-update'));
  },

  async autoMarkMissed(): Promise<void> {
    const today = new Date().toISOString().slice(0, 10);
    const all = await this.getAll();
    const overdue = all.filter(
      v => v.status === 'scheduled' && v.scheduledDate < today
    );
    for (const v of overdue) {
      await this.update(v.id, { status: 'missed' });
    }
  }
};

import { db, markRecordAsDeleted, getDeletedRecordIdsSet } from './db';
import type { ShadowAnalysisRecord } from '../types';
import { saveRecordToFirestore, deleteRecordFromFirestore, fetchCollectionFromFirestore } from './firebase';

export const shadowAnalysisHistoryService = {
  async getReports(): Promise<ShadowAnalysisRecord[]> {
    const deletedIds = await getDeletedRecordIdsSet();
    const localRecords = await db.shadowAnalyses.orderBy('createdAt').reverse().toArray();
    const validLocal = localRecords.filter(r => !deletedIds.has(r.id) && (!r.leadId || !deletedIds.has(r.leadId)));

    const syncRemote = async () => {
      try {
        const remote = await fetchCollectionFromFirestore<ShadowAnalysisRecord>('shadowAnalyses');
        if (remote && remote.length > 0) {
          const freshDeleted = await getDeletedRecordIdsSet();
          const validRemote = remote.filter(r => !freshDeleted.has(r.id) && (!r.leadId || !freshDeleted.has(r.leadId)));
          if (validRemote.length > 0) {
            await db.shadowAnalyses.bulkPut(validRemote);
          }
        }
      } catch (e) {
        console.warn('Background shadowAnalyses sync note:', e);
      }
    };

    if (validLocal.length > 0) {
      syncRemote();
      return validLocal;
    }

    await syncRemote();
    const freshDeleted = await getDeletedRecordIdsSet();
    const refreshed = await db.shadowAnalyses.orderBy('createdAt').reverse().toArray();
    return refreshed.filter(r => !freshDeleted.has(r.id) && (!r.leadId || !freshDeleted.has(r.leadId)));
  },

  async getReportsByLeadId(leadId: string): Promise<ShadowAnalysisRecord[]> {
    const deletedIds = await getDeletedRecordIdsSet();
    if (deletedIds.has(leadId)) return [];

    const localRecords = await db.shadowAnalyses.where('leadId').equals(leadId).toArray();
    const validLocal = localRecords.filter(r => !deletedIds.has(r.id));

    const syncRemote = async () => {
      try {
        const remote = await fetchCollectionFromFirestore<ShadowAnalysisRecord>('shadowAnalyses');
        if (remote && remote.length > 0) {
          const freshDeleted = await getDeletedRecordIdsSet();
          const validRemote = remote.filter(r => !freshDeleted.has(r.id) && r.leadId === leadId);
          if (validRemote.length > 0) {
            await db.shadowAnalyses.bulkPut(validRemote);
          }
        }
      } catch (e) {
        console.warn('Background shadowAnalyses sync note:', e);
      }
    };

    if (validLocal.length > 0) {
      syncRemote();
      return validLocal;
    }

    await syncRemote();
    const freshDeleted = await getDeletedRecordIdsSet();
    const refreshed = await db.shadowAnalyses.where('leadId').equals(leadId).toArray();
    return refreshed.filter(r => !freshDeleted.has(r.id));
  },

  async saveReport(reportData: Omit<ShadowAnalysisRecord, 'id' | 'createdAt'>): Promise<string> {
    const id = 'sa_' + Math.random().toString(36).substring(2, 11);
    const newReport: ShadowAnalysisRecord = {
      ...reportData,
      id,
      createdAt: new Date().toISOString()
    };
    await db.shadowAnalyses.put(newReport);
    saveRecordToFirestore('shadowAnalyses', id, newReport);
    return id;
  },

  async updateReportLeadAndDescription(id: string, leadId?: string, leadName?: string, description?: string): Promise<void> {
    const report = await db.shadowAnalyses.get(id);
    if (report) {
      if (leadId !== undefined) report.leadId = leadId;
      if (leadName !== undefined) report.leadName = leadName;
      if (description !== undefined) report.description = description;
      await db.shadowAnalyses.put(report);
      saveRecordToFirestore('shadowAnalyses', id, report);
    }
  },

  async deleteReport(id: string): Promise<void> {
    await db.shadowAnalyses.delete(id);
    await markRecordAsDeleted(id, 'shadowAnalyses');
    deleteRecordFromFirestore('shadowAnalyses', id);
  }
};

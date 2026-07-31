import { db } from './db';
import type { ShadowAnalysisRecord } from '../types';
import { saveRecordToFirestore, fetchCollectionFromFirestore } from './firebase';

export const shadowAnalysisHistoryService = {
  async getReports(): Promise<ShadowAnalysisRecord[]> {
    const localRecords = await db.shadowAnalyses.orderBy('createdAt').reverse().toArray();

    const syncRemote = async () => {
      try {
        const remote = await fetchCollectionFromFirestore<ShadowAnalysisRecord>('shadowAnalyses');
        if (remote && remote.length > 0) {
          await db.shadowAnalyses.bulkPut(remote);
        }
      } catch (e) {
        console.warn('Background shadowAnalyses sync note:', e);
      }
    };

    if (localRecords.length > 0) {
      syncRemote();
      return localRecords;
    }

    await syncRemote();
    return db.shadowAnalyses.orderBy('createdAt').reverse().toArray();
  },

  async getReportsByLeadId(leadId: string): Promise<ShadowAnalysisRecord[]> {
    const localRecords = await db.shadowAnalyses.where('leadId').equals(leadId).toArray();

    const syncRemote = async () => {
      try {
        const remote = await fetchCollectionFromFirestore<ShadowAnalysisRecord>('shadowAnalyses');
        if (remote && remote.length > 0) {
          await db.shadowAnalyses.bulkPut(remote);
        }
      } catch (e) {
        console.warn('Background shadowAnalyses sync note:', e);
      }
    };

    if (localRecords.length > 0) {
      syncRemote();
      return localRecords;
    }

    await syncRemote();
    return db.shadowAnalyses.where('leadId').equals(leadId).toArray();
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
  }
};

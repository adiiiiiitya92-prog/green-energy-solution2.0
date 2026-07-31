import { db } from './db';
import type { FieldVisitReport } from '../types';
import { saveRecordToFirestore, fetchCollectionFromFirestore } from './firebase';

export const visitService = {
  async getVisitReports(): Promise<FieldVisitReport[]> {
    const localVisits = await db.fieldVisitReports.orderBy('visitedAt').reverse().toArray();

    const syncRemote = async () => {
      try {
        const remoteVisits = await fetchCollectionFromFirestore<FieldVisitReport>('fieldVisitReports');
        if (remoteVisits && remoteVisits.length > 0) {
          await db.fieldVisitReports.bulkPut(remoteVisits);
        }
      } catch (err) {
        console.warn("Background visits sync note:", err);
      }
    };

    if (localVisits.length > 0) {
      syncRemote();
      return localVisits;
    }

    await syncRemote();
    return db.fieldVisitReports.orderBy('visitedAt').reverse().toArray();
  },

  async getVisitReportsByEmployee(employeeId: string): Promise<FieldVisitReport[]> {
    return db.fieldVisitReports.where({ employeeId }).reverse().sortBy('visitedAt');
  },

  async getVisitReportsByLead(leadId: string): Promise<FieldVisitReport[]> {
    return db.fieldVisitReports.where({ leadId }).reverse().sortBy('visitedAt');
  },

  async createVisitReport(vData: Omit<FieldVisitReport, 'id' | 'visitedAt'>): Promise<string> {
    const id = 'visit_' + Math.random().toString(36).substring(2, 11);
    const newVisit: FieldVisitReport = {
      ...vData,
      id,
      visitedAt: new Date().toISOString()
    };
    await db.fieldVisitReports.add(newVisit);
    saveRecordToFirestore('fieldVisitReports', id, newVisit);
    return id;
  },

  async deleteVisitReport(id: string): Promise<void> {
    await db.fieldVisitReports.delete(id);
    try {
      const { deleteRecordFromFirestore } = await import('./firebase');
      await deleteRecordFromFirestore('fieldVisitReports', id);
    } catch (e) {
      console.warn("Firestore delete visit note:", e);
    }
  }
};

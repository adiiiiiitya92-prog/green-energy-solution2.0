import { db, markRecordAsDeleted, getDeletedRecordIdsSet } from './db';
import type { FieldVisitReport } from '../types';
import { saveRecordToFirestore, fetchCollectionFromFirestore } from './firebase';

export const visitService = {
  async getVisitReports(): Promise<FieldVisitReport[]> {
    const deletedIds = await getDeletedRecordIdsSet();
    const localVisits = await db.fieldVisitReports.orderBy('visitedAt').reverse().toArray();
    const validLocal = localVisits.filter(v => !deletedIds.has(v.id) && (!v.leadId || !deletedIds.has(v.leadId)));

    const syncRemote = async () => {
      try {
        const remoteVisits = await fetchCollectionFromFirestore<FieldVisitReport>('fieldVisitReports');
        if (remoteVisits && remoteVisits.length > 0) {
          const freshDeleted = await getDeletedRecordIdsSet();
          const validRemote = remoteVisits.filter(v => !freshDeleted.has(v.id) && (!v.leadId || !freshDeleted.has(v.leadId)));
          if (validRemote.length > 0) {
            await db.fieldVisitReports.bulkPut(validRemote);
          }
        }
      } catch (err) {
        console.warn("Background visits sync note:", err);
      }
    };

    if (validLocal.length > 0) {
      syncRemote();
      return validLocal;
    }

    await syncRemote();
    const freshDeleted = await getDeletedRecordIdsSet();
    const refreshed = await db.fieldVisitReports.orderBy('visitedAt').reverse().toArray();
    return refreshed.filter(v => !freshDeleted.has(v.id) && (!v.leadId || !freshDeleted.has(v.leadId)));
  },

  async getVisitReportsByEmployee(employeeId: string): Promise<FieldVisitReport[]> {
    const deletedIds = await getDeletedRecordIdsSet();
    const visits = await db.fieldVisitReports.where({ employeeId }).reverse().sortBy('visitedAt');
    let validVisits = visits.filter(v => !deletedIds.has(v.id) && (!v.leadId || !deletedIds.has(v.leadId)));

    if (validVisits.length === 0) {
      try {
        const remoteVisits = await fetchCollectionFromFirestore<FieldVisitReport>('fieldVisitReports');
        if (remoteVisits && remoteVisits.length > 0) {
          const freshDeleted = await getDeletedRecordIdsSet();
          const validRemote = remoteVisits.filter(v => !freshDeleted.has(v.id) && (!v.leadId || !freshDeleted.has(v.leadId)));
          if (validRemote.length > 0) {
            await db.fieldVisitReports.bulkPut(validRemote);
            const reRead = await db.fieldVisitReports.where({ employeeId }).reverse().sortBy('visitedAt');
            validVisits = reRead.filter(v => !freshDeleted.has(v.id) && (!v.leadId || !freshDeleted.has(v.leadId)));
          }
        }
      } catch (err) {
        console.warn("Firestore visits sync by employee note:", err);
      }
    }
    return validVisits;
  },

  async getVisitReportsByLead(leadId: string): Promise<FieldVisitReport[]> {
    const deletedIds = await getDeletedRecordIdsSet();
    if (deletedIds.has(leadId)) return [];

    const visits = await db.fieldVisitReports.where({ leadId }).reverse().sortBy('visitedAt');
    let validVisits = visits.filter(v => !deletedIds.has(v.id));

    if (validVisits.length === 0) {
      try {
        const remoteVisits = await fetchCollectionFromFirestore<FieldVisitReport>('fieldVisitReports');
        if (remoteVisits && remoteVisits.length > 0) {
          const freshDeleted = await getDeletedRecordIdsSet();
          const validRemote = remoteVisits.filter(v => !freshDeleted.has(v.id) && v.leadId === leadId);
          if (validRemote.length > 0) {
            await db.fieldVisitReports.bulkPut(validRemote);
            const reRead = await db.fieldVisitReports.where({ leadId }).reverse().sortBy('visitedAt');
            validVisits = reRead.filter(v => !freshDeleted.has(v.id));
          }
        }
      } catch (err) {
        console.warn("Firestore visits sync by lead note:", err);
      }
    }
    return validVisits;
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
    await markRecordAsDeleted(id, 'fieldVisitReports');
    try {
      const { deleteRecordFromFirestore } = await import('./firebase');
      await deleteRecordFromFirestore('fieldVisitReports', id);
    } catch (e) {
      console.warn("Firestore delete visit note:", e);
    }
  }
};

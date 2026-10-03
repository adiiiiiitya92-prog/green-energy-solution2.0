import { db, markRecordAsDeleted, getDeletedRecordIdsSet } from './db';
import type { LeaveRequest, LeaveType, LeaveDurationType, Profile } from '../types';
import { saveRecordToFirestore, fetchCollectionFromFirestore, deleteRecordFromFirestore } from './firebase';

let lastLeaveRemoteSync = 0;
const LEAVE_SYNC_INTERVAL = 30 * 1000; // 30s background sync

export const calculateLeaveDays = (startDate: string, endDate: string, durationType: LeaveDurationType): number => {
  if (!startDate || !endDate) return 1;
  if (durationType === 'first_half' || durationType === 'second_half') return 0.5;
  const start = new Date(startDate);
  const end = new Date(endDate);
  const diffTime = end.getTime() - start.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
  return diffDays > 0 ? diffDays : 1;
};

export const leaveService = {
  async getAllLeaveRequests(): Promise<LeaveRequest[]> {
    const deletedIds = await getDeletedRecordIdsSet();
    const localRequests = await db.leaveRequests.toArray();
    
    // Purge any residual demo requests (only records with lv_demo_ id)
    const hasDemo = localRequests.some(r => r.id.startsWith('lv_demo_'));
    if (hasDemo) {
      this.purgeDemoLeaveRequests().catch(() => {});
    }

    const validLocal = localRequests.filter(
      r => !deletedIds.has(r.id) && !r.id.startsWith('lv_demo_')
    );

    const syncRemote = async () => {
      try {
        lastLeaveRemoteSync = Date.now();
        const remoteRequests = await fetchCollectionFromFirestore<LeaveRequest>('leaveRequests', 2000);
        if (Array.isArray(remoteRequests) && remoteRequests.length > 0) {
          const freshDeleted = await getDeletedRecordIdsSet();
          const validRemote = remoteRequests.filter(
            r => !freshDeleted.has(r.id) && !r.id.startsWith('lv_demo_')
          );
          if (validRemote.length > 0) {
            await db.leaveRequests.bulkPut(validRemote);
          }
        }
      } catch (err) {
        console.warn("Background leave requests sync note:", err);
      }
    };

    if (validLocal.length === 0) {
      await syncRemote();
      const freshDeleted = await getDeletedRecordIdsSet();
      const refreshed = await db.leaveRequests.toArray();
      const list = refreshed.filter(
        r => !freshDeleted.has(r.id) && !r.id.startsWith('lv_demo_')
      );
      return list.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
    }

    if (Date.now() - lastLeaveRemoteSync > LEAVE_SYNC_INTERVAL) {
      syncRemote().catch(() => {});
    }

    return validLocal.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
  },

  async getLeaveRequestsByEmployee(employeeId: string): Promise<LeaveRequest[]> {
    const all = await this.getAllLeaveRequests();
    return all.filter(r => r.employeeId === employeeId);
  },

  async getLeaveRequestById(id: string): Promise<LeaveRequest | undefined> {
    return await db.leaveRequests.get(id);
  },

  async createLeaveRequest(params: {
    employee: Profile;
    leaveType: LeaveType;
    durationType: LeaveDurationType;
    startDate: string;
    endDate: string;
    reason: string;
    contactNumberDuringLeave?: string;
    handoverNotes?: string;
  }): Promise<LeaveRequest> {
    const totalDays = calculateLeaveDays(params.startDate, params.endDate, params.durationType);
    const id = 'lv_' + Math.random().toString(36).substring(2, 11) + '_' + Date.now().toString(36);
    const year = new Date().getFullYear();
    const all = await db.leaveRequests.toArray();
    let maxSeq = 1000;
    for (const r of all) {
      if (r.leaveNumber) {
        const match = r.leaveNumber.match(/(\d+)$/);
        if (match) {
          const num = parseInt(match[1], 10);
          if (num >= maxSeq) maxSeq = num + 1;
        }
      }
    }
    const leaveNumber = `GES-LV-${year}-${maxSeq}`;
    const nowIso = new Date().toISOString();

    const newRequest: LeaveRequest = {
      id,
      leaveNumber,
      employeeId: params.employee.id,
      employeeName: params.employee.fullName,
      employeeEmail: params.employee.email,
      employeePhone: params.employee.phone,
      employeeRole: params.employee.role || 'employee',
      designation: params.employee.designation || (params.employee.role || 'employee').replace(/_/g, ' ').toUpperCase(),
      leaveType: params.leaveType,
      durationType: params.durationType,
      startDate: params.startDate,
      endDate: params.endDate,
      totalDays,
      reason: params.reason.trim(),
      contactNumberDuringLeave: params.contactNumberDuringLeave || params.employee.phone,
      handoverNotes: params.handoverNotes?.trim(),
      status: 'pending',
      appliedAt: nowIso,
      createdAt: nowIso,
      updatedAt: nowIso
    };

    await db.leaveRequests.put(newRequest);
    saveRecordToFirestore('leaveRequests', id, newRequest);
    window.dispatchEvent(new CustomEvent('app-realtime-update'));
    return newRequest;
  },

  async reapplyLeaveRequest(params: {
    previousLeaveId: string;
    employee: Profile;
    leaveType: LeaveType;
    durationType: LeaveDurationType;
    startDate: string;
    endDate: string;
    reason: string;
    contactNumberDuringLeave?: string;
    handoverNotes?: string;
  }): Promise<LeaveRequest> {
    const prev = await db.leaveRequests.get(params.previousLeaveId);
    const year = new Date().getFullYear();
    const all = await db.leaveRequests.toArray();
    let maxSeq = 1000;
    for (const r of all) {
      if (r.leaveNumber) {
        const match = r.leaveNumber.match(/(\d+)$/);
        if (match) {
          const num = parseInt(match[1], 10);
          if (num >= maxSeq) maxSeq = num + 1;
        }
      }
    }
    const leaveNumber = `GES-LV-${year}-${maxSeq}`;
    const nowIso = new Date().toISOString();
    const totalDays = calculateLeaveDays(params.startDate, params.endDate, params.durationType);

    if (prev) {
      await db.leaveRequests.update(prev.id, {
        isReapplied: true,
        updatedAt: nowIso
      });
      const updatedPrev = await db.leaveRequests.get(prev.id);
      if (updatedPrev) {
        saveRecordToFirestore('leaveRequests', prev.id, updatedPrev);
      }
    }

    const newId = 'lv_' + Math.random().toString(36).substring(2, 11) + '_' + Date.now().toString(36);
    const newRequest: LeaveRequest = {
      id: newId,
      leaveNumber,
      employeeId: params.employee.id,
      employeeName: params.employee.fullName,
      employeeEmail: params.employee.email,
      employeePhone: params.employee.phone,
      employeeRole: params.employee.role || 'employee',
      designation: params.employee.designation || (params.employee.role || 'employee').replace(/_/g, ' ').toUpperCase(),
      leaveType: params.leaveType,
      durationType: params.durationType,
      startDate: params.startDate,
      endDate: params.endDate,
      totalDays,
      reason: params.reason.trim(),
      contactNumberDuringLeave: params.contactNumberDuringLeave || params.employee.phone,
      handoverNotes: params.handoverNotes?.trim(),
      status: 'pending',
      appliedAt: nowIso,
      previousLeaveId: params.previousLeaveId,
      isReapplied: false,
      reapplicationCount: ((prev?.reapplicationCount || 0) + 1),
      createdAt: nowIso,
      updatedAt: nowIso
    };

    await db.leaveRequests.put(newRequest);
    saveRecordToFirestore('leaveRequests', newId, newRequest);
    window.dispatchEvent(new CustomEvent('app-realtime-update'));
    return newRequest;
  },

  async approveLeaveRequest(params: {
    leaveId: string;
    reviewerId: string;
    reviewerName: string;
    remarks?: string;
  }): Promise<LeaveRequest> {
    const existing = await db.leaveRequests.get(params.leaveId);
    if (!existing) {
      throw new Error(`Leave application ${params.leaveId} not found.`);
    }

    const nowIso = new Date().toISOString();
    const year = new Date().getFullYear();
    const randNum = Math.floor(1000 + Math.random() * 9000);
    const approvalRef = `GES/HR/LA-${year}-${randNum}`;

    const updated: LeaveRequest = {
      ...existing,
      status: 'approved',
      reviewedAt: nowIso,
      reviewedByUserId: params.reviewerId,
      reviewedByUserName: params.reviewerName,
      approvalRemarks: params.remarks?.trim() || 'Leave application approved by Green Energy Solution Super Admin Management.',
      approvalReferenceNumber: approvalRef,
      approvalLetterGeneratedAt: nowIso,
      approvalLetterValidTill: existing.endDate,
      updatedAt: nowIso
    };

    await db.leaveRequests.put(updated);
    saveRecordToFirestore('leaveRequests', params.leaveId, updated);
    window.dispatchEvent(new CustomEvent('app-realtime-update'));
    return updated;
  },

  async rejectLeaveRequest(params: {
    leaveId: string;
    reviewerId: string;
    reviewerName: string;
    rejectionReason: string;
  }): Promise<LeaveRequest> {
    const existing = await db.leaveRequests.get(params.leaveId);
    if (!existing) {
      throw new Error(`Leave application ${params.leaveId} not found.`);
    }

    if (!params.rejectionReason.trim()) {
      throw new Error('Please provide a reason for rejecting this leave application.');
    }

    const nowIso = new Date().toISOString();
    const updated: LeaveRequest = {
      ...existing,
      status: 'rejected',
      reviewedAt: nowIso,
      reviewedByUserId: params.reviewerId,
      reviewedByUserName: params.reviewerName,
      rejectionReason: params.rejectionReason.trim(),
      updatedAt: nowIso
    };

    await db.leaveRequests.put(updated);
    saveRecordToFirestore('leaveRequests', params.leaveId, updated);
    window.dispatchEvent(new CustomEvent('app-realtime-update'));
    return updated;
  },

  async deleteLeaveRequest(id: string): Promise<void> {
    await markRecordAsDeleted(id, 'leaveRequests');
    await db.leaveRequests.delete(id);
    deleteRecordFromFirestore('leaveRequests', id).catch(() => {});
    window.dispatchEvent(new CustomEvent('app-realtime-update'));
  },

  async purgeDemoLeaveRequests(): Promise<void> {
    try {
      const all = await db.leaveRequests.toArray();
      const demoRecords = all.filter(r => r.id.startsWith('lv_demo_'));
      if (demoRecords.length > 0) {
        for (const dr of demoRecords) {
          await db.leaveRequests.delete(dr.id);
          deleteRecordFromFirestore('leaveRequests', dr.id).catch(() => {});
        }
        window.dispatchEvent(new CustomEvent('app-realtime-update'));
      }
    } catch (e) {
      console.warn("Purge demo leave requests note:", e);
    }
  },

  async seedDemoLeaveRequestsIfEmpty(): Promise<void> {
    // Demo request seeding permanently disabled
    await this.purgeDemoLeaveRequests();
  }
};

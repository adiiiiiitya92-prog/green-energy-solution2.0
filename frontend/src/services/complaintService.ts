import { db } from './db';
import type {
  Complaint,
  CustomerType,
  ComplaintPriority,
  ComplaintStatus,
  FieldVisitTask,
  InventoryRequestItem,
  ComplaintCommunicationNote,
  ComplaintAttachment,
  ComplaintTimelineEntry,
  ComplaintAssignmentHistory,
  ComplaintConfigCategory,
  Lead
} from '../types';
import { saveRecordToFirestore, fetchCollectionFromFirestore, deleteRecordFromFirestore } from './firebase';
import { leadService } from './leadService';

export const DEFAULT_COMPLAINT_CATEGORIES = [
  'Solar Panel Issue',
  'Inverter Issue',
  'Battery Issue',
  'Wiring Issue',
  'Electrical Issue',
  'Installation Issue',
  'Structure Issue',
  'Leakage Issue',
  'Product Defect',
  'Product Damage',
  'Warranty Claim',
  'Service Request',
  'Maintenance Request',
  'Installation Delay',
  'Product Delivery Issue',
  'Billing Issue',
  'Payment Issue',
  'Technical Support',
  'Customer Observation',
  'Inventory Issue',
  'Other'
];

export const DEFAULT_COMPLAINT_STATUSES: ComplaintStatus[] = [
  'New',
  'Complaint Registered',
  'Under Review',
  'Observation',
  'Assigned',
  'In Process',
  'Waiting for Customer',
  'Waiting for Product / Inventory',
  'Waiting for Approval',
  'Site Visit Required',
  'Field Work in Progress',
  'Vendor / Manufacturer Support Required',
  'Resolved',
  'Closed',
  'Reopened'
];

export const complaintService = {
  /**
   * Fetch complaints from Firestore & sync to Dexie local IndexedDB.
   */
  async getComplaints(): Promise<Complaint[]> {
    try {
      const remote = await fetchCollectionFromFirestore<Complaint>('complaints');
      if (remote && remote.length > 0) {
        await db.complaints.bulkPut(remote);
      }
    } catch (err) {
      console.warn("Firestore complaints sync note:", err);
    }

    try {
      return await db.complaints.orderBy('createdAt').reverse().toArray();
    } catch (err) {
      console.warn("Dexie orderBy complaints fallback:", err);
      const all = await db.complaints.toArray();
      return all.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    }
  },

  /**
   * Get single complaint by ID.
   */
  async getComplaintById(id: string): Promise<Complaint | undefined> {
    return db.complaints.get(id);
  },

  /**
   * Check duplicate customer by mobile, email, or name.
   */
  async checkDuplicateCustomer(mobileNumber: string, email?: string, name?: string): Promise<Lead | undefined> {
    const leads = await db.leads.toArray();
    const cleanMobile = mobileNumber.trim();
    const cleanEmail = (email || '').trim().toLowerCase();
    const cleanName = (name || '').trim().toLowerCase();

    return leads.find(l => {
      const mMatch = cleanMobile && l.phoneNumber && l.phoneNumber.trim() === cleanMobile;
      const eMatch = cleanEmail && l.email && l.email.trim().toLowerCase() === cleanEmail;
      const nMatch = cleanName && l.name && l.name.trim().toLowerCase() === cleanName;
      return mMatch || eMatch || (cleanName.length > 3 && nMatch);
    });
  },

  /**
   * Create a new Complaint.
   */
  async createComplaint(
    data: {
      title: string;
      category: string;
      description: string;
      customerType: CustomerType;
      leadId?: string;
      customerName: string;
      mobileNumber: string;
      alternateNumber?: string;
      email?: string;
      address: string;
      city?: string;
      state?: string;
      pincode?: string;
      landmark?: string;
      companyName?: string;
      
      // Solar / Project details
      projectId?: string;
      projectType?: string;
      installationType?: string;
      installedCapacityKw?: string;
      panelDetails?: string;
      inverterDetails?: string;
      batteryDetails?: string;
      installationDate?: string;
      assignedSalesEmployeeId?: string;
      assignedSalesEmployeeName?: string;
      assignedFieldEmployeeId?: string;
      assignedFieldEmployeeName?: string;

      // Internal Details
      complaintAgainstDepartment?: string;
      relatedEmployeeId?: string;
      relatedEmployeeName?: string;

      priority: ComplaintPriority;
      dueDate?: string;
      assignedToId?: string;
      assignedToName?: string;
      assignedToRole?: string;
      assignedDepartment?: string;
      initialAttachments?: { fileName: string; fileType: 'image' | 'pdf' | 'document' | 'video' | 'other'; fileBlobUrl: string }[];
    },
    currentUser: { id: string; fullName: string; role: string }
  ): Promise<Complaint> {
    const now = new Date().toISOString();
    const randNum = Math.floor(1000 + Math.random() * 9000);
    const complaintNumber = `CMP-${new Date().getFullYear()}-${randNum}`;
    const id = 'cmp_' + Math.random().toString(36).substring(2, 11);

    let associatedLeadId = data.leadId;

    // Handle New Customer / Lead flow
    if (data.customerType === 'new_lead' && !associatedLeadId) {
      try {
        const existingCustomer = await this.checkDuplicateCustomer(data.mobileNumber, data.email, data.customerName);
        if (existingCustomer && existingCustomer.id) {
          associatedLeadId = existingCustomer.id;
        } else {
          const cleanTitle = (data.title || '').replace(/^New Complaint Lead:\s*/i, '').trim();
          const cleanDesc = data.address ? `Address: ${data.address}` : (data.description || '');
          const newLeadId = await leadService.createLead({
            name: data.customerName.trim(),
            phoneNumber: data.mobileNumber.trim(),
            email: data.email?.trim() || '',
            requirement: cleanTitle || 'Service Request',
            description: cleanDesc,
            status: 'new',
            createdBy: currentUser.id
          });
          associatedLeadId = newLeadId;
        }
      } catch (e) {
        console.warn("New lead auto-creation note:", e);
      }
    }

    // Check overdue status
    const isOverdue = data.dueDate ? new Date(data.dueDate) < new Date() : false;

    // Initial timeline
    const timeline: ComplaintTimelineEntry[] = [
      {
        id: 'tl_' + Math.random().toString(36).substring(2, 9),
        userId: currentUser.id,
        userName: currentUser.fullName,
        userRole: currentUser.role,
        action: 'Complaint Created',
        details: `Complaint ${complaintNumber} registered under category "${data.category}" with priority "${data.priority}".`,
        timestamp: now
      }
    ];

    // Initial assignment history if assigned
    const assignmentHistory: ComplaintAssignmentHistory[] = [];
    if (data.assignedToId || data.assignedDepartment) {
      assignmentHistory.push({
        id: 'ah_' + Math.random().toString(36).substring(2, 9),
        assignedBy: currentUser.id,
        assignedByName: currentUser.fullName,
        assignedToId: data.assignedToId || '',
        assignedToName: data.assignedToName || data.assignedDepartment || 'Department',
        assignedToRole: data.assignedToRole || '',
        department: data.assignedDepartment || '',
        assignedAt: now,
        reason: 'Initial Complaint Assignment'
      });
      timeline.push({
        id: 'tl_' + Math.random().toString(36).substring(2, 9),
        userId: currentUser.id,
        userName: currentUser.fullName,
        userRole: currentUser.role,
        action: 'Complaint Assigned',
        details: `Assigned to ${data.assignedToName || data.assignedDepartment}`,
        timestamp: now
      });
    }

    // Initial attachments
    const attachments: ComplaintAttachment[] = (data.initialAttachments || []).map(att => ({
      id: 'att_' + Math.random().toString(36).substring(2, 9),
      fileName: att.fileName,
      fileType: att.fileType,
      fileBlobUrl: att.fileBlobUrl,
      uploadedBy: currentUser.id,
      uploadedByName: currentUser.fullName,
      uploadedAt: now
    }));

    const newComplaint: Complaint = {
      id,
      complaintNumber,
      title: data.title.trim(),
      category: data.category,
      description: data.description.trim(),
      customerType: data.customerType,
      leadId: associatedLeadId,
      customerName: data.customerName.trim(),
      mobileNumber: data.mobileNumber.trim(),
      alternateNumber: data.alternateNumber?.trim(),
      email: data.email?.trim(),
      address: data.address.trim(),
      city: data.city?.trim(),
      state: data.state?.trim(),
      pincode: data.pincode?.trim(),
      landmark: data.landmark?.trim(),
      companyName: data.companyName?.trim(),

      projectId: data.projectId,
      projectType: data.projectType,
      installationType: data.installationType,
      installedCapacityKw: data.installedCapacityKw,
      panelDetails: data.panelDetails,
      inverterDetails: data.inverterDetails,
      batteryDetails: data.batteryDetails,
      installationDate: data.installationDate,
      assignedSalesEmployeeId: data.assignedSalesEmployeeId,
      assignedSalesEmployeeName: data.assignedSalesEmployeeName,
      assignedFieldEmployeeId: data.assignedFieldEmployeeId,
      assignedFieldEmployeeName: data.assignedFieldEmployeeName,

      complaintAgainstDepartment: data.complaintAgainstDepartment,
      relatedEmployeeId: data.relatedEmployeeId,
      relatedEmployeeName: data.relatedEmployeeName,

      priority: data.priority,
      status: (data.assignedToId || data.assignedDepartment) ? 'Assigned' : 'New',

      assignedToId: data.assignedToId,
      assignedToName: data.assignedToName,
      assignedToRole: data.assignedToRole,
      assignedDepartment: data.assignedDepartment,
      assignmentHistory,

      dueDate: data.dueDate,
      isOverdue,

      fieldVisits: [],
      inventoryRequests: [],
      communications: [],
      attachments,
      timeline,

      createdByUserId: currentUser.id,
      createdByUserName: currentUser.fullName,
      createdByUserRole: currentUser.role,
      createdAt: now,
      updatedAt: now
    };

    await db.complaints.put(newComplaint);
    saveRecordToFirestore('complaints', id, newComplaint);
    window.dispatchEvent(new CustomEvent('app-realtime-update'));
    return newComplaint;
  },

  /**
   * Update generic fields & append to audit timeline.
   */
  async updateComplaint(
    id: string,
    updates: Partial<Complaint>,
    currentUser: { id: string; fullName: string; role: string },
    actionDescription?: string
  ): Promise<Complaint> {
    const existing = await db.complaints.get(id);
    if (!existing) throw new Error("Complaint not found");

    const now = new Date().toISOString();
    const updatedTimeline = existing.timeline ? [...existing.timeline] : [];

    if (actionDescription) {
      updatedTimeline.push({
        id: 'tl_' + Math.random().toString(36).substring(2, 9),
        userId: currentUser.id,
        userName: currentUser.fullName,
        userRole: currentUser.role,
        action: 'Complaint Updated',
        details: actionDescription,
        timestamp: now
      });
    }

    if (updates.status && updates.status !== existing.status) {
      updatedTimeline.push({
        id: 'tl_' + Math.random().toString(36).substring(2, 9),
        userId: currentUser.id,
        userName: currentUser.fullName,
        userRole: currentUser.role,
        action: 'Status Changed',
        details: `Status changed from "${existing.status}" to "${updates.status}"`,
        timestamp: now
      });
    }

    if (updates.priority && updates.priority !== existing.priority) {
      updatedTimeline.push({
        id: 'tl_' + Math.random().toString(36).substring(2, 9),
        userId: currentUser.id,
        userName: currentUser.fullName,
        userRole: currentUser.role,
        action: 'Priority Changed',
        details: `Priority changed from "${existing.priority}" to "${updates.priority}"`,
        timestamp: now
      });
    }

    const dueDateCheck = updates.dueDate !== undefined ? updates.dueDate : existing.dueDate;
    const isOverdue = dueDateCheck ? new Date(dueDateCheck) < new Date() && existing.status !== 'Resolved' && existing.status !== 'Closed' : false;

    const updatedComplaint: Complaint = {
      ...existing,
      ...updates,
      isOverdue,
      timeline: updatedTimeline,
      updatedAt: now
    };

    await db.complaints.put(updatedComplaint);
    saveRecordToFirestore('complaints', id, updatedComplaint);
    window.dispatchEvent(new CustomEvent('app-realtime-update'));
    return updatedComplaint;
  },

  /**
   * Assign or Reassign Complaint.
   */
  async assignComplaint(
    id: string,
    assignedToId: string,
    assignedToName: string,
    assignedToRole?: string,
    department?: string,
    reason?: string,
    currentUser?: { id: string; fullName: string; role: string }
  ): Promise<Complaint> {
    const existing = await db.complaints.get(id);
    if (!existing) throw new Error("Complaint not found");

    const now = new Date().toISOString();
    const history = existing.assignmentHistory ? [...existing.assignmentHistory] : [];
    
    history.push({
      id: 'ah_' + Math.random().toString(36).substring(2, 9),
      assignedBy: currentUser?.id || 'system',
      assignedByName: currentUser?.fullName || 'Admin',
      assignedToId,
      assignedToName,
      assignedToRole,
      department,
      assignedAt: now,
      reason: reason || 'Complaint Assignment'
    });

    const timeline = existing.timeline ? [...existing.timeline] : [];
    timeline.push({
      id: 'tl_' + Math.random().toString(36).substring(2, 9),
      userId: currentUser?.id || 'system',
      userName: currentUser?.fullName || 'Admin',
      userRole: currentUser?.role || 'admin',
      action: 'Reassigned Complaint',
      details: `Assigned to ${assignedToName} (${department || 'Department'}). Reason: ${reason || 'N/A'}`,
      timestamp: now
    });

    const newStatus = (existing.status === 'New' || existing.status === 'Complaint Registered') ? 'Assigned' : existing.status;

    const updated: Complaint = {
      ...existing,
      assignedToId,
      assignedToName,
      assignedToRole,
      assignedDepartment: department,
      status: newStatus,
      assignmentHistory: history,
      timeline,
      updatedAt: now
    };

    await db.complaints.put(updated);
    saveRecordToFirestore('complaints', id, updated);
    window.dispatchEvent(new CustomEvent('app-realtime-update'));
    return updated;
  },

  /**
   * Schedule a Field Visit for the complaint.
   */
  async createFieldVisit(
    complaintId: string,
    visitData: {
      assignedFieldEmployeeId: string;
      assignedFieldEmployeeName: string;
      visitDate: string;
      visitTime?: string;
      expectedCompletionDate?: string;
      instructions?: string;
    },
    currentUser: { id: string; fullName: string; role: string }
  ): Promise<Complaint> {
    const existing = await db.complaints.get(complaintId);
    if (!existing) throw new Error("Complaint not found");

    const now = new Date().toISOString();
    const newVisit: FieldVisitTask = {
      id: 'fv_' + Math.random().toString(36).substring(2, 9),
      assignedFieldEmployeeId: visitData.assignedFieldEmployeeId,
      assignedFieldEmployeeName: visitData.assignedFieldEmployeeName,
      visitDate: visitData.visitDate,
      visitTime: visitData.visitTime,
      expectedCompletionDate: visitData.expectedCompletionDate,
      instructions: visitData.instructions,
      status: 'Scheduled',
      createdAt: now
    };

    const fieldVisits = existing.fieldVisits ? [...existing.fieldVisits, newVisit] : [newVisit];
    const timeline = existing.timeline ? [...existing.timeline] : [];
    
    timeline.push({
      id: 'tl_' + Math.random().toString(36).substring(2, 9),
      userId: currentUser.id,
      userName: currentUser.fullName,
      userRole: currentUser.role,
      action: 'Field Visit Scheduled',
      details: `Scheduled field visit for ${visitData.assignedFieldEmployeeName} on ${visitData.visitDate} ${visitData.visitTime || ''}`,
      timestamp: now
    });

    const updated: Complaint = {
      ...existing,
      assignedFieldEmployeeId: visitData.assignedFieldEmployeeId,
      assignedFieldEmployeeName: visitData.assignedFieldEmployeeName,
      fieldVisits,
      status: 'Site Visit Required',
      timeline,
      updatedAt: now
    };

    await db.complaints.put(updated);
    saveRecordToFirestore('complaints', complaintId, updated);
    window.dispatchEvent(new CustomEvent('app-realtime-update'));
    return updated;
  },

  /**
   * Update Field Visit work notes, photos, or mark complete.
   */
  async updateFieldVisit(
    complaintId: string,
    visitId: string,
    visitUpdates: {
      status?: 'Scheduled' | 'In Progress' | 'Completed' | 'Cancelled';
      workNotes?: string;
      beforePhotos?: (Blob | string)[];
      afterPhotos?: (Blob | string)[];
      additionalNotes?: string;
    },
    currentUser: { id: string; fullName: string; role: string }
  ): Promise<Complaint> {
    const existing = await db.complaints.get(complaintId);
    if (!existing) throw new Error("Complaint not found");

    const now = new Date().toISOString();
    const visits = existing.fieldVisits ? [...existing.fieldVisits] : [];
    const idx = visits.findIndex(v => v.id === visitId);

    if (idx !== -1) {
      visits[idx] = {
        ...visits[idx],
        ...visitUpdates,
        completedAt: visitUpdates.status === 'Completed' ? now : visits[idx].completedAt
      };
    }

    const timeline = existing.timeline ? [...existing.timeline] : [];
    timeline.push({
      id: 'tl_' + Math.random().toString(36).substring(2, 9),
      userId: currentUser.id,
      userName: currentUser.fullName,
      userRole: currentUser.role,
      action: 'Field Visit Updated',
      details: `Field visit status: ${visitUpdates.status || 'Updated'}. Notes: ${visitUpdates.workNotes || 'N/A'}`,
      timestamp: now
    });

    let newStatus = existing.status;
    if (visitUpdates.status === 'In Progress') newStatus = 'Field Work in Progress';
    if (visitUpdates.status === 'Completed' && existing.status !== 'Resolved' && existing.status !== 'Closed') {
      newStatus = 'In Process';
    }

    const updated: Complaint = {
      ...existing,
      fieldVisits: visits,
      status: newStatus,
      timeline,
      updatedAt: now
    };

    await db.complaints.put(updated);
    saveRecordToFirestore('complaints', complaintId, updated);
    window.dispatchEvent(new CustomEvent('app-realtime-update'));
    return updated;
  },

  /**
   * Request Replacement Inventory Item.
   */
  async requestInventory(
    complaintId: string,
    data: {
      productId: string;
      productName: string;
      requestedQty: number;
      notes?: string;
    },
    currentUser: { id: string; fullName: string; role: string }
  ): Promise<Complaint> {
    const existing = await db.complaints.get(complaintId);
    if (!existing) throw new Error("Complaint not found");

    const now = new Date().toISOString();
    const newItem: InventoryRequestItem = {
      id: 'invreq_' + Math.random().toString(36).substring(2, 9),
      productId: data.productId,
      productName: data.productName,
      requestedQty: data.requestedQty,
      status: 'Requested',
      requestedBy: currentUser.fullName,
      requestedAt: now,
      notes: data.notes
    };

    const requests = existing.inventoryRequests ? [...existing.inventoryRequests, newItem] : [newItem];
    const timeline = existing.timeline ? [...existing.timeline] : [];

    timeline.push({
      id: 'tl_' + Math.random().toString(36).substring(2, 9),
      userId: currentUser.id,
      userName: currentUser.fullName,
      userRole: currentUser.role,
      action: 'Inventory Requested',
      details: `Requested ${data.requestedQty}x ${data.productName} for complaint resolution.`,
      timestamp: now
    });

    const updated: Complaint = {
      ...existing,
      inventoryRequests: requests,
      status: 'Waiting for Product / Inventory',
      timeline,
      updatedAt: now
    };

    await db.complaints.put(updated);
    saveRecordToFirestore('complaints', complaintId, updated);
    window.dispatchEvent(new CustomEvent('app-realtime-update'));
    return updated;
  },

  /**
   * Update Inventory Request Status (Approve/Issue/Reject/Return).
   */
  async updateInventoryRequestStatus(
    complaintId: string,
    requestId: string,
    status: 'Approved' | 'Issued' | 'Rejected' | 'Returned',
    details: { approvedQty?: number; issuedQty?: number; serialNumber?: string; notes?: string },
    currentUser: { id: string; fullName: string; role: string }
  ): Promise<Complaint> {
    const existing = await db.complaints.get(complaintId);
    if (!existing) throw new Error("Complaint not found");

    const now = new Date().toISOString();
    const requests = existing.inventoryRequests ? [...existing.inventoryRequests] : [];
    const idx = requests.findIndex(r => r.id === requestId);

    if (idx !== -1) {
      requests[idx] = {
        ...requests[idx],
        status,
        approvedQty: details.approvedQty !== undefined ? details.approvedQty : requests[idx].approvedQty,
        issuedQty: details.issuedQty !== undefined ? details.issuedQty : requests[idx].issuedQty,
        serialNumber: details.serialNumber || requests[idx].serialNumber,
        issuedAt: status === 'Issued' ? now : requests[idx].issuedAt,
        notes: details.notes || requests[idx].notes
      };
    }

    const timeline = existing.timeline ? [...existing.timeline] : [];
    timeline.push({
      id: 'tl_' + Math.random().toString(36).substring(2, 9),
      userId: currentUser.id,
      userName: currentUser.fullName,
      userRole: currentUser.role,
      action: `Inventory ${status}`,
      details: `Material ${requests[idx]?.productName || ''} marked as ${status}. ${details.serialNumber ? 'S/N: ' + details.serialNumber : ''}`,
      timestamp: now
    });

    const updated: Complaint = {
      ...existing,
      inventoryRequests: requests,
      timeline,
      updatedAt: now
    };

    await db.complaints.put(updated);
    saveRecordToFirestore('complaints', complaintId, updated);
    window.dispatchEvent(new CustomEvent('app-realtime-update'));
    return updated;
  },

  /**
   * Add Communication Note / Follow-up.
   */
  async addCommunicationNote(
    complaintId: string,
    noteData: {
      type: 'internal_note' | 'Call' | 'WhatsApp' | 'Email' | 'SMS' | 'Site Visit';
      summary: string;
      nextFollowUpDate?: string;
      isInternalOnly: boolean;
    },
    currentUser: { id: string; fullName: string; role: string }
  ): Promise<Complaint> {
    const existing = await db.complaints.get(complaintId);
    if (!existing) throw new Error("Complaint not found");

    const now = new Date().toISOString();
    const newNote: ComplaintCommunicationNote = {
      id: 'cn_' + Math.random().toString(36).substring(2, 9),
      type: noteData.type,
      communicatedBy: currentUser.id,
      communicatedByName: currentUser.fullName,
      communicatedByRole: currentUser.role,
      summary: noteData.summary,
      nextFollowUpDate: noteData.nextFollowUpDate,
      isInternalOnly: noteData.isInternalOnly,
      createdAt: now
    };

    const communications = existing.communications ? [...existing.communications, newNote] : [newNote];
    const timeline = existing.timeline ? [...existing.timeline] : [];

    timeline.push({
      id: 'tl_' + Math.random().toString(36).substring(2, 9),
      userId: currentUser.id,
      userName: currentUser.fullName,
      userRole: currentUser.role,
      action: noteData.isInternalOnly ? 'Internal Note Added' : 'Customer Communication Logged',
      details: `[${noteData.type}]: ${noteData.summary.substring(0, 80)}${noteData.summary.length > 80 ? '...' : ''}`,
      timestamp: now
    });

    const updated: Complaint = {
      ...existing,
      communications,
      timeline,
      updatedAt: now
    };

    await db.complaints.put(updated);
    saveRecordToFirestore('complaints', complaintId, updated);
    window.dispatchEvent(new CustomEvent('app-realtime-update'));
    return updated;
  },

  /**
   * Add Attachment to Complaint.
   */
  async addAttachment(
    complaintId: string,
    attachment: {
      fileName: string;
      fileType: 'image' | 'pdf' | 'document' | 'video' | 'other';
      fileBlobUrl: string;
    },
    currentUser: { id: string; fullName: string; role: string }
  ): Promise<Complaint> {
    const existing = await db.complaints.get(complaintId);
    if (!existing) throw new Error("Complaint not found");

    const now = new Date().toISOString();
    const newAtt: ComplaintAttachment = {
      id: 'att_' + Math.random().toString(36).substring(2, 9),
      fileName: attachment.fileName,
      fileType: attachment.fileType,
      fileBlobUrl: attachment.fileBlobUrl,
      uploadedBy: currentUser.id,
      uploadedByName: currentUser.fullName,
      uploadedAt: now
    };

    const attachments = existing.attachments ? [...existing.attachments, newAtt] : [newAtt];
    const timeline = existing.timeline ? [...existing.timeline] : [];

    timeline.push({
      id: 'tl_' + Math.random().toString(36).substring(2, 9),
      userId: currentUser.id,
      userName: currentUser.fullName,
      userRole: currentUser.role,
      action: 'Attachment Uploaded',
      details: `File uploaded: ${attachment.fileName}`,
      timestamp: now
    });

    const updated: Complaint = {
      ...existing,
      attachments,
      timeline,
      updatedAt: now
    };

    await db.complaints.put(updated);
    saveRecordToFirestore('complaints', complaintId, updated);
    window.dispatchEvent(new CustomEvent('app-realtime-update'));
    return updated;
  },

  /**
   * Resolve Complaint.
   */
  async resolveComplaint(
    complaintId: string,
    resolutionData: {
      resolutionSummary: string;
      workPerformed?: string;
      productsReplacedSummary?: string;
    },
    currentUser: { id: string; fullName: string; role: string }
  ): Promise<Complaint> {
    const existing = await db.complaints.get(complaintId);
    if (!existing) throw new Error("Complaint not found");

    const now = new Date().toISOString();
    const timeline = existing.timeline ? [...existing.timeline] : [];

    timeline.push({
      id: 'tl_' + Math.random().toString(36).substring(2, 9),
      userId: currentUser.id,
      userName: currentUser.fullName,
      userRole: currentUser.role,
      action: 'Complaint Resolved',
      details: `Resolved: ${resolutionData.resolutionSummary}`,
      timestamp: now
    });

    const updated: Complaint = {
      ...existing,
      status: 'Resolved',
      resolutionSummary: resolutionData.resolutionSummary,
      workPerformed: resolutionData.workPerformed,
      productsReplacedSummary: resolutionData.productsReplacedSummary,
      resolvedAt: now,
      resolvedByUserId: currentUser.id,
      resolvedByUserName: currentUser.fullName,
      isOverdue: false,
      timeline,
      updatedAt: now
    };

    await db.complaints.put(updated);
    saveRecordToFirestore('complaints', complaintId, updated);
    window.dispatchEvent(new CustomEvent('app-realtime-update'));
    return updated;
  },

  /**
   * Close Complaint (permanently close & collect feedback).
   */
  async closeComplaint(
    complaintId: string,
    feedbackData: {
      customerFeedback?: string;
      customerRating?: 1 | 2 | 3 | 4 | 5;
    },
    currentUser: { id: string; fullName: string; role: string }
  ): Promise<Complaint> {
    const existing = await db.complaints.get(complaintId);
    if (!existing) throw new Error("Complaint not found");

    const now = new Date().toISOString();
    const timeline = existing.timeline ? [...existing.timeline] : [];

    timeline.push({
      id: 'tl_' + Math.random().toString(36).substring(2, 9),
      userId: currentUser.id,
      userName: currentUser.fullName,
      userRole: currentUser.role,
      action: 'Complaint Closed',
      details: `Closed by ${currentUser.fullName}. Rating: ${feedbackData.customerRating ? feedbackData.customerRating + '/5' : 'N/A'}`,
      timestamp: now
    });

    const updated: Complaint = {
      ...existing,
      status: 'Closed',
      customerFeedback: feedbackData.customerFeedback,
      customerRating: feedbackData.customerRating,
      closedAt: now,
      closedByUserId: currentUser.id,
      closedByUserName: currentUser.fullName,
      isOverdue: false,
      timeline,
      updatedAt: now
    };

    await db.complaints.put(updated);
    saveRecordToFirestore('complaints', complaintId, updated);
    window.dispatchEvent(new CustomEvent('app-realtime-update'));
    return updated;
  },

  /**
   * Reopen Complaint.
   */
  async reopenComplaint(
    complaintId: string,
    reason: string,
    currentUser: { id: string; fullName: string; role: string }
  ): Promise<Complaint> {
    const existing = await db.complaints.get(complaintId);
    if (!existing) throw new Error("Complaint not found");

    const now = new Date().toISOString();
    const timeline = existing.timeline ? [...existing.timeline] : [];

    timeline.push({
      id: 'tl_' + Math.random().toString(36).substring(2, 9),
      userId: currentUser.id,
      userName: currentUser.fullName,
      userRole: currentUser.role,
      action: 'Complaint Reopened',
      details: `Reopened by ${currentUser.fullName}. Reason: ${reason}`,
      timestamp: now
    });

    const updated: Complaint = {
      ...existing,
      status: 'Reopened',
      reopenCount: (existing.reopenCount || 0) + 1,
      reopenedAt: now,
      timeline,
      updatedAt: now
    };

    await db.complaints.put(updated);
    saveRecordToFirestore('complaints', complaintId, updated);
    window.dispatchEvent(new CustomEvent('app-realtime-update'));
    return updated;
  },

  /**
   * Delete complaint with permission.
   */
  async deleteComplaint(id: string): Promise<void> {
    await db.complaints.delete(id);
    try {
      await deleteRecordFromFirestore('complaints', id);
    } catch (e) {
      console.warn("Firestore delete complaint note:", e);
    }
    window.dispatchEvent(new CustomEvent('app-realtime-update'));
  },

  /**
   * Custom Categories Config for Super Admin
   */
  async getCategories(): Promise<ComplaintConfigCategory[]> {
    const local = await db.complaintConfigCategories.toArray();
    if (local.length === 0) {
      const initial = DEFAULT_COMPLAINT_CATEGORIES.map(c => ({
        id: 'cat_' + c.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase(),
        name: c,
        isCustom: false
      }));
      await db.complaintConfigCategories.bulkPut(initial);
      return initial;
    }
    return local;
  },

  async addCategory(name: string): Promise<ComplaintConfigCategory> {
    const trimmed = name.trim();
    if (!trimmed) throw new Error("Category name required");
    const id = 'cat_custom_' + Math.random().toString(36).substring(2, 9);
    const cat: ComplaintConfigCategory = { id, name: trimmed, isCustom: true };
    await db.complaintConfigCategories.put(cat);
    saveRecordToFirestore('complaintConfigCategories', id, cat);
    return cat;
  }
};

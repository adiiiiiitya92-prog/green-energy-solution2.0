import Dexie, { type Table } from 'dexie';
import type {
  Profile,
  Lead,
  Quotation,
  OrderConfirmation,
  ClientDocument,
  ClientRegistration,
  InstallationPhoto,
  ReleaseDocument,
  FieldVisitReport,
  Product,
  Challan,
  ShadowAnalysisRecord,
  DeletionRequest,
  B2BBusiness,
  StockTransaction,
  Package,
  Complaint,
  ComplaintConfigCategory
} from '../types';

export interface DeletedRecord {
  id: string;
  collectionName: string;
  deletedAt: string;
}

export class SolarCRMDatabase extends Dexie {
  profiles!: Table<Profile>;
  leads!: Table<Lead>;
  quotations!: Table<Quotation>;
  orderConfirmations!: Table<OrderConfirmation>;
  clientDocuments!: Table<ClientDocument>;
  clientRegistrations!: Table<ClientRegistration>;
  installationPhotos!: Table<InstallationPhoto>;
  releaseDocuments!: Table<ReleaseDocument>;
  fieldVisitReports!: Table<FieldVisitReport>;
  products!: Table<Product>;
  challans!: Table<Challan>;
  shadowAnalyses!: Table<ShadowAnalysisRecord>;
  deletedRecords!: Table<DeletedRecord>;
  deletionRequests!: Table<DeletionRequest>;
  b2bBusinesses!: Table<B2BBusiness>;
  stockTransactions!: Table<StockTransaction>;
  packages!: Table<Package>;
  complaints!: Table<Complaint>;
  complaintConfigCategories!: Table<ComplaintConfigCategory>;

  constructor() {
    super('GreenEnergyCRMDatabase');
    this.version(3).stores({
      profiles: 'id, role, isActive',
      leads: 'id, assignedEmployeeId, status, createdAt',
      quotations: 'id, leadId, quotationNumber, createdAt',
      orderConfirmations: 'id, leadId, quotationId',
      clientDocuments: 'id, leadId, docType',
      clientRegistrations: 'leadId',
      installationPhotos: 'id, leadId, photoType',
      releaseDocuments: 'id, leadId',
      fieldVisitReports: 'id, employeeId, leadId, visitedAt',
      products: 'id, name, category',
      challans: 'id, leadId, assignedEmployeeId, challanNumber, createdAt',
      shadowAnalyses: 'id, leadId, projectName, createdAt'
    });
    this.version(4).stores({
      profiles: 'id, role, isActive',
      leads: 'id, assignedEmployeeId, status, createdAt',
      quotations: 'id, leadId, quotationNumber, createdAt',
      orderConfirmations: 'id, leadId, quotationId',
      clientDocuments: 'id, leadId, docType',
      clientRegistrations: 'leadId',
      installationPhotos: 'id, leadId, photoType',
      releaseDocuments: 'id, leadId',
      fieldVisitReports: 'id, employeeId, leadId, visitedAt',
      products: 'id, name, category',
      challans: 'id, leadId, assignedEmployeeId, challanNumber, createdAt',
      shadowAnalyses: 'id, leadId, projectName, createdAt',
      deletedRecords: 'id, collectionName, deletedAt'
    });
    this.version(5).stores({
      profiles: 'id, role, isActive',
      leads: 'id, assignedEmployeeId, status, createdAt',
      quotations: 'id, leadId, quotationNumber, createdAt',
      orderConfirmations: 'id, leadId, quotationId',
      clientDocuments: 'id, leadId, docType',
      clientRegistrations: 'leadId',
      installationPhotos: 'id, leadId, photoType',
      releaseDocuments: 'id, leadId',
      fieldVisitReports: 'id, employeeId, leadId, visitedAt',
      products: 'id, name, category',
      challans: 'id, leadId, assignedEmployeeId, challanNumber, createdAt',
      shadowAnalyses: 'id, leadId, projectName, createdAt',
      deletedRecords: 'id, collectionName, deletedAt',
      deletionRequests: 'id, status, entityType, requestedByUserId, requestedAt'
    });
    this.version(6).stores({
      profiles: 'id, role, isActive',
      leads: 'id, assignedEmployeeId, status, createdAt',
      quotations: 'id, leadId, quotationNumber, createdAt',
      orderConfirmations: 'id, leadId, quotationId',
      clientDocuments: 'id, leadId, docType',
      clientRegistrations: 'leadId',
      installationPhotos: 'id, leadId, photoType',
      releaseDocuments: 'id, leadId',
      fieldVisitReports: 'id, employeeId, leadId, visitedAt',
      products: 'id, name, category',
      challans: 'id, leadId, assignedEmployeeId, challanNumber, createdAt',
      shadowAnalyses: 'id, leadId, projectName, createdAt',
      deletedRecords: 'id, collectionName, deletedAt',
      deletionRequests: 'id, status, entityType, requestedByUserId, requestedAt',
      b2bBusinesses: 'id, businessName, mobileNumber, gstNumber, contactPerson, createdAt',
      stockTransactions: 'id, challanId, challanNumber, productId, timestamp'
    });
    this.version(7).stores({
      profiles: 'id, role, isActive',
      leads: 'id, assignedEmployeeId, status, createdAt',
      quotations: 'id, leadId, quotationNumber, createdAt',
      orderConfirmations: 'id, leadId, quotationId',
      clientDocuments: 'id, leadId, docType',
      clientRegistrations: 'leadId',
      installationPhotos: 'id, leadId, photoType',
      releaseDocuments: 'id, leadId',
      fieldVisitReports: 'id, employeeId, leadId, visitedAt',
      products: 'id, name, category',
      challans: 'id, leadId, assignedEmployeeId, challanNumber, createdAt',
      shadowAnalyses: 'id, leadId, projectName, createdAt',
      deletedRecords: 'id, collectionName, deletedAt',
      deletionRequests: 'id, status, entityType, requestedByUserId, requestedAt',
      b2bBusinesses: 'id, businessName, mobileNumber, gstNumber, contactPerson, createdAt',
      stockTransactions: 'id, challanId, challanNumber, productId, timestamp',
      packages: 'id, name, code, status, createdAt'
    });
    this.version(8).stores({
      profiles: 'id, role, isActive',
      leads: 'id, assignedEmployeeId, status, createdAt',
      quotations: 'id, leadId, quotationNumber, createdAt',
      orderConfirmations: 'id, leadId, quotationId',
      clientDocuments: 'id, leadId, docType',
      clientRegistrations: 'leadId',
      installationPhotos: 'id, leadId, photoType',
      releaseDocuments: 'id, leadId',
      fieldVisitReports: 'id, employeeId, leadId, visitedAt',
      products: 'id, name, category',
      challans: 'id, leadId, assignedEmployeeId, challanNumber, createdAt',
      shadowAnalyses: 'id, leadId, projectName, createdAt',
      deletedRecords: 'id, collectionName, deletedAt',
      deletionRequests: 'id, status, entityType, requestedByUserId, requestedAt',
      b2bBusinesses: 'id, businessName, mobileNumber, gstNumber, contactPerson, createdAt',
      stockTransactions: 'id, challanId, challanNumber, productId, timestamp',
      packages: 'id, name, code, status, createdAt',
      complaints: 'id, complaintNumber, status, priority, customerType, leadId, assignedToId, assignedDepartment, isOverdue, createdAt',
      complaintConfigCategories: 'id, name'
    });
  }
}

export const db = new SolarCRMDatabase();

export async function markRecordAsDeleted(id: string, collectionName: string): Promise<void> {
  if (!id) return;
  const deletedObj: DeletedRecord = {
    id,
    collectionName,
    deletedAt: new Date().toISOString()
  };
  try {
    await db.deletedRecords.put(deletedObj);
  } catch (err) {
    console.warn(`Error marking ${collectionName}/${id} as deleted:`, err);
  }
  try {
    const { saveRecordToFirestore } = await import('./firebase');
    saveRecordToFirestore('deletedRecords', id, deletedObj).catch(() => {});
  } catch (_) {}
}

export async function getDeletedRecordIdsSet(): Promise<Set<string>> {
  try {
    const list = await db.deletedRecords.toArray();
    return new Set(list.map(item => item.id));
  } catch (_) {
    return new Set();
  }
}

export const DEFAULT_DEMO_PROFILES: Profile[] = [
  {
    id: 'admin_super',
    fullName: 'System Administrator',
    phone: '9876543210',
    role: 'super_admin',
    email: 'admin@greenenergysolution.com',
    aadhaarNumber: '123456789012',
    panNumber: 'ABCDE1234F',
    joiningDate: new Date().toISOString().split('T')[0],
    designation: 'Managing Director',
    isActive: true,
    isActivated: true,
    password: 'admin123',
    createdAt: new Date().toISOString()
  },
  {
    id: 'admin_ops',
    fullName: 'Operations Admin',
    phone: '9876543211',
    role: 'admin',
    email: 'admin@greenenergy.com',
    aadhaarNumber: '123456789013',
    panNumber: 'ABCDE1234G',
    joiningDate: new Date().toISOString().split('T')[0],
    designation: 'Operations Manager',
    isActive: true,
    isActivated: true,
    password: 'admin123',
    createdAt: new Date().toISOString()
  },
  {
    id: 'emp_field',
    fullName: 'Field Executive',
    phone: '9876543220',
    role: 'field_employee',
    email: 'field@greenenergy.com',
    aadhaarNumber: '123456789014',
    panNumber: 'ABCDE1234H',
    joiningDate: new Date().toISOString().split('T')[0],
    designation: 'Field Inspector',
    isActive: true,
    isActivated: true,
    password: 'field123',
    createdAt: new Date().toISOString()
  },
  {
    id: 'mgr_inventory',
    fullName: 'Inventory Manager',
    phone: '9876543230',
    role: 'inventory_manager',
    email: 'inventory@greenenergy.com',
    aadhaarNumber: '123456789015',
    panNumber: 'ABCDE1234I',
    joiningDate: new Date().toISOString().split('T')[0],
    designation: 'Store & Stock Manager',
    isActive: true,
    isActivated: true,
    password: 'inv123',
    createdAt: new Date().toISOString()
  },
  {
    id: 'dealer_demo',
    fullName: 'Authorized Dealer',
    phone: '9876543240',
    role: 'dealer',
    email: 'dealer@greenenergy.com',
    aadhaarNumber: '123456789016',
    panNumber: 'ABCDE1234J',
    joiningDate: new Date().toISOString().split('T')[0],
    designation: 'Dealer Partner',
    isActive: true,
    isActivated: true,
    password: 'dealer123',
    createdAt: new Date().toISOString()
  }
];

export async function ensureDemoProfilesExist() {
  try {
    for (const p of DEFAULT_DEMO_PROFILES) {
      const existing = await db.profiles.get(p.id);
      if (!existing) {
        await db.profiles.put(p);
      }
    }
  } catch (err) {
    console.warn("ensureDemoProfilesExist error:", err);
  }
}

/**
 * Clears all local mock data across all tables and seeds only clean initial role accounts.
 */
export async function seedDemoData(_force = false) {
  const profileCount = await db.profiles.count();
  if (!_force && profileCount > 0) {
    await ensureDemoProfilesExist();
    return; // Preserve user data, leads & quotations across normal reloads
  }

  // Clear quotation & session cache in localStorage when force-resetting
  if (_force) {
    try {
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (key.startsWith('quotation_') || key.startsWith('ges_'))) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach(k => localStorage.removeItem(k));
    } catch (_) {}
  }

  await db.transaction('rw', [
    db.profiles,
    db.leads,
    db.quotations,
    db.orderConfirmations,
    db.clientDocuments,
    db.clientRegistrations,
    db.installationPhotos,
    db.releaseDocuments,
    db.fieldVisitReports,
    db.products,
    db.challans,
    db.shadowAnalyses,
    db.deletedRecords
  ], async () => {
    await db.leads.clear();
    await db.quotations.clear();
    await db.orderConfirmations.clear();
    await db.clientDocuments.clear();
    await db.clientRegistrations.clear();
    await db.installationPhotos.clear();
    await db.releaseDocuments.clear();
    await db.fieldVisitReports.clear();
    await db.products.clear();
    await db.challans.clear();
    await db.shadowAnalyses.clear();
    await db.deletedRecords.clear();

    await db.profiles.bulkPut(DEFAULT_DEMO_PROFILES);
  });

  console.log("🧹 Database clean initialized with production Super Admin, Admin, Field Employee, and Inventory Manager roles!");
}

/**
 * Completely wipes local database and re-initializes clean state
 */
export async function resetDatabaseToClean() {
  await seedDemoData(true);
}


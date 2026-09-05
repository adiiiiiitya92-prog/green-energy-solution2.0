export interface Profile {
  id: string;
  fullName: string;
  phone: string;
  role: 'super_admin' | 'admin' | 'field_employee' | 'inventory_manager' | 'dealer';
  email?: string;
  aadhaarNumber?: string;
  panNumber?: string;
  joiningDate?: string;
  designation?: string;
  createdBy?: string;
  isActive: boolean;
  isActivated?: boolean;
  password?: string;
  createdAt: string;
}

export interface Lead {
  id: string;
  name: string;
  phoneNumber: string;
  email?: string;
  requirement: string;
  description: string;
  assignedEmployeeId?: string; // Legacy fallback
  assignedSalesPersonId?: string; // 👤 Sales Person
  assignedAdminId?: string; // 🏢 Administration Person
  createdBy: string;
  createdByDealer?: boolean;
  dealerId?: string;
  dealerName?: string;
  status: 'new' | 'quotation_sent' | 'confirmed' | 'registered' | 'installed' | 'closed' | 'lost';
  clientRating?: 1 | 2 | 3 | 4 | 5;
  isHot?: boolean;
  isLoan?: boolean; // 🏦 Loan Case (Bank Loan Financing)
  loanBankName?: string; // Optional Bank Name (e.g. SBI, Canara Bank, BoM)
  nextFollowUpDate?: string;
  followUpNotes?: string;
  followUpSetAt?: string;
  followUpSetBy?: string;
  followUpCompleted?: boolean;
  installationRemark?: string;
  createdAt: string;
  updatedAt: string;
}

export interface QuotationItem {
  itemName: string;
  brand?: string;
  unit?: string;
  description?: string;
  qty: number;
  rate: number;
  amount: number;
}

export interface BomItem {
  srNo?: number | string;
  itemName: string;
  qty: number | string;
  unit: string;
  brand?: string;
  description?: string;
  category?: string;
  isHeader?: boolean;
}

export interface Quotation {
  id: string;
  leadId: string;
  quotationNumber: string;
  items: QuotationItem[];
  bomItems?: BomItem[];
  subtotal: number;
  grandTotal: number;
  netPayable?: number;
  followUpDate: string;
  followUpNotes?: string;
  followUpSetAt?: string;
  followUpCompleted?: boolean;
  consumerName?: string;
  consumerMobile?: string;
  consumerEmail?: string;
  consumerNo?: string;
  sanctionLoad?: string;
  city?: string;
  statePin?: string;
  companyName?: string;
  companyAddress?: string;
  companyState?: string;
  leadType?: string;
  proposalId?: string;
  proposalDate?: string;
  preparedBy?: string;
  systemCapacity?: string;
  pvModuleMake?: string;
  pvModuleCount?: string;
  inverterMake?: string;
  structureType?: string;
  estAnnualUnits?: string;
  warrantyModules?: string;
  warrantyInverter?: string;
  lineItems?: any[];
  subsidyAmount?: string;
  gstRate?: number;
  signatureDataUrl?: string;
  pdfBlob?: Blob; // stored in IndexedDB
  pdfDataUrl?: string; // compressed base64 PDF data URL
  pdfUrl?: string; // Firebase Cloud Storage Bucket URL
  pdfStoragePath?: string; // Cloud Storage bucket path
  pdfSizeKB?: number; // File size in KB
  createdBy: string;
  createdAt: string;
  updatedAt?: string;
  sentViaWhatsapp: boolean;
  whatsappSentAt?: string;
}

export interface PaymentInstallment {
  id: string;
  installmentNo: number;
  label: string;
  amount: number;
  paymentMode: 'transaction_id' | 'utr' | 'cheque' | 'cash';
  paymentReference?: string;
  paidAt: string;
  receiptPdfUrl?: string;
  notes?: string;
}

export interface OrderConfirmation {
  id: string;
  leadId: string;
  quotationId: string;
  itemsConfirmed: QuotationItem[];
  subtotal: number;
  advanceAmount: number;
  paymentMode: 'transaction_id' | 'utr' | 'cheque' | 'cash';
  paymentReference?: string;
  clientSignatureBlob: Blob | string; // PNG or Firebase Storage URL
  confirmationPdfBlob?: Blob | string;
  payments?: PaymentInstallment[];
  createdBy: string;
  createdAt: string;
}

export interface ClientDocument {
  id: string;
  leadId: string;
  docType: 'pan_card' | 'aadhar_card' | 'electricity_bill' | 'tax_paper' | 'account_details' | 'dcr_certificate' | 'wcr_report' | 'model_agreement' | 'annexure_proforma' | 'cfa_agreement';
  fileBlob: Blob | string;
  uploadedBy: string;
  uploadedAt: string;
  notes?: string;
  formData?: any;
}

export interface ClientRegistration {
  leadId: string;
  registrationDone: boolean;
  fileMade: boolean;
  bankFileUploaded: boolean;
  bankDocumentBlob?: Blob | string;
  loanStatus: 'pending' | 'approved' | 'rejected';
  updatedAt: string;
}

export interface GeoLocation {
  latitude: number;
  longitude: number;
  placeName: string;
  capturedAt: string; // ISO string, display formatted as 12hr IST
}

export interface InstallationPhoto {
  id: string;
  leadId: string;
  photoType: 'earthing' | 'meter' | 'grouting' | 'other';
  photoBlob: Blob | string;
  location: GeoLocation;
  uploadedBy: string;
}

export interface ReleaseDocument {
  id: string;
  leadId: string;
  fileBlob: Blob | string; // image or PDF or URL
  uploadedBy: string;
  uploadedAt: string;
  notes?: string;
}

export interface FieldVisitReport {
  id: string;
  employeeId: string;
  leadId?: string; // optional — visit may not tie to an existing lead
  personMetName: string;
  personMetContact: string;
  description: string;
  location: GeoLocation;
  photoBlobs: (Blob | string)[];
  visitedAt: string;
  checkInTime?: string;
  checkOutTime?: string;
}

export interface ProductUnit {
  id: string;
  unitNumber: number;
  serialNumber: string;
  status?: 'available' | 'allocated' | 'dispatched' | 'installed' | 'sold';
  notes?: string;
  addedAt?: string;
  dispatchedAt?: string;
}

export interface Product {
  id: string;
  name: string;
  brand?: string;
  unit?: string; // Unit of Measurement (e.g. Nos, Watt, kW, Meters, Sets, Kg)
  category: 'solar_panel' | 'inverter' | 'battery' | 'structure' | 'other' | 'bom_item';
  bomCategory?: string; // Sub-category for BOM items (e.g. Cables & Wiring, Protection Devices, Earthing & LA, Conduit, Accessories)
  rate: number;
  description?: string;
  stockQuantity: number;
  minStockThreshold: number;
  serialNumbers?: string[];
  productUnits?: ProductUnit[];
  createdAt: string;
}

export interface ChallanItem {
  productId: string;
  productName: string;
  qty: number;
  unit?: string;
  rate?: number;
  serialNumbers?: string[];
}

export interface Challan {
  id: string;
  challanNumber: string;
  type?: 'lead' | 'b2b';
  leadId?: string;
  leadName?: string;

  // B2B Business details
  b2bBusinessId?: string;
  businessName?: string;
  gstNumber?: string;
  businessAddress?: string;
  contactPerson?: string;
  mobileNumber?: string;
  email?: string;

  assignedEmployeeId: string;
  employeeName: string;
  vehicleNumber: string;
  driverName: string;
  driverPhone: string;
  items: ChallanItem[];
  notes?: string;
  createdAt: string;
}

export interface B2BBusiness {
  id: string;
  businessName: string;
  gstNumber?: string;
  businessAddress: string;
  contactPerson?: string;
  mobileNumber?: string;
  email?: string;
  createdAt: string;
  updatedAt: string;
}

export interface StockTransaction {
  id: string;
  challanId: string;
  challanNumber: string;
  challanType: 'b2b' | 'lead' | string;
  productId: string;
  productName: string;
  quantityDeducted: number;
  timestamp: string;
}


export interface ShadowAnalysisRecord {
  id: string;
  projectName: string;
  leadId?: string;
  leadName?: string;
  description?: string;
  latitude: number;
  longitude: number;
  address: string;
  roofAreaSqMeters: number;
  systemSizeKw: number;
  usablePanels: number;
  shadingLossPercentage: number;
  panelSpec: any;
  layoutConfig: any;
  polygonPath: { lat: number; lng: number }[];
  obstructions: any[];
  createdBy: string;
  createdAt: string;
}

export interface DeletionRequest {
  id: string;
  entityType: 'lead' | 'quotation' | 'challan' | 'document' | 'product' | 'photo' | 'other';
  entityId: string;
  entityName: string;
  requestedByUserId: string;
  requestedByUserName: string;
  requestedByUserRole: string;
  requestedAt: string;
  status: 'pending' | 'approved' | 'rejected';
  reason?: string;
  reviewedByUserId?: string;
  reviewedByUserName?: string;
  reviewedAt?: string;
  metadata?: Record<string, any>;
}

export interface PackageItem {
  productId: string;
  name: string;
  category: 'solar_panel' | 'inverter' | 'battery' | 'structure' | 'other' | 'bom_item' | string;
  bomCategory?: string;
  unit?: string;
  brand?: string;
  rate: number;
  qty: number;
  description?: string;
}

export interface Package {
  id: string;
  name: string;
  code?: string;
  description?: string;
  status: 'active' | 'inactive';
  commercialItems: PackageItem[];
  bomItems: PackageItem[];
  calculatedCommercialTotal: number;
  calculatedBomTotal: number;
  calculatedCombinedTotal: number;
  finalPrice: number;
  createdAt: string;
  updatedAt: string;
}

// ── Complaint Box & Service Management Types ──
export type CustomerType = 'existing' | 'new_lead' | 'internal';
export type ComplaintPriority = 'Low' | 'Medium' | 'High' | 'Urgent';

export type ComplaintStatus =
  | 'New'
  | 'Complaint Registered'
  | 'Under Review'
  | 'Observation'
  | 'Assigned'
  | 'In Process'
  | 'Waiting for Customer'
  | 'Waiting for Product / Inventory'
  | 'Waiting for Approval'
  | 'Site Visit Required'
  | 'Field Work in Progress'
  | 'Vendor / Manufacturer Support Required'
  | 'Resolved'
  | 'Closed'
  | 'Reopened'
  | string;

export interface FieldVisitTask {
  id: string;
  assignedFieldEmployeeId: string;
  assignedFieldEmployeeName: string;
  visitDate: string;
  visitTime?: string;
  expectedCompletionDate?: string;
  instructions?: string;
  status: 'Scheduled' | 'In Progress' | 'Completed' | 'Cancelled';
  workNotes?: string;
  beforePhotos?: (Blob | string)[];
  afterPhotos?: (Blob | string)[];
  additionalNotes?: string;
  completedAt?: string;
  createdAt: string;
}

export interface InventoryRequestItem {
  id: string;
  productId: string;
  productName: string;
  requestedQty: number;
  approvedQty?: number;
  issuedQty?: number;
  returnedQty?: number;
  serialNumber?: string;
  unit?: string;
  status: 'Requested' | 'Approved' | 'Issued' | 'Rejected' | 'Returned';
  requestedBy: string;
  requestedAt: string;
  issuedAt?: string;
  notes?: string;
}

export interface ComplaintCommunicationNote {
  id: string;
  type: 'internal_note' | 'Call' | 'WhatsApp' | 'Email' | 'SMS' | 'Site Visit';
  communicatedBy: string;
  communicatedByName: string;
  communicatedByRole: string;
  summary: string;
  nextFollowUpDate?: string;
  isInternalOnly: boolean;
  createdAt: string;
}

export interface ComplaintAttachment {
  id: string;
  fileName: string;
  fileType: 'image' | 'pdf' | 'document' | 'video' | 'other';
  fileBlobUrl: string;
  uploadedBy: string;
  uploadedByName: string;
  uploadedAt: string;
}

export interface ComplaintTimelineEntry {
  id: string;
  userId: string;
  userName: string;
  userRole: string;
  action: string;
  details?: string;
  timestamp: string;
}

export interface ComplaintAssignmentHistory {
  id: string;
  assignedBy: string;
  assignedByName: string;
  assignedToId: string;
  assignedToName: string;
  assignedToRole?: string;
  department?: string;
  assignedAt: string;
  reason?: string;
}

export interface ComplaintConfigCategory {
  id: string;
  name: string;
  isCustom?: boolean;
}

export interface ComplaintConfigStatus {
  id: string;
  name: string;
  isCustom?: boolean;
  enabled: boolean;
}

export interface Complaint {
  id: string;
  complaintNumber: string;
  title: string;
  category: string;
  description: string;
  customerType: CustomerType;

  // Existing Customer / Lead details
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

  // Internal Complaint Details
  complaintAgainstDepartment?: string;
  relatedEmployeeId?: string;
  relatedEmployeeName?: string;

  // Core Management
  priority: ComplaintPriority;
  status: ComplaintStatus;
  
  // Assignment
  assignedToId?: string;
  assignedToName?: string;
  assignedToRole?: string;
  assignedDepartment?: string;
  assignmentHistory?: ComplaintAssignmentHistory[];

  // SLA & Dates
  dueDate?: string;
  isOverdue?: boolean;
  resolvedAt?: string;
  resolvedByUserId?: string;
  resolvedByUserName?: string;
  closedAt?: string;
  closedByUserId?: string;
  closedByUserName?: string;
  reopenedAt?: string;
  reopenCount?: number;

  // Resolution & Feedback
  resolutionSummary?: string;
  workPerformed?: string;
  productsReplacedSummary?: string;
  customerFeedback?: string;
  customerRating?: 1 | 2 | 3 | 4 | 5;

  // Associated Data
  fieldVisits?: FieldVisitTask[];
  inventoryRequests?: InventoryRequestItem[];
  communications?: ComplaintCommunicationNote[];
  attachments?: ComplaintAttachment[];
  timeline?: ComplaintTimelineEntry[];

  // Audit info
  createdByUserId: string;
  createdByUserName: string;
  createdByUserRole: string;
  createdAt: string;
  updatedAt: string;
}


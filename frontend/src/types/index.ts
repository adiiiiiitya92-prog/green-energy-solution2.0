export interface Profile {
  id: string;
  fullName: string;
  phone: string;
  role: 'super_admin' | 'admin' | 'field_employee' | 'inventory_manager';
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
  status: 'new' | 'quotation_sent' | 'confirmed' | 'registered' | 'installed' | 'closed' | 'lost';
  clientRating?: 1 | 2 | 3 | 4 | 5;
  isHot?: boolean;
  nextFollowUpDate?: string;
  followUpNotes?: string;
  followUpSetAt?: string;
  followUpSetBy?: string;
  followUpCompleted?: boolean;
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
  docType: 'pan_card' | 'aadhar_card' | 'electricity_bill' | 'tax_paper' | 'account_details' | 'dcr_certificate' | 'wcr_report' | 'model_agreement' | 'annexure_proforma';
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
  createdAt: string;
}

export interface ChallanItem {
  productId: string;
  productName: string;
  qty: number;
}

export interface Challan {
  id: string;
  challanNumber: string;
  leadId: string;
  leadName: string;
  assignedEmployeeId: string;
  employeeName: string;
  vehicleNumber: string;
  driverName: string;
  driverPhone: string;
  items: ChallanItem[];
  notes?: string;
  createdAt: string;
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

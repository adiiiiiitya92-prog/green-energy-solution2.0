import React, { useEffect, useState } from 'react';
import { useAuthStore } from '../../store/authStore';
import { visitService } from '../../services/visitService';
import { leadService, filterLeadsForUser } from '../../services/leadService';
import { employeeService } from '../../services/employeeService';
import { mapService } from '../../services/mapService';
import type { Coordinates } from '../../services/mapService';
import type { FieldVisitReport, Lead, Profile } from '../../types';
import { LeafletMap } from '../../components/Map/LeafletMap';
import { pdfService } from '../../services/pdfService';
import { Plus, MapPin, User, Compass, Upload, Search, ChevronDown, ChevronUp, Trash2, Download, RotateCcw, Clock, Sparkles } from 'lucide-react';
import { compressImage } from '../../services/imageCompressionService';
import { uploadImageToFirebase } from '../../services/firebase';
import dayjs from 'dayjs';

export const Visits: React.FC = () => {
  const { currentRole, currentUser } = useAuthStore();
  const [visits, setVisits] = useState<FieldVisitReport[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [employees, setEmployees] = useState<Profile[]>([]);
  const [employeeNames, setEmployeeNames] = useState<Record<string, string>>({});

  // Filters for Admin/Super Admin
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
  const [selectedLeadId, setSelectedLeadId] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedVisits, setExpandedVisits] = useState<Record<string, boolean>>({});

  // Form states (Log a Visit)
  const [showLogForm, setShowLogForm] = useState(false);
  const [personMetName, setPersonMetName] = useState('');
  const [personMetContact, setPersonMetContact] = useState('');
  const [description, setDescription] = useState('');
  const [linkedLeadId, setLinkedLeadId] = useState('');
  const [gpsLocation, setGpsLocation] = useState<Coordinates | null>(null);
  const [placeName, setPlaceName] = useState('');
  const [isLocating, setIsLocating] = useState(false);
  const [uploadedPhotos, setUploadedPhotos] = useState<(string | Blob)[]>([]);

  // Check-In / Check-Out Duty States
  const [isCheckedIn, setIsCheckedIn] = useState<boolean>(false);
  const [checkInTime, setCheckInTime] = useState<string>('');
  const [checkOutTime, setCheckOutTime] = useState<string>('');
  const [checkInLocation, setCheckInLocation] = useState<string>('');
  const [isCheckInLoading, setIsCheckInLoading] = useState<boolean>(false);
  const [hasRestoredDraft, setHasRestoredDraft] = useState<boolean>(false);

  // Restore Check-In Status & Form Draft on Mount
  useEffect(() => {
    // 1. Restore Check-In State
    const savedCheckIn = localStorage.getItem('field_checkin_data');
    if (savedCheckIn) {
      try {
        const parsed = JSON.parse(savedCheckIn);
        setIsCheckedIn(!!parsed.isCheckedIn);
        setCheckInTime(parsed.checkInTime || '');
        setCheckOutTime(parsed.checkOutTime || '');
        setCheckInLocation(parsed.checkInLocation || '');
      } catch (_) {}
    }

    // 2. Restore Form Draft if available
    const savedDraft = localStorage.getItem('draft_field_visit_form');
    if (savedDraft) {
      try {
        const d = JSON.parse(savedDraft);
        if (d.personMetName) setPersonMetName(d.personMetName);
        if (d.personMetContact) setPersonMetContact(d.personMetContact);
        if (d.linkedLeadId) setLinkedLeadId(d.linkedLeadId);
        if (d.description) setDescription(d.description);
        if (d.placeName) setPlaceName(d.placeName);
        if (d.gpsLocation) setGpsLocation(d.gpsLocation);
        setHasRestoredDraft(true);
      } catch (_) {}
    }
  }, []);

  // Auto-Save Form Draft to localStorage whenever inputs change
  useEffect(() => {
    if (personMetName || personMetContact || description || linkedLeadId || placeName) {
      localStorage.setItem('draft_field_visit_form', JSON.stringify({
        personMetName,
        personMetContact,
        linkedLeadId,
        description,
        placeName,
        gpsLocation
      }));
    }
  }, [personMetName, personMetContact, description, linkedLeadId, placeName, gpsLocation]);

  const handleClearFormData = () => {
    if (confirm('🧹 Clear all entered form data and reset fields & Check-In/Out timestamps to blank?')) {
      localStorage.removeItem('draft_field_visit_form');
      localStorage.removeItem('field_checkin_data');
      setPersonMetName('');
      setPersonMetContact('');
      setLinkedLeadId('');
      setDescription('');
      setPlaceName('');
      setGpsLocation(null);
      setUploadedPhotos([]);
      setHasRestoredDraft(false);
      setIsCheckedIn(false);
      setCheckInTime('');
      setCheckOutTime('');
      setCheckInLocation('');
    }
  };

  const handleCheckInAction = async () => {
    setIsCheckInLoading(true);
    try {
      const coords = await mapService.getCurrentCoordinates();
      const address = await mapService.reverseGeocode(coords.latitude, coords.longitude);
      const nowStr = dayjs().format('DD MMM YYYY, hh:mm A');
      const locStr = address || `${coords.latitude.toFixed(4)}, ${coords.longitude.toFixed(4)}`;

      const data = {
        isCheckedIn: true,
        checkInTime: nowStr,
        checkOutTime: checkOutTime,
        checkInLocation: locStr
      };

      localStorage.setItem('field_checkin_data', JSON.stringify(data));
      setIsCheckedIn(true);
      setCheckInTime(nowStr);
      setCheckInLocation(locStr);
      alert(`📍 Duty Check-In Successful!\n\nIn Time: ${nowStr}\nLocation: ${locStr}`);
    } catch (err) {
      alert('Location Error: GPS access is required for Duty Check-In. Please turn on location services.');
    } finally {
      setIsCheckInLoading(false);
    }
  };

  const handleCheckOutAction = async () => {
    if (!isCheckedIn && !checkInTime) {
      alert('You have not checked in yet!');
      return;
    }

    const nowStr = dayjs().format('DD MMM YYYY, hh:mm A');
    if (confirm(`🏁 Confirm Duty Check-Out?\n\nIn Time: ${checkInTime || 'N/A'}\nOut Time: ${nowStr}`)) {
      const data = {
        isCheckedIn: false,
        checkInTime: checkInTime,
        checkOutTime: nowStr,
        checkInLocation: checkInLocation
      };

      localStorage.setItem('field_checkin_data', JSON.stringify(data));
      setIsCheckedIn(false);
      setCheckOutTime(nowStr);
      alert(`🏁 Duty Check-Out Recorded!\n\nIn Time: ${checkInTime}\nOut Time: ${nowStr}`);
    }
  };

  const loadData = async () => {
    // Load visits
    let allVisits = await visitService.getVisitReports();
    if (currentRole === 'field_employee' && currentUser) {
      allVisits = allVisits.filter(v => v.employeeId === currentUser.id);
    }
    setVisits(allVisits);

    // Load leads
    const rawLeads = await leadService.getLeads();
    setLeads(filterLeadsForUser(rawLeads, currentUser, currentRole));

    // Load employees
    const profiles = await employeeService.getAllProfiles();
    setEmployees(profiles.filter(p => p.role === 'field_employee'));
    const names: Record<string, string> = {};
    profiles.forEach(p => {
      names[p.id] = p.fullName;
    });
    setEmployeeNames(names);
  };

  useEffect(() => {
    loadData();
  }, [currentRole, currentUser]);

  const renderBlobImage = (fileOrBlobOrUrl: any): string => {
    if (!fileOrBlobOrUrl) return '';
    if (typeof fileOrBlobOrUrl === 'string') return fileOrBlobOrUrl.trim();
    if (fileOrBlobOrUrl instanceof Blob || fileOrBlobOrUrl instanceof File) {
      try {
        return URL.createObjectURL(fileOrBlobOrUrl);
      } catch (e) {
        return '';
      }
    }
    return '';
  };

  useEffect(() => {
    if (window.location.pathname.endsWith('/new')) {
      setShowLogForm(true);
    } else {
      setShowLogForm(false);
    }
  }, [window.location.pathname]);

  const handleCaptureLocation = async () => {
    setIsLocating(true);
    try {
      const coords = await mapService.getCurrentCoordinates();
      setGpsLocation(coords);
      const address = await mapService.reverseGeocode(coords.latitude, coords.longitude);
      setPlaceName(address);
    } catch (err) {
      alert('GPS Access Error: We could not detect your location. Please check that:\n1. Your device has GPS / Location Services turned ON.\n2. You gave this browser permission to access location details.');
    } finally {
      setIsLocating(false);
    }
  };

  const [isCompressing, setIsCompressing] = useState(false);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const filesArray = Array.from(e.target.files);
      setIsCompressing(true);
      try {
        // Parallel compression
        const compressedBlobs = await Promise.all(
          filesArray.map(file => compressImage(file, { maxSizeKB: 55 }))
        );

        // Upload directly to Backblaze B2 Storage
        const b2Urls = await Promise.all(
          compressedBlobs.map((compFile, idx) => {
            const fileName = compFile.name || `photo_${idx}.webp`;
            const storagePath = `visits/${Date.now()}_${idx}_${fileName}`;
            return uploadImageToFirebase(compFile, storagePath);
          })
        );

        const validUrls = b2Urls.filter(Boolean);
        setUploadedPhotos(prev => [...prev, ...validUrls]);
      } catch (err) {
        console.error("Upload note:", err);
      } finally {
        setIsCompressing(false);
      }
    }
  };

  const handleLogVisitSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!personMetName || !personMetContact || !description) {
      alert('Form Incomplete: Please fill in the name of the Person Met, their Contact Phone, and the Visit Notes summary.');
      return;
    }

    if (!gpsLocation) {
      alert('GPS Location Required: We need coordinates to verify this site visit. Please click the "Capture GPS Location" button before saving.');
      return;
    }

    const reportData: Omit<FieldVisitReport, 'id' | 'visitedAt'> = {
      employeeId: currentUser?.id || 'mock_emp',
      personMetName,
      personMetContact,
      description,
      location: {
        latitude: gpsLocation.latitude,
        longitude: gpsLocation.longitude,
        placeName,
        capturedAt: new Date().toISOString()
      },
      photoBlobs: uploadedPhotos,
      checkInTime: checkInTime || undefined,
      checkOutTime: checkOutTime || undefined
    };

    if (linkedLeadId) {
      reportData.leadId = linkedLeadId;
    }

    await visitService.createVisitReport(reportData);

    // Reset fields & clear draft
    localStorage.removeItem('draft_field_visit_form');
    setHasRestoredDraft(false);
    setPersonMetName('');
    setPersonMetContact('');
    setDescription('');
    setLinkedLeadId('');
    setGpsLocation(null);
    setPlaceName('');
    setUploadedPhotos([]);
    setShowLogForm(false);
    loadData();
  };

  const toggleVisitExpand = (id: string) => {
    setExpandedVisits(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  const handleDeleteVisit = async (visit: FieldVisitReport) => {
    if (confirm(`⚠️ DELETE VISIT REPORT WARNING:\n\nAre you sure you want to delete the field visit report for "${visit.personMetName}" logged on ${dayjs(visit.visitedAt).format('DD MMM YYYY')}?\n\nThis will permanently delete this visit record and its attached photos.`)) {
      await visitService.deleteVisitReport(visit.id);
      loadData();
    }
  };

  // Filter visit lists
  const filteredVisits = visits.filter(v => {
    // 1. Employee filter
    if (selectedEmployeeId && v.employeeId !== selectedEmployeeId) return false;
    // 2. Lead filter
    if (selectedLeadId && v.leadId !== selectedLeadId) return false;
    // 3. Date range filter
    if (startDate && dayjs(v.visitedAt).isBefore(dayjs(startDate).startOf('day'))) return false;
    if (endDate && dayjs(v.visitedAt).isAfter(dayjs(endDate).endOf('day'))) return false;
    // 4. Search query filter (matches name, contact, location, description)
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const nameMatch = v.personMetName.toLowerCase().includes(q);
      const contactMatch = v.personMetContact.includes(q);
      const locMatch = v.location.placeName.toLowerCase().includes(q);
      const descMatch = v.description.toLowerCase().includes(q);
      const clientMatch = getLeadName(v.leadId).toLowerCase().includes(q);
      if (!nameMatch && !contactMatch && !locMatch && !descMatch && !clientMatch) return false;
    }
    return true;
  });

  const getLeadName = (leadId?: string) => {
    if (!leadId) return 'Unassociated Cold Visit';
    const found = leads.find(l => l.id === leadId);
    return found ? `Client: ${found.name}` : `Client (Deleted)`;
  };



  return (
    <div className="space-y-6">
      {/* View Header */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">Field Visit Reports</h1>
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
            {currentRole === 'field_employee' ? 'Log and review your site inspections.' : 'Monitor site inspection details and logs.'}
          </p>
        </div>
        <div className="flex items-center gap-2 self-start sm:self-auto">
          {currentRole !== 'field_employee' && (
            <button
              type="button"
              onClick={async () => {
                try {
                  const blob = await pdfService.generateVisitsReportPDF(filteredVisits);
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `Green_Energy_Field_Visits_Report_${dayjs().format('YYYY_MM_DD')}.pdf`;
                  document.body.appendChild(a);
                  a.click();
                  document.body.removeChild(a);
                  setTimeout(() => URL.revokeObjectURL(url), 10000);
                } catch (e) {
                  console.error('PDF error:', e);
                  alert('Error generating PDF Report');
                }
              }}
              className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-bold text-xs rounded-xl shadow-md flex items-center gap-1.5 cursor-pointer transition-all"
              title="Download Field Visits PDF Report"
            >
              <Download className="w-4 h-4" />
              <span>Download Report PDF</span>
            </button>
          )}

          {currentRole === 'field_employee' && (
            <button
              onClick={() => setShowLogForm(true)}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-bold text-xs rounded-xl shadow-md flex items-center gap-2 cursor-pointer transition-all"
            >
              <Plus className="w-4 h-4" />
              <span>Log a Visit</span>
            </button>
          )}
        </div>
      </div>

      {/* Advanced Full-Text Search Input Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center space-x-3">
        <Search className="w-4 h-4 text-slate-400 shrink-0" />
        <input
          type="text"
          placeholder="Search visits by contact name, phone number, client/lead name, location address, or inspection notes..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="text-xs font-semibold text-slate-800 focus:outline-none w-full bg-transparent"
        />
      </div>

      {/* Admin Search Filters panel */}
      {currentRole !== 'field_employee' && (
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs grid grid-cols-1 sm:grid-cols-4 gap-4 text-xs font-bold">
          <div className="space-y-1">
            <label className="text-slate-500">Employee</label>
            <select
              value={selectedEmployeeId}
              onChange={(e) => setSelectedEmployeeId(e.target.value)}
              className="w-full border border-slate-200 rounded-lg p-2.5 bg-slate-50 focus:outline-none cursor-pointer"
            >
              <option value="">All Field Staff</option>
              {employees.map(emp => (
                <option key={emp.id} value={emp.id}>{emp.fullName}</option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-slate-500">Associated Client</label>
            <select
              value={selectedLeadId}
              onChange={(e) => setSelectedLeadId(e.target.value)}
              className="w-full border border-slate-200 rounded-lg p-2.5 bg-slate-50 focus:outline-none cursor-pointer"
            >
              <option value="">All Clients</option>
              {leads.map(lead => (
                <option key={lead.id} value={lead.id}>{lead.name} ({lead.requirement})</option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-slate-500">From Date</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full border border-slate-200 rounded-lg p-2 bg-slate-50 focus:outline-none"
            />
          </div>

          <div className="space-y-1">
            <label className="text-slate-500">To Date</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full border border-slate-200 rounded-lg p-2 bg-slate-50 focus:outline-none"
            />
          </div>
        </div>
      )}

      {/* Visits List */}
      <div className="space-y-4">
        {filteredVisits.map((visit) => {
          const isExpanded = !!expandedVisits[visit.id];
          return (
            <div
              key={visit.id}
              onClick={() => toggleVisitExpand(visit.id)}
              className="bg-white border border-slate-200 rounded-2xl p-5 hover:shadow-md transition-all cursor-pointer select-none"
            >
              {/* Collapsed Header (Always Visible) */}
              <div className="flex justify-between items-start gap-4">
                <div className="space-y-1 w-full">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[9px] font-bold bg-slate-100 text-slate-700 uppercase tracking-tight">
                      Visit Logged
                    </span>
                    <span className="text-slate-400 font-bold text-[9px]">
                      {dayjs(visit.visitedAt).format('DD MMM YYYY, hh:mm A [IST]')}
                    </span>
                  </div>
                  <h3 className="text-sm font-extrabold text-slate-800">
                    Contact: {visit.personMetName} ({visit.personMetContact})
                  </h3>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500 font-bold">
                    <span className="text-emerald-600">{getLeadName(visit.leadId)}</span>
                    <span className="text-slate-300 font-medium">•</span>
                    <span className="flex items-center gap-1 text-slate-400 font-semibold truncate max-w-[200px] sm:max-w-md">
                      <MapPin className="w-3.5 h-3.5 text-slate-300 shrink-0" />
                      <span className="truncate">{visit.location.placeName}</span>
                    </span>
                  </div>

                  {(visit.checkInTime || visit.checkOutTime) && (
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      {visit.checkInTime && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-extrabold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md">
                          <MapPin className="w-3 h-3 text-emerald-600" />
                          <span>In Time: {visit.checkInTime}</span>
                        </span>
                      )}
                      {visit.checkOutTime && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-extrabold text-rose-800 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded-md">
                          <Clock className="w-3 h-3 text-rose-600" />
                          <span>Out Time: {visit.checkOutTime}</span>
                        </span>
                      )}
                    </div>
                  )}
                </div>

                <div className="text-slate-400 p-1 hover:text-slate-700 transition-colors shrink-0">
                  {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </div>
              </div>

              {/* Expandable Details Container */}
              {isExpanded && (
                <div
                  className="mt-4 pt-4 border-t border-slate-100 grid grid-cols-1 md:grid-cols-3 gap-6 animate-scale-in"
                  onClick={(e) => e.stopPropagation()} // Stop accordion toggling when interacting inside
                >
                  <div className="md:col-span-2 space-y-4">
                    <div>
                      <p className="text-[9px] uppercase font-bold text-slate-400 mb-1">Notes / Description:</p>
                      <p className="text-xs text-slate-600 leading-relaxed bg-slate-50 p-3 rounded-xl border border-slate-100 whitespace-pre-line font-bold">
                        {visit.description}
                      </p>
                    </div>

                    {/* Photo attachments */}
                    {visit.photoBlobs && visit.photoBlobs.length > 0 && (
                      <div className="space-y-1.5">
                        <p className="text-[9px] uppercase font-bold text-slate-400">Attached Images ({visit.photoBlobs.length}):</p>
                        <div className="flex flex-wrap gap-2">
                          {visit.photoBlobs.map((blob, idx) => (
                            <a
                              key={idx}
                              href={renderBlobImage(blob)}
                              target="_blank"
                              rel="noreferrer"
                              className="block w-20 h-16 border border-slate-200 rounded-lg overflow-hidden shrink-0 hover:scale-105 transition-transform"
                            >
                              <img src={renderBlobImage(blob)} alt="Attached visit inspection" className="w-full h-full object-cover" />
                            </a>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                      <div className="text-[9px] text-slate-400 font-bold flex items-center gap-1">
                        <User className="w-3.5 h-3.5" />
                        <span>Uploaded By: {employeeNames[visit.employeeId] || visit.employeeId}</span>
                      </div>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteVisit(visit);
                        }}
                        className="px-2.5 py-1 bg-rose-50 hover:bg-rose-600 hover:text-white text-rose-700 text-[10px] font-bold rounded-lg border border-rose-200/80 transition-all cursor-pointer flex items-center gap-1"
                        title="Delete visit report"
                      >
                        <Trash2 className="w-3 h-3" />
                        <span>Delete Visit</span>
                      </button>
                    </div>
                  </div>

                  {/* Map Preview section */}
                  <div className="border-t md:border-t-0 md:border-l border-slate-100 pt-4 md:pt-0 md:pl-6 flex flex-col justify-center">
                    <LeafletMap latitude={visit.location.latitude} longitude={visit.location.longitude} placeName={visit.location.placeName} />
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {filteredVisits.length === 0 && (
          <div className="bg-white border border-slate-200 text-center py-12 rounded-2xl">
            <MapPin className="w-8 h-8 text-slate-300 mx-auto mb-2" />
            <p className="text-xs text-slate-400 font-bold">No visit reports logged matching details.</p>
          </div>
        )}
      </div>

      {/* Log Visit Popup Form (Field Employee Only) */}
      {showLogForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl w-full max-w-lg p-6 m-4 max-h-[90vh] overflow-y-auto animate-scale-in">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-black text-slate-900">Log Field Visit</h3>
              {hasRestoredDraft && (
                <span className="px-2.5 py-1 rounded-lg bg-amber-50 text-amber-800 border border-amber-200 text-[10px] font-extrabold flex items-center gap-1 shadow-2xs">
                  <Sparkles className="w-3 h-3 text-amber-600" />
                  <span>Draft Auto-Restored</span>
                </span>
              )}
            </div>
            <form onSubmit={handleLogVisitSubmit} className="space-y-4 text-xs font-semibold">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-slate-500 mb-1">Person Met</label>
                  <input
                    type="text"
                    required
                    value={personMetName}
                    onChange={(e) => setPersonMetName(e.target.value)}
                    placeholder="e.g. Ramesh Chenoy"
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 bg-slate-50 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-slate-500 mb-1">Contact Phone</label>
                  <input
                    type="tel"
                    required
                    value={personMetContact}
                    onChange={(e) => setPersonMetContact(e.target.value)}
                    placeholder="e.g. 9876543210"
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 bg-slate-50 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-500 mb-1">Associate with Existing Client (Optional)</label>
                <select
                  value={linkedLeadId}
                  onChange={(e) => setLinkedLeadId(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 bg-slate-50 focus:outline-none cursor-pointer"
                >
                  <option value="">-- None (Cold Visit / General inquiry) --</option>
                  {leads.filter(l => l.assignedSalesPersonId === currentUser?.id || l.assignedAdminId === currentUser?.id || l.assignedEmployeeId === currentUser?.id).map(l => (
                    <option key={l.id} value={l.id}>{l.name} ({l.requirement})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-500 mb-1">Inspection Notes / Summary</label>
                <textarea
                  required
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Summarize coordinates measurements, roof shadings, electricity details, power cuts, etc."
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 bg-slate-50 focus:outline-none resize-none"
                />
              </div>

              {/* Duty Check-In & Check-Out Timestamps Section (Inside Form) */}
              <div className="bg-slate-50 p-4 border border-slate-200 rounded-xl space-y-3">
                <div className="flex justify-between items-center">
                  <span className="block text-slate-800 font-extrabold uppercase text-[10px] tracking-tight">Duty Check-In & Check-Out Status</span>
                  <span className={`text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full border ${
                    isCheckedIn ? 'bg-emerald-100 text-emerald-800 border-emerald-300' : 'bg-slate-200 text-slate-700 border-slate-300'
                  }`}>
                    {isCheckedIn ? '🟢 Checked In' : '🔴 Checked Out'}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={handleCheckInAction}
                    disabled={isCheckInLoading || isCheckedIn}
                    className={`px-3.5 py-2 text-white font-extrabold text-xs rounded-xl shadow-2xs flex items-center justify-center gap-1.5 cursor-pointer transition-all ${
                      isCheckedIn
                        ? 'bg-slate-300 text-slate-500 cursor-not-allowed opacity-70'
                        : 'bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800'
                    }`}
                    title="Perform Duty Check-In"
                  >
                    <MapPin className="w-3.5 h-3.5" />
                    <span>📍 Check In</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleCheckOutAction}
                    disabled={isCheckInLoading || !isCheckedIn}
                    className={`px-3.5 py-2 text-white font-extrabold text-xs rounded-xl shadow-2xs flex items-center justify-center gap-1.5 cursor-pointer transition-all ${
                      !isCheckedIn
                        ? 'bg-slate-300 text-slate-500 cursor-not-allowed opacity-70'
                        : 'bg-rose-600 hover:bg-rose-700 active:bg-rose-800'
                    }`}
                    title="Perform Duty Check-Out"
                  >
                    <Clock className="w-3.5 h-3.5" />
                    <span>🏁 Check Out</span>
                  </button>
                </div>

                {/* Timestamps Display Box */}
                <div className="bg-white p-3 rounded-xl border border-slate-200 text-xs font-extrabold space-y-1.5 shadow-2xs">
                  <div className="flex justify-between items-center text-slate-700">
                    <span className="flex items-center gap-1 text-emerald-800">
                      <MapPin className="w-3.5 h-3.5 text-emerald-600" />
                      <span>In Time (Check-In):</span>
                    </span>
                    <span className="font-mono text-emerald-700">{checkInTime || 'Not Checked In Yet'}</span>
                  </div>
                  <div className="flex justify-between items-center text-slate-700 pt-1.5 border-t border-slate-100">
                    <span className="flex items-center gap-1 text-rose-800">
                      <Clock className="w-3.5 h-3.5 text-rose-600" />
                      <span>Out Time (Check-Out):</span>
                    </span>
                    <span className="font-mono text-rose-700">{checkOutTime || (isCheckedIn ? 'Active (Pending Check-Out)' : 'Not Checked Out')}</span>
                  </div>
                </div>
              </div>

              {/* Geolocation fetcher */}
              <div className="bg-slate-50 p-4 border border-slate-200 rounded-xl space-y-3">
                <div className="flex justify-between items-center">
                  <span className="block text-slate-700 font-bold">Inspect Location Geotagging</span>
                  <button
                    type="button"
                    onClick={handleCaptureLocation}
                    disabled={isLocating}
                    className="px-3 py-1.5 bg-slate-950 hover:bg-slate-800 disabled:bg-slate-300 text-white rounded-lg flex items-center gap-1 cursor-pointer transition-colors"
                  >
                    <Compass className={`w-3.5 h-3.5 ${isLocating ? 'animate-spin' : ''}`} />
                    <span>{isLocating ? 'Acquiring GPS...' : 'Fetch Location'}</span>
                  </button>
                </div>

                {gpsLocation ? (
                  <div className="space-y-2">
                    <p className="text-[10px] text-slate-500 leading-normal">
                      Coordinates: <span className="font-mono font-bold text-slate-700">{gpsLocation.latitude.toFixed(6)}, {gpsLocation.longitude.toFixed(6)}</span>
                      <br />
                      Address: <span className="font-bold text-slate-700">{placeName}</span>
                    </p>
                    {/* Embedded preview */}
                    <div className="h-32 rounded-lg overflow-hidden border border-slate-200">
                      <LeafletMap latitude={gpsLocation.latitude} longitude={gpsLocation.longitude} placeName={placeName} />
                    </div>
                  </div>
                ) : (
                  <p className="text-[10px] text-rose-500">Please tap "Fetch Location" to record current coordinates.</p>
                )}
              </div>

              {/* Image attachment */}
              <div>
                <label className="block text-slate-500 mb-1">Site Visit Attachments</label>
                <div className="border-2 border-dashed border-slate-200 rounded-xl p-4 text-center hover:bg-slate-50/50 transition-colors relative cursor-pointer">
                  <input
                    type="file"
                    multiple
                    accept="image/*"
                    onChange={handleFileChange}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  />
                  <Upload className="w-5 h-5 text-slate-400 mx-auto mb-1.5" />
                  <p className="text-[10px] text-slate-400">
                    {isCompressing ? '⚡ Auto-compressing & uploading to Firebase Storage...' : 'Drag or click to choose pictures from camera/files.'}
                  </p>
                </div>

                {uploadedPhotos.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-3">
                    {uploadedPhotos.map((blob, idx) => (
                      <div key={idx} className="w-12 h-12 rounded border border-slate-200 overflow-hidden relative shrink-0">
                        <img src={renderBlobImage(blob)} alt="Inspection file draft" className="w-full h-full object-cover" />
                        <button
                          type="button"
                          onClick={() => setUploadedPhotos(prev => prev.filter((_, i) => i !== idx))}
                          className="absolute inset-0 bg-rose-500/70 opacity-0 hover:opacity-100 flex items-center justify-center text-white font-extrabold text-[9px] cursor-pointer"
                        >
                          Del
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={handleClearFormData}
                  className="px-3 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl font-extrabold text-[11px] cursor-pointer flex items-center gap-1.5 transition-colors"
                  title="Clear all entered fields and wipe saved draft"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Clear Form Data</span>
                </button>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setShowLogForm(false)}
                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl font-bold cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white rounded-xl font-bold cursor-pointer shadow-xs"
                  >
                    Save Log
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

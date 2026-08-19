import React, { useState, useEffect, useCallback } from 'react';
import { GoogleMap, useJsApiLoader, Polygon, Polyline, Circle } from '@react-google-maps/api';
import { ChevronRight, ChevronLeft, MapPin, Sun, ShieldAlert, Rotate3d, History, Save, UserCheck, Trash2, Search, X, ExternalLink } from 'lucide-react';

import SiteMapPicker from './SiteMapPicker';
import RoofPolygonDrawer from './RoofPolygonDrawer';
import ObstructionMarker from './ObstructionMarker';
import PanelOverlay from './PanelOverlay';
import ShadowAnalysisResults from './ShadowAnalysisResults';
import Roof3DViewer from './Roof3DViewer';

import { calculatePanelLayout } from '../../services/panelLayoutService';
import type {
  PanelSpec,
  LayoutConfig,
  Obstruction,
  FittedPanel
} from '../../services/panelLayoutService';
import { calculateShading, calculateShadowPolygonsForVisualization, calculateSuggestedPitchDistance } from '../../services/shadowAnalysisService';
import type { ShadingConfig } from '../../services/shadowAnalysisService';
import { latLngToMeters, metersToLatLng } from '../../services/geometryUtils';

import { shadowAnalysisHistoryService } from '../../services/shadowAnalysisHistoryService';
import { leadService, filterLeadsForUser } from '../../services/leadService';
import { useAuthStore } from '../../store/authStore';
import type { ShadowAnalysisRecord, Lead } from '../../types';
import dayjs from 'dayjs';

// Only request geometry library (drawing & places are deprecated legacy APIs)
const libraries: "geometry"[] = ['geometry'];

export const ShadowAnalysisContainer: React.FC = () => {
  const { isLoaded, loadError } = useJsApiLoader({
    googleMapsApiKey: 'AIzaSyDcjbZggQipAnCQiVDL_GekJ7k-BjKGXdw',
    libraries
  });

  const [currentStep, setCurrentStep] = useState(1);
  const [siteLatLng, setSiteLatLng] = useState<google.maps.LatLngLiteral | null>(null);
  const [address, setAddress] = useState('');
  const [mapZoom, setMapZoom] = useState(19);

  // Geometry outlines & elements
  const [polygonPath, setPolygonPath] = useState<google.maps.LatLngLiteral[]>([]);
  const [polygonInstance, setPolygonInstance] = useState<google.maps.Polygon | null>(null);
  const [obstructions, setObstructions] = useState<Obstruction[]>([]);
  const [activeObsId, setActiveObsId] = useState<string | null>(null);

  // View Mode Controller
  const [viewMode, setViewMode] = useState<'2d' | '3d'>('2d');

  // Drawing Custom Obstructions State
  const [isDrawingObs, setIsDrawingObs] = useState(false);
  const [activeObsPath, setActiveObsPath] = useState<google.maps.LatLngLiteral[]>([]);
  const [obsDrawingType, setObsDrawingType] = useState<'cylinder' | 'polygon'>('cylinder');
  const [activeObsHeight, setActiveObsHeight] = useState(2.0);
  const [activeObsName, setActiveObsName] = useState('Lift Room Structure');

  // Fitting Parameters & Specs
  const [panelSpec, setPanelSpec] = useState<PanelSpec>({
    width: 1.13,  // default standard E-W size for 550W panel
    length: 2.28, // default standard N-S size for 550W panel
    wattage: 550, // standard Indian panel wattage
    tiltDeg: 0,
    azimuthDeg: 180  // south-facing default
  });

  const [layoutConfig, setLayoutConfig] = useState<LayoutConfig>({
    setback: 0.5,       // default standard setback margin
    rowSpacing: 0.02,   // 2cm row boundary spacer
    colSpacing: 0.02,   // 2cm column spacer
    orientation: 'portrait',
    pitchDistance: 0,
    layoutType: 'custom'
  });

  // Shadow Analysis Configuration
  const [analysisDate, setAnalysisDate] = useState(new Date().toISOString().split('T')[0]);
  const [timeStart, setTimeStart] = useState(8);
  const [timeEnd, setTimeEnd] = useState(17);
  const [drawMode, setDrawMode] = useState<'work_area' | 'free_area' | 'shadow_cast'>('work_area');
  const [roofShapeType, setRoofShapeType] = useState<'polygon' | 'circle'>('polygon');
  const [circleRoofRadius, setCircleRoofRadius] = useState<number>(6.0);
  const [projectName, setProjectName] = useState('Solar Project');
  const [showShadowOverlay] = useState(true);
  const [shadowPreviewHour] = useState(12);
  const [shadowOverlayPolygons, setShadowOverlayPolygons] = useState<google.maps.LatLngLiteral[][]>([]);

  // Calculation Results
  const [fittedPanels, setFittedPanels] = useState<FittedPanel[]>([]);
  const [totalRoofArea, setTotalRoofArea] = useState(0);
  const [systemSizeKw, setSystemSizeKw] = useState(0);
  const [overallShadingLoss, setOverallShadingLoss] = useState(0);
  const [usablePanels, setUsablePanels] = useState(0);
  const [excludedPanels, setExcludedPanels] = useState(0);

  const [, setMapRef] = useState<google.maps.Map | null>(null);

  // History & Customer Assignment state
  const [historyModalOpen, setHistoryModalOpen] = useState(false);
  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [savedReports, setSavedReports] = useState<ShadowAnalysisRecord[]>([]);
  const [crmLeads, setCrmLeads] = useState<Lead[]>([]);
  const [assignLeadId, setAssignLeadId] = useState('');
  const [designDescription, setDesignDescription] = useState('');
  const [historySearchQuery, setHistorySearchQuery] = useState('');
  const [editingReport, setEditingReport] = useState<ShadowAnalysisRecord | null>(null);

  const loadHistoryAndLeads = async () => {
    try {
      const reports = await shadowAnalysisHistoryService.getReports();
      setSavedReports(reports);
      const { currentRole, currentUser } = useAuthStore.getState();
      const rawLeads = await leadService.getLeads();
      setCrmLeads(filterLeadsForUser(rawLeads, currentUser, currentRole));
    } catch (e) {
      console.warn("Error loading shadow history:", e);
    }
  };

  useEffect(() => {
    loadHistoryAndLeads();
  }, []);

  const handleOpenSaveModal = () => {
    setEditingReport(null);
    setAssignLeadId('');
    setDesignDescription('');
    setSaveModalOpen(true);
  };

  const handleEditReportAssignment = (report: ShadowAnalysisRecord) => {
    setEditingReport(report);
    setAssignLeadId(report.leadId || '');
    setDesignDescription(report.description || '');
    setSaveModalOpen(true);
  };

  const handleSaveDesign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectName.trim()) {
      alert("Please enter a Project Title.");
      return;
    }

    const selectedLead = crmLeads.find(l => l.id === assignLeadId);

    if (editingReport) {
      await shadowAnalysisHistoryService.updateReportLeadAndDescription(
        editingReport.id,
        assignLeadId || undefined,
        selectedLead ? selectedLead.name : undefined,
        designDescription || undefined
      );
      alert("Shadow Analysis Customer Assignment & Notes updated successfully!");
    } else {
      await shadowAnalysisHistoryService.saveReport({
        projectName,
        leadId: assignLeadId || undefined,
        leadName: selectedLead ? selectedLead.name : undefined,
        description: designDescription || undefined,
        latitude: siteLatLng?.lat || 0,
        longitude: siteLatLng?.lng || 0,
        address: address || 'Site Address',
        roofAreaSqMeters: totalRoofArea,
        systemSizeKw,
        usablePanels,
        shadingLossPercentage: overallShadingLoss,
        panelSpec,
        layoutConfig,
        polygonPath,
        obstructions,
        createdBy: 'Admin'
      });
      alert(`Design "${projectName}" saved to Shadow Analysis History and assigned to ${selectedLead ? selectedLead.name : 'Customer'}!`);
    }

    setSaveModalOpen(false);
    setEditingReport(null);
    loadHistoryAndLeads();
  };

  const handleLoadDesignFromHistory = (report: ShadowAnalysisRecord) => {
    if (confirm(`Do you want to load design "${report.projectName}" onto the 3D map workspace?`)) {
      setSiteLatLng({ lat: report.latitude, lng: report.longitude });
      setAddress(report.address);
      setPolygonPath(report.polygonPath || []);
      setObstructions(report.obstructions || []);
      if (report.panelSpec) setPanelSpec(report.panelSpec);
      if (report.layoutConfig) setLayoutConfig(report.layoutConfig);
      setProjectName(report.projectName);
      setCurrentStep(4);
      setHistoryModalOpen(false);
      alert(`Successfully loaded 3D design "${report.projectName}"!`);
    }
  };

  const handleDeleteDesignFromHistory = async (id: string, name: string) => {
    if (confirm(`Are you sure you want to delete design "${name}" from history?`)) {
      await shadowAnalysisHistoryService.deleteReport(id);
      loadHistoryAndLeads();
    }
  };

  const filteredReports = savedReports.filter(r =>
    r.projectName.toLowerCase().includes(historySearchQuery.toLowerCase()) ||
    (r.leadName && r.leadName.toLowerCase().includes(historySearchQuery.toLowerCase())) ||
    r.address.toLowerCase().includes(historySearchQuery.toLowerCase())
  );

  // 1. Calculate Roof Area when polygon changes
  useEffect(() => {
    if (polygonPath.length >= 3 && window.google) {
      const googleMaps = window.google.maps;
      const gPath = polygonPath.map(p => new googleMaps.LatLng(p.lat, p.lng));
      const area = googleMaps.geometry.spherical.computeArea(gPath);
      setTotalRoofArea(area);
    } else {
      setTotalRoofArea(0);
    }
  }, [polygonPath]);

  // 1b. Live update existing circle roof when radius slider or buttons change
  useEffect(() => {
    if (roofShapeType === 'circle' && polygonPath.length >= 3 && window.google) {
      let sumLat = 0, sumLng = 0;
      polygonPath.forEach(pt => { sumLat += pt.lat; sumLng += pt.lng; });
      const center = { lat: sumLat / polygonPath.length, lng: sumLng / polygonPath.length };

      const circlePts: google.maps.LatLngLiteral[] = [];
      const numPoints = 32;
      for (let i = 0; i < numPoints; i++) {
        const angle = (i * 2 * Math.PI) / numPoints;
        const x = circleRoofRadius * Math.sin(angle);
        const y = circleRoofRadius * Math.cos(angle);
        const ll = metersToLatLng({ x, y }, center, window.google.maps);
        circlePts.push({ lat: ll.lat(), lng: ll.lng() });
      }
      setPolygonPath(circlePts);
    }
  }, [circleRoofRadius]);

  // 2. Recalculate Panel Layout and Shading
  const performAnalysis = useCallback(() => {
    if (polygonPath.length >= 3 && siteLatLng && window.google) {
      const googleMaps = window.google.maps;

      // Merge active drawing path to dynamically avoid polygon obstructions during active drawing
      let currentObs = [...obstructions];
      if (isDrawingObs && obsDrawingType === 'polygon' && activeObsPath.length >= 3) {
        currentObs.push({
          id: 'temp_active_obs',
          type: 'polygon',
          lat: siteLatLng.lat,
          lng: siteLatLng.lng,
          heightMeters: activeObsHeight,
          widthMeters: 0,
          path: activeObsPath
        });
      }

      // Fit panels on roof
      const layoutResult = calculatePanelLayout(
        polygonPath,
        panelSpec,
        layoutConfig,
        currentObs,
        googleMaps
      );

      // Build shading config from current state
      const shadingConfig: ShadingConfig = {
        analysisDate: analysisDate ? new Date(analysisDate) : undefined,
        timeStart,
        timeEnd,
        panelTiltDeg: panelSpec.tiltDeg,
        panelAzimuthDeg: panelSpec.azimuthDeg
      };

      // Perform shading simulation with config
      const shadingResult = calculateShading(
        layoutResult.panels,
        currentObs,
        siteLatLng,
        googleMaps,
        shadingConfig
      );

      // Filter and sort recommended panels by lowest shading loss for highest solar yield
      const recommendedPanels = shadingResult.panels
        .filter(p => p.isRecommended)
        .sort((a, b) => a.shadingLoss - b.shadingLoss);

      // Apply Target System Sizing Mode filter (Max Fit / Custom Panel Count / Target kWp)
      let targetLimit = recommendedPanels.length;
      if (layoutConfig.targetSizingMode === 'custom_count' && layoutConfig.targetPanelCount && layoutConfig.targetPanelCount > 0) {
        targetLimit = Math.min(recommendedPanels.length, layoutConfig.targetPanelCount);
      } else if (layoutConfig.targetSizingMode === 'target_kw' && layoutConfig.targetKw && layoutConfig.targetKw > 0) {
        const reqPanels = Math.ceil((layoutConfig.targetKw * 1000) / panelSpec.wattage);
        targetLimit = Math.min(recommendedPanels.length, reqPanels);
      }

      const activePanels = recommendedPanels.slice(0, targetLimit);
      setFittedPanels(activePanels);
      setUsablePanels(activePanels.length);
      setExcludedPanels(shadingResult.panels.length - activePanels.length);
      setSystemSizeKw((activePanels.length * panelSpec.wattage) / 1000);
      setOverallShadingLoss(shadingResult.overallShadingLoss);

      // Compute shadow overlay polygons for map visualization
      if (showShadowOverlay && currentObs.length > 0) {
        const previewDate = new Date(analysisDate || new Date());
        previewDate.setHours(shadowPreviewHour, 0, 0, 0);
        const vizResult = calculateShadowPolygonsForVisualization(
          currentObs, siteLatLng, previewDate, googleMaps
        );
        // Convert local meter coords to LatLng for map overlay
        const origin = siteLatLng;
        const latLngPolygons = vizResult.shadowPolygons.map(poly =>
          poly.map(pt => {
            const ll = metersToLatLng(pt, origin, googleMaps);
            return { lat: ll.lat(), lng: ll.lng() };
          })
        );
        setShadowOverlayPolygons(latLngPolygons);
      } else {
        setShadowOverlayPolygons([]);
      }
    } else {
      setFittedPanels([]);
      setUsablePanels(0);
      setExcludedPanels(0);
      setSystemSizeKw(0);
      setOverallShadingLoss(0);
      setShadowOverlayPolygons([]);
    }
  }, [polygonPath, siteLatLng, panelSpec, layoutConfig, obstructions, isDrawingObs, obsDrawingType, activeObsPath, activeObsHeight, analysisDate, timeStart, timeEnd, showShadowOverlay, shadowPreviewHour]);

  const handlePolygonEdit = useCallback(() => {
    if (polygonInstance) {
      const path = polygonInstance.getPath();
      const coords: google.maps.LatLngLiteral[] = [];
      for (let i = 0; i < path.getLength(); i++) {
        coords.push({ lat: path.getAt(i).lat(), lng: path.getAt(i).lng() });
      }
      setPolygonPath(coords);
    }
  }, [polygonInstance]);

  // Trigger analysis automatically on changes
  useEffect(() => {
    performAnalysis();
  }, [performAnalysis]);

  const handleAddressSelect = (lat: number, lng: number, formattedAddress: string) => {
    setSiteLatLng({ lat, lng });
    setAddress(formattedAddress);
    setMapZoom(20);
    // Clear out old traces
    setPolygonPath([]);
    setObstructions([]);
    setCurrentStep(2);
  };

  const handleExportPDF = useCallback(() => {
    // 1. Generate SVG Layout Schematic
    let layoutSVG = '';
    if (polygonPath.length >= 3 && window.google) {
      const origin = polygonPath[0];
      const googleMaps = window.google.maps;
      const localPoly = polygonPath.map(pt => latLngToMeters(pt, origin, googleMaps));

      let minX = Infinity, maxX = -Infinity;
      let minY = Infinity, maxY = -Infinity;
      localPoly.forEach(p => {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.y > maxY) maxY = p.y;
      });

      const padding = 6;
      minX -= padding;
      maxX += padding;
      minY -= padding;
      maxY += padding;

      const width = maxX - minX;
      const height = maxY - minY;

      const getSVGCoords = (pt: { x: number; y: number }) => {
        const x = pt.x - minX;
        const y = maxY - pt.y; // Invert Y for SVG coordinates
        return `${x.toFixed(2)},${y.toFixed(2)}`;
      };

      const roofPointsStr = localPoly.map(getSVGCoords).join(' ');

      layoutSVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" style="width: 100%; max-height: 380px; background: #0f172a; border-radius: 24px; border: 1.5px solid #1e293b; padding: 12px;">`;

      // Draw grid lines
      for (let x = Math.ceil(minX); x < maxX; x += 3) {
        const sx = x - minX;
        layoutSVG += `<line x1="${sx}" y1="0" x2="${sx}" y2="${height}" stroke="rgba(255,255,255,0.03)" stroke-width="0.15"/>`;
      }
      for (let y = Math.ceil(minY); y < maxY; y += 3) {
        const sy = maxY - y;
        layoutSVG += `<line x1="0" y1="${sy}" x2="${width}" y2="${sy}" stroke="rgba(255,255,255,0.03)" stroke-width="0.15"/>`;
      }

      // Draw roof slab boundary
      layoutSVG += `<polygon points="${roofPointsStr}" fill="rgba(30, 41, 59, 0.45)" stroke="#10b981" stroke-width="0.8" stroke-linejoin="round" />`;

      // Draw obstructions
      obstructions.forEach(obs => {
        if (obs.type === 'polygon' && obs.path && obs.path.length >= 3) {
          const obsLocal = obs.path.map(pt => latLngToMeters(pt, origin, googleMaps));
          const obsPtsStr = obsLocal.map(getSVGCoords).join(' ');
          layoutSVG += `<polygon points="${obsPtsStr}" fill="rgba(239, 68, 68, 0.3)" stroke="#ef4444" stroke-width="0.6" stroke-linejoin="round" />`;
        } else {
          const localPos = latLngToMeters({ lat: obs.lat, lng: obs.lng }, origin, googleMaps);
          const cx = localPos.x - minX;
          const cy = maxY - localPos.y;
          const r = obs.widthMeters / 2;
          layoutSVG += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="rgba(239, 68, 68, 0.3)" stroke="#ef4444" stroke-width="0.6" />`;
        }
      });

      // Draw panels
      fittedPanels.forEach(panel => {
        const pts = panel.localBounds.map(getSVGCoords).join(' ');
        layoutSVG += `<polygon points="${pts}" fill="#1d4ed8" stroke="#1e3a8a" stroke-width="0.35" />`;
        
        // Draw crosshair cell lines inside panel
        const c1 = panel.localBounds[0];
        const c2 = panel.localBounds[1];
        const c3 = panel.localBounds[2];
        const c4 = panel.localBounds[3];

        const mLeftX = (c1.x + c4.x) / 2;
        const mLeftY = (c1.y + c4.y) / 2;
        const mRightX = (c2.x + c3.x) / 2;
        const mRightY = (c2.y + c3.y) / 2;

        const mBotX = (c1.x + c2.x) / 2;
        const mBotY = (c1.y + c2.y) / 2;
        const mTopX = (c3.x + c4.x) / 2;
        const mTopY = (c3.y + c4.y) / 2;

        const pLeft = getSVGCoords({ x: mLeftX, y: mLeftY });
        const pRight = getSVGCoords({ x: mRightX, y: mRightY });
        const pBot = getSVGCoords({ x: mBotX, y: mBotY });
        const pTop = getSVGCoords({ x: mTopX, y: mTopY });

        layoutSVG += `<line x1="${pLeft.split(',')[0]}" y1="${pLeft.split(',')[1]}" x2="${pRight.split(',')[0]}" y2="${pRight.split(',')[1]}" stroke="rgba(255,255,255,0.3)" stroke-width="0.08" />`;
        layoutSVG += `<line x1="${pBot.split(',')[0]}" y1="${pBot.split(',')[1]}" x2="${pTop.split(',')[0]}" y2="${pTop.split(',')[1]}" stroke="rgba(255,255,255,0.3)" stroke-width="0.08" />`;
      });

      // Add Compass Rose indicator (North arrow) at bottom right
      const compX = width - 12;
      const compY = height - 12;
      if (compX > 25 && compY > 25) {
        layoutSVG += `
          <g transform="translate(${compX}, ${compY})">
            <circle cx="0" cy="0" r="8" fill="#1e293b" stroke="#475569" stroke-width="0.6"/>
            <line x1="0" y1="6" x2="0" y2="-6" stroke="#ef4444" stroke-width="1.0"/>
            <polygon points="0,-6 -2,-1 2,-1" fill="#ef4444"/>
            <text x="-2.5" y="-8" fill="#ffffff" font-size="4" font-family="sans-serif" font-weight="bold">N</text>
          </g>
        `;
      }

      layoutSVG += `</svg>`;
    }

    // Generate 3D Building Snapshots from 3 distinct angles
    const render3DSnapshot = (yawDeg: number, pitchDeg: number): string => {
      if (!polygonPath || polygonPath.length < 3 || !window.google) return '';

      const imgWidth = 550;
      const imgHeight = 360;
      const canvas = document.createElement('canvas');
      canvas.width = imgWidth;
      canvas.height = imgHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) return '';

      const origin = polygonPath[0];
      const googleMaps = window.google.maps;

      const localPoly = polygonPath.map(pt => latLngToMeters(pt, origin, googleMaps));

      let minX = Infinity, maxX = -Infinity;
      let minY = Infinity, maxY = -Infinity;
      localPoly.forEach(p => {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.y > maxY) maxY = p.y;
      });

      const dx = maxX - minX;
      const dy = maxY - minY;
      const centerLocal = { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
      const bHeight = 7.5;

      const maxBound = Math.max(dx, dy, bHeight * 1.5, 12);
      const scale = (Math.min(imgWidth, imgHeight) * 0.5) / maxBound;

      const proj3D = (pt: { x: number; y: number; z: number }) => {
        const radYaw = (yawDeg * Math.PI) / 180;
        const radPitch = (pitchDeg * Math.PI) / 180;

        const xRot = pt.x * Math.cos(radYaw) - pt.y * Math.sin(radYaw);
        const yRot = pt.x * Math.sin(radYaw) + pt.y * Math.cos(radYaw);
        const yProj = yRot * Math.cos(radPitch);
        const zProj = pt.z * Math.sin(radPitch);

        return {
          x: imgWidth / 2 + xRot * scale,
          y: imgHeight * 0.58 - yProj * scale - zProj * scale
        };
      };

      // Background Slate Sky
      const bgGrad = ctx.createRadialGradient(imgWidth/2, imgHeight/2, 20, imgWidth/2, imgHeight/2, imgWidth*0.7);
      bgGrad.addColorStop(0, '#1e293b');
      bgGrad.addColorStop(1, '#0f172a');
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, imgWidth, imgHeight);

      // 3D Building Walls
      const roofBase3D = localPoly.map(p => ({ x: p.x - centerLocal.x, y: p.y - centerLocal.y, z: 0 }));
      const roofTop3D = localPoly.map(p => ({ x: p.x - centerLocal.x, y: p.y - centerLocal.y, z: bHeight }));

      const groundPoints = roofBase3D.map(proj3D);
      const roofPoints = roofTop3D.map(proj3D);

      if (roofPoints.length >= 3) {
        const numVertices = roofTop3D.length;
        for (let i = 0; i < numVertices; i++) {
          const nextIdx = (i + 1) % numVertices;
          const g1 = groundPoints[i];
          const g2 = groundPoints[nextIdx];
          const r1 = roofPoints[i];
          const r2 = roofPoints[nextIdx];

          const wallAngle = Math.atan2(roofTop3D[nextIdx].y - roofTop3D[i].y, roofTop3D[nextIdx].x - roofTop3D[i].x);
          const lightIntensity = Math.abs(Math.sin(wallAngle + (yawDeg * Math.PI) / 180));
          const wallBrightness = Math.round(85 + lightIntensity * 65);

          ctx.fillStyle = `rgb(${wallBrightness}, ${wallBrightness + 12}, ${wallBrightness + 28})`;
          ctx.strokeStyle = '#475569';
          ctx.lineWidth = 1.2;

          ctx.beginPath();
          ctx.moveTo(g1.x, g1.y);
          ctx.lineTo(g2.x, g2.y);
          ctx.lineTo(r2.x, r2.y);
          ctx.lineTo(r1.x, r1.y);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        }

        // Roof Surface Fill
        ctx.fillStyle = '#64748b';
        ctx.strokeStyle = '#475569';
        ctx.lineWidth = 2.0;

        ctx.beginPath();
        ctx.moveTo(roofPoints[0].x, roofPoints[0].y);
        for (let i = 1; i < roofPoints.length; i++) {
          ctx.lineTo(roofPoints[i].x, roofPoints[i].y);
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }

      // Panels & Racking Legs
      const tiltRad = (panelSpec.tiltDeg * Math.PI) / 180;
      const p3D = fittedPanels.map(p => {
        const bounds3D = p.localBounds.map((pt, idx) => {
          const tiltElev = (idx >= 2) ? (p.localBounds[2].y - p.localBounds[0].y) * Math.sin(tiltRad) : 0;
          return { x: pt.x - centerLocal.x, y: pt.y - centerLocal.y, z: bHeight + 0.35 + tiltElev };
        });
        return { bounds: bounds3D, isRecommended: p.isRecommended, yCenter: p.localCenter.y - centerLocal.y };
      });

      p3D.sort((a, b) => b.yCenter - a.yCenter);

      p3D.forEach(panel => {
        const pts = panel.bounds.map(proj3D);
        if (pts.length >= 4) {
          ctx.strokeStyle = '#94a3b8';
          ctx.lineWidth = 1.0;
          panel.bounds.forEach(pBound => {
            const roofPt = proj3D({ x: pBound.x, y: pBound.y, z: bHeight });
            const pPt = proj3D(pBound);
            ctx.beginPath();
            ctx.moveTo(roofPt.x, roofPt.y);
            ctx.lineTo(pPt.x, pPt.y);
            ctx.stroke();
          });

          ctx.fillStyle = panel.isRecommended ? '#1d4ed8' : '#ef4444';
          ctx.strokeStyle = panel.isRecommended ? '#1e3a8a' : '#b91c1c';
          ctx.lineWidth = 1.2;

          ctx.beginPath();
          ctx.moveTo(pts[0].x, pts[0].y);
          for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        }
      });

      return canvas.toDataURL('image/png');
    };

    // Capture photorealistic 3D Satellite Map canvas image if active on screen
    let img3DSatelliteMap = '';
    const canvas3DElem = document.querySelector('.roof-3d-canvas') as HTMLCanvasElement || document.querySelector('canvas') as HTMLCanvasElement;
    if (canvas3DElem) {
      try {
        img3DSatelliteMap = canvas3DElem.toDataURL('image/png');
      } catch (err) {
        console.warn("3D Map Canvas capture note:", err);
      }
    }

    const img3DIsometric = render3DSnapshot(-35, 32); // Angle 1: Isometric 3D
    const img3DSide = render3DSnapshot(45, 20);       // Angle 2: Side Elevation 3D
    const img3DTop = render3DSnapshot(0, 75);        // Angle 3: Top Rooftop 3D

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert("Failed to open print window. Please allow popups for this site.");
      return;
    }

    const sunEfficiency = 100 - overallShadingLoss;

    printWindow.document.write(`
      <html>
        <head>
          <title>SolarCRM - Shadow Analysis Proposal</title>
          <script src="https://cdn.tailwindcss.com"></script>
          <style>
            @media print {
              .no-print { display: none; }
              body { font-family: sans-serif; padding: 20px; }
            }
          </style>
        </head>
        <body class="bg-slate-50 text-slate-800 p-8">
          <div class="max-w-4xl mx-auto space-y-6 bg-white p-8 rounded-3xl border border-slate-200 shadow-sm">
            <!-- Header -->
            <div class="flex justify-between items-center border-b-2 border-emerald-500 pb-4">
              <div>
                <h1 class="text-3xl font-black text-slate-900">SolarCRM</h1>
                <p class="text-xs text-slate-550 font-bold">Green Energy Solution - Site Proposal</p>
              </div>
              <div class="text-right">
                <span class="bg-emerald-100 text-emerald-800 text-xs font-extrabold px-3 py-1 rounded-full uppercase">Proposal Draft</span>
                <p class="text-xs text-slate-500 mt-1 font-semibold">Date: ${new Date().toLocaleDateString()}</p>
              </div>
            </div>

            <!-- Title -->
            <div class="text-center py-4">
              <h2 class="text-xl font-black text-slate-900 tracking-tight">Solar Feasibility & Shading Analysis Report</h2>
              <p class="text-xs text-slate-500 font-semibold mt-1">Generated automatically via SolarCRM site estimator</p>
            </div>

            <!-- Site details -->
            <div class="grid grid-cols-2 gap-6 bg-slate-50 p-5 rounded-2xl border border-slate-100">
              <div>
                <h3 class="text-[10px] text-slate-400 font-black uppercase tracking-wider">Project Address</h3>
                <p class="text-xs font-bold text-slate-800 mt-1 leading-relaxed">${address || 'Manual Coordinate Site'}</p>
              </div>
              <div>
                <h3 class="text-[10px] text-slate-400 font-black uppercase tracking-wider">Coordinates</h3>
                <p class="text-xs font-bold text-slate-850 mt-1">${siteLatLng ? `${siteLatLng.lat.toFixed(6)}, ${siteLatLng.lng.toFixed(6)}` : 'N/A'}</p>
              </div>
            </div>

            <!-- Metrics Summary -->
            <div class="grid grid-cols-3 gap-4">
              <div class="bg-emerald-800 text-white p-5 rounded-2xl text-center shadow-sm">
                <span class="text-[9px] text-emerald-300 font-extrabold uppercase tracking-wider">Designed System</span>
                <h2 class="text-2xl font-black mt-1">${systemSizeKw.toFixed(2)} kWp</h2>
                <p class="text-[9px] text-emerald-200 mt-0.5 font-semibold">Estimated Max System Size</p>
              </div>
              <div class="bg-slate-900 text-white p-5 rounded-2xl text-center shadow-sm">
                <span class="text-[9px] text-slate-400 font-extrabold uppercase tracking-wider font-semibold">Recommended Panels</span>
                <h2 class="text-2xl font-black mt-1">${usablePanels} / ${fittedPanels.length + excludedPanels}</h2>
                <p class="text-[9px] text-slate-400 mt-0.5 font-semibold">Excluded ${excludedPanels} shaded panels</p>
              </div>
              <div class="bg-slate-950 text-white p-5 rounded-2xl text-center shadow-sm font-semibold">
                <span class="text-[9px] text-amber-400 font-extrabold uppercase tracking-wider">Sun Capture Efficiency</span>
                <h2 class="text-2xl font-black text-amber-400 mt-1">${sunEfficiency}%</h2>
                <p class="text-[9px] text-slate-400 mt-0.5">Average shading loss: ${overallShadingLoss}%</p>
              </div>
            </div>

            <!-- Detailed Specifications -->
            <div class="space-y-3">
              <h3 class="text-xs font-extrabold text-slate-900 uppercase tracking-wider">Technical Details</h3>
              <div class="border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
                <table class="w-full text-left border-collapse">
                  <thead>
                    <tr class="bg-slate-50 border-b border-slate-200 text-[10px] font-extrabold text-slate-500 uppercase tracking-wider">
                      <th class="p-3">Specification Parameter</th>
                      <th class="p-3 text-right">Value</th>
                    </tr>
                  </thead>
                  <tbody class="text-xs font-semibold text-slate-700 divide-y divide-slate-200 leading-relaxed">
                    <tr>
                      <td class="p-3 text-slate-550">Total Usable Roof Area</td>
                      <td class="p-3 text-right text-slate-800">${totalRoofArea.toFixed(1)} m² (${Math.round(totalRoofArea * 10.7639).toLocaleString()} sqft)</td>
                    </tr>
                    <tr>
                      <td class="p-3 text-slate-550">Panel Dimensions</td>
                      <td class="p-3 text-right text-slate-800">${panelSpec.width}m (W) x ${panelSpec.length}m (L)</td>
                    </tr>
                    <tr>
                      <td class="p-3 text-slate-550">Panel Peak Peak Wattage</td>
                      <td class="p-3 text-right text-slate-800">${panelSpec.wattage} W</td>
                    </tr>
                    <tr>
                      <td class="p-3 text-slate-550">Safety Setback Boundary Margin</td>
                      <td class="p-3 text-right text-slate-800">${layoutConfig.setback} m</td>
                    </tr>
                    <tr>
                      <td class="p-3 text-slate-550">Grid Gaps (Row / Column)</td>
                      <td class="p-3 text-right text-slate-800">${layoutConfig.rowSpacing}m / ${layoutConfig.colSpacing}m</td>
                    </tr>
                    <tr>
                      <td class="p-3 text-slate-550">Placement Orientation Mode</td>
                      <td class="p-3 text-right text-slate-800 capitalize">${layoutConfig.orientation}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <!-- Photorealistic 3D Satellite Map & Real Environment View -->
            ${img3DSatelliteMap ? `
              <div class="space-y-3 pt-2">
                <h3 class="text-xs font-extrabold text-slate-900 uppercase tracking-wider">Photorealistic 3D Satellite Map & Real Environment View</h3>
                <div class="bg-slate-950 p-3 rounded-3xl border border-slate-800 shadow-md text-center space-y-2">
                  <img src="${img3DSatelliteMap}" class="w-full rounded-2xl border border-slate-800 max-h-[380px] object-cover" />
                  <div class="flex justify-between items-center px-2 text-[9px] font-bold text-slate-400">
                    <span>📍 Google Maps Satellite Neighborhood & Building Rooftop Deck 3D View</span>
                    <span class="text-emerald-400">Environmental Solar Simulation</span>
                  </div>
                </div>
              </div>
            ` : ''}

            <!-- 3D Building Views from Multiple Angles -->
            ${img3DIsometric ? `
              <div class="space-y-3 pt-2">
                <h3 class="text-xs font-extrabold text-slate-900 uppercase tracking-wider">3D Building & Racking Perspectives (Multi-Angle)</h3>
                <div class="grid grid-cols-3 gap-3">
                  <div class="bg-slate-950 p-2 rounded-2xl border border-slate-800 text-center space-y-1 shadow-xs">
                    <img src="${img3DIsometric}" class="w-full rounded-xl border border-slate-800" />
                    <span class="text-[9px] font-black text-slate-300 block">Angle 1: Isometric 3D View</span>
                  </div>
                  <div class="bg-slate-950 p-2 rounded-2xl border border-slate-800 text-center space-y-1 shadow-xs">
                    <img src="${img3DSide}" class="w-full rounded-xl border border-slate-800" />
                    <span class="text-[9px] font-black text-slate-300 block">Angle 2: Side Elevation View</span>
                  </div>
                  <div class="bg-slate-950 p-2 rounded-2xl border border-slate-800 text-center space-y-1 shadow-xs">
                    <img src="${img3DTop}" class="w-full rounded-xl border border-slate-800" />
                    <span class="text-[9px] font-black text-slate-300 block">Angle 3: Top Rooftop View</span>
                  </div>
                </div>
              </div>
            ` : ''}

            <!-- Roof Layout Map Vector Diagram -->
            <div class="space-y-3">
              <h3 class="text-xs font-extrabold text-slate-900 uppercase tracking-wider">Calculated Solar Array Layout</h3>
              <div class="flex justify-center bg-slate-950 p-2 rounded-3xl border border-slate-800 shadow-inner">
                ${layoutSVG}
              </div>
              <p class="text-[9px] text-slate-500 font-semibold text-center italic">
                Blue rectangles represent optimal panel modules. Red shapes/circles outline marked structures.
              </p>
            </div>

            <!-- Footnote Disclaimer -->
            <div class="bg-amber-50/50 border border-amber-250/60 p-4 rounded-2xl text-[9px] text-amber-800 font-semibold leading-relaxed">
              <strong>Disclaimer:</strong> This layout and shading analysis is generated based on satellite imagery, local sun path models, and user-marked obstructions. Shading score forecasts represent general patterns and might vary due to cloud coverage, dirt accumulations, and building shape variances. A manual onsite measurement is recommended before finalizing the system designs.
            </div>

            <!-- Print Action -->
            <div class="no-print flex justify-between items-center pt-4 border-t border-slate-100">
              <a href="https://api.whatsapp.com/send?text=${encodeURIComponent(
                `*Solar CRM - Installation Proposal* ☀️\n📍 *Address:* ${address || 'Manual Coordinate Site'}\n⚡ *System Size:* ${systemSizeKw.toFixed(2)} kWp\n💎 *Recommended Panels:* ${usablePanels} modules`
              )}" target="_blank" class="bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs px-6 py-3.5 rounded-xl shadow-md transition-all cursor-pointer flex items-center space-x-1.5 no-underline">
                <svg class="w-4 h-4 fill-current" viewBox="0 0 24 24">
                  <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946C.06 5.348 5.397.01 12.008.01c3.202.001 6.212 1.246 8.477 3.514 2.266 2.268 3.507 5.28 3.505 8.484-.004 6.657-5.34 11.997-11.953 11.997-2.005-.001-3.973-.502-5.717-1.464L0 24zm6.59-4.846c1.6.95 3.198 1.451 4.796 1.452 5.518 0 9.986-4.477 9.989-9.999.002-2.675-1.03-5.19-2.903-7.07C16.559 1.65 14.07 0.61 11.458 0.61c-5.522 0-10.014 4.495-10.016 10.02-.001 1.705.452 3.37 1.31 4.86L1.71 21.05l5.77-1.516c-1.125-.626-2.28-1.52-2.83-2.046z"/>
                  <path d="M17.487 14.39c-.27-.136-1.602-.79-1.85-.88-.25-.09-.43-.136-.61.136-.18.27-.69.88-.85 1.06-.15.18-.3.2-.57.064-.27-.135-1.137-.42-2.167-1.34-.8-.713-1.34-1.595-1.5-1.86-.15-.27-.015-.415.12-.55.125-.124.27-.315.405-.47.135-.16.18-.27.27-.45.09-.18.045-.34-.02-.47-.07-.13-.61-1.47-.83-2.01-.22-.53-.44-.45-.61-.46h-.52c-.18 0-.47.07-.72.34-.25.27-.95.93-.95 2.27s.97 2.63 1.11 2.82c.14.19 1.9 2.9 4.6 4.07.64.28 1.14.45 1.53.57.65.2 1.24.18 1.7.11.52-.08 1.6-.66 1.83-1.29.23-.63.23-1.18.16-1.29-.07-.12-.27-.18-.54-.315z"/>
                </svg>
                <span>Share Proposal on WhatsApp</span>
              </a>
              <button onclick="window.print();" class="bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs px-6 py-3 rounded-xl shadow-md transition-all cursor-pointer">
                Generate & Save PDF Report
              </button>
            </div>
          </div>
        </body>
      </html>
    `);

    printWindow.document.close();
  }, [address, siteLatLng, systemSizeKw, usablePanels, fittedPanels, overallShadingLoss, totalRoofArea, panelSpec, layoutConfig]);

  const handleMapClick = (e: google.maps.MapMouseEvent) => {
    if (e.latLng && siteLatLng) {
      if (currentStep === 2) {
        if (roofShapeType === 'circle') {
          // Generate 32-point smooth circular polygon around clicked center
          const center = { lat: e.latLng.lat(), lng: e.latLng.lng() };
          const circlePts: google.maps.LatLngLiteral[] = [];
          const numPoints = 32;
          for (let i = 0; i < numPoints; i++) {
            const angle = (i * 2 * Math.PI) / numPoints;
            const x = circleRoofRadius * Math.sin(angle);
            const y = circleRoofRadius * Math.cos(angle);
            const ll = metersToLatLng({ x, y }, center, window.google?.maps);
            circlePts.push({ lat: ll.lat(), lng: ll.lng() });
          }
          setPolygonPath(circlePts);
        } else {
          // Custom drawing: append new vertex coordinates on click
          const newVertex = { lat: e.latLng.lat(), lng: e.latLng.lng() };
          setPolygonPath(prev => [...prev, newVertex]);
        }
      } else if (currentStep === 3) {
        if (isDrawingObs && obsDrawingType === 'polygon') {
          // Custom drawing polygon obstruction: append vertex coordinates
          const newVertex = { lat: e.latLng.lat(), lng: e.latLng.lng() };
          setActiveObsPath(prev => [...prev, newVertex]);
        } else {
          // Standard cylinder marker placement on click
          const newObs: Obstruction = {
            id: `obs_${Date.now()}`,
            type: 'tank',
            lat: e.latLng.lat(),
            lng: e.latLng.lng(),
            heightMeters: 2.0, // standard 2m height
            widthMeters: 2.0  // standard 2m diameter
          };
          setObstructions([...obstructions, newObs]);
          setActiveObsId(newObs.id);
        }
      }
    }
  };

  const handleObstructionUpdate = (id: string, updatedFields: Partial<Obstruction>) => {
    setObstructions(prev =>
      prev.map(obs => (obs.id === id ? { ...obs, ...updatedFields } : obs))
    );
  };

  const handleObstructionDelete = (id: string) => {
    setObstructions(prev => prev.filter(obs => obs.id !== id));
    if (activeObsId === id) setActiveObsId(null);
  };

  const nextStep = () => {
    if (currentStep === 1 && !siteLatLng) return;
    if (currentStep === 2 && polygonPath.length < 3) return;
    setCurrentStep(prev => prev + 1);
  };

  const prevStep = () => {
    if (currentStep === 3) {
      // Clear obstructions when going back to the tracing step (Step 2)
      setObstructions([]);
      setIsDrawingObs(false);
      setActiveObsPath([]);
      setActiveObsId(null);
    }
    setCurrentStep(prev => prev - 1);
  };

  if (loadError) {
    return (
      <div className="bg-rose-50 border border-rose-200/80 rounded-2xl p-6 text-center text-rose-700 space-y-3">
        <ShieldAlert className="w-8 h-8 text-rose-500 mx-auto" />
        <h4 className="font-extrabold text-sm">Google Maps Loading Error</h4>
        <p className="text-xs font-semibold text-rose-605">
          Failed to load Google Maps SDK. Please check your network and API key: {loadError.message}
        </p>
      </div>
    );
  }

  const stepsList = [
    { label: 'Search Address', active: currentStep === 1, done: currentStep > 1 },
    { label: 'Roof Tracing', active: currentStep === 2, done: currentStep > 2 },
    { label: 'Obstructions', active: currentStep === 3, done: currentStep > 3 },
    { label: 'Shading Report', active: currentStep === 4, done: currentStep > 4 }
  ];

  return (
    <div className="h-[calc(100vh-140px)] flex flex-col lg:flex-row bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-xs">
      {/* SIDEBAR VIEW CONTROLLER */}
      <div className="w-full lg:w-[400px] flex flex-col justify-between border-b lg:border-b-0 lg:border-r border-slate-200 shrink-0 bg-slate-50/20">
        <div className="p-5 space-y-6 overflow-y-auto flex-1">
          {/* Header */}
          <div className="flex justify-between items-start">
            <div>
              <span className="text-[9px] text-emerald-600 font-black uppercase tracking-wider block">
                Feature Module
              </span>
              <h2 className="text-lg font-black text-slate-900 tracking-tight flex items-center space-x-1.5 mt-0.5">
                <Sun className="w-5 h-5 text-emerald-600 animate-pulse" />
                <span>Roof Shadow Analysis</span>
              </h2>
            </div>
            <button
              type="button"
              onClick={() => setHistoryModalOpen(true)}
              className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white text-[10px] font-extrabold rounded-xl shadow-xs flex items-center gap-1.5 cursor-pointer transition-all shrink-0"
            >
              <History className="w-3.5 h-3.5 text-emerald-400" />
              <span>History ({savedReports.length})</span>
            </button>
          </div>

          {/* Stepper Wizard Indicator */}
          <div className="flex items-center space-x-1 border-t border-b border-slate-100 py-3.5 select-none overflow-x-auto">
            {stepsList.map((step, idx) => (
              <React.Fragment key={idx}>
                <div className="flex items-center space-x-1.5">
                  <div
                    className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-black border transition-all shrink-0 ${
                      step.active
                        ? 'bg-emerald-600 border-emerald-600 text-white ring-4 ring-emerald-500/10'
                        : step.done
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                        : 'bg-white border-slate-200 text-slate-400'
                    }`}
                  >
                    {idx + 1}
                  </div>
                  <span
                    className={`text-[9px] font-black tracking-tight whitespace-nowrap ${
                      step.active ? 'text-slate-800' : 'text-slate-400 font-semibold'
                    }`}
                  >
                    {step.label}
                  </span>
                </div>
                {idx < stepsList.length - 1 && <div className="w-2.5 border-t border-slate-200 shrink-0 mx-1"></div>}
              </React.Fragment>
            ))}
          </div>

          {/* STEP CONTENTS */}
          <div className="pt-2">
            {currentStep === 1 && (
              <SiteMapPicker
                onAddressSelect={handleAddressSelect}
                isLoaded={isLoaded}
              />
            )}

            {currentStep === 2 && (
              <RoofPolygonDrawer
                polygonPath={polygonPath}
                onPolygonChange={setPolygonPath}
                onClear={() => setPolygonPath([])}
                areaSqm={totalRoofArea}
                projectName={projectName}
                setProjectName={setProjectName}
                drawMode={drawMode}
                setDrawMode={setDrawMode}
                roofShapeType={roofShapeType}
                setRoofShapeType={setRoofShapeType}
                circleRoofRadius={circleRoofRadius}
                setCircleRoofRadius={setCircleRoofRadius}
                analysisDate={analysisDate}
                setAnalysisDate={setAnalysisDate}
                timeStart={timeStart}
                setTimeStart={setTimeStart}
                timeEnd={timeEnd}
                setTimeEnd={setTimeEnd}
                panelTiltDeg={panelSpec.tiltDeg}
                setPanelTiltDeg={(val) => setPanelSpec({ ...panelSpec, tiltDeg: val })}
                panelAzimuthDeg={panelSpec.azimuthDeg}
                setPanelAzimuthDeg={(val) => setPanelSpec({ ...panelSpec, azimuthDeg: val })}
                pitchDistance={layoutConfig.pitchDistance}
                setPitchDistance={(val) => setLayoutConfig({ ...layoutConfig, pitchDistance: val })}
                onSuggestPitch={() => {
                  const lat = siteLatLng?.lat ?? 19.076;
                  const suggested = calculateSuggestedPitchDistance(panelSpec.length, panelSpec.tiltDeg, lat);
                  setLayoutConfig({ ...layoutConfig, pitchDistance: suggested });
                }}
              />
            )}

            {currentStep === 3 && (
              <ObstructionMarker
                obstructions={obstructions}
                onObstructionUpdate={handleObstructionUpdate}
                onObstructionDelete={handleObstructionDelete}
                activeId={activeObsId}
                setActiveId={setActiveObsId}
                isDrawingObs={isDrawingObs}
                setIsDrawingObs={setIsDrawingObs}
                activeObsPath={activeObsPath}
                setActiveObsPath={setActiveObsPath}
                obsDrawingType={obsDrawingType}
                setObsDrawingType={setObsDrawingType}
                activeObsHeight={activeObsHeight}
                setActiveObsHeight={setActiveObsHeight}
                activeObsName={activeObsName}
                setActiveObsName={setActiveObsName}
                onSavePolygonObs={() => {
                  if (activeObsPath.length < 3) {
                    alert("Please click the satellite map to place at least 3 points before saving.");
                    return;
                  }
                  // Calculate average center location
                  let sumLat = 0, sumLng = 0;
                  activeObsPath.forEach(pt => {
                    sumLat += pt.lat;
                    sumLng += pt.lng;
                  });
                  const avgLat = sumLat / activeObsPath.length;
                  const avgLng = sumLng / activeObsPath.length;

                  const newObs: Obstruction = {
                    id: `obs_${Date.now()}`,
                    type: 'polygon',
                    lat: avgLat,
                    lng: avgLng,
                    heightMeters: activeObsHeight,
                    widthMeters: 0, // not used
                    path: activeObsPath
                  };
                  setObstructions(prev => [...prev, newObs]);
                  setIsDrawingObs(false);
                  setActiveObsPath([]);
                  setActiveObsId(newObs.id);
                }}
              />
            )}

            {currentStep === 4 && (
              <ShadowAnalysisResults
                address={address}
                panelSpec={panelSpec}
                setPanelSpec={setPanelSpec}
                layoutConfig={layoutConfig}
                setLayoutConfig={setLayoutConfig}
                totalRoofArea={totalRoofArea}
                totalPanels={fittedPanels.length + excludedPanels}
                usablePanels={usablePanels}
                excludedPanels={excludedPanels}
                systemSizeKw={systemSizeKw}
                overallShadingLoss={overallShadingLoss}
                onRecalculate={performAnalysis}
                onExport={handleExportPDF}
                onSaveDesign={handleOpenSaveModal}
              />
            )}
          </div>
        </div>

        {/* STEP BUTTON FOOTER */}
        <div className="p-4 border-t border-slate-200/80 bg-white flex justify-between select-none">
          <button
            onClick={prevStep}
            disabled={currentStep === 1}
            className="flex items-center space-x-1 text-[10px] border border-slate-200 hover:border-slate-350 hover:bg-slate-50 text-slate-600 font-extrabold px-3 py-2.5 rounded-xl transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <ChevronLeft className="w-4 h-4" />
            <span>Back</span>
          </button>

          <button
            onClick={nextStep}
            disabled={
              (currentStep === 1 && !siteLatLng) ||
              (currentStep === 2 && polygonPath.length < 3) ||
              currentStep === 4
            }
            className="flex items-center space-x-1 text-[10px] bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold px-4.5 py-2.5 rounded-xl transition-all shadow-md shadow-emerald-600/10 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <span>Continue</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* SATELLITE MAP PANEL */}
      <div className="flex-1 min-h-[400px] lg:h-full relative bg-slate-900">
        {!siteLatLng && (
          <div className="absolute inset-0 flex flex-col justify-center items-center text-center p-8 bg-slate-900 text-slate-400 z-10 space-y-3 select-none">
            <div className="bg-slate-800 p-4 rounded-3xl border border-slate-700">
              <MapPin className="w-8 h-8 text-emerald-500 animate-bounce" />
            </div>
            <h3 className="text-white font-black text-sm tracking-tight">No Site Selected</h3>
            <p className="text-xs text-slate-500 font-medium max-w-xs leading-relaxed">
              Please search and select a project address in Step 1 to load satellite imagery and start tracing.
            </p>
          </div>
        )}

        {/* Map / 3D Toggle Tab Bar */}
        {siteLatLng && polygonPath.length >= 3 && (
          <div className="absolute top-4 right-4 z-20 bg-slate-900/95 border border-slate-800 p-1 rounded-2xl flex items-center space-x-1 shadow-lg backdrop-blur-md">
            <button
              onClick={() => setViewMode('2d')}
              className={`text-[10px] font-black px-3.5 py-1.5 rounded-xl transition-all cursor-pointer ${
                viewMode === '2d'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              2D Map view
            </button>
            <button
              onClick={() => setViewMode('3d')}
              className={`text-[10px] font-black px-3.5 py-1.5 rounded-xl transition-all cursor-pointer flex items-center space-x-1.5 ${
                viewMode === '3d'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Rotate3d className="w-3.5 h-3.5" />
              <span>3D Model</span>
            </button>
          </div>
        )}

        {viewMode === '3d' ? (
          <Roof3DViewer
            roofPolygon={polygonPath}
            panels={fittedPanels}
            obstructions={obstructions}
            panelSpec={panelSpec}
            siteLatLng={siteLatLng}
            analysisDate={analysisDate}
            onSwitchTo2D={() => setViewMode('2d')}
          />
        ) : (
          isLoaded && siteLatLng && (
            <GoogleMap
              mapContainerClassName="w-full h-full"
              center={siteLatLng}
              zoom={mapZoom}
              onLoad={(map) => setMapRef(map)}
              onUnmount={() => setMapRef(null)}
              onClick={handleMapClick}
              options={{
                mapTypeId: 'satellite',
                tilt: 0,
                maxZoom: 21,
                minZoom: 2,
                mapTypeControl: false,
                streetViewControl: false,
                fullscreenControl: false,
                zoomControl: true,
                zoomControlOptions: {
                  position: window.google?.maps.ControlPosition.RIGHT_BOTTOM
                }
              }}
            >
              {/* Draw roof outline on map */}
              {polygonPath.length > 0 && (
                <Polygon
                  path={polygonPath}
                  onLoad={(poly) => setPolygonInstance(poly)}
                  onUnmount={() => setPolygonInstance(null)}
                  onMouseUp={handlePolygonEdit}
                  onDragEnd={handlePolygonEdit}
                  options={{
                    fillColor: '#10b981',
                    fillOpacity: currentStep === 2 ? 0.25 : 0.0, // transparent in step 3 & 4 to show blue panels clearly
                    strokeColor: '#059669',
                    strokeWeight: 2.5,
                    editable: currentStep === 2, // only edit in step 2
                    draggable: currentStep === 2,  // only drag in step 2
                    clickable: currentStep === 2  // only clickable when drawing/editing! In Step 3/4, clicks pass through to place obstructions!
                  }}
                />
              )}

              {/* Draw completed polygon obstructions in Red */}
              {obstructions
                .filter(obs => obs.type === 'polygon' && obs.path && obs.path.length >= 3)
                .map(obs => (
                  <Polygon
                    key={obs.id}
                    path={obs.path}
                    options={{
                      fillColor: '#ef4444',
                      fillOpacity: 0.22,
                      strokeColor: '#dc2626',
                      strokeWeight: 2,
                      clickable: true
                    }}
                    onClick={() => setActiveObsId(obs.id)}
                  />
                ))}

              {/* Draw completed circular tank / cylinder obstructions as Circles on map */}
              {obstructions
                .filter(obs => obs.type !== 'polygon')
                .map(obs => (
                  <Circle
                    key={`circle_obs_${obs.id}`}
                    center={{ lat: obs.lat, lng: obs.lng }}
                    radius={obs.widthMeters / 2}
                    options={{
                      fillColor: '#ef4444',
                      fillOpacity: 0.35,
                      strokeColor: '#dc2626',
                      strokeWeight: 2,
                      clickable: true
                    }}
                    onClick={() => setActiveObsId(obs.id)}
                  />
                ))}

              {/* Draw active temporary drawing path for polygon obstruction */}
              {isDrawingObs && activeObsPath.length > 0 && (
                <>
                  {/* Connecting lines - always visible even with just 1 or 2 points */}
                  <Polyline
                    path={activeObsPath}
                    options={{
                      strokeColor: '#dc2626',
                      strokeWeight: 2,
                      strokeOpacity: 0.8,
                      clickable: false
                    }}
                  />
                  
                  {/* Solid fill polygon outline - only rendered for closed shapes of 3+ points */}
                  {activeObsPath.length >= 3 && (
                    <Polygon
                      path={activeObsPath}
                      options={{
                        fillColor: '#ef4444',
                        fillOpacity: 0.15,
                        strokeColor: '#dc2626',
                        strokeWeight: 0,
                        clickable: false
                      }}
                    />
                  )}

                  {/* Vertex handles/dots at clicked coordinates */}
                  {activeObsPath.map((pt, idx) => (
                    <Circle
                      key={`act_obs_dot_${idx}`}
                      center={pt}
                      radius={0.35} // 35cm radius helper dot
                      options={{
                        fillColor: '#ffffff',
                        fillOpacity: 1,
                        strokeColor: '#dc2626',
                        strokeWeight: 1.8,
                        clickable: false
                      }}
                    />
                  ))}
                </>
              )}

              {/* Draw circular cylinder obstruction markers */}
              <ObstructionMarker
                obstructions={obstructions}
                onObstructionUpdate={handleObstructionUpdate}
                onObstructionDelete={handleObstructionDelete}
                activeId={activeObsId}
                setActiveId={setActiveObsId}
              />

              {/* Draw panels fitting overlay whenever roof outline is drawn */}
              {polygonPath.length >= 3 && (
                <PanelOverlay panels={fittedPanels} />
              )}

              {/* Draw real-time calculated shadow overlay polygons */}
              {shadowOverlayPolygons.map((polyPath, idx) => (
                <Polygon
                  key={`shadow_overlay_${idx}`}
                  path={polyPath}
                  options={{
                    fillColor: '#0f172a',
                    fillOpacity: 0.35,
                    strokeColor: '#334155',
                    strokeWeight: 1,
                    clickable: false
                  }}
                />
              ))}
            </GoogleMap>
          )
        )}
      </div>

      {/* MODAL 1: SAVE DESIGN & ASSIGN TO CUSTOMER */}
      {saveModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl w-full max-w-md p-6 space-y-4 animate-scale-in">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <div className="flex items-center space-x-2">
                <Save className="w-5 h-5 text-emerald-600" />
                <h3 className="text-sm font-black text-slate-900">
                  {editingReport ? 'Re-Assign Customer / Edit Notes' : 'Save Design & Assign Customer'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSaveModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveDesign} className="space-y-4 text-xs font-semibold">
              <div>
                <label className="block text-slate-500 mb-1">Project / Design Title</label>
                <input
                  type="text"
                  required
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  placeholder="e.g. 5.5 kW Rooftop Solar Design"
                  className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 bg-slate-50 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-bold text-slate-800"
                />
              </div>

              <div>
                <label className="block text-slate-500 mb-1">Assign Customer / CRM Lead (Optional)</label>
                <select
                  value={assignLeadId}
                  onChange={(e) => setAssignLeadId(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 bg-slate-50 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-bold text-slate-800 cursor-pointer"
                >
                  <option value="">-- Select CRM Customer / Lead --</option>
                  {crmLeads.map((lead) => (
                    <option key={lead.id} value={lead.id}>
                      👤 {lead.name} ({lead.requirement || 'Solar Inquiry'})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-500 mb-1">Design Description / Custom Structural Notes</label>
                <textarea
                  rows={3}
                  value={designDescription}
                  onChange={(e) => setDesignDescription(e.target.value)}
                  placeholder="e.g. High-efficiency 550W panels with 18 deg tilt, south facing, clear lift room shadow clearance."
                  className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 bg-slate-50 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-medium text-slate-800"
                />
              </div>

              {/* Design Quick Metrics Preview */}
              <div className="bg-slate-50 border border-slate-100 rounded-2xl p-3 grid grid-cols-3 gap-2 text-center text-[10px]">
                <div>
                  <span className="text-slate-400 font-bold block uppercase">Capacity</span>
                  <span className="text-emerald-700 font-extrabold text-xs">{systemSizeKw.toFixed(2)} kWp</span>
                </div>
                <div>
                  <span className="text-slate-400 font-bold block uppercase">Roof Area</span>
                  <span className="text-slate-800 font-extrabold text-xs">{totalRoofArea.toFixed(1)} m²</span>
                </div>
                <div>
                  <span className="text-slate-400 font-bold block uppercase">Shading Loss</span>
                  <span className="text-amber-700 font-extrabold text-xs">{overallShadingLoss}%</span>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setSaveModalOpen(false)}
                  className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl font-bold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-extrabold shadow-md cursor-pointer uppercase tracking-wider text-[11px]"
                >
                  {editingReport ? 'Update Assignment' : 'Save to History'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: SHADOW ANALYSIS HISTORY & CUSTOMER ASSIGNMENTS */}
      {historyModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl w-full max-w-3xl h-[85vh] flex flex-col animate-scale-in">
            {/* Header */}
            <div className="p-6 border-b border-slate-100 flex justify-between items-center shrink-0">
              <div className="flex items-center space-x-2.5">
                <div className="p-2 rounded-xl bg-emerald-50 text-emerald-700">
                  <History className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-black text-slate-900">Shadow Analysis Design History</h3>
                  <p className="text-xs text-slate-400 font-semibold">View, load, or assign 3D rooftop solar designs to CRM customers.</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setHistoryModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer p-1.5 rounded-full hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Controls Search */}
            <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex items-center gap-3 shrink-0">
              <div className="bg-white border border-slate-200 rounded-xl px-3 py-2 flex items-center gap-2 flex-1">
                <Search className="w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search by project name, customer name, or site location..."
                  value={historySearchQuery}
                  onChange={(e) => setHistorySearchQuery(e.target.value)}
                  className="text-xs font-semibold text-slate-800 bg-transparent outline-none w-full"
                />
              </div>
              <span className="text-xs font-bold text-slate-500">
                {filteredReports.length} Saved Design{filteredReports.length === 1 ? '' : 's'}
              </span>
            </div>

            {/* History Grid List */}
            <div className="p-6 overflow-y-auto flex-1 space-y-4">
              {filteredReports.length > 0 ? (
                filteredReports.map((report) => (
                  <div
                    key={report.id}
                    className="bg-white border border-slate-200 hover:border-emerald-500/80 rounded-2xl p-5 shadow-xs hover:shadow-md transition-all space-y-3"
                  >
                    <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="text-sm font-black text-slate-900">{report.projectName}</h4>
                          {report.leadName ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-black bg-emerald-50 text-emerald-700 border border-emerald-200">
                              👤 {report.leadName}
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-black bg-amber-50 text-amber-700 border border-amber-200">
                              Unassigned Customer
                            </span>
                          )}
                        </div>
                        <p className="text-[10px] text-slate-400 font-semibold mt-0.5 flex items-center gap-1">
                          <MapPin className="w-3 h-3 text-emerald-600" />
                          <span>{report.address || 'Site Address'}</span>
                        </p>
                      </div>

                      <div className="text-right sm:text-right self-start sm:self-auto">
                        <span className="text-[10px] text-slate-400 font-bold">
                          {dayjs(report.createdAt).format('DD MMM YYYY • hh:mm A')}
                        </span>
                      </div>
                    </div>

                    {report.description && (
                      <p className="text-xs bg-slate-50 text-slate-600 p-2.5 rounded-xl border border-slate-100 font-medium">
                        <span className="font-bold text-slate-800">Design Description:</span> {report.description}
                      </p>
                    )}

                    {/* Technical Specs Badges */}
                    <div className="flex flex-wrap gap-2 pt-1">
                      <span className="px-2.5 py-1 rounded-lg text-[10px] font-extrabold bg-emerald-600 text-white">
                        ⚡ {report.systemSizeKw.toFixed(2)} kWp System
                      </span>
                      <span className="px-2.5 py-1 rounded-lg text-[10px] font-extrabold bg-slate-100 text-slate-700 border border-slate-200">
                        📐 {report.roofAreaSqMeters.toFixed(1)} m² Roof
                      </span>
                      <span className="px-2.5 py-1 rounded-lg text-[10px] font-extrabold bg-amber-50 text-amber-800 border border-amber-200">
                        📊 {report.shadingLossPercentage}% Shading Loss
                      </span>
                    </div>

                    {/* Actions Toolbar */}
                    <div className="pt-3 border-t border-slate-100 flex justify-between items-center">
                      <button
                        type="button"
                        onClick={() => handleEditReportAssignment(report)}
                        className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 cursor-pointer"
                      >
                        <UserCheck className="w-3.5 h-3.5" />
                        <span>Re-Assign Customer / Edit Notes</span>
                      </button>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleDeleteDesignFromHistory(report.id, report.projectName)}
                          className="p-1.5 text-slate-400 hover:text-rose-600 transition-colors cursor-pointer rounded-lg hover:bg-rose-50"
                          title="Delete Design"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleLoadDesignFromHistory(report)}
                          className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white text-[10px] font-extrabold rounded-lg shadow-xs transition-colors cursor-pointer flex items-center gap-1"
                        >
                          <ExternalLink className="w-3.5 h-3.5 text-emerald-400" />
                          <span>Load Design on 3D Map</span>
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="py-12 text-center text-slate-400 space-y-2">
                  <Sun className="w-8 h-8 text-slate-300 mx-auto" />
                  <p className="text-xs font-bold">No saved shadow analysis designs found.</p>
                  <p className="text-[10px]">Create a 3D design and click "Save & Assign to Customer" to build your history.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ShadowAnalysisContainer;

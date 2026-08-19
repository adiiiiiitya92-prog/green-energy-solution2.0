import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import SunCalc from 'suncalc';
import {
  Rotate3d,
  Building2,
  RotateCcw,
  RotateCw,
  Play,
  Pause,
  Sun,
  Moon,
  Clock,
  Sparkles,
  Map as MapIcon,
  Eye,
  Zap,
  ShieldCheck,
  MapPin
} from 'lucide-react';
import type { FittedPanel, Obstruction, PanelSpec } from '../../services/panelLayoutService';
import { latLngToMeters, isPointInPolygon } from '../../services/geometryUtils';
import type { Point2D } from '../../services/geometryUtils';

interface Roof3DViewerProps {
  roofPolygon: google.maps.LatLngLiteral[];
  panels: FittedPanel[];
  obstructions: Obstruction[];
  panelSpec?: PanelSpec;
  siteLatLng?: google.maps.LatLngLiteral | null;
  analysisDate?: string;
  onSwitchTo2D?: () => void;
}

interface Point3D {
  x: number;
  y: number;
  z: number;
}

interface Panel3DData {
  id: string;
  bounds: Point3D[];
  yCenter: number;
  localCenter: Point3D;
  shadingLoss: number;
  isRecommended: boolean;
  tiltDeg: number;
}

interface Obstruction3DData {
  id: string;
  type: string;
  center: Point2D;
  height: number;
  width: number;
  path?: Point2D[];
  yCenter: number;
}

interface HoveredPanelInfo {
  id: string;
  screenX: number;
  screenY: number;
  shadePercent: number;
  isBackLit: boolean;
  tiltDeg: number;
}

/**
 * Affine triangle texture mapping utility for rendering 3D perspective satellite images on canvas.
 */
function drawTriangleTexture(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x0: number, y0: number, u0: number, v0: number,
  x1: number, y1: number, u1: number, v1: number,
  x2: number, y2: number, u2: number, v2: number
) {
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.closePath();
  ctx.clip();

  const delta = u0 * (v1 - v2) - v0 * (u1 - u2) + (u1 * v2 - u2 * v1);
  if (Math.abs(delta) < 0.001) {
    ctx.restore();
    return;
  }

  const deltaA = x0 * (v1 - v2) - v0 * (x1 - x2) + (x1 * v2 - x2 * v1);
  const deltaB = u0 * (x1 - x2) - x0 * (u1 - u2) + (u1 * x2 - u2 * x1);
  const deltaC = u0 * (v1 * x2 - v2 * x1) - v0 * (u1 * x2 - u2 * x1) + x0 * (u1 * v2 - u2 * v1);

  const deltaD = y0 * (v1 - v2) - v0 * (y1 - y2) + (y1 * v2 - y2 * v1);
  const deltaE = u0 * (y1 - y2) - y0 * (u1 - u2) + (u1 * y2 - u2 * y1);
  const deltaF = u0 * (v1 * y2 - v2 * y1) - v0 * (u1 * y2 - u2 * y1) + y0 * (u1 * v2 - u2 * v1);

  ctx.transform(
    deltaA / delta, deltaD / delta,
    deltaB / delta, deltaE / delta,
    deltaC / delta, deltaF / delta
  );

  ctx.drawImage(img, 0, 0);
  ctx.restore();
}

/**
 * 3D Ray-Intersection Test:
 * Tests if ray from point P towards the Sun hits an obstruction volume.
 */
function isRayBlockedByObstacle(
  p: Point3D,
  obs: Obstruction3DData,
  altitudeRad: number,
  azimuthRad: number,
  buildingHeight: number
): boolean {
  if (altitudeRad <= 0) return true;

  const zBase = buildingHeight;
  const zTop = buildingHeight + obs.height;

  if (zTop <= p.z) return false;

  const tanAlt = Math.tan(altitudeRad);
  if (tanAlt <= 0.001) return true;

  const tMin = Math.max(0, (zBase - p.z) / tanAlt);
  const tMax = (zTop - p.z) / tanAlt;

  if (tMax <= tMin) return false;

  const dirX = -Math.sin(azimuthRad);
  const dirY = -Math.cos(azimuthRad);

  const steps = 5;
  for (let s = 0; s <= steps; s++) {
    const t = tMin + (tMax - tMin) * (s / steps);
    const qx = p.x + t * dirX;
    const qy = p.y + t * dirY;
    const qPt: Point2D = { x: qx, y: qy };

    if (obs.type === 'polygon' && obs.path && obs.path.length >= 3) {
      if (isPointInPolygon(qPt, obs.path)) {
        return true;
      }
    } else {
      const rad = obs.width / 2;
      const distSq = (qx - obs.center.x) ** 2 + (qy - obs.center.y) ** 2;
      if (distSq <= rad * rad) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Inter-row self shading test:
 * Tests if another solar panel blocks direct sun ray towards point P.
 */
function isRayBlockedByOtherPanel(
  p: Point3D,
  otherPanel: Panel3DData,
  altitudeRad: number,
  azimuthRad: number
): boolean {
  if (altitudeRad <= 0) return true;

  const otherMinZ = Math.min(...otherPanel.bounds.map(b => b.z));
  const otherMaxZ = Math.max(...otherPanel.bounds.map(b => b.z));

  if (otherMaxZ <= p.z) return false;

  const tanAlt = Math.tan(altitudeRad);
  if (tanAlt <= 0.001) return true;

  const tMin = Math.max(0, (otherMinZ - p.z) / tanAlt);
  const tMax = (otherMaxZ - p.z) / tanAlt;

  if (tMax <= tMin) return false;

  const dirX = -Math.sin(azimuthRad);
  const dirY = -Math.cos(azimuthRad);

  const otherPoly2D: Point2D[] = otherPanel.bounds.map(b => ({ x: b.x, y: b.y }));

  const steps = 4;
  for (let s = 0; s <= steps; s++) {
    const t = tMin + (tMax - tMin) * (s / steps);
    const qx = p.x + t * dirX;
    const qy = p.y + t * dirY;
    if (isPointInPolygon({ x: qx, y: qy }, otherPoly2D)) {
      return true;
    }
  }

  return false;
}

export const Roof3DViewer: React.FC<Roof3DViewerProps> = ({
  roofPolygon,
  panels,
  obstructions,
  panelSpec,
  siteLatLng,
  analysisDate,
  onSwitchTo2D
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // 3D View Angles & Controls State
  const [yaw, setYaw] = useState<number>(-35);
  const [pitch, setPitch] = useState<number>(32);
  const [zoom, setZoom] = useState<number>(1.0);
  const [buildingHeight, setBuildingHeight] = useState<number>(7.5);
  const [isAutoRotating, setIsAutoRotating] = useState<boolean>(false);
  const [showSatelliteGround, setShowSatelliteGround] = useState<boolean>(true);
  const [simSpeed, setSimSpeed] = useState<number>(1);
  const [hoveredPanel, setHoveredPanel] = useState<HoveredPanelInfo | null>(null);

  // Satellite Imagery Texture Image State
  const [satelliteImage, setSatelliteImage] = useState<HTMLImageElement | null>(null);

  // Load Satellite Image Snapshot for 3D Ground Texture
  useEffect(() => {
    if (!siteLatLng) return;
    const img = new Image();
    img.crossOrigin = 'Anonymous';
    img.src = `https://maps.googleapis.com/maps/api/staticmap?center=${siteLatLng.lat},${siteLatLng.lng}&zoom=19&size=640x640&maptype=satellite&key=AIzaSyDcjbZggQipAnCQiVDL_GekJ7k-BjKGXdw`;
    img.onload = () => setSatelliteImage(img);
  }, [siteLatLng]);

  // Morning-to-Evening Sun Shading Simulation State
  const [simHour, setSimHour] = useState<number>(10.0);
  const [isSimulatingDay, setIsSimulatingDay] = useState<boolean>(false);

  // Drag tracking state
  const isDraggingRef = useRef<boolean>(false);
  const dragStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // 3D Projection Math (Ground Z=0 sits at bottom, building extends UPWARDS)
  const project3D = useCallback((pt: Point3D, width: number, height: number, scale: number) => {
    const radYaw = (yaw * Math.PI) / 180;
    const radPitch = (pitch * Math.PI) / 180;

    const xRot = pt.x * Math.cos(radYaw) - pt.y * Math.sin(radYaw);
    const yRot = pt.x * Math.sin(radYaw) + pt.y * Math.cos(radYaw);

    const yProj = yRot * Math.cos(radPitch);
    const zProj = pt.z * Math.sin(radPitch);

    const screenX = width / 2 + xRot * scale * zoom;
    const screenY = height * 0.58 - yProj * scale * zoom - zProj * scale * zoom;

    return { x: screenX, y: screenY };
  }, [yaw, pitch, zoom]);

  // Auto 360° Turntable spin loop
  useEffect(() => {
    if (!isAutoRotating) return;
    const interval = setInterval(() => {
      setYaw(prev => (prev + 0.8) % 360);
    }, 30);
    return () => clearInterval(interval);
  }, [isAutoRotating]);

  // Morning-to-Evening Sun Day Simulation loop (6 AM to 6 PM)
  useEffect(() => {
    if (!isSimulatingDay) return;
    const step = 0.25 * simSpeed;
    const interval = setInterval(() => {
      setSimHour(prev => {
        if (prev >= 18.0) return 6.0;
        return parseFloat((prev + step).toFixed(2));
      });
    }, 120);
    return () => clearInterval(interval);
  }, [isSimulatingDay, simSpeed]);

  // GLOBAL WINDOW DRAG LISTENERS
  useEffect(() => {
    const handleGlobalMouseMove = (e: MouseEvent) => {
      if (!isDraggingRef.current) return;
      const dx = e.clientX - dragStartRef.current.x;
      const dy = e.clientY - dragStartRef.current.y;

      setYaw(prev => (prev + dx * 0.5) % 360);
      setPitch(prev => Math.max(5, Math.min(88, prev + dy * 0.4)));

      dragStartRef.current = { x: e.clientX, y: e.clientY };
    };

    const handleGlobalMouseUp = () => {
      isDraggingRef.current = false;
    };

    window.addEventListener('mousemove', handleGlobalMouseMove);
    window.addEventListener('mouseup', handleGlobalMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleGlobalMouseMove);
      window.removeEventListener('mouseup', handleGlobalMouseUp);
    };
  }, []);

  // Compute Current Sun Position (Altitude & Azimuth)
  const sunPositionData = useMemo(() => {
    const lat = siteLatLng?.lat ?? 19.076;
    const lng = siteLatLng?.lng ?? 72.877;
    const date = analysisDate ? new Date(analysisDate) : new Date();

    const hourInt = Math.floor(simHour);
    const minInt = Math.round((simHour - hourInt) * 60);
    date.setHours(hourInt, minInt, 0, 0);

    const sunPos = SunCalc.getPosition(date, lat, lng);
    const altitudeDeg = (sunPos.altitude * 180) / Math.PI;
    const azimuthDeg = (sunPos.azimuth * 180) / Math.PI;

    return {
      altitudeRad: sunPos.altitude,
      azimuthRad: sunPos.azimuth,
      altitudeDeg,
      azimuthDeg,
      isDaylight: sunPos.altitude > 0,
      timestamp: date
    };
  }, [siteLatLng, analysisDate, simHour]);

  // Compute Sun Path Trajectory Points for the 3D Celestial Arc (6 AM to 6 PM)
  const sunPathTrajectory = useMemo(() => {
    const lat = siteLatLng?.lat ?? 19.076;
    const lng = siteLatLng?.lng ?? 72.877;
    const baseDate = analysisDate ? new Date(analysisDate) : new Date();

    const points: { hour: number; x: number; y: number; z: number; isVisible: boolean }[] = [];
    const sunDist = 38;

    for (let h = 6; h <= 18; h += 0.5) {
      const d = new Date(baseDate);
      d.setHours(Math.floor(h), Math.round((h % 1) * 60), 0, 0);
      const pos = SunCalc.getPosition(d, lat, lng);

      if (pos.altitude > -0.05) {
        const sx = sunDist * Math.sin(pos.azimuth) * Math.cos(pos.altitude);
        const sy = sunDist * Math.cos(pos.azimuth) * Math.cos(pos.altitude);
        const sz = buildingHeight + sunDist * Math.sin(pos.altitude);
        points.push({ hour: h, x: sx, y: sy, z: sz, isVisible: pos.altitude > 0 });
      }
    }
    return points;
  }, [siteLatLng, analysisDate, buildingHeight]);

  // 3D Model Geometry Computation (with safe null-checks)
  const geometry3D = useMemo(() => {
    if (!roofPolygon || roofPolygon.length < 3 || !window.google?.maps) {
      return null;
    }

    const origin = roofPolygon[0];
    const googleMaps = window.google.maps;
    const localPoly = roofPolygon.map(pt => latLngToMeters(pt, origin, googleMaps));

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

    const roofBase3D: Point3D[] = localPoly.map(p => ({
      x: p.x - centerLocal.x,
      y: p.y - centerLocal.y,
      z: 0
    }));

    const roofTop3D: Point3D[] = localPoly.map(p => ({
      x: p.x - centerLocal.x,
      y: p.y - centerLocal.y,
      z: buildingHeight
    }));

    const tiltDeg = panelSpec?.tiltDeg || 15;
    const tiltRad = (tiltDeg * Math.PI) / 180;

    const panels3D: Panel3DData[] = (panels || []).map(p => {
      const bounds3D: Point3D[] = p.localBounds.map((pt, idx) => {
        const tiltElev = (idx >= 2) ? (p.localBounds[2].y - p.localBounds[0].y) * Math.sin(tiltRad) : 0;
        return {
          x: pt.x - centerLocal.x,
          y: pt.y - centerLocal.y,
          z: buildingHeight + 0.35 + tiltElev
        };
      });

      return {
        id: p.id,
        bounds: bounds3D,
        shadingLoss: p.shadingLoss,
        isRecommended: p.isRecommended,
        tiltDeg,
        yCenter: p.localCenter.y - centerLocal.y,
        localCenter: {
          x: p.localCenter.x - centerLocal.x,
          y: p.localCenter.y - centerLocal.y,
          z: buildingHeight + 0.35 + 0.5 * (p.localBounds[2].y - p.localBounds[0].y) * Math.sin(tiltRad)
        }
      };
    });

    const obs3D: Obstruction3DData[] = (obstructions || []).map(obs => {
      const localPos = latLngToMeters({ lat: obs.lat, lng: obs.lng }, origin, googleMaps);
      const localCenter = {
        x: localPos.x - centerLocal.x,
        y: localPos.y - centerLocal.y
      };

      const path3D = obs.type === 'polygon' && obs.path
        ? obs.path.map(pt => {
            const loc = latLngToMeters(pt, origin, googleMaps);
            return { x: loc.x - centerLocal.x, y: loc.y - centerLocal.y };
          })
        : undefined;

      return {
        id: obs.id,
        type: obs.type,
        center: localCenter,
        height: obs.heightMeters,
        width: obs.widthMeters,
        path: path3D,
        yCenter: localCenter.y
      };
    });

    return { dx, dy, centerLocal, roofBase3D, roofTop3D, panels3D, obs3D, tiltDeg, tiltRad };
  }, [roofPolygon, panels, obstructions, buildingHeight, panelSpec]);

  // Real-time 3D Ray-Tracing Shading Calculation (Computed cleanly via native Map)
  const realtimeShadeResults = useMemo(() => {
    if (!geometry3D) {
      return { panelShades: new globalThis.Map<string, { percent: number; isBackLit: boolean }>(), overallLoss: 0, activeCount: 0 };
    }

    const { panels3D, obs3D, tiltRad } = geometry3D;
    const panelShadeMap = new globalThis.Map<string, { percent: number; isBackLit: boolean }>();
    let totalLossSum = 0;
    let activePanels = 0;

    if (sunPositionData.isDaylight) {
      const sunCosAlt = Math.cos(sunPositionData.altitudeRad);
      const sunSinAlt = Math.sin(sunPositionData.altitudeRad);
      const sunDirY = -Math.cos(sunPositionData.azimuthRad) * sunCosAlt;
      const normalDotSun = sunDirY * (-Math.sin(tiltRad)) + sunSinAlt * Math.cos(tiltRad);

      // 90° Plane-of-Array (POA) Cutoff:
      // South-facing panels receive direct beam sun only when Sun is in the Southern sky (|azimuth| <= 90° from South)
      // and when angle of incidence normalDotSun > 0.05.
      // If Sun moves to the North (|azimuth| > 90°), direct sun is on the panel's back-sheet (Dusk/Dawn Backlit).
      const isPast90Cutoff = Math.abs(sunPositionData.azimuthDeg) > 90;
      const isBackLit = isPast90Cutoff || normalDotSun <= 0.05;

      panels3D.forEach(panel => {
        if (isBackLit) {
          panelShadeMap.set(panel.id, { percent: 100, isBackLit: true });
          totalLossSum += 100;
          return;
        }

        const b = panel.bounds;
        const testPoints: Point3D[] = [b[0], b[1], b[2], b[3], panel.localCenter];

        let blockedPoints = 0;
        testPoints.forEach(pt => {
          const blockedByObs = obs3D.some(obs =>
            isRayBlockedByObstacle(pt, obs, sunPositionData.altitudeRad, sunPositionData.azimuthRad, buildingHeight)
          );

          if (blockedByObs) {
            blockedPoints++;
            return;
          }

          const blockedByPanel = panels3D.some(otherP => {
            if (otherP.id === panel.id) return false;
            return isRayBlockedByOtherPanel(pt, otherP, sunPositionData.altitudeRad, sunPositionData.azimuthRad);
          });

          if (blockedByPanel) {
            blockedPoints++;
          }
        });

        const shadePct = Math.round((blockedPoints / testPoints.length) * 100);
        panelShadeMap.set(panel.id, { percent: shadePct, isBackLit: false });
        totalLossSum += shadePct;
        if (shadePct <= 30) activePanels++;
      });
    } else {
      panels3D.forEach(p => {
        panelShadeMap.set(p.id, { percent: 100, isBackLit: false });
      });
      totalLossSum = panels3D.length * 100;
    }

    const overallLoss = panels3D.length > 0 ? Math.round(totalLossSum / panels3D.length) : 0;
    return { panelShades: panelShadeMap, overallLoss, activeCount: activePanels };
  }, [geometry3D, sunPositionData, buildingHeight]);

  // Main 3D Canvas Render Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !geometry3D) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    canvas.width = width;
    canvas.height = height;

    const { dx, dy, roofBase3D, roofTop3D, panels3D, obs3D } = geometry3D;
    const maxBound = Math.max(dx, dy, buildingHeight * 1.5, 12);
    const scale = (Math.min(width, height) * 0.5) / maxBound;

    // Atmospheric Sky Gradient
    const bgGrad = ctx.createRadialGradient(width/2, height/2, 20, width/2, height/2, width*0.75);
    if (!sunPositionData.isDaylight) {
      bgGrad.addColorStop(0, '#0f172a');
      bgGrad.addColorStop(1, '#020617');
    } else if (sunPositionData.altitudeDeg < 15) {
      bgGrad.addColorStop(0, '#451a03');
      bgGrad.addColorStop(0.5, '#1e1b4b');
      bgGrad.addColorStop(1, '#020617');
    } else {
      bgGrad.addColorStop(0, '#1e293b');
      bgGrad.addColorStop(0.7, '#0f172a');
      bgGrad.addColorStop(1, '#020617');
    }
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, width, height);

    // --- 0. SATELLITE MAP GROUND PLANE ---
    if (showSatelliteGround && satelliteImage) {
      const gBound = Math.max(dx, dy, 20) * 1.8;
      const gridDivs = 8;
      const step = (gBound * 2) / gridDivs;
      const imgW = satelliteImage.width;
      const imgH = satelliteImage.height;

      ctx.save();
      ctx.globalAlpha = sunPositionData.isDaylight ? 0.92 : 0.45;

      for (let gx = 0; gx < gridDivs; gx++) {
        for (let gy = 0; gy < gridDivs; gy++) {
          const x0 = -gBound + gx * step;
          const y0 = -gBound + gy * step;
          const x1 = x0 + step;
          const y1 = y0 + step;

          const p00 = project3D({ x: x0, y: y0, z: 0 }, width, height, scale);
          const p10 = project3D({ x: x1, y: y0, z: 0 }, width, height, scale);
          const p11 = project3D({ x: x1, y: y1, z: 0 }, width, height, scale);
          const p01 = project3D({ x: x0, y: y1, z: 0 }, width, height, scale);

          const u0 = (gx / gridDivs) * imgW;
          const v0 = ((gridDivs - gy) / gridDivs) * imgH;
          const u1 = ((gx + 1) / gridDivs) * imgW;
          const v1 = ((gridDivs - 1 - gy) / gridDivs) * imgH;

          drawTriangleTexture(ctx, satelliteImage, p00.x, p00.y, u0, v0, p10.x, p10.y, u1, v0, p01.x, p01.y, u0, v1);
          drawTriangleTexture(ctx, satelliteImage, p10.x, p10.y, u1, v0, p11.x, p11.y, u1, v1, p01.x, p01.y, u0, v1);
        }
      }
      ctx.restore();
    } else {
      ctx.strokeStyle = 'rgba(255,255,255,0.035)';
      ctx.lineWidth = 1.0;
      const gridSpacing = 4 * scale * zoom;
      for (let x = 0; x < width; x += gridSpacing) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }
      for (let y = 0; y < height; y += gridSpacing) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }
    }

    // --- 0.5 RENDER 3D COMPASS ROSE ---
    const compassCenter = { x: -dx * 0.85, y: -dy * 0.85, z: 0.05 };
    const compassSize = Math.max(2.5, dx * 0.22);
    const nPt = project3D({ x: compassCenter.x, y: compassCenter.y + compassSize, z: 0.05 }, width, height, scale);
    const sPt = project3D({ x: compassCenter.x, y: compassCenter.y - compassSize, z: 0.05 }, width, height, scale);
    const ePt = project3D({ x: compassCenter.x + compassSize, y: compassCenter.y, z: 0.05 }, width, height, scale);
    const wPt = project3D({ x: compassCenter.x - compassSize, y: compassCenter.y, z: 0.05 }, width, height, scale);
    const cPt = project3D(compassCenter, width, height, scale);

    ctx.save();
    ctx.fillStyle = 'rgba(15, 23, 42, 0.75)';
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(cPt.x, cPt.y, 22 * zoom, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(cPt.x, cPt.y);
    ctx.lineTo(nPt.x, nPt.y);
    ctx.stroke();

    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 2.0;
    ctx.beginPath();
    ctx.moveTo(cPt.x, cPt.y);
    ctx.lineTo(sPt.x, sPt.y);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(wPt.x, wPt.y);
    ctx.lineTo(ePt.x, ePt.y);
    ctx.stroke();

    ctx.font = 'bold 9px Inter, sans-serif';
    ctx.fillStyle = '#ef4444';
    ctx.fillText('N', nPt.x - 3, nPt.y - 4);
    ctx.fillStyle = '#f59e0b';
    ctx.fillText('S', sPt.x - 3, sPt.y + 11);
    ctx.fillStyle = '#94a3b8';
    ctx.fillText('E', ePt.x + 4, ePt.y + 3);
    ctx.fillText('W', wPt.x - 12, wPt.y + 3);
    ctx.restore();

    // --- 1. RENDER 3D SUN PATH CELESTIAL ARC ---
    if (sunPathTrajectory.length >= 2) {
      ctx.save();
      ctx.strokeStyle = 'rgba(251, 191, 36, 0.35)';
      ctx.lineWidth = 1.8;
      ctx.setLineDash([5, 4]);

      ctx.beginPath();
      const firstScr = project3D(sunPathTrajectory[0], width, height, scale);
      ctx.moveTo(firstScr.x, firstScr.y);

      sunPathTrajectory.forEach((p) => {
        const scr = project3D(p, width, height, scale);
        ctx.lineTo(scr.x, scr.y);

        if (p.hour % 3 === 0) {
          ctx.save();
          ctx.setLineDash([]);
          ctx.fillStyle = 'rgba(251, 191, 36, 0.8)';
          ctx.beginPath();
          ctx.arc(scr.x, scr.y, 2.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
      });
      ctx.stroke();
      ctx.restore();
    }

    // --- 1.5 RENDER GLOWING 3D SUN IN SKY ---
    if (sunPositionData.isDaylight) {
      const sunDist = 38;
      const sunX = sunDist * Math.sin(sunPositionData.azimuthRad) * Math.cos(sunPositionData.altitudeRad);
      const sunY = sunDist * Math.cos(sunPositionData.azimuthRad) * Math.cos(sunPositionData.altitudeRad);
      const sunZ = buildingHeight + sunDist * Math.sin(sunPositionData.altitudeRad);

      const sunScr = project3D({ x: sunX, y: sunY, z: sunZ }, width, height, scale);

      const sunGrad = ctx.createRadialGradient(sunScr.x, sunScr.y, 3, sunScr.x, sunScr.y, 32);
      sunGrad.addColorStop(0, '#fffbeb');
      sunGrad.addColorStop(0.3, '#fde047');
      sunGrad.addColorStop(0.6, 'rgba(245, 158, 11, 0.4)');
      sunGrad.addColorStop(1, 'rgba(245, 158, 11, 0)');

      ctx.fillStyle = sunGrad;
      ctx.beginPath();
      ctx.arc(sunScr.x, sunScr.y, 32, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(sunScr.x, sunScr.y, 6.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // --- 2. CALCULATE 3D OBSTACLE SHADOW POLYGONS ON ROOF DECK ---
    const localShadowPolygons: Point2D[][] = [];
    if (sunPositionData.isDaylight) {
      const shadowLengthFactor = Math.min(45, 1.0 / Math.tan(sunPositionData.altitudeRad));
      const dxShadow = Math.sin(sunPositionData.azimuthRad);
      const dyShadow = Math.cos(sunPositionData.azimuthRad);

      obs3D.forEach(obs => {
        const cappedLength = Math.min(obs.height * shadowLengthFactor, 40);

        if (obs.type === 'polygon' && obs.path && obs.path.length >= 3) {
          const poly = obs.path;
          for (let i = 0; i < poly.length; i++) {
            const v1 = poly[i];
            const v2 = poly[(i + 1) % poly.length];
            localShadowPolygons.push([
              v1, v2,
              { x: v2.x + cappedLength * dxShadow, y: v2.y + cappedLength * dyShadow },
              { x: v1.x + cappedLength * dxShadow, y: v1.y + cappedLength * dyShadow }
            ]);
          }
        } else {
          const px = -dyShadow;
          const py = dxShadow;
          const halfW = obs.width / 2;
          const bl: Point2D = { x: obs.center.x - halfW * px, y: obs.center.y - halfW * py };
          const br: Point2D = { x: obs.center.x + halfW * px, y: obs.center.y + halfW * py };
          const tl: Point2D = { x: bl.x + cappedLength * dxShadow, y: bl.y + cappedLength * dyShadow };
          const tr: Point2D = { x: br.x + cappedLength * dxShadow, y: br.y + cappedLength * dyShadow };
          localShadowPolygons.push([bl, br, tr, tl]);
        }
      });
    }

    // --- 3. RENDER 3D BUILDING WALLS ---
    const groundPoints = roofBase3D.map(p => project3D(p, width, height, scale));
    const roofPoints = roofTop3D.map(p => project3D(p, width, height, scale));

    if (roofPoints.length >= 3) {
      const numVertices = roofTop3D.length;
      for (let i = 0; i < numVertices; i++) {
        const nextIdx = (i + 1) % numVertices;
        const g1 = groundPoints[i];
        const g2 = groundPoints[nextIdx];
        const r1 = roofPoints[i];
        const r2 = roofPoints[nextIdx];

        const wallAngle = Math.atan2(roofTop3D[nextIdx].y - roofTop3D[i].y, roofTop3D[nextIdx].x - roofTop3D[i].x);
        const lightIntensity = Math.abs(Math.sin(wallAngle + (yaw * Math.PI) / 180));
        const wallBrightness = Math.round(85 + lightIntensity * 65);

        ctx.fillStyle = `rgb(${wallBrightness}, ${wallBrightness + 12}, ${wallBrightness + 28})`;
        ctx.strokeStyle = '#334155';
        ctx.lineWidth = 1.2;

        ctx.beginPath();
        ctx.moveTo(g1.x, g1.y);
        ctx.lineTo(g2.x, g2.y);
        ctx.lineTo(r2.x, r2.y);
        ctx.lineTo(r1.x, r1.y);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        const numFloors = Math.max(1, Math.floor(buildingHeight / 3));
        ctx.strokeStyle = 'rgba(255,255,255,0.15)';
        ctx.lineWidth = 0.8;
        for (let f = 1; f < numFloors; f++) {
          const fRatio = f / numFloors;
          const p1 = project3D({ ...roofBase3D[i], z: buildingHeight * fRatio }, width, height, scale);
          const p2 = project3D({ ...roofBase3D[nextIdx], z: buildingHeight * fRatio }, width, height, scale);
          ctx.beginPath();
          ctx.moveTo(p1.x, p1.y);
          ctx.lineTo(p2.x, p2.y);
          ctx.stroke();
        }
      }

      // --- 4. RENDER BUILDING ROOF DECK WITH ACCURATE BOUNDARY CLIPPED SHADOWS ---
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(roofPoints[0].x, roofPoints[0].y);
      for (let i = 1; i < roofPoints.length; i++) {
        ctx.lineTo(roofPoints[i].x, roofPoints[i].y);
      }
      ctx.closePath();
      ctx.clip(); // Clip everything strictly to roof polygon boundary!

      if (showSatelliteGround && satelliteImage) {
        const gBound = Math.max(dx, dy, 20) * 1.8;
        const gridDivs = 8;
        const step = (gBound * 2) / gridDivs;
        const imgW = satelliteImage.width;
        const imgH = satelliteImage.height;

        for (let gx = 0; gx < gridDivs; gx++) {
          for (let gy = 0; gy < gridDivs; gy++) {
            const x0 = -gBound + gx * step;
            const y0 = -gBound + gy * step;
            const x1 = x0 + step;
            const y1 = y0 + step;

            const p00 = project3D({ x: x0, y: y0, z: buildingHeight }, width, height, scale);
            const p10 = project3D({ x: x1, y: y0, z: buildingHeight }, width, height, scale);
            const p11 = project3D({ x: x1, y: y1, z: buildingHeight }, width, height, scale);
            const p01 = project3D({ x: x0, y: y1, z: buildingHeight }, width, height, scale);

            const u0 = (gx / gridDivs) * imgW;
            const v0 = ((gridDivs - gy) / gridDivs) * imgH;
            const u1 = ((gx + 1) / gridDivs) * imgW;
            const v1 = ((gridDivs - 1 - gy) / gridDivs) * imgH;

            drawTriangleTexture(ctx, satelliteImage, p00.x, p00.y, u0, v0, p10.x, p10.y, u1, v0, p01.x, p01.y, u0, v1);
            drawTriangleTexture(ctx, satelliteImage, p10.x, p10.y, u1, v0, p11.x, p11.y, u1, v1, p01.x, p01.y, u0, v1);
          }
        }
      } else {
        ctx.fillStyle = '#475569';
        ctx.fill();
      }

      // Render 3D Obstacle Shadows inside Roof Surface (No floating shadows)
      if (sunPositionData.isDaylight && localShadowPolygons.length > 0) {
        ctx.fillStyle = 'rgba(15, 23, 42, 0.65)';
        localShadowPolygons.forEach(poly => {
          const sPts = poly.map(pt => project3D({ x: pt.x, y: pt.y, z: buildingHeight + 0.02 }, width, height, scale));
          ctx.beginPath();
          ctx.moveTo(sPts[0].x, sPts[0].y);
          for (let i = 1; i < sPts.length; i++) {
            ctx.lineTo(sPts[i].x, sPts[i].y);
          }
          ctx.closePath();
          ctx.fill();
        });
      }

      ctx.restore();

      ctx.strokeStyle = '#64748b';
      ctx.lineWidth = 2.0;
      ctx.beginPath();
      ctx.moveTo(roofPoints[0].x, roofPoints[0].y);
      for (let i = 1; i < roofPoints.length; i++) {
        ctx.lineTo(roofPoints[i].x, roofPoints[i].y);
      }
      ctx.closePath();
      ctx.stroke();

      const parapetTop = roofTop3D.map(p => project3D({ ...p, z: buildingHeight + 0.35 }, width, height, scale));
      ctx.fillStyle = 'rgba(148, 163, 184, 0.3)';
      ctx.strokeStyle = '#94a3b8';
      ctx.lineWidth = 1.0;
      ctx.beginPath();
      ctx.moveTo(parapetTop[0].x, parapetTop[0].y);
      for (let i = 1; i < parapetTop.length; i++) {
        ctx.lineTo(parapetTop[i].x, parapetTop[i].y);
      }
      ctx.closePath();
      ctx.stroke();
    }

    // --- 5. RENDER PANELS & OBSTRUCTIONS ---
    const elementsToRender = [
      ...panels3D.map(p => ({ type: 'panel' as const, y: p.yCenter, data: p })),
      ...obs3D.map(o => ({ type: 'obstruction' as const, y: o.yCenter, data: o }))
    ];

    elementsToRender.sort((a, b) => b.y - a.y);

    elementsToRender.forEach(el => {
      if (el.type === 'panel') {
        const panel = el.data as Panel3DData;
        const pts = panel.bounds.map(p => project3D(p, width, height, scale));

        if (pts.length >= 4) {
          ctx.strokeStyle = '#cbd5e1';
          ctx.lineWidth = 1.4;
          panel.bounds.forEach(pBound => {
            const roofDeckPt = project3D({ x: pBound.x, y: pBound.y, z: buildingHeight }, width, height, scale);
            const panelPt = project3D(pBound, width, height, scale);
            ctx.beginPath();
            ctx.moveTo(roofDeckPt.x, roofDeckPt.y);
            ctx.lineTo(panelPt.x, panelPt.y);
            ctx.stroke();
          });

          const shadeInfo = realtimeShadeResults.panelShades.get(panel.id) ?? { percent: 0, isBackLit: false };
          const shadePct = shadeInfo.percent;

          const pGrad = ctx.createLinearGradient(pts[0].x, pts[0].y, pts[2].x, pts[2].y);
          if (shadeInfo.isBackLit) {
            pGrad.addColorStop(0, '#1e293b');
            pGrad.addColorStop(1, '#0f172a');
          } else if (shadePct > 40) {
            pGrad.addColorStop(0, '#ea580c');
            pGrad.addColorStop(1, '#9a3412');
          } else if (shadePct > 0) {
            pGrad.addColorStop(0, '#0284c7');
            pGrad.addColorStop(0.6, '#0369a1');
            pGrad.addColorStop(1, '#075985');
          } else {
            pGrad.addColorStop(0, '#2563eb');
            pGrad.addColorStop(0.5, '#1d4ed8');
            pGrad.addColorStop(1, '#1e3a8a');
          }

          ctx.fillStyle = pGrad;
          ctx.strokeStyle = shadePct > 40 ? '#f97316' : '#cbd5e1';
          ctx.lineWidth = 1.5;

          ctx.beginPath();
          ctx.moveTo(pts[0].x, pts[0].y);
          for (let i = 1; i < pts.length; i++) {
            ctx.lineTo(pts[i].x, pts[i].y);
          }
          ctx.closePath();
          ctx.fill();
          ctx.stroke();

          ctx.strokeStyle = 'rgba(255,255,255,0.45)';
          ctx.lineWidth = 0.8;
          const mLeft = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
          const mRight = { x: (pts[2].x + pts[3].x) / 2, y: (pts[2].y + pts[3].y) / 2 };
          ctx.beginPath();
          ctx.moveTo(mLeft.x, mLeft.y);
          ctx.lineTo(mRight.x, mRight.y);
          ctx.stroke();

          if (shadePct > 0 && !shadeInfo.isBackLit) {
            ctx.save();
            ctx.fillStyle = `rgba(15, 23, 42, ${Math.min(0.7, 0.3 + (shadePct / 100) * 0.4)})`;
            ctx.beginPath();
            ctx.moveTo(pts[0].x, pts[0].y);
            for (let i = 1; i < pts.length; i++) {
              ctx.lineTo(pts[i].x, pts[i].y);
            }
            ctx.closePath();
            ctx.fill();
            ctx.restore();
          }

          ctx.strokeStyle = 'rgba(255,255,255,0.25)';
          ctx.lineWidth = 0.6;
          ctx.beginPath();
          ctx.moveTo(pts[0].x + 2, pts[0].y + 2);
          ctx.lineTo(pts[1].x - 2, pts[1].y + 2);
          ctx.stroke();
        }
      } else {
        const obs = el.data as Obstruction3DData;
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 1.5;

        if (obs.type === 'polygon' && obs.path && obs.path.length >= 3) {
          const basePts = obs.path.map(pt => project3D({ x: pt.x, y: pt.y, z: buildingHeight }, width, height, scale));
          const topPts = obs.path.map(pt => project3D({ x: pt.x, y: pt.y, z: buildingHeight + obs.height }, width, height, scale));

          ctx.fillStyle = 'rgba(239, 68, 68, 0.3)';
          for (let i = 0; i < basePts.length; i++) {
            const nextIdx = (i + 1) % basePts.length;
            ctx.beginPath();
            ctx.moveTo(basePts[i].x, basePts[i].y);
            ctx.lineTo(basePts[nextIdx].x, basePts[nextIdx].y);
            ctx.lineTo(topPts[nextIdx].x, topPts[nextIdx].y);
            ctx.lineTo(topPts[i].x, topPts[i].y);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
          }

          ctx.fillStyle = 'rgba(239, 68, 68, 0.55)';
          ctx.beginPath();
          ctx.moveTo(topPts[0].x, topPts[0].y);
          for (let i = 1; i < topPts.length; i++) {
            ctx.lineTo(topPts[i].x, topPts[i].y);
          }
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        } else {
          const rad = obs.width / 2;
          const segments = 16;
          const baseRing: { x: number; y: number }[] = [];
          const topRing: { x: number; y: number }[] = [];

          for (let i = 0; i < segments; i++) {
            const theta = (i * 2 * Math.PI) / segments;
            const ox = rad * Math.cos(theta);
            const oy = rad * Math.sin(theta);
            baseRing.push(project3D({ x: obs.center.x + ox, y: obs.center.y + oy, z: buildingHeight }, width, height, scale));
            topRing.push(project3D({ x: obs.center.x + ox, y: obs.center.y + oy, z: buildingHeight + obs.height }, width, height, scale));
          }

          ctx.fillStyle = 'rgba(239, 68, 68, 0.3)';
          for (let i = 0; i < segments; i++) {
            const nextIdx = (i + 1) % segments;
            ctx.beginPath();
            ctx.moveTo(baseRing[i].x, baseRing[i].y);
            ctx.lineTo(baseRing[nextIdx].x, baseRing[nextIdx].y);
            ctx.lineTo(topRing[nextIdx].x, topRing[nextIdx].y);
            ctx.lineTo(topRing[i].x, topRing[i].y);
            ctx.closePath();
            ctx.fill();
            if (i % 4 === 0) ctx.stroke();
          }

          ctx.fillStyle = 'rgba(239, 68, 68, 0.6)';
          ctx.beginPath();
          ctx.moveTo(topRing[0].x, topRing[0].y);
          for (let i = 1; i < topRing.length; i++) {
            ctx.lineTo(topRing[i].x, topRing[i].y);
          }
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        }
      }
    });
  }, [geometry3D, yaw, pitch, zoom, buildingHeight, project3D, sunPositionData, showSatelliteGround, satelliteImage, sunPathTrajectory, realtimeShadeResults]);

  // MOUSE & TOUCH EVENT HANDLERS
  const handleCanvasMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    isDraggingRef.current = true;
    dragStartRef.current = { x: e.clientX, y: e.clientY };
  };

  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || !geometry3D) return;

    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const { dx, dy, panels3D, tiltDeg } = geometry3D;
    const maxBound = Math.max(dx, dy, buildingHeight * 1.5, 12);
    const scale = (Math.min(canvas.clientWidth, canvas.clientHeight) * 0.5) / maxBound;

    let foundPanel: HoveredPanelInfo | null = null;

    for (const p of panels3D) {
      const pts2D = p.bounds.map(pt => project3D(pt, canvas.clientWidth, canvas.clientHeight, scale));
      if (isPointInPolygon({ x: mouseX, y: mouseY }, pts2D)) {
        const shade = realtimeShadeResults.panelShades.get(p.id);
        foundPanel = {
          id: p.id,
          screenX: mouseX,
          screenY: mouseY,
          shadePercent: shade?.percent ?? 0,
          isBackLit: shade?.isBackLit ?? false,
          tiltDeg
        };
        break;
      }
    }
    setHoveredPanel(foundPanel);
  };

  const handleTouchStart = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (e.touches.length === 1) {
      isDraggingRef.current = true;
      dragStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDraggingRef.current || e.touches.length !== 1) return;
    const dx = e.touches[0].clientX - dragStartRef.current.x;
    const dy = e.touches[0].clientY - dragStartRef.current.y;

    setYaw(prev => (prev + dx * 0.5) % 360);
    setPitch(prev => Math.max(5, Math.min(88, prev + dy * 0.4)));

    dragStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };

  const handleTouchEnd = () => {
    isDraggingRef.current = false;
  };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    setZoom(z => Math.max(0.4, Math.min(3.0, z - e.deltaY * 0.0015)));
  };

  const formatTimeStr = (hourVal: number) => {
    const h = Math.floor(hourVal);
    const m = Math.round((hourVal - h) * 60);
    const mStr = m < 10 ? `0${m}` : `${m}`;
    const period = h >= 12 ? 'PM' : 'AM';
    const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return `${h12}:${mStr} ${period}`;
  };

  const handleSunEyeView = () => {
    if (!sunPositionData.isDaylight) return;
    setYaw(Math.round(sunPositionData.azimuthDeg));
    setPitch(Math.max(10, Math.min(85, Math.round(sunPositionData.altitudeDeg))));
    setZoom(1.1);
  };

  // IF NO ROOF POLYGON IS DRAWN YET, DISPLAY SLEEK 3D PLACEHOLDER STATE (NO CRASH!)
  if (!roofPolygon || roofPolygon.length < 3) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-slate-950 text-white p-6 relative overflow-hidden select-none">
        <div className="absolute inset-0 bg-radial from-emerald-950/30 via-slate-950 to-slate-950 pointer-events-none"></div>

        <div className="relative z-10 max-w-md text-center flex flex-col items-center space-y-4 bg-slate-900/90 border border-slate-800 p-8 rounded-3xl shadow-2xl backdrop-blur-xl">
          <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shadow-lg shadow-emerald-500/10 animate-bounce-slow">
            <Rotate3d className="w-8 h-8" />
          </div>

          <div>
            <h3 className="text-base font-black text-white uppercase tracking-tight">3D Model Ready</h3>
            <p className="text-xs text-slate-400 mt-1.5 leading-relaxed font-semibold">
              Please draw a roof boundary polygon on the <b className="text-emerald-400">2D Map view</b> first. The 3D solar ray-tracing simulation will automatically generate your building, solar panels, and shadows in 3D!
            </p>
          </div>

          {onSwitchTo2D && (
            <button
              onClick={onSwitchTo2D}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs py-2.5 px-5 rounded-xl shadow-lg shadow-emerald-600/20 transition-all flex items-center space-x-2 cursor-pointer active:scale-95"
            >
              <MapPin className="w-4 h-4" />
              <span>Go to 2D Map to Draw Roof</span>
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full relative flex flex-col bg-slate-950 overflow-hidden select-none">
      {/* 3D View Canvas */}
      <canvas
        ref={canvasRef}
        onMouseDown={handleCanvasMouseDown}
        onMouseMove={handleCanvasMouseMove}
        onMouseLeave={() => setHoveredPanel(null)}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onWheel={handleWheel}
        className="roof-3d-canvas w-full flex-1 cursor-grab active:cursor-grabbing touch-none"
      />

      {/* Interactive Panel Hover Badge */}
      {hoveredPanel && (
        <div
          className="absolute z-40 pointer-events-none transform -translate-x-1/2 -translate-y-full bg-slate-900/95 border border-slate-700 text-white p-2 px-3 rounded-xl shadow-2xl backdrop-blur-md flex flex-col space-y-1 text-[10px]"
          style={{ left: hoveredPanel.screenX, top: hoveredPanel.screenY - 12 }}
        >
          <div className="flex items-center justify-between space-x-3 border-b border-slate-800 pb-1">
            <span className="font-black text-slate-300">Panel #{hoveredPanel.id}</span>
            <span className={`px-1.5 py-0.5 rounded text-[9px] font-black ${
              hoveredPanel.isBackLit
                ? 'bg-indigo-900/80 text-indigo-300'
                : hoveredPanel.shadePercent > 40
                ? 'bg-red-900/80 text-red-300'
                : hoveredPanel.shadePercent > 0
                ? 'bg-amber-900/80 text-amber-300'
                : 'bg-emerald-900/80 text-emerald-300'
            }`}>
              {hoveredPanel.isBackLit ? '🌙 Dusk Backlit' : hoveredPanel.shadePercent === 0 ? '☀️ 100% Direct Sun' : `⛅ ${hoveredPanel.shadePercent}% Shaded`}
            </span>
          </div>
          <div className="flex justify-between space-x-3 text-[9px] text-slate-400">
            <span>Tilt: <b className="text-white">{hoveredPanel.tiltDeg}° South</b></span>
            <span>Racking: <b className="text-white">0.35m</b></span>
          </div>
        </div>
      )}

      {/* Top HUD: Title & Live Solar Metrics */}
      <div className="absolute top-4 left-4 right-4 flex justify-between items-start pointer-events-none">
        <div className="bg-slate-900/90 border border-slate-800 text-white p-3 rounded-2xl flex items-center space-x-2.5 shadow-lg backdrop-blur-md pointer-events-auto">
          <Rotate3d className="w-5 h-5 text-emerald-500 animate-spin-slow shrink-0" />
          <div>
            <h4 className="text-[10px] font-black tracking-tight uppercase flex items-center space-x-1.5">
              <span>3D Solar Ray-Tracing Engine</span>
              <span className="bg-emerald-500/20 text-emerald-400 text-[8px] px-1.5 py-0.2 rounded-full font-bold">PHYSICS ACCURATE</span>
            </h4>
            <p className="text-[9px] text-slate-400 font-semibold mt-0.5">
              3D Elevation • Surface Normal Vector • 5-Point Hit Test
            </p>
          </div>
        </div>

        {/* Live Metrics Ribbon */}
        <div className="bg-slate-900/90 border border-slate-800 text-slate-300 p-2 px-3.5 rounded-2xl flex items-center space-x-3 shadow-lg backdrop-blur-md pointer-events-auto">
          <div className="flex items-center space-x-1.5">
            <Zap className="w-3.5 h-3.5 text-amber-400" />
            <div className="text-[9px]">
              <span className="text-slate-400 font-bold">Active: </span>
              <span className="text-white font-black">{realtimeShadeResults.activeCount}/{panels.length}</span>
            </div>
          </div>

          <div className="flex items-center space-x-1.5 border-l border-r border-slate-800 px-3">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <div className="text-[9px]">
              <span className="text-slate-400 font-bold">Live Loss: </span>
              <span className={`font-black ${realtimeShadeResults.overallLoss > 30 ? 'text-red-400' : realtimeShadeResults.overallLoss > 10 ? 'text-amber-400' : 'text-emerald-400'}`}>
                {realtimeShadeResults.overallLoss}%
              </span>
            </div>
          </div>

          <button
            onClick={() => setShowSatelliteGround(prev => !prev)}
            className={`p-1.5 px-2.5 rounded-xl transition-all cursor-pointer flex items-center space-x-1.5 text-[10px] font-black border ${
              showSatelliteGround
                ? 'bg-emerald-600 border-emerald-500 text-white shadow-sm'
                : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white'
            }`}
            title="Toggle 3D Satellite Map Neighborhood Texture"
          >
            <MapIcon className="w-3.5 h-3.5" />
            <span>{showSatelliteGround ? 'Satellite' : 'Grid'}</span>
          </button>

          <div className="flex items-center space-x-1.5 pl-1">
            <Building2 className="w-3.5 h-3.5 text-emerald-400" />
            <input
              type="range"
              min="3"
              max="25"
              step="0.5"
              value={buildingHeight}
              onChange={(e) => setBuildingHeight(parseFloat(e.target.value))}
              className="w-14 accent-emerald-500 h-1 bg-slate-700 rounded-lg cursor-pointer outline-none"
              title={`Building Height: ${buildingHeight}m`}
            />
            <span className="text-[9px] font-black text-emerald-400 w-7">{buildingHeight.toFixed(1)}m</span>
          </div>
        </div>
      </div>

      {/* MORNING TO EVENING SUN SHADING CONTROLLER TOOLBAR */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-slate-900/95 border border-slate-800 text-slate-200 p-2.5 px-4 rounded-2xl flex flex-col items-center space-y-2.5 shadow-2xl backdrop-blur-md z-30 min-w-[500px]">
        <div className="flex justify-between items-center w-full">
          <div className="flex items-center space-x-2">
            <Sun className="w-4 h-4 text-amber-400 animate-pulse" />
            <span className="text-xs font-black text-white">{formatTimeStr(simHour)}</span>
            <span className="text-[9px] text-slate-400 font-semibold">
              ({sunPositionData.isDaylight ? `Alt: ${Math.round(sunPositionData.altitudeDeg)}° • Az: ${Math.round(sunPositionData.azimuthDeg)}°` : 'Night'})
            </span>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={() => setSimSpeed(s => s === 1 ? 2 : s === 2 ? 5 : 1)}
              className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-amber-400 font-black text-[9px] rounded-lg border border-slate-700 cursor-pointer"
              title="Simulation Speed"
            >
              {simSpeed}x Speed
            </button>

            <button
              onClick={() => setIsSimulatingDay(prev => !prev)}
              className={`p-1.5 px-3 rounded-xl transition-all cursor-pointer flex items-center space-x-1.5 text-[10px] font-extrabold ${
                isSimulatingDay
                  ? 'bg-amber-500 text-slate-950 shadow-md ring-2 ring-amber-400/30 animate-pulse'
                  : 'bg-emerald-600 hover:bg-emerald-700 text-white'
              }`}
            >
              {isSimulatingDay ? <Pause className="w-3.5 h-3.5 fill-current" /> : <Play className="w-3.5 h-3.5 fill-current" />}
              <span>{isSimulatingDay ? 'Pause' : 'Simulate (6AM-6PM)'}</span>
            </button>
          </div>
        </div>

        <div className="w-full flex items-center space-x-2">
          <span className="text-[9px] font-bold text-amber-400 flex items-center space-x-0.5">
            <Sun className="w-3 h-3" />
            <span>6 AM</span>
          </span>
          <input
            type="range"
            min="6.0"
            max="18.0"
            step="0.25"
            value={simHour}
            onChange={(e) => setSimHour(parseFloat(e.target.value))}
            className="w-full accent-amber-400 h-1.5 bg-slate-800 rounded-lg cursor-pointer outline-none"
          />
          <span className="text-[9px] font-bold text-slate-400 flex items-center space-x-0.5">
            <Moon className="w-3 h-3 text-indigo-400" />
            <span>6 PM</span>
          </span>
        </div>

        <div className="flex justify-between items-center w-full border-t border-slate-800/80 pt-2 text-[9px] text-slate-400 font-semibold">
          <div className="flex items-center space-x-1">
            <button
              onClick={() => setYaw(y => (y - 45) % 360)}
              className="p-1 px-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition-all cursor-pointer flex items-center space-x-1 font-extrabold"
              title="Rotate Left 45°"
            >
              <RotateCcw className="w-3 h-3" />
              <span>-45°</span>
            </button>
            <button
              onClick={() => setYaw(y => (y + 45) % 360)}
              className="p-1 px-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition-all cursor-pointer flex items-center space-x-1 font-extrabold"
              title="Rotate Right 45°"
            >
              <RotateCw className="w-3 h-3" />
              <span>+45°</span>
            </button>
          </div>

          <div className="flex items-center space-x-1">
            <button
              onClick={() => { setYaw(-35); setPitch(32); setZoom(1.0); }}
              className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg transition-all cursor-pointer font-bold"
              title="3D Isometric Orbit"
            >
              Isometric
            </button>
            <button
              onClick={() => { setYaw(0); setPitch(88); setZoom(1.05); }}
              className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg transition-all cursor-pointer font-bold"
              title="Top-Down Plan View"
            >
              Top Deck
            </button>
            <button
              onClick={() => { setYaw(0); setPitch(18); setZoom(1.0); }}
              className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg transition-all cursor-pointer font-bold"
              title="South Elevation Front View"
            >
              South Front
            </button>
            <button
              onClick={handleSunEyeView}
              className="px-2 py-1 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30 rounded-lg transition-all cursor-pointer font-bold flex items-center space-x-1"
              title="View directly from Sun's perspective"
            >
              <Eye className="w-3 h-3" />
              <span>Sun-Eye</span>
            </button>
          </div>

          <button
            onClick={() => setIsAutoRotating(prev => !prev)}
            className={`p-1 px-2 rounded-lg transition-all cursor-pointer flex items-center space-x-1 text-[9px] font-extrabold ${
              isAutoRotating ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            <Sparkles className="w-3 h-3" />
            <span>{isAutoRotating ? 'Spin On' : '360° Spin'}</span>
          </button>
        </div>
      </div>

      {/* Bottom Left Info Indicator */}
      <div className="absolute bottom-4 left-4 bg-slate-900/80 border border-slate-800 p-2 px-3 rounded-xl flex items-center space-x-1.5 text-[9px] font-bold text-slate-400 shadow backdrop-blur select-none pointer-events-none">
        <Clock className="w-3.5 h-3.5 text-amber-400" />
        <span>Shading Forecast for {formatTimeStr(simHour)}</span>
      </div>
    </div>
  );
};

export default Roof3DViewer;

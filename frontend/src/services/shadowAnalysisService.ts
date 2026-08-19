import SunCalc from 'suncalc';
import { isPointInPolygon, latLngToMeters } from './geometryUtils';
import type { Point2D } from './geometryUtils';
import type { FittedPanel, Obstruction } from './panelLayoutService';

export interface ShadingAnalysisResult {
  panels: FittedPanel[];
  overallShadingLoss: number;
  totalRecommended: number;
  totalNotRecommended: number;
  usablePanelsCount: number;
}

export interface ShadowVisualizationResult {
  shadowPolygons: Point2D[][];  // in local meter coords
  sunAltitude: number;
  sunAzimuth: number;
  timestamp: Date;
}

export interface ShadingConfig {
  analysisDate?: Date;       // specific date for analysis (defaults to seasonal sampling)
  timeStart?: number;        // start hour (default 9)
  timeEnd?: number;          // end hour (default 17)
  panelTiltDeg?: number;     // panel tilt in degrees
  panelAzimuthDeg?: number;  // panel azimuth in degrees
}

/**
 * Calculate the suggestive pitch distance based on panel tilt, length, and latitude.
 * Uses the winter solstice noon solar altitude to ensure no inter-row shading.
 * Formula: pitchDistance = panelLength × sin(tilt) / tan(winterSolarAltitude) + panelLength × cos(tilt)
 */
export function calculateSuggestedPitchDistance(
  panelLengthM: number,
  tiltDeg: number,
  latitudeDeg: number
): number {
  if (tiltDeg <= 0) return panelLengthM;

  // Winter solstice noon solar altitude ≈ 90 - latitude - 23.45
  const winterSolarAltitudeDeg = 90 - Math.abs(latitudeDeg) - 23.45;
  const winterSolarAltitudeRad = (Math.max(winterSolarAltitudeDeg, 5) * Math.PI) / 180;
  const tiltRad = (tiltDeg * Math.PI) / 180;

  // Shadow length from tilted panel rear edge
  const panelHeight = panelLengthM * Math.sin(tiltRad);
  const shadowLength = panelHeight / Math.tan(winterSolarAltitudeRad);

  // Total pitch = horizontal projection of panel + shadow gap
  const horizontalProjection = panelLengthM * Math.cos(tiltRad);
  const pitch = horizontalProjection + shadowLength;

  return Math.round(pitch * 100) / 100; // round to cm
}

/**
 * Calculate shadow polygons for a specific date/time for real-time map visualization.
 * Returns shadow polygons in local meter coordinates relative to siteLatLng.
 */
export function calculateShadowPolygonsForVisualization(
  obstructions: Obstruction[],
  siteLatLng: { lat: number; lng: number },
  dateTime: Date,
  googleMaps: any
): ShadowVisualizationResult {
  const origin = siteLatLng;
  const sunPos = SunCalc.getPosition(dateTime, siteLatLng.lat, siteLatLng.lng);
  const altitude = sunPos.altitude;
  const azimuth = sunPos.azimuth;

  if (altitude <= 0) {
    return {
      shadowPolygons: [],
      sunAltitude: (altitude * 180) / Math.PI,
      sunAzimuth: (azimuth * 180) / Math.PI,
      timestamp: dateTime
    };
  }

  const localObs = obstructions.map(obs => {
    const localPath = obs.type === 'polygon' && obs.path
      ? obs.path.map(pt => latLngToMeters(pt, origin, googleMaps))
      : undefined;
    const localPos = latLngToMeters({ lat: obs.lat, lng: obs.lng }, origin, googleMaps);
    return { id: obs.id, type: obs.type, height: obs.heightMeters, width: obs.widthMeters, localPos, localPath };
  });

  const shadowPolygons: Point2D[][] = [];

  localObs.forEach(obs => {
    const shadowLength = Math.min(obs.height / Math.tan(altitude), 50);
    const dx = Math.sin(azimuth);
    const dy = Math.cos(azimuth);

    if (obs.type === 'polygon' && obs.localPath && obs.localPath.length >= 3) {
      const poly = obs.localPath;
      for (let i = 0; i < poly.length; i++) {
        const v1 = poly[i];
        const v2 = poly[(i + 1) % poly.length];
        shadowPolygons.push([
          v1, v2,
          { x: v2.x + shadowLength * dx, y: v2.y + shadowLength * dy },
          { x: v1.x + shadowLength * dx, y: v1.y + shadowLength * dy }
        ]);
      }
    } else {
      const px = -dy;
      const py = dx;
      const halfW = obs.width / 2;
      const bl: Point2D = { x: obs.localPos.x - halfW * px, y: obs.localPos.y - halfW * py };
      const br: Point2D = { x: obs.localPos.x + halfW * px, y: obs.localPos.y + halfW * py };
      const tl: Point2D = { x: bl.x + shadowLength * dx, y: bl.y + shadowLength * dy };
      const tr: Point2D = { x: br.x + shadowLength * dx, y: br.y + shadowLength * dy };
      shadowPolygons.push([bl, br, tr, tl]);
    }
  });

  return {
    shadowPolygons,
    sunAltitude: (altitude * 180) / Math.PI,
    sunAzimuth: (azimuth * 180) / Math.PI,
    timestamp: dateTime
  };
}

/**
 * Helper: Test if a 3D point (px, py, pz) is shaded by an obstruction when looking towards the sun.
 * Ray direction towards the sun: dx = -sin(azimuth), dy = -cos(azimuth), dz = tan(altitude)
 */
export function isPointShadedByObstruction(
  p: { x: number; y: number; z: number },
  obs: {
    type: string;
    height: number;
    width: number;
    localPos: Point2D;
    localPath?: Point2D[];
  },
  altitudeRad: number,
  azimuthRad: number,
  buildingRoofHeight: number = 0
): boolean {
  if (altitudeRad <= 0) return true; // Night / below horizon

  const zBase = buildingRoofHeight;
  const zTop = buildingRoofHeight + obs.height;

  // If obstacle top is lower than point, it cannot shade it
  if (zTop <= p.z) return false;

  const tanAlt = Math.tan(altitudeRad);
  if (tanAlt <= 0.001) return true;

  // The ray from p towards the sun reaches height z at distance t:
  // p.z + t * tanAlt = z  =>  t = (z - p.z) / tanAlt
  const tMin = Math.max(0, (zBase - p.z) / tanAlt);
  const tMax = (zTop - p.z) / tanAlt;

  if (tMax <= tMin) return false;

  const dirX = -Math.sin(azimuthRad);
  const dirY = -Math.cos(azimuthRad);

  // Sample points along the ray segment from tMin to tMax
  const steps = 6;
  for (let s = 0; s <= steps; s++) {
    const t = tMin + (tMax - tMin) * (s / steps);
    const qx = p.x + t * dirX;
    const qy = p.y + t * dirY;
    const qPt: Point2D = { x: qx, y: qy };

    if (obs.type === 'polygon' && obs.localPath && obs.localPath.length >= 3) {
      if (isPointInPolygon(qPt, obs.localPath)) {
        return true;
      }
    } else {
      // Circular / cylinder obstruction
      const rad = obs.width / 2;
      const distSq = (qx - obs.localPos.x) ** 2 + (qy - obs.localPos.y) ** 2;
      if (distSq <= rad * rad) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Perform shading analysis for each fitted panel using 3D raycasting and multi-point sampling.
 * Supports custom date, time range, and panel tilt/azimuth.
 */
export function calculateShading(
  panels: FittedPanel[],
  obstructions: Obstruction[],
  siteLatLng: { lat: number; lng: number },
  googleMaps: any,
  config?: ShadingConfig
): ShadingAnalysisResult {
  if (panels.length === 0) {
    return {
      panels,
      overallShadingLoss: 0,
      totalRecommended: 0,
      totalNotRecommended: 0,
      usablePanelsCount: 0
    };
  }

  // Determine sample dates
  const sampleDates: Date[] = [];
  if (config?.analysisDate) {
    // Use the specific user-selected date
    sampleDates.push(new Date(config.analysisDate));
  } else {
    // Default: seasonal sampling (solstices + equinoxes)
    sampleDates.push(
      new Date(2026, 5, 21),   // Summer Solstice
      new Date(2026, 11, 21),  // Winter Solstice
      new Date(2026, 2, 21),   // Spring Equinox
      new Date(2026, 8, 21)    // Autumn Equinox
    );
  }

  // Determine hourly sample range
  const startHour = config?.timeStart ?? 9;
  const endHour = config?.timeEnd ?? 17;
  const sampleHours: number[] = [];
  for (let h = startHour; h <= endHour; h++) {
    sampleHours.push(h);
  }

  const totalSlots = sampleDates.length * sampleHours.length;
  const origin = siteLatLng;

  // Track shading percentage sum per panel across all sample time slots
  const panelShadeLossSums = new Map<string, number>();
  panels.forEach(p => panelShadeLossSums.set(p.id, 0));

  // Convert obstructions to local coordinates
  const localObs = obstructions.map(obs => {
    const localPath = obs.type === 'polygon' && obs.path
      ? obs.path.map(pt => latLngToMeters(pt, origin, googleMaps))
      : undefined;
    const localPos = latLngToMeters({ lat: obs.lat, lng: obs.lng }, origin, googleMaps);
    return { id: obs.id, type: obs.type, height: obs.heightMeters, width: obs.widthMeters, localPos, localPath };
  });

  const tiltDeg = config?.panelTiltDeg ?? 15;
  const tiltRad = (tiltDeg * Math.PI) / 180;
  const azimuthTiltDeg = config?.panelAzimuthDeg ?? 180; // Default 180° = True South

  // Loop through all sample dates and hours
  sampleDates.forEach(date => {
    sampleHours.forEach(hour => {
      const dateTime = new Date(date);
      dateTime.setHours(hour, 0, 0, 0);

      const sunPos = SunCalc.getPosition(dateTime, siteLatLng.lat, siteLatLng.lng);
      const altitude = sunPos.altitude;
      const azimuth = sunPos.azimuth;

      if (altitude <= 0) {
        // Night - 100% loss
        panels.forEach(p => {
          panelShadeLossSums.set(p.id, (panelShadeLossSums.get(p.id) || 0) + 100);
        });
        return;
      }

      // Check sun vector vs panel surface normal (dot product)
      // Panel normal facing South (+tilt): N = (0, -sin(tilt), cos(tilt))
      // Sun vector from earth to sun: S = (sin(azimuth)*cos(alt), -cos(azimuth)*cos(alt), sin(alt))
      const sunCosAlt = Math.cos(altitude);
      const sunSinAlt = Math.sin(altitude);
      const sunDirY = -Math.cos(azimuth) * sunCosAlt;
      const normalDotSun = sunDirY * (-Math.sin(tiltRad)) + sunSinAlt * Math.cos(tiltRad);
      const isPast90Cutoff = Math.abs((azimuth * 180) / Math.PI) > 90;
      const isBackLit = isPast90Cutoff || normalDotSun <= 0.05; // Sun is behind panel tilt plane

      panels.forEach(p => {
        if (isBackLit) {
          // If the sun is completely behind the panel's active surface
          panelShadeLossSums.set(p.id, (panelShadeLossSums.get(p.id) || 0) + 100);
          return;
        }

        // Test 5 sample points on the panel (4 corners + center)
        const b = p.localBounds;
        const pts3D: { x: number; y: number; z: number }[] = [
          { x: b[0].x, y: b[0].y, z: 0.35 },
          { x: b[1].x, y: b[1].y, z: 0.35 },
          { x: b[2].x, y: b[2].y, z: 0.35 + (b[2].y - b[0].y) * Math.sin(tiltRad) },
          { x: b[3].x, y: b[3].y, z: 0.35 + (b[3].y - b[1].y) * Math.sin(tiltRad) },
          { x: p.localCenter.x, y: p.localCenter.y, z: 0.35 + 0.5 * (b[2].y - b[0].y) * Math.sin(tiltRad) }
        ];

        let shadedPoints = 0;
        pts3D.forEach(pt => {
          const shaded = localObs.some(obs =>
            isPointShadedByObstruction(pt, obs, altitude, azimuth, 0)
          );
          if (shaded) shadedPoints++;
        });

        const slotLossPercent = (shadedPoints / pts3D.length) * 100;
        panelShadeLossSums.set(p.id, (panelShadeLossSums.get(p.id) || 0) + slotLossPercent);
      });
    });
  });

  // Compute final shading scores
  let totalRecommended = 0;
  let totalNotRecommended = 0;
  let shadingLossSum = 0;

  const updatedPanels = panels.map(p => {
    const rawLossSum = panelShadeLossSums.get(p.id) || 0;
    const shadingLoss = Math.min(100, Math.max(0, Math.round(rawLossSum / totalSlots)));
    const isRecommended = shadingLoss <= 30; // Standard solar recommendation threshold <= 30% loss

    if (isRecommended) {
      totalRecommended++;
      shadingLossSum += shadingLoss;
    } else {
      totalNotRecommended++;
    }

    return { ...p, shadingLoss, isRecommended };
  });

  const overallShadingLoss = totalRecommended > 0 ? Math.round(shadingLossSum / totalRecommended) : 0;

  return {
    panels: updatedPanels,
    overallShadingLoss,
    totalRecommended,
    totalNotRecommended,
    usablePanelsCount: totalRecommended
  };
}

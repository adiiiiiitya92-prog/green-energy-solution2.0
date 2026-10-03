import React, { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';

// Vite default marker asset import fix
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

// Override the Default Icon prototype safely
if (typeof window !== 'undefined' && L?.Icon?.Default?.prototype) {
  try {
    delete (L.Icon.Default.prototype as any)._getIconUrl;
    L.Icon.Default.mergeOptions({
      iconUrl: markerIcon,
      iconRetinaUrl: markerIcon2x,
      shadowUrl: markerShadow,
    });
  } catch (_) {}
}

interface LeafletMapProps {
  latitude: number;
  longitude: number;
  placeName?: string;
  zoom?: number;
}

// Sub-component to pan map if coordinates change
const RecenterMap: React.FC<{ latitude: number; longitude: number }> = ({ latitude, longitude }) => {
  const map = useMap();
  useEffect(() => {
    map.setView([latitude, longitude], map.getZoom());
  }, [latitude, longitude, map]);
  return null;
};

export const LeafletMap: React.FC<LeafletMapProps> = ({
  latitude,
  longitude,
  placeName = 'Location Pin',
  zoom = 15
}) => {
  const position: [number, number] = [latitude, longitude];

  const handleOpenGoogleMaps = () => {
    window.open(`https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`, '_blank');
  };

  return (
    <div className="flex flex-col space-y-2 w-full">
      <div className="h-64 w-full overflow-hidden border border-slate-200 rounded-xl shadow-inner relative bg-slate-100">
        <MapContainer center={position} zoom={zoom} scrollWheelZoom={false}>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <Marker position={position}>
            <Popup>
              <div className="text-xs font-semibold">{placeName}</div>
            </Popup>
          </Marker>
          <RecenterMap latitude={latitude} longitude={longitude} />
        </MapContainer>
      </div>
      <div className="flex justify-between items-center text-xs text-slate-500">
        <span className="truncate max-w-[70%] font-medium">📍 {placeName}</span>
        <button
          onClick={handleOpenGoogleMaps}
          type="button"
          className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-semibold rounded-lg shadow-sm transition-colors cursor-pointer flex items-center gap-1 shrink-0"
        >
          <span>Open in Google Maps</span>
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
        </button>
      </div>
    </div>
  );
};

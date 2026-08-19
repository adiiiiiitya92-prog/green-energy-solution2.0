import React, { useState, useEffect, useRef } from 'react';
import { Search, MapPin, Navigation, Loader2, Building, CheckCircle2, AlertCircle } from 'lucide-react';

interface SiteMapPickerProps {
  onAddressSelect: (lat: number, lng: number, address: string) => void;
  isLoaded: boolean;
}

interface SearchResult {
  lat: number;
  lng: number;
  displayName: string;
  shortName: string;
}

export const SiteMapPicker: React.FC<SiteMapPickerProps> = ({ onAddressSelect, isLoaded }) => {
  // Address Search State
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [showResultsDropdown, setShowResultsDropdown] = useState(false);

  // Manual Coordinates State
  const [manualLat, setManualLat] = useState('28.6139');
  const [manualLng, setManualLng] = useState('77.2090');
  const [siteName, setSiteName] = useState('New Delhi Site');

  // GPS Fetching State
  const [isFetchingGps, setIsFetchingGps] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  const searchContainerRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
        setShowResultsDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  /**
   * Geocode address using Google Maps Geocoder API with seamless fallback to OpenStreetMap Nominatim
   */
  const geocodeAddress = async (query: string): Promise<SearchResult[]> => {
    const results: SearchResult[] = [];

    // 1. Try OpenStreetMap Nominatim (Free, no billing required)
    try {
      const resp = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&countrycodes=in&limit=5`,
        {
          headers: {
            'Accept-Language': 'en',
            'User-Agent': 'SolarCRM-ShadowAnalysis/2.0'
          }
        }
      );
      const data = await resp.json();
      if (data && data.length > 0) {
        data.forEach((place: any) => {
          results.push({
            lat: parseFloat(place.lat),
            lng: parseFloat(place.lon),
            displayName: place.display_name,
            shortName: place.display_name.split(',')[0]
          });
        });
        if (results.length > 0) return results;
      }
    } catch (nomErr) {
      // Fallback below
    }

    // 2. Try Google Maps Geocoder if loaded
    if (window.google?.maps?.Geocoder) {
      try {
        const geocoder = new window.google.maps.Geocoder();
        const response = await geocoder.geocode({
          address: query,
          region: 'IN'
        });

        if (response.results && response.results.length > 0) {
          response.results.slice(0, 5).forEach(item => {
            results.push({
              lat: item.geometry.location.lat(),
              lng: item.geometry.location.lng(),
              displayName: item.formatted_address,
              shortName: item.address_components?.[0]?.long_name || item.formatted_address.split(',')[0]
            });
          });
          return results;
        }
      } catch {
        // Silent fallback
      }
    }

    return results;
  };

  /**
   * Reverse Geocode (Lat/Lng -> Formatted Address)
   */
  const reverseGeocode = async (lat: number, lng: number): Promise<string> => {
    // 1. Try Nominatim reverse geocode first (Free, no billing needed)
    try {
      const resp = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`,
        {
          headers: {
            'Accept-Language': 'en',
            'User-Agent': 'SolarCRM-ShadowAnalysis/2.0'
          }
        }
      );
      const data = await resp.json();
      if (data?.display_name) return data.display_name;
    } catch {
      // Silent fallback
    }

    // 2. Try Google Maps Geocoder
    if (window.google?.maps?.Geocoder) {
      try {
        const geocoder = new window.google.maps.Geocoder();
        const response = await geocoder.geocode({
          location: { lat, lng }
        });
        if (response.results && response.results.length > 0) {
          return response.results[0].formatted_address;
        }
      } catch {
        // Silent fallback
      }
    }

    return `Coordinates: ${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  };

  const handleSearchSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    setIsSearching(true);
    setStatusMessage(null);

    const matches = await geocodeAddress(searchQuery.trim());
    setIsSearching(false);

    if (matches.length > 0) {
      setSearchResults(matches);
      setShowResultsDropdown(true);

      // Auto-select first exact match
      const primary = matches[0];
      setManualLat(primary.lat.toFixed(6));
      setManualLng(primary.lng.toFixed(6));
      setSiteName(primary.shortName);
    } else {
      setStatusMessage({
        type: 'error',
        text: 'No matching location found. Please verify address or enter latitude & longitude manually.'
      });
    }
  };

  const handleSelectLocation = (result: SearchResult) => {
    setManualLat(result.lat.toFixed(6));
    setManualLng(result.lng.toFixed(6));
    setSiteName(result.shortName);
    setSearchQuery(result.displayName);
    setShowResultsDropdown(false);
    setStatusMessage({
      type: 'success',
      text: `Located: ${result.shortName}`
    });

    onAddressSelect(result.lat, result.lng, result.displayName);
  };

  const handleFetchCurrentLocation = () => {
    if (!navigator.geolocation) {
      alert("Geolocation is not supported by your browser.");
      return;
    }

    setIsFetchingGps(true);
    setStatusMessage({ type: 'info', text: 'Fetching precise GPS coordinates...' });

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;

        const formattedAddress = await reverseGeocode(lat, lng);

        setManualLat(lat.toFixed(6));
        setManualLng(lng.toFixed(6));
        setSiteName(formattedAddress.split(',')[0] || "My Current Location");
        setSearchQuery(formattedAddress);
        setIsFetchingGps(false);
        setStatusMessage({
          type: 'success',
          text: `Accurately fetched GPS location: ${lat.toFixed(5)}, ${lng.toFixed(5)}`
        });

        // Proceed to Step 2
        onAddressSelect(lat, lng, formattedAddress);
      },
      (error) => {
        console.error("GPS retrieval failed:", error);
        setIsFetchingGps(false);
        setStatusMessage({
          type: 'error',
          text: 'Location permission denied or timed out. Please enter address or coordinates.'
        });
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const lat = parseFloat(manualLat);
    const lng = parseFloat(manualLng);
    if (!isNaN(lat) && !isNaN(lng)) {
      onAddressSelect(lat, lng, siteName.trim() || `Coordinates: ${lat}, ${lng}`);
    }
  };

  // Quick Preset Cities
  const quickCities = [
    { name: 'Delhi NCR', lat: 28.6139, lng: 77.2090 },
    { name: 'Mumbai', lat: 19.0760, lng: 72.8777 },
    { name: 'Bengaluru', lat: 12.9716, lng: 77.5946 },
    { name: 'Hyderabad', lat: 17.3850, lng: 78.4867 },
    { name: 'Ahmedabad', lat: 23.0225, lng: 72.5714 },
    { name: 'Pune', lat: 18.5204, lng: 73.8567 },
    { name: 'Jaipur', lat: 26.9124, lng: 75.7873 },
    { name: 'Lucknow', lat: 26.8467, lng: 80.9462 }
  ];

  return (
    <div className="space-y-4 select-none">
      {/* Search Input Bar with Google Geocoder & Places Autocomplete */}
      <div ref={searchContainerRef} className="relative space-y-1.5">
        <label className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider block">
          Step 1: Search Project Site Address or Landmark
        </label>
        <form onSubmit={handleSearchSubmit} className="flex gap-2">
          <div className="relative flex-1 group">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400 group-focus-within:text-emerald-500 transition-colors">
              <Search className="w-4 h-4" />
            </div>
            <input
              type="text"
              placeholder="e.g. Connaught Place Delhi, BKC Mumbai, Indiranagar Bengaluru, or PIN code"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-white border border-slate-200 hover:border-slate-300 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 rounded-xl py-3 pl-10 pr-4 text-xs font-semibold text-slate-800 placeholder-slate-400 outline-none transition-all shadow-xs"
            />
          </div>
          <button
            type="submit"
            disabled={isSearching}
            className="bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs px-4 rounded-xl shadow-md transition-all flex items-center justify-center min-w-[75px] cursor-pointer disabled:opacity-50"
          >
            {isSearching ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Search'}
          </button>
        </form>

        {/* Dropdown Results List */}
        {showResultsDropdown && searchResults.length > 0 && (
          <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-2xl z-50 overflow-hidden max-h-60 overflow-y-auto">
            {searchResults.map((res, i) => (
              <button
                key={i}
                type="button"
                onClick={() => handleSelectLocation(res)}
                className="w-full text-left p-3 hover:bg-emerald-50/80 border-b border-slate-100 last:border-0 flex items-start space-x-2.5 transition-colors cursor-pointer"
              >
                <MapPin className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <div>
                  <div className="text-xs font-bold text-slate-800">{res.shortName}</div>
                  <div className="text-[10px] text-slate-500 line-clamp-1">{res.displayName}</div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Status Alert Banner */}
      {statusMessage && (
        <div className={`p-2.5 px-3 rounded-xl text-[10px] font-bold flex items-center space-x-2 ${
          statusMessage.type === 'success'
            ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
            : statusMessage.type === 'error'
            ? 'bg-red-50 text-red-800 border border-red-200'
            : 'bg-blue-50 text-blue-800 border border-blue-200'
        }`}>
          {statusMessage.type === 'success' ? (
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
          ) : (
            <AlertCircle className="w-3.5 h-3.5 text-red-600 shrink-0" />
          )}
          <span>{statusMessage.text}</span>
        </div>
      )}

      {/* GPS Current Location Button */}
      <button
        onClick={handleFetchCurrentLocation}
        disabled={isFetchingGps}
        className="w-full bg-emerald-50 hover:bg-emerald-100/80 border border-emerald-200 text-emerald-800 font-black text-xs py-2.5 rounded-xl transition-all flex items-center justify-center space-x-2 cursor-pointer shadow-xs disabled:opacity-50"
      >
        {isFetchingGps ? (
          <Loader2 className="w-4 h-4 animate-spin text-emerald-600" />
        ) : (
          <Navigation className="w-4 h-4 text-emerald-600" />
        )}
        <span>{isFetchingGps ? 'Detecting GPS Satellite...' : 'Use My GPS Current Location'}</span>
      </button>

      {/* Quick City Presets */}
      <div>
        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-tight block mb-1.5">
          Quick Preset Cities:
        </span>
        <div className="flex flex-wrap gap-1.5">
          {quickCities.map((city) => (
            <button
              key={city.name}
              type="button"
              onClick={() => {
                setManualLat(city.lat.toFixed(6));
                setManualLng(city.lng.toFixed(6));
                setSiteName(city.name);
                setSearchQuery(`${city.name}, India`);
                onAddressSelect(city.lat, city.lng, `${city.name}, India`);
              }}
              className="text-[10px] font-bold px-2 py-1 bg-slate-100 hover:bg-emerald-100 hover:text-emerald-800 text-slate-600 rounded-lg transition-colors border border-slate-200/80 cursor-pointer"
            >
              {city.name}
            </button>
          ))}
        </div>
      </div>

      {/* Divider */}
      <div className="relative py-1">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-slate-200"></div>
        </div>
        <div className="relative flex justify-center text-xs font-extrabold uppercase">
          <span className="bg-slate-50 px-3 text-[9px] text-slate-400 tracking-wider">
            Or Enter Exact Coordinates
          </span>
        </div>
      </div>

      {/* Manual Coordinates Form */}
      <form onSubmit={handleManualSubmit} className="bg-white border border-slate-200 rounded-2xl p-3.5 space-y-2.5 shadow-xs">
        <div>
          <label className="text-[9px] font-bold text-slate-400 uppercase tracking-tight block mb-1">
            Site / Building Name
          </label>
          <div className="relative">
            <Building className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
            <input
              type="text"
              value={siteName}
              onChange={(e) => setSiteName(e.target.value)}
              placeholder="e.g. Rooftop Solar Site"
              className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 pl-8 text-xs font-semibold text-slate-800 outline-none focus:border-emerald-500"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[9px] font-bold text-slate-400 uppercase tracking-tight block mb-0.5">
              Latitude
            </label>
            <input
              type="number"
              step="0.000001"
              value={manualLat}
              onChange={(e) => setManualLat(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs font-bold text-slate-700 outline-none text-center focus:border-emerald-500"
            />
          </div>
          <div>
            <label className="text-[9px] font-bold text-slate-400 uppercase tracking-tight block mb-0.5">
              Longitude
            </label>
            <input
              type="number"
              step="0.000001"
              value={manualLng}
              onChange={(e) => setManualLng(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs font-bold text-slate-700 outline-none text-center focus:border-emerald-500"
            />
          </div>
        </div>

        <button
          type="submit"
          className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs py-2 px-4 rounded-xl shadow-sm transition-all flex items-center justify-center space-x-1.5 cursor-pointer"
        >
          <MapPin className="w-3.5 h-3.5" />
          <span>Locate Coordinates on Satellite Map</span>
        </button>
      </form>
    </div>
  );
};

export default SiteMapPicker;

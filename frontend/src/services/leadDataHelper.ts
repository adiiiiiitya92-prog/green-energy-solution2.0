import { quotationService } from './quotationService';
import { visitService } from './visitService';
import type { Lead } from '../types';

export interface ResolvedLeadDocumentInfo {
  consumerName: string;
  consumerMobile: string;
  consumerNo: string;
  address: string;
  capacityKw: string;
  pvModuleMake: string;
  inverterMake: string;
  sanctionLoad: string;
  city: string;
  statePin: string;
}

/**
 * Strips out panel models, inverters, wattages, and pricing keywords from address text
 * Example: "Adani / Waaree / Premier panel 550watt * 6 nos 3.6 kw Cathode Power, Sawargaon" -> "Sawargaon"
 */
export function cleanAddressFromProductSpecs(text: string): string {
  if (!text) return '';

  const chunks = text.split(/[,;\n]+/).map((s) => s.trim()).filter(Boolean);
  const cleanChunks: string[] = [];

  const specKeywordRegex =
    /\b(panel|panels|watt|watts|wp|kw|kwp|nos|inverter|inverters|cathode|waaree|adani|premier|vikram|tata|growatt|solis|sungrow|deye|poly|mono|perc|topcon|bifacial|structure|dcr|almm|battery|phase|power|plant|system|rooftop|capacity)\b/i;

  for (const chunk of chunks) {
    if (specKeywordRegex.test(chunk)) {
      // Clean out product spec terms from this chunk
      const cleaned = chunk
        .replace(
          /\b(adani|waaree|premier|vikram|tata|growatt|solis|sungrow|cathode|power|panel|panels|mono|perc|topcon|bifacial|inverter|structure|dcr|almm|system|plant|rooftop|capacity)\b/gi,
          ''
        )
        .replace(/[\d.]+\s*(watt|w|wp|kw|kwp|nos|piece|pieces|v|ah)\b/gi, '')
        .replace(/[*x/]\s*\d+\s*(nos|piece)?/gi, '')
        .replace(/[*x/+-]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

      // If there is still a valid location string left (e.g. "Sawargaon" or "Plot 12")
      if (cleaned.length > 2 && !/^\d+$/.test(cleaned)) {
        cleanChunks.push(cleaned);
      }
    } else {
      cleanChunks.push(chunk);
    }
  }

  return cleanChunks.join(', ').replace(/\s+/g, ' ').replace(/,\s*,/g, ',').trim();
}

/**
 * Formats a clean, standard Indian address combining Local Area / Landmark, City (e.g. Nagpur), and State (Maharashtra)
 * Example: "Sawargaon" -> "Sawargaon, Nagpur, Maharashtra"
 */
export function formatFullIndianAddress(
  rawLocation?: string,
  rawCity?: string,
  rawStatePin?: string
): string {
  const parts: string[] = [];
  const rawParts: string[] = [];

  const cleanedLoc = cleanAddressFromProductSpecs(rawLocation || '');
  const cleanedCity = cleanAddressFromProductSpecs(rawCity || '');

  if (cleanedLoc && cleanedLoc.trim()) {
    rawParts.push(...cleanedLoc.split(',').map((s) => s.trim()).filter(Boolean));
  }
  if (cleanedCity && cleanedCity.trim()) {
    rawParts.push(...cleanedCity.split(',').map((s) => s.trim()).filter(Boolean));
  }

  // Deduplicate while preserving order (case-insensitive)
  const seen = new Set<string>();
  for (const part of rawParts) {
    const lower = part.toLowerCase();
    if (lower.includes('site address as per') || lower.includes('site address')) continue;
    if (!seen.has(lower)) {
      seen.add(lower);
      parts.push(part);
    }
  }

  // Ensure "Nagpur" is included if no other city is specified
  const hasNagpur = parts.some((p) => p.toLowerCase().includes('nagpur'));
  const hasOtherCity = parts.some((p) => {
    const l = p.toLowerCase();
    return (
      l.includes('mumbai') ||
      l.includes('pune') ||
      l.includes('delhi') ||
      l.includes('bhandara') ||
      l.includes('wardha') ||
      l.includes('amravati') ||
      l.includes('chandrapur') ||
      l.includes('gondia') ||
      l.includes('yavatmal') ||
      l.includes('akola')
    );
  });

  if (!hasNagpur && !hasOtherCity) {
    parts.push('Nagpur');
    seen.add('nagpur');
  }

  // Ensure state is included
  const stateStr = (rawStatePin || '').trim();
  const hasState =
    parts.some((p) => p.toLowerCase().includes('maharashtra')) ||
    stateStr.toLowerCase().includes('maharashtra');

  if (stateStr && !parts.some((p) => p.toLowerCase().includes(stateStr.toLowerCase()))) {
    parts.push(stateStr);
  } else if (!hasState) {
    parts.push('Maharashtra');
  }

  return parts.filter(Boolean).join(', ');
}

/**
 * Automatically resolves the most accurate site address, consumer details,
 * and system specs for any given Lead across Leads, Quotations, and Field Visits.
 */
export async function resolveLeadDocumentInfo(lead: Lead): Promise<ResolvedLeadDocumentInfo> {
  let consumerName = lead.name;
  let consumerMobile = lead.phoneNumber || '';
  let consumerNo = ''; // Left blank by default as requested
  let capacityKw = '';
  let pvModuleMake = 'Waaree Energies Ltd';
  let inverterMake = 'Growatt';
  let sanctionLoad = '';
  let city = '';
  let statePin = '';
  let rawLocation = lead.description ? lead.description.trim() : '';

  // Extract capacity from requirement string (e.g. "3 kW Rooftop Solar" -> "3")
  const capMatch = lead.requirement?.match(/(\d+(\.\d+)?)\s*(kw|kwp)?/i);
  if (capMatch) {
    capacityKw = capMatch[1];
    sanctionLoad = `${capMatch[1]} kW`;
  }

  // 1. Check direct lead address properties if set
  if ((lead as any).address && (lead as any).address.trim()) {
    rawLocation = (lead as any).address.trim();
  } else if ((lead as any).siteAddress && (lead as any).siteAddress.trim()) {
    rawLocation = (lead as any).siteAddress.trim();
  }

  // 2. Fetch Quotation for this lead
  try {
    let leadQuotes = await quotationService.getQuotationsByLeadId(lead.id);
    if (!leadQuotes || leadQuotes.length === 0) {
      const allQuotes = await quotationService.getAllQuotations();
      leadQuotes = allQuotes.filter((q) => q.leadId === lead.id);
    }

    if (leadQuotes && leadQuotes.length > 0) {
      const latestQ = leadQuotes[leadQuotes.length - 1];
      if (latestQ.consumerName) consumerName = latestQ.consumerName;
      if (latestQ.consumerMobile) consumerMobile = latestQ.consumerMobile;
      if (latestQ.consumerNo && !latestQ.consumerNo.startsWith('ASC-')) {
        consumerNo = latestQ.consumerNo;
      }
      if (latestQ.systemCapacity) capacityKw = String(latestQ.systemCapacity).replace(/[^0-9.]/g, '');
      if (latestQ.pvModuleMake) pvModuleMake = latestQ.pvModuleMake;
      if (latestQ.inverterMake) inverterMake = latestQ.inverterMake;
      if (latestQ.sanctionLoad) sanctionLoad = latestQ.sanctionLoad;
      if (latestQ.city) city = latestQ.city.trim();
      if (latestQ.statePin) statePin = latestQ.statePin.trim();
      if ((latestQ as any).address && (latestQ as any).address.trim()) {
        rawLocation = (latestQ as any).address.trim();
      }
    }
  } catch (qErr) {
    console.warn('Note: Could not query quotation for lead info:', qErr);
  }

  // 3. Check Field Visits for GPS place name if location is still empty
  if (!rawLocation && !city) {
    try {
      const visits = await visitService.getVisits();
      const leadVisits = visits.filter((v) => v.leadId === lead.id && v.location?.placeName);
      if (leadVisits.length > 0) {
        rawLocation = leadVisits[leadVisits.length - 1].location.placeName;
      }
    } catch (_) {}
  }

  // Format clean address without panel specs
  const formattedAddress = formatFullIndianAddress(rawLocation, city, statePin);

  return {
    consumerName,
    consumerMobile,
    consumerNo,
    address: formattedAddress,
    capacityKw: capacityKw || '3',
    pvModuleMake,
    inverterMake,
    sanctionLoad: sanctionLoad || `${capacityKw || '3'} kW`,
    city,
    statePin
  };
}

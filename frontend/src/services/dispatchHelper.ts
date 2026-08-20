import type { Challan, Quotation } from '../types';
import dayjs from 'dayjs';

export type DispatchCategory = 'structure' | 'inverter' | 'system' | 'bos' | 'other';

export interface DispatchedItemSummary {
  productName: string;
  qty: number;
  unit?: string;
  category: DispatchCategory;
  categoryLabel: string;
  challanNumber: string;
  challanId: string;
  dispatchedAt: string;
  vehicleNumber?: string;
  driverName?: string;
  driverPhone?: string;
  employeeName?: string;
  serialNumbers?: string[];
}

export interface LeadDispatchSummary {
  leadId: string;
  totalChallansCount: number;
  
  // Category-specific dispatch status & latest dates
  hasStructure: boolean;
  structureDate?: string;
  structureFormattedDate?: string;
  structureItems: DispatchedItemSummary[];
  
  hasInverter: boolean;
  inverterDate?: string;
  inverterFormattedDate?: string;
  inverterItems: DispatchedItemSummary[];
  
  hasSystem: boolean; // Solar Panels / Full Solar System
  systemDate?: string;
  systemFormattedDate?: string;
  systemItems: DispatchedItemSummary[];
  
  hasBos: boolean; // Protection, Cables, Earthing, Accessories
  bosDate?: string;
  bosFormattedDate?: string;
  bosItems: DispatchedItemSummary[];
  
  // Overall Dispatch
  isOverallDispatched: boolean;
  overallDispatchDate?: string;
  overallFormattedDate?: string;
  
  // Date-wise grouped challans
  challans: Challan[];
  allItems: DispatchedItemSummary[];
}

/**
 * Detect the dispatch category of an item based on its name and/or product category
 */
export function getItemDispatchCategory(item: { productName?: string; category?: string } | null | undefined): {
  category: DispatchCategory;
  categoryLabel: string;
} {
  if (!item) {
    return { category: 'other', categoryLabel: 'General Items' };
  }

  const name = (item.productName || '').toLowerCase().trim();
  const rawCat = (item.category || '').toLowerCase().trim();

  // 1. Structure
  if (
    rawCat === 'structure' ||
    name.includes('structure') ||
    name.includes('hdgi') ||
    name.includes('mounting') ||
    name.includes('purlin') ||
    name.includes('rafter') ||
    name.includes('ladder') ||
    name.includes('walkway') ||
    name.includes('walk way') ||
    name.includes('leg') ||
    name.includes('strut') ||
    name.includes('rail') ||
    name.includes('clamp') ||
    name.includes('mid clamp') ||
    name.includes('end clamp') ||
    name.includes('c type') ||
    name.includes('l foot')
  ) {
    return { category: 'structure', categoryLabel: 'Structure & Mounting' };
  }

  // 2. Inverter
  if (
    rawCat === 'inverter' ||
    name.includes('inverter') ||
    name.includes('string inverter') ||
    name.includes('micro inverter') ||
    name.includes('hybrid inverter') ||
    name.includes('solar inverter') ||
    name.includes('grid tie') ||
    name.includes('data logger') ||
    name.includes('wifi stick')
  ) {
    return { category: 'inverter', categoryLabel: 'Solar Inverter' };
  }

  // 3. Solar Panels / Solar System
  if (
    rawCat === 'solar_panel' ||
    name.includes('solar panel') ||
    name.includes('pv module') ||
    name.includes('solar module') ||
    name.includes('mono perc') ||
    name.includes('bifacial') ||
    name.includes('dcr module') ||
    name.includes('topcon') ||
    name.includes('watt panel') ||
    name.includes('solar system') ||
    name.includes('panel')
  ) {
    return { category: 'system', categoryLabel: 'Solar Panels / System' };
  }

  // 4. Protection, Cables, Earthing & BOS
  if (
    rawCat === 'bom_item' ||
    rawCat === 'battery' ||
    name.includes('acdb') ||
    name.includes('dcdb') ||
    name.includes('cable') ||
    name.includes('wire') ||
    name.includes('earthing') ||
    name.includes('lightning') ||
    name.includes('arrestor') ||
    name.includes('spd') ||
    name.includes('mcb') ||
    name.includes('fuse') ||
    name.includes('conduit') ||
    name.includes('battery') ||
    name.includes('accessories') ||
    name.includes('lug')
  ) {
    return { category: 'bos', categoryLabel: 'Protection & BOS' };
  }

  return { category: 'other', categoryLabel: 'Other Equipment' };
}

/**
 * Computes a detailed dispatch summary for a specific lead
 */
export function computeLeadDispatchSummary(
  leadId: string,
  allChallans: Challan[],
  leadQuotation?: Quotation | null
): LeadDispatchSummary {
  const leadChallans = allChallans
    .filter(c => c.leadId === leadId)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const structureItems: DispatchedItemSummary[] = [];
  const inverterItems: DispatchedItemSummary[] = [];
  const systemItems: DispatchedItemSummary[] = [];
  const bosItems: DispatchedItemSummary[] = [];
  const allItems: DispatchedItemSummary[] = [];

  let latestStructureDate: string | undefined;
  let latestInverterDate: string | undefined;
  let latestSystemDate: string | undefined;
  let latestBosDate: string | undefined;
  let latestOverallDate: string | undefined;

  for (const ch of leadChallans) {
    const chDate = ch.createdAt;
    if (!latestOverallDate || new Date(chDate).getTime() > new Date(latestOverallDate).getTime()) {
      latestOverallDate = chDate;
    }

    for (const item of ch.items || []) {
      const { category, categoryLabel } = getItemDispatchCategory({ productName: item.productName });
      
      const itemSummary: DispatchedItemSummary = {
        productName: item.productName,
        qty: Number(item.qty) || 1,
        unit: item.unit || 'Nos',
        category,
        categoryLabel,
        challanNumber: ch.challanNumber,
        challanId: ch.id,
        dispatchedAt: chDate,
        vehicleNumber: ch.vehicleNumber,
        driverName: ch.driverName,
        driverPhone: ch.driverPhone,
        employeeName: ch.employeeName,
        serialNumbers: item.serialNumbers
      };

      allItems.push(itemSummary);

      if (category === 'structure') {
        structureItems.push(itemSummary);
        if (!latestStructureDate || new Date(chDate).getTime() > new Date(latestStructureDate).getTime()) {
          latestStructureDate = chDate;
        }
      } else if (category === 'inverter') {
        inverterItems.push(itemSummary);
        if (!latestInverterDate || new Date(chDate).getTime() > new Date(latestInverterDate).getTime()) {
          latestInverterDate = chDate;
        }
      } else if (category === 'system') {
        systemItems.push(itemSummary);
        if (!latestSystemDate || new Date(chDate).getTime() > new Date(latestSystemDate).getTime()) {
          latestSystemDate = chDate;
        }
      } else {
        bosItems.push(itemSummary);
        if (!latestBosDate || new Date(chDate).getTime() > new Date(latestBosDate).getTime()) {
          latestBosDate = chDate;
        }
      }
    }
  }

  const hasStructure = structureItems.length > 0;
  const hasInverter = inverterItems.length > 0;
  const hasSystem = systemItems.length > 0;
  const hasBos = bosItems.length > 0;

  // Determine if overall dispatch is complete:
  // 1. If structure + inverter + solar panels/system are all dispatched
  // 2. OR if lead has quotation and all major components have been dispatched
  let isOverallDispatched = false;
  if (hasStructure && hasInverter && hasSystem) {
    isOverallDispatched = true;
  } else if (leadChallans.length > 0 && leadQuotation && leadQuotation.items && leadQuotation.items.length > 0) {
    const requiredItems = leadQuotation.items.map(i => i.itemName.toLowerCase());
    const hasReqStructure = requiredItems.some(i => i.includes('structure') || i.includes('hdgi'));
    const hasReqInverter = requiredItems.some(i => i.includes('inverter'));
    const hasReqSystem = requiredItems.some(i => i.includes('panel') || i.includes('module'));

    const structureSatisfied = !hasReqStructure || hasStructure;
    const inverterSatisfied = !hasReqInverter || hasInverter;
    const systemSatisfied = !hasReqSystem || hasSystem;

    if (structureSatisfied && inverterSatisfied && systemSatisfied && (hasStructure || hasInverter || hasSystem)) {
      isOverallDispatched = true;
    }
  }

  const formatCardDate = (isoStr?: string) => {
    if (!isoStr) return undefined;
    return dayjs(isoStr).format('DD MMM YYYY');
  };

  return {
    leadId,
    totalChallansCount: leadChallans.length,
    hasStructure,
    structureDate: latestStructureDate,
    structureFormattedDate: formatCardDate(latestStructureDate),
    structureItems,
    hasInverter,
    inverterDate: latestInverterDate,
    inverterFormattedDate: formatCardDate(latestInverterDate),
    inverterItems,
    hasSystem,
    systemDate: latestSystemDate,
    systemFormattedDate: formatCardDate(latestSystemDate),
    systemItems,
    hasBos,
    bosDate: latestBosDate,
    bosFormattedDate: formatCardDate(latestBosDate),
    bosItems,
    isOverallDispatched,
    overallDispatchDate: latestOverallDate,
    overallFormattedDate: formatCardDate(latestOverallDate),
    challans: leadChallans,
    allItems
  };
}

/**
 * Pre-computes dispatch summaries for all leads in bulk
 */
export function computeAllLeadsDispatchMap(
  allChallans: Challan[],
  quotationsMap?: Record<string, Quotation>
): Record<string, LeadDispatchSummary> {
  const map: Record<string, LeadDispatchSummary> = {};
  
  // Group challans by leadId
  const challansByLead: Record<string, Challan[]> = {};
  for (const ch of allChallans) {
    if (ch.leadId) {
      if (!challansByLead[ch.leadId]) {
        challansByLead[ch.leadId] = [];
      }
      challansByLead[ch.leadId].push(ch);
    }
  }

  for (const leadId of Object.keys(challansByLead)) {
    const quote = quotationsMap ? quotationsMap[leadId] : undefined;
    map[leadId] = computeLeadDispatchSummary(leadId, allChallans, quote);
  }

  return map;
}

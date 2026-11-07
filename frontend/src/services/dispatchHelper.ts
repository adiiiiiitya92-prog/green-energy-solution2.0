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

// Name patterns, written against the real product names used in challans (with their common misspellings).
const INVERTER_RE = /invert|inveter|invertor|inverer|\bgrid[\s-]?tie\b|data\s*logger|wifi\s*stick/;
const PANEL_WORD_RE = /pa+n+[ae]+l|panles|\bmodules?\b|pv\s*module|bi\s*f[ai]+c[ai]+l|bificial|top\s*con|mono\s*perc|\bn[\s-]?type\b|\bn?[\s-]?dcr\b|\bg2g\b/;
// A bare 3-digit wattage like "540 WATT", "625W", "615Wp" (panels are 300-750 W; "600 VOLT" is not a wattage)
const PANEL_WATT_RE = /\b([3-7]\d{2})\s*(?:w|wp|watt|watts)\b/;
const PANEL_BRAND_RE = /waa?ree|adani|premier|panasonic|crompton|cromton|tata\s*power|vikram|goldi|rayzon|renewsys|loom|saatvik|emmvee/;
const SYSTEM_RE = /(solar\s*)?roof\s*top\s*(solar\s*)?system|solar\s*system|on\s*grid\s*system|kw\s*kit/;
const BOS_RE = /acdb|dcdb|cable|wire|earth|earting|lightn?ing|arr?e+st[eo]r|\bla\b|\bspd\b|\bmcb\b|fuse|conduit|battery|accessor|\blugs?\b|mc4|connector|elbow|\btee\b|insulation|tape|pvc|tray|zink|zinc|chemical|down\s*conductor|junction|cabel|meter|merer/;
const STRUCTURE_RE = /structure|hdgi|mounting|purlin|rafter|ladder|walk\s*way|\blegs?\b|strut|\brails?\b|\bc[\s-]?type\b|\bc[\s-]?channel\b|\bl[\s-]?foot\b|\b(mid|end)\s*clamp/;

/**
 * Detect the dispatch category of an item from its name (and catalog category only for items whose name says nothing).
 * The catalog category is not trusted first: many BOS items (DCDB, earthing rod, cable tray…) are saved as "solar_panel".
 */
export function getItemDispatchCategory(item: { productName?: string; category?: string } | null | undefined): {
  category: DispatchCategory;
  categoryLabel: string;
} {
  if (!item) {
    return { category: 'other', categoryLabel: 'General Items' };
  }

  const name = (item.productName || '').toLowerCase().replace(/\s+/g, ' ').trim();
  const rawCat = (item.category || '').toLowerCase().trim();

  // 1. Inverter first: "Tata 3 kw inverter WITH AC/DC DB" is an inverter, not BOS
  if (INVERTER_RE.test(name)) return { category: 'inverter', categoryLabel: 'Solar Inverter' };

  // 2. Structure ("u clip pvc pipe clamp" is a conduit clip, not structure)
  if (STRUCTURE_RE.test(name) && !/pvc|u\s*clip/.test(name)) return { category: 'structure', categoryLabel: 'Structure & Mounting' };

  // 3. Solar panels / complete system
  const isPanel =
    PANEL_WORD_RE.test(name) ||
    SYSTEM_RE.test(name) ||
    (PANEL_WATT_RE.test(name) && !BOS_RE.test(name)) ||
    (PANEL_BRAND_RE.test(name) && /\b[3-7]\d{2}\b/.test(name) && !BOS_RE.test(name));
  if (isPanel && !BOS_RE.test(name.replace(/dcr/g, ''))) return { category: 'system', categoryLabel: 'Solar Panels / System' };

  // 4. Protection, cables, earthing & BOS
  if (BOS_RE.test(name) || rawCat === 'bom_item' || rawCat === 'battery') return { category: 'bos', categoryLabel: 'Protection & BOS' };

  // 5. Name gives no hint: fall back to the catalog category
  if (rawCat === 'inverter') return { category: 'inverter', categoryLabel: 'Solar Inverter' };
  if (rawCat === 'structure') return { category: 'structure', categoryLabel: 'Structure & Mounting' };

  return { category: 'other', categoryLabel: 'Other Equipment' };
}

/**
 * Only solar panels and inverters are tracked by serial number; every other item (pipes, cables, structure, BOS…)
 * is tracked by quantity alone. A whole "rooftop solar system" / kit line is not a single serialised unit either.
 */
export function isSerialTrackedName(productName?: string | null): boolean {
  const name = (productName || '').toLowerCase();
  const { category } = getItemDispatchCategory({ productName: name });
  if (category === 'inverter') return true;
  return category === 'system' && !SYSTEM_RE.test(name);
}

export const isSerialTrackedProduct = (p?: { name?: string } | null): boolean => !!p && isSerialTrackedName(p.name);

/**
 * Computes a detailed dispatch summary for a specific lead
 */
export function computeLeadDispatchSummary(
  leadId: string,
  allChallans: Challan[],
  leadQuotation?: Quotation | null
): LeadDispatchSummary {
  const leadChallans = (allChallans.length > 0 && allChallans.every(c => c.leadId === leadId))
    ? [...allChallans]
    : allChallans.filter(c => c.leadId === leadId);
  leadChallans.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

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
    map[leadId] = computeLeadDispatchSummary(leadId, challansByLead[leadId], quote);
  }

  return map;
}

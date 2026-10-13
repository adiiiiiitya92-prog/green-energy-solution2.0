import type { UserRole } from '../types';

/**
 * Centralized role → feature access map.
 *
 * Design goal (Change 1): Manager has the SAME access as Super Admin EXCEPT for
 * three areas that must be fully hidden/blocked for Manager:
 *   - 'dashboard'      (Main Dashboard)
 *   - 'reports'        (Reports section, incl. Installation Supervisor Report)
 *   - 'lead_pipeline'  (Lead Pipeline / Leads)
 *
 * Instead of sprinkling `role === 'super_admin'` everywhere, prefer `hasAccess(role, feature)`.
 * Only touch existing call-sites where Manager must gain/lose access.
 */

export type Feature =
  // Super-admin-level areas
  | 'dashboard'
  | 'reports'
  | 'lead_pipeline'
  | 'visits'
  | 'shadow_analysis'
  | 'employees'
  | 'leave_requests'
  | 'expenses_admin'
  | 'settings'
  // Shared operational areas
  | 'product_catalog'
  | 'delivery_challans'
  | 'product_challans'
  | 'b2b_businesses'
  | 'complaints'
  | 'inventory_panel'
  // Change 4 areas
  | 'installation_payments' // Super Admin approve/reject + receipts
  | 'installation_supervisor_panel';

// Areas a Manager must NOT access (everything else Super Admin can, Manager can too).
const MANAGER_DENIED: Feature[] = ['dashboard', 'reports', 'lead_pipeline'];

export function hasAccess(role: UserRole | undefined | null, feature: Feature): boolean {
  if (!role) return false;

  switch (role) {
    case 'super_admin':
      return true;

    case 'manager':
      // Manager mirrors Super Admin minus the denied set.
      return !MANAGER_DENIED.includes(feature);

    case 'admin':
      // Admin keeps its historical access footprint.
      return (
        feature === 'dashboard' ||
        feature === 'lead_pipeline' ||
        feature === 'visits' ||
        feature === 'complaints'
      );

    case 'inventory_manager':
      return (
        feature === 'inventory_panel' ||
        feature === 'product_catalog' ||
        feature === 'delivery_challans' ||
        feature === 'product_challans' ||
        feature === 'b2b_businesses' ||
        feature === 'complaints'
      );

    case 'field_employee':
      return feature === 'lead_pipeline' || feature === 'visits' || feature === 'complaints';

    case 'dealer':
      return feature === 'lead_pipeline' || feature === 'visits' || feature === 'complaints';

    case 'installation_supervisor':
      return feature === 'installation_supervisor_panel' || feature === 'complaints';

    default:
      return false;
  }
}

/** Super Admin OR Manager (the "full admin" tier that excludes the 3 denied areas for Manager). */
export function isAdminTier(role: UserRole | undefined | null): boolean {
  return role === 'super_admin' || role === 'manager';
}

/** Default landing route per role after login / on blocked route. */
export function defaultRouteForRole(role: UserRole | undefined | null): string {
  switch (role) {
    case 'super_admin':
      return '/dashboard';
    case 'admin':
      return '/dashboard';
    case 'manager':
      return '/complaints'; // Manager has no dashboard; land on Complaints
    case 'inventory_manager':
      return '/inventory-panel';
    case 'installation_supervisor':
      return '/installation';
    case 'dealer':
      return '/leads';
    case 'field_employee':
      return '/leads';
    default:
      return '/leads';
  }
}

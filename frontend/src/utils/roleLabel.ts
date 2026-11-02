const ROLE_LABELS: Record<string, string> = { dealer: 'channel partner' };

export const roleLabel = (role?: string | null, fallback = 'user') =>
  role ? ROLE_LABELS[role] || role.replace(/_/g, ' ') : fallback;

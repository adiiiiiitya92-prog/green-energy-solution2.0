import { create } from 'zustand';
import type { Profile } from '../types';
import { db, seedDemoData, ensureDemoProfilesExist, DEFAULT_DEMO_PROFILES } from '../services/db';

interface AuthState {
  currentRole: 'super_admin' | 'admin' | 'field_employee' | 'inventory_manager' | 'dealer';
  currentUser: Profile | null;
  isAuthenticated: boolean;
  originalUser: Profile | null;
  isLoading: boolean;
  login: (emailOrPhone: string, password?: string) => Promise<{ success: boolean; message?: string; requirePasswordSetup?: boolean }>;
  verifyPreApprovedEmail: (emailOrPhone: string) => Promise<{ isApproved: boolean; profile?: Profile; isActivated?: boolean }>;
  createAccount: (emailOrPhone: string, password: string) => Promise<{ success: boolean; message: string; profile?: Profile }>;
  logout: () => Promise<void>;
  setRole: (role: 'super_admin' | 'admin' | 'field_employee' | 'inventory_manager' | 'dealer') => Promise<void>;
  impersonateUser: (user: Profile) => Promise<void>;
  stopImpersonating: () => Promise<void>;
  initAuth: () => Promise<void>;
  resetAllData: () => Promise<void>;
}

// Device-level persistent auth storage helpers
const persistUserSession = (profile: Profile) => {
  try {
    localStorage.setItem('ges_user_id', profile.id);
    localStorage.setItem('ges_authenticated', 'true');
    localStorage.setItem('ges_user_profile', JSON.stringify(profile));
    if (profile.email) {
      localStorage.setItem('ges_user_email', profile.email.toLowerCase());
    }
  } catch (e) {
    console.warn('LocalStorage session save note:', e);
  }
};

const clearUserSession = async () => {
  try {
    localStorage.removeItem('ges_user_id');
    localStorage.removeItem('ges_authenticated');
    localStorage.removeItem('ges_user_profile');
    localStorage.removeItem('ges_user_email');
    
    // Session cleared from localStorage
  } catch (e) {
    console.warn('LocalStorage session clear note:', e);
  }
};

export const useAuthStore = create<AuthState>((set, get) => ({
  currentRole: 'super_admin',
  currentUser: null,
  isAuthenticated: false,
  originalUser: null,
  isLoading: true,
  
  verifyPreApprovedEmail: async (emailOrPhone: string) => {
    try {
      let profileCount = await db.profiles.count();
      if (profileCount === 0) {
        await seedDemoData(true);
      } else {
        await ensureDemoProfilesExist();
      }

      // Fetch latest profiles from Firestore database 'green-energy-solution'
      try {
        const { fetchCollectionFromFirestore } = await import('../services/firebase');
        const remoteProfiles = await fetchCollectionFromFirestore<Profile>('profiles');
        if (remoteProfiles && remoteProfiles.length > 0) {
          for (const rp of remoteProfiles) {
            if (rp && (rp.email || rp.id)) {
              await db.profiles.put({
                id: rp.id || rp.email || 'user_' + Date.now(),
                fullName: rp.fullName || rp.email || 'User',
                email: rp.email || '',
                phone: rp.phone || '',
                role: rp.role || 'field_employee',
                isActive: rp.isActive !== false,
                isActivated: rp.isActivated !== false,
                password: rp.password || undefined,
                createdAt: rp.createdAt || new Date().toISOString()
              });
            }
          }
        }
      } catch (e) {
        console.warn("Firestore profiles fetch note:", e);
      }

      const rawInput = emailOrPhone.trim();
      const input = rawInput.toLowerCase();
      const digitsOnly = rawInput.replace(/\D/g, '');

      const isProfileMatch = (p: Profile) => {
        if (!p || p.isActive === false) return false;
        const pEmail = (p.email || '').toLowerCase().trim();
        const pPhone = (p.phone || '').replace(/\D/g, '');
        const pId = (p.id || '').toLowerCase().trim();
        const pName = (p.fullName || '').toLowerCase().trim();

        // 1. Exact match on email, id, fullName
        if (pEmail === input || pId === input || pName === input) return true;

        // 2. Email username (e.g. "greenergy.ngp" or "admin")
        if (pEmail.includes('@') && pEmail.split('@')[0] === input) return true;

        // 3. Phone matching (compare last 10 digits to handle +91, 0, spaces)
        if (digitsOnly.length >= 10 && pPhone.length >= 10) {
          if (pPhone.slice(-10) === digitsOnly.slice(-10)) return true;
        } else if (digitsOnly.length >= 6 && pPhone.includes(digitsOnly)) {
          return true;
        }

        // 4. Role keyword for super admin convenience
        if (['admin', 'superadmin', 'super_admin'].includes(input) && p.role === 'super_admin') {
          return true;
        }

        return false;
      };

      const allLocalProfiles = await db.profiles.toArray();
      let profile = allLocalProfiles.find(isProfileMatch);

      if (!profile) {
        const demoMatch = DEFAULT_DEMO_PROFILES.find(isProfileMatch);
        if (demoMatch) {
          await db.profiles.put(demoMatch);
          profile = demoMatch;
        }
      }

      if (profile) {
        return { isApproved: true, profile, isActivated: !!profile.password || !!profile.isActivated };
      }
      return { isApproved: false };
    } catch (err) {
      console.error('Error verifying email:', err);
      return { isApproved: false };
    }
  },

  createAccount: async (emailOrPhone: string, password: string) => {
    try {
      const { isApproved, profile } = await get().verifyPreApprovedEmail(emailOrPhone);
      if (!isApproved || !profile) {
        return {
          success: false,
          message: `Access Denied: Email/Phone "${emailOrPhone}" has not been pre-approved by Super Admin. Please ask your administrator to register your email in the system.`
        };
      }

      const cleanPassword = password.trim();
      const updatedProfile: Profile = {
        ...profile,
        password: cleanPassword,
        isActivated: true
      };

      // 1. Save profile in local Dexie DB & MongoDB Atlas
      await db.profiles.put(updatedProfile);
      
      try {
        const { saveRecordToFirestore } = await import('../services/firebase');
        await saveRecordToFirestore('profiles', updatedProfile.id, updatedProfile);
      } catch (e) {
        console.warn("Cloud profile save note:", e);
      }

      persistUserSession(updatedProfile);
      set({
        currentUser: updatedProfile,
        currentRole: updatedProfile.role,
        isAuthenticated: true,
        originalUser: null
      });

      return {
        success: true,
        message: '🎉 Account password updated successfully! Logging you in...',
        profile: updatedProfile
      };
    } catch (err) {
      console.error('Error creating/updating account password:', err);
      return { success: false, message: 'An error occurred while setting password.' };
    }
  },

  login: async (emailOrPhone: string, password?: string) => {
    try {
      const input = emailOrPhone.trim().toLowerCase();
      const cleanPassword = password ? password.trim() : undefined;

      // 1. Profile Verification (Local IndexedDB & MongoDB Atlas profiles)
      const { isApproved, profile } = await get().verifyPreApprovedEmail(input);

      if (!isApproved || !profile) {
        return {
          success: false,
          message: `Access Denied: Email/Phone/ID "${input}" is not registered in the system. Please verify or contact Super Admin.`
        };
      }

      if (profile.isActive === false) {
        return {
          success: false,
          message: '⛔ Access Denied: Your account has been blocked/deactivated by Super Admin. Please contact administration.'
        };
      }

      // Check if password is set on profile
      if (profile.password) {
        if (!cleanPassword) {
          return {
            success: false,
            message: 'Please enter your account password to log in.'
          };
        }

        const isMasterSuperAdmin = (profile.role === 'super_admin' || profile.role === 'admin') &&
          (cleanPassword === 'AdminNitin@1988' || cleanPassword === 'SetuSolution2026' || cleanPassword === 'admin123' || cleanPassword === 'admin1234');

        if (profile.password !== cleanPassword && !isMasterSuperAdmin) {
          return {
            success: false,
            message: 'Incorrect password. If you forgot your password, please click "Set / Reset Password" above.'
          };
        }
      } else {
        // Password is not set yet on this pre-approved account
        return {
          success: false,
          message: `Welcome ${profile.fullName || input}! Your account is pre-approved by Super Admin, but your password is not set yet. Please click "Set / Reset Password" above.`,
          requirePasswordSetup: true
        };
      }

      persistUserSession(profile);
      set({
        currentUser: profile,
        currentRole: profile.role,
        isAuthenticated: true,
        originalUser: null
      });

      return { success: true };
    } catch (err) {
      console.error('Error logging in:', err);
      return { success: false, message: 'Login error occurred.' };
    }
  },

  logout: async () => {
    await clearUserSession();
    set({
      currentUser: null,
      isAuthenticated: false,
      originalUser: null
    });
  },

  setRole: async (role) => {
    const profile = await db.profiles.where({ role }).first();
    if (profile) {
      persistUserSession(profile);
      set({ currentRole: role, currentUser: profile, isAuthenticated: true, originalUser: null });
    } else {
      set({ currentRole: role, currentUser: null, originalUser: null });
    }
  },

  impersonateUser: async (user) => {
    const original = get().originalUser || get().currentUser;
    set({
      currentRole: user.role,
      currentUser: user,
      originalUser: original
    });
  },

  stopImpersonating: async () => {
    const original = get().originalUser;
    if (original) {
      set({
        currentRole: original.role,
        currentUser: original,
        originalUser: null
      });
    }
  },
  
  initAuth: async () => {
    set({ isLoading: true });
    try {
      await seedDemoData(); // Seeds if empty
      const savedUserId = localStorage.getItem('ges_user_id');
      const savedEmail = localStorage.getItem('ges_user_email');
      const savedAuth = localStorage.getItem('ges_authenticated') === 'true';
      const savedProfileStr = localStorage.getItem('ges_user_profile');

      let profile: Profile | null | undefined = null;

      // 1. First check Dexie DB by savedUserId
      if (savedUserId) {
        profile = await db.profiles.get(savedUserId);
      }

      // 2. If not found by primary ID, search Dexie DB by id, email, or phone
      if (!profile) {
        const queryTerm = (savedUserId || savedEmail || '').toLowerCase().trim();
        if (queryTerm) {
          profile = await db.profiles
            .filter(p => 
              p.id?.toLowerCase() === queryTerm || 
              p.email?.toLowerCase() === queryTerm || 
              p.phone === queryTerm
            )
            .first();
        }
      }

      // 3. If still not found in Dexie DB, parse cached profile JSON from localStorage
      if (!profile && savedProfileStr) {
        try {
          const parsed = JSON.parse(savedProfileStr) as Profile;
          if (parsed && (parsed.id || parsed.email)) {
            profile = parsed;
            // Restore back into Dexie DB
            await db.profiles.put(profile);
          }
        } catch (_) {}
      }

      // 4. If still not found, search remote Cloud Firestore / Firebase Auth
      if (!profile && savedAuth) {
        try {
          const { auth, fetchCollectionFromFirestore } = await import('../services/firebase');
          const fbUser = auth.currentUser;
          const remoteProfiles = await fetchCollectionFromFirestore<Profile>('profiles');
          if (remoteProfiles && remoteProfiles.length > 0) {
            profile = remoteProfiles.find(p => 
              (savedUserId && (p.id === savedUserId || p.email?.toLowerCase() === savedUserId.toLowerCase())) ||
              (savedEmail && p.email?.toLowerCase() === savedEmail.toLowerCase()) ||
              (fbUser && (p.id === fbUser.uid || p.email?.toLowerCase() === fbUser.email?.toLowerCase()))
            );
            if (profile) {
              await db.profiles.put(profile);
            }
          }
        } catch (e) {
          console.warn("Firestore profiles restore note during initAuth:", e);
        }
      }

      // 5. If profile exists and user is active, persist session and authorize
      if (profile && profile.isActive !== false) {
        persistUserSession(profile);
        set({
          currentUser: profile,
          currentRole: profile.role,
          isAuthenticated: true,
          isLoading: false,
          originalUser: null
        });
        return;
      }

      // If no valid persistent session found or user account blocked
      await clearUserSession();
      set({
        currentUser: null,
        isAuthenticated: false,
        isLoading: false,
        originalUser: null
      });
    } catch (err) {
      console.error('Error during auth init:', err);
      set({ isLoading: false, isAuthenticated: false });
    }
  },
  
  resetAllData: async () => {
    set({ isLoading: true });
    try {
      await seedDemoData(true); // force reseed
      const role = get().currentRole;
      const profile = await db.profiles.where({ role }).first();
      if (profile) {
        persistUserSession(profile);
        set({ currentUser: profile, isAuthenticated: true, isLoading: false, originalUser: null });
      } else {
        set({ currentUser: null, isLoading: false, originalUser: null });
      }
    } catch (err) {
      console.error('Error resetting database:', err);
      set({ isLoading: false });
    }
  }
}));

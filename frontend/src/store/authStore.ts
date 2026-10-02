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
    
    try {
      const { signOut } = await import('firebase/auth');
      const { auth } = await import('../services/firebase');
      if (auth.currentUser) {
        await signOut(auth);
      }
    } catch (_) {}
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
      const input = emailOrPhone.trim().toLowerCase();
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

      let profile = await db.profiles
        .filter(p => (p.email?.toLowerCase() === input || p.phone === input || p.id === input) && p.isActive !== false)
        .first();

      if (!profile) {
        const demoMatch = DEFAULT_DEMO_PROFILES.find(
          p => p.email?.toLowerCase() === input || p.phone === input || p.id === input
        );
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

      // 1. Register user in Firebase Authentication
      if (profile.email && profile.email.includes('@')) {
        try {
          const { createUserWithEmailAndPassword } = await import('firebase/auth');
          const { auth } = await import('../services/firebase');
          await createUserWithEmailAndPassword(auth, profile.email.trim().toLowerCase(), cleanPassword);
        } catch (fbCreateErr: any) {
          console.warn("Firebase Auth user creation note (may already exist in Auth):", fbCreateErr?.message || fbCreateErr);
        }
      }

      // 2. Save profile in local Dexie DB & Cloud Firestore
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
        message: '🎉 Account password created successfully! Logging you in...',
        profile: updatedProfile
      };
    } catch (err) {
      console.error('Error creating account:', err);
      return { success: false, message: 'An error occurred while creating account.' };
    }
  },

  login: async (emailOrPhone: string, password?: string) => {
    try {
      const input = emailOrPhone.trim().toLowerCase();
      const cleanPassword = password ? password.trim() : undefined;

      // 1. Try Firebase Authentication if input looks like email and password is provided
      if (input.includes('@') && cleanPassword) {
        try {
          const { signInWithEmailAndPassword } = await import('firebase/auth');
          const { auth, fetchCollectionFromFirestore } = await import('../services/firebase');
          
          const userCredential = await signInWithEmailAndPassword(auth, input, cleanPassword);
          if (userCredential.user) {
            const firebaseUser = userCredential.user;
            
            // Sync profiles from Firestore Database 'green-energy-solution'
            const remoteProfiles = await fetchCollectionFromFirestore<Profile>('profiles');
            let matchedProfile = remoteProfiles.find(
              p => (p.id === firebaseUser.uid || p.email?.toLowerCase() === input)
            );

            if (matchedProfile) {
              if (matchedProfile.isActive === false) {
                const { signOut } = await import('firebase/auth');
                await signOut(auth);
                return {
                  success: false,
                  message: '⛔ Access Denied: Your account has been blocked/deactivated by Super Admin. Please contact administration.'
                };
              }
              matchedProfile.password = cleanPassword;
              matchedProfile.isActivated = true;
            } else {
              matchedProfile = {
                id: firebaseUser.uid,
                fullName: firebaseUser.displayName || input.split('@')[0],
                email: input,
                phone: firebaseUser.phoneNumber || '',
                role: 'super_admin',
                isActive: true,
                isActivated: true,
                password: cleanPassword,
                createdAt: new Date().toISOString()
              };
              const { saveRecordToFirestore } = await import('../services/firebase');
              await saveRecordToFirestore('profiles', matchedProfile.id, matchedProfile);
            }

            if (matchedProfile) {
              await db.profiles.put(matchedProfile);

              persistUserSession(matchedProfile);
              set({
                currentUser: matchedProfile,
                currentRole: matchedProfile.role,
                isAuthenticated: true,
                originalUser: null
              });

              return { success: true };
            }
          }
        } catch (fbErr: any) {
          console.warn("Firebase direct Auth note, trying profile verification:", fbErr?.message || fbErr);
        }
      }

      // 2. Profile Verification (Local IndexedDB & Cloud Firestore profiles)
      const { isApproved, profile } = await get().verifyPreApprovedEmail(input);

      if (!isApproved || !profile) {
        return {
          success: false,
          message: `Access Denied: Email/Phone "${input}" is not registered in the system. Please contact Super Admin to get your email ID added.`
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
        if (profile.password !== cleanPassword) {
          return {
            success: false,
            message: 'Incorrect password. Please verify your password and try again.'
          };
        }
      } else {
        // Password is not set yet on this pre-approved account
        return {
          success: false,
          message: `Welcome ${profile.fullName || input}! Your email is pre-approved by Super Admin, but your account password is not set yet. Please click "Create Account / Set Password" below.`,
          requirePasswordSetup: true
        };
      }

      // Register user in Firebase Auth in background if missing
      if (input.includes('@') && cleanPassword) {
        (async () => {
          try {
            const { createUserWithEmailAndPassword } = await import('firebase/auth');
            const { auth } = await import('../services/firebase');
            await createUserWithEmailAndPassword(auth, input, cleanPassword);
          } catch (_) {}
        })();
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
    const savedUserId = localStorage.getItem('ges_user_id');
    const savedEmail = localStorage.getItem('ges_user_email');
    const savedAuth = localStorage.getItem('ges_authenticated') === 'true';
    const savedProfileStr = localStorage.getItem('ges_user_profile');

    // 0. Instant Optimistic Unlock: if cached session exists in localStorage, unlock UI immediately (0ms)
    if (savedAuth && savedProfileStr) {
      try {
        const cached = JSON.parse(savedProfileStr) as Profile;
        if (cached && (cached.id || cached.email) && cached.isActive !== false) {
          set({
            currentUser: cached,
            currentRole: cached.role,
            isAuthenticated: true,
            isLoading: false,
            originalUser: null
          });
        }
      } catch (_) {}
    } else if (!savedAuth && !savedUserId) {
      // Not authenticated: show login screen immediately without waiting (0ms)
      set({
        currentUser: null,
        isAuthenticated: false,
        isLoading: false,
        originalUser: null
      });
    }

    try {
      // Background verification & Dexie initialization
      await seedDemoData(); // Seeds if empty
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

      // 4. If still not found, search remote Cloud Firestore / Firebase Auth (fast 3s timeout)
      if (!profile && savedAuth) {
        try {
          const { auth, fetchCollectionFromFirestore } = await import('../services/firebase');
          const fbUser = auth.currentUser;
          const remoteProfiles = await fetchCollectionFromFirestore<Profile>('profiles', 3000);
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

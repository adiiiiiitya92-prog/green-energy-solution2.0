import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyBKLwdN137XN8xbFU58BATMRoVFPyVbVVE",
  authDomain: "green-energy-solution-dcfa8.firebaseapp.com",
  projectId: "green-energy-solution-dcfa8",
  storageBucket: "green-energy-solution-dcfa8.firebasestorage.app",
  messagingSenderId: "169155482765",
  appId: "1:169155482765:web:955e322b4c1655fe2ebec4"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function run() {
  const profilesSnap = await getDocs(collection(db, 'profiles'));
  const profiles = profilesSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  console.log(`Total Profiles: ${profiles.length}`);
  profiles.forEach(p => {
    console.log(`- Name: ${p.fullName || p.name}, Role: ${p.role}, Designation: ${p.designation}, Email: ${p.email}`);
  });
  process.exit(0);
}

run().catch(console.error);

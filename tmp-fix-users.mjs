import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import {
  getFirestore,
  collection,
  doc,
  getDocs,
  query,
  setDoc,
  where,
  deleteDoc,
} from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyBgwHTAGWlWGUJAV0zLxsa48Zw-xVkjaI8",
  authDomain: "edet-be4ec.firebaseapp.com",
  databaseURL: "https://edet-be4ec-default-rtdb.firebaseio.com",
  projectId: "edet-be4ec",
  storageBucket: "edet-be4ec.firebasestorage.app",
  messagingSenderId: "811388526827",
  appId: "1:811388526827:web:53e8683650699fb2fcdeae",
};

const appId = 'pos-pagofacil';
const adminEmail = 'exequiel@pos.local';
const adminPassword = 'selenieta';

const usersToFix = [
  { uid: 'NKLdUGILSfSaMIFvIP9b9olZSpg1', email: 'angel@pos.local', name: 'Angel' },
  { uid: '1CxiN2KVcgPXWJtGZKFcewMwK773', email: 'micaela@pos.local', name: 'Micaela' },
];

async function findUserDocs(usersRef, email, username) {
  const hits = [];
  const byEmail = query(usersRef, where('email', '==', email));
  const snapEmail = await getDocs(byEmail);
  snapEmail.forEach((d) => hits.push({ id: d.id, data: d.data() }));

  if (hits.length === 0 && username) {
    const byUsername = query(usersRef, where('username', '==', username));
    const snapUsername = await getDocs(byUsername);
    snapUsername.forEach((d) => hits.push({ id: d.id, data: d.data() }));
  }

  return hits;
}

async function main() {
  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db = getFirestore(app);

  await signInWithEmailAndPassword(auth, adminEmail, adminPassword);

  const usersRef = collection(db, 'artifacts', appId, 'public', 'data', 'users');

  for (const u of usersToFix) {
    const username = u.email.split('@')[0];
    const found = await findUserDocs(usersRef, u.email, username);

    let base = {};
    if (found.length > 0) {
      base = found[0].data || {};
    }

    const payload = {
      ...base,
      uid: u.uid,
      email: u.email,
      username: base.username || username,
      name: base.name || u.name,
      role: base.role || 'cashier',
    };

    await setDoc(doc(usersRef, u.uid), payload, { merge: true });

    for (const d of found) {
      if (d.id !== u.uid) {
        await deleteDoc(doc(usersRef, d.id));
      }
    }

    console.log(`OK: ${u.email} -> ${u.uid} (migrated ${found.length} doc(s))`);
  }
}

main().catch((err) => {
  console.error('ERROR:', err);
  process.exit(1);
});

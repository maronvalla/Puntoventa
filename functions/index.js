const { onCall, HttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");

admin.initializeApp();

async function assertAdminRole(appId, uid) {
  if (!uid) throw new HttpsError("unauthenticated", "No autenticado");

  const ref = admin
    .firestore()
    .doc(`artifacts/${appId}/public/data/users/${uid}`);

  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError("permission-denied", "Sin perfil de usuario");

  const data = snap.data();
  if (data.role !== "admin") {
    throw new HttpsError("permission-denied", "Solo admin");
  }
}

exports.createCashier = onCall({ region: "us-central1" }, async (request) => {
  const { appId, username, password, displayName } = request.data || {};
  if (!appId || !username || !password) {
    throw new HttpsError("invalid-argument", "Faltan datos");
  }

  await assertAdminRole(appId, request.auth?.uid);

  const email = `${String(username).toLowerCase()}@pos.local`;

  let userRecord;
  try {
    userRecord = await admin.auth().createUser({
      email,
      password,
      displayName: displayName || username,
    });
  } catch (e) {
    // Ej: email ya existe
    throw new HttpsError("already-exists", e.message);
  }

  await admin
    .firestore()
    .doc(`artifacts/${appId}/public/data/users/${userRecord.uid}`)
    .set({
      uid: userRecord.uid,
      username,
      name: displayName || username,
      role: "cashier",
      active: true,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

  return { uid: userRecord.uid, email };
});

exports.deleteCashier = onCall({ region: "us-central1" }, async (request) => {
  const { appId, uid } = request.data || {};
  if (!appId || !uid) throw new HttpsError("invalid-argument", "Faltan datos");

  await assertAdminRole(appId, request.auth?.uid);

  // Marcar inactivo (histórico)
  await admin
    .firestore()
    .doc(`artifacts/${appId}/public/data/users/${uid}`)
    .set({ active: false }, { merge: true });

  // Borrar usuario de Auth
  await admin.auth().deleteUser(uid);

  return { ok: true };
});


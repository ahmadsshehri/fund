/**
 * Firebase Setup Script
 * Run: node scripts/setup-firebase.js
 * 
 * Creates the initial admin (manager) user in Firebase Auth + Firestore
 * Run ONCE after configuring Firebase.
 */

const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccount.json'); // Download from Firebase Console

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();
const auth = admin.auth();

async function setup() {
  const email = 'admin@fund.local';
  const password = 'Admin@1234'; // Change after first login!
  const name = 'مدير النظام';

  try {
    // Create Firebase Auth user
    const userRecord = await auth.createUser({ email, password, displayName: name });
    console.log('✅ Auth user created:', userRecord.uid);

    // Create Firestore user doc
    await db.collection('users').doc(userRecord.uid).set({
      name,
      email,
      role: 'manager',
      status: 'active',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      lastLogin: null,
    });
    console.log('✅ Firestore user doc created');
    console.log(`\n🎉 Setup complete!`);
    console.log(`   Email: ${email}`);
    console.log(`   Password: ${password}`);
    console.log(`   ⚠️  Change password after first login!`);
  } catch (error) {
    if (error.code === 'auth/email-already-exists') {
      console.log('ℹ️  User already exists - skipping');
    } else {
      console.error('❌ Error:', error);
    }
  }
  process.exit(0);
}

setup();

import { initializeApp } from "firebase/app";
import { doc, getDoc, getFirestore, setDoc } from "firebase/firestore";

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyBVXpZfu8ZooH9EbWhj_LLGHfe8iC32Fkg",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "gastosapp-1d97f.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "gastosapp-1d97f",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:924558470009:web:ecfa02e4ed457759eb5da8",
};

const enabled = Boolean(config.apiKey && config.projectId && config.appId);
const db = enabled ? getFirestore(initializeApp(config)) : null;
const documentFor = (profile) => doc(db, "gastosapp_profiles", profile);

export const firestoreEnabled = () => enabled;

export async function readProfile(profile) {
  const snapshot = await getDoc(documentFor(profile));
  return snapshot.exists() ? snapshot.data().data : null;
}

export async function writeProfile(profile, data) {
  await setDoc(documentFor(profile), { data, updatedAt: new Date().toISOString() });
}

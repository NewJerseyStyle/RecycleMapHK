import { initializeApp } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-analytics.js";
import {
  getFirestore, doc, getDoc, setDoc, updateDoc, increment, onSnapshot, collection
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyAnLReVFFYo376JMCnuecied7eAfE6XjU0",
  authDomain: "recyclemap-hk.firebaseapp.com",
  projectId: "recyclemap-hk",
  storageBucket: "recyclemap-hk.firebasestorage.app",
  messagingSenderId: "1059238403555",
  appId: "1:1059238403555:web:493d7f893b4a531d3d54d6",
  measurementId: "G-FDS9ZYG8RV"
};

const app = initializeApp(firebaseConfig);
getAnalytics(app);
const db = getFirestore(app);

function getOrCreateUid() {
  let uid = localStorage.getItem('rhk_uid');
  if (!uid) {
    uid = 'u_' + Math.random().toString(36).slice(2, 11) + '_' + Date.now().toString(36);
    localStorage.setItem('rhk_uid', uid);
  }
  return uid;
}

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function yesterdayKey() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

window.rhk = {
  getStatus() {
    const today = todayKey();
    const lastCheckIn = localStorage.getItem('rhk_last_checkin') || '';
    const streak = parseInt(localStorage.getItem('rhk_streak') || '0');
    return { checkedInToday: lastCheckIn === today, streak };
  },

  async recordCheckIn(districtIndex) {
    const uid = getOrCreateUid();
    const today = todayKey();

    if (localStorage.getItem('rhk_last_checkin') === today) {
      return { success: false, reason: 'already_checked_in' };
    }

    // Update streak locally first (optimistic)
    const last = localStorage.getItem('rhk_last_checkin') || '';
    let streak = parseInt(localStorage.getItem('rhk_streak') || '0');
    streak = (last === yesterdayKey()) ? streak + 1 : 1;
    localStorage.setItem('rhk_streak', String(streak));
    localStorage.setItem('rhk_last_checkin', today);

    // Sync to Firestore (gracefully degrades offline)
    try {
      const checkinRef = doc(db, 'checkins', `${uid}_${today}`);
      const existing = await getDoc(checkinRef);
      if (!existing.exists()) {
        await setDoc(checkinRef, { uid, districtIndex, date: today, points: 5, ts: Date.now() });
        const distRef = doc(db, 'district_scores', String(districtIndex));
        await updateDoc(distRef, { score: increment(5), districtIndex }).catch(async () => {
          await setDoc(distRef, { score: 5, districtIndex });
        });
      }
    } catch (e) {
      console.warn('Firestore offline — check-in saved locally only:', e.message);
    }

    return { success: true, points: 5, streak };
  },

  subscribeDistrictScores(callback) {
    try {
      return onSnapshot(collection(db, 'district_scores'), (snap) => {
        const scores = {};
        snap.forEach(d => { scores[d.data().districtIndex] = d.data().score || 0; });
        callback(scores);
      }, (e) => console.warn('Leaderboard snapshot error:', e.message));
    } catch (e) {
      console.warn('Leaderboard subscription failed:', e.message);
      return () => {};
    }
  }
};

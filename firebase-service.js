import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
    getAuth,
    GoogleAuthProvider,
    signInWithPopup,
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    onAuthStateChanged,
    signOut,
    getAdditionalUserInfo,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import {
    initializeFirestore,
    persistentLocalCache,
    persistentMultipleTabManager,
    collection,
    doc,
    setDoc,
    getDocs,
    query,
    Timestamp,
    serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const FAKE_DOMAIN = "@barrascanner.local";
const ENV_ERROR =
    "Firebase is not available in this environment. Define runtime config via /__/firebase/init.json or window.__BARRA_FIREBASE_CONFIG__.";

async function tryGetJson(url) {
    try {
        const response = await fetch(url, { cache: "no-store" });
        if (!response.ok) return null;
        const contentType = response.headers.get("content-type") || "";
        if (!contentType.toLowerCase().includes("application/json")) return null;
        return await response.json();
    } catch {
        return null;
    }
}

function getWindowConfig() {
    const cfg = window.__BARRA_FIREBASE_CONFIG__;
    if (!cfg || typeof cfg !== 'object') return null;
    return cfg;
}

async function loadFirebaseConfig() {
    const hostingConfig = await tryGetJson("/__/firebase/init.json");
    if (hostingConfig) return hostingConfig;

    const runtimeConfig = getWindowConfig();
    if (runtimeConfig) return runtimeConfig;

    return null;
}

async function createFirebaseRuntime() {
    const firebaseConfig = await loadFirebaseConfig();
    if (!firebaseConfig) {
        console.warn("[firebase-service]", ENV_ERROR);
        return { app: null, auth: null, db: null, enabled: false };
    }

    const app = initializeApp(firebaseConfig);
    const auth = getAuth(app);
    const db = initializeFirestore(app, {
        localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    });
    return { app, auth, db, enabled: true };
}

const runtime = await createFirebaseRuntime();

function unavailableResult() {
    return { success: false, error: ENV_ERROR };
}

export const fbService = {
    auth: runtime.auth,
    db: runtime.db,
    enabled: runtime.enabled,
    currentUser: null,

    init(onUserChange) {
        if (!runtime.enabled) {
            this.currentUser = null;
            onUserChange(null);
            return;
        }
        onAuthStateChanged(runtime.auth, (user) => {
            this.currentUser = user;
            onUserChange(user);
        });
    },

    getInitialUser() {
        return new Promise((resolve, reject) => {
            if (!this.enabled) {
                return resolve(null);
            }
            let resolved = false;
            const timer = setTimeout(() => {
                if (!resolved) {
                    resolved = true;
                    console.warn("[firebase-service] Auth check timed out, proceeding as guest/offline.");
                    resolve(null);
                }
            }, 3000);

            const unsubscribe = onAuthStateChanged(this.auth, user => {
                if (resolved) return;
                resolved = true;
                clearTimeout(timer);
                unsubscribe();
                this.currentUser = user;
                resolve(user);
            }, err => {
                if (resolved) return;
                resolved = true;
                clearTimeout(timer);
                unsubscribe();
                reject(err);
            });
        });
    },

    async createUserProfile(user) {
        if (!runtime.enabled || !user) return;
        const userRef = doc(runtime.db, "users", user.uid);
        const displayName = user.displayName || user.email.split("@")[0];
        const profileData = {
            uid: user.uid,
            email: user.email,
            displayName,
            photoURL: user.photoURL,
            createdAt: serverTimestamp(),
        };
        try {
            await setDoc(userRef, profileData);
        } catch (error) {
            console.error("Error creating user profile:", error);
        }
    },

    async loginGoogle() {
        if (!runtime.enabled) return unavailableResult();
        const provider = new GoogleAuthProvider();
        try {
            const result = await signInWithPopup(runtime.auth, provider);
            const additionalInfo = getAdditionalUserInfo(result);
            if (additionalInfo?.isNewUser) {
                await this.createUserProfile(result.user);
            }
            return { success: true, user: result.user };
        } catch (error) {
            return { success: false, error: error.message };
        }
    },

    async loginPin(username, pin) {
        if (!runtime.enabled) return unavailableResult();
        const sanitizedUsername = username.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
        if (!sanitizedUsername) {
            return { success: false, error: "Invalid username." };
        }

        const email = `${sanitizedUsername}${FAKE_DOMAIN}`;
        const password = pin.toString().padEnd(6, "0");

        try {
            const result = await signInWithEmailAndPassword(runtime.auth, email, password);
            return { success: true, user: result.user };
        } catch (error) {
            const createAccountCodes = [
                "auth/invalid-credential",
                "auth/user-not-found",
                "auth/wrong-password",
                "auth/invalid-login-credentials",
            ];

            if (createAccountCodes.includes(error.code)) {
                try {
                    const newResult = await createUserWithEmailAndPassword(runtime.auth, email, password);
                    await this.createUserProfile(newResult.user);
                    return { success: true, user: newResult.user, isNew: true };
                } catch (createError) {
                    if (createError.code === "auth/email-already-in-use") {
                        return { success: false, error: "Incorrect PIN." };
                    }
                    return { success: false, error: "Could not create account." };
                }
            }
            return { success: false, error: `Authentication error: ${error.code}` };
        }
    },

    async logout() {
        if (!runtime.enabled) return unavailableResult();
        try {
            await signOut(runtime.auth);
            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    },

    async saveScan(scanData) {
        if (!runtime.enabled || !this.currentUser) return unavailableResult();
        try {
            const scanRef = doc(collection(runtime.db, "users", this.currentUser.uid, "scans"));
            await setDoc(scanRef, {
                ...scanData,
                createdAt: serverTimestamp(),
                localTimestamp: Date.now(),
            });
            return { success: true, id: scanRef.id };
        } catch (error) {
            return { success: false, error: error.message };
        }
    },

    async getScans() {
        if (!runtime.enabled || !this.currentUser) return [];
        try {
            const scansQuery = query(collection(runtime.db, "users", this.currentUser.uid, "scans"));
            const snapshot = await getDocs(scansQuery);
            return snapshot.docs.map(docSnap => {
                const data = docSnap.data();
                const ts = data.createdAt instanceof Timestamp
                    ? data.createdAt.toMillis()
                    : (typeof data.createdAt === "number" ? data.createdAt : Date.now());
                return {
                    id: docSnap.id,
                    ...data,
                    createdAt: ts,
                };
            });
        } catch (error) {
            console.error("Error getting scans:", error);
            return [];
        }
    }
};

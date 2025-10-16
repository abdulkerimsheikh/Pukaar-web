import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, doc, setDoc, addDoc, onSnapshot, collection, query, setLogLevel } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// Set Firebase Log Level for debugging
setLogLevel('Debug');

/* CONFIG & STATE */
const OFFICE = { lat: 24.8607, lng: 67.0011, title: "Pukaar HQ", address: "Karachi, Pakistan" };
const STORAGE_KEYS = { THEME: "pukaar-theme" }; // Theme still uses local storage

const appState = {
    draft: {},
    history: [],
    userId: null,
    isAuthReady: false,
};

let db, auth;
let appId, firebaseConfig;

/* FIREBASE INIT AND AUTH */
try {
    // Global variables provided by the Canvas environment
    appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
    firebaseConfig = JSON.parse(typeof __firebase_config !== 'undefined' ? __firebase_config : '{}');

    if (Object.keys(firebaseConfig).length > 0) {
        const app = initializeApp(firebaseConfig);
        db = getFirestore(app);
        auth = getAuth(app);

        const authStatusEl = document.getElementById("auth-status");
        authStatusEl.textContent = "Authenticating...";

        onAuthStateChanged(auth, async (user) => {
            if (user) {
                appState.userId = user.uid;
                authStatusEl.textContent = "Service connected. User ID: " + appState.userId;
            } else {
                // Sign in anonymously if no token is available or user is signed out
                try {
                    if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
                        await signInWithCustomToken(auth, __initial_auth_token);
                    } else {
                        await signInAnonymously(auth);
                    }
                } catch (e) {
                    console.error("Firebase Auth failed:", e);
                    appState.userId = crypto.randomUUID(); // Fallback ID for local logic
                    authStatusEl.textContent = "Connection error. Using local session ID.";
                }
                // Return to prevent immediate initialization if auth state is changing
                return;
            }
            // Only proceed once a user (authenticated or anonymous) is established
            if (!appState.isAuthReady) {
                appState.isAuthReady = true;
                // Enable buttons once auth is ready
                document.getElementById("sendBtn").disabled = false;
                document.getElementById("saveDraft").disabled = false;
                initFirestoreListeners();
            }
        });
    } else {
        console.error("Firebase config is missing.");
        document.getElementById("auth-status").textContent = "Error: Firebase not configured.";
    }
} catch(e) {
    console.error("Initialization error:", e);
    document.getElementById("auth-status").textContent = "Error during setup.";
}

/* FIREBASE PATHS */
const getDraftDocRef = (userId) => doc(db, `artifacts/${appId}/users/${userId}/contactState/draft`);
const getMessagesCollectionRef = (userId) => collection(db, `artifacts/${appId}/users/${userId}/contactMessages`);

/* UTILITIES */
function escapeHtml(s = "") {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Debounce utility to prevent too many draft writes
const debounce = (func, delay) => {
    let timeoutId;
    return (...args) => {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => func.apply(this, args), delay);
    };
};

/* === MAP INITIALIZATION === */
let mapInitialized = false;

function initMap() {
    if (mapInitialized) return;
    const mapEl = document.getElementById("mapContact");
    // Leaflet global variable L is loaded via script tag in HTML
    if (!mapEl || typeof L === "undefined") return; 

    try {
        const map = L.map(mapEl).setView([OFFICE.lat, OFFICE.lng], 13);
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
            attribution: '&copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a>',
            maxZoom: 19,
        }).addTo(map);

        const marker = L.marker([OFFICE.lat, OFFICE.lng]).addTo(map);
        marker.bindPopup(`<strong>${escapeHtml(OFFICE.title)}</strong><br>${escapeHtml(OFFICE.address)}`);
        mapInitialized = true;
    } catch (err) {
        console.error("Map init failed:", err);
        mapEl.style.display = "none";
    }
}

/* === THEME HANDLER === */
function initTheme() {
    const themeBtn = document.getElementById("theme-toggle");
    if (!themeBtn) return;

    if (localStorage.getItem(STORAGE_KEYS.THEME) === "dark") {
        document.body.classList.add("dark");
        themeBtn.innerText = "☀️";
    }

    themeBtn.addEventListener("click", () => {
        document.body.classList.toggle("dark");
        themeBtn.innerText = document.body.classList.contains("dark") ? "☀️" : "🌙";
        localStorage.setItem(STORAGE_KEYS.THEME, document.body.classList.contains("dark") ? "dark" : "light");
    });
}

/* === NAVBAR UNDERLINE ANIMATION === */
function initNavUnderline() {
    const nav = document.querySelector("#navLinks");
    const underline = document.querySelector(".nav-underline");
    if (!nav || !underline) return;

    const links = nav.querySelectorAll(".nav-link");
    
    function moveUnderline(link) {
        const rect = link.getBoundingClientRect();
        // Use GSAP for smooth animation (GSAP is imported in HTML)
        if (typeof gsap !== 'undefined') {
             gsap.to(underline, {
                duration: 0.3,
                width: rect.width,
                x: link.offsetLeft,
                opacity: 1,
                ease: "power2.out"
            });
        } else {
            underline.style.width = `${rect.width}px`;
            underline.style.left = `${link.offsetLeft}px`;
            underline.style.opacity = 1;
        }
    }

    links.forEach(link => {
        // Initial placement for active link
        if (link.classList.contains("active")) moveUnderline(link);

        link.addEventListener("mouseenter", () => moveUnderline(link));
        // Restore to active link position on mouseleave from the *nav container*
        nav.closest("#navbarNav").addEventListener("mouseleave", () => {
            const active = document.querySelector(".nav-link.active");
            if (active) moveUnderline(active);
        });
    });

    window.addEventListener("resize", () => {
        const active = document.querySelector(".nav-link.active");
        if (active) moveUnderline(active);
    });
}


/* === MAIN APP LOGIC === */
document.addEventListener("DOMContentLoaded", () => {
    // Map needs to be initialized outside of the module scope due to Leaflet loading
    // We check for 'L' globally (L is loaded via a separate script tag in HTML)
    if (typeof L === "undefined") {
        const interval = setInterval(() => {
            if (typeof L !== "undefined") {
                clearInterval(interval);
                initMap();
            }
        }, 100);
    } else initMap();

    initTheme();
    initNavUnderline();

    // DOM elements
    const form = document.getElementById("contactForm");
    const inputName = document.getElementById("name");
    const inputEmail = document.getElementById("email");
    const inputPhone = document.getElementById("phone");
    const selectCategory = document.getElementById("category");
    const textareaMsg = document.getElementById("message");
    const sendBtn = document.getElementById("sendBtn");
    const saveDraftBtn = document.getElementById("saveDraft");
    const messageCountEl = document.getElementById("messageCount");
    const historyList = document.getElementById("historyList");
    const toastEl = document.getElementById("contactToast");
    const toastBody = document.getElementById("contactToastBody");

    const errorElements = {
        name: document.getElementById("err-name"),
        email: document.getElementById("err-email"),
        message: document.getElementById("err-message"),
    };

    const showToast = (msg, type = "info") => {
        toastBody.textContent = msg;
        // Check for Bootstrap global variable
        if (typeof bootstrap !== 'undefined') {
            toastEl.classList.remove("bg-success", "bg-danger", "bg-primary", "bg-dark");
            toastEl.classList.add(
                type === "success" ? "bg-success" :
                type === "error" ? "bg-danger" :
                type === "info" ? "bg-primary" : "bg-dark"
            );
            new bootstrap.Toast(toastEl).show();
        } else {
            console.log(`[Toast ${type}]: ${msg}`);
        }
    };

    /* === FIREBASE LISTENERS & DATA FLOW === */

    window.initFirestoreListeners = () => {
        if (!appState.isAuthReady || !db) return;

        // 1. Listen for Draft Changes
        const draftRef = getDraftDocRef(appState.userId);
        onSnapshot(draftRef, (doc) => {
            if (doc.exists()) {
                const data = doc.data();
                appState.draft = data;
                // Only load draft to form if the message field is empty
                if (!textareaMsg.value.trim()) {
                    loadDraftToForm(data);
                    console.log("Draft loaded from Firestore.");
                }
            } else {
                appState.draft = {};
                console.log("No draft found in Firestore.");
            }
        }, (error) => {
            console.error("Error listening to draft:", error);
        });

        // 2. Listen for History/Submitted Messages
        const messagesQuery = query(
            getMessagesCollectionRef(appState.userId),
            // IMPORTANT: No orderBy to prevent index errors. We'll sort locally.
        );

        onSnapshot(messagesQuery, (snapshot) => {
            appState.history = [];
            snapshot.forEach(doc => {
                appState.history.push({ id: doc.id, ...doc.data() });
            });
            
            // Sort locally by createdAt (descending)
            appState.history.sort((a, b) => {
                const dateA = a.createdAt ? new Date(a.createdAt) : 0;
                const dateB = b.createdAt ? new Date(b.createdAt) : 0;
                return dateB - dateA;
            });

            updateUI();
        }, (error) => {
            console.error("Error listening to messages:", error);
            historyList.innerHTML = `<div class="text-danger">Failed to load history: ${error.message}</div>`;
        });
    };

    const loadDraftToForm = (data) => {
        inputName.value = data.name || "";
        inputEmail.value = data.email || "";
        inputPhone.value = data.phone || "";
        selectCategory.value = data.category || "general";
        textareaMsg.value = data.message || "";
    };

    /* === UPDATE UI === */
    const updateUI = () => {
        messageCountEl.textContent = `Submitted Messages: ${appState.history.length}`;

        if (appState.history.length === 0) {
            historyList.innerHTML = '<div class="text-muted">No messages yet. Submit one to start your history.</div>';
            return;
        }

        historyList.innerHTML = appState.history
            .map((h, idx) => {
                const date = new Date(h.createdAt).toLocaleString();
                const preview = escapeHtml(h.message.slice(0, 100)) + (h.message.length > 100 ? "..." : "");
                const userIdDisplay = appState.userId ? `<small class="text-info ms-2">[${appState.userId}]</small>` : '';

                return `<div class="list-group-item d-flex justify-content-between align-items-start">
                    <div>
                        <div class="fw-bold">${escapeHtml(h.name || "Anonymous")} ${userIdDisplay} <small class="text-muted">• ${escapeHtml(
                            h.category
                        )}</small></div>
                        <div class="small text-muted">${date}</div>
                        <div class="mt-1">${preview}</div>
                    </div>
                    <div class="text-end">
                        <span class="badge bg-success">Submitted</span>
                        <button class="btn btn-sm btn-link copy-btn" data-index="${idx}">Copy</button>
                    </div>
                </div>`;
            })
            .join("");
            
        // Re-attach event listeners for dynamically created copy buttons
        document.querySelectorAll(".copy-btn").forEach(btn => {
            btn.addEventListener("click", (e) => {
                const idx = parseInt(e.currentTarget.getAttribute('data-index'));
                copyMessage(idx);
            });
        });
    };

    /* === VALIDATION === */
    const validateField = (field) => {
        let isValid = true;
        let msg = "";
        if (field === "name" && inputName.value.trim().length < 2) {
            msg = "Name too short (min 2 chars).";
            isValid = false;
        } else if (
            field === "email" &&
            inputEmail.value.trim() &&
            !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(inputEmail.value.trim())
        ) {
            msg = "Invalid email format.";
            isValid = false;
        } else if (field === "message" && textareaMsg.value.trim().length < 10) {
            msg = "Message too short (min 10 chars).";
            isValid = false;
        }
        if (errorElements[field]) errorElements[field].textContent = msg;
        return isValid;
    };
    
    /* === DRAFT MANAGEMENT (Debounced Write) === */
    const saveDraftToFirestore = debounce(() => {
        if (!appState.isAuthReady || !db) return;
        
        const currentDraft = {
            name: inputName.value.trim(),
            email: inputEmail.value.trim(),
            phone: inputPhone.value.trim(),
            category: selectCategory.value,
            message: textareaMsg.value.trim(),
            updatedAt: new Date().toISOString(),
        };
        
        setDoc(getDraftDocRef(appState.userId), currentDraft, { merge: false })
            .then(() => {
                console.log("Draft auto-saved successfully.");
            })
            .catch((e) => {
                console.error("Failed to save draft:", e);
            });
    }, 1000); // Debounce by 1 second

    /* === SUBMIT MESSAGE === */
    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!appState.isAuthReady || !db) {
            showToast("Service is still connecting. Please wait.", "info");
            return;
        }

        const fieldsToValidate = ["name", "message"];
        if (inputEmail.value.trim()) fieldsToValidate.push("email");
        
        let allValid = true;
        fieldsToValidate.forEach(f => {
            if (!validateField(f)) allValid = false;
        });

        if (!allValid) {
            showToast("Please fix the required fields.", "error");
            return;
        }

        const messagePayload = {
            name: inputName.value.trim(),
            email: inputEmail.value.trim(),
            phone: inputPhone.value.trim(),
            category: selectCategory.value,
            message: textareaMsg.value.trim(),
            createdAt: new Date().toISOString(),
            status: "submitted",
            userId: appState.userId,
        };

        sendBtn.disabled = true;
        sendBtn.textContent = "Submitting...";
        
        try {
            // 1. Submit the message
            await addDoc(getMessagesCollectionRef(appState.userId), messagePayload);
            showToast("Message submitted successfully! Check your history below.", "success");
            
            // 2. Clear the form and draft
            form.reset();
            await setDoc(getDraftDocRef(appState.userId), {}); // Clear draft in Firestore

        } catch (err) {
            console.error("Error submitting message:", err);
            showToast("Submission failed. Check your connection or console for details.", "error");
        } finally {
            sendBtn.disabled = false;
            sendBtn.textContent = "Send Message";
        }
    };


    /* === COPY MESSAGE (GLOBAL) === */
    // Expose the function globally for event listeners created in updateUI
    window.copyMessage = function (idx) {
        const h = appState.history[idx];
        if (!h) return;
        const txt = `Name: ${h.name}\nEmail: ${h.email || 'N/A'}\nCategory: ${h.category}\n---\nMessage:\n${h.message}`;
        
        // Use modern clipboard API with fallback
        navigator.clipboard.writeText(txt).then(() => {
            showToast("Message details copied to clipboard", "info");
        }).catch(() => {
            // Fallback using older method if modern API fails (common in iframes)
            const textarea = document.createElement('textarea');
            textarea.value = txt;
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);
            showToast("Message details copied to clipboard (Fallback)", "info");
        });
    };

    /* === EVENTS === */
    form.addEventListener("submit", handleSubmit);
    
    // Manual draft save button
    saveDraftBtn.addEventListener("click", () => {
          saveDraftToFirestore();
          showToast("Draft manually saved to cloud.", "success");
    });
    
    // Auto-save draft on input changes
    const inputElements = [inputName, inputEmail, inputPhone, selectCategory, textareaMsg];
    inputElements.forEach(el => el.addEventListener("input", saveDraftToFirestore));
    
    // Validate on input
    ["name", "email", "message"].forEach((f) =>
        document.getElementById(f).addEventListener("input", () => validateField(f))
    );

    window.addEventListener("online", () => showToast("Back online", "info"));
});

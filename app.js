/* ============================================
   WERKVERDELINGSAPP - JavaScript Application
   ============================================ */

// ============================================
// FIREBASE AUTHENTICATION
// ============================================

// Current authenticated user
let currentAuthUser = null;
let currentUserProfile = null;
let authInitialized = false;

// Wait for Firebase to be ready
function waitForFirebase() {
    return new Promise((resolve) => {
        if (window.firebaseReady) {
            resolve();
        } else {
            window.addEventListener('firebase-ready', resolve, { once: true });
        }
    });
}

// Initialize auth state listener
async function initFirebaseAuth() {
    await waitForFirebase();

    const { onAuthStateChanged } = window.firebaseFunctions;
    const auth = window.firebaseAuth;

    onAuthStateChanged(auth, async (user) => {
        authInitialized = true;

        if (user) {
            // User is signed in
            currentAuthUser = user;
            console.log('User signed in:', user.email);

            // Fetch user profile from Firestore
            await fetchUserProfile(user.uid);

            console.log('Loading team data for teamId:', state.teamId);

            // Load team data from Firestore
            await loadTeamDataFromFirestore();

            // Subscribe to realtime updates
            subscribeToTeamData();

            // Hide login modal
            hideLoginModal();

            // Update UI with user info
            updateUserIndicator();

            // Update tab visibility based on role
            updateTabVisibility();

            // Render save states from Firestore
            renderSavedStatesFirestore();

            // Load user management data (for admins)
            loadTeamsDropdown();
            loadSchooljaren();
            loadTeamsList();
            loadUsersList();

            // Setup team switcher for admins
            setupTeamSwitcher();

            // Reset view states for new user session
            klassenState.geselecteerdeDocent = null;
            klassenState.geselecteerdLeerjaar = null;
            klassenState.geselecteerdeKlas = null;
            state.geselecteerdeDocent = null; // Verdeling tab
            if (typeof takenViewState !== 'undefined') {
                takenViewState.geselecteerdeDocent = null;
            }

            // Render everything
            renderAll();
        } else {
            // User is signed out
            currentAuthUser = null;
            currentUserProfile = null;
            console.log('User signed out');

            // Show login modal
            showLoginModal();
        }
    });
}

// Fetch user profile from Firestore
async function fetchUserProfile(userId) {
    try {
        const { doc, getDoc } = window.firebaseFunctions;
        const db = window.firebaseDb;

        const userDoc = await getDoc(doc(db, 'users', userId));

        if (userDoc.exists()) {
            currentUserProfile = userDoc.data();

            // Update state with user info
            state.currentUser = {
                id: userId,
                naam: currentUserProfile.afkorting || currentUserProfile.naam || '',
                rol: currentUserProfile.rol || 'teamlid',
                teamId: currentUserProfile.teamId || 'default-team'
            };

            // For admins, check if they had a different team selected (persisted in localStorage)
            const savedAdminTeam = localStorage.getItem('adminSelectedTeam');
            if (currentUserProfile.rol === 'admin' && savedAdminTeam) {
                state.teamId = savedAdminTeam;
                console.log('Admin restored to previously selected team:', savedAdminTeam);
            } else {
                state.teamId = currentUserProfile.teamId || 'default-team';
            }

            console.log('User profile loaded:', currentUserProfile);
        } else {
            console.warn('No user profile found in Firestore');
            // Create a basic profile for new users
            currentUserProfile = {
                email: currentAuthUser.email,
                naam: currentAuthUser.email.split('@')[0],
                afkorting: '',
                rol: 'teamlid',
                teamId: 'default-team'
            };
            state.currentUser = {
                id: userId,
                naam: currentUserProfile.naam,
                rol: 'teamlid',
                teamId: 'default-team'
            };
        }
    } catch (error) {
        console.error('Error fetching user profile:', error);
    }
}

// Show login modal
function showLoginModal() {
    const modal = document.getElementById('login-modal');
    const appContainer = document.querySelector('.app-container');

    if (modal) {
        modal.style.display = 'flex';
        // Focus on first input
        setTimeout(() => {
            const firstInput = modal.querySelector('input');
            if (firstInput) firstInput.focus();
        }, 100);
    }

    // Make app container inert (prevents tab navigation behind modal)
    if (appContainer) {
        appContainer.setAttribute('inert', '');
        appContainer.setAttribute('aria-hidden', 'true');
    }

    // Hide role selection modal since we get role from database now
    const roleModal = document.getElementById('role-selection-modal');
    if (roleModal) {
        roleModal.style.display = 'none';
    }
}

// Hide login modal
function hideLoginModal() {
    const modal = document.getElementById('login-modal');
    const appContainer = document.querySelector('.app-container');

    if (modal) {
        modal.style.display = 'none';
    }

    // Remove inert from app container
    if (appContainer) {
        appContainer.removeAttribute('inert');
        appContainer.removeAttribute('aria-hidden');
    }
}

// Handle login form submission
async function handleLogin(event) {
    event.preventDefault();

    const afkorting = document.getElementById('login-afkorting').value.trim().toLowerCase();
    const password = document.getElementById('login-password').value;
    const errorEl = document.getElementById('login-error');
    const submitBtn = document.getElementById('login-submit-btn');
    const btnText = submitBtn.querySelector('.login-btn-text');
    const btnLoading = submitBtn.querySelector('.login-btn-loading');

    // Create internal email from afkorting
    const email = `${afkorting}@werkverdelings.app`;

    // Show loading state
    btnText.style.display = 'none';
    btnLoading.style.display = 'inline';
    submitBtn.disabled = true;
    errorEl.style.display = 'none';

    try {
        const { signInWithEmailAndPassword } = window.firebaseFunctions;
        const auth = window.firebaseAuth;

        await signInWithEmailAndPassword(auth, email, password);
        // onAuthStateChanged will handle the rest

    } catch (error) {
        console.error('Login error:', error);

        // Show user-friendly error message
        let message = 'Er ging iets mis bij het inloggen.';
        switch (error.code) {
            case 'auth/invalid-credential':
            case 'auth/wrong-password':
            case 'auth/user-not-found':
                message = 'Onjuiste afkorting of wachtwoord.';
                break;
            case 'auth/too-many-requests':
                message = 'Te veel inlogpogingen. Probeer later opnieuw.';
                break;
            case 'auth/network-request-failed':
                message = 'Geen internetverbinding.';
                break;
        }

        errorEl.textContent = message;
        errorEl.style.display = 'block';
    } finally {
        // Reset button state
        btnText.style.display = 'inline';
        btnLoading.style.display = 'none';
        submitBtn.disabled = false;
    }
}

// Handle logout
async function handleLogout() {
    try {
        const { signOut } = window.firebaseFunctions;
        const auth = window.firebaseAuth;

        await signOut(auth);
        // onAuthStateChanged will handle the rest

    } catch (error) {
        console.error('Logout error:', error);
        alert('Er ging iets mis bij het uitloggen.');
    }
}

// Show forgot password modal
function showForgotPassword(event) {
    event.preventDefault();
    document.getElementById('login-modal').style.display = 'none';
    document.getElementById('forgot-password-modal').style.display = 'flex';

    // Pre-fill email if already entered
    const loginEmail = document.getElementById('login-email').value;
    if (loginEmail) {
        document.getElementById('reset-email').value = loginEmail;
    }
}

// Close forgot password modal
function closeForgotPasswordModal() {
    document.getElementById('forgot-password-modal').style.display = 'none';
    document.getElementById('login-modal').style.display = 'flex';
}

// Handle forgot password form
async function handleForgotPassword(event) {
    event.preventDefault();

    const email = document.getElementById('reset-email').value.trim();
    const messageEl = document.getElementById('reset-message');

    try {
        const { sendPasswordResetEmail } = window.firebaseFunctions;
        const auth = window.firebaseAuth;

        await sendPasswordResetEmail(auth, email);

        messageEl.className = 'login-message success';
        messageEl.textContent = 'Reset link verstuurd! Check je e-mail.';
        messageEl.style.display = 'block';

    } catch (error) {
        console.error('Password reset error:', error);

        messageEl.className = 'login-message error';
        messageEl.textContent = 'E-mailadres niet gevonden.';
        messageEl.style.display = 'block';
    }
}

// Update user indicator in navigation
function updateUserIndicator() {
    // Remove existing indicator if present
    const existingIndicator = document.querySelector('.user-indicator');
    if (existingIndicator) {
        existingIndicator.remove();
    }

    if (!currentUserProfile) return;

    // Create user indicator
    const navTabs = document.querySelector('.nav-tabs');
    if (!navTabs) return;

    const indicator = document.createElement('div');
    indicator.className = 'user-indicator';

    const displayName = currentUserProfile.afkorting || currentUserProfile.naam || currentAuthUser.email;
    const actualRole = currentUserProfile.rol;

    // Role icon only (no text label)
    const roleIcon = actualRole === 'admin' ? '👑' :
        (actualRole === 'teamleider' || actualRole === 'onderwijsplanner') ? '📢' : '';

    // Role-based styling class
    const roleClass = actualRole === 'admin' ? 'role-admin' :
        (actualRole === 'teamleider' || actualRole === 'onderwijsplanner') ? 'role-leader' : 'role-member';

    indicator.innerHTML = `
        <span class="user-badge ${roleClass}">
            <span class="user-name">${escapeHtml(displayName)}</span>
            ${roleIcon ? `<span class="user-role-icon">${roleIcon}</span>` : ''}
        </span>
        <button class="btn-logout-small" onclick="handleLogout()" title="Uitloggen">⏻</button>
    `;

    navTabs.appendChild(indicator);
}

// ============================================
// FIRESTORE DATABASE
// ============================================

// Load team data from Firestore
async function loadTeamDataFromFirestore() {
    if (!state.teamId || state.teamId === 'default-team') {
        console.log('No team ID set, using localStorage');
        return false;
    }

    try {
        const { doc, getDoc } = window.firebaseFunctions;
        const db = window.firebaseDb;

        const teamDoc = await getDoc(doc(db, 'teams', state.teamId));

        if (teamDoc.exists()) {
            const data = teamDoc.data();

            // Load team data into state
            state.leerjaren = data.leerjaren || [];
            state.vakken = data.vakken || [];
            state.docenten = data.docenten || [];
            state.toewijzingen = data.toewijzingen || [];
            state.taken = data.taken || [];
            state.docentTaken = data.docentTaken || [];

            // Get schooljaarId (new) or schooljaar (legacy)
            state.schooljaarId = data.schooljaarId || data.schooljaar || '';

            // Load week settings from schooljaren collection
            if (state.schooljaarId) {
                try {
                    const sjDoc = await getDoc(doc(db, 'schooljaren', state.schooljaarId));
                    if (sjDoc.exists()) {
                        const sjData = sjDoc.data();
                        state.basisweken = sjData.basisweken || { 1: 8, 2: 8, 3: 8, 4: 8 };
                        state.wekenPerPeriode = sjData.wekenPerPeriode || { 1: 10, 2: 10, 3: 10, 4: 10 };
                    } else {
                        // Fallback to team data (legacy) or defaults
                        state.basisweken = data.basisweken || { 1: 8, 2: 8, 3: 8, 4: 8 };
                        state.wekenPerPeriode = data.wekenPerPeriode || { 1: 10, 2: 10, 3: 10, 4: 10 };
                    }
                } catch (e) {
                    console.error('Error loading schooljaar:', e);
                    state.basisweken = data.basisweken || { 1: 8, 2: 8, 3: 8, 4: 8 };
                    state.wekenPerPeriode = data.wekenPerPeriode || { 1: 10, 2: 10, 3: 10, 4: 10 };
                }
            } else {
                // No schooljaar linked - use team data or defaults
                state.basisweken = data.basisweken || { 1: 8, 2: 8, 3: 8, 4: 8 };
                state.wekenPerPeriode = data.wekenPerPeriode || { 1: 10, 2: 10, 3: 10, 4: 10 };
            }

            console.log('Team data loaded from Firestore:', state.teamId, 'schooljaar:', state.schooljaarId);

            // Sync users to docenten state (Single Source of Truth)
            // This ensures we have the latest user list as docenten
            await syncUsersToDocentenState();

            return true;
        } else {
            console.log('No team data found, initializing empty');
            return false;
        }
    } catch (error) {
        console.error('Error loading team data:', error);
        return false;
    }
}

// Save team data to Firestore
async function saveTeamDataToFirestore() {
    if (!state.teamId || state.teamId === 'default-team' || !currentAuthUser) {
        // Fall back to localStorage if no team or not logged in
        saveToLocalStorage();
        return;
    }

    // TEAM ISOLATION CHECK: Only allow saving to user's own team unless admin
    const userTeamId = currentUserProfile?.teamId;
    if (!isUserAdmin() && userTeamId && userTeamId !== state.teamId) {
        console.error('BLOCKED: Attempted to save data to different team!',
            'User team:', userTeamId, 'Target team:', state.teamId);
        return;
    }

    try {
        const { doc, setDoc } = window.firebaseFunctions;
        const db = window.firebaseDb;

        const teamData = {
            leerjaren: state.leerjaren,
            vakken: state.vakken,
            docenten: state.docenten,
            toewijzingen: state.toewijzingen,
            basisweken: state.basisweken,
            wekenPerPeriode: state.wekenPerPeriode,
            taken: state.taken,
            docentTaken: state.docentTaken,
            lastModified: new Date().toISOString(),
            lastModifiedBy: currentAuthUser.uid
        };

        await setDoc(doc(db, 'teams', state.teamId), teamData, { merge: true });
        console.log('Team data saved to Firestore:', state.teamId);

    } catch (error) {
        console.error('Error saving team data:', error);
        // Fall back to localStorage
        saveToLocalStorage();
    }
}

// Subscribe to realtime team data updates
let teamDataUnsubscribe = null;

function subscribeToTeamData() {
    if (!state.teamId || state.teamId === 'default-team') return;

    // Unsubscribe from previous listener
    if (teamDataUnsubscribe) {
        teamDataUnsubscribe();
    }

    try {
        const { doc, onSnapshot } = window.firebaseFunctions;
        const db = window.firebaseDb;

        teamDataUnsubscribe = onSnapshot(doc(db, 'teams', state.teamId), (docSnapshot) => {
            if (docSnapshot.exists()) {
                const data = docSnapshot.data();

                // Only update if data was changed by someone else
                if (data.lastModifiedBy && data.lastModifiedBy !== currentAuthUser?.uid) {
                    console.log('Team data updated by another user');

                    state.leerjaren = data.leerjaren || [];
                    state.vakken = data.vakken || [];
                    state.docenten = data.docenten || [];
                    state.toewijzingen = data.toewijzingen || [];
                    state.basisweken = data.basisweken || { 1: 8, 2: 8, 3: 8, 4: 8 };
                    state.wekenPerPeriode = data.wekenPerPeriode || { 1: 10, 2: 10, 3: 10, 4: 10 };
                    state.taken = data.taken || [];
                    state.docentTaken = data.docentTaken || [];

                    // Re-render UI
                    renderAll();
                }
            }
        }, (error) => {
            console.error('Error listening to team data:', error);
        });

        console.log('Subscribed to team data updates');
    } catch (error) {
        console.error('Error subscribing to team data:', error);
    }
}

// Sync Users collection to Docenten state (Single Source of Truth)
async function syncUsersToDocentenState() {
    if (!state.teamId || state.teamId === 'default-team') return;

    try {
        const { collection, query, where, getDocs } = window.firebaseFunctions;
        const db = window.firebaseDb;
        const q = query(collection(db, 'users'), where('teamId', '==', state.teamId));
        const snapshot = await getDocs(q);

        if (snapshot.empty) {
            console.log("No users found for team, keeping existing docenten state");
            return;
        }

        const newDocenten = [];
        const existingDocenten = state.docenten || [];

        snapshot.forEach(doc => {
            const userData = doc.data();
            const userId = doc.id;
            // Prefer afkorting as requested, fallback to naam or email part
            const displayName = userData.afkorting || userData.naam || '';
            const afkorting = userData.afkorting || '';

            // Find existing docent to preserve color
            // Try ID match first, then Afkorting match (migration scenario)
            let existing = existingDocenten.find(d => d.id === userId);

            if (!existing && afkorting) {
                existing = existingDocenten.find(d => d.afkorting && d.afkorting.toLowerCase() === afkorting.toLowerCase());
                if (existing) {
                    // Migration needed! Found docent with same afkorting but different ID
                    console.log(`Migrating docent ${afkorting}: ${existing.id} -> ${userId}`);
                    migrateAssignments(existing.id, userId);
                }
            }

            const bruto = parseFloat(userData.aanstellingBruto) || parseFloat(userData.FTE) || 1.0;
            const inhouding = parseFloat(userData.inhouding) || 0.0;
            const netto = Math.max(0, bruto - inhouding);

            newDocenten.push({
                id: userId, // Always use Auth ID
                naam: displayName,
                afkorting: afkorting,
                aanstellingBruto: bruto,
                inhouding: inhouding,
                aanstelling: netto, // Used for calculations (Netto FTE)
                kleur: existing?.kleur || getRandomColor()
            });
        });

        // Sort by afkorting/naam
        newDocenten.sort((a, b) => a.naam.localeCompare(b.naam));

        // Update state
        state.docenten = newDocenten;
        console.log("Synced docenten from users:", state.docenten.length);

        // Save updated state to Firestore team data
        // This ensures the read-model (team doc) is up to date with the users collection
        saveTeamDataToFirestore();

        // Re-render
        renderDocentenLijst();
        renderAll();

    } catch (err) {
        console.error("Error syncing users to docenten:", err);
    }
}

function migrateAssignments(oldId, newId) {
    if (!oldId || !newId || oldId === newId) return;

    let count = 0;
    // Migrate leseenheden
    state.toewijzingen.forEach(t => {
        if (t.docentId === oldId) {
            t.docentId = newId;
            count++;
        }
    });

    // Migrate taak toewijzingen
    // Check if docentTaken array exists
    if (state.docentTaken && Array.isArray(state.docentTaken)) {
        const dt = state.docentTaken.find(d => d.docentId === oldId);
        if (dt) {
            dt.docentId = newId;
            count++;
        }
    }

    if (count > 0) console.log(`Migrated ${count} assignments and data from ${oldId} to ${newId}`);
}

// ============================================
// SAVE STATES (Firestore)
// ============================================

// Load save states from Firestore
async function loadSaveStatesFromFirestore() {
    if (!state.teamId || state.teamId === 'default-team') {
        return getSavedStates(); // Fall back to localStorage
    }

    try {
        const { collection, getDocs, query, where } = window.firebaseFunctions;
        const db = window.firebaseDb;

        const q = query(
            collection(db, 'saveStates'),
            where('teamId', '==', state.teamId)
        );

        const snapshot = await getDocs(q);
        const saveStates = [];

        snapshot.forEach(doc => {
            saveStates.push({
                id: doc.id,
                ...doc.data()
            });
        });

        // Sort by timestamp, most recent first
        saveStates.sort((a, b) => {
            const dateA = new Date(a.timestamp || a.datum || 0);
            const dateB = new Date(b.timestamp || b.datum || 0);
            return dateB - dateA;
        });

        console.log('Loaded', saveStates.length, 'save states from Firestore');
        return saveStates;

    } catch (error) {
        console.error('Error loading save states:', error);
        return [];
    }
}

// Create a new save state in Firestore
async function createSaveStateFirestore(naam) {
    if (!state.teamId || state.teamId === 'default-team' || !currentAuthUser) {
        // Fall back to localStorage
        saveNamedState(naam);
        return;
    }

    try {
        const { collection, doc, setDoc } = window.firebaseFunctions;
        const db = window.firebaseDb;

        const saveStateId = 'save_' + Date.now();
        const timestamp = new Date().toISOString();

        const saveStateData = {
            naam: naam,
            teamId: state.teamId,
            timestamp: timestamp,
            createdBy: currentAuthUser.uid,
            createdByName: currentUserProfile?.afkorting || currentUserProfile?.naam || currentAuthUser.email,
            data: {
                leerjaren: state.leerjaren,
                vakken: state.vakken,
                docenten: state.docenten,
                toewijzingen: state.toewijzingen,
                basisweken: state.basisweken,
                wekenPerPeriode: state.wekenPerPeriode,
                taken: state.taken,
                docentTaken: state.docentTaken
            }
        };

        await setDoc(doc(db, 'saveStates', saveStateId), saveStateData);
        console.log('Save state created:', naam);

        // Refresh save states list
        await renderSavedStatesFirestore();

    } catch (error) {
        console.error('Error creating save state:', error);
        alert('Fout bij opslaan: ' + error.message);
    }
}

// Load a save state from Firestore
async function loadSaveStateFirestore(saveStateId) {
    try {
        const { doc, getDoc } = window.firebaseFunctions;
        const db = window.firebaseDb;

        const saveDoc = await getDoc(doc(db, 'saveStates', saveStateId));

        if (saveDoc.exists()) {
            const saveState = saveDoc.data();
            const data = saveState.data;

            // Load data into state
            state.leerjaren = data.leerjaren || [];
            state.vakken = data.vakken || [];
            state.docenten = data.docenten || [];
            state.toewijzingen = data.toewijzingen || [];
            state.basisweken = data.basisweken || { 1: 8, 2: 8, 3: 8, 4: 8 };
            state.wekenPerPeriode = data.wekenPerPeriode || { 1: 10, 2: 10, 3: 10, 4: 10 };
            state.taken = data.taken || [];
            state.docentTaken = data.docentTaken || [];

            // Save to current team data
            await saveTeamDataToFirestore();

            // Re-render
            renderAll();

            alert(`State "${saveState.naam}" is geladen!`);
        }
    } catch (error) {
        console.error('Error loading save state:', error);
        alert('Fout bij laden: ' + error.message);
    }
}

// Delete a save state from Firestore
async function deleteSaveStateFirestore(saveStateId) {
    if (!confirm('Weet je zeker dat je deze state wilt verwijderen?')) {
        return;
    }

    try {
        const { doc, deleteDoc } = window.firebaseFunctions;
        const db = window.firebaseDb;

        await deleteDoc(doc(db, 'saveStates', saveStateId));
        console.log('Save state deleted:', saveStateId);

        // Refresh list
        await renderSavedStatesFirestore();

    } catch (error) {
        console.error('Error deleting save state:', error);
        alert('Fout bij verwijderen: ' + error.message);
    }
}

// Render save states from Firestore
async function renderSavedStatesFirestore() {
    const container = document.getElementById('saved-states-list');
    if (!container) return;

    // Check if we should use Firestore
    if (!state.teamId || state.teamId === 'default-team' || !currentAuthUser) {
        renderSavedStates(); // Use localStorage version
        return;
    }

    container.innerHTML = '<p class="loading-text">Laden...</p>';

    try {
        const saveStates = await loadSaveStatesFromFirestore();

        if (saveStates.length === 0) {
            container.innerHTML = '<p class="empty-state">Nog geen opgeslagen states</p>';
            return;
        }

        container.innerHTML = saveStates.map(state => {
            const timestamp = new Date(state.timestamp || state.datum);
            const dateStr = timestamp.toLocaleDateString('nl-NL', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
            const createdBy = state.createdByName || 'Onbekend';

            return `
                <div class="saved-state-item">
                    <div class="saved-state-info">
                        <span class="saved-state-name">${escapeHtml(state.naam)}</span>
                        <span class="saved-state-meta">${dateStr} door ${escapeHtml(createdBy)}</span>
                    </div>
                    <div class="saved-state-actions">
                        <button class="btn btn-sm btn-ghost" onclick="loadSaveStateFirestore('${state.id}')" title="Laden">📂</button>
                        <button class="btn btn-sm btn-ghost btn-danger" onclick="deleteSaveStateFirestore('${state.id}')" title="Verwijderen">🗑️</button>
                    </div>
                </div>
            `;
        }).join('');

    } catch (error) {
        console.error('Error rendering save states:', error);
        container.innerHTML = '<p class="empty-state">Fout bij laden van states</p>';
    }
}

// Override save function to use Firestore when available
function smartSave() {
    if (state.teamId && state.teamId !== 'default-team' && currentAuthUser) {
        saveTeamDataToFirestore();
    } else {
        saveToLocalStorage();
    }
}

// ============================================
// USER MANAGEMENT
// ============================================

// Load teams for dropdown
async function loadTeamsDropdown() {
    const select = document.getElementById('new-user-team');
    if (!select) return;

    try {
        const { collection, getDocs } = window.firebaseFunctions;
        const db = window.firebaseDb;

        const snapshot = await getDocs(collection(db, 'teams'));

        select.innerHTML = '<option value="">-- Selecteer team --</option>';

        snapshot.forEach(doc => {
            const team = doc.data();
            const option = document.createElement('option');
            option.value = doc.id;
            option.textContent = team.naam || doc.id;
            select.appendChild(option);
        });

    } catch (error) {
        console.error('Error loading teams:', error);
    }
}

// ============================================
//  SCHOOLJAREN MANAGEMENT
// ============================================

// Load schooljaren list
async function loadSchooljaren() {
    const container = document.getElementById('schooljaren-list');
    if (!container) return;

    try {
        const { collection, getDocs } = window.firebaseFunctions;
        const db = window.firebaseDb;

        const snapshot = await getDocs(collection(db, 'schooljaren'));

        if (snapshot.empty) {
            container.innerHTML = '<p class="empty-state small">Nog geen schooljaren</p>';
            return;
        }

        const schooljaren = [];
        snapshot.forEach(doc => {
            schooljaren.push({ id: doc.id, ...doc.data() });
        });

        // Sort by naam (year)
        schooljaren.sort((a, b) => (a.naam || a.id).localeCompare(b.naam || b.id));

        container.innerHTML = schooljaren.map(sj => {
            const weken = sj.basisweken || {};
            const basisInfo = `B:${weken[1] || 8}/${weken[2] || 8}/${weken[3] || 8}/${weken[4] || 8}`;
            return `
                <div class="schooljaar-row">
                    <span class="schooljaar-naam">'${escapeHtml(sj.naam || sj.id)}</span>
                    <span class="schooljaar-weken">${basisInfo}</span>
                    <span class="team-actions">
                        <button class="btn-icon-small" onclick="editSchooljaar('${sj.id}')" title="Bewerken">✏️</button>
                        <button class="btn-icon-small btn-danger-icon" onclick="deleteSchooljaar('${sj.id}')" title="Verwijderen">🗑️</button>
                    </span>
                </div>
            `;
        }).join('');

        // Also update dropdowns
        await loadSchooljaarDropdowns();

    } catch (error) {
        console.error('Error loading schooljaren:', error);
        container.innerHTML = '<p class="empty-state small">Fout bij laden</p>';
    }
}

// Load schooljaar dropdowns
async function loadSchooljaarDropdowns() {
    try {
        const { collection, getDocs } = window.firebaseFunctions;
        const db = window.firebaseDb;

        const snapshot = await getDocs(collection(db, 'schooljaren'));
        const schooljaren = [];
        snapshot.forEach(doc => {
            schooljaren.push({ id: doc.id, ...doc.data() });
        });
        schooljaren.sort((a, b) => (b.naam || b.id).localeCompare(a.naam || a.id)); // Newest first

        // Team creation dropdown
        const teamDropdown = document.getElementById('new-team-schooljaar');
        if (teamDropdown) {
            teamDropdown.innerHTML = '<option value="">Schooljaar</option>' +
                schooljaren.map(sj => `<option value="${sj.id}">'${escapeHtml(sj.naam || sj.id)}</option>`).join('');
        }
    } catch (error) {
        console.error('Error loading schooljaar dropdowns:', error);
    }
}

// Create new schooljaar
async function createSchooljaar() {
    const naamInput = document.getElementById('new-schooljaar-naam');
    const naam = naamInput?.value.trim();

    if (!naam) {
        alert('Vul een schooljaar in (bijv. 26-27)');
        return;
    }

    // Read from inline input fields
    const basis1 = document.getElementById('sj-basis-1')?.value || '8';
    const basis2 = document.getElementById('sj-basis-2')?.value || '8';
    const basis3 = document.getElementById('sj-basis-3')?.value || '8';
    const basis4 = document.getElementById('sj-basis-4')?.value || '8';

    const periode1 = document.getElementById('sj-periode-1')?.value || '10';
    const periode2 = document.getElementById('sj-periode-2')?.value || '10';
    const periode3 = document.getElementById('sj-periode-3')?.value || '10';
    const periode4 = document.getElementById('sj-periode-4')?.value || '10';

    try {
        const { doc, setDoc, getDoc } = window.firebaseFunctions;
        const db = window.firebaseDb;

        // Check if already exists
        const existingDoc = await getDoc(doc(db, 'schooljaren', naam));
        if (existingDoc.exists()) {
            alert(`Schooljaar "${naam}" bestaat al!`);
            return;
        }

        await setDoc(doc(db, 'schooljaren', naam), {
            naam: naam,
            basisweken: {
                1: parseInt(basis1) || 8,
                2: parseInt(basis2) || 8,
                3: parseInt(basis3) || 8,
                4: parseInt(basis4) || 8
            },
            wekenPerPeriode: {
                1: parseInt(periode1) || 10,
                2: parseInt(periode2) || 10,
                3: parseInt(periode3) || 10,
                4: parseInt(periode4) || 10
            },
            createdAt: new Date().toISOString()
        });

        // Clear and reset form
        naamInput.value = '';
        await loadSchooljaren();
        alert(`Schooljaar "${naam}" is aangemaakt!`);

    } catch (error) {
        console.error('Error creating schooljaar:', error);
        alert('Fout bij aanmaken: ' + error.message);
    }
}

// Edit schooljaar - open modal
async function editSchooljaar(schooljaarId) {
    try {
        const { doc, getDoc } = window.firebaseFunctions;
        const db = window.firebaseDb;

        const sjDoc = await getDoc(doc(db, 'schooljaren', schooljaarId));
        if (!sjDoc.exists()) {
            alert('Schooljaar niet gevonden');
            return;
        }

        const sj = sjDoc.data();
        const basisweken = sj.basisweken || { 1: 8, 2: 8, 3: 8, 4: 8 };
        const wekenPerPeriode = sj.wekenPerPeriode || { 1: 10, 2: 10, 3: 10, 4: 10 };

        // Populate modal
        document.getElementById('edit-schooljaar-id').value = schooljaarId;
        document.getElementById('edit-schooljaar-naam-display').textContent = `'${sj.naam || schooljaarId}`;
        document.getElementById('edit-sj-basis-1').value = basisweken[1];
        document.getElementById('edit-sj-basis-2').value = basisweken[2];
        document.getElementById('edit-sj-basis-3').value = basisweken[3];
        document.getElementById('edit-sj-basis-4').value = basisweken[4];
        document.getElementById('edit-sj-periode-1').value = wekenPerPeriode[1];
        document.getElementById('edit-sj-periode-2').value = wekenPerPeriode[2];
        document.getElementById('edit-sj-periode-3').value = wekenPerPeriode[3];
        document.getElementById('edit-sj-periode-4').value = wekenPerPeriode[4];

        // Show modal
        document.getElementById('edit-schooljaar-modal').style.display = 'flex';

    } catch (error) {
        console.error('Error loading schooljaar:', error);
        alert('Fout bij laden: ' + error.message);
    }
}

function closeEditSchooljaarModal() {
    document.getElementById('edit-schooljaar-modal').style.display = 'none';
}

async function saveEditSchooljaar() {
    try {
        const { doc, setDoc } = window.firebaseFunctions;
        const db = window.firebaseDb;

        const schooljaarId = document.getElementById('edit-schooljaar-id').value;

        await setDoc(doc(db, 'schooljaren', schooljaarId), {
            basisweken: {
                1: parseInt(document.getElementById('edit-sj-basis-1').value) || 8,
                2: parseInt(document.getElementById('edit-sj-basis-2').value) || 8,
                3: parseInt(document.getElementById('edit-sj-basis-3').value) || 8,
                4: parseInt(document.getElementById('edit-sj-basis-4').value) || 8
            },
            wekenPerPeriode: {
                1: parseInt(document.getElementById('edit-sj-periode-1').value) || 10,
                2: parseInt(document.getElementById('edit-sj-periode-2').value) || 10,
                3: parseInt(document.getElementById('edit-sj-periode-3').value) || 10,
                4: parseInt(document.getElementById('edit-sj-periode-4').value) || 10
            }
        }, { merge: true });

        closeEditSchooljaarModal();
        await loadSchooljaren();

    } catch (error) {
        console.error('Error saving schooljaar:', error);
        alert('Fout bij opslaan: ' + error.message);
    }
}

// Delete schooljaar
async function deleteSchooljaar(schooljaarId) {
    try {
        const { collection, getDocs, doc, deleteDoc, query, where } = window.firebaseFunctions;
        const db = window.firebaseDb;

        // Check if any teams use this schooljaar
        const teamsSnapshot = await getDocs(collection(db, 'teams'));
        let linkedTeams = 0;
        teamsSnapshot.forEach(teamDoc => {
            if (teamDoc.data().schooljaarId === schooljaarId) {
                linkedTeams++;
            }
        });

        if (linkedTeams > 0) {
            alert(`Kan schooljaar niet verwijderen: er zijn nog ${linkedTeams} team(s) gekoppeld.`);
            return;
        }

        if (!confirm(`Weet je zeker dat je schooljaar "${schooljaarId}" wilt verwijderen?`)) {
            return;
        }

        await deleteDoc(doc(db, 'schooljaren', schooljaarId));
        await loadSchooljaren();
        alert('Schooljaar is verwijderd.');

    } catch (error) {
        console.error('Error deleting schooljaar:', error);
        alert('Fout bij verwijderen: ' + error.message);
    }
}


async function loadTeamsList() {
    const container = document.getElementById('teams-list');
    if (!container) return;

    try {
        const { collection, getDocs, query, where } = window.firebaseFunctions;
        const db = window.firebaseDb;

        // Load teams and schooljaren
        const [teamsSnapshot, schooljarenSnapshot, usersSnapshot] = await Promise.all([
            getDocs(collection(db, 'teams')),
            getDocs(collection(db, 'schooljaren')),
            getDocs(collection(db, 'users'))
        ]);

        if (teamsSnapshot.empty) {
            container.innerHTML = '<p class="empty-state small">Nog geen teams</p>';
            return;
        }

        // Build schooljaren lookup
        const schooljarenMap = {};
        schooljarenSnapshot.forEach(doc => {
            schooljarenMap[doc.id] = doc.data();
        });

        // Build teams array
        const teams = [];
        teamsSnapshot.forEach(doc => {
            teams.push({ id: doc.id, ...doc.data() });
        });

        // Get user counts per team
        const userCountByTeam = {};
        usersSnapshot.forEach(doc => {
            const teamId = doc.data().teamId;
            if (teamId) {
                userCountByTeam[teamId] = (userCountByTeam[teamId] || 0) + 1;
            }
        });

        // Sort by schooljaar (descending), then by team name
        teams.sort((a, b) => {
            const sjA = a.schooljaarId || a.schooljaar || '';
            const sjB = b.schooljaarId || b.schooljaar || '';
            if (sjA !== sjB) {
                return sjB.localeCompare(sjA); // Descending (newest first)
            }
            return (a.naam || a.id).localeCompare(b.naam || b.id);
        });

        container.innerHTML = teams.map(team => {
            const userCount = userCountByTeam[team.id] || 0;
            const schooljaarId = team.schooljaarId || team.schooljaar || '';
            const schooljaarDisplay = schooljaarId ? `'${schooljaarId}` : '';
            return `
                <div class="team-row">
                    <span class="team-name">${escapeHtml(team.naam || team.id)}</span>
                    <span class="team-schooljaar">${schooljaarDisplay}</span>
                    <span class="team-users">${userCount} 👤</span>
                    <span class="team-actions">
                        <button class="btn-icon-small" onclick="editTeamSettings('${team.id}')" title="Schooljaar wijzigen">⚙️</button>
                        <button class="btn-icon-small" onclick="duplicateTeam('${team.id}')" title="Dupliceren">📋</button>
                        <button class="btn-icon-small btn-danger-icon" onclick="deleteTeam('${team.id}')" title="Verwijderen">🗑️</button>
                    </span>
                </div>
            `;
        }).join('');

    } catch (error) {
        console.error('Error loading teams list:', error);
        container.innerHTML = '<p class="empty-state small">Fout bij laden</p>';
    }
}

// Delete team (only if no users assigned)
async function deleteTeam(teamId) {
    try {
        const { collection, getDocs, doc, deleteDoc, query, where } = window.firebaseFunctions;
        const db = window.firebaseDb;

        // Check if team has users
        const usersSnapshot = await getDocs(collection(db, 'users'));
        let usersInTeam = 0;
        usersSnapshot.forEach(userDoc => {
            if (userDoc.data().teamId === teamId) {
                usersInTeam++;
            }
        });

        if (usersInTeam > 0) {
            alert(`Kan team niet verwijderen: er zijn nog ${usersInTeam} gebruiker(s) gekoppeld aan dit team.\n\nVerplaats of verwijder eerst alle gebruikers van dit team.`);
            return;
        }

        // Double confirmation for empty team
        if (!confirm(`Weet je zeker dat je dit team wilt verwijderen?\n\nAlle teamdata (vakken, leerjaren, toewijzingen, etc.) wordt permanent verwijderd!`)) {
            return;
        }

        if (!confirm('⚠️ LAATSTE WAARSCHUWING ⚠️\n\nDit kan niet ongedaan worden gemaakt!\n\nTyp "OK" om door te gaan.')) {
            return;
        }

        // Delete team document
        await deleteDoc(doc(db, 'teams', teamId));

        console.log('Team deleted:', teamId);
        alert('Team is verwijderd.');

        // Reload lists
        await loadTeamsList();
        await loadTeamsDropdown();

    } catch (error) {
        console.error('Error deleting team:', error);
        alert('Fout bij verwijderen: ' + error.message);
    }
}

// Edit team settings - open modal
async function editTeamSettings(teamId) {
    try {
        const { doc, getDoc, collection, getDocs } = window.firebaseFunctions;
        const db = window.firebaseDb;

        const teamDoc = await getDoc(doc(db, 'teams', teamId));
        if (!teamDoc.exists()) {
            alert('Team niet gevonden');
            return;
        }

        const team = teamDoc.data();

        // Get available schooljaren
        const sjSnapshot = await getDocs(collection(db, 'schooljaren'));
        const schooljaren = [];
        sjSnapshot.forEach(d => schooljaren.push({ id: d.id, ...d.data() }));
        schooljaren.sort((a, b) => (b.naam || b.id).localeCompare(a.naam || a.id));

        // Populate modal
        document.getElementById('edit-team-id').value = teamId;
        document.getElementById('edit-team-naam-display').textContent = team.naam || teamId;

        // Populate schooljaar dropdown
        const dropdown = document.getElementById('edit-team-schooljaar');
        dropdown.innerHTML = '<option value="">Selecteer schooljaar</option>' +
            schooljaren.map(sj => `<option value="${sj.id}">'${sj.naam || sj.id}</option>`).join('');

        // Select current schooljaar
        const currentSj = team.schooljaarId || team.schooljaar || '';
        if (currentSj) {
            dropdown.value = currentSj;
        }

        // Show modal
        document.getElementById('edit-team-modal').style.display = 'flex';

    } catch (error) {
        console.error('Error loading team:', error);
        alert('Fout bij laden: ' + error.message);
    }
}

function closeEditTeamModal() {
    document.getElementById('edit-team-modal').style.display = 'none';
}

async function saveEditTeam() {
    try {
        const { doc, setDoc } = window.firebaseFunctions;
        const db = window.firebaseDb;

        const teamId = document.getElementById('edit-team-id').value;
        const schooljaarId = document.getElementById('edit-team-schooljaar').value;

        if (!schooljaarId) {
            alert('Selecteer een schooljaar');
            return;
        }

        await setDoc(doc(db, 'teams', teamId), {
            schooljaarId: schooljaarId
        }, { merge: true });

        closeEditTeamModal();
        await loadTeamsList();

        // Reload team data if this is the current team
        if (state.teamId === teamId) {
            await loadTeamDataFromFirestore();
            renderAll();
        }

    } catch (error) {
        console.error('Error saving team:', error);
        alert('Fout bij opslaan: ' + error.message);
    }
}

// Duplicate team to new school year
async function duplicateTeam(teamId) {
    try {
        const { doc, getDoc, setDoc } = window.firebaseFunctions;
        const db = window.firebaseDb;

        const teamDoc = await getDoc(doc(db, 'teams', teamId));
        if (!teamDoc.exists()) {
            alert('Team niet gevonden');
            return;
        }

        const team = teamDoc.data();
        const newSchooljaar = prompt(`Nieuw schooljaar voor kopie van "${team.naam}":`, '');
        if (!newSchooljaar) return;

        const newTeamName = prompt('Naam voor het nieuwe team:', `${team.naam} ${newSchooljaar}`);
        if (!newTeamName) return;

        // Generate new team ID
        const newTeamId = newTeamName
            .toLowerCase()
            .replace(/\s+/g, '-')
            .replace(/[^a-z0-9-]/g, '')
            .substring(0, 20);

        // Check if new team already exists
        const existingTeam = await getDoc(doc(db, 'teams', newTeamId));
        if (existingTeam.exists()) {
            alert(`Team "${newTeamName}" bestaat al!`);
            return;
        }

        // Copy team data
        const newTeamData = {
            ...team,
            naam: newTeamName,
            schooljaar: newSchooljaar,
            createdAt: new Date().toISOString(),
            duplicatedFrom: teamId
        };

        // Optionally reset toewijzingen
        if (confirm('Wil je de toewijzingen (lessen/taken) resetten voor het nieuwe team?\n\nJa = Schone start (alleen structuur behouden)\nNee = Alles kopiëren inclusief toewijzingen')) {
            newTeamData.toewijzingen = [];
            newTeamData.docentTaken = [];
        }

        await setDoc(doc(db, 'teams', newTeamId), newTeamData);

        alert(`Team "${newTeamName}" is aangemaakt als kopie van "${team.naam}"!`);
        await loadTeamsList();
        await loadTeamsDropdown();

    } catch (error) {
        console.error('Error duplicating team:', error);
        alert('Fout bij dupliceren: ' + error.message);
    }
}


// Create new team
async function createNewTeam() {
    const teamName = document.getElementById('new-team-name').value.trim();
    const schooljaarId = document.getElementById('new-team-schooljaar')?.value || '';

    if (!teamName) {
        alert('Vul een teamnaam in');
        return;
    }

    if (!schooljaarId) {
        alert('Selecteer een schooljaar');
        return;
    }

    // Auto-generate clean ID from name (lowercase, replace spaces with dashes, remove special chars)
    const teamId = teamName
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9-]/g, '')
        .substring(0, 20);

    try {
        const { doc, setDoc, getDoc } = window.firebaseFunctions;
        const db = window.firebaseDb;

        // Check if team already exists
        const existingTeam = await getDoc(doc(db, 'teams', teamId));
        if (existingTeam.exists()) {
            alert(`Team "${teamName}" bestaat al!`);
            return;
        }

        // Create team with schooljaarId reference (weeks come from schooljaar)
        await setDoc(doc(db, 'teams', teamId), {
            naam: teamName,
            schooljaarId: schooljaarId,
            createdAt: new Date().toISOString()
        });

        console.log('Team created:', teamId, teamName, 'schooljaar:', schooljaarId);

        // Clear form
        document.getElementById('new-team-name').value = '';
        const dropdown = document.getElementById('new-team-schooljaar');
        if (dropdown) dropdown.selectedIndex = 0;

        // Reload lists
        await loadTeamsList();
        await loadTeamsDropdown();

        alert(`Team "${teamName}" is aangemaakt!`);

    } catch (error) {
        console.error('Error creating team:', error);
        alert('Fout bij aanmaken: ' + error.message);
    }
}

// Load users list
async function loadUsersList() {
    const container = document.getElementById('users-list');
    if (!container) return;

    try {
        const { collection, getDocs } = window.firebaseFunctions;
        const db = window.firebaseDb;

        const snapshot = await getDocs(collection(db, 'users'));

        if (snapshot.empty) {
            container.innerHTML = '<p class="empty-state">Nog geen gebruikers</p>';
            return;
        }

        const users = [];
        snapshot.forEach(doc => {
            users.push({ id: doc.id, ...doc.data() });
        });

        // Sort by 2nd letter of afkorting (then 3rd, etc.)
        users.sort((a, b) => {
            const afkA = (a.afkorting || a.naam || '').toLowerCase();
            const afkB = (b.afkorting || b.naam || '').toLowerCase();
            // Compare starting from 2nd character (index 1)
            const sortKeyA = afkA.substring(1) + afkA.charAt(0);
            const sortKeyB = afkB.substring(1) + afkB.charAt(0);
            return sortKeyA.localeCompare(sortKeyB);
        });

        // Build header row
        const headerRow = `
            <div class="user-row user-row-header">
                <span>Afkorting</span>
                <span>Docenttype</span>
                <span>Team</span>
                <span>Rol</span>
                <span>FTE</span>
                <span>Inh.</span>
                <span></span>
            </div>
        `;

        container.innerHTML = headerRow + users.map(user => {
            const rolLabels = {
                'admin': 'Admin',
                'teamleider': 'Teamleider',
                'onderwijsplanner': 'Onderwijsplanner',
                'teamlid': 'Teamlid'
            };
            const rolLabel = rolLabels[user.rol] || 'Teamlid';
            const teamLabel = user.teamId || '-';
            const fteDisplay = user.aanstellingBruto || user.FTE || '-';
            const inhDisplay = user.inhouding > 0 ? `-${user.inhouding}` : '-';

            return `
                <div class="user-row">
                    <span class="afkorting">${escapeHtml(user.afkorting || '')}</span>
                    <span class="docenttype">${escapeHtml(user.docenttype || '')}</span>
                    <span class="team">${escapeHtml(teamLabel)}</span>
                    <span class="role">${rolLabel}</span>
                    <span class="fte">${fteDisplay}</span>
                    <span class="inhouding">${inhDisplay}</span>
                    <span class="actions">
                        <button onclick="editUser('${user.id}')" title="Bewerken">✏️</button>
                        <button onclick="deleteUser('${user.id}')" title="Verwijderen">🗑️</button>
                    </span>
                </div>
            `;
        }).join('');

        // Sync users to docenten state to ensure app is up to date immediately
        await syncUsersToDocentenState();

    } catch (error) {
        console.error('Error loading users:', error);
        container.innerHTML = '<p class="empty-state">Fout bij laden</p>';
    }
}

// Create new user
async function createNewUser() {
    const afkorting = document.getElementById('new-user-afkorting').value.trim().toLowerCase();
    const password = document.getElementById('new-user-password').value;
    const rol = document.getElementById('new-user-role').value;
    const teamId = document.getElementById('new-user-team').value;
    const aanstellingBruto = parseFloat(document.getElementById('new-user-fte').value) || 1.0;
    const inhouding = parseFloat(document.getElementById('new-user-inhouding').value) || 0.0;
    const docenttype = document.getElementById('new-user-docenttype').value.trim();

    // Generate internal email from afkorting
    const email = `${afkorting}@werkverdelings.app`;

    // Validation
    if (!afkorting || !password || !teamId) {
        alert('Vul alle verplichte velden in (afkorting, wachtwoord, team)');
        return;
    }

    if (password.length < 6) {
        alert('Wachtwoord moet minimaal 6 tekens zijn');
        return;
    }

    try {
        const { createUserWithEmailAndPassword } = window.firebaseFunctions;
        const { doc, setDoc } = window.firebaseFunctions;
        const auth = window.firebaseAuth;
        const db = window.firebaseDb;

        // Note: Creating a user will sign them in automatically
        // We need to store current user first
        const currentUser = auth.currentUser;

        // Create Firebase Auth account
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const newUserId = userCredential.user.uid;

        // Create Firestore user profile
        await setDoc(doc(db, 'users', newUserId), {
            email: email,
            naam: afkorting,
            afkorting: afkorting,
            rol: rol,
            teamId: teamId,
            aanstellingBruto: aanstellingBruto,
            inhouding: inhouding,
            FTE: aanstellingBruto - inhouding, // Store netto FTE for backward compatibility/badge display
            docenttype: docenttype || '',
            createdAt: new Date().toISOString(),
            createdBy: currentUser?.uid || 'unknown'
        });

        console.log('User created:', afkorting);

        // Clear form
        document.getElementById('new-user-afkorting').value = '';
        document.getElementById('new-user-password').value = '';
        document.getElementById('new-user-fte').value = '';
        document.getElementById('new-user-inhouding').value = '';
        document.getElementById('new-user-docenttype').value = '';

        // Reload users list
        await loadUsersList();

        alert(`Gebruiker "${afkorting}" is aangemaakt!\n\nLet op: je bent nu uitgelogd. Log opnieuw in met je eigen account.`);

        // Sign out the new user (we're now logged in as them)
        const { signOut } = window.firebaseFunctions;
        await signOut(auth);

    } catch (error) {
        console.error('Error creating user:', error);

        let message = 'Er ging iets mis bij het aanmaken.';
        switch (error.code) {
            case 'auth/email-already-in-use':
                message = 'Dit e-mailadres is al in gebruik.';
                break;
            case 'auth/invalid-email':
                message = 'Ongeldig e-mailadres.';
                break;
            case 'auth/weak-password':
                message = 'Wachtwoord is te zwak (min. 6 tekens).';
                break;
        }

        alert(message);
    }
}

// User Edit Functions
async function editUser(userId) {
    if (!userId) return;

    try {
        const { doc, getDoc } = window.firebaseFunctions;
        const db = window.firebaseDb;

        const userDoc = await getDoc(doc(db, 'users', userId));
        if (!userDoc.exists()) {
            alert('Gebruiker niet gevonden');
            return;
        }

        const userData = userDoc.data();

        document.getElementById('edit-user-id').value = userId;
        document.getElementById('edit-user-afkorting').value = userData.afkorting || '';
        document.getElementById('edit-user-role').value = userData.rol;
        document.getElementById('edit-user-fte').value = userData.aanstellingBruto || userData.FTE || 1.0;
        document.getElementById('edit-user-inhouding').value = userData.inhouding || 0.0;
        document.getElementById('edit-user-docenttype').value = userData.docenttype || '';

        // Populate teams dropdown in edit modal by copying options from the creation form
        const editTeamSelect = document.getElementById('edit-user-team');
        const newTeamSelect = document.getElementById('new-user-team');

        if (newTeamSelect && editTeamSelect) {
            editTeamSelect.innerHTML = newTeamSelect.innerHTML;
            editTeamSelect.value = userData.teamId;
        }

        document.getElementById('edit-user-modal').style.display = 'flex';

    } catch (err) {
        console.error("Error editing user", err);
        alert("Fout bij ophalen gebruiker");
    }
}

function closeEditUserModal() {
    document.getElementById('edit-user-modal').style.display = 'none';
}

async function saveEditUser() {
    const userId = document.getElementById('edit-user-id').value;
    const teamId = document.getElementById('edit-user-team').value;
    const rol = document.getElementById('edit-user-role').value;
    const aanstellingBruto = parseFloat(document.getElementById('edit-user-fte').value) || 1.0;
    const inhouding = parseFloat(document.getElementById('edit-user-inhouding').value) || 0.0;
    const docenttype = document.getElementById('edit-user-docenttype').value.trim();

    if (!userId || !teamId || !rol) {
        alert('Vul alle verplichte velden in');
        return;
    }

    try {
        const { doc, updateDoc } = window.firebaseFunctions;
        const db = window.firebaseDb;
        const auth = window.firebaseAuth;

        const updates = {
            teamId: teamId,
            rol: rol,
            aanstellingBruto: aanstellingBruto,
            inhouding: inhouding,
            FTE: aanstellingBruto - inhouding, // Netto FTE for compatibility
            docenttype: docenttype,
            lastModified: new Date().toISOString()
        };

        await updateDoc(doc(db, 'users', userId), updates);

        closeEditUserModal();
        await loadUsersList();

        // Update user indicator if we edited ourselves
        if (auth.currentUser && userId === auth.currentUser.uid) {
            currentUserProfile = { ...currentUserProfile, ...updates };
            updateUserIndicator();
        }

    } catch (err) {
        console.error("Error saving user", err);
        alert("Fout bij opslaan: " + err.message);
    }
}

async function deleteUser(userId) {
    try {
        const { doc, deleteDoc, getDoc } = window.firebaseFunctions;
        const db = window.firebaseDb;

        // Get user info first
        const userDoc = await getDoc(doc(db, 'users', userId));
        if (!userDoc.exists()) {
            alert('Gebruiker niet gevonden');
            return;
        }
        const userData = userDoc.data();
        const userAfkorting = userData.afkorting || userData.naam || 'deze gebruiker';

        // Check if user has any assignments in the team data
        // Find docent by matching afkorting or ID
        const hasAssignments = state.toewijzingen?.some(t =>
            t.docentId === userId ||
            state.docenten.find(d => d.id === t.docentId && d.afkorting === userData.afkorting)
        );

        const hasTasks = state.docentTaken?.some(dt =>
            dt.docentId === userId ||
            state.docenten.find(d => d.id === dt.docentId && d.afkorting === userData.afkorting)
        );

        if (hasAssignments || hasTasks) {
            alert(`Kan "${userAfkorting}" niet verwijderen: deze gebruiker heeft nog toewijzingen (lessen of taken).\n\nVerwijder eerst alle toewijzingen van deze gebruiker.`);
            return;
        }

        // Double confirmation
        if (!confirm(`Weet je zeker dat je "${userAfkorting}" wilt verwijderen?\n\nDit verwijdert het profiel uit de database.`)) {
            return;
        }

        if (!confirm('⚠️ LAATSTE WAARSCHUWING ⚠️\n\nHet inlogaccount (Auth) moet apart in de Firebase Console worden verwijderd.\n\nDoorgaan met verwijderen van het profiel?')) {
            return;
        }

        // Delete user profile
        await deleteDoc(doc(db, 'users', userId));

        // Also remove from local docenten state if present
        const docentIndex = state.docenten.findIndex(d => d.id === userId || d.afkorting === userData.afkorting);
        if (docentIndex >= 0) {
            state.docenten.splice(docentIndex, 1);
            await saveTeamDataToFirestore();
        }

        console.log('User deleted:', userId);
        alert(`"${userAfkorting}" is verwijderd.`);

        await loadUsersList();

    } catch (err) {
        console.error("Error deleting user", err);
        alert("Fout bij verwijderen: " + err.message);
    }
}

// ============================================
// ADMIN - SUPER USER FUNCTIONS
// ============================================

// Check if current user is admin
function isUserAdmin() {
    return currentUserProfile?.rol === 'admin' || currentUserProfile?.isAdmin === true;
}

// Check if current user can edit data (not just view)
// Admin, teamleider, onderwijsplanner can always edit
// Teamlid can only edit when viewing their own data
function canUserEdit(selectedDocentId = null) {
    const role = state.currentUser.rol;

    if (isUserAdmin() || role === 'teamleider' || role === 'onderwijsplanner') {
        return true;
    }

    // Teamlid: check if viewing their own docent
    if (role === 'teamlid') {
        const myDocentId = getCurrentUserDocentId();

        // If explicit docent ID provided, use that
        if (selectedDocentId) {
            return selectedDocentId === myDocentId;
        }

        // Fallback: check all possible view states
        // For klassen/lessen view
        if (typeof klassenState !== 'undefined' && klassenState.geselecteerdeDocent) {
            return klassenState.geselecteerdeDocent === myDocentId;
        }
        // For taken view
        if (typeof takenViewState !== 'undefined' && takenViewState.geselecteerdeDocent) {
            return takenViewState.geselecteerdeDocent === myDocentId;
        }
        // For niveau-3/verdeling view
        if (state.geselecteerdeDocent) {
            return state.geselecteerdeDocent === myDocentId;
        }

        return false; // Default: if we can't determine, don't allow edit
    }

    return true; // Fallback for unknown roles
}

// Find the docent ID that matches the current user
function getCurrentUserDocentId() {
    if (!currentAuthUser) return null;

    // Direct match: docent.id === user's Auth UID (since sync uses Auth UID as docent ID)
    const matchingDocent = state.docenten.find(d => d.id === currentAuthUser.uid);

    if (matchingDocent) {
        return matchingDocent.id;
    }

    // Fallback: try matching by afkorting (for users created before sync)
    if (currentUserProfile?.afkorting) {
        const userAfkorting = currentUserProfile.afkorting.toLowerCase();
        const fallbackMatch = state.docenten.find(d =>
            d.afkorting?.toLowerCase() === userAfkorting
        );
        return fallbackMatch?.id || null;
    }

    return null;
}

// Check if user is viewing their own data
function isViewingOwnData() {
    const myDocentId = getCurrentUserDocentId();
    if (!myDocentId) return true; // Can't determine, allow editing

    const selectedDocentId = klassenState?.geselecteerdeDocent ||
        takenViewState?.geselecteerdeDocent ||
        state.geselecteerdeDocent;

    return !selectedDocentId || selectedDocentId === myDocentId;
}

// Setup team switcher for admins
async function setupTeamSwitcher() {
    const switcher = document.getElementById('team-switcher');
    const select = document.getElementById('active-team-select');

    if (!switcher || !select) return;

    // Only show for admins
    if (!isUserAdmin()) {
        switcher.style.display = 'none';
        return;
    }

    switcher.style.display = 'flex';

    try {
        const { collection, getDocs } = window.firebaseFunctions;
        const db = window.firebaseDb;

        const snapshot = await getDocs(collection(db, 'teams'));

        select.innerHTML = '<option value="">-- Alle teams --</option>';

        snapshot.forEach(doc => {
            const team = doc.data();
            const option = document.createElement('option');
            option.value = doc.id;
            option.textContent = team.naam || doc.id;
            if (doc.id === state.teamId) {
                option.selected = true;
            }
            select.appendChild(option);
        });

    } catch (error) {
        console.error('Error loading teams for switcher:', error);
    }
}

// Switch active team (for admins)
async function switchActiveTeam(teamId) {
    if (!isUserAdmin()) {
        alert('Je hebt geen toegang tot deze functie.');
        return;
    }

    console.log('Switching to team:', teamId || 'all teams');

    // Store in localStorage for persistence across refresh
    if (teamId) {
        localStorage.setItem('adminSelectedTeam', teamId);
    } else {
        localStorage.removeItem('adminSelectedTeam');
    }

    state.teamId = teamId || 'all-teams';

    // CRITICAL: Clear state FIRST before loading new team data
    // This prevents old data from being saved to the new team via syncUsersToDocentenState
    state.leerjaren = [];
    state.vakken = [];
    state.docenten = [];
    state.toewijzingen = [];
    state.taken = [];
    state.docentTaken = [];
    state.schooljaarId = '';
    state.basisweken = { 1: 8, 2: 8, 3: 8, 4: 8 };
    state.wekenPerPeriode = { 1: 10, 2: 10, 3: 10, 4: 10 };

    if (teamId) {
        // Load specific team data (this will populate state with the correct team's data)
        await loadTeamDataFromFirestore();
        subscribeToTeamData();
    }
    // For "all teams" view, state is already cleared above

    // Reset view states
    klassenState.geselecteerdeDocent = null;
    klassenState.geselecteerdLeerjaar = null;
    klassenState.geselecteerdPeriode = null;

    // Reload save states
    await renderSavedStatesFirestore();

    // Re-render everything
    renderAll();

    // Update UI indicators
    updateUserIndicator();

    console.log('Team switch complete, now viewing:', state.teamId);
}

// Load all save states for admins (across all teams)
async function loadAllSaveStatesForAdmin() {
    if (!isUserAdmin()) {
        return loadSaveStatesFromFirestore();
    }

    try {
        const { collection, getDocs } = window.firebaseFunctions;
        const db = window.firebaseDb;

        // Get all save states
        const snapshot = await getDocs(collection(db, 'saveStates'));
        const saveStates = [];

        snapshot.forEach(doc => {
            saveStates.push({
                id: doc.id,
                ...doc.data()
            });
        });

        // Sort by timestamp, most recent first
        saveStates.sort((a, b) => {
            const dateA = new Date(a.timestamp || a.datum || 0);
            const dateB = new Date(b.timestamp || b.datum || 0);
            return dateB - dateA;
        });

        return saveStates;

    } catch (error) {
        console.error('Error loading all save states:', error);
        return [];
    }
}

// ============================================
// STATE MANAGEMENT
// ============================================

const state = {
    leerjaren: [], // { naam, aantalKlassen, prefix, klassen[] }
    vakken: [],
    docenten: [],
    toewijzingen: [], // { blokjeId, docentId, periode }
    basisweken: { 1: 8, 2: 8, 3: 8, 4: 8 }, // aantal lesweken per periode
    basiswekenOpgeslagen: false, // track if basisweken have been saved
    wekenPerPeriode: { 1: 10, 2: 10, 3: 10, 4: 10 }, // totaal weken per periode voor taken
    wekenOpgeslagen: false, // track if weken have been saved
    taken: [], // { id, naam, urenPerPeriode: {1,2,3,4}, voorIedereen: boolean }
    docentTaken: [], // { docentId, taakId, periodes: {1,2,3,4} }
    geselecteerdeDocent: null,
    // User and team management
    currentUser: {
        id: null,
        naam: '',
        rol: null, // 'teamleider' of 'teamlid'
        teamId: 'default-team'
    },
    teamId: 'default-team' // All data belongs to this team
};

// Generate unique IDs
function generateId() {
    return 'id-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
}

// ============================================
// LOCAL STORAGE
// ============================================

function saveToLocalStorage() {
    localStorage.setItem('werkverdelingsapp-state', JSON.stringify(state));
    showSaveIndicator();

    // Also trigger Firebase save if we have a valid team and user
    // "Fire and forget" pattern to avoid making this function async and breaking callers
    if (state.teamId &&
        state.teamId !== 'default-team' &&
        window.firebaseAuth?.currentUser) {

        // Debounce slightly to avoid hammering Firestore on rapid edits
        if (window.saveTimeout) clearTimeout(window.saveTimeout);
        window.saveTimeout = setTimeout(() => {
            saveTeamDataToFirestore().catch(err => console.error('Auto-save failed:', err));
        }, 500);
    }
}

function loadFromLocalStorage() {
    const saved = localStorage.getItem('werkverdelingsapp-state');
    if (saved) {
        try {
            const parsed = JSON.parse(saved);
            state.leerjaren = parsed.leerjaren || [];
            state.vakken = parsed.vakken || [];
            state.docenten = parsed.docenten || [];
            state.toewijzingen = parsed.toewijzingen || [];
            state.basisweken = parsed.basisweken || { 1: 8, 2: 8, 3: 8, 4: 8 };
            state.basiswekenOpgeslagen = parsed.basiswekenOpgeslagen || false;
            state.wekenPerPeriode = parsed.wekenPerPeriode || { 1: 10, 2: 10, 3: 10, 4: 10 };
            state.wekenOpgeslagen = parsed.wekenOpgeslagen || false;
            state.taken = parsed.taken || [];
            state.docentTaken = parsed.docentTaken || [];
            state.currentUser = parsed.currentUser || { id: null, naam: '', rol: null, teamId: 'default-team' };
            state.teamId = parsed.teamId || 'default-team';
        } catch (e) {
            console.error('Error loading state:', e);
        }
    }
}

function showSaveIndicator() {
    // Auto-save indicator - no longer tied to a button
    console.log('Data opgeslagen');
}

// Update week info displays (read-only from team/schooljaar settings)
async function updateWeekInfoDisplays() {
    // Get schooljaarId from team
    const schooljaarId = state.schooljaarId || state.schooljaar || '';
    const basisweken = state.basisweken || { 1: 8, 2: 8, 3: 8, 4: 8 };
    const wekenPerPeriode = state.wekenPerPeriode || { 1: 10, 2: 10, 3: 10, 4: 10 };

    // Build admin hover text
    let adminHoverText = 'Beheerd door: ';
    try {
        const { collection, getDocs } = window.firebaseFunctions;
        const db = window.firebaseDb;
        const usersSnapshot = await getDocs(collection(db, 'users'));
        const admins = [];
        usersSnapshot.forEach(doc => {
            const userData = doc.data();
            if (userData.rol === 'admin') {
                admins.push(userData.afkorting || userData.naam || 'Admin');
            }
        });
        adminHoverText += admins.length > 0 ? admins.join(', ') : '(geen admin)';
    } catch (e) {
        adminHoverText += '(onbekend)';
    }

    // Lessenbeheer display
    const displaySchooljaar = document.getElementById('display-schooljaar');
    if (displaySchooljaar) {
        displaySchooljaar.textContent = schooljaarId ? `'${schooljaarId}` : '-';
    }
    const displayBasisweken = document.getElementById('display-basisweken');
    if (displayBasisweken) {
        displayBasisweken.textContent = `P1:${basisweken[1]}, P2:${basisweken[2]}, P3:${basisweken[3]}, P4:${basisweken[4]}`;
    }
    const weekInfoCard = document.getElementById('week-info-card');
    if (weekInfoCard) {
        weekInfoCard.title = adminHoverText;
    }

    // Takenbeheer display
    const takenDisplaySchooljaar = document.getElementById('taken-display-schooljaar');
    if (takenDisplaySchooljaar) {
        takenDisplaySchooljaar.textContent = schooljaarId ? `'${schooljaarId}` : '-';
    }
    const displayPeriodeweken = document.getElementById('display-periodeweken');
    if (displayPeriodeweken) {
        displayPeriodeweken.textContent = `P1:${wekenPerPeriode[1]}, P2:${wekenPerPeriode[2]}, P3:${wekenPerPeriode[3]}, P4:${wekenPerPeriode[4]}`;
    }
    const takenWeekInfoCard = document.getElementById('taken-week-info-card');
    if (takenWeekInfoCard) {
        takenWeekInfoCard.title = adminHoverText;
    }
}

// Render all UI components
function renderAll() {
    renderLeerjarenLijst();
    renderVakkenLijst();
    renderDocentenLijst();
    renderTakenLijst();
    renderTakenSelectie();
    updateDocentSelector();
    updateLeerjaarSelector();
    renderSavedStates();

    // Update week info displays (read-only from team settings)
    updateWeekInfoDisplays();

    // Re-render any active views
    if (typeof renderKlassenView === 'function') renderKlassenView();
    if (typeof renderVerdelingView === 'function') renderVerdelingView();
    if (typeof renderDashboard === 'function') renderDashboard();
}

// ============================================
// ADMIN PANEL - SAVE STATES
// ============================================

const SAVE_STATES_KEY = 'werkverdelingsapp-save-states';

function getSavedStates() {
    try {
        const saved = localStorage.getItem(SAVE_STATES_KEY);
        return saved ? JSON.parse(saved) : [];
    } catch (e) {
        return [];
    }
}

function saveSaveStates(states) {
    localStorage.setItem(SAVE_STATES_KEY, JSON.stringify(states));
}

function saveNamedState() {
    const nameInput = document.getElementById('save-state-name');
    const name = nameInput.value.trim();

    if (!name) {
        alert('Voer een naam in voor deze state');
        return;
    }

    const states = getSavedStates();
    const newState = {
        id: generateId(),
        name: name,
        date: new Date().toISOString(),
        data: JSON.parse(JSON.stringify(state)) // Deep copy
    };

    states.unshift(newState); // Add at beginning
    saveSaveStates(states);

    nameInput.value = '';
    renderSavedStates();
    alert(`State "${name}" opgeslagen!`);
}

// Smart save state - uses Firestore when logged in, localStorage otherwise
function smartSaveState() {
    const nameInput = document.getElementById('save-state-name');
    const name = nameInput.value.trim();

    if (!name) {
        alert('Voer een naam in voor deze state');
        return;
    }

    if (state.teamId && state.teamId !== 'default-team' && currentAuthUser) {
        // Use Firestore
        createSaveStateFirestore(name);
        nameInput.value = '';
    } else {
        // Fall back to localStorage
        saveNamedState();
    }
}

function loadNamedState(stateId) {
    const states = getSavedStates();
    const savedState = states.find(s => s.id === stateId);

    if (!savedState) {
        alert('State niet gevonden');
        return;
    }

    if (!confirm(`Weet je zeker dat je "${savedState.name}" wilt laden? De huidige data wordt overschreven.`)) {
        return;
    }

    // Load the saved state into current state
    const data = savedState.data;
    state.leerjaren = data.leerjaren || [];
    state.vakken = data.vakken || [];
    state.docenten = data.docenten || [];
    state.toewijzingen = data.toewijzingen || [];
    state.basisweken = data.basisweken || { 1: 8, 2: 8, 3: 8, 4: 8 };
    state.basiswekenOpgeslagen = data.basiswekenOpgeslagen || false;
    state.wekenPerPeriode = data.wekenPerPeriode || { 1: 10, 2: 10, 3: 10, 4: 10 };
    state.wekenOpgeslagen = data.wekenOpgeslagen || false;
    state.taken = data.taken || [];
    state.docentTaken = data.docentTaken || [];
    state.geselecteerdeDocent = null;

    saveToLocalStorage();
    renderAll();
    alert(`State "${savedState.name}" geladen!`);
}

function deleteNamedState(stateId) {
    const states = getSavedStates();
    const savedState = states.find(s => s.id === stateId);

    if (!savedState) return;

    if (!confirm(`Weet je zeker dat je "${savedState.name}" wilt verwijderen?`)) {
        return;
    }

    const newStates = states.filter(s => s.id !== stateId);
    saveSaveStates(newStates);
    renderSavedStates();
}

function renderSavedStates() {
    const container = document.getElementById('saved-states-list');
    if (!container) return;

    const states = getSavedStates();

    if (states.length === 0) {
        container.innerHTML = '<p class="empty-state">Geen opgeslagen states</p>';
        return;
    }

    container.innerHTML = states.map(s => {
        const date = new Date(s.date);
        const dateStr = date.toLocaleDateString('nl-NL', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });

        return `
            <div class="saved-state-item">
                <div class="saved-state-info">
                    <div class="saved-state-name">${escapeHtml(s.name)}</div>
                    <div class="saved-state-date">${dateStr}</div>
                </div>
                <div class="saved-state-actions">
                    <button class="btn-load" onclick="loadNamedState('${s.id}')">📂 Laden</button>
                    <button class="btn-delete" onclick="deleteNamedState('${s.id}')">🗑️</button>
                </div>
            </div>
        `;
    }).join('');
}

// ============================================
// ADMIN PANEL - IMPORT/EXPORT
// ============================================

function exportToFile() {
    const dataStr = JSON.stringify(state, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `werkverdeling-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function importFromFile(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function (e) {
        try {
            const data = JSON.parse(e.target.result);

            if (!confirm('Weet je zeker dat je deze data wilt importeren? De huidige data wordt overschreven.')) {
                return;
            }

            state.leerjaren = data.leerjaren || [];
            state.vakken = data.vakken || [];
            state.docenten = data.docenten || [];
            state.toewijzingen = data.toewijzingen || [];
            state.basisweken = data.basisweken || { 1: 8, 2: 8, 3: 8, 4: 8 };
            state.basiswekenOpgeslagen = data.basiswekenOpgeslagen || false;
            state.wekenPerPeriode = data.wekenPerPeriode || { 1: 10, 2: 10, 3: 10, 4: 10 };
            state.wekenOpgeslagen = data.wekenOpgeslagen || false;
            state.taken = data.taken || [];
            state.docentTaken = data.docentTaken || [];
            state.geselecteerdeDocent = null;

            saveToLocalStorage();
            renderAll();
            alert('Data succesvol geïmporteerd!');
        } catch (err) {
            alert('Fout bij importeren: ' + err.message);
        }
    };
    reader.readAsText(file);

    // Reset file input
    event.target.value = '';
}

function resetAllData() {
    if (!confirm('WAARSCHUWING: Dit verwijdert ALLE data (teamleden, lessen, taken, toewijzingen).\n\nDeze actie kan niet ongedaan worden gemaakt!\n\nWeet je het zeker?')) {
        return;
    }

    if (!confirm('Laatste kans: Weet je ECHT zeker dat je alle data wilt wissen?')) {
        return;
    }

    state.leerjaren = [];
    state.vakken = [];
    state.docenten = [];
    state.toewijzingen = [];
    state.basisweken = { 1: 8, 2: 8, 3: 8, 4: 8 };
    state.basiswekenOpgeslagen = false;
    state.wekenPerPeriode = { 1: 10, 2: 10, 3: 10, 4: 10 };
    state.wekenOpgeslagen = false;
    state.taken = [];
    state.docentTaken = [];
    state.geselecteerdeDocent = null;
    state.currentUser = { id: null, naam: '', rol: null, teamId: 'default-team' };

    saveToLocalStorage();
    renderAll();
    alert('Alle data is gewist. Je wordt nu gevraagd om opnieuw je rol te kiezen.');
    showRoleSelectionModal();
}

// ============================================
// ROLE MANAGEMENT
// ============================================

function showRoleSelectionModal() {
    document.getElementById('role-selection-modal').style.display = 'flex';
}

function hideRoleSelectionModal() {
    document.getElementById('role-selection-modal').style.display = 'none';
}

function setUserRole(role) {
    state.currentUser.rol = role;
    state.currentUser.id = generateId();
    saveToLocalStorage();
    hideRoleSelectionModal();
    updateTabVisibility();

    // Navigate to appropriate default view
    if (role === 'teamlid') {
        // Switch to Klassen view for teamleden
        const klassenTab = document.querySelector('[data-view="klassen"]');
        if (klassenTab) {
            klassenTab.click();
        }
    }
}

function updateTabVisibility() {
    const role = state.currentUser.rol;

    // Define which tabs each role can see
    // Admin: all tabs
    // Teamleider/Onderwijsplanner: all except Admin tab
    // Teamlid: only Lessen, Taken, Dummy PvI's, Dashboard

    const allTabs = document.querySelectorAll('.nav-tab[data-view]');
    const teamlidVisibleViews = ['klassen', 'taken', 'verdeling', 'dashboard', 'docenten'];
    const leaderVisibleViews = ['curriculum', 'docenten', 'klassen', 'taken', 'verdeling', 'takenbeheer', 'dashboard'];

    allTabs.forEach(tab => {
        const view = tab.getAttribute('data-view');

        if (role === 'admin') {
            // Admin sees all tabs - clear any inline style and class
            tab.classList.remove('role-hidden');
            tab.style.display = '';
        } else if (role === 'teamleider' || role === 'onderwijsplanner') {
            // Teamleider/onderwijsplanner: all except Admin tab
            if (view === 'admin') {
                tab.classList.add('role-hidden');
                tab.style.display = 'none';
            } else {
                tab.classList.remove('role-hidden');
                tab.style.display = '';
            }
        } else if (role === 'teamlid') {
            // Teamlid only sees specific tabs
            if (teamlidVisibleViews.includes(view)) {
                tab.classList.remove('role-hidden');
                tab.style.display = '';
            } else {
                tab.classList.add('role-hidden');
                tab.style.display = 'none';
            }
        } else {
            // Unknown role - show all (fallback)
            tab.classList.remove('role-hidden');
            tab.style.display = '';
        }
    });

    // Check if current active view is visible, if not switch to appropriate tab
    const activeView = document.querySelector('.view.active');
    const activeViewId = activeView?.id?.replace('view-', '');

    // For teamlid, switch to Lessen if on restricted tab
    if (role === 'teamlid' && activeViewId && !teamlidVisibleViews.includes(activeViewId)) {
        const klassenTab = document.querySelector('[data-view="klassen"]');
        if (klassenTab) {
            klassenTab.click();
        }
    }

    // For teamleider/onderwijsplanner, switch away from Admin tab
    if ((role === 'teamleider' || role === 'onderwijsplanner') && activeViewId === 'admin') {
        const curriculumTab = document.querySelector('[data-view="curriculum"]');
        if (curriculumTab) {
            curriculumTab.click();
        }
    }

    console.log('Tab visibility updated for role:', role);
}

function getCurrentUserRole() {
    return state.currentUser.rol;
}

function checkRoleOnLoad() {
    // If no role is set, show the role selection modal
    if (!state.currentUser.rol) {
        showRoleSelectionModal();
    } else {
        updateTabVisibility();

        // If teamlid, switch to first visible tab
        if (state.currentUser.rol === 'teamlid') {
            const klassenTab = document.querySelector('[data-view="klassen"]');
            if (klassenTab && !klassenTab.classList.contains('role-hidden')) {
                klassenTab.click();
            }
        }
    }
}

// ============================================
// NAVIGATION
// ============================================

function initNavigation() {
    const tabs = document.querySelectorAll('.nav-tab');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            // Update active tab
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');

            // Show corresponding view
            const viewId = tab.dataset.view;
            document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
            document.getElementById('view-' + viewId).classList.add('active');

            // Refresh view content
            if (viewId === 'verdeling') {
                updateDocentSelector();
                renderVerdelingView();
            } else if (viewId === 'dashboard') {
                renderDashboard();
            } else if (viewId === 'klassen') {
                renderKlassenView();
            } else if (viewId === 'taken') {
                updateTakenDocentSelector();
                renderTakenSelectie();
            }
        });
    });
}

// ============================================
// LEERJAREN
// ============================================

function initLeerjaarForm() {
    const form = document.getElementById('form-leerjaar');
    form.addEventListener('submit', (e) => {
        e.preventDefault();

        const naam = document.getElementById('leerjaar-naam').value.trim();
        const aantalKlassen = parseInt(document.getElementById('leerjaar-klassen').value);
        const prefix = document.getElementById('leerjaar-prefix').value.trim();

        if (!naam) {
            alert('Geef een naam voor het leerjaar');
            return;
        }

        // Generate class names
        const klassen = [];
        for (let i = 1; i <= aantalKlassen; i++) {
            klassen.push(prefix + i);
        }

        // Check if leerjaar with same name already exists
        const existing = state.leerjaren.find(l => l.naam === naam);
        if (existing) {
            existing.aantalKlassen = aantalKlassen;
            existing.prefix = prefix;
            existing.klassen = klassen;
        } else {
            state.leerjaren.push({ naam, aantalKlassen, prefix, klassen });
        }

        // Sort: first by last character (year number), then by first character (opleiding)
        state.leerjaren.sort((a, b) => {
            const lastA = a.naam.slice(-1);
            const lastB = b.naam.slice(-1);
            if (lastA !== lastB) return lastA.localeCompare(lastB);
            return a.naam[0].localeCompare(b.naam[0]);
        });
        saveToLocalStorage();
        renderLeerjarenLijst();
        updateLeerjaarSelector();
        form.reset();
    });
}

function renderLeerjarenLijst() {
    const container = document.getElementById('leerjaren-lijst');
    if (state.leerjaren.length === 0) {
        container.innerHTML = '';
        return;
    }
    container.innerHTML = state.leerjaren.map(lj => `
        <div class="leerjaar-item">
            <div class="leerjaar-info">
                <span class="leerjaar-badge">${escapeHtml(lj.naam)}</span>
                <span class="leerjaar-details">${lj.aantalKlassen} klassen (${lj.klassen.join(', ')})</span>
            </div>
            <div class="leerjaar-actions">
                <button class="leerjaar-edit" onclick="editLeerjaar('${escapeHtml(lj.naam)}')" title="Bewerken">✏️</button>
                <button class="leerjaar-delete" onclick="deleteLeerjaar('${escapeHtml(lj.naam)}')" title="Verwijderen">🗑️</button>
            </div>
        </div>
    `).join('');
}

function deleteLeerjaar(naam) {
    if (!confirm(`'${naam}' verwijderen? Alle gekoppelde vakken worden ook verwijderd.`)) return;
    state.leerjaren = state.leerjaren.filter(l => l.naam !== naam);
    state.vakken = state.vakken.filter(v => v.leerjaar !== naam);
    saveToLocalStorage();
    renderLeerjarenLijst();
    renderVakkenLijst();
    updateLeerjaarSelector();
}

// Edit Leerjaar functionality
let editLeerjaarState = { naam: '', klassen: [] };

function editLeerjaar(naam) {
    const leerjaar = state.leerjaren.find(l => l.naam === naam);
    if (!leerjaar) return;

    editLeerjaarState = {
        naam: leerjaar.naam,
        klassen: [...leerjaar.klassen] // Copy array
    };

    document.getElementById('edit-leerjaar-naam').value = naam;
    document.getElementById('edit-leerjaar-titel').textContent = naam;
    renderEditLeerjaarKlassen();
    document.getElementById('edit-leerjaar-modal').style.display = 'flex';
}

function renderEditLeerjaarKlassen() {
    const container = document.getElementById('edit-leerjaar-klassen-lijst');
    container.innerHTML = editLeerjaarState.klassen.map(klas => {
        // Check if this class has any toewijzingen
        const hasToewijzingen = state.toewijzingen.some(t => t.blokjeId.includes(`-${klas}-`));
        const deleteDisabled = hasToewijzingen ? 'disabled' : '';
        const deleteTitle = hasToewijzingen ? 'Kan niet verwijderen: er zijn geselecteerde lessen' : 'Verwijderen';

        return `
            <div class="klas-edit-item">
                <span class="klas-naam">${escapeHtml(klas)}</span>
                ${hasToewijzingen ? '<span class="klas-status">🔒 In gebruik</span>' : ''}
                <button class="klas-delete" onclick="removeKlasFromLeerjaar('${escapeHtml(klas)}')" ${deleteDisabled} title="${deleteTitle}">🗑️</button>
            </div>
        `;
    }).join('');
}

function addKlasToLeerjaar() {
    const input = document.getElementById('edit-leerjaar-nieuwe-klas');
    const nieuweKlas = input.value.trim();

    if (!nieuweKlas) {
        alert('Voer een klasnaam in');
        return;
    }

    if (editLeerjaarState.klassen.includes(nieuweKlas)) {
        alert('Deze klas bestaat al');
        return;
    }

    editLeerjaarState.klassen.push(nieuweKlas);
    editLeerjaarState.klassen.sort();
    input.value = '';
    renderEditLeerjaarKlassen();
}

function removeKlasFromLeerjaar(klas) {
    // Double-check for toewijzingen
    const hasToewijzingen = state.toewijzingen.some(t => t.blokjeId.includes(`-${klas}-`));
    if (hasToewijzingen) {
        alert(`Kan '${klas}' niet verwijderen: er zijn nog geselecteerde lessen voor deze klas.`);
        return;
    }

    if (!confirm(`Klas '${klas}' verwijderen?`)) return;

    editLeerjaarState.klassen = editLeerjaarState.klassen.filter(k => k !== klas);
    renderEditLeerjaarKlassen();
}

function saveEditLeerjaar() {
    const leerjaar = state.leerjaren.find(l => l.naam === editLeerjaarState.naam);
    if (!leerjaar) return;

    leerjaar.klassen = [...editLeerjaarState.klassen];
    leerjaar.aantalKlassen = leerjaar.klassen.length;

    // Update vakken to include new klassen
    state.vakken.forEach(vak => {
        if (vak.leerjaar === leerjaar.naam) {
            vak.klassen = [...leerjaar.klassen];
        }
    });

    saveToLocalStorage();
    renderLeerjarenLijst();
    renderVakkenLijst();
    updateLeerjaarSelector();
    closeEditLeerjaarModal();
}

function closeEditLeerjaarModal() {
    document.getElementById('edit-leerjaar-modal').style.display = 'none';
    editLeerjaarState = { naam: '', klassen: [] };
}

function updateLeerjaarSelector() {
    const selector = document.getElementById('vak-leerjaar');
    if (!selector) return;
    selector.innerHTML = '<option value="">-- Selecteer leerjaar --</option>' +
        state.leerjaren.map(lj => `<option value="${escapeHtml(lj.naam)}">${escapeHtml(lj.naam)} (${lj.klassen.join(', ')})</option>`).join('');
}

function initBasisweken() {
    const vakFormCard = document.querySelector('#form-vak')?.closest('.form-card');

    // Function to update vak form state
    function updateVakFormState() {
        if (vakFormCard) {
            if (state.basiswekenOpgeslagen) {
                vakFormCard.classList.remove('disabled-form');
                vakFormCard.querySelector('.disabled-overlay')?.remove();
            } else {
                vakFormCard.classList.add('disabled-form');
                if (!vakFormCard.querySelector('.disabled-overlay')) {
                    const overlay = document.createElement('div');
                    overlay.className = 'disabled-overlay';
                    overlay.innerHTML = '<p>⚠️ Stel eerst de basisweken in</p>';
                    vakFormCard.appendChild(overlay);
                }
            }
        }
    }

    // Load current values into inputs
    [1, 2, 3, 4].forEach(p => {
        const input = document.getElementById(`basisweken-p${p}`);
        if (input) {
            input.value = state.basisweken[p] || 8;
        }
    });

    // Update summary display
    function updateBasiswekenSummary() {
        const summary = document.getElementById('basisweken-summary');
        if (summary) {
            summary.textContent = `P1: ${state.basisweken[1]} | P2: ${state.basisweken[2]} | P3: ${state.basisweken[3]} | P4: ${state.basisweken[4]}`;
        }
    }
    updateBasiswekenSummary();

    // Initial state
    updateVakFormState();

    // Auto-save on input change
    function saveBasiswekenValues() {
        [1, 2, 3, 4].forEach(p => {
            const input = document.getElementById(`basisweken-p${p}`);
            state.basisweken[p] = parseInt(input.value) || 8;
        });
        state.basiswekenOpgeslagen = true;
        saveToLocalStorage();
        updateBasiswekenSummary();
        updateVakFormState();
    }

    // Add change listeners to all basisweken inputs
    [1, 2, 3, 4].forEach(p => {
        document.getElementById(`basisweken-p${p}`)?.addEventListener('change', saveBasiswekenValues);
    });

    // Mark as saved if values already exist
    if (state.basisweken[1] && state.basisweken[2] && state.basisweken[3] && state.basisweken[4]) {
        state.basiswekenOpgeslagen = true;
    }
}

// Toggle collapsible card
function toggleCollapsible(cardId) {
    const card = document.getElementById(cardId);
    if (card) {
        card.classList.toggle('collapsed');
    }
}
window.toggleCollapsible = toggleCollapsible;

// Toggle between Eenheden and Klokuren view
function toggleLesWeergave() {
    const toggle = document.getElementById('les-weergave-toggle');
    const showKlokuren = toggle?.checked;
    const container = document.getElementById('vakken-lijst');

    if (showKlokuren) {
        container?.classList.add('show-klokuren');
        container?.classList.remove('show-eenheden');
        document.getElementById('les-toggle-label-klok')?.classList.add('active');
        document.getElementById('les-toggle-label-eenh')?.classList.remove('active');
    } else {
        container?.classList.add('show-eenheden');
        container?.classList.remove('show-klokuren');
        document.getElementById('les-toggle-label-eenh')?.classList.add('active');
        document.getElementById('les-toggle-label-klok')?.classList.remove('active');
    }
}
window.toggleLesWeergave = toggleLesWeergave;

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    const container = document.getElementById('vakken-lijst');
    container?.classList.add('show-eenheden');
    document.getElementById('les-toggle-label-eenh')?.classList.add('active');
});

// ============================================
// CURRICULUM (VAKKEN)
// ============================================

function initCurriculumForm() {
    const form = document.getElementById('form-vak');
    const basiswekenInputs = document.getElementById('basisweken-inputs');
    const ontwikkelwekenInputs = document.getElementById('ontwikkelweken-inputs');
    const vakTypeToggle = document.getElementById('vak-type-toggle');
    const vakTypeValue = document.getElementById('vak-type-value');
    const toggleLabels = document.querySelectorAll('.toggle-label');
    const eenhedenLabel = document.getElementById('eenheden-label');

    // Function to update toggle state
    function updateToggleState(isOntwikkelweken) {
        if (isOntwikkelweken) {
            basiswekenInputs.style.display = 'none';
            ontwikkelwekenInputs.style.display = '';
            vakTypeValue.value = 'ontwikkelweken';
            toggleLabels[0].classList.remove('active');
            toggleLabels[1].classList.add('active');
            if (eenhedenLabel) eenhedenLabel.textContent = 'Aantal eenheden per ontwikkelweek';
        } else {
            basiswekenInputs.style.display = '';
            ontwikkelwekenInputs.style.display = 'none';
            vakTypeValue.value = 'basisweken';
            toggleLabels[0].classList.add('active');
            toggleLabels[1].classList.remove('active');
            if (eenhedenLabel) eenhedenLabel.textContent = 'Aantal eenheden per basisweek';
        }
    }

    // Toggle switch change handler
    if (vakTypeToggle) {
        vakTypeToggle.addEventListener('change', () => {
            updateToggleState(vakTypeToggle.checked);
        });
    }

    // Clickable labels
    toggleLabels.forEach(label => {
        label.addEventListener('click', () => {
            const isOntwikkelweken = label.dataset.value === 'ontwikkelweken';
            vakTypeToggle.checked = isOntwikkelweken;
            updateToggleState(isOntwikkelweken);
        });
    });

    // Splitsbaar toggle handling
    const splitsbaarToggle = document.getElementById('vak-splitsbaar-toggle');
    const splitsbaarValue = document.getElementById('vak-splitsbaar-value');
    const splitsbaarLabels = document.querySelectorAll('.splitsbaar-label');
    const splitsbaarHint = document.getElementById('splitsbaar-hint');

    function updateSplitsbaarState(isNietSplitsbaar) {
        if (isNietSplitsbaar) {
            splitsbaarValue.value = 'false';
            splitsbaarLabels[0].classList.remove('active');
            splitsbaarLabels[1].classList.add('active');
            if (splitsbaarHint) splitsbaarHint.textContent = 'Docenten kunnen alleen alle eenheden tegelijk selecteren';
        } else {
            splitsbaarValue.value = 'true';
            splitsbaarLabels[0].classList.add('active');
            splitsbaarLabels[1].classList.remove('active');
            if (splitsbaarHint) splitsbaarHint.textContent = 'Docenten kunnen eenheden selecteren';
        }
    }

    if (splitsbaarToggle) {
        splitsbaarToggle.addEventListener('change', () => {
            updateSplitsbaarState(splitsbaarToggle.checked);
        });
    }

    splitsbaarLabels.forEach(label => {
        label.addEventListener('click', () => {
            const isNietSplitsbaar = label.dataset.value === 'niet-splitsbaar';
            splitsbaarToggle.checked = isNietSplitsbaar;
            updateSplitsbaarState(isNietSplitsbaar);
        });
    });

    form.addEventListener('submit', (e) => {
        e.preventDefault();

        const leerjaarNaam = document.getElementById('vak-leerjaar').value;
        const leerjaar = state.leerjaren.find(l => l.naam === leerjaarNaam);

        if (!leerjaar) {
            alert('Selecteer eerst een leerjaar!');
            return;
        }

        const vakType = document.getElementById('vak-type-value').value;

        const vak = {
            id: generateId(),
            leerjaar: leerjaarNaam,
            type: vakType,
            naam: document.getElementById('vak-naam').value.trim(),
            kleur: document.getElementById('vak-kleur').value,
            klassen: leerjaar.klassen,
            splitsbaar: document.getElementById('vak-splitsbaar-value').value === 'true',
            opslagfactor: parseInt(document.getElementById('vak-opslagfactor').value) || 40
        };

        if (vakType === 'basisweken') {
            vak.periodes = {
                1: parseInt(document.getElementById('vak-p1').value) || 0,
                2: parseInt(document.getElementById('vak-p2').value) || 0,
                3: parseInt(document.getElementById('vak-p3').value) || 0,
                4: parseInt(document.getElementById('vak-p4').value) || 0
            };
        } else {
            vak.ontwikkelweken = {
                1: parseInt(document.getElementById('vak-ow1').value) || 0,
                2: parseInt(document.getElementById('vak-ow2').value) || 0,
                3: parseInt(document.getElementById('vak-ow3').value) || 0,
                4: parseInt(document.getElementById('vak-ow4').value) || 0,
                5: parseInt(document.getElementById('vak-ow5').value) || 0,
                6: parseInt(document.getElementById('vak-ow6').value) || 0,
                7: parseInt(document.getElementById('vak-ow7').value) || 0,
                8: parseInt(document.getElementById('vak-ow8').value) || 0
            };
        }

        state.vakken.push(vak);
        saveToLocalStorage();
        renderVakkenLijst();
        form.reset();
        document.getElementById('vak-kleur').value = getRandomColor();
        // Reset splitsbaar toggle
        document.getElementById('vak-splitsbaar-value').value = 'true';
        document.getElementById('vak-splitsbaar-toggle').checked = false;
        updateSplitsbaarState(false);
        document.getElementById('vak-opslagfactor').value = 40;
        // Reset to basisweken view
        basiswekenInputs.style.display = '';
        ontwikkelwekenInputs.style.display = 'none';
        vakTypeToggle.checked = false;
        updateToggleState(false);
    });

    document.querySelectorAll('.color-preset').forEach(btn => {
        btn.addEventListener('click', () => {
            document.getElementById('vak-kleur').value = btn.dataset.color;
        });
    });
}

function getRandomColor() {
    const colors = ['#4CAF50', '#2196F3', '#9C27B0', '#FF9800', '#E91E63', '#00BCD4', '#795548', '#607D8B'];
    return colors[Math.floor(Math.random() * colors.length)];
}

// ============================================
// TAKENBEHEER SETUP
// ============================================

function setupTakenbeheer() {
    // Weken per Periode form
    const wekenForm = document.getElementById('form-weken-periode');
    const taakFormCard = document.querySelector('#form-taak')?.closest('.form-card');

    // Function to update taak form state - no longer blocking since periodeweken always have default values
    function updateTaakFormState() {
        // Periodeweken have default values (10 per period), so taak form is always enabled
        if (taakFormCard) {
            taakFormCard.classList.remove('disabled-form');
            taakFormCard.querySelector('.disabled-overlay')?.remove();
        }
    }

    // Update summary display
    function updateWekenPeriodeSummary() {
        const summary = document.getElementById('weken-periode-summary');
        if (summary) {
            summary.textContent = `P1: ${state.wekenPerPeriode[1]} | P2: ${state.wekenPerPeriode[2]} | P3: ${state.wekenPerPeriode[3]} | P4: ${state.wekenPerPeriode[4]}`;
        }
    }
    updateWekenPeriodeSummary();

    if (wekenForm) {
        // Load current values
        document.getElementById('weken-p1').value = state.wekenPerPeriode[1] || 10;
        document.getElementById('weken-p2').value = state.wekenPerPeriode[2] || 10;
        document.getElementById('weken-p3').value = state.wekenPerPeriode[3] || 10;
        document.getElementById('weken-p4').value = state.wekenPerPeriode[4] || 10;

        // Auto-save on input change
        function saveWekenValues() {
            state.wekenPerPeriode[1] = parseInt(document.getElementById('weken-p1').value) || 10;
            state.wekenPerPeriode[2] = parseInt(document.getElementById('weken-p2').value) || 10;
            state.wekenPerPeriode[3] = parseInt(document.getElementById('weken-p3').value) || 10;
            state.wekenPerPeriode[4] = parseInt(document.getElementById('weken-p4').value) || 10;
            state.wekenOpgeslagen = true;
            saveToLocalStorage();
            updateTaakFormState();
            updateWekenPeriodeSummary();
        }

        // Add change listeners to all week inputs
        ['weken-p1', 'weken-p2', 'weken-p3', 'weken-p4'].forEach(id => {
            document.getElementById(id)?.addEventListener('change', saveWekenValues);
        });

        // Also save on initial load if values exist
        if (state.wekenPerPeriode[1] && state.wekenPerPeriode[2] && state.wekenPerPeriode[3] && state.wekenPerPeriode[4]) {
            state.wekenOpgeslagen = true;
        }
    }

    // Initial state
    updateTaakFormState();

    // Taak form
    const taakForm = document.getElementById('form-taak');
    const periodesContainer = document.getElementById('taak-periodes-container');

    if (taakForm) {
        // Toggle verdeling switch handling
        const verdelingToggle = document.getElementById('taak-verdeling-toggle');
        const verdelingValue = document.getElementById('taak-verdeling-value');
        const verdelingLabels = document.querySelectorAll('.taak-verdeling-label');
        const verdelingHint = document.getElementById('taak-verdeling-hint');

        function updateVerdelingState(isAfwijkend) {
            if (isAfwijkend) {
                verdelingValue.value = 'afwijkend';
                verdelingLabels[0].classList.remove('active');
                verdelingLabels[1].classList.add('active');
                periodesContainer.style.display = '';
                if (verdelingHint) verdelingHint.textContent = 'Vul uren per periode handmatig in';
            } else {
                verdelingValue.value = 'gelijk';
                verdelingLabels[0].classList.add('active');
                verdelingLabels[1].classList.remove('active');
                periodesContainer.style.display = 'none';
                if (verdelingHint) verdelingHint.textContent = 'Uren worden gespreid over alle periodes';
            }
        }

        if (verdelingToggle) {
            verdelingToggle.addEventListener('change', () => {
                updateVerdelingState(verdelingToggle.checked);
            });
        }

        verdelingLabels.forEach(label => {
            label.addEventListener('click', () => {
                const isAfwijkend = label.dataset.value === 'afwijkend';
                verdelingToggle.checked = isAfwijkend;
                updateVerdelingState(isAfwijkend);
            });
        });

        // Taak color presets
        document.querySelectorAll('.taak-color-presets .color-preset').forEach(btn => {
            btn.addEventListener('click', () => {
                document.getElementById('taak-kleur').value = btn.dataset.color;
            });
        });

        // Mutual exclusivity: voor iedereen <-> max docenten <-> exact docenten
        const voorIedereenCheck = document.getElementById('taak-voor-iedereen');
        const maxDocentenCheck = document.getElementById('taak-max-docenten-check');
        const maxDocentenContainer = document.getElementById('taak-max-docenten-container');
        const exactDocentenCheck = document.getElementById('taak-exact-docenten-check');
        const exactDocentenContainer = document.getElementById('taak-exact-docenten-container');

        voorIedereenCheck.addEventListener('change', () => {
            if (voorIedereenCheck.checked) {
                maxDocentenCheck.checked = false;
                maxDocentenContainer.style.display = 'none';
                exactDocentenCheck.checked = false;
                exactDocentenContainer.style.display = 'none';
            }
        });

        maxDocentenCheck.addEventListener('change', () => {
            if (maxDocentenCheck.checked) {
                voorIedereenCheck.checked = false;
                exactDocentenCheck.checked = false;
                exactDocentenContainer.style.display = 'none';
                maxDocentenContainer.style.display = 'block';
            } else {
                maxDocentenContainer.style.display = 'none';
            }
        });

        exactDocentenCheck.addEventListener('change', () => {
            if (exactDocentenCheck.checked) {
                voorIedereenCheck.checked = false;
                maxDocentenCheck.checked = false;
                maxDocentenContainer.style.display = 'none';
                exactDocentenContainer.style.display = 'block';
            } else {
                exactDocentenContainer.style.display = 'none';
            }
        });
        // Button click handler (instead of form submit to prevent navigation)
        document.getElementById('btn-taak-toevoegen')?.addEventListener('click', () => {
            const taakNaam = document.getElementById('taak-naam').value.trim();
            if (!taakNaam) {
                alert('Voer een taaknaam in');
                return;
            }

            const totaalUren = parseFloat(document.getElementById('taak-totaal-uren').value) || 0;
            const verdeling = document.getElementById('taak-verdeling-value').value;

            let urenPerPeriode;
            if (verdeling === 'gelijk') {
                // Verdelen over periodes op basis van weken per periode
                const totaalWeken = state.wekenPerPeriode[1] + state.wekenPerPeriode[2] +
                    state.wekenPerPeriode[3] + state.wekenPerPeriode[4];
                const urenPerWeek = totaalWeken > 0 ? totaalUren / totaalWeken : 0;
                urenPerPeriode = {
                    1: urenPerWeek * state.wekenPerPeriode[1],
                    2: urenPerWeek * state.wekenPerPeriode[2],
                    3: urenPerWeek * state.wekenPerPeriode[3],
                    4: urenPerWeek * state.wekenPerPeriode[4]
                };
            } else {
                // Afwijkend: gebruik handmatige invoer
                const p1 = parseFloat(document.getElementById('taak-p1').value) || 0;
                const p2 = parseFloat(document.getElementById('taak-p2').value) || 0;
                const p3 = parseFloat(document.getElementById('taak-p3').value) || 0;
                const p4 = parseFloat(document.getElementById('taak-p4').value) || 0;
                const somPeriodes = p1 + p2 + p3 + p4;

                if (somPeriodes !== totaalUren) {
                    alert(`De som van de periodes (${somPeriodes}) moet exact gelijk zijn aan het totaal aantal uren (${totaalUren}).`);
                    return;
                }

                urenPerPeriode = { 1: p1, 2: p2, 3: p3, 4: p4 };
            }

            const taak = {
                id: generateId(),
                naam: taakNaam,
                kleur: document.getElementById('taak-kleur').value || '#6366f1',
                totaalUren: totaalUren,
                urenPerPeriode: urenPerPeriode,
                verdeling: verdeling,
                naarRato: document.getElementById('taak-naar-rato').checked,
                voorIedereen: document.getElementById('taak-voor-iedereen').checked,
                maxDocenten: document.getElementById('taak-max-docenten-check').checked
                    ? parseInt(document.getElementById('taak-max-docenten').value) || 1
                    : null,
                exactDocenten: document.getElementById('taak-exact-docenten-check').checked
                    ? parseInt(document.getElementById('taak-exact-docenten').value) || 1
                    : null
            };

            state.taken.push(taak);

            // Als taak voor iedereen, voeg toe aan alle docenten
            if (taak.voorIedereen) {
                state.docenten.forEach(docent => {
                    state.docentTaken.push({
                        docentId: docent.id,
                        taakId: taak.id,
                        periodes: { ...taak.urenPerPeriode }
                    });
                });
            }

            saveToLocalStorage();
            renderTakenLijst();
            taakForm.reset();
            periodesContainer.style.display = 'none';
            document.getElementById('taak-max-docenten-container').style.display = 'none';
        });
    }
}

function renderTakenLijst() {
    const container = document.getElementById('taken-lijst');
    if (!container) return;

    if (state.taken.length === 0) {
        container.innerHTML = '<p class="empty-state">Nog geen taken aangemaakt.</p>';
        return;
    }

    // Sort tasks alphabetically
    const sortedTaken = [...state.taken].sort((a, b) => a.naam.localeCompare(b.naam, 'nl'));

    container.innerHTML = sortedTaken.map(taak => {
        const urenPerPeriode = taak.urenPerPeriode || { 1: 0, 2: 0, 3: 0, 4: 0 };
        const totaalUren = Object.values(urenPerPeriode).reduce((a, b) => a + b, 0);
        const kleur = taak.kleur || '#6366f1';

        // Determine docenten constraint text (using same styling as Taken)
        const constraints = [];
        if (taak.voorIedereen) {
            constraints.push('voor alle teamleden');
        } else if (taak.exactDocenten) {
            constraints.push(`exact ${taak.exactDocenten} ${taak.exactDocenten === 1 ? 'teamlid' : 'teamleden'}`);
        } else if (taak.maxDocenten) {
            constraints.push(`max ${taak.maxDocenten} ${taak.maxDocenten === 1 ? 'teamlid' : 'teamleden'}`);
        }
        if (taak.naarRato) {
            constraints.push('naar rato');
        }
        const docentenConstraint = constraints.length > 0
            ? `<span class="max-docenten-info">(${constraints.join('; ')})</span>`
            : '';

        return `
            <div class="vak-item taak-item" style="border-left-color: ${kleur}">
                <div class="taak-doc-icon" style="background: ${kleur}">
                    <div class="taak-doc-fold"></div>
                    <div class="taak-doc-lines">
                        <span></span><span></span><span></span>
                    </div>
                </div>
                <div class="vak-info">
                    <div class="vak-naam">${taak.naam} ${docentenConstraint}</div>
                    <div class="vak-details">⏱️ ${totaalUren.toFixed(1)}u totaal <span class="vak-periodes-inline">P1: ${urenPerPeriode[1].toFixed(1)} • P2: ${urenPerPeriode[2].toFixed(1)} • P3: ${urenPerPeriode[3].toFixed(1)} • P4: ${urenPerPeriode[4].toFixed(1)}</span></div>
                </div>
                <div class="vak-actions">
                    <button onclick="editTaak('${taak.id}')" title="Bewerken">✏️</button>
                    <button onclick="deleteTaak('${taak.id}')" title="Verwijderen">🗑️</button>
                </div>
            </div>
        `;
    }).join('');
}

function deleteTaak(taakId) {
    if (!confirm('Weet je zeker dat je deze taak wilt verwijderen?')) return;
    state.taken = state.taken.filter(t => t.id !== taakId);
    state.docentTaken = state.docentTaken.filter(dt => dt.taakId !== taakId);
    saveToLocalStorage();
    renderTakenLijst();
}

function editTaak(taakId) {
    const taak = state.taken.find(t => t.id === taakId);
    if (!taak) return;

    // Fill form with taak data
    document.getElementById('edit-taak-id').value = taak.id;
    document.getElementById('edit-taak-naam').value = taak.naam;
    document.getElementById('edit-taak-kleur').value = taak.kleur || '#6366f1';
    document.getElementById('edit-taak-totaal-uren').value = (taak.totaalUren || 0).toFixed(1);
    document.getElementById('edit-taak-naar-rato').checked = taak.naarRato || false;
    document.getElementById('edit-taak-voor-iedereen').checked = taak.voorIedereen;

    // Max docenten
    const hasMaxDocenten = taak.maxDocenten !== null && taak.maxDocenten !== undefined;
    document.getElementById('edit-taak-max-docenten-check').checked = hasMaxDocenten;
    document.getElementById('edit-taak-max-docenten-container').style.display = hasMaxDocenten ? 'block' : 'none';
    document.getElementById('edit-taak-max-docenten').value = taak.maxDocenten || 1;

    // Exact docenten
    const hasExactDocenten = taak.exactDocenten !== null && taak.exactDocenten !== undefined;
    document.getElementById('edit-taak-exact-docenten-check').checked = hasExactDocenten;
    document.getElementById('edit-taak-exact-docenten-container').style.display = hasExactDocenten ? 'block' : 'none';
    document.getElementById('edit-taak-exact-docenten').value = taak.exactDocenten || 1;

    // Get stored verdeling type (default to 'gelijk' for backward compatibility)
    const isAfwijkend = taak.verdeling === 'afwijkend';

    // Set toggle state
    document.getElementById('edit-taak-verdeling-toggle').checked = isAfwijkend;
    document.getElementById('edit-taak-verdeling-value').value = isAfwijkend ? 'afwijkend' : 'gelijk';

    // Update toggle labels
    const editVerdelingLabels = document.querySelectorAll('.edit-taak-verdeling-label');
    editVerdelingLabels[0].classList.toggle('active', !isAfwijkend);
    editVerdelingLabels[1].classList.toggle('active', isAfwijkend);

    // Update hint text
    const editVerdelingHint = document.getElementById('edit-taak-verdeling-hint');
    if (editVerdelingHint) {
        editVerdelingHint.textContent = isAfwijkend ? 'Vul uren per periode handmatig in' : 'Uren worden gespreid over alle periodes';
    }

    // Show/hide periodes container
    document.getElementById('edit-taak-periodes-container').style.display = isAfwijkend ? 'block' : 'none';

    // Fill periode values with 1 decimal
    document.getElementById('edit-taak-p1').value = (taak.urenPerPeriode[1] || 0).toFixed(1);
    document.getElementById('edit-taak-p2').value = (taak.urenPerPeriode[2] || 0).toFixed(1);
    document.getElementById('edit-taak-p3').value = (taak.urenPerPeriode[3] || 0).toFixed(1);
    document.getElementById('edit-taak-p4').value = (taak.urenPerPeriode[4] || 0).toFixed(1);

    // Show modal
    document.getElementById('edit-taak-modal').style.display = 'flex';
}

function closeEditTaakModal() {
    document.getElementById('edit-taak-modal').style.display = 'none';
}

function saveEditTaak() {
    const taakId = document.getElementById('edit-taak-id').value;
    const taak = state.taken.find(t => t.id === taakId);
    if (!taak) return;

    const totaalUren = parseFloat(document.getElementById('edit-taak-totaal-uren').value) || 0;
    const verdeling = document.getElementById('edit-taak-verdeling-value').value;

    let urenPerPeriode;
    if (verdeling === 'gelijk') {
        const totaalWeken = state.wekenPerPeriode[1] + state.wekenPerPeriode[2] +
            state.wekenPerPeriode[3] + state.wekenPerPeriode[4];
        const urenPerWeek = totaalWeken > 0 ? totaalUren / totaalWeken : 0;
        urenPerPeriode = {
            1: urenPerWeek * state.wekenPerPeriode[1],
            2: urenPerWeek * state.wekenPerPeriode[2],
            3: urenPerWeek * state.wekenPerPeriode[3],
            4: urenPerWeek * state.wekenPerPeriode[4]
        };
    } else {
        const p1 = parseFloat(document.getElementById('edit-taak-p1').value) || 0;
        const p2 = parseFloat(document.getElementById('edit-taak-p2').value) || 0;
        const p3 = parseFloat(document.getElementById('edit-taak-p3').value) || 0;
        const p4 = parseFloat(document.getElementById('edit-taak-p4').value) || 0;
        const somPeriodes = p1 + p2 + p3 + p4;

        if (Math.abs(somPeriodes - totaalUren) > 0.01) {
            alert(`De som van de periodes (${somPeriodes.toFixed(1)}) moet gelijk zijn aan het totaal (${totaalUren.toFixed(1)}).`);
            // Reopen modal to let user fix
            document.getElementById('edit-taak-modal').style.display = 'flex';
            return;
        }
        urenPerPeriode = { 1: p1, 2: p2, 3: p3, 4: p4 };
    }

    // Update taak properties
    taak.naam = document.getElementById('edit-taak-naam').value.trim();
    taak.kleur = document.getElementById('edit-taak-kleur').value;
    taak.totaalUren = totaalUren;
    taak.urenPerPeriode = urenPerPeriode;
    taak.verdeling = verdeling;
    taak.naarRato = document.getElementById('edit-taak-naar-rato').checked;
    taak.voorIedereen = document.getElementById('edit-taak-voor-iedereen').checked;
    taak.maxDocenten = document.getElementById('edit-taak-max-docenten-check').checked
        ? parseInt(document.getElementById('edit-taak-max-docenten').value) || 1
        : null;
    taak.exactDocenten = document.getElementById('edit-taak-exact-docenten-check').checked
        ? parseInt(document.getElementById('edit-taak-exact-docenten').value) || 1
        : null;

    saveToLocalStorage();
    renderTakenLijst();
}

function initEditTaakForm() {
    const form = document.getElementById('form-edit-taak');
    if (!form) return;

    // Toggle verdeling switch handling
    const editVerdelingToggle = document.getElementById('edit-taak-verdeling-toggle');
    const editVerdelingValue = document.getElementById('edit-taak-verdeling-value');
    const editVerdelingLabels = document.querySelectorAll('.edit-taak-verdeling-label');
    const editVerdelingHint = document.getElementById('edit-taak-verdeling-hint');
    const editPeriodesContainer = document.getElementById('edit-taak-periodes-container');

    function updateEditTaakVerdelingState(isAfwijkend) {
        if (isAfwijkend) {
            editVerdelingValue.value = 'afwijkend';
            editVerdelingLabels[0].classList.remove('active');
            editVerdelingLabels[1].classList.add('active');
            editPeriodesContainer.style.display = 'block';
            if (editVerdelingHint) editVerdelingHint.textContent = 'Vul uren per periode handmatig in';
        } else {
            editVerdelingValue.value = 'gelijk';
            editVerdelingLabels[0].classList.add('active');
            editVerdelingLabels[1].classList.remove('active');
            editPeriodesContainer.style.display = 'none';
            if (editVerdelingHint) editVerdelingHint.textContent = 'Uren worden gespreid over alle periodes';
        }
    }

    if (editVerdelingToggle) {
        editVerdelingToggle.addEventListener('change', () => {
            updateEditTaakVerdelingState(editVerdelingToggle.checked);
        });
    }

    editVerdelingLabels.forEach(label => {
        label.addEventListener('click', () => {
            const isAfwijkend = label.dataset.value === 'afwijkend';
            editVerdelingToggle.checked = isAfwijkend;
            updateEditTaakVerdelingState(isAfwijkend);
        });
    });

    // Mutual exclusivity: voor iedereen <-> max docenten <-> exact docenten
    const voorIedereenCheck = document.getElementById('edit-taak-voor-iedereen');
    const maxDocentenCheck = document.getElementById('edit-taak-max-docenten-check');
    const maxDocentenContainer = document.getElementById('edit-taak-max-docenten-container');
    const exactDocentenCheck = document.getElementById('edit-taak-exact-docenten-check');
    const exactDocentenContainer = document.getElementById('edit-taak-exact-docenten-container');

    voorIedereenCheck.addEventListener('change', () => {
        if (voorIedereenCheck.checked) {
            maxDocentenCheck.checked = false;
            maxDocentenContainer.style.display = 'none';
            exactDocentenCheck.checked = false;
            exactDocentenContainer.style.display = 'none';
        }
    });

    maxDocentenCheck.addEventListener('change', () => {
        if (maxDocentenCheck.checked) {
            voorIedereenCheck.checked = false;
            exactDocentenCheck.checked = false;
            exactDocentenContainer.style.display = 'none';
            maxDocentenContainer.style.display = 'block';
        } else {
            maxDocentenContainer.style.display = 'none';
        }
    });

    exactDocentenCheck.addEventListener('change', () => {
        if (exactDocentenCheck.checked) {
            voorIedereenCheck.checked = false;
            maxDocentenCheck.checked = false;
            maxDocentenContainer.style.display = 'none';
            exactDocentenContainer.style.display = 'block';
        } else {
            exactDocentenContainer.style.display = 'none';
        }
    });

    // Form submit handler
    form.addEventListener('submit', (e) => {
        e.preventDefault();

        const taakId = document.getElementById('edit-taak-id').value;
        const taak = state.taken.find(t => t.id === taakId);
        if (!taak) return;

        const totaalUren = parseFloat(document.getElementById('edit-taak-totaal-uren').value) || 0;
        const verdeling = document.querySelector('input[name="edit-taak-verdeling"]:checked').value;

        let urenPerPeriode;
        if (verdeling === 'gelijk') {
            const totaalWeken = state.wekenPerPeriode[1] + state.wekenPerPeriode[2] +
                state.wekenPerPeriode[3] + state.wekenPerPeriode[4];
            const urenPerWeek = totaalWeken > 0 ? totaalUren / totaalWeken : 0;
            urenPerPeriode = {
                1: urenPerWeek * state.wekenPerPeriode[1],
                2: urenPerWeek * state.wekenPerPeriode[2],
                3: urenPerWeek * state.wekenPerPeriode[3],
                4: urenPerWeek * state.wekenPerPeriode[4]
            };
        } else {
            const p1 = parseFloat(document.getElementById('edit-taak-p1').value) || 0;
            const p2 = parseFloat(document.getElementById('edit-taak-p2').value) || 0;
            const p3 = parseFloat(document.getElementById('edit-taak-p3').value) || 0;
            const p4 = parseFloat(document.getElementById('edit-taak-p4').value) || 0;
            const somPeriodes = p1 + p2 + p3 + p4;

            if (Math.abs(somPeriodes - totaalUren) > 0.01) {
                alert(`De som van de periodes (${somPeriodes.toFixed(1)}) moet gelijk zijn aan het totaal (${totaalUren.toFixed(1)}).`);
                return;
            }
            urenPerPeriode = { 1: p1, 2: p2, 3: p3, 4: p4 };
        }

        // Update taak properties
        taak.naam = document.getElementById('edit-taak-naam').value.trim();
        taak.kleur = document.getElementById('edit-taak-kleur').value;
        taak.totaalUren = totaalUren;
        taak.urenPerPeriode = urenPerPeriode;
        taak.voorIedereen = document.getElementById('edit-taak-voor-iedereen').checked;
        taak.maxDocenten = document.getElementById('edit-taak-max-docenten-check').checked
            ? parseInt(document.getElementById('edit-taak-max-docenten').value) || 1
            : null;

        saveToLocalStorage();
        renderTakenLijst();
        closeEditTaakModal();
    });
}


function renderVakkenLijst() {
    const container = document.getElementById('vakken-lijst');

    if (state.vakken.length === 0) {
        container.innerHTML = '<p class="empty-state">Stel eerst leerjaren in en voeg dan vakken toe.</p>';
        return;
    }

    // Filter out any legacy vakken without leerjaar
    const vakkenMetLeerjaar = state.vakken.filter(v => v.leerjaar !== undefined);

    if (vakkenMetLeerjaar.length === 0) {
        container.innerHTML = '<p class="empty-state">Stel eerst leerjaren in en voeg dan vakken toe.</p>';
        return;
    }

    // Group by leerjaar (now using naam as string key)
    const grouped = {};
    vakkenMetLeerjaar.forEach(vak => {
        const lj = vak.leerjaar || '';
        if (!grouped[lj]) grouped[lj] = [];
        grouped[lj].push(vak);
    });

    // Sort: first by last character (year number), then by first character (opleiding)
    const leerjaarNamen = Object.keys(grouped).sort((a, b) => {
        const lastA = a.slice(-1);
        const lastB = b.slice(-1);
        if (lastA !== lastB) return lastA.localeCompare(lastB);
        return a[0].localeCompare(b[0]);
    });

    container.innerHTML = leerjaarNamen.map(naam => {
        const leerjaar = state.leerjaren.find(l => l.naam === naam);
        const vakken = grouped[naam] || [];
        const basisVakken = vakken.filter(v => v.type !== 'ontwikkelweken');
        const owVakken = vakken.filter(v => v.type === 'ontwikkelweken');

        // Calculate BOT uren voor basisweken: eenheden × 0.5 × weken per periode
        let basisBOT = 0;
        basisVakken.forEach(vak => {
            if (vak.periodes) {
                for (let p = 1; p <= 4; p++) {
                    const eenheden = vak.periodes[p] || 0;
                    const weken = state.basisweken[p] || 8;
                    basisBOT += eenheden * 0.5 * weken;
                }
            }
        });

        // Calculate BOT uren voor ontwikkelweken: eenheden × 0.5
        let owBOT = 0;
        owVakken.forEach(vak => {
            if (vak.ontwikkelweken) {
                for (let ow = 1; ow <= 8; ow++) {
                    const eenheden = vak.ontwikkelweken[ow] || 0;
                    owBOT += eenheden * 0.5;
                }
            }
        });

        const totalBOT = basisBOT + owBOT;
        const klassenList = leerjaar ? leerjaar.klassen.join(', ') : '';

        // Build basisweken table header - with Les basisweken as name
        let basisHeader = '<th class="les-tabel-naam">📚 Lessen basisweken</th>';
        for (let p = 1; p <= 4; p++) {
            const weken = state.basisweken[p] || 8;
            basisHeader += `<th class="les-tabel-periode les-col-eenh" colspan="2">P${p} <span class="les-weken">(${weken}w)</span></th>`;
            basisHeader += `<th class="les-tabel-periode les-col-klok" colspan="2">P${p} <span class="les-weken">(${weken}w)</span></th>`;
        }
        basisHeader += '<th class="les-tabel-totaal les-col-eenh">Totaal</th>';
        basisHeader += '<th class="les-tabel-totaal les-col-klok">Totaal</th>';
        basisHeader += '<th class="les-tabel-acties"></th>';

        // Build ontwikkelweken table header - with Les ontwikkelweken as name
        let owHeader = '<th class="les-tabel-naam">⭐ Lessen ontwikkelweken</th>';
        for (let ow = 1; ow <= 8; ow++) {
            owHeader += `<th class="les-tabel-periode les-col-eenh">OW${ow}</th>`;
            owHeader += `<th class="les-tabel-periode les-col-klok">OW${ow}</th>`;
        }
        owHeader += '<th class="les-tabel-totaal les-col-eenh">Totaal</th>';
        owHeader += '<th class="les-tabel-totaal les-col-klok">Totaal</th>';
        owHeader += '<th class="les-tabel-acties"></th>';

        // Sub-header for basis (per week / totaal)
        let basisSubHeader = '<th></th>';
        for (let p = 1; p <= 4; p++) {
            basisSubHeader += '<th class="les-sub-header les-col-eenh">/wk</th><th class="les-sub-header les-col-eenh">tot</th>';
            basisSubHeader += '<th class="les-sub-header les-col-klok">/wk</th><th class="les-sub-header les-col-klok">tot</th>';
        }
        basisSubHeader += '<th class="les-sub-header les-col-eenh">E</th>';
        basisSubHeader += '<th class="les-sub-header les-col-klok">K</th>';
        basisSubHeader += '<th></th>';

        // Sub-header for OW
        let owSubHeader = '<th></th>';
        for (let ow = 1; ow <= 8; ow++) {
            owSubHeader += '<th class="les-sub-header les-col-eenh">E</th>';
            owSubHeader += '<th class="les-sub-header les-col-klok">K</th>';
        }
        owSubHeader += '<th class="les-sub-header les-col-eenh">E</th>';
        owSubHeader += '<th class="les-sub-header les-col-klok">K</th>';
        owSubHeader += '<th></th>';

        // Calculate totals for footer - basisweken
        let basisTotals = { totalE: 0, totalK: 0, periodes: {} };
        for (let p = 1; p <= 4; p++) {
            basisTotals.periodes[p] = { e: 0, et: 0, k: 0, kt: 0 };
        }
        basisVakken.forEach(vak => {
            if (vak.periodes) {
                for (let p = 1; p <= 4; p++) {
                    const eenheden = vak.periodes[p] || 0;
                    const weken = state.basisweken[p] || 8;
                    basisTotals.periodes[p].e += eenheden;
                    basisTotals.periodes[p].et += eenheden * weken;
                    basisTotals.periodes[p].k += eenheden * 0.5;
                    basisTotals.periodes[p].kt += eenheden * 0.5 * weken;
                    basisTotals.totalE += eenheden * weken;
                    basisTotals.totalK += eenheden * 0.5 * weken;
                }
            }
        });

        // Calculate totals for footer - ontwikkelweken
        let owTotals = { totalE: 0, totalK: 0, weken: {} };
        for (let ow = 1; ow <= 8; ow++) {
            owTotals.weken[ow] = { e: 0, k: 0 };
        }
        owVakken.forEach(vak => {
            if (vak.ontwikkelweken) {
                for (let ow = 1; ow <= 8; ow++) {
                    const eenheden = vak.ontwikkelweken[ow] || 0;
                    owTotals.weken[ow].e += eenheden;
                    owTotals.weken[ow].k += eenheden * 0.5;
                    owTotals.totalE += eenheden;
                    owTotals.totalK += eenheden * 0.5;
                }
            }
        });

        // Build footer rows with toggle classes
        let basisFooter = `<td class="les-tabel-footer-naam">Totaal</td>`;
        for (let p = 1; p <= 4; p++) {
            const pt = basisTotals.periodes[p];
            basisFooter += `<td class="les-cel-footer les-col-eenh">${pt.e}</td><td class="les-cel-footer les-cel-tot les-col-eenh">${pt.et}</td>`;
            basisFooter += `<td class="les-cel-footer les-col-klok">${pt.k.toFixed(1)}</td><td class="les-cel-footer les-cel-tot les-col-klok">${pt.kt.toFixed(1)}</td>`;
        }
        basisFooter += `<td class="les-cel-footer les-cel-totaal les-col-eenh">${basisTotals.totalE}</td>`;
        basisFooter += `<td class="les-cel-footer les-cel-totaal les-col-klok">${basisTotals.totalK.toFixed(1)}</td>`;
        basisFooter += '<td></td>';

        let owFooter = `<td class="les-tabel-footer-naam">Totaal</td>`;
        for (let ow = 1; ow <= 8; ow++) {
            const wt = owTotals.weken[ow];
            owFooter += `<td class="les-cel-footer les-col-eenh">${wt.e}</td>`;
            owFooter += `<td class="les-cel-footer les-col-klok">${wt.k.toFixed(1)}</td>`;
        }
        owFooter += `<td class="les-cel-footer les-cel-totaal les-col-eenh">${owTotals.totalE}</td>`;
        owFooter += `<td class="les-cel-footer les-cel-totaal les-col-klok">${owTotals.totalK.toFixed(1)}</td>`;
        owFooter += '<td></td>';

        // Calculate combined totals for BOT totaal row
        const combinedTotalE = basisTotals.totalE + owTotals.totalE;
        const combinedTotalK = basisTotals.totalK + owTotals.totalK;

        return `
            <div class="leerjaar-group">
                <div class="leerjaar-group-header">
                    <h4>🎓 ${escapeHtml(naam)}</h4>
                    <span class="leerjaar-klassen-badge">${klassenList}</span>
                </div>
                ${basisVakken.length > 0 ? `
                    <table class="les-tabel">
                        <thead>
                            <tr>${basisHeader}</tr>
                        </thead>
                        <tbody>
                            ${basisVakken.map(vak => renderVakTableRow(vak, 'basis')).join('')}
                        </tbody>
                        <tfoot>
                            <tr class="les-tabel-footer-row">${basisFooter}</tr>
                        </tfoot>
                    </table>
                ` : ''}
                ${owVakken.length > 0 ? `
                    <table class="les-tabel les-tabel-ow">
                        <thead>
                            <tr>${owHeader}</tr>
                        </thead>
                        <tbody>
                            ${owVakken.map(vak => renderVakTableRow(vak, 'ow')).join('')}
                        </tbody>
                        <tfoot>
                            <tr class="les-tabel-footer-row">${owFooter}</tr>
                        </tfoot>
                    </table>
                ` : ''}
                <div class="leerjaar-bot-totaal">
                    <span class="bot-totaal-label">BOT totaal per klas ${escapeHtml(naam)}:</span>
                    <span class="bot-totaal-value les-col-eenh">${combinedTotalE} eenheden</span>
                    <span class="bot-totaal-value les-col-klok">${combinedTotalK.toFixed(1)} klokuren</span>
                </div>
            </div>
        `;
    }).join('');
}

function renderVakTableRow(vak, type) {
    const opslagfactor = vak.opslagfactor || 40;
    const splitsbaar = vak.splitsbaar !== false;

    let periodeCells = '';
    let totalE = 0;
    let totalK = 0;

    if (type === 'ow' && vak.ontwikkelweken) {
        const ow = vak.ontwikkelweken;
        for (let i = 1; i <= 8; i++) {
            const eenheden = ow[i] || 0;
            const klokuren = eenheden * 0.5;
            totalE += eenheden;
            totalK += klokuren;
            periodeCells += `<td class="les-cel-eenh les-col-eenh">${eenheden}</td>`;
            periodeCells += `<td class="les-cel-klok les-col-klok">${klokuren.toFixed(1)}</td>`;
        }
    } else if (vak.periodes) {
        const p = vak.periodes;
        for (let i = 1; i <= 4; i++) {
            const eenheden = p[i] || 0;
            const weken = state.basisweken[i] || 8;
            const eenhedenTotaal = eenheden * weken;
            const klokuren = eenheden * 0.5;
            const klokurenTotaal = klokuren * weken;
            totalE += eenhedenTotaal;
            totalK += klokurenTotaal;
            periodeCells += `<td class="les-cel-eenh les-col-eenh">${eenheden}</td><td class="les-cel-tot les-col-eenh">${eenhedenTotaal}</td>`;
            periodeCells += `<td class="les-cel-klok les-col-klok">${klokuren.toFixed(1)}</td><td class="les-cel-tot les-col-klok">${klokurenTotaal.toFixed(1)}</td>`;
        }
    }

    return `
        <tr class="les-tabel-row">
            <td class="les-tabel-naam-cel">
                <span class="les-kleur-dot" style="background: ${vak.kleur}"></span>
                <span class="les-naam">${escapeHtml(vak.naam)}</span>
                <span class="max-docenten-info">(VZNZ ${opslagfactor}%; ${splitsbaar ? '✂️' : '🔒'})</span>
            </td>
            ${periodeCells}
            <td class="les-cel-totaal les-col-eenh">${totalE}</td>
            <td class="les-cel-totaal les-col-klok">${totalK.toFixed(1)}</td>
            <td class="les-tabel-acties-cel">
                <button onclick="editVak('${vak.id}')" title="Bewerken">✏️</button>
                <button onclick="deleteVak('${vak.id}')" title="Verwijderen">🗑️</button>
            </td>
        </tr>
    `;
}

// Keep old function for backwards compatibility if needed elsewhere
function renderVakItem(vak) {
    return renderVakTableRow(vak, vak.type === 'ontwikkelweken' ? 'ow' : 'basis');
}

function deleteVak(vakId) {
    if (!confirm('Weet je zeker dat je dit vak wilt verwijderen?')) return;
    state.vakken = state.vakken.filter(v => v.id !== vakId);
    state.toewijzingen = state.toewijzingen.filter(t => !t.blokjeId.startsWith(vakId));
    saveToLocalStorage();
    renderVakkenLijst();
}

function editVak(vakId) {
    const vak = state.vakken.find(v => v.id === vakId);
    if (!vak) return;

    // Fill form with vak data
    document.getElementById('edit-vak-id').value = vak.id;
    document.getElementById('edit-vak-naam').value = vak.naam;
    document.getElementById('edit-vak-kleur').value = vak.kleur || '#6366f1';
    document.getElementById('edit-vak-opslagfactor').value = vak.opslagfactor || 40;

    // Display klassen in header
    const klassenDisplay = document.getElementById('edit-vak-klassen-display');
    if (klassenDisplay) {
        const klassen = vak.klassen || [];
        klassenDisplay.textContent = klassen.length > 0 ? klassen.join(', ') : 'Geen klassen';
    }

    // Set type toggle
    const type = vak.type || 'basisweken';
    const isOntwikkelweken = type === 'ontwikkelweken';
    document.getElementById('edit-vak-type-toggle').checked = isOntwikkelweken;
    document.getElementById('edit-vak-type-value').value = type;

    // Update type toggle labels
    const typeLabels = document.querySelectorAll('.edit-vak-type-label');
    typeLabels[0].classList.toggle('active', !isOntwikkelweken);
    typeLabels[1].classList.toggle('active', isOntwikkelweken);

    // Update type hint
    const eenhedenLabel = document.getElementById('edit-eenheden-label');
    if (eenhedenLabel) {
        eenhedenLabel.textContent = isOntwikkelweken ? 'Aantal eenheden per ontwikkelweek' : 'Aantal eenheden per basisweek';
    }

    // Set splitsbaar toggle
    const isSplitsbaar = vak.splitsbaar !== false;
    document.getElementById('edit-vak-splitsbaar-toggle').checked = !isSplitsbaar;
    document.getElementById('edit-vak-splitsbaar-value').value = isSplitsbaar ? 'true' : 'false';

    // Update splitsbaar toggle labels
    const splitsbaarLabels = document.querySelectorAll('.edit-splitsbaar-label');
    splitsbaarLabels[0].classList.toggle('active', isSplitsbaar);
    splitsbaarLabels[1].classList.toggle('active', !isSplitsbaar);

    // Update splitsbaar hint
    const splitsbaarHint = document.getElementById('edit-splitsbaar-hint');
    if (splitsbaarHint) {
        splitsbaarHint.textContent = isSplitsbaar ? 'Docenten kunnen eenheden selecteren' : 'Docenten kunnen alleen alle eenheden tegelijk selecteren';
    }

    // Show/hide containers based on type
    const periodesContainer = document.getElementById('edit-periodes-container');
    const owContainer = document.getElementById('edit-ow-container');
    if (isOntwikkelweken) {
        periodesContainer.style.display = 'none';
        owContainer.style.display = 'block';
    } else {
        periodesContainer.style.display = 'block';
        owContainer.style.display = 'none';
    }

    // Fill periode values
    if (vak.periodes) {
        document.getElementById('edit-vak-p1').value = vak.periodes[1] || 0;
        document.getElementById('edit-vak-p2').value = vak.periodes[2] || 0;
        document.getElementById('edit-vak-p3').value = vak.periodes[3] || 0;
        document.getElementById('edit-vak-p4').value = vak.periodes[4] || 0;
    }

    // Fill OW values
    if (vak.ontwikkelweken) {
        for (let i = 1; i <= 8; i++) {
            document.getElementById(`edit-vak-ow${i}`).value = vak.ontwikkelweken[i] || 0;
        }
    }

    // Show modal
    document.getElementById('edit-vak-modal').style.display = 'flex';
}

function closeEditVakModal() {
    document.getElementById('edit-vak-modal').style.display = 'none';
}

function saveEditVak() {
    const vakId = document.getElementById('edit-vak-id').value;
    const vak = state.vakken.find(v => v.id === vakId);
    if (!vak) {
        closeEditVakModal();
        return;
    }

    const type = document.getElementById('edit-vak-type-value').value;

    // Update vak properties
    vak.naam = document.getElementById('edit-vak-naam').value.trim();
    vak.kleur = document.getElementById('edit-vak-kleur').value;
    vak.opslagfactor = parseInt(document.getElementById('edit-vak-opslagfactor').value) || 40;
    vak.splitsbaar = document.getElementById('edit-vak-splitsbaar-value').value === 'true';
    vak.type = type;

    if (type === 'ontwikkelweken') {
        vak.ontwikkelweken = {
            1: parseInt(document.getElementById('edit-vak-ow1').value) || 0,
            2: parseInt(document.getElementById('edit-vak-ow2').value) || 0,
            3: parseInt(document.getElementById('edit-vak-ow3').value) || 0,
            4: parseInt(document.getElementById('edit-vak-ow4').value) || 0,
            5: parseInt(document.getElementById('edit-vak-ow5').value) || 0,
            6: parseInt(document.getElementById('edit-vak-ow6').value) || 0,
            7: parseInt(document.getElementById('edit-vak-ow7').value) || 0,
            8: parseInt(document.getElementById('edit-vak-ow8').value) || 0
        };
        vak.periodes = null;
    } else {
        vak.periodes = {
            1: parseInt(document.getElementById('edit-vak-p1').value) || 0,
            2: parseInt(document.getElementById('edit-vak-p2').value) || 0,
            3: parseInt(document.getElementById('edit-vak-p3').value) || 0,
            4: parseInt(document.getElementById('edit-vak-p4').value) || 0
        };
        vak.ontwikkelweken = null;
    }

    saveToLocalStorage();
    renderVakkenLijst();
    closeEditVakModal();
}

function initEditVakForm() {
    const form = document.getElementById('form-edit-vak');
    if (!form) return;

    const periodesContainer = document.getElementById('edit-periodes-container');
    const owContainer = document.getElementById('edit-ow-container');

    // Type toggle handling
    const typeToggle = document.getElementById('edit-vak-type-toggle');
    const typeValue = document.getElementById('edit-vak-type-value');
    const typeLabels = document.querySelectorAll('.edit-vak-type-label');
    const eenhedenLabel = document.getElementById('edit-eenheden-label');

    function updateEditTypeState(isOntwikkelweken) {
        if (isOntwikkelweken) {
            typeValue.value = 'ontwikkelweken';
            typeLabels[0].classList.remove('active');
            typeLabels[1].classList.add('active');
            periodesContainer.style.display = 'none';
            owContainer.style.display = 'block';
            if (eenhedenLabel) eenhedenLabel.textContent = 'Aantal eenheden per ontwikkelweek';
        } else {
            typeValue.value = 'basisweken';
            typeLabels[0].classList.add('active');
            typeLabels[1].classList.remove('active');
            periodesContainer.style.display = 'block';
            owContainer.style.display = 'none';
            if (eenhedenLabel) eenhedenLabel.textContent = 'Aantal eenheden per basisweek';
        }
    }

    if (typeToggle) {
        typeToggle.addEventListener('change', () => {
            updateEditTypeState(typeToggle.checked);
        });
    }

    typeLabels.forEach(label => {
        label.addEventListener('click', () => {
            const isOntwikkelweken = label.dataset.value === 'ontwikkelweken';
            typeToggle.checked = isOntwikkelweken;
            updateEditTypeState(isOntwikkelweken);
        });
    });

    // Splitsbaar toggle handling
    const splitsbaarToggle = document.getElementById('edit-vak-splitsbaar-toggle');
    const splitsbaarValue = document.getElementById('edit-vak-splitsbaar-value');
    const splitsbaarLabels = document.querySelectorAll('.edit-splitsbaar-label');
    const splitsbaarHint = document.getElementById('edit-splitsbaar-hint');

    function updateEditSplitsbaarState(isNietSplitsbaar) {
        if (isNietSplitsbaar) {
            splitsbaarValue.value = 'false';
            splitsbaarLabels[0].classList.remove('active');
            splitsbaarLabels[1].classList.add('active');
            if (splitsbaarHint) splitsbaarHint.textContent = 'Docenten kunnen alleen alle eenheden tegelijk selecteren';
        } else {
            splitsbaarValue.value = 'true';
            splitsbaarLabels[0].classList.add('active');
            splitsbaarLabels[1].classList.remove('active');
            if (splitsbaarHint) splitsbaarHint.textContent = 'Docenten kunnen eenheden selecteren';
        }
    }

    if (splitsbaarToggle) {
        splitsbaarToggle.addEventListener('change', () => {
            updateEditSplitsbaarState(splitsbaarToggle.checked);
        });
    }

    splitsbaarLabels.forEach(label => {
        label.addEventListener('click', () => {
            const isNietSplitsbaar = label.dataset.value === 'niet-splitsbaar';
            splitsbaarToggle.checked = isNietSplitsbaar;
            updateEditSplitsbaarState(isNietSplitsbaar);
        });
    });

    // Form submit handler
    form.addEventListener('submit', (e) => {
        e.preventDefault();

        const vakId = document.getElementById('edit-vak-id').value;
        const vak = state.vakken.find(v => v.id === vakId);
        if (!vak) return;

        const type = document.getElementById('edit-vak-type-value').value;

        // Update vak properties
        vak.naam = document.getElementById('edit-vak-naam').value.trim();
        vak.kleur = document.getElementById('edit-vak-kleur').value;
        vak.opslagfactor = parseInt(document.getElementById('edit-vak-opslagfactor').value) || 40;
        vak.splitsbaar = document.getElementById('edit-vak-splitsbaar-value').value === 'true';
        vak.type = type;

        if (type === 'ontwikkelweken') {
            vak.ontwikkelweken = {
                1: parseInt(document.getElementById('edit-vak-ow1').value) || 0,
                2: parseInt(document.getElementById('edit-vak-ow2').value) || 0,
                3: parseInt(document.getElementById('edit-vak-ow3').value) || 0,
                4: parseInt(document.getElementById('edit-vak-ow4').value) || 0,
                5: parseInt(document.getElementById('edit-vak-ow5').value) || 0,
                6: parseInt(document.getElementById('edit-vak-ow6').value) || 0,
                7: parseInt(document.getElementById('edit-vak-ow7').value) || 0,
                8: parseInt(document.getElementById('edit-vak-ow8').value) || 0
            };
            vak.periodes = null;
        } else {
            vak.periodes = {
                1: parseInt(document.getElementById('edit-vak-p1').value) || 0,
                2: parseInt(document.getElementById('edit-vak-p2').value) || 0,
                3: parseInt(document.getElementById('edit-vak-p3').value) || 0,
                4: parseInt(document.getElementById('edit-vak-p4').value) || 0
            };
            vak.ontwikkelweken = null;
        }

        saveToLocalStorage();
        renderVakkenLijst();
        // Close modal explicitly
        document.getElementById('edit-vak-modal').style.display = 'none';
    });
}


// ============================================
// DOCENTEN
// ============================================

function initDocentenForm() {
    // Form removed - user management now centralized in Admin Panel
}

function addDocent(naam, aanstellingBruto = 1.0, inhouding = 0) {
    // Legacy function - create user via Admin panel instead
    console.warn('Use Admin Panel to create new users/docenten');
}

// Update the "Beheerd door" text with admin names
async function updateAdminManagedBy() {
    const container = document.getElementById('admin-managed-by');
    if (!container) return;

    try {
        const { collection, getDocs } = window.firebaseFunctions;
        const db = window.firebaseDb;

        const usersSnapshot = await getDocs(collection(db, 'users'));
        const admins = [];

        usersSnapshot.forEach(doc => {
            const userData = doc.data();
            if (userData.rol === 'admin') {
                admins.push(userData.afkorting || userData.naam || 'Admin');
            }
        });

        if (admins.length > 0) {
            container.textContent = `Leden worden beheerd door: ${admins.join(', ')}`;
        } else {
            container.textContent = '';
        }
    } catch (error) {
        console.error('Error loading admin names:', error);
        container.textContent = '';
    }
}

function renderDocentenLijst() {
    const container = document.getElementById('docenten-lijst');

    // Update admin names in header
    updateAdminManagedBy();

    if (!state.docenten || state.docenten.length === 0) {
        container.innerHTML = '<p class="empty-state">Nog geen teamleden toegevoegd.</p>';
        return;
    }

    // Constants for FTE calculation
    const BESCHIKBAAR_PER_FTE = 1600; // 1659 - 59 uur deskundigheidsbevordering

    // Sort docenten by naam
    const sortedDocenten = [...state.docenten].sort((a, b) =>
        (a.naam || '').localeCompare(b.naam || '')
    );

    container.innerHTML = sortedDocenten.map(docent => {
        // Get FTE values with defaults for backward compatibility
        const brutoFTE = docent.aanstellingBruto ?? docent.aanstelling ?? 1.0;
        const inhouding = docent.inhouding ?? 0;

        // Calculations
        // Note: aanstelling calculated in syncUsersToDocentenState is already Netto
        // But for safety recap:
        const nettoFTE = Math.max(0, brutoFTE - inhouding);
        const beschikbareUren = nettoFTE * BESCHIKBAAR_PER_FTE;
        const onderwijsUren = beschikbareUren * 0.75;
        const takenUren = beschikbareUren * 0.25;

        // Display name handling
        const displayName = escapeHtml(docent.naam || docent.afkorting || 'Onbekend');
        const afkorting = displayName.substring(0, 3).toLowerCase();

        return `
            <div class="docent-card">
                <div class="docent-header">
                    <div class="docent-naam-container">
                        <span class="docent-afkorting-label">${afkorting}</span>
                        <div class="docent-naam-groot">${displayName}</div>
                    </div>
                    <!-- Actions removed: manage via Admin -->
                </div>
                <div class="docent-fte-grid">
                    <div class="fte-item">
                        <span class="fte-label">Bruto FTE</span>
                        <span class="fte-value">${brutoFTE.toFixed(2)}</span>
                    </div>
                    <div class="fte-item">
                        <span class="fte-label">Inhouding</span>
                        <span class="fte-value">${inhouding.toFixed(2)}</span>
                    </div>
                    <div class="fte-item highlight">
                        <span class="fte-label">Netto FTE</span>
                        <span class="fte-value">${nettoFTE.toFixed(2)}</span>
                    </div>
                    <div class="fte-item highlight">
                        <span class="fte-label">Beschikbaar</span>
                        <span class="fte-value">${beschikbareUren.toFixed(0)}u</span>
                    </div>
                </div>
                <div class="docent-verdeling">
                    <div class="verdeling-item onderwijs">
                        <span class="verdeling-label">75% 🎓</span>
                        <span class="verdeling-value">${onderwijsUren.toFixed(0)}u</span>
                    </div>
                    <div class="verdeling-item taken">
                        <span class="verdeling-label">25% ✅</span>
                        <span class="verdeling-value">${takenUren.toFixed(0)}u</span>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

function deleteDocent(docentId) {
    if (!confirm('Weet je zeker dat je dit teamlid wilt verwijderen? Alle toewijzingen worden ook verwijderd.')) {
        return;
    }
    state.docenten = state.docenten.filter(d => d.id !== docentId);
    state.toewijzingen = state.toewijzingen.filter(t => t.docentId !== docentId);
    saveToLocalStorage();
    renderDocentenLijst();
    updateDocentSelector();
}

function updateDocentSelector() {
    const selector = document.getElementById('select-docent');
    if (!selector) return;

    const sortedDocenten = [...state.docenten].sort((a, b) => (a.naam || '').localeCompare(b.naam || ''));

    // Get current user's docent ID
    const currentDocentId = getCurrentUserDocentId();

    // Build options without placeholder
    selector.innerHTML = sortedDocenten.map(d =>
        `<option value="${d.id}">${escapeHtml(d.naam)}</option>`
    ).join('');

    // Priority: current user FIRST (if no selection yet), then preserve existing selection
    let selectedId = null;

    if (!state.geselecteerdeDocent && currentDocentId) {
        // No selection yet: auto-select current user
        selectedId = currentDocentId;
    } else if (state.geselecteerdeDocent && sortedDocenten.some(d => d.id === state.geselecteerdeDocent)) {
        // Keep existing valid selection
        selectedId = state.geselecteerdeDocent;
    } else if (currentDocentId) {
        // Fallback to current user
        selectedId = currentDocentId;
    } else if (sortedDocenten.length > 0) {
        // Last resort: first in list
        selectedId = sortedDocenten[0].id;
    }

    if (selectedId) {
        selector.value = selectedId;
        state.geselecteerdeDocent = selectedId;
    }
}

// Edit Docent Functions
function editDocent(docentId) {
    const docent = state.docenten.find(d => d.id === docentId);
    if (!docent) return;

    document.getElementById('edit-docent-id').value = docent.id;
    document.getElementById('edit-docent-naam').value = docent.naam;
    document.getElementById('edit-docent-aanstelling').value = docent.aanstellingBruto ?? 1.0;
    document.getElementById('edit-docent-inhouding').value = docent.inhouding ?? 0;

    document.getElementById('edit-docent-modal').style.display = 'flex';
}

function closeEditDocentModal() {
    document.getElementById('edit-docent-modal').style.display = 'none';
}

function saveEditDocent() {
    const docentId = document.getElementById('edit-docent-id').value;
    const docent = state.docenten.find(d => d.id === docentId);
    if (!docent) return;

    docent.naam = document.getElementById('edit-docent-naam').value.trim();
    docent.aanstellingBruto = parseFloat(document.getElementById('edit-docent-aanstelling').value) || 1.0;
    docent.inhouding = parseFloat(document.getElementById('edit-docent-inhouding').value) || 0;

    saveToLocalStorage();
    renderDocentenLijst();
    updateDocentSelector();
}

// ============================================
// BLOKJES GENERATION
// ============================================

function generateAllBlokjes() {
    const blokjes = [];

    state.vakken.forEach(vak => {
        const totalClasses = vak.klassen ? vak.klassen.length : 0;
        const klassen = vak.klassen || [];

        klassen.forEach((klas, klasIndex) => {
            const tintedColor = getClassTintedColor(vak.kleur, klasIndex, totalClasses);

            if (vak.type === 'ontwikkelweken' && vak.ontwikkelweken) {
                // Generate blokjes for ontwikkelweken (OW1-OW8)
                [1, 2, 3, 4, 5, 6, 7, 8].forEach(ow => {
                    const count = vak.ontwikkelweken[ow] || 0;
                    // Map OW to parent period: OW1-2 = P1, OW3-4 = P2, etc.
                    const parentPeriode = Math.ceil(ow / 2);
                    for (let i = 1; i <= count; i++) {
                        blokjes.push({
                            id: `${vak.id}-${klas}-OW${ow}-${i}`,
                            vakId: vak.id,
                            vakNaam: vak.naam,
                            kleur: tintedColor,
                            baseKleur: vak.kleur,
                            klas: klas,
                            ontwikkelweek: ow,
                            parentPeriode: parentPeriode,
                            periode: `OW${ow}`,
                            nummer: i,
                            isOntwikkelweek: true
                        });
                    }
                });
            } else if (vak.periodes) {
                // Generate blokjes for basisweken (P1-P4)
                [1, 2, 3, 4].forEach(periode => {
                    const count = vak.periodes[periode] || 0;
                    for (let i = 1; i <= count; i++) {
                        blokjes.push({
                            id: `${vak.id}-${klas}-P${periode}-${i}`,
                            vakId: vak.id,
                            vakNaam: vak.naam,
                            kleur: tintedColor,
                            baseKleur: vak.kleur,
                            klas: klas,
                            periode: periode,
                            nummer: i,
                            isOntwikkelweek: false
                        });
                    }
                });
            }
        });
    });

    return blokjes;
}

function getAvailableBlokjes() {
    const allBlokjes = generateAllBlokjes();
    const toegewezenIds = new Set(state.toewijzingen.map(t => t.blokjeId));
    return allBlokjes.filter(b => !toegewezenIds.has(b.id));
}

function getBlokjesForDocent(docentId) {
    return state.toewijzingen
        .filter(t => t.docentId === docentId)
        .map(t => {
            const allBlokjes = generateAllBlokjes();
            const blokje = allBlokjes.find(b => b.id === t.blokjeId);
            return blokje ? { ...blokje, toewijzingPeriode: t.periode } : null;
        })
        .filter(b => b !== null);
}

// ============================================
// KLASSEN VIEW
// ============================================

let klassenState = {
    geselecteerdeDocent: null,
    geselecteerdLeerjaar: null,
    geselecteerdeKlas: null
};

function initKlassenView() {
    const docentSelect = document.getElementById('klassen-docent');
    const leerjaarSelect = document.getElementById('klassen-leerjaar');
    const klasSelect = document.getElementById('klassen-klas');

    docentSelect.addEventListener('change', () => {
        klassenState.geselecteerdeDocent = docentSelect.value || null;
        renderKlassenCurriculum();
    });

    leerjaarSelect.addEventListener('change', () => {
        klassenState.geselecteerdLeerjaar = leerjaarSelect.value || null;
        updateKlassenKlasSelector();
        klassenState.geselecteerdeKlas = null;
        renderKlassenCurriculum();
    });

    klasSelect.addEventListener('change', () => {
        klassenState.geselecteerdeKlas = klasSelect.value || null;
        renderKlassenCurriculum();
    });
}

function renderKlassenView() {
    updateKlassenDocentSelector();
    updateKlassenLeerjaarSelector();
    renderKlassenCurriculum();
}

function updateKlassenDocentSelector() {
    const selector = document.getElementById('klassen-docent');
    const sortedDocenten = [...state.docenten].sort((a, b) => (a.naam || '').localeCompare(b.naam || ''));

    // Auto-select current user if no selection yet
    const currentDocentId = getCurrentUserDocentId();
    if (!klassenState.geselecteerdeDocent && currentDocentId) {
        klassenState.geselecteerdeDocent = currentDocentId;
    }

    // Build options without placeholder
    selector.innerHTML = sortedDocenten.map(d =>
        `<option value="${d.id}" ${klassenState.geselecteerdeDocent === d.id ? 'selected' : ''}>${escapeHtml(d.naam)}</option>`
    ).join('');

    // If still nothing selected and there are docenten, select first
    if (!klassenState.geselecteerdeDocent && sortedDocenten.length > 0) {
        klassenState.geselecteerdeDocent = sortedDocenten[0].id;
        selector.value = sortedDocenten[0].id;
    }
}

function updateKlassenLeerjaarSelector() {
    const selector = document.getElementById('klassen-leerjaar');
    selector.innerHTML = '<option value="">-- Selecteer leerjaar --</option>' +
        state.leerjaren.map(lj => `<option value="${escapeHtml(lj.naam)}" ${klassenState.geselecteerdLeerjaar === lj.naam ? 'selected' : ''}>${escapeHtml(lj.naam)}</option>`).join('');
}

function updateKlassenKlasSelector() {
    const selector = document.getElementById('klassen-klas');

    if (!klassenState.geselecteerdLeerjaar) {
        selector.innerHTML = '<option value="">-- Selecteer eerst leerjaar --</option>';
        selector.disabled = true;
        return;
    }

    const leerjaar = state.leerjaren.find(l => l.naam === klassenState.geselecteerdLeerjaar);
    if (!leerjaar) {
        selector.innerHTML = '<option value="">-- Geen klassen --</option>';
        selector.disabled = true;
        return;
    }

    selector.disabled = false;
    selector.innerHTML = '<option value="">-- Selecteer klas --</option>' +
        leerjaar.klassen.map(k => `<option value="${k}" ${klassenState.geselecteerdeKlas === k ? 'selected' : ''}>${k}</option>`).join('');
}

function renderKlassenCurriculum() {
    const container = document.getElementById('klassen-curriculum-grid');
    const titel = document.getElementById('klassen-klas-titel');
    const leerjaarTitel = document.getElementById('klassen-leerjaar-titel');

    if (!klassenState.geselecteerdeDocent || !klassenState.geselecteerdLeerjaar || !klassenState.geselecteerdeKlas) {
        container.innerHTML = '<p class="empty-state">Selecteer een teamlid, leerjaar en klas om het curriculum te zien</p>';
        titel.textContent = '';
        leerjaarTitel.textContent = '';
        return;
    }

    // Get vakken for this leerjaar, split by type
    const alleVakken = state.vakken.filter(v => v.leerjaar === klassenState.geselecteerdLeerjaar);
    const basisVakken = alleVakken.filter(v => v.type !== 'ontwikkelweken' && v.periodes);
    const owVakken = alleVakken.filter(v => v.type === 'ontwikkelweken' && v.ontwikkelweken);

    // Calculate progress for the entire year (all classes)
    let totalUnitsYear = 0;
    let assignedUnitsYear = 0;
    alleVakken.forEach(vak => {
        const klassen = vak.klassen || [];
        klassen.forEach(klas => {
            if (vak.type === 'ontwikkelweken' && vak.ontwikkelweken) {
                [1, 2, 3, 4, 5, 6, 7, 8].forEach(ow => {
                    const count = vak.ontwikkelweken[ow] || 0;
                    totalUnitsYear += count;
                    for (let i = 1; i <= count; i++) {
                        const blokjeId = `${vak.id}-${klas}-OW${ow}-${i}`;
                        if (state.toewijzingen.some(t => t.blokjeId === blokjeId)) assignedUnitsYear++;
                    }
                });
            } else if (vak.periodes) {
                [1, 2, 3, 4].forEach(p => {
                    const count = vak.periodes[p] || 0;
                    totalUnitsYear += count;
                    for (let i = 1; i <= count; i++) {
                        const blokjeId = `${vak.id}-${klas}-P${p}-${i}`;
                        if (state.toewijzingen.some(t => t.blokjeId === blokjeId)) assignedUnitsYear++;
                    }
                });
            }
        });
    });

    // Calculate progress for selected class only
    let totalUnitsClass = 0;
    let assignedUnitsClass = 0;
    alleVakken.forEach(vak => {
        const klassen = vak.klassen || [];
        if (!klassen.includes(klassenState.geselecteerdeKlas)) return;
        if (vak.type === 'ontwikkelweken' && vak.ontwikkelweken) {
            [1, 2, 3, 4, 5, 6, 7, 8].forEach(ow => {
                const count = vak.ontwikkelweken[ow] || 0;
                totalUnitsClass += count;
                for (let i = 1; i <= count; i++) {
                    const blokjeId = `${vak.id}-${klassenState.geselecteerdeKlas}-OW${ow}-${i}`;
                    if (state.toewijzingen.some(t => t.blokjeId === blokjeId)) assignedUnitsClass++;
                }
            });
        } else if (vak.periodes) {
            [1, 2, 3, 4].forEach(p => {
                const count = vak.periodes[p] || 0;
                totalUnitsClass += count;
                for (let i = 1; i <= count; i++) {
                    const blokjeId = `${vak.id}-${klassenState.geselecteerdeKlas}-P${p}-${i}`;
                    if (state.toewijzingen.some(t => t.blokjeId === blokjeId)) assignedUnitsClass++;
                }
            });
        }
    });

    const yearPct = totalUnitsYear > 0 ? Math.round((assignedUnitsYear / totalUnitsYear) * 100) : 0;
    const classPct = totalUnitsClass > 0 ? Math.round((assignedUnitsClass / totalUnitsClass) * 100) : 0;

    leerjaarTitel.innerHTML = `<span style="color:var(--accent-primary)">${klassenState.geselecteerdLeerjaar}</span> <span style="color:#ffe9a0;font-size:0.7rem">(${yearPct}% verdeeld)</span>`;
    titel.innerHTML = `<span style="color:var(--accent-primary)">${escapeHtml(klassenState.geselecteerdeKlas)}</span> <span style="color:#ffe9a0;font-size:0.7rem">(${classPct}% verdeeld)</span>`;

    if (alleVakken.length === 0) {
        container.innerHTML = '<p class="empty-state">Geen lessen voor dit leerjaar</p>';
        return;
    }

    // Generate HTML: 4 rows (one per periode), 3 columns (Basisweken | OW-A | OW-B)
    container.innerHTML = [1, 2, 3, 4].map(periode => {
        const ow1 = (periode - 1) * 2 + 1;  // OW1, OW3, OW5, OW7
        const ow2 = (periode - 1) * 2 + 2;  // OW2, OW4, OW6, OW8

        const basisVakkenMetPeriode = basisVakken.filter(v => (v.periodes[periode] || 0) > 0);
        const owVakkenMetOW1 = owVakken.filter(v => (v.ontwikkelweken[ow1] || 0) > 0);
        const owVakkenMetOW2 = owVakken.filter(v => (v.ontwikkelweken[ow2] || 0) > 0);
        // Calculate lesuren per class for this period (for the selected docent) - ALL LEERJAREN
        const lesuurPerKlas = {};

        // Calculate for basisweken - all vakken across all leerjaren
        state.vakken.filter(v => v.type !== 'ontwikkelweken' && v.periodes && (v.periodes[periode] || 0) > 0).forEach(vak => {
            const count = vak.periodes[periode] || 0;
            const klassen = vak.klassen || [];
            klassen.forEach(klas => {
                for (let i = 1; i <= count; i++) {
                    const blokjeId = `${vak.id}-${klas}-P${periode}-${i}`;
                    const toewijzing = state.toewijzingen.find(t => t.blokjeId === blokjeId && t.docentId === klassenState.geselecteerdeDocent);
                    if (toewijzing) {
                        if (!lesuurPerKlas[klas]) lesuurPerKlas[klas] = { basis: 0, ow1: 0, ow2: 0 };
                        lesuurPerKlas[klas].basis += 0.5; // 1 eenheid = 0.5 klokuur
                    }
                }
            });
        });

        // Calculate for OW1 - all vakken across all leerjaren
        state.vakken.filter(v => v.type === 'ontwikkelweken' && v.ontwikkelweken && (v.ontwikkelweken[ow1] || 0) > 0).forEach(vak => {
            const count = vak.ontwikkelweken[ow1] || 0;
            const klassen = vak.klassen || [];
            klassen.forEach(klas => {
                for (let i = 1; i <= count; i++) {
                    const blokjeId = `${vak.id}-${klas}-OW${ow1}-${i}`;
                    const toewijzing = state.toewijzingen.find(t => t.blokjeId === blokjeId && t.docentId === klassenState.geselecteerdeDocent);
                    if (toewijzing) {
                        if (!lesuurPerKlas[klas]) lesuurPerKlas[klas] = { basis: 0, ow1: 0, ow2: 0 };
                        lesuurPerKlas[klas].ow1 += 0.5;
                    }
                }
            });
        });

        // Calculate for OW2 - all vakken across all leerjaren
        state.vakken.filter(v => v.type === 'ontwikkelweken' && v.ontwikkelweken && (v.ontwikkelweken[ow2] || 0) > 0).forEach(vak => {
            const count = vak.ontwikkelweken[ow2] || 0;
            const klassen = vak.klassen || [];
            klassen.forEach(klas => {
                for (let i = 1; i <= count; i++) {
                    const blokjeId = `${vak.id}-${klas}-OW${ow2}-${i}`;
                    const toewijzing = state.toewijzingen.find(t => t.blokjeId === blokjeId && t.docentId === klassenState.geselecteerdeDocent);
                    if (toewijzing) {
                        if (!lesuurPerKlas[klas]) lesuurPerKlas[klas] = { basis: 0, ow1: 0, ow2: 0 };
                        lesuurPerKlas[klas].ow2 += 0.5;
                    }
                }
            });
        });

        // Calculate totals
        let totaalBasis = 0, totaalOw1 = 0, totaalOw2 = 0;
        Object.values(lesuurPerKlas).forEach(v => {
            totaalBasis += v.basis;
            totaalOw1 += v.ow1;
            totaalOw2 += v.ow2;
        });

        const klassenRows = Object.keys(lesuurPerKlas).sort().map(klas => {
            const v = lesuurPerKlas[klas];
            return `<div class="uren-mini-row"><span>${escapeHtml(klas)}</span><span>${v.basis.toFixed(1)}</span><span>${v.ow1.toFixed(1)}</span><span>${v.ow2.toFixed(1)}</span></div>`;
        }).join('');

        return `
            <div class="periode-row">
                <div class="periode-section basisweken-section">
                    <div class="periode-section-header">
                        <h4>📚 Periode ${periode}</h4>
                    </div>
                    ${renderVakSections(basisVakkenMetPeriode, periode, 'P')}
                    ${basisVakkenMetPeriode.length === 0 ? '<p class="empty-state" style="font-size:0.75rem">Geen lessen</p>' : ''}
                </div>
                <div class="periode-section ow-section">
                    <div class="periode-section-header">
                        <h4>⭐ Ontwikkelweek ${ow1}</h4>
                    </div>
                    ${renderVakSectionsOW(owVakkenMetOW1, ow1)}
                    ${owVakkenMetOW1.length === 0 ? '<p class="empty-state" style="font-size:0.75rem">Geen lessen</p>' : ''}
                </div>
                <div class="periode-section ow-section">
                    <div class="periode-section-header">
                        <h4>⭐ Ontwikkelweek ${ow2}</h4>
                    </div>
                    ${renderVakSectionsOW(owVakkenMetOW2, ow2)}
                    ${owVakkenMetOW2.length === 0 ? '<p class="empty-state" style="font-size:0.75rem">Geen lessen</p>' : ''}
                </div>
                <div class="periode-section lesuren-section">
                    <div class="periode-section-header">
                        <h4>🕐 Lesuren per week <small style="font-weight:normal;color:var(--text-muted)">(in klokuren)</small></h4>
                    </div>
                    <div class="lesuren-tabel">
                        <div class="uren-mini-header"><span>Klas</span><span>Basis</span><span>OW${ow1}</span><span>OW${ow2}</span></div>
                        ${klassenRows || '<div class="uren-mini-row empty-state" style="font-size:0.75rem">Geen selecties</div>'}
                        <div class="uren-mini-subtotal"><span>Totaal</span><span>${totaalBasis.toFixed(1)}</span><span>${totaalOw1.toFixed(1)}</span><span>${totaalOw2.toFixed(1)}</span></div>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

function renderVakSections(vakken, periode, prefix) {
    return vakken.map(vak => {
        const count = vak.periodes[periode] || 0;
        const { allAvailableMine, someMine } = checkVakSelectionState(vak, `${prefix}${periode}`, count);

        return `
            <div class="vak-section">
                <div class="vak-section-header">
                    <span class="vak-section-color" style="background: ${vak.kleur}"></span>
                    <span class="vak-section-naam">${escapeHtml(vak.naam)}</span>
                    <label class="select-all-label" title="Alles selecteren/deselecteren">
                        <input type="checkbox" 
                               class="select-all-checkbox" 
                               ${allAvailableMine ? 'checked' : ''} 
                               ${someMine ? 'data-indeterminate="true"' : ''}
                               onchange="toggleAllVakLeseenheden('${vak.id}', '${prefix}${periode}', this.checked)">
                        <span>${vak.splitsbaar !== false ? 'alles' : 'selecteer'}</span>
                    </label>
                </div>
                <div class="leseenheid-checkboxes">
                    ${renderLeseenheidCheckboxes(vak, `${prefix}${periode}`, count)}
                </div>
            </div>
        `;
    }).join('');
}

function renderVakSectionsOW(vakken, ow) {
    return vakken.map(vak => {
        const count = vak.ontwikkelweken[ow] || 0;
        const { allAvailableMine, someMine } = checkVakSelectionState(vak, `OW${ow}`, count);

        return `
            <div class="vak-section">
                <div class="vak-section-header">
                    <span class="vak-section-color" style="background: ${vak.kleur}"></span>
                    <span class="vak-section-naam">${escapeHtml(vak.naam)}</span>
                    <label class="select-all-label" title="Alles selecteren/deselecteren">
                        <input type="checkbox" 
                               class="select-all-checkbox" 
                               ${allAvailableMine ? 'checked' : ''} 
                               ${someMine ? 'data-indeterminate="true"' : ''}
                               onchange="toggleAllVakLeseenheden('${vak.id}', 'OW${ow}', this.checked)">
                        <span>${vak.splitsbaar !== false ? 'alles' : 'selecteer'}</span>
                    </label>
                </div>
                <div class="leseenheid-checkboxes">
                    ${renderLeseenheidCheckboxes(vak, `OW${ow}`, count)}
                </div>
            </div>
        `;
    }).join('');
}

function checkVakSelectionState(vak, periodeKey, count) {
    let mineCount = 0;
    let availableCount = 0;

    for (let num = 1; num <= count; num++) {
        const blokjeId = `${vak.id}-${klassenState.geselecteerdeKlas}-${periodeKey}-${num}`;
        const toewijzing = state.toewijzingen.find(t => t.blokjeId === blokjeId);
        if (toewijzing && toewijzing.docentId === klassenState.geselecteerdeDocent) {
            mineCount++;
            availableCount++;
        } else if (toewijzing) {
            // taken by others
        } else {
            availableCount++;
        }
    }

    return {
        allAvailableMine: mineCount === availableCount && availableCount > 0,
        someMine: mineCount > 0 && mineCount < availableCount
    };
}

function renderLeseenheidCheckboxes(vak, periodeKey, count) {
    return Array.from({ length: count }, (_, i) => i + 1).map(num => {
        const blokjeId = `${vak.id}-${klassenState.geselecteerdeKlas}-${periodeKey}-${num}`;
        const toewijzing = state.toewijzingen.find(t => t.blokjeId === blokjeId);
        const isMine = toewijzing && toewijzing.docentId === klassenState.geselecteerdeDocent;
        const isTaken = toewijzing && toewijzing.docentId !== klassenState.geselecteerdeDocent;
        const takenByDocent = isTaken ? state.docenten.find(d => d.id === toewijzing.docentId)?.naam : '';
        const isNonSplitsbaar = vak.splitsbaar === false;

        let className = 'leseenheid-checkbox';
        if (isMine) className += ' mine';
        if (isTaken) className += ' taken';
        if (isNonSplitsbaar && !isTaken && !isMine) className += ' locked';

        // Click handler logic:
        // - Splittable lessons: always clickable
        // - Non-splittable lessons: show alert if taken by others, otherwise no action (use checkbox)
        let clickHandler = '';
        if (!isNonSplitsbaar) {
            clickHandler = `toggleLeseenheid('${blokjeId}', '${periodeKey}')`;
        } else if (isTaken) {
            clickHandler = `alert('Deze leseenheid is al geselecteerd door ${escapeHtml(takenByDocent || 'een andere docent')}')`;
        }

        return `<div class="${className}" 
                    data-blokje-id="${blokjeId}"
                    data-periode="${periodeKey}"
                    ${isTaken ? `data-docent="${escapeHtml(takenByDocent)}"` : ''}
                    onclick="${clickHandler}">${num}</div>`;
    }).join('');
}

function toggleLeseenheid(blokjeId, periodeKey) {
    if (!klassenState.geselecteerdeDocent) {
        alert('Selecteer eerst een docent');
        return;
    }

    // Check if user can edit (teamlid can only edit own data)
    if (!canUserEdit(klassenState.geselecteerdeDocent)) {
        alert('Je kunt alleen je eigen toewijzingen wijzigen');
        return;
    }

    const existing = state.toewijzingen.find(t => t.blokjeId === blokjeId && t.docentId === klassenState.geselecteerdeDocent);
    const takenByOther = state.toewijzingen.find(t => t.blokjeId === blokjeId && t.docentId !== klassenState.geselecteerdeDocent);

    if (takenByOther) {
        const docent = state.docenten.find(d => d.id === takenByOther.docentId);
        alert(`Deze leseenheid is al geselecteerd door ${docent?.naam || 'een andere docent'}`);
        return;
    }

    if (existing) {
        // Remove toewijzing
        state.toewijzingen = state.toewijzingen.filter(t => !(t.blokjeId === blokjeId && t.docentId === klassenState.geselecteerdeDocent));
    } else {
        // Add toewijzing
        state.toewijzingen.push({
            blokjeId,
            docentId: klassenState.geselecteerdeDocent,
            periode: periodeKey
        });
    }

    saveToLocalStorage();
    renderKlassenCurriculum();
}

function toggleAllVakLeseenheden(vakId, periodeKey, selectAll) {
    if (!klassenState.geselecteerdeDocent) {
        alert('Selecteer eerst een docent');
        return;
    }

    // Check if user can edit (teamlid can only edit own data)
    if (!canUserEdit(klassenState.geselecteerdeDocent)) {
        alert('Je kunt alleen je eigen toewijzingen wijzigen');
        renderKlassenCurriculum(); // Reset checkbox state
        return;
    }

    const vak = state.vakken.find(v => v.id === vakId);
    if (!vak) return;

    const isSplitsbaar = vak.splitsbaar !== false; // Default is splitsbaar

    // Determine count based on periodeKey (P1-P4 or OW1-OW8)
    let count = 0;
    if (periodeKey.startsWith('OW')) {
        const owNum = parseInt(periodeKey.substring(2));
        count = vak.ontwikkelweken ? (vak.ontwikkelweken[owNum] || 0) : 0;
    } else {
        const pNum = parseInt(periodeKey.substring(1));
        count = vak.periodes ? (vak.periodes[pNum] || 0) : 0;
    }

    // For non-splittable: check first if ANY unit is taken by someone else
    if (!isSplitsbaar && selectAll) {
        for (let num = 1; num <= count; num++) {
            const blokjeId = `${vakId}-${klassenState.geselecteerdeKlas}-${periodeKey}-${num}`;
            const takenByOther = state.toewijzingen.find(t => t.blokjeId === blokjeId && t.docentId !== klassenState.geselecteerdeDocent);
            if (takenByOther) {
                const docent = state.docenten.find(d => d.id === takenByOther.docentId);
                alert(`Deze leseenheid is al geselecteerd door ${docent?.naam || 'een andere docent'}`);
                // Revert checkbox state by re-rendering
                renderKlassenCurriculum();
                return;
            }
        }
    }

    for (let num = 1; num <= count; num++) {
        const blokjeId = `${vakId}-${klassenState.geselecteerdeKlas}-${periodeKey}-${num}`;
        const existing = state.toewijzingen.find(t => t.blokjeId === blokjeId && t.docentId === klassenState.geselecteerdeDocent);
        const takenByOther = state.toewijzingen.find(t => t.blokjeId === blokjeId && t.docentId !== klassenState.geselecteerdeDocent);

        if (takenByOther) {
            // For splittable: skip silently. For non-splittable: already handled above
            continue;
        }

        if (selectAll && !existing) {
            // Add toewijzing
            state.toewijzingen.push({
                blokjeId,
                docentId: klassenState.geselecteerdeDocent,
                periode: periodeKey
            });
        } else if (!selectAll && existing) {
            // Remove toewijzing
            state.toewijzingen = state.toewijzingen.filter(t => !(t.blokjeId === blokjeId && t.docentId === klassenState.geselecteerdeDocent));
        }
    }

    saveToLocalStorage();
    renderKlassenCurriculum();
}

// Make toggle functions globally available
window.toggleLeseenheid = toggleLeseenheid;
window.toggleAllVakLeseenheden = toggleAllVakLeseenheden;

// ============================================
// TAKEN VIEW (Docent Task Selection)
// ============================================

let takenViewState = {
    geselecteerdeDocent: null
};

function initTakenView() {
    const docentSelect = document.getElementById('taken-docent');
    if (!docentSelect) return;

    docentSelect.addEventListener('change', () => {
        takenViewState.geselecteerdeDocent = docentSelect.value || null;
        renderTakenSelectie();
    });
}

function updateTakenDocentSelector() {
    const selector = document.getElementById('taken-docent');
    if (!selector) return;

    const sortedDocenten = [...state.docenten].sort((a, b) => (a.naam || '').localeCompare(b.naam || ''));

    // Auto-select current user if no selection yet
    const currentDocentId = getCurrentUserDocentId();
    if (!takenViewState.geselecteerdeDocent && currentDocentId) {
        takenViewState.geselecteerdeDocent = currentDocentId;
    }

    // Build options without placeholder
    selector.innerHTML = sortedDocenten.map(d =>
        `<option value="${d.id}" ${takenViewState.geselecteerdeDocent === d.id ? 'selected' : ''}>${escapeHtml(d.naam)}</option>`
    ).join('');

    // If still nothing selected and there are docenten, select first
    if (!takenViewState.geselecteerdeDocent && sortedDocenten.length > 0) {
        takenViewState.geselecteerdeDocent = sortedDocenten[0].id;
        selector.value = sortedDocenten[0].id;
    }
}

function renderTakenSelectie() {
    const container = document.getElementById('taken-selectie-grid');
    if (!container) return;

    updateTakenDocentSelector();

    if (!takenViewState.geselecteerdeDocent) {
        container.innerHTML = '<p class="empty-state">Selecteer een teamlid om taken te zien</p>';
        return;
    }

    if (state.taken.length === 0) {
        container.innerHTML = '<p class="empty-state">Nog geen taken aangemaakt in Takenbeheer</p>';
        return;
    }
    // Sort tasks alphabetically
    const sortedTaken = [...state.taken].sort((a, b) => a.naam.localeCompare(b.naam, 'nl'));

    container.innerHTML = sortedTaken.map(taak => {
        const totaalUren = Object.values(taak.urenPerPeriode).reduce((a, b) => a + b, 0);
        const isVoorIedereen = taak.voorIedereen;

        // Check if this docent has selected this task
        const docentTaak = state.docentTaken.find(dt =>
            dt.docentId === takenViewState.geselecteerdeDocent &&
            dt.taakId === taak.id
        );
        const isSelected = !!docentTaak || isVoorIedereen;

        // Get ALL docents who selected this task (including current user if selected)
        const alleDocentenDieTaakHebben = state.docentTaken
            .filter(dt => dt.taakId === taak.id)
            .map(dt => {
                const docent = state.docenten.find(d => d.id === dt.docentId);
                return { id: dt.docentId, naam: docent ? docent.naam : 'Onbekend' };
            });

        // Get other docents (excluding current user)
        const andereDocenten = alleDocentenDieTaakHebben
            .filter(d => d.id !== takenViewState.geselecteerdeDocent)
            .map(d => d.naam);

        const totaalAantalDocenten = alleDocentenDieTaakHebben.length;
        const isMaxOverschreden = taak.maxDocenten && totaalAantalDocenten > taak.maxDocenten;
        const overschrijding = isMaxOverschreden ? totaalAantalDocenten - taak.maxDocenten : 0;

        // Check exact docenten constraint
        const isExactVerkeerd = taak.exactDocenten && totaalAantalDocenten !== taak.exactDocenten;
        const exactVerschil = taak.exactDocenten ? totaalAantalDocenten - taak.exactDocenten : 0;

        // Build docenten text (only warnings and other docents info, not constraint info - that's in header)
        let docentenText = '';
        const alleNamen = alleDocentenDieTaakHebben.map(d => d.naam);

        if (isVoorIedereen) {
            // No extra text needed - shown in header
        } else if (alleNamen.length > 0) {
            if (isMaxOverschreden) {
                const teamlidText = overschrijding === 1 ? 'teamlid' : 'teamleden';
                docentenText = `⚠️ Geselecteerd door: <strong>${alleNamen.join(', ')}</strong> <span class="max-overschreden">(${overschrijding} ${teamlidText} te veel)</span>`;
            } else if (isExactVerkeerd && exactVerschil > 0) {
                const teamlidText = exactVerschil === 1 ? 'teamlid' : 'teamleden';
                docentenText = `⚠️ Geselecteerd door: <strong>${alleNamen.join(', ')}</strong> <span class="max-overschreden">(${exactVerschil} ${teamlidText} te veel)</span>`;
            } else if (isExactVerkeerd && exactVerschil < 0) {
                const tekort = Math.abs(exactVerschil);
                const teamlidText = tekort === 1 ? 'teamlid' : 'teamleden';
                docentenText = `⚠️ Geselecteerd door: <strong>${alleNamen.join(', ')}</strong> <span class="max-overschreden">(${tekort} ${teamlidText} te weinig)</span>`;
            } else {
                docentenText = `Geselecteerd door: <strong>${alleNamen.join(', ')}</strong>`;
            }
        }


        const kleur = taak.kleur || '#6366f1';

        // Build constraint text
        const constraints = [];
        if (isVoorIedereen) {
            constraints.push('voor alle teamleden');
        } else if (taak.exactDocenten) {
            constraints.push(`exact ${taak.exactDocenten} ${taak.exactDocenten === 1 ? 'teamlid' : 'teamleden'}`);
        } else if (taak.maxDocenten) {
            constraints.push(`max ${taak.maxDocenten} ${taak.maxDocenten === 1 ? 'teamlid' : 'teamleden'}`);
        }
        if (taak.naarRato) {
            constraints.push('naar rato');
        }
        const constraintText = constraints.length > 0
            ? ` <span class="max-docenten-info">(${constraints.join('; ')})</span>`
            : '';

        const itemClass = isVoorIedereen
            ? 'taak-selectie-item voor-iedereen'
            : isSelected
                ? 'taak-selectie-item selected'
                : 'taak-selectie-item';

        return `
            <div class="${itemClass}" 
                 data-taak-id="${taak.id}"
                 ${!isVoorIedereen ? `onclick="toggleTaakSelectie('${taak.id}')"` : ''}>
                <div class="taak-selectie-icon-wrapper">
                    <div class="taak-doc-icon taak-doc-icon-small" style="background: ${kleur}">
                        <div class="taak-doc-fold"></div>
                        <div class="taak-doc-lines">
                            <span></span><span></span><span></span>
                        </div>
                    </div>
                    <div class="taak-selectie-checkbox-overlay ${isSelected ? 'checked' : ''}">
                        ${isSelected ? '✓' : ''}
                    </div>
                </div>
                <div class="taak-selectie-info">
                    <div class="taak-selectie-header">
                        <span class="taak-selectie-naam">${escapeHtml(taak.naam)}${constraintText}</span>
                    </div>
                    <div class="taak-selectie-meta">
                        <span>⏱️ ${totaalUren.toFixed(1)}u totaal</span>
                        <span class="taak-periodes-inline">P1: ${taak.urenPerPeriode[1].toFixed(1)} • P2: ${taak.urenPerPeriode[2].toFixed(1)} • P3: ${taak.urenPerPeriode[3].toFixed(1)} • P4: ${taak.urenPerPeriode[4].toFixed(1)}</span>
                    </div>
                    ${docentenText ? `<div class="taak-selectie-docenten">${docentenText}</div>` : ''}
                </div>
            </div>
        `;
    }).join('');
}

function toggleTaakSelectie(taakId) {
    if (!takenViewState.geselecteerdeDocent) {
        alert('Selecteer eerst een docent');
        return;
    }

    // Check if user can edit (teamlid can only edit own data)
    if (!canUserEdit(takenViewState.geselecteerdeDocent)) {
        alert('Je kunt alleen je eigen taken wijzigen');
        return;
    }

    const taak = state.taken.find(t => t.id === taakId);
    if (!taak) return;

    // Don't allow toggling "voor iedereen" tasks
    if (taak.voorIedereen) return;

    const existingIndex = state.docentTaken.findIndex(dt =>
        dt.docentId === takenViewState.geselecteerdeDocent &&
        dt.taakId === taakId
    );

    if (existingIndex >= 0) {
        // Remove selection
        state.docentTaken.splice(existingIndex, 1);
    } else {
        // Add selection
        state.docentTaken.push({
            docentId: takenViewState.geselecteerdeDocent,
            taakId: taakId,
            periodes: { ...taak.urenPerPeriode }
        });
    }

    saveToLocalStorage();
    renderTakenSelectie();
}

// Make toggle function globally available
window.toggleTaakSelectie = toggleTaakSelectie;

function initVerdelingView() {
    const selector = document.getElementById('select-docent');
    selector.addEventListener('change', () => {
        state.geselecteerdeDocent = selector.value || null;
        renderVerdelingView();
    });
}

function renderVerdelingView() {
    const container = document.getElementById('mijn-overzicht-grid');

    if (!state.geselecteerdeDocent) {
        container.innerHTML = '<p class="empty-state">Selecteer een teamlid om je overzicht te zien</p>';
        // Also clear the taken grid
        const takenGrid = document.getElementById('taken-grid');
        if (takenGrid) {
            takenGrid.innerHTML = '<p class="empty-state">Selecteer een teamlid om taken te zien</p>';
        }
        // Remove totale inzet bar if it exists
        const existingTotaleInzet = document.querySelector('.totale-inzet-bar');
        if (existingTotaleInzet) {
            existingTotaleInzet.remove();
        }
        return;
    }

    const docent = state.docenten.find(d => d.id === state.geselecteerdeDocent);
    if (!docent) return;

    // Get all toewijzingen for this docent
    const mijnToewijzingen = state.toewijzingen.filter(t => t.docentId === state.geselecteerdeDocent);

    // Group by periode (P1-P4 and OW1-OW8)
    const grouped = {};
    mijnToewijzingen.forEach(t => {
        const pKey = t.periode.toString();
        if (!grouped[pKey]) grouped[pKey] = [];

        // Find blokje details
        const allBlokjes = generateAllBlokjes();
        const blokje = allBlokjes.find(b => b.id === t.blokjeId);
        if (blokje) {
            grouped[pKey].push(blokje);
        }
    });

    // Render in Klassen-style layout: 4 rows, 3 columns each
    container.innerHTML = [1, 2, 3, 4].map(periode => {
        const ow1 = (periode - 1) * 2 + 1;
        const ow2 = (periode - 1) * 2 + 2;

        const basisBlokjes = grouped[`P${periode}`] || grouped[periode] || [];
        const ow1Blokjes = grouped[`OW${ow1}`] || [];
        const ow2Blokjes = grouped[`OW${ow2}`] || [];

        // Correct calculation:
        // 1 eenheid = 0.5 klokuur, dus eenheden / 2 = klokuren
        // Basisweken: eenheden × basisweken / 2
        // OW: eenheden / 2 (ontwikkelweken zijn elk 1 week)
        const basiswekenAantal = state.basisweken[periode] || 8;
        const basisKlokuren = basisBlokjes.length * basiswekenAantal / 2;
        const ow1Klokuren = ow1Blokjes.length / 2;
        const ow2Klokuren = ow2Blokjes.length / 2;
        const periodeKlokuren = basisKlokuren + ow1Klokuren + ow2Klokuren;

        // Calculate klokuren per section (eenheden × 0.5, per week without basisweken multiplier)
        const basisKlokurenPerWeek = basisBlokjes.length * 0.5;
        const ow1KlokurenPerWeek = ow1Blokjes.length * 0.5;
        const ow2KlokurenPerWeek = ow2Blokjes.length * 0.5;

        // Helper function to calculate VZNZ per blokjes array
        function calcVznzForBlokjes(blokjes, multiplier = 1) {
            const vznzPerFactor = {};
            blokjes.forEach(blokje => {
                const vak = state.vakken.find(v => v.id === blokje.vakId);
                const factor = vak ? (vak.opslagfactor || 40) : 40;
                if (!vznzPerFactor[factor]) {
                    vznzPerFactor[factor] = { klokuren: 0 };
                }
                vznzPerFactor[factor].klokuren += 0.5 * multiplier;
            });

            let totaalVznz = 0;
            const rows = Object.keys(vznzPerFactor).sort((a, b) => b - a).map(factor => {
                const vznz = vznzPerFactor[factor].klokuren * (factor / 100);
                totaalVznz += vznz;
                return '<div class="uren-mini-row"><span>VZNZ ' + factor + '%</span><span>' + vznz.toFixed(1) + '</span></div>';
            }).join('');

            return { rows, totaal: totaalVznz };
        }

        // Calculate for each section
        const basisKlokurenTotaal = basisKlokurenPerWeek * basiswekenAantal;
        const basisVznz = calcVznzForBlokjes(basisBlokjes, basiswekenAantal);
        const basisTotaal = basisKlokurenTotaal + basisVznz.totaal;

        const ow1KlokurenTotaal = ow1KlokurenPerWeek; // 1 week
        const ow1Vznz = calcVznzForBlokjes(ow1Blokjes, 1);
        const ow1Totaal = ow1KlokurenTotaal + ow1Vznz.totaal;

        const ow2KlokurenTotaal = ow2KlokurenPerWeek; // 1 week
        const ow2Vznz = calcVznzForBlokjes(ow2Blokjes, 1);
        const ow2Totaal = ow2KlokurenTotaal + ow2Vznz.totaal;

        const periodeTotaal = basisTotaal + ow1Totaal + ow2Totaal;

        return `
            <div class="periode-container">
                <div class="periode-main-header">
                    <h3>📅 Periode ${periode}</h3>
                </div>
                <div class="periode-row">
                    <div class="periode-section basisweken-section">
                        <div class="periode-section-header">
                            <h4>Basisweken</h4>
                            <span class="periode-section-count">${basisKlokurenPerWeek.toFixed(1)} klokuren les p/w</span>
                        </div>
                        ${renderMijnBlokjesPerVak(basisBlokjes, `P${periode}`)}
                        ${basisBlokjes.length === 0 ? '<p class="empty-state" style="font-size:0.75rem">Geen eenheden</p>' : ''}
                    </div>
                    <div class="periode-section ow-section">
                        <div class="periode-section-header">
                            <h4>Ontwikkelweek ${ow1}</h4>
                            <span class="periode-section-count">${ow1KlokurenPerWeek.toFixed(1)} klokuren les deze week</span>
                        </div>
                        ${renderMijnBlokjesPerVak(ow1Blokjes, `OW${ow1}`)}
                        ${ow1Blokjes.length === 0 ? '<p class="empty-state" style="font-size:0.75rem">Geen eenheden</p>' : ''}
                    </div>
                    <div class="periode-section ow-section">
                        <div class="periode-section-header">
                            <h4>Ontwikkelweek ${ow2}</h4>
                            <span class="periode-section-count">${ow2KlokurenPerWeek.toFixed(1)} klokuren les deze week</span>
                        </div>
                        ${renderMijnBlokjesPerVak(ow2Blokjes, `OW${ow2}`)}
                        ${ow2Blokjes.length === 0 ? '<p class="empty-state" style="font-size:0.75rem">Geen eenheden</p>' : ''}
                    </div>
                    <div class="periode-section uren-section">
                        <div class="periode-section-header">
                            <h4>Uren</h4>
                        </div>
                        <div class="uren-drie-kolommen">
                            <div class="uren-kolom">
                                <div class="uren-kolom-header">Basisweken (×${basiswekenAantal})</div>
                                <div class="uren-mini-row"><span>Klokuren</span><span>${basisKlokurenTotaal.toFixed(1)}</span></div>
                                ${basisVznz.rows}
                                <div class="uren-mini-subtotal"><span>Subtotaal</span><span>${basisTotaal.toFixed(1)}</span></div>
                            </div>
                            <div class="uren-kolom">
                                <div class="uren-kolom-header">OW${ow1}</div>
                                <div class="uren-mini-row"><span>Klokuren</span><span>${ow1KlokurenTotaal.toFixed(1)}</span></div>
                                ${ow1Vznz.rows}
                                <div class="uren-mini-subtotal"><span>Subtotaal</span><span>${ow1Totaal.toFixed(1)}</span></div>
                            </div>
                            <div class="uren-kolom">
                                <div class="uren-kolom-header">OW${ow2}</div>
                                <div class="uren-mini-row"><span>Klokuren</span><span>${ow2KlokurenTotaal.toFixed(1)}</span></div>
                                ${ow2Vznz.rows}
                                <div class="uren-mini-subtotal"><span>Subtotaal</span><span>${ow2Totaal.toFixed(1)}</span></div>
                            </div>
                        </div>
                        <div class="uren-table-subtotal">
                            <span>Totaal Onderwijs</span>
                            <span class="uren-totaal">${periodeTotaal.toFixed(1)}</span>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }).join('');

    // Add total row - calculate totaal onderwijs (klokuren + VZNZ) with basisweken
    let totaalKlokuren = 0;
    let totaalVznzSchoolJaar = 0;
    [1, 2, 3, 4].forEach(periode => {
        const ow1 = (periode - 1) * 2 + 1;
        const ow2 = (periode - 1) * 2 + 2;
        const basisBlokjes = grouped[`P${periode}`] || grouped[periode] || [];
        const ow1Blokjes = grouped[`OW${ow1}`] || [];
        const ow2Blokjes = grouped[`OW${ow2}`] || [];
        const basiswekenAantal = state.basisweken[periode] || 8;

        // Basisweken: klokuren × aantal weken
        totaalKlokuren += basisBlokjes.length * 0.5 * basiswekenAantal;
        // OW: 1 week each
        totaalKlokuren += ow1Blokjes.length * 0.5;
        totaalKlokuren += ow2Blokjes.length * 0.5;

        // Calculate VZNZ with correct multipliers
        basisBlokjes.forEach(blokje => {
            const vak = state.vakken.find(v => v.id === blokje.vakId);
            const factor = vak ? (vak.opslagfactor || 40) : 40;
            totaalVznzSchoolJaar += 0.5 * basiswekenAantal * (factor / 100);
        });
        [...ow1Blokjes, ...ow2Blokjes].forEach(blokje => {
            const vak = state.vakken.find(v => v.id === blokje.vakId);
            const factor = vak ? (vak.opslagfactor || 40) : 40;
            totaalVznzSchoolJaar += 0.5 * (factor / 100);
        });
    });

    const totaalOnderwijs = totaalKlokuren + totaalVznzSchoolJaar;

    container.innerHTML += `
        <div class="totaal-row">
            <div class="totaal-label">Totaal Onderwijs</div>
            <div class="totaal-value"><strong class="uren-totaal">${totaalOnderwijs.toFixed(1)}</strong> <small>(incl. ${totaalVznzSchoolJaar.toFixed(1)} VZNZ)</small></div>
        </div>
    `;

    // Render tasks for this docent and get taakuren total
    const { totaalTaakuren } = renderMijnTaken();

    // Add Totaal Taakuren row to the tasks container
    const takenContainer = document.getElementById('taken-grid');
    if (takenContainer && totaalTaakuren > 0) {
        takenContainer.innerHTML += `
            <div class="totaal-row taakuren">
                <div class="totaal-label">Totaal Taakuren</div>
                <div class="totaal-value"><strong class="uren-totaal">${totaalTaakuren.toFixed(1)}</strong></div>
            </div>
        `;
    }

    // Add Totale inzet bar as the last element in the mijn-overzicht-layout
    const totaleInzet = totaalOnderwijs + totaalTaakuren;
    const layoutContainer = document.querySelector('.mijn-overzicht-layout');
    if (layoutContainer) {
        // Remove existing totale-inzet bar if present
        const existingTotaleInzet = layoutContainer.querySelector('.totale-inzet-container');
        if (existingTotaleInzet) {
            existingTotaleInzet.remove();
        }

        // Get docent's available hours
        const BESCHIKBAAR_PER_FTE = 1600; // 1659 - 59 uur deskundigheidsbevordering
        const docent = state.docenten.find(d => d.id === state.geselecteerdeDocent);
        const brutoFTE = docent?.aanstellingBruto ?? 1.0;
        const inhouding = docent?.inhouding ?? 0;
        const nettoFTE = brutoFTE - inhouding;
        const beschikbareUren = nettoFTE * BESCHIKBAAR_PER_FTE;
        const beschikbaarOnderwijs = beschikbareUren * 0.75;
        const beschikbaarTaken = beschikbareUren * 0.25;

        // Calculate differences
        const verschilOnderwijs = beschikbaarOnderwijs - totaalOnderwijs;
        const verschilTaken = beschikbaarTaken - totaalTaakuren;
        const verschilTotaal = beschikbareUren - totaleInzet;

        // Helper for styling
        const formatVerschil = (val) => {
            const sign = val >= 0 ? '+' : '';
            const cls = val >= 0 ? 'positief' : 'negatief';
            return `<span class="balans-verschil ${cls}">${sign}${val.toFixed(1)}</span>`;
        };

        // Add new totale inzet bar with balance
        const totaleInzetContainer = document.createElement('div');
        totaleInzetContainer.className = 'totale-inzet-container';
        totaleInzetContainer.innerHTML = `
            <div class="totale-inzet-row">
                <div class="totale-inzet-label">Totale inzet</div>
                <div class="totale-inzet-value">${totaleInzet.toFixed(1)} uur</div>
            </div>
            <div class="uren-balans">
                <div class="balans-header">
                    <span class="balans-header-label"></span>
                    <span class="balans-header-col">Beschikbaar</span>
                    <span class="balans-header-col">Geselecteerd</span>
                    <span class="balans-header-col">Verschil</span>
                </div>
                <div class="balans-row">
                    <span class="balans-label">🎓 Onderwijs</span>
                    <span class="balans-beschikbaar">${beschikbaarOnderwijs.toFixed(1)}u</span>
                    <span class="balans-geselecteerd">${totaalOnderwijs.toFixed(1)}u</span>
                    ${formatVerschil(verschilOnderwijs)}
                </div>
                <div class="balans-row">
                    <span class="balans-label">📋 Taken</span>
                    <span class="balans-beschikbaar">${beschikbaarTaken.toFixed(1)}u</span>
                    <span class="balans-geselecteerd">${totaalTaakuren.toFixed(1)}u</span>
                    ${formatVerschil(verschilTaken)}
                </div>
                <div class="balans-row balans-verschil-totaal">
                    <span class="balans-label">📊 Verschil</span>
                    <span class="balans-beschikbaar">${beschikbareUren.toFixed(1)}u</span>
                    <span class="balans-geselecteerd">${totaleInzet.toFixed(1)}u</span>
                    ${formatVerschil(verschilTotaal)}
                </div>
            </div>
        `;
        layoutContainer.appendChild(totaleInzetContainer);
    }
}

function renderMijnBlokjesPerVak(blokjes, periodeKey) {
    if (blokjes.length === 0) return '';

    // Group by vak AND klas
    const perVakKlas = {};
    blokjes.forEach(b => {
        const key = `${b.vakId}-${b.klas}`;
        if (!perVakKlas[key]) {
            perVakKlas[key] = {
                vakId: b.vakId,
                vakNaam: b.vakNaam,
                klas: b.klas,
                kleur: b.baseKleur || b.kleur,
                items: []
            };
        }
        perVakKlas[key].items.push(b);
    });

    // Sort entries: 1) by leerjaar, 2) by unit count (desc), 3) by class name (asc)
    const sortedEntries = Object.values(perVakKlas).sort((a, b) => {
        const vakA = state.vakken.find(v => v.id === a.vakId);
        const vakB = state.vakken.find(v => v.id === b.vakId);

        // 1. Sort by leerjaar
        const leerjaarA = vakA ? vakA.leerjaar : 0;
        const leerjaarB = vakB ? vakB.leerjaar : 0;
        if (leerjaarA !== leerjaarB) return leerjaarA - leerjaarB;

        // 2. Sort by unit count (descending - largest first)
        const countA = a.items.length;
        const countB = b.items.length;
        if (countA !== countB) return countB - countA;

        // 3. Sort by class name (ascending)
        return a.klas.localeCompare(b.klas, 'nl');
    });

    return sortedEntries.map(entry => {
        const vak = state.vakken.find(v => v.id === entry.vakId);
        const isSplitsbaar = vak ? vak.splitsbaar !== false : true;

        // Calculate total units for this vak/klas/periode
        let totalUnits = 0;
        if (vak) {
            if (periodeKey.startsWith('OW')) {
                const owNum = parseInt(periodeKey.substring(2));
                totalUnits = vak.ontwikkelweken ? (vak.ontwikkelweken[owNum] || 0) : 0;
            } else {
                const pNum = parseInt(periodeKey.substring(1));
                totalUnits = vak.periodes ? (vak.periodes[pNum] || 0) : 0;
            }
        }

        const mijnCount = entry.items.length;
        const isPartial = mijnCount < totalUnits;

        // Find other teachers who have units of this vak/klas/periode
        let sharedWithNames = [];
        if (isPartial && isSplitsbaar) {
            const otherToewijzingen = state.toewijzingen.filter(t => {
                if (t.docentId === state.geselecteerdeDocent) return false;
                // Check if same vak/klas/periode
                const blokjePrefix = `${entry.vakId}-${entry.klas}-${periodeKey}-`;
                return t.blokjeId.startsWith(blokjePrefix);
            });

            const otherDocentIds = [...new Set(otherToewijzingen.map(t => t.docentId))];
            sharedWithNames = otherDocentIds.map(id => {
                const docent = state.docenten.find(d => d.id === id);
                return docent ? docent.naam : 'Onbekend';
            });
        }

        // Build display info - combine count and calculation on same line
        let countText = '';
        if (!isSplitsbaar) {
            countText = `${mijnCount} eenheden`;
        } else if (isPartial) {
            countText = `${mijnCount} van ${totalUnits} eenheden`;
        } else {
            countText = `${mijnCount} eenheden (volledig)`;
        }

        let sharedDisplay = '';
        if (sharedWithNames.length > 0) {
            sharedDisplay = `<div class="mijn-shared-with">Gedeeld met: ${sharedWithNames.map(n => escapeHtml(n)).join(', ')}</div>`;
        }

        // Calculate klokuren (per week)
        // Klokuren = eenheden × 0.5 (per week)
        const klokuren = mijnCount * 0.5;

        const berekenText = `${mijnCount} eenheden = ${klokuren.toFixed(1)} klokuren`;

        return `
            <div class="mijn-vak-block" style="border-left-color: ${entry.kleur}">
                <div class="mijn-vak-header">
                    <span class="mijn-vak-color" style="background: ${entry.kleur}"></span>
                    <span class="mijn-vak-naam">${escapeHtml(entry.vakNaam)}</span>
                    <span class="mijn-vak-klas">${entry.klas}</span>
                </div>
                <div class="mijn-vak-details">
                    <span class="mijn-vak-berekening">${berekenText}</span>
                </div>
                ${sharedDisplay}
            </div>
        `;
    }).join('');
}

// Render tasks for the selected docent in Mijn Overzicht
function renderMijnTaken() {
    const container = document.getElementById('taken-grid');
    if (!container) return { totaalTaakuren: 0 };

    if (!state.geselecteerdeDocent) {
        container.innerHTML = '<p class="empty-state">Selecteer een teamlid om taken te zien</p>';
        return { totaalTaakuren: 0 };
    }

    // Get tasks for this docent (either directly selected or "voor iedereen")
    const mijnTaken = state.taken.filter(taak => {
        if (taak.voorIedereen) return true;
        return state.docentTaken.some(dt =>
            dt.docentId === state.geselecteerdeDocent &&
            dt.taakId === taak.id
        );
    });

    if (mijnTaken.length === 0) {
        container.innerHTML = '<p class="empty-state">Geen taken geselecteerd</p>';
        return { totaalTaakuren: 0 };
    }

    // Calculate totaal taakuren
    let totaalTaakuren = 0;

    // Get docent for FTE calculation
    const docent = state.docenten.find(d => d.id === state.geselecteerdeDocent);
    const nettoFTE = docent ? (docent.aanstellingBruto ?? 1.0) - (docent.inhouding ?? 0) : 1.0;

    container.innerHTML = mijnTaken.map(taak => {
        let totaalUren = Object.values(taak.urenPerPeriode).reduce((a, b) => a + b, 0);
        // Apply naarRato if set
        if (taak.naarRato) {
            totaalUren = totaalUren * nettoFTE;
        }
        totaalTaakuren += totaalUren;
        const kleur = taak.kleur || '#6366f1';
        const isVoorIedereen = taak.voorIedereen;

        // Get ALL docents who have this task
        let alleDocentenDieTaakHebben = [];
        if (isVoorIedereen) {
            alleDocentenDieTaakHebben = state.docenten.map(d => ({ id: d.id, naam: d.naam }));
        } else {
            alleDocentenDieTaakHebben = state.docentTaken
                .filter(dt => dt.taakId === taak.id)
                .map(dt => {
                    const docent = state.docenten.find(d => d.id === dt.docentId);
                    return { id: dt.docentId, naam: docent ? docent.naam : 'Onbekend' };
                });
        }

        const totaalAantalDocenten = alleDocentenDieTaakHebben.length;
        const isMaxOverschreden = taak.maxDocenten && totaalAantalDocenten > taak.maxDocenten;
        const overschrijding = isMaxOverschreden ? totaalAantalDocenten - taak.maxDocenten : 0;
        const isExactVerkeerd = taak.exactDocenten && totaalAantalDocenten !== taak.exactDocenten;
        const exactVerschil = taak.exactDocenten ? totaalAantalDocenten - taak.exactDocenten : 0;

        // Build constraint text for header
        const constraints = [];
        if (isVoorIedereen) {
            constraints.push('voor alle teamleden');
        } else if (taak.exactDocenten) {
            constraints.push(`exact ${taak.exactDocenten} ${taak.exactDocenten === 1 ? 'teamlid' : 'teamleden'}`);
        } else if (taak.maxDocenten) {
            constraints.push(`max ${taak.maxDocenten} ${taak.maxDocenten === 1 ? 'teamlid' : 'teamleden'}`);
        }
        if (taak.naarRato) {
            constraints.push('naar rato');
        }
        const constraintText = constraints.length > 0
            ? `<span class="max-docenten-info">(${constraints.join('; ')})</span>`
            : '';

        // Build docenten text with warnings
        let docentenText = '';
        const alleNamen = alleDocentenDieTaakHebben.map(d => d.naam);

        if (!isVoorIedereen && alleNamen.length > 0) {
            if (isMaxOverschreden) {
                const teamlidText = overschrijding === 1 ? 'teamlid' : 'teamleden';
                docentenText = `⚠️ Geselecteerd door: <strong>${alleNamen.join(', ')}</strong> <span class="max-overschreden">(${overschrijding} ${teamlidText} te veel)</span>`;
            } else if (isExactVerkeerd && exactVerschil > 0) {
                const teamlidText = exactVerschil === 1 ? 'teamlid' : 'teamleden';
                docentenText = `⚠️ Geselecteerd door: <strong>${alleNamen.join(', ')}</strong> <span class="max-overschreden">(${exactVerschil} ${teamlidText} te veel)</span>`;
            } else if (isExactVerkeerd && exactVerschil < 0) {
                const tekort = Math.abs(exactVerschil);
                const teamlidText = tekort === 1 ? 'teamlid' : 'teamleden';
                docentenText = `⚠️ Geselecteerd door: <strong>${alleNamen.join(', ')}</strong> <span class="max-overschreden">(${tekort} ${teamlidText} te weinig)</span>`;
            } else {
                docentenText = `Geselecteerd door: <strong>${alleNamen.join(', ')}</strong>`;
            }
        }

        return `
            <div class="taak-selectie-item selected" style="border-left: 3px solid ${kleur}">
                <div class="taak-selectie-icon-wrapper">
                    <div class="taak-doc-icon taak-doc-icon-small" style="background: ${kleur}">
                        <div class="taak-doc-fold"></div>
                        <div class="taak-doc-lines">
                            <span></span><span></span><span></span>
                        </div>
                    </div>
                </div>
                <div class="taak-selectie-info">
                    <div class="taak-selectie-header">
                        <span class="taak-selectie-naam">${escapeHtml(taak.naam)} ${constraintText}</span>
                    </div>
                    <div class="taak-selectie-meta">
                        <span>⏱️ ${totaalUren.toFixed(1)}u totaal</span>
                        <span class="taak-periodes-inline">P1: ${taak.urenPerPeriode[1].toFixed(1)} • P2: ${taak.urenPerPeriode[2].toFixed(1)} • P3: ${taak.urenPerPeriode[3].toFixed(1)} • P4: ${taak.urenPerPeriode[4].toFixed(1)}</span>
                    </div>
                    ${docentenText ? `<div class="taak-selectie-docenten">${docentenText}</div>` : ''}
                </div>
            </div>
        `;
    }).join('');

    return { totaalTaakuren };
}

function renderBlokje(blokje, draggable = true) {
    // Check for conflicts
    const conflictDocent = getConflictDocent(blokje.id);
    const hasConflict = conflictDocent !== null;

    // Calculate text color based on background brightness
    const textColor = getContrastColor(blokje.kleur);

    return `
        <div class="blokje ${hasConflict ? 'blokje-conflict' : ''}" 
             draggable="${draggable}"
             data-blokje-id="${blokje.id}"
             ondragstart="handleDragStart(event)"
             ondragend="handleDragEnd(event)"
             style="background: ${blokje.kleur}; color: ${textColor}">
            <span class="blokje-vak">${escapeHtml(blokje.vakNaam)}</span>
            <span class="blokje-klas">${blokje.klas} • P${blokje.periode}</span>
            ${hasConflict ? `<span class="conflict-info">Ook: ${escapeHtml(conflictDocent)}</span>` : ''}
        </div>
    `;
}

function getConflictDocent(blokjeId) {
    const toewijzingen = state.toewijzingen.filter(t => t.blokjeId === blokjeId);
    if (toewijzingen.length <= 1) return null;

    // Find the other docent (not the currently selected one)
    const otherToewijzing = toewijzingen.find(t => t.docentId !== state.geselecteerdeDocent);
    if (otherToewijzing) {
        const docent = state.docenten.find(d => d.id === otherToewijzing.docentId);
        return docent ? docent.naam : null;
    }
    return null;
}

// ============================================
// DRAG AND DROP
// ============================================

let draggedBlokjeId = null;

function handleDragStart(event) {
    draggedBlokjeId = event.target.dataset.blokjeId;
    event.target.classList.add('dragging');
    event.dataTransfer.effectAllowed = 'move';
}

function handleDragEnd(event) {
    event.target.classList.remove('dragging');
    document.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
}

function handleDragOver(event) {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    event.currentTarget.classList.add('drag-over');
}

function handleDrop(event, target, periode = null) {
    event.preventDefault();
    event.currentTarget.classList.remove('drag-over');

    if (!draggedBlokjeId) return;

    if (target === 'pool') {
        // Remove from docent - always allowed
        state.toewijzingen = state.toewijzingen.filter(t =>
            !(t.blokjeId === draggedBlokjeId && t.docentId === state.geselecteerdeDocent)
        );
    } else if (target === 'periode' && state.geselecteerdeDocent) {
        // Get the blokje's designated period from its ID
        const allBlokjes = generateAllBlokjes();
        const blokje = allBlokjes.find(b => b.id === draggedBlokjeId);

        if (!blokje) {
            draggedBlokjeId = null;
            return;
        }

        // Check if the target period matches the blokje's period
        if (blokje.periode !== periode) {
            alert(`Dit blokje hoort bij periode ${blokje.periode} en kan niet in periode ${periode} geplaatst worden.`);
            draggedBlokjeId = null;
            return;
        }

        // Check if already assigned to this docent
        const existing = state.toewijzingen.find(t =>
            t.blokjeId === draggedBlokjeId && t.docentId === state.geselecteerdeDocent
        );

        if (existing) {
            // Already in correct period (periode match checked above)
            existing.periode = periode;
        } else {
            // Add new toewijzing
            state.toewijzingen.push({
                blokjeId: draggedBlokjeId,
                docentId: state.geselecteerdeDocent,
                periode: periode
            });
        }
    }

    draggedBlokjeId = null;
    saveToLocalStorage();
    renderVerdelingView();
}

// Make functions globally available
window.handleDragStart = handleDragStart;
window.handleDragEnd = handleDragEnd;
window.handleDragOver = handleDragOver;
window.handleDrop = handleDrop;

// ============================================
// DASHBOARD
// ============================================

let dashboardState = {
    currentNiveau: 1,
    selectedLeerjaar: 'alle'
};

function switchDashboardNiveau(niveau) {
    dashboardState.currentNiveau = niveau;

    // Update tab styling
    document.querySelectorAll('.dashboard-niveau-tab').forEach(tab => {
        tab.classList.toggle('active', parseInt(tab.dataset.niveau) === niveau);
    });

    // Show/hide niveau containers
    document.querySelectorAll('.dashboard-niveau').forEach(container => {
        container.classList.remove('active');
    });
    document.getElementById(`dashboard-niveau-${niveau}`).classList.add('active');

    // Show/hide leerjaar dropdown (only visible on Lessen tab)
    const leerjaarDropdown = document.getElementById('dashboard-leerjaar-select');
    if (leerjaarDropdown) {
        leerjaarDropdown.style.display = niveau === 1 ? 'block' : 'none';
    }

    // Show/hide lessen progress bar (only visible on Lessen tab)
    const progressContainer = document.getElementById('dashboard-progress-container');
    if (progressContainer) {
        progressContainer.style.display = niveau === 1 ? 'flex' : 'none';
    }

    // Show/hide taken progress bar (only visible on Taken tab)
    const takenProgressContainer = document.getElementById('dashboard-taken-progress-container');
    if (takenProgressContainer) {
        takenProgressContainer.style.display = niveau === 2 ? 'flex' : 'none';
    }

    // Render the appropriate niveau
    switch (niveau) {
        case 1:
            renderDashboardLessen();
            break;
        case 2:
            renderDashboardTaken();
            break;
        case 3:
            renderDashboardPvi();
            break;
    }
}

// Make switchDashboardNiveau globally available
window.switchDashboardNiveau = switchDashboardNiveau;

function renderDashboard() {
    // Render the current niveau
    switchDashboardNiveau(dashboardState.currentNiveau);
}

// ============================================
// NIVEAU 3: DUMMY PVI's (Extended Cards)
// ============================================

function renderDashboardPvi() {
    const container = document.getElementById('dashboard-pvi-grid');

    if (state.docenten.length === 0) {
        container.innerHTML = '<p class="empty-state">Voeg teamleden toe om het overzicht te zien</p>';
        return;
    }

    const BESCHIKBAAR_PER_FTE = 1600;
    const allBlokjes = generateAllBlokjes();

    // Sort docenten by second letter onwards
    const sortedDocenten = [...state.docenten].sort((a, b) =>
        a.naam.substring(1).localeCompare(b.naam.substring(1))
    );

    // Collect all unique taken
    const alleTaken = [...state.taken].sort((a, b) => a.naam.localeCompare(b.naam, 'nl'));

    // Build table header - group header for sections
    let groupHeaderHtml = '<tr class="pvi-group-header-row">';
    groupHeaderHtml += '<th></th>'; // Teamlid
    groupHeaderHtml += '<th colspan="6" class="pvi-group-blue">Aanstelling</th>';
    groupHeaderHtml += '<th colspan="2" class="pvi-group-orange">Inzet</th>';
    groupHeaderHtml += '<th colspan="3" class="pvi-group-calc">Berekening</th>';
    groupHeaderHtml += '<th colspan="5" class="pvi-group-yellow">Lessen (eenheden)</th>';
    groupHeaderHtml += '<th class="pvi-group-taken">Taken (klokuren)</th>';
    groupHeaderHtml += '</tr>';

    // Build table header - column headers
    let headerHtml = '<tr class="pvi-header-row">';
    headerHtml += '<th class="pvi-naam-header">Teamlid</th>';

    // Sectie 1: FTE Info (blauw)
    headerHtml += '<th class="pvi-section-blue">Bruto FTE</th>';
    headerHtml += '<th class="pvi-section-blue">Inhouding</th>';
    headerHtml += '<th class="pvi-section-blue">Netto FTE</th>';
    headerHtml += '<th class="pvi-section-blue">Netto uren</th>';
    headerHtml += '<th class="pvi-section-blue">75% Onderwijs</th>';
    headerHtml += '<th class="pvi-section-blue">25% Taken</th>';

    // Sectie 2: Inzet (oranje)
    headerHtml += '<th class="pvi-section-orange">Inzet onderwijs</th>';
    headerHtml += '<th class="pvi-section-orange">Inzet taken</th>';

    // Sectie 3: Berekening
    headerHtml += '<th class="pvi-section-calc">Δ Onderwijs</th>';
    headerHtml += '<th class="pvi-section-calc">Δ Taken</th>';
    headerHtml += '<th class="pvi-section-calc">Verschil</th>';

    // Sectie 4: Lessen samenvatting per periode (geel)
    headerHtml += '<th class="pvi-section-yellow">P1</th>';
    headerHtml += '<th class="pvi-section-yellow">P2</th>';
    headerHtml += '<th class="pvi-section-yellow">P3</th>';
    headerHtml += '<th class="pvi-section-yellow">P4</th>';
    headerHtml += '<th class="pvi-section-yellow">OW</th>';

    // Sectie 5: Taken samenvatting
    headerHtml += '<th class="pvi-section-taken">Samenvatting</th>';

    headerHtml += '</tr>';

    // Build rows per docent
    let rowsHtml = sortedDocenten.map(docent => {
        // FTE calculations
        const brutoFTE = docent.aanstellingBruto ?? 1.0;
        const inhouding = docent.inhouding ?? 0;
        const nettoFTE = brutoFTE - inhouding;
        const beschikbareUren = nettoFTE * BESCHIKBAAR_PER_FTE;
        const onderwijsBeschikbaar = beschikbareUren * 0.75;
        const takenBeschikbaar = beschikbareUren * 0.25;

        // Get docent toewijzingen
        const docentToewijzingen = state.toewijzingen.filter(t => t.docentId === docent.id);
        let onderwijsGeselecteerd = 0;

        [1, 2, 3, 4].forEach(periode => {
            const basiswekenAantal = state.basisweken[periode] || 8;
            const ow1 = (periode - 1) * 2 + 1;
            const ow2 = (periode - 1) * 2 + 2;

            const periodeBlokjes = docentToewijzingen
                .filter(t => {
                    const pStr = t.periode?.toString() || '';
                    return pStr === 'P' + periode || pStr === String(periode);
                })
                .map(t => allBlokjes.find(b => b.id === t.blokjeId))
                .filter(b => b);

            const ow1Blokjes = docentToewijzingen
                .filter(t => t.periode === 'OW' + ow1)
                .map(t => allBlokjes.find(b => b.id === t.blokjeId))
                .filter(b => b);

            const ow2Blokjes = docentToewijzingen
                .filter(t => t.periode === 'OW' + ow2)
                .map(t => allBlokjes.find(b => b.id === t.blokjeId))
                .filter(b => b);

            periodeBlokjes.forEach(b => {
                const vak = state.vakken.find(v => v.id === b.vakId);
                const factor = vak ? (vak.opslagfactor || 40) : 40;
                onderwijsGeselecteerd += 0.5 * basiswekenAantal * (1 + factor / 100);
            });
            [...ow1Blokjes, ...ow2Blokjes].forEach(b => {
                const vak = state.vakken.find(v => v.id === b.vakId);
                const factor = vak ? (vak.opslagfactor || 40) : 40;
                onderwijsGeselecteerd += 0.5 * (1 + factor / 100);
            });
        });

        // Calculate taken geselecteerd
        let takenGeselecteerd = 0;
        const mijnTaken = state.taken.filter(taak => {
            if (taak.voorIedereen) return true;
            return state.docentTaken.some(dt => dt.docentId === docent.id && dt.taakId === taak.id);
        });

        mijnTaken.forEach(taak => {
            let uren = Object.values(taak.urenPerPeriode).reduce((a, b) => a + b, 0);
            if (taak.naarRato) {
                uren = uren * nettoFTE;
            }
            takenGeselecteerd += uren;
        });

        // Calculate differences
        const onderwijsVerschil = onderwijsBeschikbaar - onderwijsGeselecteerd;
        const takenVerschil = takenBeschikbaar - takenGeselecteerd;
        const totaalVerschil = onderwijsVerschil + takenVerschil;

        // Format verschil with class
        const formatVerschil = (val) => {
            const cls = val >= 0 ? 'pvi-positief' : 'pvi-negatief';
            const sign = val >= 0 ? '+' : '';
            return '<span class="' + cls + '">' + sign + val.toFixed(1) + '</span>';
        };

        // Build lesson summaries per period - grouped by leerjaar
        const buildLessenSummary = (periodeFilter) => {
            const lessenMap = {};
            docentToewijzingen.filter(periodeFilter).forEach(t => {
                const blokje = allBlokjes.find(b => b.id === t.blokjeId);
                if (!blokje) return;
                const vak = state.vakken.find(v => v.id === blokje.vakId);
                if (!vak) return;
                const leerjaar = vak.leerjaar || '';
                const key = vak.naam + ' ' + blokje.klas;
                if (!lessenMap[leerjaar]) lessenMap[leerjaar] = {};
                lessenMap[leerjaar][key] = (lessenMap[leerjaar][key] || 0) + 1;
            });

            // Sort leerjaren and build output with separators
            const sortedLeerjaren = Object.keys(lessenMap).sort((a, b) => a.localeCompare(b, 'nl', { numeric: true }));
            return sortedLeerjaren.map(lj => {
                return Object.entries(lessenMap[lj])
                    .sort((a, b) => a[0].localeCompare(b[0], 'nl', { numeric: true }))
                    .map(([les, cnt]) => les + ' (' + cnt + ')')
                    .join('<br>');
            }).join('<hr class="pvi-sep">');
        };

        const p1Summary = buildLessenSummary(t => t.periode === 'P1' || t.periode === '1');
        const p2Summary = buildLessenSummary(t => t.periode === 'P2' || t.periode === '2');
        const p3Summary = buildLessenSummary(t => t.periode === 'P3' || t.periode === '3');
        const p4Summary = buildLessenSummary(t => t.periode === 'P4' || t.periode === '4');
        const owSummary = buildLessenSummary(t => t.periode && t.periode.toString().startsWith('OW'));

        // Build row
        let row = '<tr class="pvi-data-row">';
        row += '<td class="pvi-naam-cel">' + escapeHtml(docent.naam) + '</td>';

        // Sectie 1: FTE
        row += '<td class="pvi-blue">' + brutoFTE.toFixed(2) + '</td>';
        row += '<td class="pvi-blue">' + inhouding.toFixed(2) + '</td>';
        row += '<td class="pvi-blue">' + nettoFTE.toFixed(2) + '</td>';
        row += '<td class="pvi-blue">' + beschikbareUren.toFixed(0) + '</td>';
        row += '<td class="pvi-blue">' + onderwijsBeschikbaar.toFixed(0) + '</td>';
        row += '<td class="pvi-blue">' + takenBeschikbaar.toFixed(0) + '</td>';

        // Sectie 2: Inzet
        row += '<td class="pvi-orange">' + onderwijsGeselecteerd.toFixed(1) + '</td>';
        row += '<td class="pvi-orange">' + takenGeselecteerd.toFixed(1) + '</td>';

        // Sectie 3: Berekening
        row += '<td class="pvi-calc">' + formatVerschil(onderwijsVerschil) + '</td>';
        row += '<td class="pvi-calc">' + formatVerschil(takenVerschil) + '</td>';
        row += '<td class="pvi-calc pvi-verschil-totaal">' + formatVerschil(totaalVerschil) + '</td>';

        // Sectie 4: Lessen samenvatting per periode
        row += '<td class="pvi-yellow pvi-summary">' + p1Summary + '</td>';
        row += '<td class="pvi-yellow pvi-summary">' + p2Summary + '</td>';
        row += '<td class="pvi-yellow pvi-summary">' + p3Summary + '</td>';
        row += '<td class="pvi-yellow pvi-summary">' + p4Summary + '</td>';
        row += '<td class="pvi-yellow pvi-summary">' + owSummary + '</td>';

        // Sectie 5: Taken samenvatting
        const takenSummary = mijnTaken
            .map(taak => {
                let uren = Object.values(taak.urenPerPeriode).reduce((a, b) => a + b, 0);
                if (taak.naarRato) {
                    uren = uren * nettoFTE;
                }
                return taak.naam + ' (' + uren.toFixed(1) + ')';
            })
            .join(', ');
        row += '<td class="pvi-taken pvi-summary">' + escapeHtml(takenSummary) + '</td>';

        row += '</tr>';
        return row;
    }).join('');

    // Build complete table
    container.innerHTML = '<div class="pvi-tabel-container"><table class="pvi-tabel"><thead>' + groupHeaderHtml + headerHtml + '</thead><tbody>' + rowsHtml + '</tbody></table></div>';
}

// ============================================
// EXCEL EXPORT FOR PVI TABLE
// ============================================

function exportPviToExcel() {
    if (!window.XLSX) {
        alert('Excel export library niet geladen. Controleer je internetverbinding.');
        return;
    }

    const allBlokjes = generateAllBlokjes();
    const sortedDocenten = [...state.docenten].sort((a, b) => a.naam.localeCompare(b.naam, 'nl'));

    if (sortedDocenten.length === 0) {
        alert('Geen docenten om te exporteren.');
        return;
    }

    // Build data rows
    const data = [];

    // Header rows
    const groupHeader = ['', 'FTE Berekening', '', '', '', '', '', 'Inzet (u)', '', 'Verschil', '', '', 'Lessen per Periode', '', '', '', '', 'Taken'];
    const header = ['Docent', 'Bruto FTE', 'Inhouding', 'Netto FTE', 'Beschikb. (u)', 'Onderwijs (u)', 'Taken (u)', 'Onderwijs', 'Taken', 'Onderwijs', 'Taken', 'Totaal', 'P1', 'P2', 'P3', 'P4', 'OW', 'Toegewezen'];
    data.push(groupHeader);
    data.push(header);

    // Color mappings for columns
    const colorsPerColumn = {
        0: null, // Naam
        1: '3B82F6', 2: '3B82F6', 3: '3B82F6', 4: '3B82F6', 5: '3B82F6', 6: '3B82F6', // Blue FTE
        7: 'F59E0B', 8: 'F59E0B', // Orange Inzet
        9: null, 10: null, 11: null, // Verschil - will be colored by value
        12: '8B5CF6', 13: '8B5CF6', 14: '8B5CF6', 15: '8B5CF6', 16: '8B5CF6', // Purple Lessen
        17: '14B8A6' // Teal Taken
    };

    // Build docent rows
    sortedDocenten.forEach(docent => {
        const docentToewijzingen = state.toewijzingen.filter(t => t.docentId === docent.id);
        const mijnTaken = state.taken.filter(taak =>
            taak.voorIedereen ||
            state.docentTaken.some(dt => dt.docentId === docent.id && dt.taakId === taak.id)
        );

        const brutoFTE = docent.fte || 1;
        const inhouding = docent.inhouding || 0;
        const nettoFTE = brutoFTE - inhouding;
        const beschikbareUren = nettoFTE * 1659;
        const onderwijsBeschikbaar = beschikbareUren * 0.75;
        const takenBeschikbaar = beschikbareUren * 0.25;

        // Calculate onderwijs geselecteerd
        let onderwijsGeselecteerd = 0;
        docentToewijzingen.forEach(t => {
            const blokje = allBlokjes.find(b => b.id === t.blokjeId);
            if (blokje) onderwijsGeselecteerd += blokje.klokuren || 0;
        });

        // Calculate taken geselecteerd
        let takenGeselecteerd = 0;
        mijnTaken.forEach(taak => {
            let uren = Object.values(taak.urenPerPeriode || { 1: 0, 2: 0, 3: 0, 4: 0 }).reduce((a, b) => a + b, 0);
            if (taak.naarRato) uren = uren * nettoFTE;
            takenGeselecteerd += uren;
        });

        const onderwijsVerschil = onderwijsBeschikbaar - onderwijsGeselecteerd;
        const takenVerschil = takenBeschikbaar - takenGeselecteerd;
        const totaalVerschil = beschikbareUren - (onderwijsGeselecteerd + takenGeselecteerd);

        // Build lessen summaries per period (with newlines instead of <br>)
        const buildLessenSummary = (periodeFilter) => {
            const lessenMap = {};
            docentToewijzingen.filter(periodeFilter).forEach(t => {
                const blokje = allBlokjes.find(b => b.id === t.blokjeId);
                if (!blokje) return;
                const vak = state.vakken.find(v => v.id === blokje.vakId);
                if (!vak) return;
                const leerjaar = vak.leerjaar || '';
                const key = vak.naam + ' ' + blokje.klas;
                if (!lessenMap[leerjaar]) lessenMap[leerjaar] = {};
                lessenMap[leerjaar][key] = (lessenMap[leerjaar][key] || 0) + 1;
            });

            const sortedLeerjaren = Object.keys(lessenMap).sort((a, b) => a.localeCompare(b, 'nl', { numeric: true }));
            return sortedLeerjaren.map(lj => {
                return Object.entries(lessenMap[lj])
                    .sort((a, b) => a[0].localeCompare(b[0], 'nl', { numeric: true }))
                    .map(([les, cnt]) => les + ' (' + cnt + ')')
                    .join('\n');
            }).join('\n\n'); // Double newline between leerjaren
        };

        const p1Summary = buildLessenSummary(t => t.periode === 'P1' || t.periode === '1');
        const p2Summary = buildLessenSummary(t => t.periode === 'P2' || t.periode === '2');
        const p3Summary = buildLessenSummary(t => t.periode === 'P3' || t.periode === '3');
        const p4Summary = buildLessenSummary(t => t.periode === 'P4' || t.periode === '4');
        const owSummary = buildLessenSummary(t => t.periode && t.periode.toString().startsWith('OW'));

        // Build taken summary
        const takenSummary = mijnTaken.map(taak => {
            let uren = Object.values(taak.urenPerPeriode || { 1: 0, 2: 0, 3: 0, 4: 0 }).reduce((a, b) => a + b, 0);
            if (taak.naarRato) uren = uren * nettoFTE;
            return taak.naam + ' (' + uren.toFixed(1) + ')';
        }).join('\n');

        const row = [
            docent.naam,
            brutoFTE,
            inhouding,
            nettoFTE,
            Math.round(beschikbareUren),
            Math.round(onderwijsBeschikbaar),
            Math.round(takenBeschikbaar),
            onderwijsGeselecteerd,
            takenGeselecteerd,
            onderwijsVerschil,
            takenVerschil,
            totaalVerschil,
            p1Summary,
            p2Summary,
            p3Summary,
            p4Summary,
            owSummary,
            takenSummary
        ];

        data.push(row);
    });

    // Create workbook and worksheet
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(data);

    // Calculate auto-fit column widths based on content
    const colWidths = [];
    data.forEach((row, rowIdx) => {
        row.forEach((cell, colIdx) => {
            const cellValue = cell ? cell.toString() : '';
            // For multiline cells, get the longest line
            const lines = cellValue.split('\n');
            const maxLineLength = Math.max(...lines.map(l => l.length));
            // Add some padding
            const width = Math.min(Math.max(maxLineLength + 2, 8), 50);
            if (!colWidths[colIdx] || width > colWidths[colIdx]) {
                colWidths[colIdx] = width;
            }
        });
    });

    // Set column widths
    ws['!cols'] = colWidths.map(w => ({ wch: w }));

    // Apply row heights for header rows
    ws['!rows'] = [
        { hpt: 25 }, // Group header
        { hpt: 30 }  // Column header
    ];

    // Apply cell styles (borders, bold headers, colors)
    const range = XLSX.utils.decode_range(ws['!ref']);

    // Define border style
    const thinBorder = {
        top: { style: 'thin', color: { rgb: '000000' } },
        bottom: { style: 'thin', color: { rgb: '000000' } },
        left: { style: 'thin', color: { rgb: '000000' } },
        right: { style: 'thin', color: { rgb: '000000' } }
    };

    // Apply styles to each cell
    for (let R = range.s.r; R <= range.e.r; R++) {
        for (let C = range.s.c; C <= range.e.c; C++) {
            const cellRef = XLSX.utils.encode_cell({ r: R, c: C });
            if (!ws[cellRef]) {
                ws[cellRef] = { v: '', t: 's' };
            }

            // Initialize cell style
            if (!ws[cellRef].s) ws[cellRef].s = {};

            // Apply borders to all cells
            ws[cellRef].s.border = thinBorder;

            // Header rows (0 and 1)
            if (R === 0 || R === 1) {
                ws[cellRef].s.font = { bold: true, color: { rgb: 'FFFFFF' } };
                ws[cellRef].s.alignment = { horizontal: 'center', vertical: 'center', wrapText: true };

                // Group header colors based on column
                if (R === 0) {
                    if (C >= 1 && C <= 6) {
                        ws[cellRef].s.fill = { fgColor: { rgb: '3B82F6' } }; // Blue - FTE
                    } else if (C >= 7 && C <= 8) {
                        ws[cellRef].s.fill = { fgColor: { rgb: 'F59E0B' } }; // Orange - Inzet
                    } else if (C >= 9 && C <= 11) {
                        ws[cellRef].s.fill = { fgColor: { rgb: '6B7280' } }; // Gray - Verschil
                    } else if (C >= 12 && C <= 16) {
                        ws[cellRef].s.fill = { fgColor: { rgb: '8B5CF6' } }; // Purple - Lessen
                    } else if (C === 17) {
                        ws[cellRef].s.fill = { fgColor: { rgb: '14B8A6' } }; // Teal - Taken
                    } else {
                        ws[cellRef].s.fill = { fgColor: { rgb: '374151' } }; // Dark gray
                    }
                }

                // Column header
                if (R === 1) {
                    if (C >= 1 && C <= 6) {
                        ws[cellRef].s.fill = { fgColor: { rgb: '60A5FA' } }; // Lighter blue
                    } else if (C >= 7 && C <= 8) {
                        ws[cellRef].s.fill = { fgColor: { rgb: 'FBBF24' } }; // Lighter orange
                    } else if (C >= 9 && C <= 11) {
                        ws[cellRef].s.fill = { fgColor: { rgb: '9CA3AF' } }; // Lighter gray
                    } else if (C >= 12 && C <= 16) {
                        ws[cellRef].s.fill = { fgColor: { rgb: 'A78BFA' } }; // Lighter purple
                    } else if (C === 17) {
                        ws[cellRef].s.fill = { fgColor: { rgb: '2DD4BF' } }; // Lighter teal
                    } else {
                        ws[cellRef].s.fill = { fgColor: { rgb: '4B5563' } }; // Medium gray
                    }
                }
            } else {
                // Data rows
                ws[cellRef].s.alignment = { vertical: 'top', wrapText: true };

                // Verschil columns - color based on value
                if (C >= 9 && C <= 11) {
                    const cellValue = ws[cellRef].v;
                    if (typeof cellValue === 'number') {
                        if (cellValue >= 0) {
                            ws[cellRef].s.font = { color: { rgb: '10B981' } }; // Green
                        } else {
                            ws[cellRef].s.font = { color: { rgb: 'EF4444' } }; // Red
                        }
                    }
                }

                // Light background colors for sections
                if (C >= 1 && C <= 6) {
                    ws[cellRef].s.fill = { fgColor: { rgb: 'EFF6FF' } }; // Very light blue
                } else if (C >= 7 && C <= 8) {
                    ws[cellRef].s.fill = { fgColor: { rgb: 'FEF3C7' } }; // Very light orange
                } else if (C >= 12 && C <= 16) {
                    ws[cellRef].s.fill = { fgColor: { rgb: 'F5F3FF' } }; // Very light purple
                } else if (C === 17) {
                    ws[cellRef].s.fill = { fgColor: { rgb: 'F0FDFA' } }; // Very light teal
                }
            }
        }
    }

    XLSX.utils.book_append_sheet(wb, ws, 'Dummy PvI');

    // Generate filename with date
    const dateStr = new Date().toISOString().split('T')[0];
    const filename = `Werkverdelingsapp_PvI_${dateStr}.xlsx`;

    // Download - use bookType xlsx with cellStyles
    XLSX.writeFile(wb, filename, { cellStyles: true });
}


// ============================================
// NIVEAU 1: LESSEN COMPACT OVERVIEW
// ============================================

function updateDashboardLeerjaarSelector() {
    const select = document.getElementById('dashboard-leerjaar-select');
    if (!select) return;

    // Build unique leerjaar names
    const leerjaarNamen = [...new Set(state.leerjaren.map(l => l.naam))];

    select.innerHTML = '<option value="alle">Alle leerjaren</option>' +
        leerjaarNamen.map(naam => `<option value="${naam}">${naam}</option>`).join('');

    select.value = dashboardState.selectedLeerjaar;
}

function renderDashboardLessen() {
    // First, read and save the selected value BEFORE re-rendering the dropdown
    const selectedLeerjaar = document.getElementById('dashboard-leerjaar-select')?.value || 'alle';
    dashboardState.selectedLeerjaar = selectedLeerjaar;

    // Now update the dropdown (this will preserve the selection since dashboardState is already updated)
    updateDashboardLeerjaarSelector();

    const container = document.getElementById('dashboard-lessen-grid');
    const currentSelection = dashboardState.selectedLeerjaar;

    if (state.leerjaren.length === 0) {
        container.innerHTML = '<p class="empty-state">Nog geen leerjaren aangemaakt</p>';
        return;
    }

    const isGodseye = selectedLeerjaar === 'alle';

    // Filter leerjaren
    const leerjarenToShow = selectedLeerjaar === 'alle'
        ? state.leerjaren
        : state.leerjaren.filter(l => l.naam === selectedLeerjaar);

    container.innerHTML = leerjarenToShow.map(leerjaar => {
        const klassen = leerjaar.klassen || [];
        const leerjaarVakken = state.vakken.filter(v => v.leerjaar === leerjaar.naam);

        // Calculate leerjaar percentage
        const leerjaarStats = calculateLeerjaarProgress(leerjaar.naam, klassen, leerjaarVakken);
        const leerjaarPct = leerjaarStats.total > 0 ? Math.round((leerjaarStats.selected / leerjaarStats.total) * 100) : 0;

        // Calculate periode percentages
        const periodePcts = [1, 2, 3, 4].map(p => {
            const stats = calculatePeriodeProgress(leerjaar.naam, klassen, leerjaarVakken, p);
            return stats.total > 0 ? Math.round((stats.selected / stats.total) * 100) : 0;
        });

        return `
            <div class="lessen-leerjaar-section ${isGodseye ? 'lessen-godseye' : ''}">
                <div class="lessen-leerjaar-header">
                    🎓 ${escapeHtml(leerjaar.naam)}
                    <span class="lessen-progress-badge">${leerjaarPct}%</span>
                </div>
                <div class="lessen-table">
                    <div class="lessen-table-header">
                        <div class="lessen-header-klas">Klas</div>
                        <div class="lessen-header-periode">Periode 1 <span class="lessen-progress-small">${periodePcts[0]}%</span></div>
                        <div class="lessen-header-periode">Periode 2 <span class="lessen-progress-small">${periodePcts[1]}%</span></div>
                        <div class="lessen-header-periode">Periode 3 <span class="lessen-progress-small">${periodePcts[2]}%</span></div>
                        <div class="lessen-header-periode">Periode 4 <span class="lessen-progress-small">${periodePcts[3]}%</span></div>
                    </div>
                    ${klassen.map(klas => {
            const klasStats = calculateKlasProgress(leerjaar.naam, klas, leerjaarVakken);
            const klasPct = klasStats.total > 0 ? Math.round((klasStats.selected / klasStats.total) * 100) : 0;
            return renderLessenKlasRow(klas, leerjaar.naam, klasPct);
        }).join('')}
                </div>
            </div>
        `;
    }).join('');

    // Update the overall progress bar
    updateOverallProgressBar();
}

// Update the overall progress bar in dashboard header
function updateOverallProgressBar() {
    const progressBar = document.getElementById('dashboard-progress-bar');
    const progressText = document.getElementById('dashboard-progress-text');
    if (!progressBar || !progressText) return;

    // Calculate total progress across ALL leerjaren
    let totalEenheden = 0;
    let selectedEenheden = 0;

    state.leerjaren.forEach(leerjaar => {
        const klassen = leerjaar.klassen || [];
        const vakken = state.vakken.filter(v => v.leerjaar === leerjaar.naam);

        klassen.forEach(klas => {
            vakken.forEach(vak => {
                [1, 2, 3, 4].forEach(periode => {
                    // Basisweken
                    const eenheden = vak.periodes?.[periode] || 0;
                    for (let i = 1; i <= eenheden; i++) {
                        totalEenheden++;
                        const blokjeId = `${vak.id}-${klas}-P${periode}-${i}`;
                        if (state.toewijzingen.find(t => t.blokjeId === blokjeId)) selectedEenheden++;
                    }
                    // OW
                    const ow1 = (periode - 1) * 2 + 1;
                    const ow2 = (periode - 1) * 2 + 2;
                    [ow1, ow2].forEach(owNum => {
                        const owEenheden = vak.ontwikkelweken?.[owNum] || 0;
                        for (let i = 1; i <= owEenheden; i++) {
                            totalEenheden++;
                            const blokjeId = `${vak.id}-${klas}-OW${owNum}-${i}`;
                            if (state.toewijzingen.find(t => t.blokjeId === blokjeId)) selectedEenheden++;
                        }
                    });
                });
            });
        });
    });

    const percentage = totalEenheden > 0 ? Math.round((selectedEenheden / totalEenheden) * 100) : 0;

    // Update bar width
    progressBar.style.width = Math.max(percentage, 5) + '%';

    // Update text
    progressText.textContent = `${percentage}% onderwijs verdeeld`;

    // Calculate color based on percentage (red -> orange -> yellow -> green)
    let color;
    if (percentage < 25) {
        // Red to orange
        const ratio = percentage / 25;
        color = `rgb(239, ${Math.round(68 + ratio * 90)}, 68)`;
    } else if (percentage < 50) {
        // Orange to yellow
        const ratio = (percentage - 25) / 25;
        color = `rgb(${Math.round(245 - ratio * 10)}, ${Math.round(158 + ratio * 75)}, ${Math.round(11 + ratio * 149)})`;
    } else if (percentage < 75) {
        // Yellow to light green
        const ratio = (percentage - 50) / 25;
        color = `rgb(${Math.round(235 - ratio * 135)}, ${Math.round(233 - ratio * 48)}, ${Math.round(160 - ratio * 31)})`;
    } else {
        // Light green to green
        const ratio = (percentage - 75) / 25;
        color = `rgb(${Math.round(100 - ratio * 84)}, ${Math.round(185 + ratio * 4)}, ${Math.round(129)})`;
    }
    progressBar.style.backgroundColor = color;
}

// Calculate progress for entire leerjaar
function calculateLeerjaarProgress(leerjaarNaam, klassen, vakken) {
    let total = 0;
    let selected = 0;

    klassen.forEach(klas => {
        vakken.forEach(vak => {
            // Basisweken (P1-P4)
            [1, 2, 3, 4].forEach(periode => {
                const eenheden = vak.periodes?.[periode] || 0;
                for (let i = 1; i <= eenheden; i++) {
                    total++;
                    const blokjeId = `${vak.id}-${klas}-P${periode}-${i}`;
                    if (state.toewijzingen.find(t => t.blokjeId === blokjeId)) selected++;
                }

                // OW for this periode
                const ow1 = (periode - 1) * 2 + 1;
                const ow2 = (periode - 1) * 2 + 2;
                [ow1, ow2].forEach(owNum => {
                    const owEenheden = vak.ontwikkelweken?.[owNum] || 0;
                    for (let i = 1; i <= owEenheden; i++) {
                        total++;
                        const blokjeId = `${vak.id}-${klas}-OW${owNum}-${i}`;
                        if (state.toewijzingen.find(t => t.blokjeId === blokjeId)) selected++;
                    }
                });
            });
        });
    });

    return { total, selected };
}

// Calculate progress for a specific periode across all klassen
function calculatePeriodeProgress(leerjaarNaam, klassen, vakken, periode) {
    let total = 0;
    let selected = 0;

    const ow1 = (periode - 1) * 2 + 1;
    const ow2 = (periode - 1) * 2 + 2;

    klassen.forEach(klas => {
        vakken.forEach(vak => {
            // Basisweken
            const eenheden = vak.periodes?.[periode] || 0;
            for (let i = 1; i <= eenheden; i++) {
                total++;
                const blokjeId = `${vak.id}-${klas}-P${periode}-${i}`;
                if (state.toewijzingen.find(t => t.blokjeId === blokjeId)) selected++;
            }

            // OW
            [ow1, ow2].forEach(owNum => {
                const owEenheden = vak.ontwikkelweken?.[owNum] || 0;
                for (let i = 1; i <= owEenheden; i++) {
                    total++;
                    const blokjeId = `${vak.id}-${klas}-OW${owNum}-${i}`;
                    if (state.toewijzingen.find(t => t.blokjeId === blokjeId)) selected++;
                }
            });
        });
    });

    return { total, selected };
}

// Calculate progress for a specific klas across all periodes
function calculateKlasProgress(leerjaarNaam, klas, vakken) {
    let total = 0;
    let selected = 0;

    vakken.forEach(vak => {
        [1, 2, 3, 4].forEach(periode => {
            // Basisweken
            const eenheden = vak.periodes?.[periode] || 0;
            for (let i = 1; i <= eenheden; i++) {
                total++;
                const blokjeId = `${vak.id}-${klas}-P${periode}-${i}`;
                if (state.toewijzingen.find(t => t.blokjeId === blokjeId)) selected++;
            }

            // OW
            const ow1 = (periode - 1) * 2 + 1;
            const ow2 = (periode - 1) * 2 + 2;
            [ow1, ow2].forEach(owNum => {
                const owEenheden = vak.ontwikkelweken?.[owNum] || 0;
                for (let i = 1; i <= owEenheden; i++) {
                    total++;
                    const blokjeId = `${vak.id}-${klas}-OW${owNum}-${i}`;
                    if (state.toewijzingen.find(t => t.blokjeId === blokjeId)) selected++;
                }
            });
        });
    });

    return { total, selected };
}

// Make renderDashboardLessen globally available for HTML onchange
window.renderDashboardLessen = renderDashboardLessen;

function renderLessenKlasRow(klas, leerjaarNaam, klasPct) {
    // Get vakken for this leerjaar, sorted alphabetically
    const leerjaarVakken = state.vakken
        .filter(v => v.leerjaar === leerjaarNaam)
        .sort((a, b) => a.naam.localeCompare(b.naam, 'nl'));

    const periodeHTML = [1, 2, 3, 4].map(periode => {
        const ow1 = (periode - 1) * 2 + 1;
        const ow2 = (periode - 1) * 2 + 2;

        // Build BASISWEKEN rows
        const basisRows = leerjaarVakken.map(vak => {
            const periodeEenheden = vak.periodes?.[periode] || 0;
            if (periodeEenheden === 0) return '';

            const basisBlokjes = [];
            for (let i = 1; i <= periodeEenheden; i++) {
                const blokjeId = `${vak.id}-${klas}-P${periode}-${i}`;
                const toewijzing = state.toewijzingen.find(t => t.blokjeId === blokjeId);
                const docent = toewijzing ? state.docenten.find(d => d.id === toewijzing.docentId) : null;
                const docentAfkorting = docent ? docent.naam.substring(0, 3).toLowerCase() : '';
                const docentNaam = docent ? docent.naam : 'Beschikbaar';
                const isGeselecteerd = !!toewijzing;
                basisBlokjes.push(renderEenheidBlokje(vak.kleur, isGeselecteerd, docentAfkorting, docentNaam, false));
            }

            return `
                <div class="lessen-vak-row">
                    <span class="lessen-vak-titel" style="border-left: 3px solid ${vak.kleur}" title="${escapeHtml(vak.naam)}">${escapeHtml(vak.naam)}</span>
                    <div class="lessen-eenheden">${basisBlokjes.join('')}</div>
                </div>
            `;
        }).filter(row => row !== '').join('');

        // Build OW1 rows
        const ow1Rows = leerjaarVakken.map(vak => {
            const ow1Eenheden = vak.ontwikkelweken?.[ow1] || 0;
            if (ow1Eenheden === 0) return '';

            const owBlokjes = [];
            for (let i = 1; i <= ow1Eenheden; i++) {
                const blokjeId = `${vak.id}-${klas}-OW${ow1}-${i}`;
                const toewijzing = state.toewijzingen.find(t => t.blokjeId === blokjeId);
                const docent = toewijzing ? state.docenten.find(d => d.id === toewijzing.docentId) : null;
                const docentAfkorting = docent ? docent.naam.substring(0, 3).toLowerCase() : '';
                const docentNaam = docent ? docent.naam : 'Beschikbaar';
                const isGeselecteerd = !!toewijzing;
                owBlokjes.push(renderEenheidBlokje(vak.kleur, isGeselecteerd, docentAfkorting, docentNaam, true));
            }

            return `
                <div class="lessen-vak-row">
                    <span class="lessen-vak-titel" style="border-left: 3px solid ${vak.kleur}" title="${escapeHtml(vak.naam)}">${escapeHtml(vak.naam)}</span>
                    <div class="lessen-eenheden">${owBlokjes.join('')}</div>
                </div>
            `;
        }).filter(row => row !== '').join('');

        // Build OW2 rows
        const ow2Rows = leerjaarVakken.map(vak => {
            const ow2Eenheden = vak.ontwikkelweken?.[ow2] || 0;
            if (ow2Eenheden === 0) return '';

            const owBlokjes = [];
            for (let i = 1; i <= ow2Eenheden; i++) {
                const blokjeId = `${vak.id}-${klas}-OW${ow2}-${i}`;
                const toewijzing = state.toewijzingen.find(t => t.blokjeId === blokjeId);
                const docent = toewijzing ? state.docenten.find(d => d.id === toewijzing.docentId) : null;
                const docentAfkorting = docent ? docent.naam.substring(0, 3).toLowerCase() : '';
                const docentNaam = docent ? docent.naam : 'Beschikbaar';
                const isGeselecteerd = !!toewijzing;
                owBlokjes.push(renderEenheidBlokje(vak.kleur, isGeselecteerd, docentAfkorting, docentNaam, true));
            }

            return `
                <div class="lessen-vak-row">
                    <span class="lessen-vak-titel" style="border-left: 3px solid ${vak.kleur}" title="${escapeHtml(vak.naam)}">${escapeHtml(vak.naam)}</span>
                    <div class="lessen-eenheden">${owBlokjes.join('')}</div>
                </div>
            `;
        }).filter(row => row !== '').join('');

        // Build content with sections (header as vertical sidebar)
        let content = '';
        if (basisRows) {
            content += `<div class="lessen-section lessen-section-basis">
                <div class="lessen-section-sidebar" title="Basisweken">B</div>
                <div class="lessen-section-content">${basisRows}</div>
            </div>`;
        }
        if (ow1Rows) {
            content += `<div class="lessen-section lessen-section-ow">
                <div class="lessen-section-sidebar" title="Ontwikkelweek ${ow1}">${ow1}</div>
                <div class="lessen-section-content">${ow1Rows}</div>
            </div>`;
        }
        if (ow2Rows) {
            content += `<div class="lessen-section lessen-section-ow">
                <div class="lessen-section-sidebar" title="Ontwikkelweek ${ow2}">${ow2}</div>
                <div class="lessen-section-content">${ow2Rows}</div>
            </div>`;
        }

        return `
            <div class="lessen-periode-cell">
                ${content || '<span class="lessen-empty">-</span>'}
            </div>
        `;
    }).join('');

    return `
        <div class="lessen-klas-row">
            <div class="lessen-klas-naam">
                ${klas}
                <span class="lessen-klas-progress">${klasPct}%</span>
            </div>
            ${periodeHTML}
        </div>
    `;
}

function renderEenheidBlokje(kleur, isGeselecteerd, afkorting, hoverText, isOW) {
    // Calculate 50% intensity color for unselected
    const bgColor = isGeselecteerd ? kleur : fadeColor(kleur, 0.5);

    return `
        <div class="lessen-eenheid ${isGeselecteerd ? 'geselecteerd' : 'beschikbaar'}" 
             style="background: ${bgColor}"
             title="${escapeHtml(hoverText)}">${afkorting}</div>
    `;
}

function fadeColor(hexColor, intensity) {
    // Convert hex to RGB and fade towards white
    const r = parseInt(hexColor.slice(1, 3), 16);
    const g = parseInt(hexColor.slice(3, 5), 16);
    const b = parseInt(hexColor.slice(5, 7), 16);

    // Blend with white (255) based on intensity
    const newR = Math.round(r + (255 - r) * (1 - intensity));
    const newG = Math.round(g + (255 - g) * (1 - intensity));
    const newB = Math.round(b + (255 - b) * (1 - intensity));

    return `rgb(${newR}, ${newG}, ${newB})`;
}

// ============================================
// NIVEAU 2: TAKEN OVERVIEW
// ============================================

function renderDashboardTaken() {
    const container = document.getElementById('dashboard-taken-grid');

    if (state.taken.length === 0) {
        container.innerHTML = '<p class="empty-state">Nog geen taken aangemaakt</p>';
        return;
    }

    // Separate tasks into categories
    const overbezet = [];
    const onverdeeld = [];
    const verdeeld = [];

    state.taken.forEach(taak => {
        const isVoorIedereen = taak.voorIedereen;
        let docentenDieTaakHebben = [];

        if (isVoorIedereen) {
            docentenDieTaakHebben = state.docenten.map(d => d.naam);
        } else {
            docentenDieTaakHebben = state.docentTaken
                .filter(dt => dt.taakId === taak.id)
                .map(dt => {
                    const docent = state.docenten.find(d => d.id === dt.docentId);
                    return docent ? docent.naam : 'Onbekend';
                });
        }

        const taakInfo = {
            ...taak,
            docentenNamen: docentenDieTaakHebben,
            isVoorIedereen,
            isGeselecteerd: docentenDieTaakHebben.length > 0 || isVoorIedereen,
            isMaxOverschreden: taak.maxDocenten && docentenDieTaakHebben.length > taak.maxDocenten,
            isExactVerkeerd: taak.exactDocenten && docentenDieTaakHebben.length !== taak.exactDocenten && docentenDieTaakHebben.length > 0
        };

        // Categorize: verkeerd bezet (over/under but not empty), then onverdeeld, then verdeeld
        if (taakInfo.isMaxOverschreden || taakInfo.isExactVerkeerd) {
            overbezet.push(taakInfo);
        } else if (taakInfo.isGeselecteerd) {
            verdeeld.push(taakInfo);
        } else {
            onverdeeld.push(taakInfo);
        }
    });

    // Sort all arrays alphabetically
    overbezet.sort((a, b) => a.naam.localeCompare(b.naam, 'nl'));
    onverdeeld.sort((a, b) => a.naam.localeCompare(b.naam, 'nl'));
    verdeeld.sort((a, b) => a.naam.localeCompare(b.naam, 'nl'));

    // Render task row
    const renderTaakRow = (taak) => {
        const docentBlokjes = taak.docentenNamen.map(naam => {
            const afkorting = naam.substring(0, 3).toLowerCase();
            const overschredenClass = taak.isMaxOverschreden ? 'overschreden' : '';
            return `<span class="taken-docent-blokje ${overschredenClass}" title="${escapeHtml(naam)}">${afkorting}</span>`;
        }).join('');

        let badges = '';
        if (taak.isVoorIedereen) {
            badges += '<span class="taken-badge taken-badge-iedereen">👥</span>';
        }
        if (taak.isMaxOverschreden) {
            const overschrijding = taak.docentenNamen.length - taak.maxDocenten;
            const teamlidText = overschrijding === 1 ? 'teamlid' : 'teamleden';
            badges += ` <span class="max-overschreden">⚠️ (${overschrijding} ${teamlidText} te veel)</span>`;
        }
        if (taak.isExactVerkeerd) {
            const verschil = taak.docentenNamen.length - taak.exactDocenten;
            const tekort = Math.abs(verschil);
            const teamlidText = tekort === 1 ? 'teamlid' : 'teamleden';
            const waarschuwing = verschil > 0 ? `${tekort} ${teamlidText} te veel` : `${tekort} ${teamlidText} te weinig`;
            badges += ` <span class="max-overschreden">⚠️ (${waarschuwing})</span>`;
        }

        const totaalUren = Object.values(taak.urenPerPeriode).reduce((a, b) => a + b, 0);
        const constraintClass = (taak.isMaxOverschreden || taak.isExactVerkeerd) ? 'max-overschreden' : '';

        // Determine constraint text
        let constraintText = '-';
        if (taak.isVoorIedereen) {
            constraintText = 'iedereen';
        } else if (taak.exactDocenten) {
            constraintText = `exact ${taak.exactDocenten}`;
        } else if (taak.maxDocenten) {
            constraintText = `max ${taak.maxDocenten}`;
        }

        return `
            <div class="taken-compact-row ${taak.isGeselecteerd ? 'verdeeld' : 'onverdeeld'}">
                <div class="taken-compact-naam" title="${escapeHtml(taak.naam)}">
                    <span class="taken-kleur-dot" style="background: ${taak.kleur || '#6366f1'}"></span>
                    ${escapeHtml(taak.naam)}
                    ${badges}
                </div>
                <div class="taken-compact-uren" title="${totaalUren.toFixed(1)} uur per teamlid">
                    ${totaalUren.toFixed(1)}u
                </div>
                <div class="taken-compact-max ${constraintClass}">
                    ${constraintText}
                </div>
                <div class="taken-compact-docenten">
                    ${docentBlokjes || '<span class="taken-geen-docent">-</span>'}
                </div>
            </div>
        `;
    };

    // Build sections
    let html = '';

    // Onverdeeld section (tasks not yet assigned)
    if (onverdeeld.length > 0) {
        html += `
            <div class="taken-section taken-section-onverdeeld">
                <div class="taken-section-header">
                    <span class="taken-section-title">Nog te verdelen taken</span>
                    <span class="taken-section-count">${onverdeeld.length}</span>
                </div>
                <div class="taken-compact-header">
                    <div class="taken-compact-naam-header">Taak</div>
                    <div class="taken-compact-uren-header">Uren p.t.</div>
                    <div class="taken-compact-max-header">Aantal</div>
                    <div class="taken-compact-docenten-header">Teamleden</div>
                </div>
                ${onverdeeld.map(renderTaakRow).join('')}
            </div>
        `;
    }

    // Overbezet section (tasks with too many docenten)
    if (overbezet.length > 0) {
        html += `
            <div class="taken-section taken-section-overbezet">
                <div class="taken-section-header">
                    <span class="taken-section-title">Onder- of overbezette taken</span>
                    <span class="taken-section-count">${overbezet.length}</span>
                </div>
                <div class="taken-compact-header">
                    <div class="taken-compact-naam-header">Taak</div>
                    <div class="taken-compact-uren-header">Uren p.t.</div>
                    <div class="taken-compact-max-header">Aantal</div>
                    <div class="taken-compact-docenten-header">Teamleden</div>
                </div>
                ${overbezet.map(renderTaakRow).join('')}
            </div>
        `;
    }

    // Verdeeld section
    if (verdeeld.length > 0) {
        html += `
            <div class="taken-section taken-section-verdeeld">
                <div class="taken-section-header">
                    <span class="taken-section-title">Verdeelde taken</span>
                    <span class="taken-section-count">${verdeeld.length}</span>
                </div>
                <div class="taken-compact-header">
                    <div class="taken-compact-naam-header">Taak</div>
                    <div class="taken-compact-uren-header">Uren p.t.</div>
                    <div class="taken-compact-max-header">Aantal</div>
                    <div class="taken-compact-docenten-header">Teamleden</div>
                </div>
                ${verdeeld.map(renderTaakRow).join('')}
            </div>
        `;
    }

    if (html === '') {
        html = '<p class="empty-state">Geen taken om weer te geven</p>';
    }

    container.innerHTML = html;

    // Update the taken progress bar
    updateTakenProgressBar();
}

// Update the taken progress bar in dashboard header
function updateTakenProgressBar() {
    const progressBar = document.getElementById('dashboard-taken-progress-bar');
    const progressText = document.getElementById('dashboard-taken-progress-text');
    if (!progressBar || !progressText) return;

    // Calculate total hours and assigned hours
    let totalUren = 0;
    let verdeeldUren = 0;

    state.taken.forEach(taak => {
        const taakUren = Object.values(taak.urenPerPeriode).reduce((a, b) => a + b, 0);
        totalUren += taakUren;

        // Check if task is properly assigned (not overbezet)
        const isVoorIedereen = taak.voorIedereen;
        const aantalDocenten = isVoorIedereen
            ? state.docenten.length
            : state.docentTaken.filter(dt => dt.taakId === taak.id).length;

        // Task is only "verdeeld" if it has docenten AND is properly staffed
        const heeftDocenten = aantalDocenten > 0;
        const isOverbezet = taak.maxDocenten && aantalDocenten > taak.maxDocenten;
        const isExactVerkeerd = taak.exactDocenten && aantalDocenten !== taak.exactDocenten;

        // Only count as verdeeld if assigned, NOT overbezet, and NOT exact verkeerd
        if (heeftDocenten && !isOverbezet && !isExactVerkeerd) {
            verdeeldUren += taakUren;
        }
    });

    const percentage = totalUren > 0 ? Math.round((verdeeldUren / totalUren) * 100) : 0;

    // Update bar width
    progressBar.style.width = Math.max(percentage, 5) + '%';

    // Update text
    progressText.textContent = `${percentage}% taken verdeeld`;

    // Calculate color based on percentage (red -> orange -> yellow -> green)
    let color;
    if (percentage < 25) {
        const ratio = percentage / 25;
        color = `rgb(239, ${Math.round(68 + ratio * 90)}, 68)`;
    } else if (percentage < 50) {
        const ratio = (percentage - 25) / 25;
        color = `rgb(${Math.round(245 - ratio * 10)}, ${Math.round(158 + ratio * 75)}, ${Math.round(11 + ratio * 149)})`;
    } else if (percentage < 75) {
        const ratio = (percentage - 50) / 25;
        color = `rgb(${Math.round(235 - ratio * 135)}, ${Math.round(233 - ratio * 48)}, ${Math.round(160 - ratio * 31)})`;
    } else {
        const ratio = (percentage - 75) / 25;
        color = `rgb(${Math.round(100 - ratio * 84)}, ${Math.round(185 + ratio * 4)}, ${Math.round(129)})`;
    }
    progressBar.style.backgroundColor = color;
}

// ============================================
// EXPORT
// ============================================

function initExport() {
    // Note: btn-export, btn-save, btn-reset may no longer exist (moved to Admin panel)
    // Using optional chaining to prevent errors
    document.getElementById('btn-export')?.addEventListener('click', exportData);
    document.getElementById('btn-save')?.addEventListener('click', () => {
        saveToLocalStorage();
        alert('Data opgeslagen!');
    });
    document.getElementById('btn-reset')?.addEventListener('click', () => {
        if (confirm('⚠️ WAARSCHUWING: Alle gegevens worden gewist!\n\nDit verwijdert alle leerjaren, vakken, docenten en toewijzingen.\n\nWeet je het zeker?')) {
            localStorage.removeItem('werkverdelingsapp-state');
            alert('Alle data is gewist. De pagina wordt nu herladen.');
            location.reload();
        }
    });
}

function exportData() {
    const allBlokjes = generateAllBlokjes();
    let output = '# Werkverdeling Overzicht\n\n';
    output += `Gegenereerd op: ${new Date().toLocaleString('nl-NL')}\n\n`;

    // Stats
    const totalBlokjes = allBlokjes.length;
    const verdeeldBlokjes = new Set(state.toewijzingen.map(t => t.blokjeId)).size;
    output += `## Statistieken\n`;
    output += `- Totaal blokjes: ${totalBlokjes}\n`;
    output += `- Verdeeld: ${verdeeldBlokjes}\n`;
    output += `- Resterend: ${totalBlokjes - verdeeldBlokjes}\n\n`;

    // Per docent
    output += `## Per Docent\n\n`;

    state.docenten.forEach(docent => {
        output += `### ${docent.naam}\n\n`;

        [1, 2, 3, 4].forEach(periode => {
            const periodeBlokjes = state.toewijzingen
                .filter(t => t.docentId === docent.id && t.periode === periode)
                .map(t => allBlokjes.find(b => b.id === t.blokjeId))
                .filter(b => b);

            output += `**Periode ${periode}:** ${periodeBlokjes.length} blokjes\n`;
            periodeBlokjes.forEach(b => {
                output += `- ${b.vakNaam} (${b.klas})\n`;
            });
            output += '\n';
        });
    });

    // Download
    const blob = new Blob([output], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'werkverdeling.md';
    a.click();
    URL.revokeObjectURL(url);
}

// ============================================
// UTILITIES
// ============================================

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function getContrastColor(hexColor) {
    // Convert hex to RGB
    const r = parseInt(hexColor.slice(1, 3), 16);
    const g = parseInt(hexColor.slice(3, 5), 16);
    const b = parseInt(hexColor.slice(5, 7), 16);

    // Calculate luminance
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;

    return luminance > 0.5 ? '#000000' : '#ffffff';
}

function getClassTintedColor(baseColor, classIndex, totalClasses) {
    // Convert hex to RGB
    const r = parseInt(baseColor.slice(1, 3), 16);
    const g = parseInt(baseColor.slice(3, 5), 16);
    const b = parseInt(baseColor.slice(5, 7), 16);

    // Calculate tint factor (0 for first class, increases for subsequent classes)
    // Max lightening is 40% to keep colors recognizable
    const maxLightening = 0.4;
    const tintFactor = totalClasses > 1 ? (classIndex / (totalClasses - 1)) * maxLightening : 0;

    // Lighten color by blending with white
    const newR = Math.round(r + (255 - r) * tintFactor);
    const newG = Math.round(g + (255 - g) * tintFactor);
    const newB = Math.round(b + (255 - b) * tintFactor);

    // Convert back to hex
    return '#' + [newR, newG, newB].map(c => c.toString(16).padStart(2, '0')).join('');
}

// ============================================
// INITIALIZATION
// ============================================

document.addEventListener('DOMContentLoaded', () => {
    loadFromLocalStorage();

    initNavigation();
    initLeerjaarForm();
    initBasisweken();
    initCurriculumForm();
    initDocentenForm();
    initKlassenView();
    initTakenView();
    initVerdelingView();
    initExport();
    setupTakenbeheer();
    initEditVakForm();
    initEditTaakForm();

    // Initial renders
    renderLeerjarenLijst();
    renderVakkenLijst();
    renderDocentenLijst();
    renderTakenLijst();
    renderTakenSelectie();
    updateDocentSelector();
    updateLeerjaarSelector();
    renderSavedStates(); // Admin panel

    // Initialize Firebase Authentication
    initFirebaseAuth();

    console.log('Werkverdelingsapp initialized!');
});

// Make functions globally available
window.deleteVak = deleteVak;
window.deleteDocent = deleteDocent;
window.deleteLeerjaar = deleteLeerjaar;
window.deleteTaak = deleteTaak;
window.editVak = editVak;
window.closeEditVakModal = closeEditVakModal;
window.saveEditVak = saveEditVak;
window.editTaak = editTaak;
window.closeEditTaakModal = closeEditTaakModal;
window.saveEditTaak = saveEditTaak;
window.setUserRole = setUserRole;
window.editDocent = editDocent;
window.closeEditDocentModal = closeEditDocentModal;
window.saveEditDocent = saveEditDocent;
window.editLeerjaar = editLeerjaar;
window.closeEditLeerjaarModal = closeEditLeerjaarModal;
window.saveEditLeerjaar = saveEditLeerjaar;
window.addKlasToLeerjaar = addKlasToLeerjaar;
window.removeKlasFromLeerjaar = removeKlasFromLeerjaar;

// Admin panel functions
window.saveNamedState = saveNamedState;
window.loadNamedState = loadNamedState;
window.deleteNamedState = deleteNamedState;
window.exportToFile = exportToFile;
window.importFromFile = importFromFile;
window.resetAllData = resetAllData;
window.exportPviToExcel = exportPviToExcel;

// Authentication functions
window.handleLogin = handleLogin;
window.handleLogout = handleLogout;
window.showForgotPassword = showForgotPassword;
window.closeForgotPasswordModal = closeForgotPasswordModal;
window.handleForgotPassword = handleForgotPassword;

// Firestore save state functions
window.createSaveStateFirestore = createSaveStateFirestore;
window.loadSaveStateFirestore = loadSaveStateFirestore;
window.deleteSaveStateFirestore = deleteSaveStateFirestore;
window.smartSaveState = smartSaveState;

// User management functions
window.createNewUser = createNewUser;
window.editUser = editUser;
window.closeEditUserModal = closeEditUserModal;
window.saveEditUser = saveEditUser;
window.deleteUser = deleteUser;

// Admin functions
window.switchActiveTeam = switchActiveTeam;
window.createNewTeam = createNewTeam;
window.deleteTeam = deleteTeam;
window.editTeamSettings = editTeamSettings;
window.duplicateTeam = duplicateTeam;

// Schooljaren functions
window.createSchooljaar = createSchooljaar;
window.editSchooljaar = editSchooljaar;
window.deleteSchooljaar = deleteSchooljaar;
window.closeEditSchooljaarModal = closeEditSchooljaarModal;
window.saveEditSchooljaar = saveEditSchooljaar;

// Team modal functions
window.closeEditTeamModal = closeEditTeamModal;
window.saveEditTeam = saveEditTeam;

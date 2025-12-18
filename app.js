/* ============================================
   WERKVERDELINGSAPP - JavaScript Application
   ============================================ */

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
    const saveBtn = document.getElementById('btn-save');
    saveBtn.textContent = '✅';
    setTimeout(() => {
        saveBtn.textContent = '💾';
    }, 1000);
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
    const adminTabs = document.querySelectorAll('.nav-tab[data-role="admin"]');

    adminTabs.forEach(tab => {
        if (role === 'teamleider') {
            tab.classList.remove('role-hidden');
        } else {
            tab.classList.add('role-hidden');
        }
    });
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

    // Save button
    document.getElementById('btn-save-basisweken')?.addEventListener('click', () => {
        [1, 2, 3, 4].forEach(p => {
            const input = document.getElementById(`basisweken-p${p}`);
            state.basisweken[p] = parseInt(input.value) || 8;
        });
        state.basiswekenOpgeslagen = true;
        saveToLocalStorage();
        updateBasiswekenSummary();
        updateVakFormState();
        // Collapse the card
        document.getElementById('basisweken-card')?.classList.add('collapsed');
    });
}

// Toggle collapsible card
function toggleCollapsible(cardId) {
    const card = document.getElementById(cardId);
    if (card) {
        card.classList.toggle('collapsed');
    }
}
window.toggleCollapsible = toggleCollapsible;

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

    // Function to update taak form state
    function updateTaakFormState() {
        if (taakFormCard) {
            if (state.wekenOpgeslagen) {
                taakFormCard.classList.remove('disabled-form');
                taakFormCard.querySelector('.disabled-overlay')?.remove();
            } else {
                taakFormCard.classList.add('disabled-form');
                if (!taakFormCard.querySelector('.disabled-overlay')) {
                    const overlay = document.createElement('div');
                    overlay.className = 'disabled-overlay';
                    overlay.innerHTML = '<p>⚠️ Stel eerst de periodeweken in</p>';
                    taakFormCard.appendChild(overlay);
                }
            }
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

        wekenForm.addEventListener('submit', (e) => {
            e.preventDefault();
            state.wekenPerPeriode[1] = parseInt(document.getElementById('weken-p1').value) || 10;
            state.wekenPerPeriode[2] = parseInt(document.getElementById('weken-p2').value) || 10;
            state.wekenPerPeriode[3] = parseInt(document.getElementById('weken-p3').value) || 10;
            state.wekenPerPeriode[4] = parseInt(document.getElementById('weken-p4').value) || 10;
            state.wekenOpgeslagen = true;
            saveToLocalStorage();
            updateTaakFormState();
            updateWekenPeriodeSummary();
            // Collapse the card
            document.getElementById('weken-periode-card')?.classList.add('collapsed');
        });
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

        // Mutual exclusivity: voor iedereen <-> max docenten
        const voorIedereenCheck = document.getElementById('taak-voor-iedereen');
        const maxDocentenCheck = document.getElementById('taak-max-docenten-check');
        const maxDocentenContainer = document.getElementById('taak-max-docenten-container');

        voorIedereenCheck.addEventListener('change', () => {
            if (voorIedereenCheck.checked) {
                maxDocentenCheck.checked = false;
                maxDocentenContainer.style.display = 'none';
            }
        });

        maxDocentenCheck.addEventListener('change', () => {
            if (maxDocentenCheck.checked) {
                voorIedereenCheck.checked = false;
                maxDocentenContainer.style.display = 'block';
            } else {
                maxDocentenContainer.style.display = 'none';
            }
        });

        taakForm.addEventListener('submit', (e) => {
            e.preventDefault();
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
                naam: document.getElementById('taak-naam').value.trim(),
                kleur: document.getElementById('taak-kleur').value || '#6366f1',
                totaalUren: totaalUren,
                urenPerPeriode: urenPerPeriode,
                verdeling: verdeling,
                voorIedereen: document.getElementById('taak-voor-iedereen').checked,
                maxDocenten: document.getElementById('taak-max-docenten-check').checked
                    ? parseInt(document.getElementById('taak-max-docenten').value) || 1
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

    container.innerHTML = state.taken.map(taak => {
        const totaalUren = Object.values(taak.urenPerPeriode).reduce((a, b) => a + b, 0);
        const kleur = taak.kleur || '#6366f1';

        return `
            <div class="vak-item taak-item" style="border-left-color: ${kleur}">
                <div class="taak-doc-icon" style="background: ${kleur}">
                    <div class="taak-doc-fold"></div>
                    <div class="taak-doc-lines">
                        <span></span><span></span><span></span>
                    </div>
                </div>
                <div class="vak-info">
                    <div class="vak-naam">${taak.naam}</div>
                    <div class="vak-details">${totaalUren.toFixed(1)} uur totaal ${taak.voorIedereen ? '• 👥 Voor alle teamleden' : (taak.maxDocenten ? '• ❗ Taak voor ' + taak.maxDocenten + ' teamleden' : '')}</div>
                    <div class="vak-periodes">
                        <span class="vak-periode">P1: ${taak.urenPerPeriode[1].toFixed(1)}u</span>
                        <span class="vak-periode">P2: ${taak.urenPerPeriode[2].toFixed(1)}u</span>
                        <span class="vak-periode">P3: ${taak.urenPerPeriode[3].toFixed(1)}u</span>
                        <span class="vak-periode">P4: ${taak.urenPerPeriode[4].toFixed(1)}u</span>
                    </div>
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
    document.getElementById('edit-taak-voor-iedereen').checked = taak.voorIedereen;

    // Max docenten
    const hasMaxDocenten = taak.maxDocenten !== null && taak.maxDocenten !== undefined;
    document.getElementById('edit-taak-max-docenten-check').checked = hasMaxDocenten;
    document.getElementById('edit-taak-max-docenten-container').style.display = hasMaxDocenten ? 'block' : 'none';
    document.getElementById('edit-taak-max-docenten').value = taak.maxDocenten || 1;

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
    taak.voorIedereen = document.getElementById('edit-taak-voor-iedereen').checked;
    taak.maxDocenten = document.getElementById('edit-taak-max-docenten-check').checked
        ? parseInt(document.getElementById('edit-taak-max-docenten').value) || 1
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

    // Mutual exclusivity: voor iedereen <-> max docenten
    const voorIedereenCheck = document.getElementById('edit-taak-voor-iedereen');
    const maxDocentenCheck = document.getElementById('edit-taak-max-docenten-check');
    const maxDocentenContainer = document.getElementById('edit-taak-max-docenten-container');

    voorIedereenCheck.addEventListener('change', () => {
        if (voorIedereenCheck.checked) {
            maxDocentenCheck.checked = false;
            maxDocentenContainer.style.display = 'none';
        }
    });

    maxDocentenCheck.addEventListener('change', () => {
        if (maxDocentenCheck.checked) {
            voorIedereenCheck.checked = false;
            maxDocentenContainer.style.display = 'block';
        } else {
            maxDocentenContainer.style.display = 'none';
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

        return `
            <div class="leerjaar-group">
                <div class="leerjaar-group-header">
                    <h4>🎓 ${escapeHtml(naam)}</h4>
                    <span class="leerjaar-klassen-badge">${klassenList}</span>
                    <span class="leerjaar-bot-info">Per klas: ${totalBOT.toFixed(1)} BOT (klokuren)</span>
                </div>
                ${basisVakken.length > 0 ? `<div class="vak-type-label">Basisweken <span class="vak-type-bot">Per klas: ${basisBOT.toFixed(1)} BOT (klokuren)</span></div><div class="vakken-grid">${basisVakken.map(vak => renderVakItem(vak)).join('')}</div>` : ''}
                ${owVakken.length > 0 ? `<div class="vak-type-label">Ontwikkelweken <span class="vak-type-bot">Per klas: ${owBOT.toFixed(1)} BOT (klokuren)</span></div><div class="vakken-grid">${owVakken.map(vak => renderVakItem(vak)).join('')}</div>` : ''}
            </div>
        `;
    }).join('');
}

function renderVakItem(vak) {
    const opslagfactor = vak.opslagfactor || 40;
    const splitsbaar = vak.splitsbaar !== false;
    let periodeInfo = '';

    if (vak.type === 'ontwikkelweken' && vak.ontwikkelweken) {
        const ow = vak.ontwikkelweken;
        let headerRow = '<tr><th></th>';
        let eenhedenRow = '<tr><td>Eenh.</td>';
        let klouurenRow = '<tr><td>Klok.</td>';
        for (let i = 1; i <= 8; i++) {
            const eenheden = ow[i] || 0;
            const klokuren = (eenheden * 0.5).toFixed(1);
            headerRow += `<th>OW${i}</th>`;
            eenhedenRow += `<td>${eenheden}</td>`;
            klouurenRow += `<td>${klokuren}</td>`;
        }
        headerRow += '</tr>';
        eenhedenRow += '</tr>';
        klouurenRow += '</tr>';
        periodeInfo = `<table class="vak-periode-tabel">${headerRow}${eenhedenRow}${klouurenRow}</table>`;
    } else if (vak.periodes) {
        const p = vak.periodes;
        let headerRow = '<tr><th></th>';
        let eenhedenRow = '<tr><td>Eenh./wk</td>';
        let klouurenRow = '<tr><td>Klok./wk</td>';
        for (let i = 1; i <= 4; i++) {
            const eenhedenPerWeek = p[i] || 0;
            const klokurenPerWeek = (eenhedenPerWeek * 0.5).toFixed(1);
            headerRow += `<th>P${i}</th>`;
            eenhedenRow += `<td>${eenhedenPerWeek}</td>`;
            klouurenRow += `<td>${klokurenPerWeek}</td>`;
        }
        headerRow += '</tr>';
        eenhedenRow += '</tr>';
        klouurenRow += '</tr>';
        periodeInfo = `<table class="vak-periode-tabel">${headerRow}${eenhedenRow}${klouurenRow}</table>`;
    }

    return `
        <div class="vak-item vak-card" style="--vak-kleur: ${vak.kleur}">
            <div class="vak-card-header">
                <div class="vak-color-bar" style="background: ${vak.kleur}"></div>
                <div class="vak-header-content">
                    <div class="vak-naam">${escapeHtml(vak.naam)}</div>
                    <div class="vak-meta-inline">
                        <span>VZNZ ${opslagfactor}%</span>
                        <span>${splitsbaar ? '✂️' : '🔒'}</span>
                    </div>
                </div>
                <div class="vak-actions">
                    <button onclick="editVak('${vak.id}')" title="Bewerken">✏️</button>
                    <button onclick="deleteVak('${vak.id}')" title="Verwijderen">🗑️</button>
                </div>
            </div>
            <div class="vak-card-body">
                <div class="vak-periodes">${periodeInfo}</div>
            </div>
        </div>
    `;
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
    const form = document.getElementById('form-docent');
    form.addEventListener('submit', (e) => {
        e.preventDefault();

        const naam = document.getElementById('docent-naam').value.trim();
        const aanstelling = parseFloat(document.getElementById('docent-aanstelling').value) || 1.0;
        const inhouding = parseFloat(document.getElementById('docent-inhouding').value) || 0;

        if (naam) {
            addDocent(naam, aanstelling, inhouding);
            document.getElementById('docent-naam').value = '';
            document.getElementById('docent-aanstelling').value = '1.0';
            document.getElementById('docent-inhouding').value = '0';
        }
    });
}

function addDocent(naam, aanstellingBruto = 1.0, inhouding = 0) {
    const docent = {
        id: generateId(),
        naam: naam,
        aanstellingBruto: aanstellingBruto,
        inhouding: inhouding
    };
    state.docenten.push(docent);
    saveToLocalStorage();
    renderDocentenLijst();
    updateDocentSelector();
}

function renderDocentenLijst() {
    const container = document.getElementById('docenten-lijst');

    if (state.docenten.length === 0) {
        container.innerHTML = '<p class="empty-state">Nog geen teamleden toegevoegd.</p>';
        return;
    }

    // Constants for FTE calculation
    const BESCHIKBAAR_PER_FTE = 1600; // 1659 - 59 uur deskundigheidsbevordering

    // Sort docenten by second letter onwards
    const sortedDocenten = [...state.docenten].sort((a, b) =>
        a.naam.substring(1).localeCompare(b.naam.substring(1))
    );

    container.innerHTML = sortedDocenten.map(docent => {
        // Get FTE values with defaults for backward compatibility
        const brutoFTE = docent.aanstellingBruto ?? 1.0;
        const inhouding = docent.inhouding ?? 0;

        // Calculations
        const nettoFTE = brutoFTE - inhouding;
        const beschikbareUren = nettoFTE * BESCHIKBAAR_PER_FTE;
        const onderwijsUren = beschikbareUren * 0.75;
        const takenUren = beschikbareUren * 0.25;

        return `
            <div class="docent-card">
                <div class="docent-header">
                    <div class="docent-naam-groot">${escapeHtml(docent.naam)}</div>
                    <div class="docent-actions">
                        <button class="docent-edit" onclick="editDocent('${docent.id}')" title="Bewerken">✏️</button>
                        <button class="docent-delete" onclick="deleteDocent('${docent.id}')" title="Verwijderen">🗑️</button>
                    </div>
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
    const sortedDocenten = [...state.docenten].sort((a, b) => a.naam.substring(1).localeCompare(b.naam.substring(1)));
    selector.innerHTML = '<option value="">-- Selecteer docent --</option>' +
        sortedDocenten.map(d => `<option value="${d.id}">${escapeHtml(d.naam)}</option>`).join('');
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
    const sortedDocenten = [...state.docenten].sort((a, b) => a.naam.substring(1).localeCompare(b.naam.substring(1)));
    selector.innerHTML = '<option value="">-- Selecteer jezelf --</option>' +
        sortedDocenten.map(d => `<option value="${d.id}" ${klassenState.geselecteerdeDocent === d.id ? 'selected' : ''}>${escapeHtml(d.naam)}</option>`).join('');
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
        container.innerHTML = '<p class="empty-state">Selecteer een docent, leerjaar en klas om het curriculum te zien</p>';
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
        container.innerHTML = '<p class="empty-state">Geen vakken voor dit leerjaar</p>';
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
                    ${basisVakkenMetPeriode.length === 0 ? '<p class="empty-state" style="font-size:0.75rem">Geen vakken</p>' : ''}
                </div>
                <div class="periode-section ow-section">
                    <div class="periode-section-header">
                        <h4>⭐ Ontwikkelweek ${ow1}</h4>
                    </div>
                    ${renderVakSectionsOW(owVakkenMetOW1, ow1)}
                    ${owVakkenMetOW1.length === 0 ? '<p class="empty-state" style="font-size:0.75rem">Geen vakken</p>' : ''}
                </div>
                <div class="periode-section ow-section">
                    <div class="periode-section-header">
                        <h4>⭐ Ontwikkelweek ${ow2}</h4>
                    </div>
                    ${renderVakSectionsOW(owVakkenMetOW2, ow2)}
                    ${owVakkenMetOW2.length === 0 ? '<p class="empty-state" style="font-size:0.75rem">Geen vakken</p>' : ''}
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
    const sortedDocenten = [...state.docenten].sort((a, b) => a.naam.substring(1).localeCompare(b.naam.substring(1)));
    selector.innerHTML = '<option value="">-- Selecteer jezelf --</option>' +
        sortedDocenten.map(d => `<option value="${d.id}" ${takenViewState.geselecteerdeDocent === d.id ? 'selected' : ''}>${escapeHtml(d.naam)}</option>`).join('');
}

function renderTakenSelectie() {
    const container = document.getElementById('taken-selectie-grid');
    if (!container) return;

    updateTakenDocentSelector();

    if (!takenViewState.geselecteerdeDocent) {
        container.innerHTML = '<p class="empty-state">Selecteer een docent om taken te zien</p>';
        return;
    }

    if (state.taken.length === 0) {
        container.innerHTML = '<p class="empty-state">Nog geen taken aangemaakt in Takenbeheer</p>';
        return;
    }

    container.innerHTML = state.taken.map(taak => {
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

        // Build docenten text
        let docentenText = '';
        if (isVoorIedereen) {
            docentenText = '👥 <strong>Voor iedereen</strong> - Deze taak is automatisch toegewezen aan alle docenten';
        } else if (andereDocenten.length > 0) {
            if (isMaxOverschreden) {
                const teamlidText = overschrijding === 1 ? 'teamlid' : 'teamleden';
                docentenText = `⚠️ Ook geselecteerd door: <strong>${andereDocenten.join(', ')}</strong> <span class="max-overschreden">(Maximum aantal overschreden met ${overschrijding} ${teamlidText})</span>`;
            } else {
                docentenText = `Ook geselecteerd door: <strong>${andereDocenten.join(', ')}</strong>`;
            }
        } else if (taak.maxDocenten) {
            docentenText = `<span class="max-docenten-info">Max. ${taak.maxDocenten} docent${taak.maxDocenten > 1 ? 'en' : ''}</span>`;
        }

        const kleur = taak.kleur || '#6366f1';
        const itemClass = isVoorIedereen
            ? 'taak-selectie-item voor-iedereen'
            : isSelected
                ? 'taak-selectie-item selected'
                : 'taak-selectie-item';

        return `
            <div class="${itemClass}" 
                 data-taak-id="${taak.id}"
                 ${!isVoorIedereen ? `onclick="toggleTaakSelectie('${taak.id}')"` : ''}>
                <div class="taak-selectie-checkbox">
                    ${isSelected ? '✓' : ''}
                </div>
                <div class="taak-selectie-info">
                    <div class="taak-selectie-header">
                        <span class="taak-selectie-naam">${escapeHtml(taak.naam)}${taak.maxDocenten ? ` <span class="max-docenten-info">(${taak.maxDocenten} ${taak.maxDocenten === 1 ? 'teamlid' : 'teamleden'})</span>` : ''}</span>
                        ${isVoorIedereen ? '<span class="taak-selectie-badge">Voor iedereen</span>' : ''}
                    </div>
                    <div class="taak-selectie-meta">
                        <span>⏱️ ${totaalUren.toFixed(1)} uur totaal</span>
                    </div>
                    <div class="taak-selectie-uren-grid">
                        <div class="taak-uren-periode">
                            <div class="taak-uren-periode-label">P1</div>
                            <div class="taak-uren-periode-value">${taak.urenPerPeriode[1].toFixed(1)}u</div>
                        </div>
                        <div class="taak-uren-periode">
                            <div class="taak-uren-periode-label">P2</div>
                            <div class="taak-uren-periode-value">${taak.urenPerPeriode[2].toFixed(1)}u</div>
                        </div>
                        <div class="taak-uren-periode">
                            <div class="taak-uren-periode-label">P3</div>
                            <div class="taak-uren-periode-value">${taak.urenPerPeriode[3].toFixed(1)}u</div>
                        </div>
                        <div class="taak-uren-periode">
                            <div class="taak-uren-periode-label">P4</div>
                            <div class="taak-uren-periode-value">${taak.urenPerPeriode[4].toFixed(1)}u</div>
                        </div>
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
        container.innerHTML = '<p class="empty-state">Selecteer een docent om je overzicht te zien</p>';
        // Also clear the taken grid
        const takenGrid = document.getElementById('taken-grid');
        if (takenGrid) {
            takenGrid.innerHTML = '<p class="empty-state">Selecteer een docent om taken te zien</p>';
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

        // Add new totale inzet bar
        const totaleInzetContainer = document.createElement('div');
        totaleInzetContainer.className = 'totale-inzet-container';
        totaleInzetContainer.innerHTML = `
            <div class="totale-inzet-row">
                <div class="totale-inzet-label">Totale inzet</div>
                <div class="totale-inzet-breakdown">
                    <span class="inzet-item">🎓 Onderwijs: ${totaalOnderwijs.toFixed(1)}u</span>
                    <span class="inzet-item">📋 Taken: ${totaalTaakuren.toFixed(1)}u</span>
                </div>
                <div class="totale-inzet-value">${totaleInzet.toFixed(1)} uur</div>
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
        container.innerHTML = '<p class="empty-state">Selecteer een docent om taken te zien</p>';
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

    container.innerHTML = mijnTaken.map(taak => {
        const totaalUren = Object.values(taak.urenPerPeriode).reduce((a, b) => a + b, 0);
        totaalTaakuren += totaalUren;
        const kleur = taak.kleur || '#6366f1';

        // Get other docents who have this task
        let sharedWithNames = [];
        if (!taak.voorIedereen) {
            const otherDocentIds = state.docentTaken
                .filter(dt => dt.taakId === taak.id && dt.docentId !== state.geselecteerdeDocent)
                .map(dt => dt.docentId);
            sharedWithNames = otherDocentIds.map(id => {
                const docent = state.docenten.find(d => d.id === id);
                return docent ? docent.naam : 'Onbekend';
            });
        }

        const sharedText = taak.voorIedereen
            ? '<div class="mijn-shared-with">👥 Taak voor iedereen</div>'
            : sharedWithNames.length > 0
                ? `<div class="mijn-shared-with">Ook door: ${sharedWithNames.map(n => escapeHtml(n)).join(', ')}</div>`
                : '';

        return `
            <div class="mijn-taak-block" style="border-left-color: ${kleur}">
                <div class="taak-doc-icon" style="background: ${kleur}">
                    <div class="taak-doc-fold"></div>
                    <div class="taak-doc-lines">
                        <span></span><span></span><span></span>
                    </div>
                </div>
                <div class="mijn-taak-info">
                    <div class="mijn-vak-header">
                        <span class="mijn-vak-naam">${escapeHtml(taak.naam)}</span>
                        ${taak.voorIedereen ? '<span class="mijn-vak-klas">Voor iedereen</span>' : ''}
                    </div>
                <div class="mijn-taak-uren-grid">
                    <div class="mijn-taak-uren-item">
                        <span class="mijn-taak-uren-label">P1:</span>
                        <span class="mijn-taak-uren-value">${taak.urenPerPeriode[1].toFixed(1)}u</span>
                    </div>
                    <div class="mijn-taak-uren-item">
                        <span class="mijn-taak-uren-label">P2:</span>
                        <span class="mijn-taak-uren-value">${taak.urenPerPeriode[2].toFixed(1)}u</span>
                    </div>
                    <div class="mijn-taak-uren-item">
                        <span class="mijn-taak-uren-label">P3:</span>
                        <span class="mijn-taak-uren-value">${taak.urenPerPeriode[3].toFixed(1)}u</span>
                    </div>
                    <div class="mijn-taak-uren-item">
                        <span class="mijn-taak-uren-label">P4:</span>
                        <span class="mijn-taak-uren-value">${taak.urenPerPeriode[4].toFixed(1)}u</span>
                    </div>
                    <div class="mijn-taak-uren-item totaal">
                        <span class="mijn-taak-uren-label">Totaal:</span>
                        <span class="mijn-taak-uren-value">${totaalUren.toFixed(1)}u</span>
                    </div>
                </div>
                ${sharedText}
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

function renderDashboard() {
    const allBlokjes = generateAllBlokjes();
    const totalBlokjes = allBlokjes.length;
    const verdeeldBlokjes = new Set(state.toewijzingen.map(t => t.blokjeId)).size;
    const resterend = totalBlokjes - verdeeldBlokjes;
    const progressPercent = totalBlokjes > 0 ? Math.round((verdeeldBlokjes / totalBlokjes) * 100) : 0;

    // Update stats
    document.getElementById('stat-total').textContent = totalBlokjes;
    document.getElementById('stat-verdeeld').textContent = verdeeldBlokjes;
    document.getElementById('stat-resterend').textContent = resterend;
    document.getElementById('progress-bar').style.width = progressPercent + '%';
    document.getElementById('progress-text').textContent = progressPercent + '% verdeeld';

    // Find conflicts
    const conflicts = findConflicts();
    document.getElementById('stat-conflicten').textContent = conflicts.length;

    // Render conflicts
    const conflictenContainer = document.getElementById('conflicten-container');
    if (conflicts.length > 0) {
        conflictenContainer.style.display = 'block';
        document.getElementById('conflicten-lijst').innerHTML = conflicts.map(c => {
            const blokje = allBlokjes.find(b => b.id === c.blokjeId);
            const docenten = c.docenten.map(id => state.docenten.find(d => d.id === id)?.naam).join(' ↔ ');
            return `<div class="conflict-item">${escapeHtml(blokje?.vakNaam || '')} ${blokje?.klas || ''} P${blokje?.periode || ''}: ${docenten}</div>`;
        }).join('');
    } else {
        conflictenContainer.style.display = 'none';
    }

    // Render docent cards
    renderDashboardGrid(allBlokjes);
}

function findConflicts() {
    const blokjeToewijzingen = {};

    state.toewijzingen.forEach(t => {
        if (!blokjeToewijzingen[t.blokjeId]) {
            blokjeToewijzingen[t.blokjeId] = [];
        }
        blokjeToewijzingen[t.blokjeId].push(t.docentId);
    });

    return Object.entries(blokjeToewijzingen)
        .filter(([_, docenten]) => docenten.length > 1)
        .map(([blokjeId, docenten]) => ({ blokjeId, docenten }));
}

function renderDashboardGrid(allBlokjes) {
    const container = document.getElementById('dashboard-grid');

    if (state.docenten.length === 0) {
        container.innerHTML = '<p class="empty-state">Voeg docenten toe om het dashboard te zien</p>';
        return;
    }

    container.innerHTML = state.docenten.map(docent => {
        const initials = docent.naam.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
        const docentToewijzingen = state.toewijzingen.filter(t => t.docentId === docent.id);

        // Calculate onderwijs hours per period
        let totaalOnderwijsUren = 0;
        const onderwijsPerPeriode = [1, 2, 3, 4].map(periode => {
            const basiswekenAantal = state.basisweken[periode] || 8;
            const ow1 = (periode - 1) * 2 + 1;
            const ow2 = (periode - 1) * 2 + 2;

            // Get blokjes for this period
            const periodeBlokjes = docentToewijzingen
                .filter(t => {
                    const pStr = t.periode?.toString() || '';
                    return pStr === `P${periode}` || pStr === String(periode);
                })
                .map(t => allBlokjes.find(b => b.id === t.blokjeId))
                .filter(b => b);

            const ow1Blokjes = docentToewijzingen
                .filter(t => t.periode === `OW${ow1}`)
                .map(t => allBlokjes.find(b => b.id === t.blokjeId))
                .filter(b => b);

            const ow2Blokjes = docentToewijzingen
                .filter(t => t.periode === `OW${ow2}`)
                .map(t => allBlokjes.find(b => b.id === t.blokjeId))
                .filter(b => b);

            // Calculate hours (including VZNZ)
            let periodeUren = 0;
            periodeBlokjes.forEach(b => {
                const vak = state.vakken.find(v => v.id === b.vakId);
                const factor = vak ? (vak.opslagfactor || 40) : 40;
                periodeUren += 0.5 * basiswekenAantal * (1 + factor / 100);
            });
            [...ow1Blokjes, ...ow2Blokjes].forEach(b => {
                const vak = state.vakken.find(v => v.id === b.vakId);
                const factor = vak ? (vak.opslagfactor || 40) : 40;
                periodeUren += 0.5 * (1 + factor / 100);
            });

            totaalOnderwijsUren += periodeUren;

            // Group lessons by vak for compact display
            const lessenPerVak = {};
            [...periodeBlokjes, ...ow1Blokjes, ...ow2Blokjes].forEach(b => {
                const key = b.vakNaam;
                if (!lessenPerVak[key]) {
                    lessenPerVak[key] = { kleur: b.kleur, klassen: new Set() };
                }
                lessenPerVak[key].klassen.add(b.klas);
            });

            const lessenHTML = Object.entries(lessenPerVak).map(([vak, data]) =>
                `<span class="pvi-les" style="border-left-color: ${data.kleur}">${vak} (${[...data.klassen].join(', ')})</span>`
            ).join('');

            return { periode, uren: periodeUren, lessenHTML, hasData: Object.keys(lessenPerVak).length > 0 };
        });

        // Get tasks for this docent
        let totaalTaakUren = 0;
        const mijnTaken = state.taken.filter(taak => {
            if (taak.voorIedereen) return true;
            return state.docentTaken.some(dt => dt.docentId === docent.id && dt.taakId === taak.id);
        });

        const takenPerPeriode = [1, 2, 3, 4].map(periode => {
            const takenHTML = mijnTaken.map(taak => {
                const uren = taak.urenPerPeriode[periode] || 0;
                if (uren === 0) return '';
                return `<span class="pvi-taak">${taak.naam}: ${uren.toFixed(1)}u</span>`;
            }).filter(h => h).join('');

            const periodeUren = mijnTaken.reduce((sum, taak) => sum + (taak.urenPerPeriode[periode] || 0), 0);
            totaalTaakUren += periodeUren;

            return { periode, uren: periodeUren, takenHTML, hasData: takenHTML.length > 0 };
        });

        const totaalUren = totaalOnderwijsUren + totaalTaakUren;

        return `
            <div class="pvi-card">
                <div class="pvi-card-header">
                    <div class="pvi-avatar">${initials}</div>
                    <div class="pvi-naam">${escapeHtml(docent.naam)}</div>
                    <div class="pvi-totaal">${totaalUren.toFixed(1)}u</div>
                </div>
                <div class="pvi-content">
                    <div class="pvi-section">
                        <div class="pvi-section-title">🎓 Onderwijs</div>
                        <div class="pvi-periodes">
                            ${onderwijsPerPeriode.map(p => `
                                <div class="pvi-periode ${!p.hasData ? 'empty' : ''}">
                                    <div class="pvi-periode-header">P${p.periode} <span>${p.uren.toFixed(1)}u</span></div>
                                    <div class="pvi-periode-content">${p.lessenHTML || '<span class="pvi-empty">-</span>'}</div>
                                </div>
                            `).join('')}
                        </div>
                        <div class="pvi-subtotal">Subtotaal: ${totaalOnderwijsUren.toFixed(1)}u</div>
                    </div>
                    <div class="pvi-section">
                        <div class="pvi-section-title">📋 Taken</div>
                        <div class="pvi-periodes">
                            ${takenPerPeriode.map(p => `
                                <div class="pvi-periode ${!p.hasData ? 'empty' : ''}">
                                    <div class="pvi-periode-header">P${p.periode} <span>${p.uren.toFixed(1)}u</span></div>
                                    <div class="pvi-periode-content">${p.takenHTML || '<span class="pvi-empty">-</span>'}</div>
                                </div>
                            `).join('')}
                        </div>
                        <div class="pvi-subtotal">Subtotaal: ${totaalTaakUren.toFixed(1)}u</div>
                    </div>
                </div>
                <div class="pvi-footer">
                    <span>Totale inzet</span>
                    <span class="pvi-footer-total">${totaalUren.toFixed(1)} uur</span>
                </div>
            </div>
        `;
    }).join('');
}

// ============================================
// EXPORT
// ============================================

function initExport() {
    document.getElementById('btn-export').addEventListener('click', exportData);
    document.getElementById('btn-save').addEventListener('click', () => {
        saveToLocalStorage();
        alert('Data opgeslagen!');
    });
    document.getElementById('btn-reset').addEventListener('click', () => {
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

    // Check role and show role selection modal if needed
    checkRoleOnLoad();

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

/* ============================================
   WERKVERDELINGSAPP - JavaScript Application
   ============================================ */

// ============================================
// STATE MANAGEMENT
// ============================================

const state = {
    leerjaren: [], // { nummer, aantalKlassen, prefix, klassen[] }
    vakken: [],
    docenten: [],
    toewijzingen: [], // { blokjeId, docentId, periode }
    basisweken: { 1: 8, 2: 8, 3: 8, 4: 8 }, // aantal lesweken per periode
    basiswekenOpgeslagen: false, // track if basisweken have been saved
    wekenPerPeriode: { 1: 10, 2: 10, 3: 10, 4: 10 }, // totaal weken per periode voor taken
    wekenOpgeslagen: false, // track if weken have been saved
    taken: [], // { id, naam, urenPerPeriode: {1,2,3,4}, voorIedereen: boolean }
    docentTaken: [], // { docentId, taakId, periodes: {1,2,3,4} }
    geselecteerdeDocent: null
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

        const nummer = parseInt(document.getElementById('leerjaar-nummer').value);
        const aantalKlassen = parseInt(document.getElementById('leerjaar-klassen').value);
        const prefix = document.getElementById('leerjaar-prefix').value.trim();

        // Generate class names
        const klassen = [];
        for (let i = 1; i <= aantalKlassen; i++) {
            klassen.push(prefix + i);
        }

        // Check if leerjaar already exists
        const existing = state.leerjaren.find(l => l.nummer === nummer);
        if (existing) {
            existing.aantalKlassen = aantalKlassen;
            existing.prefix = prefix;
            existing.klassen = klassen;
        } else {
            state.leerjaren.push({ nummer, aantalKlassen, prefix, klassen });
        }

        state.leerjaren.sort((a, b) => a.nummer - b.nummer);
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
                <span class="leerjaar-badge">Jaar ${lj.nummer}</span>
                <span class="leerjaar-details">${lj.aantalKlassen} klassen (${lj.klassen.join(', ')})</span>
            </div>
            <button class="leerjaar-delete" onclick="deleteLeerjaar(${lj.nummer})" title="Verwijderen">🗑️</button>
        </div>
    `).join('');
}

function deleteLeerjaar(nummer) {
    if (!confirm(`Jaar ${nummer} verwijderen? Alle gekoppelde vakken worden ook verwijderd.`)) return;
    state.leerjaren = state.leerjaren.filter(l => l.nummer !== nummer);
    state.vakken = state.vakken.filter(v => v.leerjaar !== nummer);
    saveToLocalStorage();
    renderLeerjarenLijst();
    renderVakkenLijst();
    updateLeerjaarSelector();
}

function updateLeerjaarSelector() {
    const selector = document.getElementById('vak-leerjaar');
    if (!selector) return;
    selector.innerHTML = '<option value="">-- Selecteer leerjaar --</option>' +
        state.leerjaren.map(lj => `<option value="${lj.nummer}">Jaar ${lj.nummer} (${lj.prefix}1-${lj.prefix}${lj.aantalKlassen})</option>`).join('');
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
                    overlay.innerHTML = '<p>⚠️ Sla eerst de basisweken op</p>';
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
    const vakTypeRadios = document.querySelectorAll('input[name="vak-type"]');

    // Toggle between basisweken and ontwikkelweken inputs
    vakTypeRadios.forEach(radio => {
        radio.addEventListener('change', () => {
            if (radio.value === 'basisweken') {
                basiswekenInputs.style.display = '';
                ontwikkelwekenInputs.style.display = 'none';
            } else {
                basiswekenInputs.style.display = 'none';
                ontwikkelwekenInputs.style.display = '';
            }
        });
    });

    form.addEventListener('submit', (e) => {
        e.preventDefault();

        const leerjaarNummer = parseInt(document.getElementById('vak-leerjaar').value);
        const leerjaar = state.leerjaren.find(l => l.nummer === leerjaarNummer);

        if (!leerjaar) {
            alert('Selecteer eerst een leerjaar!');
            return;
        }

        const vakType = document.querySelector('input[name="vak-type"]:checked').value;

        const vak = {
            id: generateId(),
            leerjaar: leerjaarNummer,
            type: vakType,
            naam: document.getElementById('vak-naam').value.trim(),
            kleur: document.getElementById('vak-kleur').value,
            klassen: leerjaar.klassen,
            splitsbaar: document.getElementById('vak-splitsbaar').checked,
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
        document.getElementById('vak-splitsbaar').checked = true;
        document.getElementById('vak-opslagfactor').value = 40;
        // Reset to basisweken view
        basiswekenInputs.style.display = '';
        ontwikkelwekenInputs.style.display = 'none';
        document.querySelector('input[name="vak-type"][value="basisweken"]').checked = true;
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
                    overlay.innerHTML = '<p>⚠️ Sla eerst de weken per periode op</p>';
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
        // Toggle periode inputs based on radio selection
        document.querySelectorAll('input[name="taak-verdeling"]').forEach(radio => {
            radio.addEventListener('change', () => {
                if (document.querySelector('input[name="taak-verdeling"]:checked').value === 'afwijkend') {
                    periodesContainer.style.display = '';
                } else {
                    periodesContainer.style.display = 'none';
                }
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
            const verdeling = document.querySelector('input[name="taak-verdeling"]:checked').value;

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
                    <div class="vak-details">${totaalUren.toFixed(1)} uur totaal ${taak.voorIedereen ? '• 👥 Voor iedereen' : ''}</div>
                    <div class="vak-periodes">
                        <span class="vak-periode">P1: ${taak.urenPerPeriode[1].toFixed(1)}u</span>
                        <span class="vak-periode">P2: ${taak.urenPerPeriode[2].toFixed(1)}u</span>
                        <span class="vak-periode">P3: ${taak.urenPerPeriode[3].toFixed(1)}u</span>
                        <span class="vak-periode">P4: ${taak.urenPerPeriode[4].toFixed(1)}u</span>
                    </div>
                </div>
                <div class="vak-actions">
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

    // Group by leerjaar
    const grouped = {};
    vakkenMetLeerjaar.forEach(vak => {
        const lj = vak.leerjaar || 0;
        if (!grouped[lj]) grouped[lj] = [];
        grouped[lj].push(vak);
    });

    const leerjaarNummers = Object.keys(grouped).map(Number).sort();

    container.innerHTML = leerjaarNummers.map(nummer => {
        const leerjaar = state.leerjaren.find(l => l.nummer === nummer);
        const vakken = grouped[nummer] || [];
        const basisVakken = vakken.filter(v => v.type !== 'ontwikkelweken');
        const owVakken = vakken.filter(v => v.type === 'ontwikkelweken');

        return `
            <div class="leerjaar-group">
                <div class="leerjaar-group-header">
                    <h4>🎓 Jaar ${nummer}</h4>
                    <span>${leerjaar ? leerjaar.klassen.length : '?'} klassen • ${basisVakken.length} basis • ${owVakken.length} OW vakken</span>
                </div>
                ${basisVakken.length > 0 ? `<div class="vak-type-label">📚 Basisweken</div>` : ''}
                ${basisVakken.map(vak => renderVakItem(vak)).join('')}
                ${owVakken.length > 0 ? `<div class="vak-type-label">🔧 Ontwikkelweken</div>` : ''}
                ${owVakken.map(vak => renderVakItem(vak)).join('')}
            </div>
        `;
    }).join('');

    updateFilters();
}

function renderVakItem(vak) {
    const klassen = vak.klassen || [];
    let periodeInfo = '';
    let totalBlokjes = 0;

    if (vak.type === 'ontwikkelweken' && vak.ontwikkelweken) {
        const ow = vak.ontwikkelweken;
        totalBlokjes = klassen.length * ((ow[1] || 0) + (ow[2] || 0) + (ow[3] || 0) + (ow[4] || 0) + (ow[5] || 0) + (ow[6] || 0) + (ow[7] || 0) + (ow[8] || 0));
        periodeInfo = `
            <span class="vak-periode">OW1: ${ow[1] || 0}</span>
            <span class="vak-periode">OW2: ${ow[2] || 0}</span>
            <span class="vak-periode">OW3: ${ow[3] || 0}</span>
            <span class="vak-periode">OW4: ${ow[4] || 0}</span>
            <span class="vak-periode">OW5: ${ow[5] || 0}</span>
            <span class="vak-periode">OW6: ${ow[6] || 0}</span>
            <span class="vak-periode">OW7: ${ow[7] || 0}</span>
            <span class="vak-periode">OW8: ${ow[8] || 0}</span>
        `;
    } else if (vak.periodes) {
        const p = vak.periodes;
        totalBlokjes = klassen.length * ((p[1] || 0) + (p[2] || 0) + (p[3] || 0) + (p[4] || 0));
        periodeInfo = `
            <span class="vak-periode">P1: ${p[1] || 0}</span>
            <span class="vak-periode">P2: ${p[2] || 0}</span>
            <span class="vak-periode">P3: ${p[3] || 0}</span>
            <span class="vak-periode">P4: ${p[4] || 0}</span>
        `;
    }

    return `
        <div class="vak-item" style="border-left-color: ${vak.kleur}">
            <div class="vak-color" style="background: ${vak.kleur}"></div>
            <div class="vak-info">
                <div class="vak-naam">${escapeHtml(vak.naam)}</div>
                <div class="vak-details">${klassen.length} klassen • ${totalBlokjes} blokjes</div>
                <div class="vak-periodes">${periodeInfo}</div>
            </div>
            <div class="vak-actions">
                <button onclick="deleteVak('${vak.id}')" title="Verwijderen">🗑️</button>
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

// ============================================
// DOCENTEN
// ============================================

function initDocentenForm() {
    const form = document.getElementById('form-docent');
    form.addEventListener('submit', (e) => {
        e.preventDefault();

        const naam = document.getElementById('docent-naam').value.trim();
        if (naam) {
            addDocent(naam);
            document.getElementById('docent-naam').value = '';
        }
    });

    // Bulk add
    document.getElementById('btn-bulk-add').addEventListener('click', () => {
        const textarea = document.getElementById('docenten-bulk');
        const names = textarea.value.split('\n').map(n => n.trim()).filter(n => n);
        names.forEach(naam => addDocent(naam));
        textarea.value = '';
    });
}

function addDocent(naam) {
    const docent = {
        id: generateId(),
        naam: naam
    };
    state.docenten.push(docent);
    saveToLocalStorage();
    renderDocentenLijst();
    updateDocentSelector();
}

function renderDocentenLijst() {
    const container = document.getElementById('docenten-lijst');

    if (state.docenten.length === 0) {
        container.innerHTML = '<p class="empty-state">Nog geen docenten toegevoegd.</p>';
        return;
    }

    container.innerHTML = state.docenten.map(docent => {
        const initials = docent.naam.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
        const count = state.toewijzingen.filter(t => t.docentId === docent.id).length;

        return `
            <div class="docent-item">
                <div class="docent-avatar">${initials}</div>
                <div class="docent-naam">${escapeHtml(docent.naam)}</div>
                <span style="font-size: 0.75rem; color: var(--text-muted)">${count} blokjes</span>
                <button class="docent-delete" onclick="deleteDocent('${docent.id}')" title="Verwijderen">🗑️</button>
            </div>
        `;
    }).join('');
}

function deleteDocent(docentId) {
    if (!confirm('Weet je zeker dat je deze docent wilt verwijderen? Alle toewijzingen worden ook verwijderd.')) {
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
    selector.innerHTML = '<option value="">-- Selecteer docent --</option>' +
        state.docenten.map(d => `<option value="${d.id}">${escapeHtml(d.naam)}</option>`).join('');
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
        klassenState.geselecteerdLeerjaar = leerjaarSelect.value ? parseInt(leerjaarSelect.value) : null;
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
    selector.innerHTML = '<option value="">-- Selecteer jezelf --</option>' +
        state.docenten.map(d => `<option value="${d.id}" ${klassenState.geselecteerdeDocent === d.id ? 'selected' : ''}>${escapeHtml(d.naam)}</option>`).join('');
}

function updateKlassenLeerjaarSelector() {
    const selector = document.getElementById('klassen-leerjaar');
    selector.innerHTML = '<option value="">-- Selecteer leerjaar --</option>' +
        state.leerjaren.map(lj => `<option value="${lj.nummer}" ${klassenState.geselecteerdLeerjaar === lj.nummer ? 'selected' : ''}>Jaar ${lj.nummer}</option>`).join('');
}

function updateKlassenKlasSelector() {
    const selector = document.getElementById('klassen-klas');

    if (!klassenState.geselecteerdLeerjaar) {
        selector.innerHTML = '<option value="">-- Selecteer eerst leerjaar --</option>';
        selector.disabled = true;
        return;
    }

    const leerjaar = state.leerjaren.find(l => l.nummer === klassenState.geselecteerdLeerjaar);
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

    if (!klassenState.geselecteerdeDocent || !klassenState.geselecteerdLeerjaar || !klassenState.geselecteerdeKlas) {
        container.innerHTML = '<p class="empty-state">Selecteer een docent, leerjaar en klas om het curriculum te zien</p>';
        titel.textContent = '';
        return;
    }

    titel.textContent = `- ${klassenState.geselecteerdeKlas}`;

    // Get vakken for this leerjaar, split by type
    const alleVakken = state.vakken.filter(v => v.leerjaar === klassenState.geselecteerdLeerjaar);
    const basisVakken = alleVakken.filter(v => v.type !== 'ontwikkelweken' && v.periodes);
    const owVakken = alleVakken.filter(v => v.type === 'ontwikkelweken' && v.ontwikkelweken);

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

        return `
            <div class="periode-row">
                <div class="periode-section basisweken-section">
                    <div class="periode-section-header">
                        <h4>📚 Periode ${periode}</h4>
                        <span class="periode-section-count">${basisVakkenMetPeriode.reduce((sum, v) => sum + (v.periodes[periode] || 0), 0)} eenheden</span>
                    </div>
                    ${renderVakSections(basisVakkenMetPeriode, periode, 'P')}
                    ${basisVakkenMetPeriode.length === 0 ? '<p class="empty-state" style="font-size:0.75rem">Geen vakken</p>' : ''}
                </div>
                <div class="periode-section ow-section">
                    <div class="periode-section-header">
                        <h4>🔧 OW${ow1}</h4>
                        <span class="periode-section-count">${owVakkenMetOW1.reduce((sum, v) => sum + (v.ontwikkelweken[ow1] || 0), 0)} eenheden</span>
                    </div>
                    ${renderVakSectionsOW(owVakkenMetOW1, ow1)}
                    ${owVakkenMetOW1.length === 0 ? '<p class="empty-state" style="font-size:0.75rem">Geen vakken</p>' : ''}
                </div>
                <div class="periode-section ow-section">
                    <div class="periode-section-header">
                        <h4>🔧 OW${ow2}</h4>
                        <span class="periode-section-count">${owVakkenMetOW2.reduce((sum, v) => sum + (v.ontwikkelweken[ow2] || 0), 0)} eenheden</span>
                    </div>
                    ${renderVakSectionsOW(owVakkenMetOW2, ow2)}
                    ${owVakkenMetOW2.length === 0 ? '<p class="empty-state" style="font-size:0.75rem">Geen vakken</p>' : ''}
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
        if (isNonSplitsbaar && !isTaken) className += ' locked';

        const clickHandler = isNonSplitsbaar ? '' : `toggleLeseenheid('${blokjeId}', '${periodeKey}')`;

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
        alert(`Deze leseenheid is al geclaimd door ${docent?.naam || 'een andere docent'}`);
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

    // Determine count based on periodeKey (P1-P4 or OW1-OW8)
    let count = 0;
    if (periodeKey.startsWith('OW')) {
        const owNum = parseInt(periodeKey.substring(2));
        count = vak.ontwikkelweken ? (vak.ontwikkelweken[owNum] || 0) : 0;
    } else {
        const pNum = parseInt(periodeKey.substring(1));
        count = vak.periodes ? (vak.periodes[pNum] || 0) : 0;
    }

    for (let num = 1; num <= count; num++) {
        const blokjeId = `${vakId}-${klassenState.geselecteerdeKlas}-${periodeKey}-${num}`;
        const existing = state.toewijzingen.find(t => t.blokjeId === blokjeId && t.docentId === klassenState.geselecteerdeDocent);
        const takenByOther = state.toewijzingen.find(t => t.blokjeId === blokjeId && t.docentId !== klassenState.geselecteerdeDocent);

        if (takenByOther) {
            // Skip - already taken by someone else
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
    selector.innerHTML = '<option value="">-- Selecteer jezelf --</option>' +
        state.docenten.map(d => `<option value="${d.id}" ${takenViewState.geselecteerdeDocent === d.id ? 'selected' : ''}>${escapeHtml(d.naam)}</option>`).join('');
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

    // Initial renders
    renderLeerjarenLijst();
    renderVakkenLijst();
    renderDocentenLijst();
    renderTakenLijst();
    renderTakenSelectie();
    updateDocentSelector();
    updateLeerjaarSelector();

    console.log('Werkverdelingsapp initialized!');
});

// Make delete functions globally available
window.deleteVak = deleteVak;
window.deleteDocent = deleteDocent;
window.deleteLeerjaar = deleteLeerjaar;
window.deleteTaak = deleteTaak;

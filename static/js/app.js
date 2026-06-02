document.addEventListener('DOMContentLoaded', () => {
    // ── State ──────────────────────────────────────────────────────────
    let originalCVData = null;
    let selectedKeywords = new Set();
    let selectedProposals = new Set();
    let selectedFile = null;

    // ── DOM Elements ───────────────────────────────────────────────────
    const apiKeyInput     = document.getElementById('api-key-input');
    const apiUrlInput     = document.getElementById('api-url-input');
    const settingsToggle  = document.getElementById('settings-toggle');
    const settingsPanel   = document.getElementById('settings-panel');
    const saveSettingsBtn = document.getElementById('save-settings-btn');

    const uploadArea    = document.getElementById('upload-area');
    const fileInput     = document.getElementById('file-input');
    const fileInfo      = document.getElementById('file-info');
    const fileNameSpan  = document.getElementById('file-name');
    const removeFileBtn = document.getElementById('remove-file-btn');

    const jdTextarea = document.getElementById('jd-text');
    const jdUrlInput = document.getElementById('jd-url');

    const analyzeBtn     = document.getElementById('analyze-btn');
    const analysisLoader = document.getElementById('analysis-loader');

    const workspaceStep1 = document.getElementById('workspace-step1');
    const workspaceStep2 = document.getElementById('workspace-step2');
    const workspaceStep3 = document.getElementById('workspace-step3');

    const tabKeywords   = document.getElementById('tab-keywords');
    const tabBullets    = document.getElementById('tab-bullets');
    const tabRedundancy = document.getElementById('tab-redundancy');
    const paneKeywords   = document.getElementById('pane-keywords');
    const paneBullets    = document.getElementById('pane-bullets');
    const paneRedundancy = document.getElementById('pane-redundancy');

    const keywordsContainer   = document.getElementById('keywords-container');
    const proposalsContainer  = document.getElementById('proposals-container');
    const redundancyContainer = document.getElementById('redundancy-container');

    const generatePdfBtn   = document.getElementById('generate-pdf-btn');
    const generationLoader = document.getElementById('generation-loader');
    const restartBtn       = document.getElementById('restart-btn');

    // Format selector
    const fmtButtons = document.querySelectorAll('.fmt-btn');
    let selectedFormat = 'pdf';

    // ── Dynamic API Base URL ───────────────────────────────────────────
    // Priority: localStorage override > default to relative URLs (same host)
    // When Flask serves both frontend and backend (Railway/local), relative
    // paths work perfectly. Only override via Settings if using a separate backend.
    let apiBaseUrl = (localStorage.getItem('api_base_url') || '').replace(/\/$/, '');

    // ── Restore saved settings ─────────────────────────────────────────
    if (localStorage.getItem('gemini_api_key')) apiKeyInput.value = localStorage.getItem('gemini_api_key');
    if (apiUrlInput) apiUrlInput.value = apiBaseUrl;

    // ── Settings panel ─────────────────────────────────────────────────
    settingsToggle.addEventListener('click', () => settingsPanel.classList.toggle('hidden'));

    saveSettingsBtn.addEventListener('click', () => {
        const key = apiKeyInput.value.trim();
        const url = (apiUrlInput ? apiUrlInput.value.trim() : '').replace(/\/$/, '');
        localStorage.setItem('gemini_api_key', key);
        localStorage.setItem('api_base_url', url);
        apiBaseUrl = url;
        settingsPanel.classList.add('hidden');
        showToast('Settings saved!');
    });

    // ── File upload ────────────────────────────────────────────────────
    uploadArea.addEventListener('click', () => fileInput.click());
    uploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadArea.classList.add('border-blue-500', 'bg-blue-900/10');
    });
    uploadArea.addEventListener('dragleave', () => {
        uploadArea.classList.remove('border-blue-500', 'bg-blue-900/10');
    });
    uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadArea.classList.remove('border-blue-500', 'bg-blue-900/10');
        if (e.dataTransfer.files.length > 0) handleFileSelect(e.dataTransfer.files[0]);
    });
    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) handleFileSelect(e.target.files[0]);
    });
    removeFileBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        selectedFile = null;
        fileInput.value = '';
        fileInfo.classList.add('hidden');
        uploadArea.classList.remove('hidden');
    });

    function handleFileSelect(file) {
        if (file.type !== 'application/pdf') {
            showToast('Please upload a valid PDF file.', 'error');
            return;
        }
        selectedFile = file;
        fileNameSpan.textContent = file.name;
        uploadArea.classList.add('hidden');
        fileInfo.classList.remove('hidden');
    }

    // ── Tab switching ──────────────────────────────────────────────────
    function activateTab(tab) {
        const tabs  = [tabKeywords, tabBullets, tabRedundancy];
        const panes = [paneKeywords, paneBullets, paneRedundancy];
        tabs.forEach((t, i) => {
            const active = t === tab;
            t.classList.toggle('border-blue-500', active);
            t.classList.toggle('text-blue-400',   active);
            t.classList.toggle('border-transparent', !active);
            t.classList.toggle('text-gray-400',   !active);
            panes[i].classList.toggle('hidden', !active);
        });
    }
    tabKeywords.addEventListener('click',   () => activateTab(tabKeywords));
    tabBullets.addEventListener('click',    () => activateTab(tabBullets));
    tabRedundancy.addEventListener('click', () => activateTab(tabRedundancy));

    // ── Format selector ────────────────────────────────────────────────
    fmtButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            selectedFormat = btn.dataset.fmt;
            fmtButtons.forEach(b => {
                const active = b === btn;
                b.classList.toggle('bg-blue-600',  active);
                b.classList.toggle('text-white',   active);
                b.classList.toggle('bg-gray-900',  !active);
                b.classList.toggle('text-gray-400', !active);
            });
        });
    });

    // ── Analyze ────────────────────────────────────────────────────────
    analyzeBtn.addEventListener('click', async () => {
        if (!selectedFile) { showToast('Please upload your CV (PDF) first.', 'error'); return; }
        const jdText = jdTextarea.value.trim();
        const jdUrl  = jdUrlInput.value.trim();
        if (!jdText && !jdUrl) { showToast('Please enter a job description text or URL.', 'error'); return; }

        const apiKey = apiKeyInput.value.trim() || localStorage.getItem('gemini_api_key') || '';

        const formData = new FormData();
        formData.append('cv', selectedFile);
        if (jdText) formData.append('job_description_text', jdText);
        if (jdUrl)  formData.append('job_description_url', jdUrl);

        analyzeBtn.classList.add('hidden');
        analysisLoader.classList.remove('hidden');

        try {
            const response = await fetch(`${apiBaseUrl}/api/analyze`, {
                method: 'POST',
                headers: { 'X-Gemini-Key': apiKey },
                body: formData
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Server error during analysis.');

            originalCVData = data;
            selectedKeywords.clear();
            selectedProposals.clear();
            renderTailoringOptions();

            workspaceStep1.classList.add('hidden');
            workspaceStep2.classList.remove('hidden');
            showToast('Analysis complete!');
        } catch (err) {
            showToast(err.message, 'error');
        } finally {
            analysisLoader.classList.add('hidden');
            analyzeBtn.classList.remove('hidden');
        }
    });

    // ── Render tailoring UI ────────────────────────────────────────────
    function renderTailoringOptions() {
        keywordsContainer.innerHTML = '';
        proposalsContainer.innerHTML = '';

        // Keywords — split into MISSING (interactive) and ALREADY PRESENT (green, display-only)
        if (originalCVData.keywords && originalCVData.keywords.length > 0) {
            const sorted = [...originalCVData.keywords].sort((a, b) => a.priority - b.priority);
            const missing       = sorted.filter(kw => kw.matching_status === 'missing');
            const alreadyHere   = sorted.filter(kw => kw.matching_status !== 'missing');

            if (missing.length === 0 && alreadyHere.length === 0) {
                keywordsContainer.innerHTML = '<p class="text-gray-400 text-sm text-center py-4">No keywords found.</p>';
            } else {
                // ── Missing keywords (interactive checkboxes) ──────────────────
                if (missing.length === 0) {
                    const msg = document.createElement('p');
                    msg.className = 'text-gray-400 text-sm text-center py-2';
                    msg.textContent = 'All key skills are already present in your CV.';
                    keywordsContainer.appendChild(msg);
                } else {
                    missing.forEach((kw) => {
                        selectedKeywords.add(kw.word);

                        const score = kw.score ?? null;
                        const scoreColor = score === null ? 'text-gray-500' :
                            score >= 7 ? 'text-green-400' :
                            score >= 5 ? 'text-yellow-400' : 'text-orange-400';

                        const el = document.createElement('div');
                        el.className = 'flex items-center justify-between p-3 rounded-lg border border-gray-800 bg-gray-900/40';
                        el.innerHTML = `
                            <div class="flex items-center space-x-3">
                                <input type="checkbox" id="kw-${kw.word.replace(/\s+/g,'-')}"
                                       class="w-4 h-4 text-blue-600 border-gray-700 bg-gray-900 rounded focus:ring-blue-500 focus:ring-opacity-25"
                                       checked>
                                <label for="kw-${kw.word.replace(/\s+/g,'-')}"
                                       class="text-sm font-medium text-gray-200 cursor-pointer select-none">${kw.word}</label>
                            </div>
                            <div class="flex items-center space-x-2 shrink-0">
                                ${score !== null ? `<span class="text-[10px] font-bold ${scoreColor}">${score}/9</span>` : ''}
                                <span class="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-red-500/10 text-red-400 border border-red-500/20">MISSING</span>
                            </div>`;
                        el.querySelector('input').addEventListener('change', (e) => {
                            e.target.checked ? selectedKeywords.add(kw.word) : selectedKeywords.delete(kw.word);
                        });
                        keywordsContainer.appendChild(el);
                    });
                }

                // ── Already present keywords (non-interactive, green) ──────────
                if (alreadyHere.length > 0) {
                    const divider = document.createElement('div');
                    divider.className = 'flex items-center space-x-2 pt-2 pb-1';
                    divider.innerHTML = `
                        <div class="h-px flex-grow bg-gray-800"></div>
                        <span class="text-[10px] font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap">Already in your CV</span>
                        <div class="h-px flex-grow bg-gray-800"></div>`;
                    keywordsContainer.appendChild(divider);

                    const wrap = document.createElement('div');
                    wrap.className = 'flex flex-wrap gap-2 pb-1';
                    alreadyHere.forEach(kw => {
                        const score = kw.score ?? null;
                        const tag = document.createElement('div');
                        tag.className = 'flex items-center space-x-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20';
                        tag.innerHTML = `
                            <svg class="w-3 h-3 text-emerald-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor">
                                <path stroke-linecap="round" stroke-linejoin="round" d="m4.5 12.75 6 6 9-13.5"/>
                            </svg>
                            <span class="text-xs text-emerald-300 font-medium">${kw.word}</span>
                            ${score !== null ? `<span class="text-[9px] text-emerald-500 font-bold">${score}/9</span>` : ''}`;
                        wrap.appendChild(tag);
                    });
                    keywordsContainer.appendChild(wrap);
                }
            }
        } else {
            keywordsContainer.innerHTML = '<p class="text-gray-400 text-sm text-center py-4">No keywords found.</p>';
        }

        // Redundancy checks
        const checks = originalCVData.redundancy_checks || [];
        if (checks.length > 0) {
            redundancyContainer.innerHTML = '';
            checks.forEach(check => {
                const el = document.createElement('div');
                el.id = `red-card-${check.id}`;
                el.className = 'p-3 rounded-lg border border-gray-800 bg-gray-900/40 space-y-2 transition-opacity duration-300';
                el.innerHTML = `
                    <div class="flex items-start justify-between gap-2">
                        <div class="flex-1 min-w-0">
                            <p class="text-[10px] font-bold text-amber-400 uppercase tracking-wider mb-0.5">📍 ${check.location}</p>
                            <p class="text-xs text-gray-300">${check.issue}</p>
                            <span id="red-badge-${check.id}" class="hidden mt-1 inline-block text-[9px] font-bold uppercase tracking-wider text-emerald-400 bg-emerald-400/10 border border-emerald-400/20 px-2 py-0.5 rounded-full">
                                ✓ Resolved by rewrite
                            </span>
                        </div>
                        <label class="toggle-switch shrink-0">
                            <input type="checkbox" id="red-${check.id}" checked>
                            <span class="slider"></span>
                        </label>
                    </div>
                    <div class="space-y-1.5 text-xs">
                        <div class="p-2 rounded bg-gray-950/60 border-l-2 border-red-500/50 text-gray-400">
                            <span class="font-semibold text-gray-500 uppercase block mb-0.5 text-[9px]">Original:</span>
                            ${check.original}
                        </div>
                        <div class="p-2 rounded bg-gray-950/60 border-l-2 border-amber-500/50 text-gray-200">
                            <span class="font-semibold text-amber-400 uppercase block mb-0.5 text-[9px]">Suggested:</span>
                            ${check.suggestion}
                        </div>
                    </div>`;
                redundancyContainer.appendChild(el);
            });
        } else {
            redundancyContainer.innerHTML = '<p class="text-gray-400 text-sm text-center py-4">No redundancies detected — your CV language looks varied.</p>';
        }


        if (originalCVData.proposals && originalCVData.proposals.length > 0) {
            originalCVData.proposals.forEach((prop) => {
                selectedProposals.add(prop.id);

                let highlighted = prop.proposed;
                (prop.keywords || []).forEach(kw => {
                    const re = new RegExp(`(${escapeRegExp(kw)})`, 'gi');
                    highlighted = highlighted.replace(re, '<span class="keyword-highlight">$1</span>');
                });

                const job = prop.section === 'experience'
                    ? originalCVData.parsed_cv.experience[prop.entry_index]
                    : null;
                const metaLabel = job ? `${job.title} · ${job.company}` : 'Profile Summary';

                const el = document.createElement('div');
                el.className = 'p-4 rounded-xl border border-gray-800 bg-gray-900/30 space-y-3';
                el.innerHTML = `
                    <div class="flex items-start justify-between space-x-3">
                        <div class="text-xs font-semibold text-blue-400 uppercase tracking-wide">${metaLabel}</div>
                        <label class="toggle-switch">
                            <input type="checkbox" id="prop-${prop.id}" checked>
                            <span class="slider"></span>
                        </label>
                    </div>
                    <div class="space-y-2 text-xs">
                        <div class="p-2.5 rounded bg-gray-950/60 border-l-2 border-red-500/50 text-gray-400">
                            <span class="font-semibold text-gray-500 uppercase block mb-1 text-[9px]">Original:</span>
                            ${prop.original}
                        </div>
                        <div class="p-2.5 rounded bg-gray-950/60 border-l-2 border-green-500/50 text-gray-200">
                            <span class="font-semibold text-green-400 uppercase block mb-1 text-[9px]">Tailored Proposal:</span>
                            ${highlighted}
                        </div>
                    </div>`;
                el.querySelector('input').addEventListener('change', (e) => {
                    e.target.checked ? selectedProposals.add(prop.id) : selectedProposals.delete(prop.id);
                    evaluateRedundancyCards(); // re-check whenever a rewrite is toggled
                });
                proposalsContainer.appendChild(el);
            });
        } else {
            proposalsContainer.innerHTML = '<p class="text-gray-400 text-sm text-center py-4">No sentence rewrites proposed.</p>';
        }

        // Evaluate redundancy cards after everything is rendered
        evaluateRedundancyCards();
    }

    // ── Build text with ALL rewrites applied (for redundancy evaluation) ─
    function buildAllRewritesApplied() {
        const cv = JSON.parse(JSON.stringify(originalCVData.parsed_cv));
        (originalCVData.proposals || []).forEach(prop => {
            if (prop.section === 'profile') {
                cv.profile = prop.proposed;
            } else if (prop.section === 'experience') {
                const job = cv.experience?.[prop.entry_index];
                if (!job) return;
                if (prop.bullet_index === -1) job.description = prop.proposed;
                else if (job.bullets?.[prop.bullet_index] !== undefined)
                    job.bullets[prop.bullet_index] = prop.proposed;
            }
        });
        return JSON.stringify(cv);
    }

    // ── Evaluate which redundancy cards are still relevant ────────────────
    function evaluateRedundancyCards() {
        const checks = originalCVData?.redundancy_checks || [];
        if (!checks.length) return;

        const originalText  = JSON.stringify(originalCVData.parsed_cv);
        const rewrittenText = buildAllRewritesApplied();

        checks.forEach(check => {
            const card   = document.getElementById(`red-card-${check.id}`);
            const toggle = document.getElementById(`red-${check.id}`);
            const badge  = document.getElementById(`red-badge-${check.id}`);
            if (!card || !toggle) return;

            // Only grey out if:
            // 1. The original text exists verbatim in the ORIGINAL CV (not a Gemini paraphrase)
            // 2. AND it is NO LONGER present after applying all rewrites
            const wasVerbatimInOriginal = originalText.includes(check.original);
            const stillPresentAfterRewrites = rewrittenText.includes(check.original);
            const resolvedByRewrite = wasVerbatimInOriginal && !stillPresentAfterRewrites;

            if (resolvedByRewrite) {
                card.classList.add('opacity-40');
                toggle.checked = false;
                toggle.disabled = true;
                if (badge) badge.classList.remove('hidden');
            } else {
                card.classList.remove('opacity-40');
                toggle.disabled = false;
                if (badge) badge.classList.add('hidden');
            }
        });
    }

    // ── Compile CV helper ──────────────────────────────────────────────
    function buildCompiledCV() {
        const compiledCV = JSON.parse(JSON.stringify(originalCVData.parsed_cv));

        // Apply accepted sentence rewrites
        (originalCVData.proposals || []).forEach((prop) => {
            if (!selectedProposals.has(prop.id)) return;
            if (prop.section === 'profile') {
                compiledCV.profile = prop.proposed;
            } else if (prop.section === 'experience') {
                const job = compiledCV.experience[prop.entry_index];
                if (!job) return;
                if (prop.bullet_index === -1) {
                    job.description = prop.proposed;
                } else if (job.bullets?.[prop.bullet_index] !== undefined) {
                    job.bullets[prop.bullet_index] = prop.proposed;
                }
            }
        });

        // Apply accepted redundancy fixes
        (originalCVData.redundancy_checks || []).forEach((check) => {
            const toggle = document.getElementById(`red-${check.id}`);
            if (!toggle?.checked) return;
            // Replace original text with suggestion across the whole CV (simple string replacement)
            const replacer = (str) => str ? str.replace(check.original, check.suggestion) : str;
            compiledCV.profile = replacer(compiledCV.profile);
            (compiledCV.experience || []).forEach(job => {
                job.description = replacer(job.description);
                job.bullets = (job.bullets || []).map(replacer);
            });
        });

        // Inject accepted keywords into Competencies
        if (selectedKeywords.size > 0) {
            compiledCV.skills_and_interests ??= {};
            compiledCV.skills_and_interests.competencies ??= [];
            const existing = compiledCV.skills_and_interests.competencies.map(c => c.toLowerCase());
            selectedKeywords.forEach(kw => {
                if (!existing.includes(kw.toLowerCase()))
                    compiledCV.skills_and_interests.competencies.push(kw);
            });
        }
        return compiledCV;
    }

    async function downloadFile(url, compiledCV, filename) {
        const response = await fetch(`${apiBaseUrl}${url}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(compiledCV)
        });
        if (!response.ok) throw new Error(`Generation failed: ${url}`);
        const blob = await response.blob();
        const objUrl = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none'; a.href = objUrl; a.download = filename;
        document.body.appendChild(a); a.click();
        window.URL.revokeObjectURL(objUrl); document.body.removeChild(a);
    }

    // ── Generate & Download ────────────────────────────────────────────
    generatePdfBtn.addEventListener('click', async () => {
        if (!originalCVData?.parsed_cv) { showToast('No CV data available.', 'error'); return; }

        const compiledCV = buildCompiledCV();

        generatePdfBtn.classList.add('hidden');
        generationLoader.classList.remove('hidden');

        try {
            if (selectedFormat === 'pdf' || selectedFormat === 'both') {
                await downloadFile('/api/generate-pdf', compiledCV, 'Tailored_CV.pdf');
            }
            if (selectedFormat === 'word' || selectedFormat === 'both') {
                await downloadFile('/api/generate-docx', compiledCV, 'Tailored_CV.docx');
            }
            workspaceStep2.classList.add('hidden');
            workspaceStep3.classList.remove('hidden');
            showToast('CV downloaded successfully!');
        } catch (err) {
            showToast(err.message, 'error');
        } finally {
            generationLoader.classList.add('hidden');
            generatePdfBtn.classList.remove('hidden');
        }
    });


    // ── Restart ────────────────────────────────────────────────────────
    restartBtn.addEventListener('click', () => {
        workspaceStep3.classList.add('hidden');
        workspaceStep1.classList.remove('hidden');
        jdTextarea.value = '';
        jdUrlInput.value = '';
        removeFileBtn.click();
        originalCVData = null;
        selectedKeywords.clear();
        selectedProposals.clear();
    });

    // ── Toast ──────────────────────────────────────────────────────────
    function showToast(message, type = 'success') {
        const toast = document.createElement('div');
        toast.className = `fixed bottom-6 right-6 z-50 p-4 rounded-xl border shadow-xl flex items-center
            space-x-3 transition-all duration-300 transform translate-y-12 opacity-0
            ${type === 'error'
                ? 'bg-red-950/80 border-red-500/50 text-red-200'
                : 'bg-slate-900/90 border-blue-500/50 text-blue-200'}`;
        toast.innerHTML = `<span>${type === 'error' ? '⚠️' : '✅'}</span>
                           <span class="text-xs font-semibold">${message}</span>`;
        document.body.appendChild(toast);
        setTimeout(() => toast.classList.remove('translate-y-12', 'opacity-0'), 10);
        setTimeout(() => {
            toast.classList.add('translate-y-12', 'opacity-0');
            setTimeout(() => document.body.removeChild(toast), 300);
        }, 4000);
    }

    function escapeRegExp(s) {
        return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
});

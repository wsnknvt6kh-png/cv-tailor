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

    const tabKeywords = document.getElementById('tab-keywords');
    const tabBullets  = document.getElementById('tab-bullets');
    const paneKeywords = document.getElementById('pane-keywords');
    const paneBullets  = document.getElementById('pane-bullets');

    const keywordsContainer  = document.getElementById('keywords-container');
    const proposalsContainer = document.getElementById('proposals-container');

    const generatePdfBtn  = document.getElementById('generate-pdf-btn');
    const generationLoader = document.getElementById('generation-loader');
    const restartBtn       = document.getElementById('restart-btn');

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
    tabKeywords.addEventListener('click', () => {
        tabKeywords.classList.add('border-blue-500', 'text-blue-400');
        tabKeywords.classList.remove('border-transparent', 'text-gray-400');
        tabBullets.classList.remove('border-blue-500', 'text-blue-400');
        tabBullets.classList.add('border-transparent', 'text-gray-400');
        paneKeywords.classList.remove('hidden');
        paneBullets.classList.add('hidden');
    });
    tabBullets.addEventListener('click', () => {
        tabBullets.classList.add('border-blue-500', 'text-blue-400');
        tabBullets.classList.remove('border-transparent', 'text-gray-400');
        tabKeywords.classList.remove('border-blue-500', 'text-blue-400');
        tabKeywords.classList.add('border-transparent', 'text-gray-400');
        paneBullets.classList.remove('hidden');
        paneKeywords.classList.add('hidden');
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

        // Keywords
        if (originalCVData.keywords && originalCVData.keywords.length > 0) {
            const sorted = [...originalCVData.keywords].sort((a, b) => a.priority - b.priority);
            sorted.forEach((kw) => {
                const isChecked = kw.matching_status === 'missing';
                if (isChecked) selectedKeywords.add(kw.word);

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
                               ${isChecked ? 'checked' : ''}>
                        <label for="kw-${kw.word.replace(/\s+/g,'-')}"
                               class="text-sm font-medium text-gray-200 cursor-pointer select-none">${kw.word}</label>
                    </div>
                    <div class="flex items-center space-x-2 shrink-0">
                        ${score !== null ? `<span class="text-[10px] font-bold ${scoreColor}">${score}/9</span>` : ''}
                        <span class="text-[10px] font-semibold px-2 py-0.5 rounded-full
                            ${kw.matching_status === 'missing'
                                ? 'bg-red-500/10 text-red-400 border border-red-500/20'
                                : 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20'}">
                            ${kw.matching_status.toUpperCase()}
                        </span>
                    </div>`;
                el.querySelector('input').addEventListener('change', (e) => {
                    e.target.checked ? selectedKeywords.add(kw.word) : selectedKeywords.delete(kw.word);
                });
                keywordsContainer.appendChild(el);
            });
        } else {
            keywordsContainer.innerHTML = '<p class="text-gray-400 text-sm text-center py-4">No keywords found.</p>';
        }


        // Proposals
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
                        <label class="switch">
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
                });
                proposalsContainer.appendChild(el);
            });
        } else {
            proposalsContainer.innerHTML = '<p class="text-gray-400 text-sm text-center py-4">No sentence rewrites proposed.</p>';
        }
    }

    // ── Generate PDF ───────────────────────────────────────────────────
    generatePdfBtn.addEventListener('click', async () => {
        if (!originalCVData?.parsed_cv) { showToast('No CV data available.', 'error'); return; }

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

        generatePdfBtn.classList.add('hidden');
        generationLoader.classList.remove('hidden');

        try {
            const response = await fetch(`${apiBaseUrl}/api/generate-pdf`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(compiledCV)
            });
            if (!response.ok) throw new Error('PDF generation failed on server.');

            const blob = await response.blob();
            const url  = window.URL.createObjectURL(blob);
            const a    = document.createElement('a');
            a.style.display = 'none';
            a.href = url;
            a.download = 'Tailored_CV.pdf';
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);

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

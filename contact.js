// Contact page: a mail form with a "Purchase existing piece" mode that lets the
// visitor pick a Series and then a Piece from the live portfolio data.
//
// Sending: the form POSTs JSON to `contact.endpoint` from site-config.json
// (a Formspree-style relay that forwards to the artist's inbox). When no
// endpoint is configured yet, it falls back to opening the visitor's mail app
// with a pre-filled message to the contact email from home-config.json.

(function () {
    const state = {
        endpoint: '',
        toEmail: '',
        tabs: [],              // artwork tabs from tabs-config.json
        piecesByTab: {},       // tabId -> entries[]
        requestedPiece: null   // ?piece=<tab>/<id> deep link from a detail view
    };

    const el = id => document.getElementById(id);
    const escapeHtml = value => String(value ?? '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

    async function fetchJson(path) {
        const response = await fetch(path);
        if (!response.ok) throw new Error(`${path}: ${response.status}`);
        return response.json();
    }

    async function init() {
        const [site, home, tabsConfig] = await Promise.all([
            fetchJson('site-config.json').catch(() => ({})),
            fetchJson('home-config.json').catch(() => ({})),
            fetchJson('tabs-config.json').catch(() => ({ tabs: [] }))
        ]);

        state.endpoint = (site.contact && site.contact.endpoint) || '';
        state.toEmail = (home.contact && home.contact.email) || '';
        state.tabs = (tabsConfig.tabs || []).filter(t => t.enabled && t.itemType === 'artwork');

        renderIntro(home);
        renderDirectContact(home);
        populateSeries();
        bindEvents();
        applyDeepLink();
    }

    function renderIntro(home) {
        const intro = el('contact-intro');
        if (intro) intro.textContent = home.contactIntro || '';

        const figure = el('contact-artwork');
        if (figure && home.contactImage) {
            const img = figure.querySelector('img');
            const caption = figure.querySelector('figcaption');
            img.src = home.contactImage;
            img.alt = home.contactCaption || 'Artwork';
            caption.textContent = home.contactCaption || '';
            caption.style.display = home.contactCaption ? '' : 'none';
            figure.style.display = '';
        }
    }

    function renderDirectContact(home) {
        const box = el('contact-direct');
        if (!box) return;
        const parts = [];
        if (state.toEmail) {
            parts.push(`<a href="mailto:${escapeHtml(state.toEmail)}">${escapeHtml(state.toEmail)}</a>`);
        }
        if (home.contact && home.contact.instagram) {
            const handle = String(home.contact.instagram).replace(/^@/, '');
            parts.push(`<a href="https://www.instagram.com/${encodeURIComponent(handle)}/" target="_blank" rel="noopener noreferrer">Instagram @${escapeHtml(handle)}</a>`);
        }
        box.innerHTML = parts.length ? `<p>Or reach me directly: ${parts.join(' · ')}</p>` : '';
    }

    function populateSeries() {
        const select = el('contact-series');
        select.innerHTML = '<option value="">Select a series…</option>';
        state.tabs.forEach(tab => {
            const option = document.createElement('option');
            option.value = tab.id;
            option.textContent = tab.label;
            select.appendChild(option);
        });
    }

    async function loadPieces(tabId) {
        if (state.piecesByTab[tabId]) return state.piecesByTab[tabId];
        const tab = state.tabs.find(t => t.id === tabId);
        if (!tab) return [];
        try {
            const data = await fetchJson(tab.dataFile);
            const entries = data.entries || data[tabId] || [];
            state.piecesByTab[tabId] = entries;
            return entries;
        } catch (error) {
            console.error('Could not load pieces for', tabId, error);
            return [];
        }
    }

    async function populatePieces(tabId, preselectId) {
        const select = el('contact-piece');
        select.disabled = true;
        select.innerHTML = '<option value="">Loading…</option>';
        hidePiecePreview();

        if (!tabId) {
            select.innerHTML = '<option value="">Select a series first…</option>';
            return;
        }

        const pieces = await loadPieces(tabId);
        select.innerHTML = '<option value="">Select a piece…</option>';
        pieces.forEach(piece => {
            const option = document.createElement('option');
            option.value = piece.id;
            option.textContent = piece.sold ? `${piece.title} (sold)` : piece.title;
            select.appendChild(option);
        });
        select.disabled = pieces.length === 0;
        if (pieces.length === 0) {
            select.innerHTML = '<option value="">No pieces in this series yet</option>';
        }

        if (preselectId && pieces.some(p => p.id === preselectId)) {
            select.value = preselectId;
            showPiecePreview(tabId, preselectId);
        }
    }

    function formatDimensions(d) {
        if (!d || !d.width || !d.height) return '';
        return (d.unit || 'in') === 'in' ? `${d.width}" × ${d.height}"` : `${d.width} × ${d.height} ${d.unit}`;
    }

    function showPiecePreview(tabId, pieceId) {
        const piece = (state.piecesByTab[tabId] || []).find(p => p.id === pieceId);
        const preview = el('contact-piece-preview');
        if (!piece || !preview) return hidePiecePreview();

        const img = preview.querySelector('img');
        img.src = piece.image || '';
        img.alt = piece.title;
        const details = [formatDimensions(piece.dimensions), piece.medium, piece.year].filter(Boolean).join(' · ');
        preview.querySelector('.contact-piece-details').innerHTML =
            `<strong>${escapeHtml(piece.title)}</strong>${piece.sold ? ' <span class="artwork-sold-badge">Sold</span>' : ''}<br>${escapeHtml(details)}` +
            (piece.sold ? '<br><em>This piece has sold. Ask about prints or a similar commission.</em>' : '');
        preview.style.display = '';
    }

    function hidePiecePreview() {
        const preview = el('contact-piece-preview');
        if (preview) preview.style.display = 'none';
    }

    function isPurchase() {
        return el('contact-subject').value === 'purchase';
    }

    function updateSubjectMode() {
        const purchase = isPurchase();
        el('purchase-fields').style.display = purchase ? '' : 'none';
        el('contact-series').required = purchase;
        el('contact-piece').required = purchase;
        if (!purchase) hidePiecePreview();
    }

    function bindEvents() {
        el('contact-subject').addEventListener('change', updateSubjectMode);
        el('contact-series').addEventListener('change', e => populatePieces(e.target.value));
        el('contact-piece').addEventListener('change', e => {
            const tabId = el('contact-series').value;
            if (e.target.value) showPiecePreview(tabId, e.target.value); else hidePiecePreview();
        });
        el('contact-form').addEventListener('submit', handleSubmit);
        updateSubjectMode();
    }

    // content.html links here as contact.html?piece=<tab>/<id>
    async function applyDeepLink() {
        const params = new URLSearchParams(window.location.search);
        const piece = params.get('piece');
        if (!piece || !piece.includes('/')) return;
        const [tabId, pieceId] = piece.split('/');
        if (!state.tabs.some(t => t.id === tabId)) return;

        el('contact-subject').value = 'purchase';
        updateSubjectMode();
        el('contact-series').value = tabId;
        await populatePieces(tabId, pieceId);
    }

    function setStatus(message, type) {
        const status = el('contact-status');
        status.textContent = message;
        status.className = `contact-status ${type || ''}`.trim();
    }

    function collect() {
        const subjectSelect = el('contact-subject');
        const firstName = el('contact-first-name').value.trim();
        const lastName = el('contact-last-name').value.trim();
        const data = {
            firstName: firstName,
            lastName: lastName,
            name: `${firstName} ${lastName}`.trim(),
            email: el('contact-email').value.trim(),
            phone: el('contact-phone').value.trim(),
            subject: subjectSelect.options[subjectSelect.selectedIndex].text,
            subjectType: subjectSelect.value,
            message: el('contact-message').value.trim(),
            _gotcha: el('contact-company').value
        };

        if (isPurchase()) {
            const tabId = el('contact-series').value;
            const tab = state.tabs.find(t => t.id === tabId);
            const piece = (state.piecesByTab[tabId] || []).find(p => p.id === el('contact-piece').value);
            data.series = tab ? tab.label : '';
            data.piece = piece ? piece.title : '';
            data.pieceDetails = piece ? [formatDimensions(piece.dimensions), piece.medium, piece.year].filter(Boolean).join(', ') : '';
            data.pieceUrl = piece ? `${location.origin}${location.pathname.replace(/contact\.html$/, '')}content.html?tab=${tabId}&piece=${piece.id}` : '';
            data.pieceSold = piece ? Boolean(piece.sold) : false;
        }
        return data;
    }

    // Returns the first problem found and the field to focus, or null when valid.
    function validate(data) {
        if (!data.firstName) return { message: 'Please enter your first name.', field: 'contact-first-name' };
        if (!data.lastName) return { message: 'Please enter your last name.', field: 'contact-last-name' };
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) return { message: 'Please enter a valid email address.', field: 'contact-email' };
        if (data.phone && !/^[+\d][\d\s().-]{5,}$/.test(data.phone)) return { message: 'Please enter a valid phone number or leave it blank.', field: 'contact-phone' };
        if (isPurchase()) {
            if (!el('contact-series').value) return { message: 'Please choose a series.', field: 'contact-series' };
            if (!el('contact-piece').value) return { message: 'Please choose a piece.', field: 'contact-piece' };
        }
        if (!data.message) return { message: 'Please write a message.', field: 'contact-message' };
        return null;
    }

    function emailSubject(data) {
        return data.subjectType === 'purchase'
            ? `Purchase inquiry: ${data.piece} (${data.series})`
            : 'Custom request';
    }

    function emailBody(data) {
        const lines = [`Name: ${data.name}`, `Email: ${data.email}`];
        if (data.phone) lines.push(`Phone: ${data.phone}`);
        lines.push(`Subject: ${data.subject}`);
        if (data.subjectType === 'purchase') {
            lines.push(`Series: ${data.series}`, `Piece: ${data.piece}${data.pieceSold ? ' (marked sold)' : ''}`);
            if (data.pieceDetails) lines.push(`Details: ${data.pieceDetails}`);
            if (data.pieceUrl) lines.push(`Link: ${data.pieceUrl}`);
        }
        lines.push('', data.message);
        return lines.join('\n');
    }

    async function handleSubmit(e) {
        e.preventDefault();
        const data = collect();
        const problem = validate(data);
        if (problem) {
            setStatus(problem.message, 'error');
            const field = el(problem.field);
            if (field) field.focus();
            return;
        }
        if (data._gotcha) {
            // Honeypot filled: pretend success, send nothing.
            setStatus('Thanks, your message has been sent.', 'success');
            return;
        }

        const button = el('contact-submit');

        if (!state.endpoint) {
            // No relay configured: hand off to the visitor's mail app.
            const href = `mailto:${encodeURIComponent(state.toEmail)}?subject=${encodeURIComponent(emailSubject(data))}&body=${encodeURIComponent(emailBody(data))}`;
            window.location.href = href;
            setStatus('Opening your email app with the message filled in…', 'success');
            return;
        }

        button.disabled = true;
        setStatus('Sending…', '');
        try {
            const payload = {
                ...data,
                _subject: emailSubject(data),
                _replyto: data.email,
                summary: emailBody(data)
            };
            delete payload._gotcha;
            if (!payload.phone) delete payload.phone;

            const response = await fetch(state.endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (!response.ok) {
                const info = await response.json().catch(() => ({}));
                throw new Error(info.error || (info.errors && info.errors.map(x => x.message).join(', ')) || `Send failed (${response.status})`);
            }
            setStatus('Thanks, your message has been sent.', 'success');
            el('contact-form').reset();
            updateSubjectMode();
            hidePiecePreview();
        } catch (error) {
            console.error('Contact send failed:', error);
            setStatus(`Sorry, the message could not be sent (${error.message}). You can email ${state.toEmail} directly.`, 'error');
        } finally {
            button.disabled = false;
        }
    }

    document.addEventListener('DOMContentLoaded', () => { init().catch(err => console.error(err)); });
})();

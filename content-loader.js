// Series page loader: renders the artworks of one tab (content.html?tab=<id>)
// as a grid of thumbnails with a detail view and a lightbox.
let contentData = [];
let tabConfig = null;
let tabId = null;

// Get tab ID from URL parameter
function getTabIdFromUrl() {
    const params = new URLSearchParams(window.location.search);
    return params.get('tab');
}

// Escape text that goes into innerHTML
function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

// Load tab configuration
async function loadTabConfig() {
    try {
        const [tabsResponse, siteResponse] = await Promise.all([
            fetch('tabs-config.json'),
            fetch('site-config.json').catch(() => null)
        ]);
        const config = await tabsResponse.json();
        const site = siteResponse && siteResponse.ok ? await siteResponse.json() : {};

        tabId = getTabIdFromUrl();
        if (!tabId) {
            throw new Error('No tab specified in URL');
        }

        tabConfig = config.tabs.find(t => t.id === tabId);
        if (!tabConfig) {
            throw new Error(`Tab configuration not found for: ${tabId}`);
        }

        // Update page title and header
        const suffix = site.titleSuffix || site.siteName || '';
        document.getElementById('page-title').textContent = suffix ? `${tabConfig.label} - ${suffix}` : tabConfig.label;
        const heading = document.getElementById('page-heading');
        if (heading) heading.textContent = tabConfig.label;
        document.getElementById('page-header-text').textContent = tabConfig.headerText || '';

        // Tab cover: one of the tab's own artwork images, chosen in the admin
        const cover = document.getElementById('page-cover');
        if (cover) {
            if (tabConfig.coverPhoto) {
                cover.innerHTML = `<img src="${escapeHtml(tabConfig.coverPhoto)}" alt="${escapeHtml(tabConfig.label)}">`;
                cover.style.display = 'block';
            } else {
                cover.style.display = 'none';
            }
        }
    } catch (error) {
        console.error('Error loading tab config:', error);
        displayError('Failed to load tab configuration');
    }
}

// Load the tab's pieces, newest first (by full date when set, otherwise year)
async function loadContent() {
    try {
        const response = await fetch(tabConfig.dataFile);
        const data = await response.json();
        contentData = data.entries || [];

        const sortKey = item => {
            const raw = item.date || (item.year ? String(item.year) : '');
            const time = raw ? new Date(raw).getTime() : NaN;
            return Number.isNaN(time) ? -Infinity : time;
        };
        contentData.sort((a, b) => sortKey(b) - sortKey(a));

        displayContent();
    } catch (error) {
        console.error('Error loading content:', error);
        displayNoContent();
    }
}

// Display content in the grid
function displayContent() {
    const grid = document.getElementById('content-grid');

    if (!contentData || contentData.length === 0) {
        displayNoContent();
        return;
    }

    grid.innerHTML = '';
    contentData.forEach(item => grid.appendChild(createArtworkCard(item)));

    // Deep link: content.html?tab=<id>&piece=<itemId> opens that piece
    const requested = new URLSearchParams(window.location.search).get('piece');
    if (requested) {
        const item = contentData.find(i => i.id === requested);
        if (item) openArtworkModal(item);
    }
}

// Format artwork dimensions, e.g. 36" × 48" or 60 × 40 cm
function formatDimensions(dimensions) {
    if (!dimensions || !dimensions.width || !dimensions.height) return '';
    const unit = dimensions.unit || 'in';
    if (unit === 'in') {
        return `${dimensions.width}" × ${dimensions.height}"`;
    }
    return `${dimensions.width} × ${dimensions.height} ${unit}`;
}

// One-line artwork details: 36" × 48" · Oil on canvas · 2026
function formatArtworkDetails(item) {
    return [formatDimensions(item.dimensions), item.medium, item.year]
        .filter(part => part !== undefined && part !== null && part !== '')
        .map(escapeHtml)
        .join(' · ');
}

// Full "date created", e.g. March 4, 2026. YYYY-MM-DD parses as UTC midnight,
// so format in UTC to avoid showing the day before in US time zones.
function formatDate(dateString) {
    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
}

// Card for a single-image artwork
function createArtworkCard(item) {
    const card = document.createElement('div');
    card.className = 'artwork-card';
    card.onclick = () => openArtworkModal(item);

    const media = item.image
        ? `<img src="${escapeHtml(item.image)}" alt="${escapeHtml(item.title)}" class="artwork-image" loading="lazy">`
        : '<div class="artwork-placeholder"></div>';

    card.innerHTML = `
        ${media}
        <div class="artwork-card-content">
            <h3 class="artwork-card-title">${escapeHtml(item.title)}${item.sold ? ' <span class="artwork-sold-badge">Sold</span>' : ''}</h3>
            <div class="artwork-details">${formatArtworkDetails(item)}</div>
        </div>
    `;

    return card;
}

// Detail view for a single-image artwork
function openArtworkModal(item) {
    let modal = document.getElementById('content-modal');
    if (!modal) {
        modal = createModal();
        document.body.appendChild(modal);
    }

    const statusParts = [];
    if (item.sold) statusParts.push('<span class="artwork-sold-badge">Sold</span>');
    if (item.price && !item.sold) statusParts.push(escapeHtml(item.price));
    const dateCreated = item.date ? formatDate(item.date) : '';

    modal.querySelector('.modal-content').innerHTML = `
        <button class="modal-close" onclick="closeContentModal()">&times;</button>
        ${item.image ? `<img src="${escapeHtml(item.image)}" alt="${escapeHtml(item.title)}" class="modal-header-image artwork-modal-image" id="modal-header-image">` : ''}
        <div class="modal-body">
            <h2 class="modal-title">${escapeHtml(item.title)}</h2>
            <div class="artwork-details modal-date">${formatArtworkDetails(item)}${dateCreated ? ` · ${escapeHtml(dateCreated)}` : ''}</div>
            ${statusParts.length ? `<div class="artwork-status">${statusParts.join(' ')}</div>` : ''}
            ${item.description ? `<div class="modal-description">${escapeHtml(item.description).replace(/\n/g, '<br>')}</div>` : ''}
            <p class="artwork-inquire"><a href="contact.html?piece=${encodeURIComponent(tabId)}/${encodeURIComponent(item.id)}">${item.sold ? 'Ask about this piece' : 'Inquire about purchasing'}</a></p>
        </div>
    `;

    modal.classList.add('active');
    document.body.style.overflow = 'hidden';

    const headerImg = document.getElementById('modal-header-image');
    if (headerImg && item.image) {
        headerImg.style.cursor = 'zoom-in';
        headerImg.onclick = () => openLightbox(item.image);
    }
}

// Close the detail view
function closeContentModal() {
    const modal = document.getElementById('content-modal');
    if (modal) {
        modal.classList.remove('active');
        document.body.style.overflow = '';
    }
}

// Create the detail view element
function createModal() {
    const modal = document.createElement('div');
    modal.id = 'content-modal';
    modal.className = 'modal artwork-modal';
    modal.innerHTML = `
        <div class="modal-overlay" onclick="closeContentModal()"></div>
        <div class="modal-content"></div>
    `;
    return modal;
}

// Full-screen view of one image
function openLightbox(src) {
    let lightbox = document.getElementById('lightbox');
    if (!lightbox) {
        lightbox = createLightbox();
        document.body.appendChild(lightbox);
    }
    lightbox.querySelector('.lightbox-image').src = src;
    lightbox.classList.add('active');
}

// Close lightbox
function closeLightbox() {
    const lightbox = document.getElementById('lightbox');
    if (lightbox) {
        lightbox.classList.remove('active');
    }
}

// Create lightbox element
function createLightbox() {
    const lightbox = document.createElement('div');
    lightbox.id = 'lightbox';
    lightbox.className = 'lightbox';
    lightbox.innerHTML = `
        <div class="lightbox-overlay" onclick="closeLightbox()"></div>
        <div class="lightbox-content">
            <button class="lightbox-close" onclick="closeLightbox()">&times;</button>
            <img src="" alt="Artwork" class="lightbox-image">
        </div>
    `;
    return lightbox;
}

// Display no content message
function displayNoContent() {
    const grid = document.getElementById('content-grid');
    grid.innerHTML = `<div class="no-content">No ${tabConfig?.label?.toLowerCase() || 'content'} available yet.</div>`;
}

// Display error message
function displayError(message) {
    const grid = document.getElementById('content-grid');
    grid.innerHTML = `<div class="error-message">${message}</div>`;
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', async () => {
    await loadTabConfig();
    await loadContent();
});

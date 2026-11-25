// Admin Script - Modular Tab Management System
// Manages admin interface for tabs defined in tabs-config.json

// Core System Variables
let githubToken = '';

// The repository this admin page is allowed to write to. It is loaded from
// site-config.json and frozen; nothing in the admin can change it at runtime.
// `githubConfig` is kept as a read-only alias because content-manager.js
// builds its API paths from githubConfig.owner / .repo / .branch.
let SITE = null;
let githubConfig = Object.freeze({ owner: '', repo: '', branch: 'main' });

const GITHUB_API_ROOT = 'https://api.github.com';
const FINE_GRAINED_TOKEN_PREFIX = 'github_pat_';

// Tab management variables
let tabsConfig = null;
let editingTabIndex = -1;

// Home page management variables
let homeConfig = null;
let homePhotos = [];
let homePhotosToDelete = [];
let newHomePhotos = [];

// Initialization - Load site config and any saved token
window.addEventListener('DOMContentLoaded', async () => {
    // Old framework versions stored the repo target in localStorage. It is
    // no longer read, so remove any stale copies.
    localStorage.removeItem('github-owner');
    localStorage.removeItem('github-repo');

    try {
        await loadSiteConfig();
        const repoEl = document.getElementById('pinned-repo');
        if (repoEl) repoEl.textContent = `${githubConfig.owner}/${githubConfig.repo}`;
    } catch (error) {
        showTokenStatus(`Error: ${error.message}`, 'error');
        return;
    }

    const saved = localStorage.getItem('github-token');
    if (saved) {
        if (saved.startsWith(FINE_GRAINED_TOKEN_PREFIX)) {
            githubToken = saved;
            document.getElementById('github-token').value = saved;
            showTokenStatus(`Token loaded from browser storage (writes go to ${githubConfig.owner}/${githubConfig.repo})`, 'success');
        } else {
            // A classic token from an older setup: drop it and ask for a fine-grained one.
            localStorage.removeItem('github-token');
            showTokenStatus('A classic token was removed from this browser. Please save a fine-grained token.', 'error');
        }
    }
});

// Load and freeze site-config.json
async function loadSiteConfig() {
    if (SITE) return SITE;

    const response = await fetch('site-config.json', { cache: 'no-store' });
    if (!response.ok) {
        throw new Error('site-config.json could not be loaded');
    }
    const config = await response.json();
    const gh = config.github || {};
    if (!gh.owner || !gh.repo) {
        throw new Error('site-config.json is missing github.owner / github.repo');
    }

    githubConfig = Object.freeze({
        owner: String(gh.owner),
        repo: String(gh.repo),
        branch: String(gh.branch || 'main')
    });
    SITE = Object.freeze({ ...config, github: githubConfig });
    return SITE;
}

// GitHub API Integration

// Validate and save a GitHub token.
// Only fine-grained tokens are accepted, and they must have write (push)
// access to the pinned repository and to no other repository.
async function saveToken() {
    const token = document.getElementById('github-token').value.trim();
    const repoName = `${githubConfig.owner}/${githubConfig.repo}`;

    if (!token) {
        showTokenStatus('Please enter a token', 'error');
        return;
    }

    if (!token.startsWith(FINE_GRAINED_TOKEN_PREFIX)) {
        showTokenStatus(`Only fine-grained tokens are accepted. Create one restricted to the ${repoName} repository with Contents: Read and write.`, 'error');
        return;
    }

    try {
        loadGitHubConfig();

        // 1. The token must be able to see the pinned repo and have push access.
        const repoResponse = await fetch(`${GITHUB_API_ROOT}/repos/${repoName}`, {
            headers: tokenHeaders(token)
        });
        if (repoResponse.status === 401) {
            throw new Error('Invalid or expired token');
        }
        if (!repoResponse.ok) {
            throw new Error(`Token cannot access ${repoName}`);
        }
        const repoInfo = await repoResponse.json();
        if (!repoInfo.permissions || repoInfo.permissions.push !== true) {
            throw new Error(`Token does not have write access to ${repoName}. Grant Contents: Read and write.`);
        }

        // 2. The token must not be able to reach any other repository.
        //    For a fine-grained token, /user/repos lists only the repositories
        //    the token was granted.
        const listResponse = await fetch(`${GITHUB_API_ROOT}/user/repos?per_page=100&affiliation=owner,collaborator,organization_member`, {
            headers: tokenHeaders(token)
        });
        if (listResponse.ok) {
            const repos = await listResponse.json();
            const others = repos
                .map(r => r.full_name)
                .filter(name => name.toLowerCase() !== repoName.toLowerCase());
            if (others.length > 0) {
                throw new Error(`Token must be restricted to ${repoName} only. It can also reach: ${others.slice(0, 3).join(', ')}${others.length > 3 ? ', …' : ''}`);
            }
        } else {
            console.warn('Could not list token repositories; skipping the single-repo check', listResponse.status);
        }

        githubToken = token;
        localStorage.setItem('github-token', token);
        showTokenStatus(`✓ Connected to ${repoName} (fine-grained token)`, 'success');

    } catch (error) {
        showTokenStatus(`Error: ${error.message}`, 'error');
        console.error('Token validation error:', error);
    }
}

function tokenHeaders(token) {
    return {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28'
    };
}

function showTokenStatus(message, type) {
    const status = document.getElementById('token-status');
    status.textContent = message;
    status.className = `token-status ${type}`;
}

function loadGitHubConfig() {
    if (!SITE || !githubConfig.owner || !githubConfig.repo) {
        throw new Error('site-config.json has not been loaded. Reload the page.');
    }
}

// GitHub API Helper

// Returns true when the URL targets the pinned repository (or the token
// validation endpoint). Everything else is refused before any request is made.
function isAllowedGitHubUrl(url) {
    const repoBase = `${GITHUB_API_ROOT}/repos/${githubConfig.owner}/${githubConfig.repo}`;
    if (url === repoBase || url.startsWith(`${repoBase}/`)) return true;
    if (url === `${GITHUB_API_ROOT}/user/repos` || url.startsWith(`${GITHUB_API_ROOT}/user/repos?`)) return true;
    return false;
}

async function githubAPI(endpoint, options = {}) {
    loadGitHubConfig();

    const url = endpoint.startsWith('http') ? endpoint : `${GITHUB_API_ROOT}${endpoint}`;

    if (!isAllowedGitHubUrl(url)) {
        throw new Error(`Blocked request outside the configured repository (${githubConfig.owner}/${githubConfig.repo})`);
    }

    const response = await fetch(url, {
        ...options,
        headers: {
            ...tokenHeaders(githubToken),
            'Content-Type': 'application/json',
            ...options.headers
        }
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.message || `GitHub API error: ${response.status}`);
    }

    return response.json();
}

// Paths the admin page is never allowed to create, change or delete. This
// keeps a leaked token from rewriting the admin code or the pinned repo
// through the admin page itself.
const PROTECTED_PATH_PATTERNS = [
    /^site-config\.json$/i,
    /^CNAME$/,
    /^scripts\//,
    /^\.github\//,
    /\.(js|html|css|py)$/i
];

function assertWritablePaths(treeEntries) {
    for (const entry of treeEntries) {
        const path = String(entry.path || '');
        if (!path || path.startsWith('/') || path.split('/').includes('..')) {
            throw new Error(`Refusing to write invalid path "${path}"`);
        }
        if (PROTECTED_PATH_PATTERNS.some(re => re.test(path))) {
            throw new Error(`Refusing to write protected path "${path}" from the admin page`);
        }
    }
    return treeEntries;
}

// UTF-8 safe base64 helpers (btoa/atob alone break on characters above U+00FF)
function encodeBase64Utf8(str) {
    return btoa(unescape(encodeURIComponent(str)));
}

function decodeBase64Utf8(b64) {
    const binary = atob(b64.replace(/\n/g, ''));
    const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
    return new TextDecoder('utf-8').decode(bytes);
}

async function createBlob(content) {
    loadGitHubConfig();
    return await githubAPI(`/repos/${githubConfig.owner}/${githubConfig.repo}/git/blobs`, {
        method: 'POST',
        body: JSON.stringify({
            content: content,
            encoding: 'base64'
        })
    });
}

// File Helper Functions

function readFileAsBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const base64 = reader.result.split(',')[1];
            resolve(base64);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

// Progress Overlay Functions

function showProgress(message, percent) {
    const overlay = document.getElementById('progress-overlay');
    const fill = document.getElementById('progress-bar-fill');
    const messageEl = document.getElementById('progress-message');

    if (overlay) overlay.classList.add('active');
    if (fill) fill.style.width = `${percent}%`;
    if (messageEl) messageEl.textContent = message;
}

function hideProgress() {
    const overlay = document.getElementById('progress-overlay');
    if (overlay) overlay.classList.remove('active');
}

// Tab Management System

// Switch between admin sections
function switchAdminTab(tab) {
    document.querySelectorAll('.admin-tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.admin-section').forEach(section => section.style.display = 'none');

    // Find and activate the button that was clicked
    const clickedBtn = event?.target;
    if (clickedBtn) {
        clickedBtn.classList.add('active');
    }

    if (tab === 'home' || tab === 'about' || tab === 'contact') {
        // All three forms edit home-config.json
        document.getElementById(`admin-${tab}-section`).style.display = 'block';
        loadHomeConfig();
    } else if (tab === 'tabs') {
        document.getElementById('admin-tabs-section').style.display = 'block';
        loadTabsConfig();
    } else {
        // Handle dynamic tab sections
        const sectionId = `admin-${tab}-section`;
        const section = document.getElementById(sectionId);
        if (section) {
            section.style.display = 'block';
        }
    }
}

// Load tabs configuration
async function loadTabsConfig() {
    try {
        const response = await fetch('tabs-config.json');
        tabsConfig = await response.json();
        displayTabsList();
    } catch (error) {
        console.error('Error loading tabs config:', error);
        alert('Error loading tabs configuration');
    }
}

// Display list of tabs
function displayTabsList() {
    const container = document.getElementById('tabs-list');
    container.innerHTML = '';

    if (!tabsConfig || !tabsConfig.tabs || tabsConfig.tabs.length === 0) {
        container.innerHTML = '<p>No tabs configured yet.</p>';
        return;
    }

    tabsConfig.tabs.forEach((tab, index) => {
        const item = document.createElement('div');
        item.className = 'tab-item';

        const subtypesHtml = tab.subtypes && tab.subtypes.length > 0
            ? `<div class="tab-subtypes">
                ${tab.subtypes.map(st => `<span class="subtype-badge">${st.icon || ''} ${st.label}</span>`).join('')}
               </div>`
            : '<div class="tab-subtypes"><span style="color: #999;">No subtypes</span></div>';

        item.innerHTML = `
            <div class="tab-item-header">
                <div>
                    <div class="tab-item-title">${tab.label} <small style="color: #999;">(${tab.id})</small></div>
                    <small style="color: ${tab.enabled ? 'green' : 'red'};">${tab.enabled ? 'Enabled' : 'Disabled'}</small>
                    <small style="color: #999;"> · ${tab.itemType === 'artwork' ? 'Artwork' : 'Adventure'} items${tab.group ? ` · in “${tab.group}” menu` : ''}</small>
                </div>
                <div class="tab-item-actions">
                    <button class="edit-tab-btn" onclick="editTab(${index})">Edit</button>
                    <button class="delete-tab-btn" onclick="deleteTab(${index})">Delete</button>
                </div>
            </div>
            ${subtypesHtml}
        `;

        container.appendChild(item);
    });
}

// Edit a tab
function editTab(index) {
    editingTabIndex = index;
    const tab = tabsConfig.tabs[index];

    document.getElementById('tab-editor-title').textContent = 'Edit Tab';
    document.getElementById('editing-tab-id').value = tab.id;
    document.getElementById('tab-id').value = tab.id;
    document.getElementById('tab-id').disabled = true; // Can't change ID when editing
    document.getElementById('tab-label').value = tab.label;
    document.getElementById('tab-header-text').value = tab.headerText || '';
    document.getElementById('tab-enabled').checked = tab.enabled;
    document.getElementById('tab-group').value = tab.group || '';
    document.getElementById('tab-item-type').value = tab.itemType === 'artwork' ? 'artwork' : 'adventure';
    updateTabTypeFields();

    // Clear and populate subtypes
    const container = document.getElementById('subtypes-container');
    container.innerHTML = '';

    if (tab.subtypes && tab.subtypes.length > 0) {
        tab.subtypes.forEach(subtype => {
            addSubtypeField(subtype);
        });
    }

    // Cover artwork: list the tab's own items and preselect the current one
    populateCoverArtworkSelect(tab);

    // Scroll to form
    document.getElementById('tab-form').scrollIntoView({ behavior: 'smooth' });
}

// Show the subtype editor for adventure tabs and the cover selector for artwork tabs
function updateTabTypeFields() {
    const isArtwork = document.getElementById('tab-item-type').value === 'artwork';
    const subtypesBlock = document.getElementById('tab-subtypes-block');
    const coverBlock = document.getElementById('tab-cover-block');
    if (subtypesBlock) subtypesBlock.style.display = isArtwork ? 'none' : 'block';
    if (coverBlock) coverBlock.style.display = isArtwork ? 'block' : 'none';
}

// Fill the "Cover artwork" select from the tab's data file.
// The cover is always one of the tab's own item images; nothing is uploaded.
async function populateCoverArtworkSelect(tab) {
    const select = document.getElementById('tab-cover-photo');
    if (!select) return;

    select.innerHTML = '<option value="">None</option>';
    const current = tab?.coverPhoto || '';

    if (!tab || !tab.dataFile) {
        return;
    }

    try {
        const response = await fetch(tab.dataFile, { cache: 'no-store' });
        if (!response.ok) return;
        const data = await response.json();
        const items = data.entries || data.adventures || data[tab.id] || [];
        items.forEach(item => {
            const image = item.image || item.coverPhoto;
            if (!image) return;
            const option = document.createElement('option');
            option.value = image;
            option.textContent = item.title;
            select.appendChild(option);
        });
    } catch (error) {
        console.warn('No items yet for cover selection:', error.message);
    }

    if (current && !Array.from(select.options).some(o => o.value === current)) {
        const option = document.createElement('option');
        option.value = current;
        option.textContent = `${current} (current)`;
        select.appendChild(option);
    }
    select.value = current;
}

// Delete a tab
async function deleteTab(index) {
    const tab = tabsConfig.tabs[index];

    if (!confirm(`Are you sure you want to delete the "${tab.label}" tab? This cannot be undone.`)) {
        return;
    }

    tabsConfig.tabs.splice(index, 1);

    try {
        await saveTabsConfig();
        displayTabsList();
        alert('Tab deleted successfully!');
    } catch (error) {
        alert('Error deleting tab: ' + error.message);
    }
}

// Add a subtype field to the form
function addSubtypeField(subtype = null) {
    const container = document.getElementById('subtypes-container');

    const field = document.createElement('div');
    field.className = 'subtype-field';
    field.innerHTML = `
        <input type="text"
               class="subtype-icon"
               placeholder="Icon"
               value="${subtype?.icon || ''}"
               data-field="icon">
        <input type="text"
               class="subtype-id"
               placeholder="Subtype ID (e.g., web-apps)"
               value="${subtype?.id || ''}"
               data-field="id"
               required>
        <input type="text"
               class="subtype-label"
               placeholder="Subtype Label (e.g., Web Apps)"
               value="${subtype?.label || ''}"
               data-field="label"
               required>
        <button type="button" class="remove-subtype-btn" onclick="removeSubtypeField(this)">Remove</button>
    `;

    container.appendChild(field);
}

// Remove a subtype field
function removeSubtypeField(button) {
    button.parentElement.remove();
}

// Cancel tab editing
function cancelTabEdit() {
    editingTabIndex = -1;
    document.getElementById('tab-editor-title').textContent = 'Create New Tab';
    document.getElementById('tab-form').reset();
    document.getElementById('tab-id').disabled = false;
    document.getElementById('editing-tab-id').value = '';
    document.getElementById('tab-header-text').value = '';
    document.getElementById('subtypes-container').innerHTML = '';
    document.getElementById('tab-group').value = '';
    document.getElementById('tab-item-type').value = 'artwork';
    document.getElementById('tab-cover-photo').innerHTML = '<option value="">None</option>';
    updateTabTypeFields();
}

// Handle tab form submission
document.addEventListener('DOMContentLoaded', () => {
    const tabForm = document.getElementById('tab-form');
    if (tabForm) {
        console.log('Tab form found, attaching submit handler');
        tabForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            console.log('Tab form submitted');

            const tabId = document.getElementById('tab-id').value.trim();
            const tabLabel = document.getElementById('tab-label').value.trim();
            const tabHeaderText = document.getElementById('tab-header-text').value.trim();
            const tabEnabled = document.getElementById('tab-enabled').checked;
            const tabGroup = document.getElementById('tab-group').value.trim();
            const tabItemType = document.getElementById('tab-item-type').value === 'artwork' ? 'artwork' : 'adventure';
            const tabCoverPhoto = document.getElementById('tab-cover-photo').value || '';

            console.log('Tab data:', { tabId, tabLabel, tabHeaderText, tabEnabled, tabGroup, tabItemType, tabCoverPhoto });

            // Validate tab ID format
            if (!/^[a-z0-9-]+$/.test(tabId)) {
                alert('Tab ID must contain only lowercase letters, numbers, and hyphens');
                return;
            }

            // Collect subtypes (adventure tabs only; artwork tabs have none)
            const subtypes = [];
            const subtypeFields = tabItemType === 'artwork' ? [] : document.querySelectorAll('.subtype-field');
            subtypeFields.forEach(field => {
                const icon = field.querySelector('[data-field="icon"]').value.trim();
                const id = field.querySelector('[data-field="id"]').value.trim();
                const label = field.querySelector('[data-field="label"]').value.trim();

                if (id && label) {
                    // Validate subtype ID
                    if (!/^[a-z0-9-]+$/.test(id)) {
                        alert(`Subtype ID "${id}" must contain only lowercase letters, numbers, and hyphens`);
                        return;
                    }
                    subtypes.push({ id, label, icon });
                }
            });

            const existing = editingTabIndex >= 0 ? tabsConfig.tabs[editingTabIndex] : null;
            const tab = {
                id: tabId,
                label: tabLabel,
                dataFile: existing?.dataFile || `${tabId}/${tabId}.json`,
                enabled: tabEnabled,
                headerText: tabHeaderText
            };
            if (tabGroup) tab.group = tabGroup;
            if (existing?.dataKey) tab.dataKey = existing.dataKey;

            if (tabItemType === 'artwork') {
                tab.itemType = 'artwork';
                tab.coverPhoto = tabCoverPhoto;
            } else if (subtypes.length > 0) {
                // Only write the key when there is something in it
                tab.subtypes = subtypes;
            }

            try {
                if (editingTabIndex >= 0) {
                    // Update existing tab
                    tabsConfig.tabs[editingTabIndex] = tab;
                } else {
                    // Check if tab ID already exists
                    if (tabsConfig.tabs.some(t => t.id === tabId)) {
                        alert('A tab with this ID already exists');
                        return;
                    }
                    // Add new tab
                    tabsConfig.tabs.push(tab);
                }

                await saveTabsConfig();
                displayTabsList();
                cancelTabEdit();
                alert('Tab saved successfully!');
            } catch (error) {
                alert('Error saving tab: ' + error.message);
            }
        });
    }
});

// Save tabs config to GitHub
async function saveTabsConfig() {
    if (!githubToken) {
        throw new Error('Please save your GitHub token first');
    }

    loadGitHubConfig();
    showProgress('Saving tabs configuration...', 0);

    try {
        // Get current branch reference
        showProgress('Getting repository info...', 20);
        const refData = await githubAPI(`/repos/${githubConfig.owner}/${githubConfig.repo}/git/refs/heads/${githubConfig.branch}`);
        const latestCommitSha = refData.object.sha;

        // Get the current commit
        showProgress('Reading current commit...', 40);
        const commitData = await githubAPI(`/repos/${githubConfig.owner}/${githubConfig.repo}/git/commits/${latestCommitSha}`);
        const treeSha = commitData.tree.sha;

        // Create blob for tabs-config.json
        showProgress('Uploading configuration...', 60);
        const configContent = JSON.stringify(tabsConfig, null, 2);
        // Encode UTF-8 to base64 (supports emojis and special characters)
        const configBase64 = encodeBase64Utf8(configContent);
        const configBlob = await createBlob(configBase64);

        // Create new tree
        showProgress('Creating file tree...', 70);
        const treeItems = assertWritablePaths([{
            path: 'tabs-config.json',
            sha: configBlob.sha,
            mode: '100644',
            type: 'blob'
        }]);
        const newTree = await githubAPI(`/repos/${githubConfig.owner}/${githubConfig.repo}/git/trees`, {
            method: 'POST',
            body: JSON.stringify({
                base_tree: treeSha,
                tree: treeItems
            })
        });

        // Create new commit
        showProgress('Creating commit...', 85);
        const newCommit = await githubAPI(`/repos/${githubConfig.owner}/${githubConfig.repo}/git/commits`, {
            method: 'POST',
            body: JSON.stringify({
                message: 'Update tabs configuration',
                tree: newTree.sha,
                parents: [latestCommitSha]
            })
        });

        // Update branch reference
        showProgress('Pushing to GitHub...', 95);
        await githubAPI(`/repos/${githubConfig.owner}/${githubConfig.repo}/git/refs/heads/${githubConfig.branch}`, {
            method: 'PATCH',
            body: JSON.stringify({
                sha: newCommit.sha
            })
        });

        showProgress('Complete!', 100);
        setTimeout(() => hideProgress(), 1000);

    } catch (error) {
        hideProgress();
        throw error;
    }
}

// Home Page Management

// Load home page configuration
async function loadHomeConfig() {
    try {
        const response = await fetch('home-config.json');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        homeConfig = await response.json();
        populateHomeForm();
    } catch (error) {
        console.error('Error loading home config:', error);
        alert('Error loading home page configuration: ' + error.message);
    }
}

// Populate home page form with current values
function populateHomeForm() {
    if (!homeConfig) return;

    document.getElementById('home-tagline').value = homeConfig.tagline || '';
    document.getElementById('home-about').value = homeConfig.about || '';
    document.getElementById('home-instagram').value = homeConfig.contact?.instagram || '';
    document.getElementById('home-contact-intro').value = homeConfig.contactIntro || '';
    populateArtworkSelect('home-hero-image', homeConfig.heroImage || '');
    populateArtworkSelect('home-contact-image', homeConfig.contactImage || '');

    document.getElementById('home-current').value = homeConfig.professionalBackground?.current || '';
    document.getElementById('home-education').value = homeConfig.professionalBackground?.education || '';
    document.getElementById('home-specialties').value = homeConfig.professionalBackground?.specialties || '';

    document.getElementById('home-email').value = homeConfig.contact?.email || '';
    document.getElementById('home-phone').value = homeConfig.contact?.phone || '';
    document.getElementById('home-location').value = homeConfig.contact?.location || '';

    // Initialize photo collection
    homePhotos = [...(homeConfig.allProfilePhotos || [])];
    homePhotosToDelete = [];
    newHomePhotos = [];
    displayHomePhotoGrid();
}

// Fill a select with every artwork from every artwork tab (grouped by tab)
async function populateArtworkSelect(selectId, current) {
    const select = document.getElementById(selectId);
    if (!select) return;
    select.innerHTML = '<option value="">None</option>';

    try {
        const response = await fetch('tabs-config.json', { cache: 'no-store' });
        const config = await response.json();
        const artworkTabs = (config.tabs || []).filter(t => t.enabled && t.itemType === 'artwork');

        for (const tab of artworkTabs) {
            try {
                const dataResponse = await fetch(tab.dataFile, { cache: 'no-store' });
                if (!dataResponse.ok) continue;
                const data = await dataResponse.json();
                const items = data.entries || data[tab.id] || [];
                if (items.length === 0) continue;

                const group = document.createElement('optgroup');
                group.label = tab.label;
                items.forEach(item => {
                    if (!item.image) return;
                    const option = document.createElement('option');
                    option.value = item.image;
                    option.textContent = item.title;
                    group.appendChild(option);
                });
                select.appendChild(group);
            } catch (error) {
                console.warn(`Could not load ${tab.dataFile}:`, error.message);
            }
        }
    } catch (error) {
        console.warn('Could not load tabs for featured image select:', error.message);
    }

    if (current && !Array.from(select.options).some(o => o.value === current)) {
        const option = document.createElement('option');
        option.value = current;
        option.textContent = `${current} (current)`;
        select.appendChild(option);
    }
    select.value = current;
}

// Display home page photo grid
function displayHomePhotoGrid() {
    const grid = document.getElementById('home-photo-grid');
    if (!grid) {
        console.error('home-photo-grid element not found');
        return;
    }

    grid.innerHTML = '';

    const allPhotos = [...homePhotos, ...newHomePhotos];
    const selectedPhotos = homeConfig?.selectedProfilePhotos || [];

    console.log('Displaying home photo grid:', {
        totalPhotos: allPhotos.length,
        existingPhotos: homePhotos.length,
        newPhotos: newHomePhotos.length,
        selectedCount: selectedPhotos.length,
        selectedPhotos: selectedPhotos
    });

    allPhotos.forEach((photo, index) => {
        const isExisting = index < homePhotos.length;
        const photoPath = isExisting ? photo : URL.createObjectURL(photo);
        // For existing photos, use the actual path. For new photos, use the stored path from homePhotos
        const actualPath = isExisting ? photo : photo.tempPath || `photos/profile-${Date.now()}-${index}.jpg`;

        // Store temp path on new photo objects for consistency
        if (!isExisting && !photo.tempPath) {
            photo.tempPath = actualPath;
        }

        const isSelected = selectedPhotos.includes(actualPath);

        const photoDiv = document.createElement('div');
        photoDiv.className = 'photo-item';
        photoDiv.dataset.photoPath = actualPath; // Store for easy access
        photoDiv.dataset.photoIndex = index;
        photoDiv.dataset.isExisting = isExisting;
        if (isSelected) photoDiv.classList.add('selected');

        // Create img element
        const img = document.createElement('img');
        img.src = photoPath;
        img.alt = `Profile photo ${index + 1}`;
        photoDiv.appendChild(img);

        // Create delete button (red X in top right)
        const deleteBtn = document.createElement('button');
        deleteBtn.type = 'button';
        deleteBtn.className = 'remove-btn';
        deleteBtn.innerHTML = '&times;';
        deleteBtn.onclick = function(e) {
            e.stopPropagation();
            window.deleteHomePhoto(index, isExisting);
        };
        photoDiv.appendChild(deleteBtn);

        // Create selected badge (like COVER badge)
        if (isSelected) {
            const badge = document.createElement('div');
            badge.className = 'selected-badge';
            badge.innerHTML = '✓ SELECTED';
            photoDiv.appendChild(badge);
        }

        // Make entire photo clickable to select/deselect
        photoDiv.onclick = function(e) {
            if (!e.target.classList.contains('remove-btn')) {
                window.toggleHomePhotoSelection(index, isExisting);
            }
        };

        console.log(`Photo ${index} created - selected: ${isSelected}`);

        grid.appendChild(photoDiv);
    });

    if (allPhotos.length === 0) {
        grid.innerHTML = '<p style="color: #999;">No photos uploaded yet. Upload photos above to get started.</p>';
    } else {
        console.log('Photo grid populated with', allPhotos.length, 'photos');
    }
}

// Toggle home photo selection
window.toggleHomePhotoSelection = function(index, isExisting) {
    console.log('Toggle photo selection:', { index, isExisting });

    const allPhotos = [...homePhotos, ...newHomePhotos];
    let selectedPhotos = [...(homeConfig?.selectedProfilePhotos || [])];

    // Get the correct photo path - for new photos, use the tempPath stored on the object
    let photoPath;
    if (isExisting) {
        photoPath = homePhotos[index];
    } else {
        const newIndex = index - homePhotos.length;
        const photo = newHomePhotos[newIndex];
        photoPath = photo.tempPath || `photos/profile-${Date.now()}-${newIndex}.jpg`;
        if (!photo.tempPath) {
            photo.tempPath = photoPath;
        }
    }

    const isSelected = selectedPhotos.includes(photoPath);

    console.log('Photo selection state:', { photoPath, isSelected, currentlySelected: selectedPhotos });

    if (isSelected) {
        // Deselect
        selectedPhotos = selectedPhotos.filter(p => p !== photoPath);
        console.log('Deselected photo:', photoPath);
    } else {
        // Select (max 2)
        if (selectedPhotos.length >= 2) {
            alert('You can only select 2 profile photos. Deselect one of the currently selected photos first by clicking it.');
            return;
        }
        selectedPhotos.push(photoPath);
        console.log('Selected photo:', photoPath);
    }

    // Update config
    if (!homeConfig.selectedProfilePhotos) {
        homeConfig.selectedProfilePhotos = [];
    }
    homeConfig.selectedProfilePhotos = selectedPhotos;

    console.log('New selection:', selectedPhotos);
    displayHomePhotoGrid();
}

// Delete home photo
window.deleteHomePhoto = function(index, isExisting) {
    console.log('Delete photo clicked:', { index, isExisting });

    if (!confirm('Are you sure you want to delete this photo from your collection? It will be removed when you save.')) {
        console.log('Delete cancelled by user');
        return;
    }

    if (isExisting) {
        const photoPath = homePhotos[index];
        console.log('Deleting existing photo:', photoPath);
        homePhotosToDelete.push(photoPath);
        homePhotos.splice(index, 1);

        // Remove from selected if it was selected
        if (homeConfig.selectedProfilePhotos) {
            homeConfig.selectedProfilePhotos = homeConfig.selectedProfilePhotos.filter(p => p !== photoPath);
            console.log('Removed from selected photos');
        }
    } else {
        const newIndex = index - homePhotos.length;
        console.log('Deleting new photo at index:', newIndex);
        newHomePhotos.splice(newIndex, 1);
    }

    console.log('Photos remaining:', { existing: homePhotos.length, new: newHomePhotos.length });
    displayHomePhotoGrid();
}

// Handle photo file selection
document.addEventListener('DOMContentLoaded', () => {
    const photoInput = document.getElementById('home-photo-files');
    if (photoInput) {
        photoInput.addEventListener('change', function() {
            const files = Array.from(this.files);
            newHomePhotos.push(...files);
            displayHomePhotoGrid();
            this.value = ''; // Reset input
        });
    }

    // Setup drag-and-drop for home photos
    const dropZone = document.getElementById('home-photo-drop-zone');
    if (dropZone) {
        dropZone.addEventListener('dragenter', (e) => {
            e.preventDefault();
            dropZone.classList.add('drag-over');
        });

        dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'copy';
        });

        dropZone.addEventListener('dragleave', (e) => {
            // Only remove highlight if leaving the drop zone entirely
            if (e.target === dropZone) {
                dropZone.classList.remove('drag-over');
            }
        });

        dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropZone.classList.remove('drag-over');

            const files = Array.from(e.dataTransfer.files).filter(file =>
                file.type.startsWith('image/')
            );

            if (files.length > 0) {
                newHomePhotos.push(...files);
                displayHomePhotoGrid();
            }
        });

        // Make the entire drop zone clickable to open file picker
        dropZone.addEventListener('click', (e) => {
            // Don't trigger if clicking the button
            if (!e.target.classList.contains('browse-btn')) {
                document.getElementById('home-photo-files').click();
            }
        });
    }
});

// Handle the home, about and contact forms. Each writes the whole of
// home-config.json, reading every field from all three (always-present,
// possibly hidden) forms.
function collectHomeConfig() {
    const value = id => document.getElementById(id).value.trim();
    return {
        allProfilePhotos: homePhotos, // All photos in collection
        selectedProfilePhotos: homeConfig?.selectedProfilePhotos || [],
        heroImage: document.getElementById('home-hero-image').value || '',
        contactImage: document.getElementById('home-contact-image').value || '',
        contactIntro: value('home-contact-intro'),
        tagline: value('home-tagline'),
        about: value('home-about'),
        professionalBackground: {
            current: value('home-current'),
            education: value('home-education'),
            specialties: value('home-specialties')
        },
        contact: {
            email: value('home-email'),
            phone: value('home-phone'),
            location: value('home-location'),
            instagram: value('home-instagram').replace(/^@/, '')
        }
    };
}

document.addEventListener('DOMContentLoaded', () => {
    [['home-form', 'Home page'], ['about-form', 'About page'], ['contact-admin-form', 'Contact page']].forEach(([formId, label]) => {
        const form = document.getElementById(formId);
        if (!form) return;
        form.addEventListener('submit', async function(e) {
            e.preventDefault();
            try {
                await saveHomeConfig(collectHomeConfig(), newHomePhotos, homePhotosToDelete);
                alert(`${label} updated successfully!`);
                // Reload to show new photos
                await loadHomeConfig();
            } catch (error) {
                alert(`Error saving ${label.toLowerCase()}: ` + error.message);
            }
        });
    });
});

// Save home config to GitHub
async function saveHomeConfig(config, newPhotos = [], photosToDelete = []) {
    if (!githubToken) {
        throw new Error('Please save your GitHub token first');
    }

    loadGitHubConfig();
    showProgress('Saving home page...', 0);

    try {
        // Get current branch reference
        showProgress('Getting repository info...', 10);
        const refData = await githubAPI(`/repos/${githubConfig.owner}/${githubConfig.repo}/git/refs/heads/${githubConfig.branch}`);
        const latestCommitSha = refData.object.sha;

        // Get the current commit
        showProgress('Reading current commit...', 20);
        const commitData = await githubAPI(`/repos/${githubConfig.owner}/${githubConfig.repo}/git/commits/${latestCommitSha}`);
        const treeSha = commitData.tree.sha;

        const treeItems = [];

        // Upload new photos if provided
        if (newPhotos.length > 0) {
            showProgress('Uploading new photos...', 30);

            for (let i = 0; i < newPhotos.length; i++) {
                const photo = newPhotos[i];
                const timestamp = Date.now();
                const extension = (photo.name.split('.').pop() || 'jpg').toLowerCase();
                const photoPath = `photos/profile-${timestamp}-${i}.${extension}`;

                // Read photo as base64
                const photoBase64 = await new Promise((resolve) => {
                    const reader = new FileReader();
                    reader.onload = (e) => resolve(e.target.result.split(',')[1]);
                    reader.readAsDataURL(photo);
                });

                // Create blob for photo
                const photoBlob = await createBlob(photoBase64);

                treeItems.push({
                    path: photoPath,
                    sha: photoBlob.sha,
                    mode: '100644',
                    type: 'blob'
                });

                // Add new photo path to config
                config.allProfilePhotos.push(photoPath);
            }
        }

        // Handle deleted photos (mark them as deleted in tree)
        if (photosToDelete.length > 0) {
            showProgress('Removing deleted photos...', 50);
            photosToDelete.forEach(photoPath => {
                treeItems.push({
                    path: photoPath,
                    sha: null, // null sha means delete
                    mode: '100644',
                    type: 'blob'
                });

                // Remove from config
                config.allProfilePhotos = config.allProfilePhotos.filter(p => p !== photoPath);
                if (config.selectedProfilePhotos) {
                    config.selectedProfilePhotos = config.selectedProfilePhotos.filter(p => p !== photoPath);
                }
            });
        }

        // Create blob for home-config.json
        showProgress('Uploading configuration...', 60);
        const configContent = JSON.stringify(config, null, 2);
        const configBase64 = encodeBase64Utf8(configContent);
        const configBlob = await createBlob(configBase64);

        treeItems.push({
            path: 'home-config.json',
            sha: configBlob.sha,
            mode: '100644',
            type: 'blob'
        });

        // Create new tree
        showProgress('Creating file tree...', 70);
        assertWritablePaths(treeItems);
        const newTree = await githubAPI(`/repos/${githubConfig.owner}/${githubConfig.repo}/git/trees`, {
            method: 'POST',
            body: JSON.stringify({
                base_tree: treeSha,
                tree: treeItems
            })
        });

        // Create new commit
        showProgress('Creating commit...', 85);
        const newCommit = await githubAPI(`/repos/${githubConfig.owner}/${githubConfig.repo}/git/commits`, {
            method: 'POST',
            body: JSON.stringify({
                message: 'Update home page configuration and photos',
                tree: newTree.sha,
                parents: [latestCommitSha]
            })
        });

        // Update branch reference
        showProgress('Pushing to GitHub...', 95);
        await githubAPI(`/repos/${githubConfig.owner}/${githubConfig.repo}/git/refs/heads/${githubConfig.branch}`, {
            method: 'PATCH',
            body: JSON.stringify({
                sha: newCommit.sha
            })
        });

        showProgress('Complete!', 100);
        homeConfig = config;
        setTimeout(() => hideProgress(), 1000);

    } catch (error) {
        hideProgress();
        throw error;
    }
}

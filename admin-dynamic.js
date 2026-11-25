// Dynamic Admin Section Generator
// Builds a "Manage <Series>" editor for every enabled tab in tabs-config.json.
// The editors are reached from Manage Portfolio ("Manage pieces"), not from
// top-level buttons.

// Store tab-specific managers
const tabManagers = {};

// Initialize dynamic admin sections
async function initializeDynamicAdmins() {
    try {
        const response = await fetch('tabs-config.json');
        const config = await response.json();

        const adminContainer = document.getElementById('admin-sections-container');
        if (!adminContainer) {
            console.error('Admin container not found');
            return;
        }

        config.tabs.forEach(tab => {
            if (!tab.enabled) return;
            adminContainer.appendChild(generateAdminSection(tab));
            tabManagers[tab.id] = new TabContentManager(tab);
        });
    } catch (error) {
        console.error('Error initializing dynamic admins:', error);
    }
}

// Generate admin section HTML for a tab
function generateAdminSection(tab) {
    const section = document.createElement('div');
    section.id = `admin-${tab.id}-section`;
    section.className = 'admin-section';
    section.style.display = 'none';

    section.innerHTML = `
        <p><button type="button" class="back-link" onclick="switchAdminTab('tabs')">&larr; Back to Manage Portfolio</button></p>
        <h2>Manage ${tab.label}</h2>
        <p>Create, edit, and manage ${tab.label.toLowerCase()} pieces.</p>

        <div class="edit-mode-selector">
            <button type="button" class="mode-btn active" onclick="switchContentMode('${tab.id}', 'create')">Create New</button>
            <button type="button" class="mode-btn" onclick="switchContentMode('${tab.id}', 'edit')">Edit Existing</button>
        </div>

        <div id="${tab.id}-edit-selector" style="display: none;">
            <div class="form-group">
                <label for="${tab.id}-existing-items">Select Piece to Edit</label>
                <select id="${tab.id}-existing-items" onchange="loadItemForEdit('${tab.id}')">
                    <option value="">-- Choose a piece --</option>
                </select>
            </div>
            <div id="${tab.id}-delete-section" style="display: none; margin-top: 1rem;">
                <button type="button" class="delete-btn" onclick="deleteItem('${tab.id}')" style="background-color: #dc3545; color: white; padding: 0.75rem 1.5rem; border: none; border-radius: 4px; cursor: pointer;">Delete This Piece</button>
            </div>
        </div>

        <form id="${tab.id}-form">
            ${generateArtworkFormFields(tab)}

            <button type="submit" class="submit-btn">Save to GitHub</button>
        </form>

        <div id="${tab.id}-output-section" class="output-section">
            <h3>Piece Saved Successfully!</h3>
            <p>Your piece has been committed to GitHub and will be visible on your website shortly.</p>
            <h4>Piece Details</h4>
            <pre id="${tab.id}-json-output"></pre>
            <h4>View on GitHub</h4>
            <p id="${tab.id}-github-link"></p>
        </div>
    `;

    return section;
}

// Form fields for a piece: one image plus its details
function generateArtworkFormFields(tab) {
    return `
        <div class="form-group">
            <label for="${tab.id}-id">Item ID *</label>
            <input type="text" id="${tab.id}-id" placeholder="e.g., chromerman" required>
            <small>Use lowercase letters, numbers, and hyphens only. Also used as the image file name.</small>
        </div>

        <div class="form-group">
            <label for="${tab.id}-title">Title *</label>
            <input type="text" id="${tab.id}-title" placeholder="e.g., Chromerman" required>
        </div>

        <div class="form-group" style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
            <div>
                <label for="${tab.id}-year">Year *</label>
                <input type="number" id="${tab.id}-year" min="1900" max="2100" step="1" placeholder="e.g., 2026" required>
            </div>
            <div>
                <label for="${tab.id}-date">Date Created <small>(optional)</small></label>
                <input type="date" id="${tab.id}-date">
            </div>
        </div>

        <div class="form-group" style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 1rem;">
            <div>
                <label for="${tab.id}-width">Width *</label>
                <input type="number" id="${tab.id}-width" min="0" step="0.25" placeholder="36" required>
            </div>
            <div>
                <label for="${tab.id}-height">Height *</label>
                <input type="number" id="${tab.id}-height" min="0" step="0.25" placeholder="48" required>
            </div>
            <div>
                <label for="${tab.id}-unit">Unit</label>
                <select id="${tab.id}-unit">
                    <option value="in" selected>inches</option>
                    <option value="cm">cm</option>
                </select>
            </div>
        </div>

        <div class="form-group">
            <label for="${tab.id}-medium">Medium *</label>
            <input type="text" id="${tab.id}-medium" placeholder="e.g., Oil on canvas" required>
        </div>

        <div class="form-group" style="display: grid; grid-template-columns: auto 1fr; gap: 1rem; align-items: end;">
            <div>
                <label for="${tab.id}-sold" style="display: flex; align-items: center; gap: 0.5rem;">
                    <input type="checkbox" id="${tab.id}-sold" style="width: auto;"> Sold
                </label>
            </div>
            <div>
                <label for="${tab.id}-price">Price <small>(optional, free text)</small></label>
                <input type="text" id="${tab.id}-price" placeholder="e.g., $1,200 or Contact for pricing">
            </div>
        </div>

        <div class="form-group">
            <label for="${tab.id}-description">Description <small>(optional)</small></label>
            <textarea id="${tab.id}-description" placeholder="Notes about this piece..."></textarea>
        </div>

        <div class="form-group">
            <label for="${tab.id}-image-file">Image * <span id="${tab.id}-image-optional" style="display: none;">(leave empty to keep the current image)</span></label>
            <div id="${tab.id}-image-preview" class="artwork-image-preview"></div>
            <input type="file" id="${tab.id}-image-file" accept="image/*">
            <small>One image per piece. Replacing it overwrites the existing file.</small>
        </div>
    `;
}

// Switch between create and edit mode for a tab
function switchContentMode(tabId, mode) {
    const manager = tabManagers[tabId];
    if (!manager) return;

    manager.editMode = (mode === 'edit');

    // Update button styles
    const section = document.getElementById(`admin-${tabId}-section`);
    section.querySelectorAll('.mode-btn').forEach(btn => {
        btn.classList.toggle('active', btn.textContent.trim() === (manager.editMode ? 'Edit Existing' : 'Create New'));
    });

    // Show/hide edit selector
    document.getElementById(`${tabId}-edit-selector`).style.display = manager.editMode ? 'block' : 'none';
    document.getElementById(`${tabId}-id`).disabled = manager.editMode;
    document.getElementById(`${tabId}-image-optional`).style.display = manager.editMode ? 'inline' : 'none';
    document.getElementById(`${tabId}-image-file`).required = !manager.editMode;

    if (!manager.editMode) {
        manager.resetForm();
    } else {
        manager.loadItemsList();
    }
}

// Load piece for editing
async function loadItemForEdit(tabId) {
    const manager = tabManagers[tabId];
    if (manager) await manager.loadItemForEdit();
}

// Delete piece
async function deleteItem(tabId) {
    const manager = tabManagers[tabId];
    if (manager) await manager.deleteItem();
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('admin-sections-container')) {
        initializeDynamicAdmins();
    }
});

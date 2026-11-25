// Artwork Content Manager - create, edit and delete the pieces of one tab.
// Each piece is one JSON entry in <tab>/<tab>.json plus one image at
// <tab>/<id>.<ext>; every save is a single commit through the GitHub API.
class TabContentManager {
    constructor(tabConfig) {
        this.tabConfig = tabConfig;
        this.tabId = tabConfig.id;
        this.editMode = false;
        this.currentItem = null;
        this.allItems = [];
        this.selectedImage = null; // the File chosen for upload

        this.initializeEventListeners();
    }

    initializeEventListeners() {
        const form = document.getElementById(`${this.tabId}-form`);
        if (form) {
            form.addEventListener('submit', (e) => this.handleSubmit(e));
        }

        const imageInput = document.getElementById(`${this.tabId}-image-file`);
        if (imageInput) {
            imageInput.addEventListener('change', (e) => {
                this.selectedImage = e.target.files[0] || null;
                this.displayImagePreview();
            });
        }
    }

    // Show the current or newly chosen image
    displayImagePreview() {
        const preview = document.getElementById(`${this.tabId}-image-preview`);
        if (!preview) return;

        preview.innerHTML = '';

        if (this.selectedImage) {
            const url = URL.createObjectURL(this.selectedImage);
            preview.innerHTML = `<img src="${url}" alt="Selected image"><div class="artwork-image-caption">${this.selectedImage.name} <em style="color: green;">(new)</em></div>`;
        } else if (this.currentItem && this.currentItem.image) {
            preview.innerHTML = `<img src="${this.currentItem.image}" alt="Current image"><div class="artwork-image-caption">${this.currentItem.image}</div>`;
        }
    }

    async loadItemsList() {
        try {
            const response = await fetch(this.tabConfig.dataFile);
            const data = await response.json();
            this.allItems = data.entries || [];

            const select = document.getElementById(`${this.tabId}-existing-items`);
            select.innerHTML = '<option value="">-- Choose a piece --</option>';

            this.allItems.forEach((item, index) => {
                const option = document.createElement('option');
                option.value = index;
                option.textContent = item.title;
                select.appendChild(option);
            });
        } catch (error) {
            console.error('Error loading items:', error);
        }
    }

    async loadItemForEdit() {
        const index = document.getElementById(`${this.tabId}-existing-items`).value;
        const deleteSection = document.getElementById(`${this.tabId}-delete-section`);
        if (index === '') {
            deleteSection.style.display = 'none';
            return;
        }
        deleteSection.style.display = 'block';

        const item = this.allItems[index];
        this.currentItem = item;

        const set = (suffix, value) => {
            const el = document.getElementById(`${this.tabId}-${suffix}`);
            if (el) el.value = value ?? '';
        };
        set('id', item.id);
        set('title', item.title);
        set('description', item.description || '');
        set('year', item.year ?? '');
        set('date', item.date || '');
        set('width', item.dimensions?.width ?? '');
        set('height', item.dimensions?.height ?? '');
        set('unit', item.dimensions?.unit || 'in');
        set('medium', item.medium || '');
        set('price', item.price || '');
        document.getElementById(`${this.tabId}-sold`).checked = item.sold === true;

        this.selectedImage = null;
        const imageInput = document.getElementById(`${this.tabId}-image-file`);
        imageInput.value = '';
        imageInput.required = false;
        this.displayImagePreview();
    }

    resetForm() {
        document.getElementById(`${this.tabId}-form`).reset();
        this.currentItem = null;
        this.selectedImage = null;
        this.displayImagePreview();
        document.getElementById(`${this.tabId}-image-file`).required = !this.editMode;
    }

    async handleSubmit(e) {
        e.preventDefault();

        if (!githubToken) {
            alert('Please save your GitHub token first');
            return;
        }

        const value = suffix => document.getElementById(`${this.tabId}-${suffix}`).value.trim();

        const id = value('id');
        const title = value('title');
        const description = value('description');
        const year = parseInt(value('year'), 10);
        const width = parseFloat(value('width'));
        const height = parseFloat(value('height'));
        const unit = value('unit') || 'in';
        const medium = value('medium');
        const date = value('date');
        const price = value('price');
        const sold = document.getElementById(`${this.tabId}-sold`).checked;

        if (!/^[a-z0-9-]+$/.test(id)) {
            alert('Item ID must contain only lowercase letters, numbers, and hyphens');
            return;
        }
        if (!Number.isInteger(year) || year < 1900 || year > 2100) {
            alert('Please enter a valid year');
            return;
        }
        if (!(width > 0) || !(height > 0)) {
            alert('Please enter the width and height');
            return;
        }
        if (!medium) {
            alert('Please enter the medium');
            return;
        }
        if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
            alert('Date created must be a full date (YYYY-MM-DD) or left blank');
            return;
        }

        const existingImage = this.editMode && this.currentItem ? (this.currentItem.image || '') : '';
        if (!this.selectedImage && !existingImage) {
            alert('Please choose an image for this piece');
            return;
        }

        const item = {
            id: id,
            title: title,
            year: year,
            date: date,
            dimensions: { width: width, height: height, unit: unit },
            medium: medium,
            sold: sold,
            price: price,
            description: description,
            image: existingImage
        };

        try {
            await this.uploadToGitHub(item, this.selectedImage, existingImage);
        } catch (error) {
            hideProgress();
            alert(`Upload failed: ${error.message}`);
            console.error('Upload error:', error);
        }
    }

    // Read the current item list from the repo through the API (fresh, not the cached deployed copy)
    async readItemsFromRepo() {
        try {
            const dataFile = await githubAPI(`/repos/${githubConfig.owner}/${githubConfig.repo}/contents/${this.tabConfig.dataFile}?ref=${githubConfig.branch}`);
            const data = JSON.parse(decodeBase64Utf8(dataFile.content));
            return data.entries || [];
        } catch (error) {
            console.log('Data file not found, starting fresh');
            return [];
        }
    }

    // Commit a tree of changes on top of the current branch head
    async commitTree(treeItems, message) {
        assertWritablePaths(treeItems);

        const refData = await githubAPI(`/repos/${githubConfig.owner}/${githubConfig.repo}/git/refs/heads/${githubConfig.branch}`);
        const latestCommitSha = refData.object.sha;
        const commitData = await githubAPI(`/repos/${githubConfig.owner}/${githubConfig.repo}/git/commits/${latestCommitSha}`);

        const newTree = await githubAPI(`/repos/${githubConfig.owner}/${githubConfig.repo}/git/trees`, {
            method: 'POST',
            body: JSON.stringify({ base_tree: commitData.tree.sha, tree: treeItems })
        });

        const newCommit = await githubAPI(`/repos/${githubConfig.owner}/${githubConfig.repo}/git/commits`, {
            method: 'POST',
            body: JSON.stringify({ message: message, tree: newTree.sha, parents: [latestCommitSha] })
        });

        await githubAPI(`/repos/${githubConfig.owner}/${githubConfig.repo}/git/refs/heads/${githubConfig.branch}`, {
            method: 'PATCH',
            body: JSON.stringify({ sha: newCommit.sha })
        });

        return newCommit;
    }

    async uploadToGitHub(item, imageFile, previousImagePath) {
        loadGitHubConfig();
        showProgress('Preparing upload...', 0);

        showProgress('Reading data file...', 15);
        const items = await this.readItemsFromRepo();

        const treeItems = [];

        if (imageFile) {
            showProgress('Uploading image...', 30);
            const extension = (imageFile.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
            const imagePath = `${this.tabId}/${item.id}.${extension}`;
            const imageBlob = await createBlob(await readFileAsBase64(imageFile));
            treeItems.push({ path: imagePath, sha: imageBlob.sha, mode: '100644', type: 'blob' });

            // Remove the old file when the replacement has a different name
            if (previousImagePath && previousImagePath !== imagePath) {
                treeItems.push({ path: previousImagePath, sha: null, mode: '100644', type: 'blob' });
            }
            item.image = imagePath;
        }

        showProgress('Updating item list...', 70);
        const existingIndex = items.findIndex(a => a.id === item.id);
        if (existingIndex >= 0) {
            items[existingIndex] = item;
        } else {
            items.push(item);
        }

        const jsonBlob = await createBlob(encodeBase64Utf8(JSON.stringify({ entries: items }, null, 2)));
        treeItems.push({ path: this.tabConfig.dataFile, sha: jsonBlob.sha, mode: '100644', type: 'blob' });

        showProgress('Creating commit...', 85);
        const label = this.tabConfig.label.toLowerCase();
        const newCommit = await this.commitTree(treeItems, this.editMode ? `Update ${label}: ${item.title}` : `Add ${label}: ${item.title}`);

        showProgress('Upload complete!', 100);
        setTimeout(() => {
            hideProgress();
            this.showSuccess(item, newCommit.sha);
        }, 1000);
    }

    showSuccess(item, commitSha) {
        const outputSection = document.getElementById(`${this.tabId}-output-section`);
        const jsonOutput = document.getElementById(`${this.tabId}-json-output`);
        const githubLink = document.getElementById(`${this.tabId}-github-link`);

        jsonOutput.textContent = JSON.stringify(item, null, 2);

        const repoUrl = `https://github.com/${githubConfig.owner}/${githubConfig.repo}`;
        githubLink.innerHTML = `
            <a href="${repoUrl}/commit/${commitSha}" target="_blank">View commit on GitHub</a><br>
            <a href="${repoUrl}/blob/${githubConfig.branch}/${item.image}" target="_blank">View image file</a>
        `;

        outputSection.classList.add('active');
        outputSection.scrollIntoView({ behavior: 'smooth' });

        this.resetForm();
        this.loadItemsList();
    }

    async deleteItem() {
        if (!this.currentItem) {
            alert('No piece selected');
            return;
        }

        const confirmed = confirm(`Are you sure you want to delete "${this.currentItem.title}"? This action cannot be undone.`);
        if (!confirmed) return;

        if (!githubToken) {
            alert('Please save your GitHub token first');
            return;
        }

        try {
            loadGitHubConfig();
            showProgress('Deleting piece...', 0);

            showProgress('Reading item list...', 30);
            const existing = await this.readItemsFromRepo();
            const removed = existing.find(itm => itm.id === this.currentItem.id);
            const items = existing.filter(itm => itm.id !== this.currentItem.id);

            showProgress('Updating item list...', 60);
            const jsonBlob = await createBlob(encodeBase64Utf8(JSON.stringify({ entries: items }, null, 2)));
            const treeItems = [{ path: this.tabConfig.dataFile, sha: jsonBlob.sha, mode: '100644', type: 'blob' }];

            // The piece owns exactly one file: remove it along with the entry
            if (removed && removed.image) {
                treeItems.push({ path: removed.image, sha: null, mode: '100644', type: 'blob' });
            }

            showProgress('Creating commit...', 80);
            await this.commitTree(treeItems, `Delete ${this.tabConfig.label.toLowerCase()}: ${this.currentItem.title}`);

            showProgress('Complete!', 100);
            setTimeout(() => {
                hideProgress();
                alert('Piece deleted successfully!');
                this.resetForm();
                this.loadItemsList();
                document.getElementById(`${this.tabId}-existing-items`).value = '';
                document.getElementById(`${this.tabId}-delete-section`).style.display = 'none';
            }, 1000);
        } catch (error) {
            hideProgress();
            alert(`Delete failed: ${error.message}`);
            console.error('Delete error:', error);
        }
    }
}

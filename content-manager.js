// Generic Content Manager - Handles CRUD operations for any tab
class TabContentManager {
    constructor(tabConfig) {
        this.tabConfig = tabConfig;
        this.tabId = tabConfig.id;
        // 'artwork' tabs hold single-image pieces; everything else is the
        // original adventure shape (categories, dates, GPX, photo gallery).
        this.isArtwork = tabConfig.itemType === 'artwork';
        this.editMode = false;
        this.currentItem = null;
        this.allItems = [];
        this.selectedPhotos = [];
        this.existingPhotos = [];
        this.coverPhotoIndex = 0;
        this.existingGpxFiles = [];
        this.newGpxFiles = [];
        this.gpxFilesToRemove = [];
        this.selectedImage = null; // artwork: the File chosen for upload

        this.initializeEventListeners();
    }

    initializeEventListeners() {
        // Form submission
        const form = document.getElementById(`${this.tabId}-form`);
        if (form) {
            form.addEventListener('submit', (e) => this.handleSubmit(e));
        }

        // Artwork single-image selection
        const imageInput = document.getElementById(`${this.tabId}-image-file`);
        if (imageInput) {
            imageInput.addEventListener('change', (e) => {
                this.selectedImage = e.target.files[0] || null;
                this.displayImagePreview();
            });
        }

        // Photo file selection
        const photoInput = document.getElementById(`${this.tabId}-photo-files`);
        if (photoInput) {
            photoInput.addEventListener('change', (e) => {
                const files = Array.from(e.target.files);
                this.selectedPhotos = [...this.selectedPhotos, ...files];
                this.displayPhotoGrid();
            });
        }

        // GPX file selection
        const gpxInput = document.getElementById(`${this.tabId}-gpx-files`);
        if (gpxInput) {
            gpxInput.addEventListener('change', async (e) => {
                const files = Array.from(e.target.files);
                for (const file of files) {
                    const analysis = await this.analyzeGpxFile(file);
                    this.newGpxFiles.push({
                        file: file,
                        type: analysis.type,
                        label: analysis.label
                    });
                }
                this.displayGpxFiles();
            });
        }

        // Setup drag-and-drop for photos
        this.setupPhotoDragDrop();

        // Date range auto-fill
        const startDateInput = document.getElementById(`${this.tabId}-start-date`);
        if (startDateInput) {
            startDateInput.addEventListener('change', () => {
                const startDate = startDateInput.value;
                const endDateField = document.getElementById(`${this.tabId}-end-date`);
                if (startDate && endDateField && !endDateField.value) {
                    endDateField.value = startDate;
                    endDateField.min = startDate;
                    setTimeout(() => endDateField.focus(), 100);
                } else if (startDate && endDateField) {
                    endDateField.min = startDate;
                }
            });
        }
    }

    setupPhotoDragDrop() {
        const dropZone = document.getElementById(`${this.tabId}-photo-drop-zone`);
        if (!dropZone) return;

        dropZone.addEventListener('dragenter', (e) => {
            e.preventDefault();
            dropZone.classList.add('drag-over');
        });

        dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'copy';
        });

        dropZone.addEventListener('dragleave', (e) => {
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
                this.selectedPhotos = [...this.selectedPhotos, ...files];
                this.displayPhotoGrid();
            }
        });

        // Make entire drop zone clickable
        dropZone.addEventListener('click', (e) => {
            if (!e.target.classList.contains('browse-btn')) {
                document.getElementById(`${this.tabId}-photo-files`).click();
            }
        });
    }

    async analyzeGpxFile(file) {
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = function(e) {
                const content = e.target.result;
                const parser = new DOMParser();
                const xmlDoc = parser.parseFromString(content, 'text/xml');

                const waypoints = xmlDoc.getElementsByTagName('wpt');
                const tracks = xmlDoc.getElementsByTagName('trk');
                const routes = xmlDoc.getElementsByTagName('rte');

                let type = 'route';
                let label = file.name.replace('.gpx', '');

                if (waypoints.length > 0 && tracks.length === 0 && routes.length === 0) {
                    type = 'waypoints';
                    label = label.includes('waypoint') || label.includes('camp') ? label : 'Waypoints';
                } else if (tracks.length > 0 || routes.length > 0) {
                    type = 'route';
                    label = label.includes('route') || label.includes('track') ? label : 'Route';
                }

                resolve({ type, label });
            };
            reader.readAsText(file);
        });
    }

    // Artwork tabs: show the current or newly chosen image
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

    displayPhotoGrid() {
        const preview = document.getElementById(`${this.tabId}-photo-preview`);
        const coverGroup = document.getElementById(`${this.tabId}-cover-photo-group`);
        if (!preview || !coverGroup) return; // artwork tabs have no photo grid

        preview.innerHTML = '';

        const allPhotos = [...this.existingPhotos, ...this.selectedPhotos];

        if (allPhotos.length === 0) {
            coverGroup.style.display = 'none';
            return;
        }

        coverGroup.style.display = 'block';

        allPhotos.forEach((photo, index) => {
            const item = document.createElement('div');
            item.className = 'photo-item';
            if (index === this.coverPhotoIndex) {
                item.classList.add('cover');
            }

            const isExisting = index < this.existingPhotos.length;

            if (isExisting) {
                item.innerHTML = `
                    <img src="${photo}" alt="Photo ${index + 1}">
                    <button type="button" class="remove-btn" onclick="tabManagers['${this.tabId}'].removePhoto(${index})">&times;</button>
                    ${index === this.coverPhotoIndex ? '<div class="cover-badge">COVER</div>' : ''}
                `;
            } else {
                const fileIndex = index - this.existingPhotos.length;
                const reader = new FileReader();
                reader.onload = function(e) {
                    item.innerHTML = `
                        <img src="${e.target.result}" alt="Photo ${index + 1}">
                        <button type="button" class="remove-btn" onclick="tabManagers['${this.tabId}'].removePhoto(${index})">&times;</button>
                        ${index === this.coverPhotoIndex ? '<div class="cover-badge">COVER</div>' : ''}
                    `;
                };
                reader.readAsDataURL(this.selectedPhotos[fileIndex]);
            }

            item.onclick = (e) => {
                if (!e.target.classList.contains('remove-btn')) {
                    this.setCoverPhoto(index);
                }
            };

            preview.appendChild(item);
        });
    }

    setCoverPhoto(index) {
        this.coverPhotoIndex = index;
        this.displayPhotoGrid();
    }

    removePhoto(index) {
        const isExisting = index < this.existingPhotos.length;

        if (isExisting) {
            this.existingPhotos.splice(index, 1);
        } else {
            const fileIndex = index - this.existingPhotos.length;
            this.selectedPhotos.splice(fileIndex, 1);
        }

        // Adjust cover photo index if necessary
        if (this.coverPhotoIndex >= (this.existingPhotos.length + this.selectedPhotos.length)) {
            this.coverPhotoIndex = Math.max(0, this.existingPhotos.length + this.selectedPhotos.length - 1);
        }

        this.displayPhotoGrid();
    }

    displayGpxFiles() {
        const container = document.getElementById(`${this.tabId}-gpx-files-container`);
        const listDiv = document.getElementById(`${this.tabId}-existing-gpx-list`);
        if (!container || !listDiv) return; // artwork tabs have no GPX UI

        const allGpxFiles = [
            ...this.existingGpxFiles.filter(gpx => !this.gpxFilesToRemove.includes(gpx.url)),
            ...this.newGpxFiles
        ];

        if (allGpxFiles.length === 0) {
            listDiv.style.display = 'none';
            return;
        }

        listDiv.style.display = 'block';
        container.innerHTML = '';

        // Display existing files
        this.existingGpxFiles.forEach((gpx) => {
            if (this.gpxFilesToRemove.includes(gpx.url)) return;

            const item = document.createElement('div');
            item.className = 'gpx-file-item';

            const fileName = gpx.url.split('/').pop();
            const icon = gpx.type === 'waypoints' ? '⛺' : '📍';
            const typeLabel = gpx.type === 'waypoints' ? 'Waypoints' : 'Route';

            item.innerHTML = `
                <div class="gpx-file-name">
                    <span class="gpx-file-icon">${icon}</span>
                    <span><strong>${typeLabel}:</strong> ${fileName}</span>
                </div>
                <button type="button" class="gpx-remove-btn" onclick="tabManagers['${this.tabId}'].removeExistingGpx('${gpx.url}')">Remove</button>
            `;

            container.appendChild(item);
        });

        // Display new files
        this.newGpxFiles.forEach((gpx, index) => {
            const item = document.createElement('div');
            item.className = 'gpx-file-item';

            const icon = gpx.type === 'waypoints' ? '⛺' : '📍';
            const typeLabel = gpx.type === 'waypoints' ? 'Waypoints' : 'Route';

            item.innerHTML = `
                <div class="gpx-file-name">
                    <span class="gpx-file-icon">${icon}</span>
                    <span><strong>${typeLabel}:</strong> ${gpx.file.name} <em style="color: green;">(new)</em></span>
                </div>
                <button type="button" class="gpx-remove-btn" onclick="tabManagers['${this.tabId}'].removeNewGpx(${index})">Remove</button>
            `;

            container.appendChild(item);
        });
    }

    removeExistingGpx(url) {
        this.gpxFilesToRemove.push(url);
        this.displayGpxFiles();
    }

    removeNewGpx(index) {
        this.newGpxFiles.splice(index, 1);
        this.displayGpxFiles();
    }

    async loadItemsList() {
        try {
            const response = await fetch(this.tabConfig.dataFile);
            const data = await response.json();
            this.allItems = data.adventures || data.entries || data[this.tabId] || [];

            const select = document.getElementById(`${this.tabId}-existing-items`);
            select.innerHTML = '<option value="">-- Choose an item --</option>';

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
        if (index === '') {
            document.getElementById(`${this.tabId}-delete-section`).style.display = 'none';
            return;
        }

        document.getElementById(`${this.tabId}-delete-section`).style.display = 'block';

        this.currentItem = this.allItems[index];

        // Populate form fields
        document.getElementById(`${this.tabId}-id`).value = this.currentItem.id;
        document.getElementById(`${this.tabId}-title`).value = this.currentItem.title;
        document.getElementById(`${this.tabId}-description`).value = this.currentItem.description || '';

        if (this.isArtwork) {
            this.populateArtworkForm(this.currentItem);
            return;
        }

        document.getElementById(`${this.tabId}-youtube-url`).value = this.currentItem.youtubeUrl || '';

        // Handle categories
        const categories = Array.isArray(this.currentItem.categories) ?
            this.currentItem.categories :
            (this.currentItem.category ? [this.currentItem.category] : []);

        document.querySelectorAll(`input[name="${this.tabId}-categories"]`).forEach(cb => cb.checked = false);

        categories.forEach(cat => {
            const checkbox = document.getElementById(`${this.tabId}-category-${cat}`);
            if (checkbox) checkbox.checked = true;
        });

        // Handle dates
        updateDateFieldsForTab(this.tabId);
        if (this.currentItem.startDate && this.currentItem.endDate) {
            document.getElementById(`${this.tabId}-start-date`).value = this.currentItem.startDate;
            document.getElementById(`${this.tabId}-end-date`).value = this.currentItem.endDate;
        } else if (this.currentItem.date) {
            document.getElementById(`${this.tabId}-date`).value = this.currentItem.date;
        }

        // Load existing photos
        this.existingPhotos = this.currentItem.photos || [];
        const coverPhoto = this.currentItem.coverPhoto;
        this.coverPhotoIndex = this.existingPhotos.indexOf(coverPhoto);
        if (this.coverPhotoIndex === -1) this.coverPhotoIndex = 0;

        // Load existing GPX files
        this.existingGpxFiles = [];
        this.newGpxFiles = [];
        this.gpxFilesToRemove = [];

        if (this.currentItem.gpxFile) {
            this.existingGpxFiles.push({
                url: this.currentItem.gpxFile,
                label: 'Route',
                type: 'route'
            });
        }

        if (this.currentItem.waypointsFile) {
            this.existingGpxFiles.push({
                url: this.currentItem.waypointsFile,
                label: 'Waypoints',
                type: 'waypoints'
            });
        }

        if (this.currentItem.gpxFiles && Array.isArray(this.currentItem.gpxFiles)) {
            this.existingGpxFiles = this.currentItem.gpxFiles.map(gpx => ({
                url: gpx.url || gpx.file,
                label: gpx.label || 'GPS Data',
                type: gpx.type || 'route'
            }));
        }

        this.displayGpxFiles();
        this.displayPhotoGrid();
    }

    populateArtworkForm(item) {
        const set = (suffix, value) => {
            const el = document.getElementById(`${this.tabId}-${suffix}`);
            if (el) el.value = value ?? '';
        };
        set('year', item.year ?? '');
        set('date', item.date || '');
        set('width', item.dimensions?.width ?? '');
        set('height', item.dimensions?.height ?? '');
        set('unit', item.dimensions?.unit || 'in');
        set('medium', item.medium || '');
        set('price', item.price || '');

        const sold = document.getElementById(`${this.tabId}-sold`);
        if (sold) sold.checked = item.sold === true;

        this.selectedImage = null;
        const imageInput = document.getElementById(`${this.tabId}-image-file`);
        if (imageInput) {
            imageInput.value = '';
            imageInput.required = false;
        }
        this.displayImagePreview();
    }

    resetForm() {
        document.getElementById(`${this.tabId}-form`).reset();
        this.selectedPhotos = [];
        this.existingPhotos = [];
        this.existingGpxFiles = [];
        this.newGpxFiles = [];
        this.gpxFilesToRemove = [];
        this.coverPhotoIndex = 0;
        this.currentItem = null;
        this.selectedImage = null;
        this.displayPhotoGrid();
        this.displayGpxFiles();
        this.displayImagePreview();

        const imageInput = document.getElementById(`${this.tabId}-image-file`);
        if (imageInput) imageInput.required = !this.editMode;
    }

    async handleSubmit(e) {
        e.preventDefault();

        if (!githubToken) {
            alert('Please save your GitHub token first');
            return;
        }

        const id = document.getElementById(`${this.tabId}-id`).value.trim();
        const title = document.getElementById(`${this.tabId}-title`).value.trim();
        const description = document.getElementById(`${this.tabId}-description`).value.trim();

        // Validate ID format
        if (!/^[a-z0-9-]+$/.test(id)) {
            alert('Item ID must contain only lowercase letters, numbers, and hyphens');
            return;
        }

        if (this.isArtwork) {
            await this.handleArtworkSubmit(id, title, description);
            return;
        }

        // Get selected categories
        const categories = Array.from(document.querySelectorAll(`input[name="${this.tabId}-categories"]:checked`))
            .map(cb => cb.value);

        if (categories.length === 0) {
            alert('Please select at least one category');
            return;
        }

        // Get dates
        let dateData = {};
        const needsRange = categories.some(cat => ['camping', 'hut-trips', 'other'].includes(cat));
        if (needsRange) {
            dateData.startDate = document.getElementById(`${this.tabId}-start-date`).value;
            dateData.endDate = document.getElementById(`${this.tabId}-end-date`).value;
        } else {
            dateData.date = document.getElementById(`${this.tabId}-date`).value;
        }

        // Get YouTube URL if provided
        const youtubeUrl = document.getElementById(`${this.tabId}-youtube-url`).value.trim();

        const allPhotos = [...this.existingPhotos, ...this.selectedPhotos];

        if (allPhotos.length === 0 && !this.editMode) {
            alert('Please select at least one photo');
            return;
        }

        // Build item object
        const item = {
            id: id,
            title: title,
            categories: categories,
            ...dateData,
            description: description,
            coverPhoto: null,
            gpxFiles: [],
            photos: []
        };

        if (youtubeUrl) {
            item.youtubeUrl = youtubeUrl;
        }

        const remainingExisting = this.existingGpxFiles.filter(gpx => !this.gpxFilesToRemove.includes(gpx.url));

        try {
            await this.uploadToGitHub(item, this.newGpxFiles, this.selectedPhotos, this.existingPhotos, remainingExisting);
        } catch (error) {
            hideProgress();
            alert(`Upload failed: ${error.message}`);
            console.error('Upload error:', error);
        }
    }

    // Artwork submit: validate the piece fields and build the item
    async handleArtworkSubmit(id, title, description) {
        const value = suffix => document.getElementById(`${this.tabId}-${suffix}`).value.trim();

        const year = parseInt(value('year'), 10);
        const width = parseFloat(value('width'));
        const height = parseFloat(value('height'));
        const unit = value('unit') || 'in';
        const medium = value('medium');
        const date = value('date');
        const price = value('price');
        const sold = document.getElementById(`${this.tabId}-sold`).checked;

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
            await this.uploadArtworkToGitHub(item, this.selectedImage, existingImage);
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
            return data.adventures || data.entries || data[this.tabId] || [];
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

    async uploadArtworkToGitHub(item, imageFile, previousImagePath) {
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

        const updatedData = {};
        updatedData[this.getDataKey()] = items;
        const jsonBlob = await createBlob(encodeBase64Utf8(JSON.stringify(updatedData, null, 2)));
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

    async uploadToGitHub(item, newGpxFilesList, newPhotos, existingPhotos, remainingGpxFiles) {
        try {
            loadGitHubConfig();
            showProgress('Preparing upload...', 0);

            // Get current branch reference
            showProgress('Getting repository info...', 10);
            const refData = await githubAPI(`/repos/${githubConfig.owner}/${githubConfig.repo}/git/refs/heads/${githubConfig.branch}`);
            const latestCommitSha = refData.object.sha;

            // Get the current commit
            showProgress('Reading current commit...', 20);
            const commitData = await githubAPI(`/repos/${githubConfig.owner}/${githubConfig.repo}/git/commits/${latestCommitSha}`);
            const treeSha = commitData.tree.sha;

            // Read current data file
            showProgress('Reading data file...', 30);
            const items = await this.readItemsFromRepo();

            // Create blobs for all files
            const blobs = [];
            const gpxFilesArray = [];

            // Upload new GPX files
            for (let i = 0; i < newGpxFilesList.length; i++) {
                const gpxData = newGpxFilesList[i];
                showProgress(`Uploading GPX file ${i + 1}/${newGpxFilesList.length}...`, 35 + (i / newGpxFilesList.length) * 10);

                const fileName = `${gpxData.type}-${Date.now()}-${i}.gpx`;
                const gpxPath = `${this.tabId}/${item.id}/${fileName}`;

                const gpxContent = await readFileAsBase64(gpxData.file);
                const gpxBlob = await createBlob(gpxContent);
                blobs.push({
                    path: gpxPath,
                    sha: gpxBlob.sha,
                    mode: '100644',
                    type: 'blob'
                });

                gpxFilesArray.push({
                    url: gpxPath,
                    label: gpxData.label,
                    type: gpxData.type
                });
            }

            // Add remaining existing GPX files
            remainingGpxFiles.forEach(gpx => {
                gpxFilesArray.push({
                    url: gpx.url,
                    label: gpx.label,
                    type: gpx.type
                });
            });

            item.gpxFiles = gpxFilesArray;

            let photoNumber = 1;

            // Build photos array and determine cover photo
            const finalPhotos = [];
            let coverPhotoPath = '';

            // Upload new photos
            for (let i = 0; i < newPhotos.length; i++) {
                const progress = 45 + (i / (newPhotos.length + existingPhotos.length)) * 35;
                showProgress(`Uploading photo ${i + 1}/${newPhotos.length + existingPhotos.length}...`, progress);

                const photo = newPhotos[i];
                const extension = photo.name.split('.').pop().toLowerCase();
                const globalIndex = existingPhotos.length + i;

                let filename;
                if (globalIndex === this.coverPhotoIndex) {
                    filename = `cover.${extension}`;
                } else {
                    filename = `photo-${photoNumber}.${extension}`;
                    photoNumber++;
                }

                const photoPath = `${this.tabId}/${item.id}/${filename}`;
                const photoContent = await readFileAsBase64(photo);
                const photoBlob = await createBlob(photoContent);
                blobs.push({
                    path: photoPath,
                    sha: photoBlob.sha,
                    mode: '100644',
                    type: 'blob'
                });

                finalPhotos.push(photoPath);
                if (globalIndex === this.coverPhotoIndex) {
                    coverPhotoPath = photoPath;
                }
            }

            // Add existing photos to final list
            existingPhotos.forEach((photoPath, i) => {
                if (i === this.coverPhotoIndex && !coverPhotoPath) {
                    coverPhotoPath = photoPath;
                }
                if (!finalPhotos.includes(photoPath)) {
                    finalPhotos.push(photoPath);
                }
            });

            // Reorder to put cover photo first
            if (coverPhotoPath) {
                const filtered = finalPhotos.filter(p => p !== coverPhotoPath);
                finalPhotos.splice(0, finalPhotos.length, coverPhotoPath, ...filtered);
            }

            item.coverPhoto = coverPhotoPath || finalPhotos[0];
            item.photos = finalPhotos;

            // Update or add item to list
            showProgress('Updating item list...', 82);
            const existingIndex = items.findIndex(a => a.id === item.id);
            if (existingIndex >= 0) {
                items[existingIndex] = item;
            } else {
                items.push(item);
            }

            // Determine data key
            const dataKey = this.getDataKey();
            const updatedData = {};
            updatedData[dataKey] = items;
            const updatedJson = JSON.stringify(updatedData, null, 2);

            // Upload updated data file
            const jsonBlob = await createBlob(encodeBase64Utf8(updatedJson));
            blobs.push({
                path: this.tabConfig.dataFile,
                sha: jsonBlob.sha,
                mode: '100644',
                type: 'blob'
            });

            // Create new tree
            showProgress('Creating file tree...', 85);
            assertWritablePaths(blobs);
            const newTree = await githubAPI(`/repos/${githubConfig.owner}/${githubConfig.repo}/git/trees`, {
                method: 'POST',
                body: JSON.stringify({
                    base_tree: treeSha,
                    tree: blobs
                })
            });

            // Create new commit
            showProgress('Creating commit...', 90);
            const commitMessage = this.editMode ? `Update ${this.tabConfig.label.toLowerCase()}: ${item.title}` : `Add ${this.tabConfig.label.toLowerCase()}: ${item.title}`;
            const newCommit = await githubAPI(`/repos/${githubConfig.owner}/${githubConfig.repo}/git/commits`, {
                method: 'POST',
                body: JSON.stringify({
                    message: commitMessage,
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

            // Success!
            showProgress('Upload complete!', 100);
            setTimeout(() => {
                hideProgress();
                this.showSuccess(item, newCommit.sha);
            }, 1000);

        } catch (error) {
            console.error('GitHub upload error:', error);
            throw error;
        }
    }

    getDataKey() {
        // Determine the JSON key for items
        // Check if tab config specifies a dataKey
        if (this.tabConfig.dataKey) {
            return this.tabConfig.dataKey;
        }
        // Backward compatibility: adventures uses 'adventures', all others use 'entries'
        if (this.tabId === 'adventures') return 'adventures';
        return 'entries';
    }

    showSuccess(item, commitSha) {
        const outputSection = document.getElementById(`${this.tabId}-output-section`);
        const jsonOutput = document.getElementById(`${this.tabId}-json-output`);
        const githubLink = document.getElementById(`${this.tabId}-github-link`);

        jsonOutput.textContent = JSON.stringify(item, null, 2);

        const repoUrl = `https://github.com/${githubConfig.owner}/${githubConfig.repo}`;
        const filesPath = this.isArtwork ? item.image : `${this.tabId}/${item.id}`;
        githubLink.innerHTML = `
            <a href="${repoUrl}/commit/${commitSha}" target="_blank">View commit on GitHub</a><br>
            <a href="${repoUrl}/blob/${githubConfig.branch}/${filesPath}" target="_blank">View item file${this.isArtwork ? '' : 's'}</a>
        `;

        outputSection.classList.add('active');
        outputSection.scrollIntoView({ behavior: 'smooth' });

        // Reset form
        this.resetForm();

        // Reload items list
        this.loadItemsList();
    }

    async deleteItem() {
        if (!this.currentItem) {
            alert('No item selected');
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
            showProgress('Deleting item...', 0);

            // Read current data file
            showProgress('Reading item list...', 30);
            const existing = await this.readItemsFromRepo();
            const removed = existing.find(itm => itm.id === this.currentItem.id);
            const items = existing.filter(itm => itm.id !== this.currentItem.id);

            // Determine data key
            const dataKey = this.getDataKey();
            const updatedData = {};
            updatedData[dataKey] = items;
            const updatedJson = JSON.stringify(updatedData, null, 2);

            // Update data file
            showProgress('Updating item list...', 60);
            const jsonBlob = await createBlob(encodeBase64Utf8(updatedJson));
            const treeItems = [{
                path: this.tabConfig.dataFile,
                sha: jsonBlob.sha,
                mode: '100644',
                type: 'blob'
            }];

            // Artwork items own exactly one file: remove it along with the entry
            if (this.isArtwork && removed && removed.image) {
                treeItems.push({ path: removed.image, sha: null, mode: '100644', type: 'blob' });
            }

            showProgress('Creating commit...', 80);
            await this.commitTree(treeItems, `Delete ${this.tabConfig.label.toLowerCase()}: ${this.currentItem.title}`);

            showProgress('Complete!', 100);
            setTimeout(() => {
                hideProgress();
                alert('Item deleted successfully!');
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

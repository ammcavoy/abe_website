// Load home page content from configuration
async function loadHomeContent() {
    try {
        const response = await fetch('home-config.json');
        const config = await response.json();

        // Featured artwork on the home page (optional)
        const hero = document.getElementById('hero-artwork');
        if (hero) {
            if (config.heroImage) {
                const img = hero.querySelector('img');
                img.src = config.heroImage;
                img.alt = 'Featured artwork';
                hero.style.display = '';
            } else {
                hero.style.display = 'none';
            }
        }

        // Update profile photos (use selected photos); hide the row when there are none
        const photosToDisplay = config.selectedProfilePhotos || [];
        const profileRow = document.querySelector('.profile-images');
        if (photosToDisplay.length > 0) {
            const profileImageContainers = document.querySelectorAll('.profile-image');
            photosToDisplay.forEach((photoPath, index) => {
                if (profileImageContainers[index]) {
                    const container = profileImageContainers[index];
                    container.classList.remove('placeholder');
                    container.innerHTML = `<img src="${photoPath}" alt="Profile Photo">`;
                }
            });
            profileImageContainers.forEach((container, index) => {
                container.style.display = index < photosToDisplay.length ? '' : 'none';
            });
            if (profileRow) profileRow.style.display = '';
        } else if (profileRow) {
            profileRow.style.display = 'none';
        }

        // Update tagline
        const taglineEl = document.querySelector('.tagline');
        if (taglineEl && config.tagline) {
            taglineEl.textContent = config.tagline;
        }

        // Update about section
        const aboutText = document.querySelector('.about-text');
        if (aboutText && config.about) {
            // Split by double newlines to create paragraphs
            const paragraphs = config.about.split('\n\n').map(p => `<p>${p}</p>`).join('');
            aboutText.innerHTML = paragraphs;
        }

        // Update background highlights (empty fields are left out)
        if (config.professionalBackground) {
            const bg = config.professionalBackground;
            const highlights = document.querySelector('.about-highlights');
            const highlightsList = document.querySelector('.about-highlights ul');
            if (highlightsList) {
                const rows = [
                    ['Current', bg.current],
                    ['Education', bg.education],
                    ['Specialties', bg.specialties]
                ].filter(([, value]) => value && String(value).trim());

                highlightsList.innerHTML = rows
                    .map(([label, value]) => `<li><strong>${label}:</strong> ${value}</li>`)
                    .join('');
                if (highlights) highlights.style.display = rows.length ? '' : 'none';
            }
        }

        // Update contact info (empty fields are left out)
        if (config.contact) {
            const contactInfo = document.querySelector('.contact-info');
            if (contactInfo) {
                const c = config.contact;
                const rows = [];
                if (c.email) rows.push(`<p><strong>Email:</strong> <a href="mailto:${c.email}">${c.email}</a></p>`);
                if (c.phone) rows.push(`<p><strong>Phone:</strong> ${c.phone}</p>`);
                if (c.location) rows.push(`<p><strong>Location:</strong> ${c.location}</p>`);
                contactInfo.innerHTML = rows.join('');
            }
        }

    } catch (error) {
        console.error('Error loading home page content:', error);
    }
}

// Load content when page loads
document.addEventListener('DOMContentLoaded', loadHomeContent);

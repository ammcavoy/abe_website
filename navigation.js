// Dynamic navigation system
let tabsConfig = null;
let currentTab = null;
let currentSubtype = null;

// Load tabs configuration
async function loadTabsConfig() {
    try {
        const response = await fetch('tabs-config.json');
        tabsConfig = await response.json();
        return tabsConfig;
    } catch (error) {
        console.error('Error loading tabs config:', error);
        return null;
    }
}

// Determine current page/tab
function getCurrentPage() {
    const path = window.location.pathname;
    const page = path.split('/').pop().replace('.html', '');

    if (page === '' || page === 'index') {
        return 'home';
    }

    // If we're on content.html, get tab from URL parameter
    if (page === 'content') {
        const params = new URLSearchParams(window.location.search);
        return params.get('tab') || 'content';
    }

    return page;
}

// Get current subtype from URL
function getCurrentSubtype() {
    const params = new URLSearchParams(window.location.search);
    return params.get('subtype');
}

// Apply the site name from site-config.json to the brand and footer
async function applySiteName() {
    try {
        const response = await fetch('site-config.json');
        if (!response.ok) return;
        const site = await response.json();
        if (!site.siteName) return;
        document.querySelectorAll('.nav-brand, .footer-name').forEach(el => {
            el.textContent = site.siteName;
        });
    } catch (error) {
        console.warn('site-config.json not loaded:', error);
    }
}

// Initialize navigation
async function initNavigation() {
    applySiteName();
    const config = await loadTabsConfig();
    if (!config) return;

    const page = getCurrentPage();
    currentSubtype = getCurrentSubtype();

    // Find current tab
    currentTab = config.tabs.find(tab => tab.id === page);

    // Render navigation
    renderNavigation(config, page);

    // If on a tab page with subtypes, render subtype navigation
    if (currentTab && currentTab.subtypes && currentTab.subtypes.length > 0) {
        renderSubtypeNavigation(currentTab, currentSubtype);
    }

    // Load header text if on a tab page
    if (currentTab && currentTab.headerText) {
        loadHeaderText(currentTab.headerText);
    }
}

// Load header text for the page
function loadHeaderText(headerText) {
    const headerElement = document.getElementById('page-header-text');
    if (headerElement && headerText) {
        headerElement.textContent = headerText;
    }
}

// Render main navigation
function renderNavigation(config, currentPage) {
    const navMenu = document.querySelector('.nav-menu');
    if (!navMenu) return;

    // Clear existing items
    navMenu.innerHTML = '';

    // Add Home link
    const homeLi = document.createElement('li');
    const homeLink = document.createElement('a');
    homeLink.href = 'index.html#home';
    homeLink.textContent = 'Home';
    if (currentPage === 'home') {
        homeLink.classList.add('active');
    }
    homeLi.appendChild(homeLink);
    navMenu.appendChild(homeLi);

    // Add tab links. Tabs that share a `group` are collected under one
    // dropdown (e.g. "Portfolio" → Techno / Sailing / Portrait), in the
    // position of the first tab in that group.
    const folders = new Map();
    config.tabs.forEach(tab => {
        if (!tab.enabled) return;

        const link = document.createElement('a');
        link.href = `content.html?tab=${tab.id}`;
        link.textContent = tab.label;
        if (currentPage === tab.id) {
            link.classList.add('active');
        }

        const group = (tab.group || '').trim();
        if (!group) {
            const li = document.createElement('li');
            li.appendChild(link);
            navMenu.appendChild(li);
            return;
        }

        let folder = folders.get(group);
        if (!folder) {
            folder = createNavFolder(group);
            folders.set(group, folder);
            navMenu.appendChild(folder.li);
        }
        const itemLi = document.createElement('li');
        itemLi.appendChild(link);
        folder.list.appendChild(itemLi);
        if (currentPage === tab.id) {
            folder.title.classList.add('active');
        }
    });

    // Add Contact link
    const contactLi = document.createElement('li');
    const contactLink = document.createElement('a');
    contactLink.href = 'index.html#contact';
    contactLink.textContent = 'Contact';
    contactLi.appendChild(contactLink);
    navMenu.appendChild(contactLi);

    setupNavToggle();
}

// Build a dropdown folder for a nav group. Opens on hover (desktop) and on
// click/tap, and closes when focus or the pointer leaves it.
function createNavFolder(label) {
    const li = document.createElement('li');
    li.className = 'nav-folder';

    const title = document.createElement('button');
    title.type = 'button';
    title.className = 'nav-folder-title';
    title.setAttribute('aria-haspopup', 'true');
    title.setAttribute('aria-expanded', 'false');
    title.innerHTML = `<span>${label}</span><span class="nav-folder-caret" aria-hidden="true"></span>`;

    const list = document.createElement('ul');
    list.className = 'nav-folder-content';

    const setOpen = open => {
        li.classList.toggle('open', open);
        title.setAttribute('aria-expanded', String(open));
    };

    title.addEventListener('click', e => {
        e.stopPropagation();
        const open = !li.classList.contains('open');
        document.querySelectorAll('.nav-folder.open').forEach(f => {
            if (f !== li) f.classList.remove('open');
        });
        setOpen(open);
    });
    li.addEventListener('mouseenter', () => { if (window.matchMedia('(hover: hover)').matches) setOpen(true); });
    li.addEventListener('mouseleave', () => { if (window.matchMedia('(hover: hover)').matches) setOpen(false); });
    li.addEventListener('focusout', e => { if (!li.contains(e.relatedTarget)) setOpen(false); });
    document.addEventListener('click', e => { if (!li.contains(e.target)) setOpen(false); });

    li.appendChild(title);
    li.appendChild(list);
    return { li, title, list };
}

// Mobile menu button (present in the HTML as .nav-toggle)
function setupNavToggle() {
    const toggle = document.querySelector('.nav-toggle');
    const navbar = document.querySelector('.navbar');
    if (!toggle || !navbar || toggle.dataset.bound) return;
    toggle.dataset.bound = 'true';

    toggle.addEventListener('click', () => {
        const open = navbar.classList.toggle('menu-open');
        toggle.setAttribute('aria-expanded', String(open));
        toggle.textContent = open ? 'Close Menu' : 'Menu';
    });
}

// Render subtype navigation (appears below main nav)
function renderSubtypeNavigation(tab, activeSubtype) {
    // Check if subtype nav already exists
    let subtypeNav = document.getElementById('subtype-navigation');

    if (!subtypeNav) {
        // Create subtype navigation container
        subtypeNav = document.createElement('div');
        subtypeNav.id = 'subtype-navigation';
        subtypeNav.className = 'subtype-nav';

        // Insert after navbar
        const navbar = document.querySelector('.navbar');
        navbar.parentNode.insertBefore(subtypeNav, navbar.nextSibling);
    }

    // Clear and populate
    subtypeNav.innerHTML = '';

    const container = document.createElement('div');
    container.className = 'container';

    const subtypeList = document.createElement('ul');
    subtypeList.className = 'subtype-list';

    // Add "All" option
    const allLi = document.createElement('li');
    const allLink = document.createElement('a');
    allLink.href = `content.html?tab=${tab.id}`;
    allLink.textContent = 'All';
    if (!activeSubtype) {
        allLink.classList.add('active');
    }
    allLi.appendChild(allLink);
    subtypeList.appendChild(allLi);

    // Add subtype links
    tab.subtypes.forEach(subtype => {
        const li = document.createElement('li');
        const a = document.createElement('a');
        a.href = `content.html?tab=${tab.id}&subtype=${subtype.id}`;
        a.innerHTML = `${subtype.icon || ''} ${subtype.label}`;

        if (activeSubtype === subtype.id) {
            a.classList.add('active');
        }

        li.appendChild(a);
        subtypeList.appendChild(li);
    });

    container.appendChild(subtypeList);
    subtypeNav.appendChild(container);
}

// Export current filter state for use by page scripts
function getActiveFilter() {
    return {
        tab: currentTab,
        subtype: currentSubtype
    };
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', initNavigation);

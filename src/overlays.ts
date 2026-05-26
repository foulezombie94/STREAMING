import { getCurrentType } from './globals';

let projectPageCache: string | null = null;

export async function openProjectOverlay() {
    const overlay = document.getElementById('project-overlay');
    if (!overlay) return;

    // Affiche l'overlay
    overlay.style.display = 'block';
    overlay.offsetHeight; // Force reflow
    overlay.style.opacity = '1';
    document.body.style.overflow = 'hidden'; // Bloque le défilement de la page arrière

    // Change l'URL de l'historique sans recharger la page
    history.pushState({ page: 'project' }, '', '/project');

    // Charge le contenu depuis le cache, ou le télécharge si c'est la première fois
    if (projectPageCache) {
        overlay.innerHTML = projectPageCache;
        setupProjectOverlayEvents(overlay);
    } else {
        overlay.innerHTML = `
            <div style="display: flex; align-items: center; justify-content: center; height: 100vh; flex-direction: column; gap: 20px; color: #fff; font-family: sans-serif;">
                <div style="width: 48px; height: 48px; border: 4px solid #ef4444; border-top-color: transparent; border-radius: 50%; animation: spin 1s linear infinite;"></div>
                <p style="color: #a0a0a0; font-size: 14px; text-transform: uppercase; letter-spacing: 2px;">Chargement du projet...</p>
            </div>
        `;
        try {
            const response = await fetch('/project.html');
            if (!response.ok) throw new Error('Failed to load project page');
            const html = await response.text();
            
            // Extrait les styles du <head> et le contenu du <body> pour conserver toute la mise en page
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');
            const styles = Array.from(doc.head.querySelectorAll('style, link[rel="stylesheet"]'))
                .map(el => {
                    if (el.tagName.toLowerCase() === 'style') {
                        let css = el.innerHTML;
                        // Remplace le sélecteur body pour le cibler dans l'overlay et ne pas polluer l'index
                        css = css.replace(/\bbody\b/g, '#project-overlay');
                        return `<style>${css}</style>`;
                    }
                    return el.outerHTML;
                })
                .join('\n');
            const bodyContent = styles + doc.body.innerHTML;
            
            projectPageCache = bodyContent;
            overlay.innerHTML = bodyContent;
            setupProjectOverlayEvents(overlay);
        } catch (err) {
            console.error("Impossible de charger le projet:", err);
            overlay.innerHTML = `
                <div style="display: flex; align-items: center; justify-content: center; height: 100vh; flex-direction: column; gap: 20px; color: #fff; font-family: sans-serif;">
                    <p>Erreur lors du chargement de la page projet.</p>
                    <button onclick="window.closeProjectOverlay()" style="background: #ef4444; color: #fff; border: none; padding: 10px 20px; border-radius: 8px; cursor: pointer; font-weight: bold;">Retour</button>
                </div>
            `;
        }
    }
}

function setupProjectOverlayEvents(overlay: HTMLElement) {
    // Écouteur pour fermer l'overlay quand on clique sur "Retour"
    const backButtons = overlay.querySelectorAll('.back-home');
    backButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            closeProjectOverlay();
        });
    });

    // Gestion de l'indicateur de progression (les 5 points)
    const dots = overlay.querySelectorAll('.progress-indicator .dot');
    const items = overlay.querySelectorAll('.timeline-item');

    if (dots.length > 0 && items.length > 0) {
        // 1. Clic sur un point pour défiler vers l'étape correspondante
        dots.forEach((dot, index) => {
            dot.addEventListener('click', () => {
                const targetItem = items[index];
                if (targetItem) {
                    targetItem.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
            });
        });

        // 2. IntersectionObserver pour changer automatiquement le point actif lors du défilement (ScrollSpy)
        const observerOptions = {
            root: overlay, // Défilement de l'overlay lui-même
            rootMargin: '-30% 0px -50% 0px', // Zone centrale de détection
            threshold: 0.1
        };

        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const index = Array.from(items).indexOf(entry.target);
                    if (index !== -1) {
                        dots.forEach((dot, dotIdx) => {
                            if (dotIdx === index) {
                                dot.classList.add('active');
                            } else {
                                dot.classList.remove('active');
                            }
                        });
                    }
                }
            });
        }, observerOptions);

        items.forEach(item => observer.observe(item));
    }
}

function restoreMainPageUrl() {
    let path = '/';
    if (getCurrentType() === 'movie') path = '/movie';
    else if (getCurrentType() === 'tv') path = '/tv';
    else if (getCurrentType() === 'iptv') path = '/iptv';
    else if (getCurrentType() === 'reprendre') path = '/reprendre';
    else if (getCurrentType() === 'sagas') path = '/sagas';

    history.pushState({ page: getCurrentType() }, '', path);
}

function closeProjectOverlay() {
    const overlay = document.getElementById('project-overlay');
    if (!overlay) return;

    overlay.style.opacity = '0';
    setTimeout(() => {
        overlay.style.display = 'none';
        document.body.style.overflow = ''; // Rétablit le défilement
    }, 300);

    restoreMainPageUrl();
}

// Exposer globalement pour le bouton d'erreur
(window as any).closeProjectOverlay = closeProjectOverlay;

// Cache global pour le contenu HTML de contact.html
let contactPageCache: string | null = null;

export async function openContactOverlay() {
    const overlay = document.getElementById('contact-overlay');
    if (!overlay) return;

    // Affiche l'overlay
    overlay.style.display = 'block';
    overlay.offsetHeight; // Force reflow
    overlay.style.opacity = '1';
    document.body.style.overflow = 'hidden';

    // Change l'URL de l'historique sans recharger la page
    history.pushState({ page: 'contact' }, '', '/contact');

    if (contactPageCache) {
        overlay.innerHTML = contactPageCache;
        setupContactOverlayEvents(overlay);
    } else {
        overlay.innerHTML = `
            <div style="display: flex; align-items: center; justify-content: center; height: 100vh; flex-direction: column; gap: 20px; color: #fff; font-family: sans-serif;">
                <div style="width: 48px; height: 48px; border: 4px solid #ef4444; border-top-color: transparent; border-radius: 50%; animation: spin 1s linear infinite;"></div>
                <p style="color: #a0a0a0; font-size: 14px; text-transform: uppercase; letter-spacing: 2px;">Chargement du contact...</p>
            </div>
        `;
        try {
            const response = await fetch('/contact.html');
            if (!response.ok) throw new Error('Failed to load contact page');
            const html = await response.text();

            // Extrait les styles du <head> et le contenu du <body> pour conserver la mise en page
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');
            const styles = Array.from(doc.head.querySelectorAll('style, link[rel="stylesheet"]'))
                .map(el => {
                    if (el.tagName.toLowerCase() === 'style') {
                        let css = el.innerHTML;
                        // Remplace le sélecteur body pour le cibler dans l'overlay et ne pas polluer l'index
                        css = css.replace(/\bbody\b/g, '#contact-overlay');
                        return `<style>${css}</style>`;
                    }
                    return el.outerHTML;
                })
                .join('\n');
            const bodyContent = styles + doc.body.innerHTML;

            contactPageCache = bodyContent;
            overlay.innerHTML = bodyContent;
            setupContactOverlayEvents(overlay);
        } catch (err) {
            console.error("Impossible de charger le contact:", err);
            overlay.innerHTML = `
                <div style="display: flex; align-items: center; justify-content: center; height: 100vh; flex-direction: column; gap: 20px; color: #fff; font-family: sans-serif;">
                    <p>Erreur lors du chargement de la page contact.</p>
                    <button onclick="window.closeContactOverlay()" style="background: #ef4444; color: #fff; border: none; padding: 10px 20px; border-radius: 8px; cursor: pointer; font-weight: bold;">Retour</button>
                </div>
            `;
        }
    }
}

function setupContactOverlayEvents(overlay: HTMLElement) {
    const backButtons = overlay.querySelectorAll('.back-home');
    backButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            closeContactOverlay();
        });
    });
}

function closeContactOverlay() {
    const overlay = document.getElementById('contact-overlay');
    if (!overlay) return;

    overlay.style.opacity = '0';
    setTimeout(() => {
        overlay.style.display = 'none';
        document.body.style.overflow = '';
    }, 300);

    restoreMainPageUrl();
}

(window as any).closeContactOverlay = closeContactOverlay;

// Cache global pour le contenu HTML de cgu.html
let cguPageCache: string | null = null;

export async function openCguOverlay() {
    const overlay = document.getElementById('cgu-overlay');
    if (!overlay) return;

    // Affiche l'overlay
    overlay.style.display = 'block';
    overlay.offsetHeight; // Force reflow
    overlay.style.opacity = '1';
    document.body.style.overflow = 'hidden';

    // Change l'URL de l'historique sans recharger la page
    history.pushState({ page: 'cgu' }, '', '/cgu');

    if (cguPageCache) {
        overlay.innerHTML = cguPageCache;
        setupCguOverlayEvents(overlay);
    } else {
        overlay.innerHTML = `
            <div style="display: flex; align-items: center; justify-content: center; height: 100vh; flex-direction: column; gap: 20px; color: #fff; font-family: sans-serif;">
                <div style="width: 48px; height: 48px; border: 4px solid #ff003c; border-top-color: transparent; border-radius: 50%; animation: spin 1s linear infinite;"></div>
                <p style="color: #a39ca0; font-size: 14px; text-transform: uppercase; letter-spacing: 2px;">Chargement des CGU...</p>
            </div>
        `;
        try {
            const response = await fetch('/cgu.html');
            if (!response.ok) throw new Error('Failed to load CGU page');
            const html = await response.text();

            // Extrait les styles du <head> et le contenu du <body> pour conserver la mise en page
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');
            const styles = Array.from(doc.head.querySelectorAll('style, link[rel="stylesheet"]'))
                .map(el => {
                    if (el.tagName.toLowerCase() === 'style') {
                        let css = el.innerHTML;
                        // Remplace le sélecteur body pour le cibler dans l'overlay et ne pas polluer l'index
                        css = css.replace(/\bbody\b/g, '#cgu-overlay');
                        return `<style>${css}</style>`;
                    }
                    return el.outerHTML;
                })
                .join('\n');
            const bodyContent = styles + doc.body.innerHTML;

            cguPageCache = bodyContent;
            overlay.innerHTML = bodyContent;
            setupCguOverlayEvents(overlay);
        } catch (err) {
            console.error("Impossible de charger les CGU:", err);
            overlay.innerHTML = `
                <div style="display: flex; align-items: center; justify-content: center; height: 100vh; flex-direction: column; gap: 20px; color: #fff; font-family: sans-serif;">
                    <p>Erreur lors du chargement des CGU.</p>
                    <button onclick="window.closeCguOverlay()" style="background: #ff003c; color: #fff; border: none; padding: 10px 20px; border-radius: 8px; cursor: pointer; font-weight: bold;">Retour</button>
                </div>
            `;
        }
    }
}

function setupCguOverlayEvents(overlay: HTMLElement) {
    const backButtons = overlay.querySelectorAll('.back-home');
    backButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            closeCguOverlay();
        });
    });

    // --- Back to Top ---
    const backToTopBtn = overlay.querySelector('#backToTop') as HTMLElement | null;
    if (backToTopBtn) {
        let isBackToTopVisible = false;
        overlay.addEventListener('scroll', () => {
            const shouldShow = overlay.scrollTop > 300;
            if (shouldShow !== isBackToTopVisible) {
                isBackToTopVisible = shouldShow;
                backToTopBtn.style.display = isBackToTopVisible ? 'block' : 'none';
            }
        }, { passive: true });
        backToTopBtn.addEventListener('click', () => {
            overlay.scrollTo({ top: 0, behavior: 'smooth' });
        });
    }

    // --- ScrollSpy avec IntersectionObserver ---
    const sections = overlay.querySelectorAll('section[id]');
    const navLinks = overlay.querySelectorAll('.cgu-nav a');

    if (sections.length > 0 && navLinks.length > 0) {
        // Clic sur un lien de navigation pour défiler de manière fluide
        navLinks.forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const targetId = link.getAttribute('href')?.substring(1);
                const targetSection = overlay.querySelector(`#${targetId}`);
                if (targetSection) {
                    targetSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
            });
        });

        const observerOptions = {
            root: overlay,
            rootMargin: '-30% 0px -50% 0px',
            threshold: 0.1
        };

        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const currentSectionId = entry.target.getAttribute('id');
                    navLinks.forEach(link => {
                        link.classList.remove('active');
                        if (link.getAttribute('href') === `#${currentSectionId}`) {
                            link.classList.add('active');
                        }
                    });
                }
            });
        }, observerOptions);

        sections.forEach(section => observer.observe(section));
    }
}

function closeCguOverlay() {
    const overlay = document.getElementById('cgu-overlay');
    if (!overlay) return;

    overlay.style.opacity = '0';
    setTimeout(() => {
        overlay.style.display = 'none';
        document.body.style.overflow = ''; // Rétablit le défilement
    }, 300);

    restoreMainPageUrl();
}

(window as any).closeCguOverlay = closeCguOverlay;

// Cache global pour le contenu HTML de privacy.html
let privacyPageCache: string | null = null;

export async function openPrivacyOverlay() {
    const overlay = document.getElementById('privacy-overlay');
    if (!overlay) return;

    // Affiche l'overlay
    overlay.style.display = 'block';
    overlay.offsetHeight; // Force reflow
    overlay.style.opacity = '1';
    document.body.style.overflow = 'hidden';

    // Change l'URL de l'historique sans recharger la page
    history.pushState({ page: 'privacy' }, '', '/privacy');

    if (privacyPageCache) {
        overlay.innerHTML = privacyPageCache;
        setupPrivacyOverlayEvents(overlay);
    } else {
        overlay.innerHTML = `
            <div style="display: flex; align-items: center; justify-content: center; height: 100vh; flex-direction: column; gap: 20px; color: #fff; font-family: sans-serif;">
                <div style="width: 48px; height: 48px; border: 4px solid #ff003c; border-top-color: transparent; border-radius: 50%; animation: spin 1s linear infinite;"></div>
                <p style="color: #a39ca0; font-size: 14px; text-transform: uppercase; letter-spacing: 2px;">Chargement...</p>
            </div>
        `;
        try {
            const response = await fetch('/privacy.html');
            if (!response.ok) throw new Error('Failed to load Privacy page');
            const html = await response.text();

            // Extrait les styles du <head> et le contenu du <body> pour conserver la mise en page
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');
            const styles = Array.from(doc.head.querySelectorAll('style, link[rel="stylesheet"]'))
                .map(el => {
                    if (el.tagName.toLowerCase() === 'style') {
                        let css = el.innerHTML;
                        // Remplace le sélecteur body pour le cibler dans l'overlay et ne pas polluer l'index
                        css = css.replace(/\bbody\b/g, '#privacy-overlay');
                        return `<style>${css}</style>`;
                    }
                    return el.outerHTML;
                })
                .join('\n');
            const bodyContent = styles + doc.body.innerHTML;

            privacyPageCache = bodyContent;
            overlay.innerHTML = bodyContent;
            setupPrivacyOverlayEvents(overlay);
        } catch (err) {
            console.error("Impossible de charger la page de confidentialité:", err);
            overlay.innerHTML = `
                <div style="display: flex; align-items: center; justify-content: center; height: 100vh; flex-direction: column; gap: 20px; color: #fff; font-family: sans-serif;">
                    <p>Erreur lors du chargement de la page.</p>
                    <button onclick="window.closePrivacyOverlay()" style="background: #ff003c; color: #fff; border: none; padding: 10px 20px; border-radius: 8px; cursor: pointer; font-weight: bold;">Retour</button>
                </div>
            `;
        }
    }
}

function setupPrivacyOverlayEvents(overlay: HTMLElement) {
    const backButtons = overlay.querySelectorAll('.back-home');
    backButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            closePrivacyOverlay();
        });
    });

    // --- Back to Top ---
    const backToTopBtn = overlay.querySelector('#backToTop') as HTMLElement | null;
    if (backToTopBtn) {
        let isBackToTopVisible = false;
        overlay.addEventListener('scroll', () => {
            const shouldShow = overlay.scrollTop > 300;
            if (shouldShow !== isBackToTopVisible) {
                isBackToTopVisible = shouldShow;
                backToTopBtn.style.display = isBackToTopVisible ? 'block' : 'none';
            }
        }, { passive: true });
        backToTopBtn.addEventListener('click', () => {
            overlay.scrollTo({ top: 0, behavior: 'smooth' });
        });
    }

    // --- ScrollSpy avec IntersectionObserver ---
    const sections = overlay.querySelectorAll('section[id]');
    const navLinks = overlay.querySelectorAll('.privacy-nav a');

    if (sections.length > 0 && navLinks.length > 0) {
        // Clic sur un lien de navigation pour défiler de manière fluide
        navLinks.forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const targetId = link.getAttribute('href')?.substring(1);
                const targetSection = overlay.querySelector(`#${targetId}`);
                if (targetSection) {
                    targetSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
            });
        });

        const observerOptions = {
            root: overlay,
            rootMargin: '-30% 0px -50% 0px',
            threshold: 0.1
        };

        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const currentSectionId = entry.target.getAttribute('id');
                    navLinks.forEach(link => {
                        link.classList.remove('active');
                        if (link.getAttribute('href') === `#${currentSectionId}`) {
                            link.classList.add('active');
                        }
                    });
                }
            });
        }, observerOptions);

        sections.forEach(section => observer.observe(section));
    }
}

function closePrivacyOverlay() {
    const overlay = document.getElementById('privacy-overlay');
    if (!overlay) return;

    overlay.style.opacity = '0';
    setTimeout(() => {
        overlay.style.display = 'none';
        document.body.style.overflow = ''; // Rétablit le défilement
    }, 300);

    restoreMainPageUrl();
}

(window as any).closePrivacyOverlay = closePrivacyOverlay;

// Cache global pour le contenu HTML de dmca.html
let dmcaPageCache: string | null = null;

export async function openDmcaOverlay() {
    const overlay = document.getElementById('dmca-overlay');
    if (!overlay) return;

    // Affiche l'overlay
    overlay.style.display = 'block';
    overlay.offsetHeight; // Force reflow
    overlay.style.opacity = '1';
    document.body.style.overflow = 'hidden';

    // Change l'URL de l'historique sans recharger la page
    history.pushState({ page: 'dmca' }, '', '/dmca');

    if (dmcaPageCache) {
        overlay.innerHTML = dmcaPageCache;
        setupDmcaOverlayEvents(overlay);
    } else {
        overlay.innerHTML = `
            <div style="display: flex; align-items: center; justify-content: center; height: 100vh; flex-direction: column; gap: 20px; color: #fff; font-family: sans-serif;">
                <div style="width: 48px; height: 48px; border: 4px solid #ff003c; border-top-color: transparent; border-radius: 50%; animation: spin 1s linear infinite;"></div>
                <p style="color: #a39ca0; font-size: 14px; text-transform: uppercase; letter-spacing: 2px;">Chargement...</p>
            </div>
        `;
        try {
            const response = await fetch('/dmca.html');
            if (!response.ok) throw new Error('Failed to load DMCA page');
            const html = await response.text();

            // Extrait les styles du <head> et le contenu du <body> pour conserver la mise en page
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');
            const styles = Array.from(doc.head.querySelectorAll('style, link[rel="stylesheet"]'))
                .map(el => {
                    if (el.tagName.toLowerCase() === 'style') {
                        let css = el.innerHTML;
                        // Remplace le sélecteur body pour le cibler dans l'overlay et ne pas polluer l'index
                        css = css.replace(/\bbody\b/g, '#dmca-overlay');
                        return `<style>${css}</style>`;
                    }
                    return el.outerHTML;
                })
                .join('\n');
            const bodyContent = styles + doc.body.innerHTML;

            dmcaPageCache = bodyContent;
            overlay.innerHTML = bodyContent;
            setupDmcaOverlayEvents(overlay);
        } catch (err) {
            console.error("Impossible de charger la page DMCA:", err);
            overlay.innerHTML = `
                <div style="display: flex; align-items: center; justify-content: center; height: 100vh; flex-direction: column; gap: 20px; color: #fff; font-family: sans-serif;">
                    <p>Erreur lors du chargement de la page.</p>
                    <button onclick="window.closeDmcaOverlay()" style="background: #ff003c; color: #fff; border: none; padding: 10px 20px; border-radius: 8px; cursor: pointer; font-weight: bold;">Retour</button>
                </div>
            `;
        }
    }
}

function setupDmcaOverlayEvents(overlay: HTMLElement) {
    const backButtons = overlay.querySelectorAll('.back-home');
    backButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            closeDmcaOverlay();
        });
    });

    // --- Back to Top ---
    const backToTopBtn = overlay.querySelector('#backToTop') as HTMLElement | null;
    if (backToTopBtn) {
        let isBackToTopVisible = false;
        overlay.addEventListener('scroll', () => {
            const shouldShow = overlay.scrollTop > 300;
            if (shouldShow !== isBackToTopVisible) {
                isBackToTopVisible = shouldShow;
                backToTopBtn.style.display = isBackToTopVisible ? 'block' : 'none';
            }
        }, { passive: true });
        backToTopBtn.addEventListener('click', () => {
            overlay.scrollTo({ top: 0, behavior: 'smooth' });
        });
    }

    // --- ScrollSpy avec IntersectionObserver ---
    const sections = overlay.querySelectorAll('section[id]');
    const navLinks = overlay.querySelectorAll('.dmca-nav a');

    if (sections.length > 0 && navLinks.length > 0) {
        // Clic sur un lien de navigation pour défiler de manière fluide
        navLinks.forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const targetId = link.getAttribute('href')?.substring(1);
                const targetSection = overlay.querySelector(`#${targetId}`);
                if (targetSection) {
                    targetSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
            });
        });

        const observerOptions = {
            root: overlay,
            rootMargin: '-30% 0px -50% 0px',
            threshold: 0.1
        };

        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const currentSectionId = entry.target.getAttribute('id');
                    navLinks.forEach(link => {
                        link.classList.remove('active');
                        if (link.getAttribute('href') === `#${currentSectionId}`) {
                            link.classList.add('active');
                        }
                    });
                }
            });
        }, observerOptions);

        sections.forEach(section => observer.observe(section));
    }
}

function closeDmcaOverlay() {
    const overlay = document.getElementById('dmca-overlay');
    if (!overlay) return;

    overlay.style.opacity = '0';
    setTimeout(() => {
        overlay.style.display = 'none';
        document.body.style.overflow = ''; // Rétablit le défilement
    }, 300);

    restoreMainPageUrl();
}

(window as any).closeDmcaOverlay = closeDmcaOverlay;

// Intercepte les clics sur les liens du projet, de contact, des CGU, de confidentialité et du DMCA
document.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    
    const projectLink = target.closest('a[href="/project.html"]');
    if (projectLink) {
        e.preventDefault();
        openProjectOverlay();
        return;
    }

    const contactLink = target.closest('a[href="/contact.html"]');
    if (contactLink) {
        e.preventDefault();
        openContactOverlay();
        return;
    }

    const cguLink = target.closest('a[href="/cgu.html"]');
    if (cguLink) {
        e.preventDefault();
        openCguOverlay();
        return;
    }

    const privacyLink = target.closest('a[href="/privacy.html"]');
    if (privacyLink) {
        e.preventDefault();
        openPrivacyOverlay();
        return;
    }

    const dmcaLink = target.closest('a[href="/dmca.html"]');
    if (dmcaLink) {
        e.preventDefault();
        openDmcaOverlay();
    }
});

// Écoute le bouton retour/suivant du navigateur
window.addEventListener('popstate', (e) => {
    if (e.state) {
        if (e.state.page === 'project') {
            openProjectOverlay();
            closeContactOverlay();
            closeCguOverlay();
            closePrivacyOverlay();
            closeDmcaOverlay();
        } else if (e.state.page === 'contact') {
            openContactOverlay();
            closeProjectOverlay();
            closeCguOverlay();
            closePrivacyOverlay();
            closeDmcaOverlay();
        } else if (e.state.page === 'cgu') {
            openCguOverlay();
            closeProjectOverlay();
            closeContactOverlay();
            closePrivacyOverlay();
            closeDmcaOverlay();
        } else if (e.state.page === 'privacy') {
            openPrivacyOverlay();
            closeProjectOverlay();
            closeContactOverlay();
            closeCguOverlay();
            closeDmcaOverlay();
        } else if (e.state.page === 'dmca') {
            openDmcaOverlay();
            closeProjectOverlay();
            closeContactOverlay();
            closeCguOverlay();
            closePrivacyOverlay();
        } else if (['trending', 'movie', 'tv', 'iptv', 'reprendre', 'sagas'].includes(e.state.page)) {
            closeProjectOverlay();
            closeContactOverlay();
            closeCguOverlay();
            closePrivacyOverlay();
            closeDmcaOverlay();
            if (getCurrentType() !== e.state.page) {
                (window as any).handleNavigation(e.state.page, true);
            }
        } else {
            closeProjectOverlay();
            closeContactOverlay();
            closeCguOverlay();
            closePrivacyOverlay();
            closeDmcaOverlay();
        }
    } else {
        closeProjectOverlay();
        closeContactOverlay();
        closeCguOverlay();
        closePrivacyOverlay();
        closeDmcaOverlay();

        // Rétablir la page principale correspondante au pathname actuel
        let type = 'trending';
        const path = window.location.pathname;
        if (path === '/movie') type = 'movie';
        else if (path === '/tv') type = 'tv';
        else if (path === '/iptv') type = 'iptv';
        else if (path === '/reprendre') type = 'reprendre';
        else if (path === '/sagas') type = 'sagas';

        if (getCurrentType() !== type) {
            (window as any).handleNavigation(type, true);
        }
    }
});



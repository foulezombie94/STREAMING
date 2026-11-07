import './style.css';
import './theme.css';
import { renderMediaCard } from './media-card';
import { openTitle } from './title-dialog';
import { initProfiles, openProfiles } from './profiles';
import { escapeHtml, icon } from './ui';
import { ProgressManager, FavoritesManager } from './storage';
import { TMDBMedia, TMDBGenre, SectionConfig } from './types';

// Import our new split modules
import {
    TMDB_API_KEY,
    BASE_URL,
    IMAGE_W500_URL,
    GLOBAL_BLACKLIST_IDS,
    GENRE_ICONS,
    isMobileViewport,
    fetchWithCache,
    showToast,
    SECTIONS_CONFIG,
    MOVIE_GENRES,
    TV_GENRES
} from './globals';

import { HeroCarouselManager } from './carousel';

// iptv.ts est chargé dynamiquement uniquement quand l'utilisateur navigue vers "TV Direct"
// Cela crée un chunk JS séparé et économise ~30 Kio au démarrage
let iptvModule: typeof import('./iptv') | null = null;
async function getIPTVModule() {
    if (!iptvModule) {
        iptvModule = await import('./iptv');
    }
    return iptvModule;
}
// sagas.ts : chunk séparé — chargé uniquement quand l'utilisateur navigue vers Sagas
let sagasModule: typeof import('./sagas') | null = null;
async function getSagasModule() {
    if (!sagasModule) sagasModule = await import('./sagas');
    return sagasModule;
}

// overlays.ts : chunk séparé — chargé uniquement au 1er clic sur un lien footer
let overlaysModule: typeof import('./overlays') | null = null;
async function getOverlaysModule() {
    if (!overlaysModule) overlaysModule = await import('./overlays');
    return overlaysModule;
}

// Wrappers paresseux : exposent les fonctions globalement, charge le chunk au 1er appel
(window as any).openProjectOverlay = () => getOverlaysModule().then(m => m.openProjectOverlay());
(window as any).openContactOverlay = () => getOverlaysModule().then(m => m.openContactOverlay());
(window as any).openCguOverlay = () => getOverlaysModule().then(m => m.openCguOverlay());
(window as any).openPrivacyOverlay = () => getOverlaysModule().then(m => m.openPrivacyOverlay());
(window as any).openDmcaOverlay = () => getOverlaysModule().then(m => m.openDmcaOverlay());
(window as any).renderSagaDetailsPage = (id: string) => getSagasModule().then(m => m.renderSagaDetailsPage(id));
(window as any).removeFavoriteAndAnimate = (id: string, type: string, buttonEl: HTMLButtonElement) => {
    const card = buttonEl.closest('.movie-card');
    if (!card) return;
    FavoritesManager.toggleFavorite(id, type, {});
    card.classList.add('removing-card');
    setTimeout(() => {
        card.remove();
        const favorites = FavoritesManager.getAllFavorites();
        if (Object.keys(favorites).length === 0) {
            const container = document.getElementById('carousel-favorites');
            if (container) {
                container.innerHTML = '<div class="no-history" style="grid-column: span 4; text-align: center; color: rgba(255,255,255,0.4); padding: 40px;">Votre liste attend vos coups de cœur. Ajoutez un programme avec le bouton +.</div>';
            }
        }
    }, 400);
};

(window as any).toggleFavoriteFromCard = (id: string, type: string, button: HTMLButtonElement, event: Event) => {
    event.stopPropagation(); event.preventDefault();
    const card = button.closest<HTMLElement>('.movie-card');
    if (!card) return;
    let media: TMDBMedia;
    try { media = JSON.parse(card.dataset.media || '{}'); } catch { return; }
    const saved = FavoritesManager.toggleFavorite(id, type, media);
    document.querySelectorAll<HTMLElement>(`.movie-card[data-id="${id}"][data-type="${type}"] .card-fav-btn`).forEach(btn => {
        btn.innerHTML = icon(saved ? 'check' : 'plus');
        btn.classList.toggle('active', saved);
        btn.setAttribute('aria-pressed', String(saved));
        btn.setAttribute('aria-label', saved ? 'Retirer de ma liste' : 'Ajouter à ma liste');
    });
    if (currentType === 'favorites') renderFavoritesPage();
};

export let heroCarouselManager: HeroCarouselManager;

let navbar: HTMLElement | null = null;
let heroSection: HTMLElement | null = null;
let navItems: NodeListOf<Element> | null = null;
let searchTrigger: HTMLElement | null = null;
let searchOverlay: HTMLElement | null = null;
let closeSearch: HTMLElement | null = null;
let searchInput: HTMLInputElement | null = null;
let mainContent: HTMLElement | null = null;
let iptvSection: HTMLElement | null = null;
let genreFiltersContainer: HTMLElement | null = null;
let bottomNavItems: NodeListOf<Element> | null = null;

function initSelectors() {
    navbar = document.getElementById('navbar');
    heroSection = document.getElementById('hero-carousel');
    navItems = document.querySelectorAll('.nav-item');
    searchTrigger = document.getElementById('search-trigger');
    searchOverlay = document.getElementById('search-overlay');
    closeSearch = document.getElementById('close-search');
    searchInput = document.getElementById('search-input-premium') as HTMLInputElement | null;
    mainContent = document.getElementById('main-content');
    iptvSection = document.getElementById('iptv-section');
    genreFiltersContainer = document.getElementById('genre-filters-container');
    bottomNavItems = document.querySelectorAll('.bottom-nav-item');
}

let currentData: TMDBMedia[] = []; 
let currentType: 'movie' | 'tv' | 'trending' | 'reprendre' | 'iptv' | 'sagas' | 'favorites' | 'new' = 'trending';
let movieGenres: TMDBGenre[] = [];
let tvGenres: TMDBGenre[] = [];
let activeGenreId: number | null = null;
let searchTimeout: ReturnType<typeof setTimeout>;
const sectionDataStore: { [key: string]: { items: TMDBMedia[], conf: SectionConfig } } = {};

export const getCurrentType = () => currentType;
export const setCurrentType = (type: any) => { currentType = type; };

// 3. Navbar Glassmorphism
let isNavbarScrolled = false;
let scrollTicking = false;
window.addEventListener('scroll', () => {
    if (!scrollTicking) {
        window.requestAnimationFrame(() => {
            const shouldScroll = window.scrollY > 50 || currentType === 'iptv';
            if (shouldScroll !== isNavbarScrolled) {
                isNavbarScrolled = shouldScroll;
                if (isNavbarScrolled) {
                    navbar?.classList.add('scrolled');
                } else {
                    navbar?.classList.remove('scrolled');
                }
            }
            scrollTicking = false;
        });
        scrollTicking = true;
    }
}, { passive: true });

// Shortcut to focus search
window.addEventListener('keydown', (e) => {
    if (e.key === 's' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName || '') && !document.querySelector('dialog[open]')) {
        e.preventDefault();
        searchTrigger?.click();
    }
});

// Utilitaire pour basculer la visibilité de la recherche

export function toggleSearchVisibility(show: boolean) {
    const trigger = document.getElementById('search-trigger');
    if (trigger) {
        trigger.style.display = show ? 'flex' : 'none';
    }
}


// 4. Navigation Management


async function handleNavigation(type: any, isPopState = false) {
    // Direct TV non disponible sur mobile — afficher un toast explicatif (M-7)
    if (type === 'iptv' && isMobileViewport()) {
        showToast('📺 Direct TV est disponible uniquement sur desktop / tablette.');
        return;
    }

    // Mettre à jour l'historique et l'URL du navigateur si ce n'est pas un popstate
    if (!isPopState) {
        let path = '/';
        if (type === 'movie') path = '/movie';
        else if (type === 'tv') path = '/tv';
        else if (type === 'iptv') path = '/iptv';
        else if (type === 'reprendre') path = '/reprendre';
        else if (type === 'sagas') path = '/sagas';
        else if (type === 'favorites') path = '/favorites';
        else if (type === 'new') path = '/new';

        if (window.location.pathname !== path) {
            history.pushState({ page: type }, '', path);
        }
    }

    if (type === 'movie' || type === 'tv') {
        // Attendre que les genres soient chargés si on navigue sur Films ou Séries
        await ensureGenresLoaded();
    }

    // Sécurité: Si le hero va être affiché mais est vide, on le charge
    if (type !== 'iptv' && type !== 'reprendre' && type !== 'favorites' && heroCarouselManager.getSlidesCount() === 0) {
        if (type === 'sagas') {
            await heroCarouselManager.setSagaSlides();
        } else {
            const cacheKey = 'mv_trending_day_v3';
            const cached = localStorage.getItem(cacheKey);
            let hasRenderedFromCache = false;
            if (cached) {
                try {
                    const parsed = JSON.parse(cached);
                    // Cache valide pendant 4 heures
                    if (Date.now() - parsed.timestamp < 4 * 60 * 60 * 1000) {
                        heroCarouselManager.setSlides(parsed.data || []);
                        hasRenderedFromCache = true;
                    }
                } catch(e){}
            }

            fetchWithCache(`${BASE_URL}/trending/all/day?api_key=${TMDB_API_KEY}&language=fr-FR`)
                .then(data => {
                    let results = data.results || [];
                    results = results.filter((r: TMDBMedia) => r.backdrop_path && r.media_type !== 'person');
                    localStorage.setItem(cacheKey, JSON.stringify({
                        timestamp: Date.now(),
                        data: results
                    }));
                    if (!hasRenderedFromCache) {
                        heroCarouselManager.setSlides(results);
                    }
                });
        }
    }

    // Si on passe aux sagas, on met à jour le hero avec des sagas au hasard
    if (type === 'sagas') {
        await heroCarouselManager.setSagaSlides();
    }


    
    // Fermer le menu mobile si ouvert
    if (navbar?.classList.contains('menu-open')) {
        toggleMobileMenu();
    }

    [navItems, bottomNavItems].forEach(collection => {
        if (collection) {
            collection.forEach(i => {
                if (i.getAttribute('data-type') === type) i.classList.add('active');
                else i.classList.remove('active');
            });
        }
    });

    currentType = type as any;
    document.body.dataset.page = type;
    if (genreFiltersContainer) genreFiltersContainer.style.display = 'none';
    if (type === 'movie' || type === 'tv') {
        fetchWithCache(`${BASE_URL}/${type}/popular?api_key=${TMDB_API_KEY}&language=fr-FR`)
            .then(data => {
                if (currentType === type) heroCarouselManager.setSlides((data.results || []).map((item: TMDBMedia) => ({ ...item, media_type: type })));
            }).catch(() => showToast('La sélection à la une est momentanément indisponible.'));
    }
    activeGenreId = null; 

    if (currentType !== 'iptv') {
        // stopLiveTV uniquement si le module est déjà chargé (évite de charger le chunk pour rien)
        if (iptvModule) {
            iptvModule.stopLiveTV();
        }
        const liveContent = document.getElementById('live-tv-content');
        const loginForm = document.getElementById('xtream-login');
        if (liveContent) liveContent.style.display = 'none';
        if (loginForm) loginForm.style.display = 'none';
    }

    if (heroSection) {
        const isHidden = (currentType === 'iptv' || currentType === 'reprendre' || currentType === 'favorites' || currentType === 'new');
        heroSection.style.display = isHidden ? 'none' : 'block';
        if (!isHidden) {
            heroCarouselManager.refresh();
            heroCarouselManager.start();
        } else {
            heroCarouselManager.stop();
        }
    }

    if (mainContent) {
        mainContent.style.display = (currentType === 'iptv') ? 'none' : 'block';
        if (currentType === 'reprendre' || currentType === 'iptv' || currentType === 'favorites' || currentType === 'new') {
            mainContent.classList.add('no-hero');
        } else {
            mainContent.classList.remove('no-hero');
        }
    }
    if (iptvSection) iptvSection.style.display = (currentType === 'iptv') ? 'block' : 'none';

    if (currentType === 'iptv') {
        if (navbar) navbar.style.display = 'flex';
        if (genreFiltersContainer) genreFiltersContainer.style.display = 'none';
        toggleSearchVisibility(false);
        // Chargement dynamique du module IPTV (première fois uniquement)
        getIPTVModule().then(mod => mod.initLiveTV());
    } else {
        if (navbar) navbar.style.display = 'flex';
        // Afficher la recherche sauf pour les sagas
        toggleSearchVisibility(currentType !== 'sagas');
        
        if (currentType === 'reprendre') {
            renderResumePage();
        } else if (currentType === 'favorites') {
            renderFavoritesPage();
        } else if (currentType === 'sagas') {
            const sagasMod = await getSagasModule();
            await sagasMod.renderSagasPage();
        } else {
            renderGenres(currentType as any);
            await renderHomeSections(currentType as any);
        }
    }
    // Déferré dans la tâche suivante pour éliminer le Forced Synchronous Reflow
    setTimeout(() => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }, 0);
}
(window as any).handleNavigation = handleNavigation;


// 4b. Search Overlay Logic (Moved to setupEventListeners)

// Fermer avec Échap
window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && searchOverlay?.classList.contains('active')) {
        searchOverlay?.classList.remove('active');
    }
});


function renderResumePage() {
    if (!mainContent) return;
    mainContent.innerHTML = '';

    const history = ProgressManager.getHistory();

    // 1. Calculer le temps total de visionnage
    const totalSeconds = history.reduce((sum, item) => sum + (item.time || 0), 0);
    let formattedWatchTime = '0m';
    if (totalSeconds >= 3600) {
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.round((totalSeconds % 3600) / 60);
        formattedWatchTime = `${hours}h ${minutes}m`;
    } else if (totalSeconds >= 60) {
        formattedWatchTime = `${Math.round(totalSeconds / 60)}m`;
    } else if (totalSeconds > 0) {
        formattedWatchTime = `< 1m`;
    }

    // 2. Calculer le nombre de médias complétés (plus de 80% de visionnage)
    const completedCount = history.filter(item => {
        if (item.duration > 0) {
            return (item.time / item.duration) >= 0.8;
        }
        return false;
    }).length;

    // 3. Calculer les genres préférés (top 3)
    const genreCounts: { [key: string]: number } = {};
    let totalGenrePoints = 0;
    history.forEach(item => {
        const genres = item.genres || [];
        genres.forEach(g => {
            genreCounts[g] = (genreCounts[g] || 0) + 1;
            totalGenrePoints++;
        });
    });

    const sortedGenres = Object.entries(genreCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3);
        
    const favoriteGenreText = sortedGenres.length > 0 ? sortedGenres[0][0] : 'N/A';

    const section = document.createElement('section');
    section.className = 'popular';
    section.innerHTML = `
        <h2 class="section-title">
            <span class="material-symbols-outlined">analytics</span>
            Mon activité
        </h2>
        
        <div class="stats-dashboard">
            <div class="stats-card">
                <div class="stats-icon"><span class="material-symbols-outlined">schedule</span></div>
                <div class="stats-info">
                    <span class="stats-label">Temps de visionnage</span>
                    <span class="stats-value">${formattedWatchTime}</span>
                </div>
            </div>
            <div class="stats-card">
                <div class="stats-icon"><span class="material-symbols-outlined">task_alt</span></div>
                <div class="stats-info">
                    <span class="stats-label">Médias complétés</span>
                    <span class="stats-value">${completedCount}</span>
                </div>
            </div>
            <div class="stats-card genre-card">
                <div class="stats-icon"><span class="material-symbols-outlined">favorite</span></div>
                <div class="stats-info">
                    <span class="stats-label">Genre préféré</span>
                    <span class="stats-value">${favoriteGenreText}</span>
                    ${sortedGenres.length > 0 ? `
                        <div class="genre-progress-bars">
                            ${sortedGenres.map(([name, count]) => {
                                const pct = Math.round((count / totalGenrePoints) * 100);
                                return `
                                    <div class="genre-progress-row">
                                        <span class="genre-name">${name}</span>
                                        <div class="genre-bar-bg">
                                            <div class="genre-bar-fill" style="width: ${pct}%"></div>
                                        </div>
                                        <span class="genre-pct">${pct}%</span>
                                    </div>
                                `;
                            }).join('')}
                        </div>
                    ` : '<span class="stats-label" style="margin-top: 10px; text-transform: none;">Aucun genre enregistré</span>'}
                </div>
            </div>
        </div>

        <h2 class="section-title" style="margin-top: 40px;">
            <span class="material-symbols-outlined">history</span>
            Continuer la lecture
        </h2>
        <div class="carousel-container resume-grid" id="carousel-resume" style="padding: 0 4rem;">
            ${history.length > 0 
                ? history.filter(item => !GLOBAL_BLACKLIST_IDS.includes(item.mediaId.toString())).map(item => {
                    // Mapper VideoProgress vers le format attendu par renderMovieCard
                    const cardItem = {
                        id: item.mediaId,
                        media_type: item.mediaType,
                        poster_path: item.poster ? item.poster.replace(IMAGE_W500_URL, '') : '',
                        backdrop_path: item.backdrop, overview: item.overview, release_date: item.year,
                        vote_average: item.rating,
                        title: item.title,
                        name: item.title
                    };
                    return renderMovieCard(cardItem as any, item.mediaType);
                }).join('')
                : '<div class="no-history" style="grid-column: span 4; text-align: center; color: rgba(255,255,255,0.4); padding: 40px;">Aucun historique de lecture disponible.</div>'
            }
        </div>
    `;
    mainContent?.appendChild(section);
}

function renderFavoritesPage() {
    if (!mainContent) return;
    mainContent.innerHTML = '';

    const favorites = FavoritesManager.getAllFavorites();
    const favList = Object.values(favorites);

    const section = document.createElement('section');
    section.className = 'popular';
    section.innerHTML = `
        <h2 class="section-title">
            <svg class="section-fav-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="24" height="24" style="vertical-align: middle; margin-right: 10px; fill: #ef4444; transition: fill 0.3s ease; cursor: pointer;">
                <path d="M 7 5 L 7 28 L 8.59375 26.8125 L 16 21.25 L 23.40625 26.8125 L 25 28 L 25 5 Z M 9 7 L 23 7 L 23 24 L 16.59375 19.1875 L 16 18.75 L 15.40625 19.1875 L 9 24 Z"/>
            </svg>
            Ma liste
        </h2>
        <div class="carousel-container resume-grid" id="carousel-favorites" style="padding: 0 4rem;">
            ${favList.length > 0 
                ? favList.map(item => {
                    const cardItem = {
                        id: item.mediaId,
                        media_type: item.mediaType,
                        poster_path: item.poster ? item.poster.replace(IMAGE_W500_URL, '') : '',
                        backdrop_path: item.backdrop, overview: item.overview, release_date: item.year,
                        vote_average: item.rating,
                        title: item.title,
                        name: item.title
                    };
                    const removeBtn = `
                        <button class="remove-fav-btn" onclick="event.stopPropagation(); removeFavoriteAndAnimate('${item.mediaId}', '${item.mediaType}', this)">
                            <span class="material-symbols-outlined">close</span>
                        </button>
                    `;
                    return renderMovieCard(cardItem as any, item.mediaType, removeBtn);
                }).join('')
                : '<div class="no-history" style="grid-column: span 4; text-align: center; color: rgba(255,255,255,0.4); padding: 40px;">Votre liste attend vos coups de cœur. Ajoutez un programme avec le bouton +.</div>'
            }
        </div>
    `;
    mainContent.appendChild(section);
}

// Observer partagé des sections différées (évite d'en recréer un par section à chaque navigation,
// et de garder en mémoire des observers sur des stubs déjà retirés du DOM)
let lazySectionObserver: IntersectionObserver | null = null;

async function renderHomeSections(type: 'movie' | 'tv' | 'trending' | 'new', genreId: number | null = null) {
    if (!mainContent) return;
    lazySectionObserver?.disconnect();
    lazySectionObserver = null;
    mainContent.innerHTML = ''; 

    // Préchargement des sagas supprimé pour éliminer sagas_data de la chaîne réseau critique au démarrage.
    // Les données de sagas se chargeront désormais de manière asynchrone uniquement lorsque la section Sagas entre dans le viewport.

    if (genreId !== null) {
        // Mode Filtré (un seul carrousel/grille)
        const section = document.createElement('section');
        section.className = 'popular';
        section.innerHTML = `
            <h2 class="section-title">Résultats filtrés</h2>
            <div class="carousel-container" id="carousel-filtered">
                <div class="loading-shimmer section-shimmer-placeholder"></div>
            </div>
        `;
        mainContent?.appendChild(section);
        
        const endpoint = `/discover/${type}`;
        const params = `&with_genres=${genreId}&sort_by=popularity.desc`;
        fetchSectionData({ id: 'filtered', endpoint, params, mediaType: type, title: 'Résultats filtrés', icon: 'filter_list' });
        return;
    }

    let configs = SECTIONS_CONFIG;
    if (type === 'new') {
        configs = SECTIONS_CONFIG.filter(c => ['recent-movies', 'recent-tv', 'trending-week'].includes(c.id));
        mainContent.innerHTML = '<div class="browse-heading"><h1>Nouveautés et tendances</h1><p>Vos prochaines découvertes commencent ici.</p></div>';
    } else if (type === 'movie') {
        configs = SECTIONS_CONFIG.filter(c => c.mediaType === 'movie');
    } else if (type === 'tv') {
        configs = SECTIONS_CONFIG.filter(c => c.mediaType === 'tv');
    } else {
        configs = SECTIONS_CONFIG.filter(c => !c.id.includes('genre-') && !c.id.includes('tv-'));
        configs.push(...SECTIONS_CONFIG.filter(c => c.id === 'tv-action' || c.id === 'genre-action' || c.id === 'genre-animation' || c.id === 'tv-animation'));
    }

    // --- Chargement progressif des sections (batching) & Optimisation DOM (TBT) ---
    const fetchableConfigs = configs;

    // Sur mobile, seule la première section est visible au-dessus du pli (above the fold)
    // Ne créer le DOM lourd que pour la/les premières sections.
    const priorityCount = isMobileViewport() ? 1 : 2;
    const prioritySections = fetchableConfigs.slice(0, priorityCount);
    const lazySections = fetchableConfigs.slice(priorityCount);

    const getSectionHTML = (conf: SectionConfig) => {
        if (conf.id === 'sagas') {
            return `
                <h2 class="section-title">
                    <span class="material-symbols-outlined">${conf.icon}</span>
                    ${conf.title}
                </h2>
                <div class="carousel-container" id="carousel-${conf.id}">
                    <div class="loading-shimmer section-shimmer-placeholder"></div>
                </div>
            `;
        }
        return `
            <h2 class="section-title">
                <span class="material-symbols-outlined">${conf.icon}</span>
                ${conf.title}
            </h2><div class="row-navigation"><button data-row="carousel-${conf.id}" data-direction="-1" aria-label="Titres précédents">‹</button><button data-row="carousel-${conf.id}" data-direction="1" aria-label="Titres suivants">›</button></div>
            <div class="carousel-container" id="carousel-${conf.id}">
                <div class="loading-shimmer section-shimmer-placeholder"></div>
            </div>
        `;
    };

    // 1. Injecter et charger immédiatement les sections prioritaires
    prioritySections.forEach(conf => {
        const section = document.createElement('section');
        section.className = 'popular';
        section.id = `section-${conf.id}`;
        section.innerHTML = getSectionHTML(conf);
        mainContent?.appendChild(section);
        fetchSectionData(conf);
    });

    // 2. Créer de simples "stubs" vides (très légers) pour les sections différées pour économiser le Main Thread (TBT)
    const stubConfigs = new Map<Element, SectionConfig>();
    const observer = new IntersectionObserver((entries, obs) => {
        entries.forEach(entry => {
            if (!entry.isIntersecting) return;
            const stub = entry.target;
            const conf = stubConfigs.get(stub);
            obs.unobserve(stub);
            if (!conf) return;
            stubConfigs.delete(stub);

            // Remplacer le stub par la vraie section
            const section = document.createElement('section');
            section.className = 'popular';
            section.id = `section-${conf.id}`;
            section.innerHTML = getSectionHTML(conf);
            stub.parentNode?.replaceChild(section, stub);
            fetchSectionData(conf);
        });
        if (stubConfigs.size === 0) obs.disconnect();
    }, { rootMargin: '300px', threshold: 0 });
    lazySectionObserver = observer;

    lazySections.forEach(conf => {
        const stub = document.createElement('div');
        stub.id = `stub-${conf.id}`;
        stub.style.height = '1px'; // Minimum height pour l'IntersectionObserver
        mainContent?.appendChild(stub);
        stubConfigs.set(stub, conf);
        observer.observe(stub);
    });
}


async function fetchSectionData(conf: SectionConfig) {
    const container = document.getElementById(`carousel-${conf.id}`);
    if (!container) return;

    if (conf.id === 'sagas') {
        try {
            // Chargement dynamique du module sagas (inclut sagas_data via son propre import)
            const sagasMod = await getSagasModule();
            await sagasMod.loadSagasData();
            const isMobile = isMobileViewport();
            const maxItems = isMobile ? 8 : 6;
            const sagasToDisplay = sagasMod.SAGAS_DATA.slice(0, maxItems);

            container.innerHTML = sagasToDisplay.map((saga: any, index: number) => {
                const isLast = index === sagasToDisplay.length - 1;
                const extra = isLast ? `
                    <div class="see-more-overlay" data-nav="sagas">
                        <span class="material-symbols-outlined">chevron_right</span>
                    </div>
                ` : '';
                
                const sagaPoster = isMobile ? saga.poster.replace('/w500/', '/w185/').replace('/w342/', '/w185/') : saga.poster;

                return `
                    <div class="saga-card" data-id="${saga.id}">
                        <img src="${sagaPoster}" alt="${saga.title}"
                             width="342"
                             height="513"
                             style="background:#1a1a1a;"
                             decoding="async">
                        ${extra}
                        <div class="saga-card-overlay">
                            <h3>${saga.title}</h3>
                            <p>${saga.items.length} Films</p>
                        </div>
                    </div>
                `;
            }).join('');

            // Setup des événements au clic
            container.querySelectorAll('.saga-card').forEach(card => {
                card.addEventListener('click', () => {
                    const id = card.getAttribute('data-id');
                    if (id) sagasMod.renderSagaDetailsPage(id);
                });
            });

            const seeMore = container.querySelector('.see-more-overlay');
            if (seeMore) {
                seeMore.addEventListener('click', (e) => {
                    e.stopPropagation();
                    handleNavigation('sagas');
                });
            }

            // Initialisation du drag de carrousel
            initCarouselDrag();
        } catch (e) {
            console.error("Erreur de chargement de la section sagas:", e);
        }
        return;
    }

    try {
        const url = `${BASE_URL}${conf.endpoint}?api_key=${TMDB_API_KEY}&language=fr-FR${conf.params || ''}`;
        const data = await fetchWithCache(url) as { results: TMDBMedia[] };
        let allItems: TMDBMedia[] = data.results || [];
        
        // Filtrage global blacklist (Empêche les trous dans les carrousels)
        allItems = allItems.filter((item: TMDBMedia) => !GLOBAL_BLACKLIST_IDS.includes(item.id.toString()));
        
        // Filtrage spécifique pour les carrousels Animation/Anime (ID 15 caractères max)
        if (conf.id === 'genre-animation' || conf.id === 'tv-animation') {
            allItems = allItems.filter((item: TMDBMedia) => {
                const title = item.title || item.name || '';
                return title.length <= 15;
            });
        }

        if (allItems.length === 0) {
            container.closest('section')?.remove();
            return;
        }

        // Sauvegarder dans le store pour la pagination
        sectionDataStore[conf.id] = { items: allItems, conf: conf };

        // Rendu de la page 0 (6 premiers)
        renderCarouselPage(conf.id, 0);

        // Si c'est la toute première section du home, on met à jour le hero carousel
        if (conf.id === 'trending-day' && currentType === 'trending' && heroCarouselManager.getSlidesCount() === 0) {
            heroCarouselManager.setSlides(allItems);
        }

    } catch (err) {
        console.error(`Error loading section ${conf.title}:`, err);
        container.innerHTML = '<div class="catalog-error" role="status"><p>Impossible de charger cette sélection.</p><button class="outline-button">Réessayer</button></div>';
        container.querySelector('button')?.addEventListener('click', () => fetchSectionData(conf));
    }
}

function renderCarouselPage(sectionId: string, _startIndex: number) {
    const container = document.getElementById(`carousel-${sectionId}`);
    const data = sectionDataStore[sectionId];
    if (!container || !data) return;
    const ranked = sectionId === 'trending-week';
    container.classList.toggle('top-ten-row', ranked);
    container.innerHTML = data.items.slice(0, ranked ? 10 : 20).map((item, index) => renderMediaCard(item, data.conf.mediaType, '', '', index < 6 ? 'eager' : 'lazy', ranked ? index + 1 : 0)).join('');
    initCarouselDrag(container);
}
(window as any).renderCarouselPage = renderCarouselPage;

export function renderMovieCard(item: TMDBMedia, forceType = 'auto', extra = '', extraUrlParams = '', loading: 'lazy' | 'eager' = 'lazy') {
    return renderMediaCard(item, forceType, extra, extraUrlParams, loading);
}

// Centralized Event Delegation (Moved to setupEventListeners)

// genreFiltersContainer is declared at module level
const desktopGenres = document.getElementById('desktop-genres');
const mobileNavGenres = document.getElementById('mobile-nav-genres');

function renderGenres(type: 'movie' | 'tv' | 'trending' | 'reprendre' | 'iptv' | 'sagas' | 'favorites' | 'new') {
    if (type === 'trending' || type === 'reprendre' || type === 'iptv' || type === 'sagas' || type === 'favorites') {
        if (genreFiltersContainer) genreFiltersContainer.style.display = 'none';
        return;
    }
    
    if (genreFiltersContainer) genreFiltersContainer.style.display = 'flex';
    const genres = type === 'movie' ? movieGenres : tvGenres;
    
    // Injecter dans le menu mobile (Grille 2 colonnes)
    if (mobileNavGenres) {
        mobileNavGenres.innerHTML = genres.map(g => {
            const icon = GENRE_ICONS[g.name] || 'label';
            return `
                <div class="genre-tile ${activeGenreId === g.id ? 'active' : ''}" onclick="selectGenre(${g.id}, '${type}')">
                    <span class="material-symbols-outlined">${icon}</span>
                    <span>${g.name === 'Animation' ? 'Animé' : g.name}</span>
                </div>
            `;
        }).join('');
    }

    if (desktopGenres) {
        if (genres.length === 0) {
            desktopGenres.innerHTML = `<div class="genre-label">Chargement...</div>`;
        } else {
            desktopGenres.innerHTML = `
                <button class="genre-btn ${activeGenreId === null ? 'active' : ''}" data-id="all">Tous</button>
                ${genres.map(g => `<button class="genre-btn ${activeGenreId === g.id ? 'active' : ''}" data-id="${g.id}">${g.name === 'Animation' ? 'Animé' : g.name}</button>`).join('')}
            `;

            desktopGenres.querySelectorAll('.genre-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    const idStr = btn.getAttribute('data-id');
                    activeGenreId = idStr === 'all' ? null : parseInt(idStr!);
                    renderGenres(type);
                    renderHomeSections(type, activeGenreId);
                });
            });
        }
    }
}

// 5. Gestion Drag Carrousel ultra-fluide pour toutes les sections
function initCarouselDrag(specificContainer?: HTMLElement) {
    const containers = specificContainer 
        ? [specificContainer] 
        : document.querySelectorAll('.carousel-container, .sagas-grid-container');
    
    containers.forEach((container: any) => {
        if (container.dataset.dragInit === 'true') return;
        container.dataset.dragInit = 'true';

        let isDown = false;
        let startX: number = 0;
        let scrollLeft: number = 0;
        let velocity: number = 0;
        let rafId: number = 0;
        let lastX: number = 0;
        let lastTime: number = 0;
        let isDragging = false;
        let targetScrollLeft: number = 0;
        let updateScheduled = false;

        const beginDrag = (e: MouseEvent | TouchEvent) => {
            if ('button' in e && e.button !== 0) return;
            
            // Lecture DOM d'abord pour éviter le Layout Thrashing (ajustement forcé de la mise en page)
            const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
            startX = clientX;
            scrollLeft = container.scrollLeft;
            targetScrollLeft = scrollLeft;
            lastX = clientX;
            lastTime = performance.now();

            // Écritures DOM ensuite
            isDown = true;
            isDragging = false;
            container.style.cursor = 'grabbing';
            container.style.userSelect = 'none';
            
            cancelAnimationFrame(rafId);

            // Attacher les écouteurs globaux SEULEMENT pendant le drag pour éviter les fuites de mémoire
            window.addEventListener('mousemove', moveDrag);
            window.addEventListener('mouseup', endDrag);
            window.addEventListener('touchmove', moveDragWrapper, { passive: true });
            window.addEventListener('touchend', endDrag);
        };

        const moveDragWrapper = (e: TouchEvent) => {
            if (isDown) moveDrag(e);
        };

        const endDrag = () => {
            if (!isDown) return;
            isDown = false;
            container.style.cursor = 'grab';
            container.style.userSelect = '';
            
            // Détacher les écouteurs globaux
            window.removeEventListener('mousemove', moveDrag);
            window.removeEventListener('mouseup', endDrag);
            window.removeEventListener('touchmove', moveDragWrapper);
            window.removeEventListener('touchend', endDrag);

            const step = () => {
                if (Math.abs(velocity) > 0.2) {
                    container.scrollLeft -= velocity;
                    velocity *= 0.95; 
                    rafId = requestAnimationFrame(step);
                }
            };
            rafId = requestAnimationFrame(step);
            
            setTimeout(() => isDragging = false, 50);
        };

        const moveDrag = (e: MouseEvent | TouchEvent) => {
            if (!isDown) return;
            
            const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
            const walk = (clientX - startX); 
            
            if (Math.abs(walk) > 5) {
                isDragging = true;
            }
            
            const currentTime = performance.now();
            const deltaTime = currentTime - lastTime;
            
            if (deltaTime > 0) {
                const instantVelocity = (clientX - lastX) / deltaTime * 16;
                velocity = velocity * 0.2 + instantVelocity * 0.8;
            }
            
            targetScrollLeft = scrollLeft - walk;

            if (!updateScheduled) {
                updateScheduled = true;
                requestAnimationFrame(() => {
                    if (isDown) {
                        container.scrollLeft = targetScrollLeft;
                    }
                    updateScheduled = false;
                });
            }
            
            lastX = clientX;
            lastTime = currentTime;
        };

        container.addEventListener('mousedown', beginDrag);
        container.addEventListener('touchstart', beginDrag, { passive: true });
        
        container.addEventListener('click', (e: MouseEvent) => {
            if (isDragging) {
                e.stopImmediatePropagation();
                e.preventDefault();
            }
        }, true);
    });
}
// Appeler après chaque rendu de section
(window as any).initCarouselDrag = initCarouselDrag;

// 9. Démarrage de l'application

// 9. Démarrage de l'application
let genresPromise: Promise<void> | null = null;

async function fetchGenres() {
    movieGenres = MOVIE_GENRES;
    tvGenres = TV_GENRES;
}

function ensureGenresLoaded(): Promise<void> {
    if (!genresPromise) {
        genresPromise = fetchGenres();
    }
    return genresPromise;
}


function setupEventListeners() {
    const searchDialog = searchOverlay as HTMLDialogElement;
    const closeSearchDialog = () => { searchDialog.close(); document.body.classList.remove('dialog-open'); searchTrigger?.focus(); };
    searchTrigger?.addEventListener('click', () => {
        searchDialog.showModal(); searchDialog.classList.add('active'); document.body.classList.add('dialog-open'); searchInput?.focus();
    });
    closeSearch?.addEventListener('click', closeSearchDialog);
    searchDialog?.addEventListener('close', () => { searchDialog.classList.remove('active'); document.body.classList.remove('dialog-open'); });
    searchInput?.addEventListener('input', () => {
        clearTimeout(searchTimeout);
        const query = searchInput!.value.trim();
        searchSequence++;
        if (!query) { document.getElementById('search-results')!.innerHTML = '<p class="search-hint">Recherchez un titre, un acteur ou un genre.</p>'; return; }
        searchTimeout = setTimeout(() => performSearch(query), 300);
    });
    document.getElementById('search-results')?.addEventListener('click', event => {
        const target = event.target as HTMLElement;
        const card = target.closest<HTMLElement>('.movie-card');
        if (!card || target.closest('.card-fav-btn, .card-play')) return;
        openTitle(card.dataset.id!, card.dataset.type!, JSON.parse(card.dataset.media || 'null'));
    });

    [navItems, bottomNavItems].forEach((collection: NodeListOf<Element> | null) => {
        if (collection) {
            collection.forEach((item: Element) => {
                // Ajouter le data-type="reprendre" si c'est le bouton reprendre
                if (item.textContent?.trim() === 'Reprendre') {
                    item.setAttribute('data-type', 'reprendre');
                }

                item.addEventListener('click', (e: Event) => {
                    const type = item.getAttribute('data-type');
                    if (type) {
                        e.preventDefault();
                        handleNavigation(type);
                    }
                });
            });
        }
    });

    if (mainContent) {
        mainContent.addEventListener('click', (e: MouseEvent) => {
            const target = e.target as HTMLElement;
            
            // 1. See More Overlay & Back Button Saga
            const seeMore = target.closest('.see-more-overlay, .back-btn-saga') as HTMLElement | null;
            if (seeMore) {
                e.stopPropagation();
                const sectionId = seeMore.dataset.section;
                const nextIdx = seeMore.dataset.next;
                const navType = seeMore.dataset.nav;

                if (sectionId && nextIdx) {
                    renderCarouselPage(sectionId, parseInt(nextIdx));
                } else if (navType) {
                    handleNavigation(navType);
                }
                return;
            }

            // 2. Movie Card
            const card = target.closest('.movie-card') as HTMLElement | null;
            if (card) {
                if (target.closest('.card-fav-btn') || target.closest('.remove-fav-btn') || target.closest('.card-play')) {
                    return;
                }
                const id = card.dataset.id;
                const type = card.dataset.type;
                const extra = card.dataset.extra || '';
                if (id && type) {
                    // Trouver le média dans notre cache local
                    let foundMedia: TMDBMedia | null = null;
                    
                    // Chercher dans les sections du home
                    for (const sectionId in sectionDataStore) {
                        const item = sectionDataStore[sectionId].items.find(i => i.id.toString() === id);
                        if (item) {
                            foundMedia = item;
                            break;
                        }
                    }
                    
                    // Chercher dans currentData (résultats de recherche)
                    if (!foundMedia && currentData) {
                        foundMedia = currentData.find(i => i.id.toString() === id) || null;
                    }
                    
                    // Chercher dans le carousel
                    if (!foundMedia && heroCarouselManager) {
                        foundMedia = (heroCarouselManager as any).slides?.find((s: any) => s.id.toString() === id) || null;
                    }
                    
                    if (foundMedia) {
                        sessionStorage.setItem('current_media_preview', JSON.stringify(foundMedia));
                    } else {
                        sessionStorage.removeItem('current_media_preview');
                    }
                    
                    openTitle(id, type, foundMedia || JSON.parse(card.dataset.media || 'null'), extra);
                }
                return;
            }

            // 3. Saga Card
            const saga = target.closest('.saga-card') as HTMLElement | null;
            if (saga) {
                const id = saga.dataset.id;
                if (id) (window as any).renderSagaDetailsPage(id);
                return;
            }
        });
    }
}


async function initApp() {
    initSelectors();
    heroCarouselManager = new HeroCarouselManager();
    setupEventListeners();
    initProfiles();
    if (location.pathname === '/profiles') openProfiles();
    document.addEventListener('library-changed', () => { if (currentType === 'favorites') renderFavoritesPage(); });
    document.addEventListener('click', event => {
        const button = (event.target as HTMLElement).closest<HTMLElement>('[data-row]');
        if (!button) return;
        document.getElementById(button.dataset.row!)?.scrollBy({ left: Number(button.dataset.direction) * window.innerWidth * 0.85, behavior: 'smooth' });
    });
    window.addEventListener('popstate', event => {
        if (document.querySelector('dialog[open]')) return;
        const routes: Record<string, string> = { '/movie': 'movie', '/tv': 'tv', '/favorites': 'favorites', '/new': 'new', '/reprendre': 'reprendre', '/iptv': 'iptv', '/sagas': 'sagas' };
        handleNavigation(event.state?.page || routes[location.pathname] || 'trending', true);
    });
    // Déclencher immédiatement la requête TMDB pour les tendances en parallèle (évite le waterfall réseau)
    const trendingUrl = `${BASE_URL}/trending/all/day?api_key=${TMDB_API_KEY}&language=fr-FR`;
    fetchWithCache(trendingUrl);

    // Charger les genres en arrière-plan sans bloquer l'initialisation de l'application (FCP / LCP)
    ensureGenresLoaded();
    
    const urlParams = new URLSearchParams(window.location.search);
    const sagaId = urlParams.get('openSaga');
    
    if (sagaId) {
        // Toujours initialiser le hero en arrière-plan si on commence sur une saga
        const cacheKey = 'mv_trending_day_v3';
        const cached = localStorage.getItem(cacheKey);
        let hasRenderedFromCache = false;
        if (cached) {
            try {
                const parsed = JSON.parse(cached);
                if (Date.now() - parsed.timestamp < 4 * 60 * 60 * 1000) {
                    heroCarouselManager.setSlides(parsed.data || []);
                    hasRenderedFromCache = true;
                }
            } catch(e){}
        }

        fetchWithCache(`${BASE_URL}/trending/all/day?api_key=${TMDB_API_KEY}&language=fr-FR`)
            .then(data => {
                let results = data.results || [];
                results = results.filter((r: TMDBMedia) => r.backdrop_path && r.media_type !== 'person');
                localStorage.setItem(cacheKey, JSON.stringify({
                    timestamp: Date.now(),
                    data: results
                }));
                if (!hasRenderedFromCache) {
                    heroCarouselManager.setSlides(results);
                }
            });
            
        getSagasModule().then(m => m.renderSagaDetailsPage(sagaId));
        // Nettoyer l'URL pour éviter que le paramètre ne reste affiché
        window.history.replaceState({}, document.title, window.location.pathname);
    } else {
        const path = window.location.pathname;
        let initialType: any = 'trending';
        if (path === '/movie') initialType = 'movie';
        else if (path === '/tv') initialType = 'tv';
        else if (path === '/iptv') initialType = 'iptv';
        else if (path === '/reprendre') initialType = 'reprendre';
        else if (path === '/sagas') initialType = 'sagas';
        else if (path === '/favorites') initialType = 'favorites';
        else if (path === '/new') initialType = 'new';

        // Configurer l'état initial dans l'historique
        history.replaceState({ page: initialType }, '', path);

        handleNavigation(initialType, true); 
    }
}

// 10. Gestion de la Recherche (Moved to setupEventListeners)

let searchSequence = 0;
async function performSearch(query: string) {
    const sequence = ++searchSequence;
    const container = document.getElementById('search-results');
    if (!container) return;
    container.innerHTML = '<p class="search-hint" role="status">Recherche en cours…</p>';
    try {
        const data = await fetchWithCache(`${BASE_URL}/search/multi?api_key=${TMDB_API_KEY}&language=fr-FR&query=${encodeURIComponent(query)}`);
        if (sequence !== searchSequence) return;
        const results = (data.results || []).filter((item: TMDBMedia) => ['movie', 'tv'].includes(item.media_type || '') && item.poster_path && !GLOBAL_BLACKLIST_IDS.includes(String(item.id)));
        currentData = results;
        container.innerHTML = results.length ? `<h2>Résultats pour « ${escapeHtml(query)} »</h2><div class="search-results-grid">${results.map((item: TMDBMedia) => renderMovieCard(item)).join('')}</div>` : `<div class="search-empty"><h2>Aucun résultat pour « ${escapeHtml(query)} »</h2><p>Essayez un autre titre, un acteur ou un mot-clé.</p></div>`;
    } catch { if (sequence === searchSequence) container.innerHTML = '<p class="search-hint" role="alert">La recherche est indisponible. Vérifiez votre connexion et réessayez.</p>'; }
}

function selectGenre(id: number, type: string) {
    activeGenreId = id;
    toggleMobileMenu(); // Ferme le menu
    renderGenres(type as any);
    renderHomeSections(type as any, id);
}
(window as any).selectGenre = selectGenre;

// Fermer le menu mobile si on clique sur le backdrop (H-7)
const mobileMenuBackdrop = document.createElement('div');
mobileMenuBackdrop.id = 'mobile-menu-backdrop';
mobileMenuBackdrop.style.cssText = 'position:fixed;inset:0;z-index:9998;background:transparent;display:none;';
document.body.appendChild(mobileMenuBackdrop);

// --- Mobile Menu Toggle ---
export function toggleMobileMenu() {
    const navbar = document.getElementById('navbar');
    const menuToggle = document.getElementById('menu-toggle');
    if (!navbar || !menuToggle) return;

    navbar.classList.toggle('menu-open');
    const icon = menuToggle.querySelector('.material-symbols-outlined');
    if (icon) {
        icon.textContent = navbar.classList.contains('menu-open') ? 'close' : 'menu';
    }

    // Charger les genres dans le menu si ouvert
    if (navbar.classList.contains('menu-open')) {
        renderGenres(currentType === 'trending' ? 'movie' : currentType);
    }

    // Synchroniser le backdrop
    mobileMenuBackdrop.style.display = navbar.classList.contains('menu-open') ? 'block' : 'none';
}
(window as any).toggleMobileMenu = toggleMobileMenu;

mobileMenuBackdrop.addEventListener('click', () => toggleMobileMenu());

// Update handleNavigation to close menu on mobile
// Removed redundant override as it's now integrated in the main handleNavigation function.


// Pause automatique quand on quitte l'onglet (Mobile & PC)
document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        const video = document.getElementById('live-video') as HTMLVideoElement;
        if (video && !video.paused) {
            video.pause();
        }
    }
});

initApp();

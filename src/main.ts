import './style.css';
import { ProgressManager } from './storage';
import { TMDBMedia, TMDBGenre, SectionConfig } from './types';

// Import our new split modules
import {
    TMDB_API_KEY,
    BASE_URL,
    isLowEndActive,
    IMAGE_W500_URL,
    IMAGE_W342_URL,
    IMAGE_W185_URL,
    GLOBAL_BLACKLIST_IDS,
    GENRE_ICONS,
    cachedInnerWidth,
    isMobileViewport,
    fetchWithCache,
    showToast,
    SECTIONS_CONFIG
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

export let heroCarouselManager: HeroCarouselManager;

let navbar: HTMLElement | null = null;
let heroSection: HTMLElement | null = null;
let navItems: NodeListOf<Element> | null = null;
let sectionTitle: Element | null = null;
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
    sectionTitle = document.querySelector('.section-title');
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
let currentType: 'movie' | 'tv' | 'trending' | 'reprendre' | 'iptv' | 'sagas' = 'trending';
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
    if (e.key === 's' && document.activeElement?.tagName !== 'INPUT') {
        e.preventDefault();
        searchInput?.focus();
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

        if (window.location.pathname !== path) {
            history.pushState({ page: type }, '', path);
        }
    }

    if (type === 'movie' || type === 'tv') {
        // Attendre que les genres soient chargés si on navigue sur Films ou Séries
        await ensureGenresLoaded();
    }

    // Sécurité: Si le hero va être affiché mais est vide, on le charge
    if (type !== 'iptv' && type !== 'reprendre' && heroCarouselManager.getSlidesCount() === 0) {
        if (type === 'sagas') {
            await heroCarouselManager.setSagaSlides();
        } else {
            const cacheKey = 'mv_trending_day';
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
                    const results = data.results || [];
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
        const isHidden = (currentType === 'iptv' || currentType === 'reprendre');
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
        if (currentType === 'reprendre' || currentType === 'iptv') {
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
            Tableau de Bord
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

async function renderHomeSections(type: 'movie' | 'tv' | 'trending', genreId: number | null = null) {
    if (!mainContent) return;
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
    if (type === 'movie') {
        configs = SECTIONS_CONFIG.filter(c => c.mediaType === 'movie');
    } else if (type === 'tv') {
        configs = SECTIONS_CONFIG.filter(c => c.mediaType === 'tv');
    } else {
        configs = SECTIONS_CONFIG.filter(c => !c.id.includes('genre-') && !c.id.includes('tv-'));
        configs.push(...SECTIONS_CONFIG.filter(c => c.id === 'tv-action' || c.id === 'genre-action' || c.id === 'genre-animation' || c.id === 'tv-animation'));
    }

    // Créer les squelettes
    configs.forEach(conf => {
        const section = document.createElement('section');
        section.className = 'popular';
        section.id = `section-${conf.id}`;
        
        if (conf.id === 'sagas') {
            section.innerHTML = `
                <h2 class="section-title">
                    <span class="material-symbols-outlined">${conf.icon}</span>
                    ${conf.title}
                </h2>
                <div class="carousel-container" id="carousel-${conf.id}">
                    <div class="loading-shimmer section-shimmer-placeholder"></div>
                </div>
            `;
            mainContent?.appendChild(section);
            return;
        }

        section.innerHTML = `
            <h2 class="section-title">
                <span class="material-symbols-outlined">${conf.icon}</span>
                ${conf.title}
            </h2>
            <div class="carousel-container" id="carousel-${conf.id}">
                <div class="loading-shimmer section-shimmer-placeholder"></div>
            </div>
        `;
        mainContent?.appendChild(section);
    });

    // --- Chargement progressif des sections (batching) ---
    // Les sagas sont désormais incluses dans le chargement différé/lazy
    const fetchableConfigs = configs;

    // Sur mobile, seule la première section est visible au-dessus du pli (above the fold)
    // Charger uniquement cette première section au boot élimine /trending/all/week de la chaîne critique (M-3 : économie réseau critique)
    const priorityCount = isMobileViewport() ? 1 : 2;
    const prioritySections = fetchableConfigs.slice(0, priorityCount);
    const lazySections = fetchableConfigs.slice(priorityCount);

    prioritySections.forEach(conf => fetchSectionData(conf));

    // Les sections suivantes chargent via IntersectionObserver
    lazySections.forEach(conf => {
        const sectionEl = document.getElementById(`section-${conf.id}`);
        if (!sectionEl) { fetchSectionData(conf); return; }

        const sectionObserver = new IntersectionObserver((entries, obs) => {
            if (entries[0].isIntersecting) {
                fetchSectionData(conf);
                obs.disconnect();
            }
        }, { rootMargin: '300px', threshold: 0 });

        sectionObserver.observe(sectionEl);
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
        if (conf.id === 'trending-day' && currentType === 'trending') {
            heroCarouselManager.setSlides(allItems);
        }

    } catch (err) {
        console.error(`Error loading section ${conf.title}:`, err);
    }
}

function renderCarouselPage(sectionId: string, startIndex: number) {
    const container = document.getElementById(`carousel-${sectionId}`);
    const data = sectionDataStore[sectionId];
    if (!container || !data) return;

    const { items, conf } = data;
    const pageSize = 6;
    const currentPageItems = items.slice(startIndex, startIndex + pageSize);

    container.innerHTML = currentPageItems.map((item: TMDBMedia, index: number) => {
        // Optimisation : Pas de lazy loading pour les 6 premiers éléments du haut pour booster le LCP
        const isAboveFold = startIndex === 0 && index < 6;
        const loadingMode = isAboveFold ? 'eager' : 'lazy';
        
        let extra = '';
        
        // Bouton RETOUR sur le 1er film si on n'est pas à la page 0
        if (index === 0 && startIndex > 0) {
            extra += `
                <div class="see-more-overlay-left" onclick="event.stopPropagation(); renderCarouselPage('${sectionId}', ${Math.max(0, startIndex - pageSize)})">
                    <span class="material-symbols-outlined">chevron_left</span>
                </div>
            `;
        }

        // Bouton SUIVANT sur le 6ème film s'il reste des films
        if (index === pageSize - 1 && startIndex + pageSize < items.length) {
            extra += `
                <div class="see-more-overlay" data-section="${sectionId}" data-next="${startIndex + pageSize}">
                    <span class="material-symbols-outlined">chevron_right</span>
                </div>
            `;
        }

        const cardHtml = renderMovieCard(item, conf.mediaType, extra, '', loadingMode);
        return cardHtml.replace('class="movie-card"', `class="movie-card" style="animation-delay: ${index * 0.1}s; animation-name: fadeInUp"`);
    }).join('');

    // Scroll et initialisation du drag déferrés pour éliminer le Forced Synchronous Reflow et le Layout Thrashing (R-1)
    setTimeout(() => {
        if (container) {
            if (startIndex > 0) {
                container.scrollLeft = 0;
            }
            initCarouselDrag(container);
        }
    }, 0);
}

// Exposer au scope global pour les onclick
(window as any).renderCarouselPage = renderCarouselPage;

export function renderMovieCard(item: TMDBMedia, forceType: string = 'auto', extra: string = '', extraUrlParams: string = '', loading: 'lazy' | 'eager' = 'lazy') {
    let displayType = item.media_type || forceType;
    if (displayType === 'auto') displayType = item.title ? 'movie' : 'tv';
 
    // Responsive Imagery: w185 pour mobile, w342 pour desktop
    const posterPath = item.poster_path;
    const placeholder = 'https://via.placeholder.com/185x278?text=No+Image';
    
    const isMobile = cachedInnerWidth <= 768;
    let src: string;
    let srcset: string;
    let sizes: string;

    if (posterPath) {
        if (isMobile) {
            const mobileUrl = isLowEndActive ? 'https://image.tmdb.org/t/p/w154' : 'https://image.tmdb.org/t/p/w185';
            src = `${mobileUrl}${posterPath}`;
            srcset = `${mobileUrl}${posterPath} 185w, https://image.tmdb.org/t/p/w342${posterPath} 342w`;
            sizes = "185px";
        } else {
            src = `${IMAGE_W342_URL}${posterPath}`;
            srcset = `${IMAGE_W185_URL}${posterPath} 185w, ${IMAGE_W342_URL}${posterPath} 342w`;
            sizes = "(max-width: 768px) 185px, 342px";
        }
    } else {
        src = placeholder;
        srcset = '';
        sizes = '';
    }

    const rating = item.vote_average ? item.vote_average.toFixed(1) : '0.0';
    const badgeText = item.genre_ids?.includes(16) ? 'Animé' : (displayType === 'tv' ? 'Série' : 'Film');
    const releaseDate = item.release_date || item.first_air_date;
    const year = releaseDate ? new Date(releaseDate).getFullYear() : '';
    
    // Récupérer la progression pour ce média pour afficher une barre de suivi
    let progressBarHtml = '';
    let episodeBadgeHtml = '';
    const progress = ProgressManager.getProgress(item.id.toString(), displayType);
    if (progress && progress.time > 0 && progress.duration > 0) {
        const percentage = Math.min(Math.round((progress.time / progress.duration) * 100), 100);
        
        progressBarHtml = `
            <div class="progress-bar-mini">
                <div class="progress-fill" style="width: ${percentage}%"></div>
            </div>
        `;

        if (displayType === 'tv' && progress.season && progress.episode) {
            episodeBadgeHtml = `
                <div class="episode-badge">S${progress.season}E${progress.episode}</div>
            `;
        }
    }

    return `
        <div class="movie-card" data-id="${item.id}" data-type="${displayType}" data-extra="${extraUrlParams}">
            <div class="card-badge">${badgeText}</div>
            ${episodeBadgeHtml}
            <img src="${src}" 
                 srcset="${srcset}" 
                 sizes="${sizes}"
                 width="342"
                 height="513"
                 alt="${item.title || item.name}" 
                 loading="${loading}"
                 decoding="async">
            <div class="card-overlay">
                <div class="card-rating">★ ${rating}</div>
                <div class="card-info">
                    <h3 class="card-title">${item.title || item.name}</h3>
                    ${year ? `<span class="card-year">${year}</span>` : ''}
                </div>
            </div>
            ${progressBarHtml}
            ${extra}
        </div>
    `;
}

// Centralized Event Delegation (Moved to setupEventListeners)

// genreFiltersContainer is declared at module level
const desktopGenres = document.getElementById('desktop-genres');
const mobileNavGenres = document.getElementById('mobile-nav-genres');

function renderGenres(type: 'movie' | 'tv' | 'trending' | 'reprendre' | 'iptv' | 'sagas') {
    if (!genreFiltersContainer) return;
    
    if (type === 'trending' || type === 'reprendre' || type === 'iptv' || type === 'sagas') {
        genreFiltersContainer.style.display = 'none';
        return;
    }
    
    genreFiltersContainer.style.display = 'flex';
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

    if (desktopGenres && desktopGenres.style.display !== 'none') {
        if (genres.length === 0) {
            desktopGenres.innerHTML = `<div class="genre-label">Chargement...</div>`;
        } else {
            desktopGenres.innerHTML = `
                <div class="genre-label">${type === 'movie' ? 'Genres Films' : 'Genres Séries'}</div>
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
    // 1. Vérifier le cache
    const cachedMovieGenres = sessionStorage.getItem('movie_genres');
    const cachedTvGenres = sessionStorage.getItem('tv_genres');

    if (cachedMovieGenres && cachedTvGenres) {
        movieGenres = JSON.parse(cachedMovieGenres);
        tvGenres = JSON.parse(cachedTvGenres);
        console.log("Genres chargés du cache");
        return;
    }

    try {
        console.log("Fetching genres from API...");
        const [mData, tData] = await Promise.all([
            fetchWithCache(`${BASE_URL}/genre/movie/list?api_key=${TMDB_API_KEY}&language=fr-FR`),
            fetchWithCache(`${BASE_URL}/genre/tv/list?api_key=${TMDB_API_KEY}&language=fr-FR`)
        ]);

        movieGenres = mData.genres || [];
        tvGenres = tData.genres || [];

        // Sauvegarder dans le cache
        sessionStorage.setItem('movie_genres', JSON.stringify(movieGenres));
        sessionStorage.setItem('tv_genres', JSON.stringify(tvGenres));
        
        console.log("Genres récupérés et cachés");
    } catch (error) {
        console.error('Erreur lors de la récupération des genres:', error);
        // Fallback minimal si l'API échoue
        movieGenres = [];
        tvGenres = [];
    }
}

function ensureGenresLoaded(): Promise<void> {
    if (!genresPromise) {
        genresPromise = fetchGenres();
    }
    return genresPromise;
}


function setupEventListeners() {
    searchTrigger?.addEventListener('click', () => {
        searchOverlay?.classList.add('active');
        searchInput?.focus();
    });

    closeSearch?.addEventListener('click', () => {
        searchOverlay?.classList.remove('active');
    });

    if (searchInput) {
        searchInput.addEventListener('input', (e: Event) => {
            const query = (e.target as HTMLInputElement).value.trim();
            
            clearTimeout(searchTimeout);
            
            if (query.length > 2) {
                searchTimeout = setTimeout(() => {
                    performSearch(query);
                }, 500); // Délai de 500ms pour éviter de spammer l'API à chaque frappe
            } else if (query.length === 0) {
                // Revenir à la liste populaire si la barre de recherche est vidée
                if (sectionTitle) {
                    if (currentType === 'trending') sectionTitle.textContent = 'Tendances Actuelles';
                    else if (currentType === 'tv') sectionTitle.textContent = 'Séries Populaires';
                    else sectionTitle.textContent = 'Films Populaires';
                }
                if (currentType === 'reprendre') {
                    renderResumePage();
                } else if (currentType === 'iptv') {
                    getIPTVModule().then(mod => mod.initLiveTV());
                } else {
                    renderHomeSections(currentType as any);
                }
            }
        });
    }

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
                    
                    window.location.href = `/details.html?id=${id}&type=${type}${extra}`;
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
    // Déclencher immédiatement la requête TMDB pour les tendances en parallèle (évite le waterfall réseau)
    const trendingUrl = `${BASE_URL}/trending/all/day?api_key=${TMDB_API_KEY}&language=fr-FR`;
    fetchWithCache(trendingUrl);

    // Charger les genres en arrière-plan sans bloquer l'initialisation de l'application (FCP / LCP)
    ensureGenresLoaded();
    
    const urlParams = new URLSearchParams(window.location.search);
    const sagaId = urlParams.get('openSaga');
    
    if (sagaId) {
        // Toujours initialiser le hero en arrière-plan si on commence sur une saga
        const cacheKey = 'mv_trending_day';
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
                const results = data.results || [];
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

        // Configurer l'état initial dans l'historique
        history.replaceState({ page: initialType }, '', path);

        handleNavigation(initialType, true); 
    }
}

// 10. Gestion de la Recherche (Moved to setupEventListeners)

async function performSearch(query: string) {
    if (!query || !mainContent) return;
    
    try {
        const response = await fetch(`${BASE_URL}/search/multi?api_key=${TMDB_API_KEY}&language=fr-FR&query=${encodeURIComponent(query)}`);
        const data = await response.json();
        
        const filteredResults = data.results.filter((item: TMDBMedia) => 
            (item.media_type === 'movie' || item.media_type === 'tv') && 
            item.poster_path &&
            !GLOBAL_BLACKLIST_IDS.includes(item.id.toString())
        );

        if (filteredResults.length > 0) {
            currentData = filteredResults;
            
            if (mainContent) {
                mainContent.innerHTML = '';
                const section = document.createElement('section');
                section.className = 'popular';
                section.innerHTML = `
                    <h2 class="section-title">Résultats pour "${query}"</h2>
                    <div class="carousel-container">
                        ${filteredResults.map((item: any) => renderMovieCard(item)).join('')}
                    </div>
                `;
                mainContent?.appendChild(section);
            }

            heroCarouselManager.setSlides(currentData);
        } else {
            if (mainContent) {
                mainContent.innerHTML = `<div class="no-results" style="padding: 100px; text-align: center; color: white; opacity: 0.5;">Aucun résultat trouvé pour "${query}".</div>`;
            }
        }
    } catch (error) {
        console.error('Erreur recherche:', error);
    }
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
    console.log("Toggle Menu Clicked");
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

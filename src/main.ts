import './style.css';
import './style.css';
import { ProgressManager } from './storage';
import { SAGAS_DATA } from './sagas_data';
import { TMDBMedia, TMDBGenre } from './types';

interface SectionConfig {
    id: string;
    title: string;
    icon: string;
    endpoint: string;
    params?: string;
    mediaType: string;
}

// Détection Android Chrome: ajoute classe sur <html> pour cibler en CSS
// iOS Safari ne match pas car sa UA contient "iPhone"/"iPad" mais pas "Android"
if (/Android/i.test(navigator.userAgent) && /Chrome/i.test(navigator.userAgent)) {
    document.documentElement.classList.add('android-chrome');
}

// 1. Constantes TMDB
const TMDB_API_KEY = import.meta.env.VITE_TMDB_API_KEY;
const BASE_URL = 'https://api.themoviedb.org/3';
const IMAGE_BASE_URL = 'https://image.tmdb.org/t/p/original';
const IMAGE_W500_URL = 'https://image.tmdb.org/t/p/w500';
const IMAGE_W342_URL = 'https://image.tmdb.org/t/p/w342';

// Global Blacklist for specific movies/series
const GLOBAL_BLACKLIST_IDS = ['36659', '927306', '212502', '77150', '77151', '1017007', '1025539', '1013441', '1439930']; 

// Cache pour la pagination des sections
const sectionDataStore: { [key: string]: { items: TMDBMedia[], conf: SectionConfig } } = {};

const GENRE_ICONS: { [key: string]: string } = {
    'Action': 'bolt',
    'Aventure': 'explore',
    'Animation': 'animation',
    'Comédie': 'sentiment_very_satisfied',
    'Crime': 'policy',
    'Documentaire': 'description',
    'Drame': 'theater_comedy',
    'Familial': 'family_restroom',
    'Fantastique': 'magic_button',
    'Histoire': 'history_edu',
    'Horreur': 'skull',
    'Musique': 'music_note',
    'Mystère': 'mystery',
    'Romance': 'favorite',
    'Science-Fiction': 'rocket_launch',
    'Téléfilm': 'tv',
    'Thriller': 'warning',
    'Guerre': 'military_tech',
    'Western': 'directions_run',
    'Action & Adventure': 'bolt',
    'Kids': 'child_care',
    'News': 'newspaper',
    'Reality': 'visibility',
    'Sci-Fi & Fantasy': 'rocket_launch',
    'Soap': 'wash',
    'Talk': 'forum',
    'War & Politics': 'military_tech'
};

// 2. DOM Elements & State
let currentIptvObserver: IntersectionObserver | null = null;
let currentData: TMDBMedia[] = []; 
let currentType: 'movie' | 'tv' | 'trending' | 'reprendre' | 'iptv' | 'sagas' = 'trending';

// Genre globals
let movieGenres: TMDBGenre[] = [];
let tvGenres: TMDBGenre[] = [];
let activeGenreId: number | null = null;

// DOM Selectors
const navbar = document.getElementById('navbar');
const heroSection = document.getElementById('hero-carousel');
const heroSlidesContainer = document.getElementById('hero-slides');
const heroDotsContainer = document.getElementById('carousel-dots');
const heroProgress = document.getElementById('carousel-progress');
const heroPauseBtn = document.getElementById('carousel-pause');
const heroPrevBtn = document.getElementById('carousel-prev');
const heroNextBtn = document.getElementById('carousel-next');

const navItems = document.querySelectorAll('.nav-item');
const sectionTitle = document.querySelector('.section-title');
const searchTrigger = document.getElementById('search-trigger');
const searchOverlay = document.getElementById('search-overlay');
const closeSearch = document.getElementById('close-search');
const searchInput = document.getElementById('search-input-premium') as HTMLInputElement | null;

const mainContent = document.getElementById('main-content');
const iptvSection = document.getElementById('iptv-section');

// Configuration des sections Movix
const SECTIONS_CONFIG: SectionConfig[] = [
    { id: 'trending-day', title: 'Tendances du jour', icon: 'local_fire_department', endpoint: '/trending/all/day', mediaType: 'trending' },
    { id: 'trending-week', title: 'Tendances', icon: 'trending_up', endpoint: '/trending/all/week', mediaType: 'trending' },
    { id: 'sagas', title: 'Les sagas incontournables', icon: 'auto_awesome', endpoint: '/movie/top_rated', mediaType: 'movie' },
    { id: 'pop-movies', title: 'Films populaires', icon: 'movie', endpoint: '/movie/popular', mediaType: 'movie' },
    { id: 'pop-tv', title: 'Séries populaires', icon: 'tv', endpoint: '/tv/popular', mediaType: 'tv' },
    { id: 'recent-tv', title: 'Séries récentes', icon: 'live_tv', endpoint: '/tv/on_the_air', mediaType: 'tv' },
    { id: 'recent-movies', title: 'Films récents', icon: 'new_releases', endpoint: '/movie/now_playing', mediaType: 'movie' },
    { id: 'top-tv', title: 'Séries les mieux notées', icon: 'star', endpoint: '/tv/top_rated', mediaType: 'tv' },
    { id: 'genre-adventure', title: 'Aventure', icon: 'explore', endpoint: '/discover/movie', params: '&with_genres=12', mediaType: 'movie' },
    { id: 'genre-fantasy', title: 'Fantastique', icon: 'magic_button', endpoint: '/discover/movie', params: '&with_genres=14', mediaType: 'movie' },
    { id: 'genre-animation', title: 'Animé', icon: 'animation', endpoint: '/discover/movie', params: '&with_genres=16', mediaType: 'movie' },
    { id: 'genre-drama', title: 'Drame', icon: 'theater_comedy', endpoint: '/discover/movie', params: '&with_genres=18', mediaType: 'movie' },
    { id: 'genre-action', title: 'Action', icon: 'sports_martial_arts', endpoint: '/discover/movie', params: '&with_genres=28', mediaType: 'movie' },
    { id: 'genre-comedy', title: 'Comédie', icon: 'sentiment_very_satisfied', endpoint: '/discover/movie', params: '&with_genres=35', mediaType: 'movie' },
    { id: 'genre-crime', title: 'Crime', icon: 'policy', endpoint: '/discover/movie', params: '&with_genres=80', mediaType: 'movie' },
    { id: 'tv-action', title: 'Séries d\'Action', icon: 'bolt', endpoint: '/discover/tv', params: '&with_genres=10759', mediaType: 'tv' },
    { id: 'tv-animation', title: 'Animé', icon: 'animation', endpoint: '/discover/tv', params: '&with_genres=16', mediaType: 'tv' }
];

// --- Carousel Manager (Movix Style) ---
class HeroCarouselManager {
    private slides: TMDBMedia[] = [];
    private currentIndex: number = 0;
    private interval: any = null;
    private progress: number = 0;
    private isPaused: boolean = false;
    private readonly DURATION: number = 8000; 
    private readonly STEP: number = 100 / (this.DURATION / 16); 

    constructor() {
        this.initEventListeners();
    }

    private initEventListeners() {
        heroPauseBtn?.addEventListener('click', () => this.togglePause());
        heroPrevBtn?.addEventListener('click', () => this.prevSlide());
        heroNextBtn?.addEventListener('click', () => this.nextSlide());

        // Event Delegation for slides
        heroSlidesContainer?.addEventListener('click', (e) => {
            const target = e.target as HTMLElement;
            const btn = target.closest('button');
            if (btn) {
                const id = btn.getAttribute('data-id');
                const type = btn.getAttribute('data-type');
                if (id && type) {
                    if (type === 'saga') {
                        (window as any).renderSagaDetailsPage(id);
                    } else {
                        window.location.href = `/details.html?id=${id}&type=${type}`;
                    }
                }
            }
        });
    }

    public setSlides(data: TMDBMedia[]) {
        // Filtrer les IDs blacklistés
        const filtered = data.filter(item => !GLOBAL_BLACKLIST_IDS.includes(item.id.toString()));
        // Mélanger les données au hasard entre films et séries tendances
        const shuffled = [...filtered].sort(() => 0.5 - Math.random());
        this.slides = shuffled.slice(0, 6); 
        this.renderSlides();
        this.renderDots();
        this.goToSlide(0);
        this.start();
    }

    private renderSlides() {
        if (!heroSlidesContainer) return;
        heroSlidesContainer.innerHTML = this.slides.map((item, index) => {
            const isSaga = !!(item as any).isSaga;
            const displayType = isSaga ? 'saga' : (item.media_type || (currentType === 'tv' ? 'tv' : 'movie'));
            const title = isSaga ? (item as any).title : (displayType === 'tv' ? (item.name || item.original_name) : (item.title || item.original_title));
            const releaseDate = isSaga ? null : (displayType === 'tv' ? item.first_air_date : item.release_date);
            const releaseYear = releaseDate ? new Date(releaseDate).getFullYear() : (isSaga ? 'SAGA' : 'N/A');
            const rating = isSaga ? 'N/A' : (item.vote_average ? item.vote_average.toFixed(1) : '0.0');
            
            // Pour les sagas, on utilise l'image des icônes (poster) comme demandé par l'utilisateur
            let backdropUrl = isSaga ? item.poster : (item.backdrop || (item.backdrop_path ? `${IMAGE_BASE_URL}${item.backdrop_path}` : ''));
            
            // Si l'image est manquante ou cassée
            if (!backdropUrl || backdropUrl.includes('86Yp1S669SFWFWFW') || backdropUrl === '') {
                backdropUrl = 'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?q=80&w=2070&auto=format&fit=crop';
            }

            const overview = (item as any).description || item.overview || "Aucun synopsis disponible.";

            const isLongTitle = title && title.length > 18;
            

            return `
                <div class="hero-slide ${index === 0 ? 'active' : ''} ${isLongTitle ? 'long-title' : ''}" style="background-image: url('${backdropUrl}')" data-index="${index}">
                    ${index === 0 ? `<img src="${backdropUrl}" style="display:none" loading="eager">` : ''}
                    <div class="slide-content">
                        <div class="slide-info">
                            <span class="type-tag">${isSaga ? 'COLLECTION' : (item.genre_ids?.includes(16) ? 'ANIMÉ' : (displayType === 'tv' ? 'SÉRIE' : 'FILM'))}</span>
                            <span class="year-tag">
                                <span class="material-symbols-outlined">calendar_today</span>
                                ${releaseYear}
                            </span>
                            <span class="rating-tag" style="${isSaga ? 'display:none' : ''}">
                                <span class="material-symbols-outlined">star</span>
                                ${rating}
                            </span>
                        </div>
                        <h1>${title}</h1>
                        <p class="slide-synopsis">${overview}</p>
                        <div class="slide-actions">
                            <button class="hero-btn-play" data-id="${item.id}" data-type="${displayType}">
                                <span class="material-symbols-outlined">${isSaga ? 'visibility' : 'play_arrow'}</span> ${isSaga ? 'Découvrir' : 'Lecture'}
                            </button>
                            <button class="hero-btn-info" data-id="${item.id}" data-type="${displayType}">
                                <span class="material-symbols-outlined">info</span> Plus d'infos
                            </button>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    }

    private renderDots() {
        if (!heroDotsContainer) return;
        heroDotsContainer.innerHTML = this.slides.map((_, index) => `
            <div class="dot ${index === 0 ? 'active' : ''}" data-index="${index}"></div>
        `).join('');

        heroDotsContainer.querySelectorAll('.dot').forEach(dot => {
            dot.addEventListener('click', () => {
                const index = parseInt(dot.getAttribute('data-index') || '0');
                this.goToSlide(index);
            });
        });
    }

    private goToSlide(index: number) {
        this.currentIndex = index;
        this.progress = 0;
        this.updateDOM();
    }

    private updateDOM() {
        const slides = document.querySelectorAll('.hero-slide');
        const dots = document.querySelectorAll('.dot');
        
        slides.forEach(s => s.classList.remove('active'));
        dots.forEach(d => d.classList.remove('active'));

        if (slides[this.currentIndex]) slides[this.currentIndex].classList.add('active');
        if (dots[this.currentIndex]) dots[this.currentIndex].classList.add('active');

        if (heroProgress) heroProgress.style.width = '0%';
    }

    public nextSlide() {
        this.currentIndex = (this.currentIndex + 1) % this.slides.length;
        this.goToSlide(this.currentIndex);
    }

    public prevSlide() {
        this.currentIndex = (this.currentIndex - 1 + this.slides.length) % this.slides.length;
        this.goToSlide(this.currentIndex);
    }

    private togglePause() {
        this.isPaused = !this.isPaused;
        const icon = heroPauseBtn?.querySelector('.material-symbols-outlined');
        if (icon) icon.textContent = this.isPaused ? 'play_arrow' : 'pause';
    }

    public start() {
        if (this.interval) clearInterval(this.interval);
        this.interval = setInterval(() => {
            if (!this.isPaused) {
                this.progress += this.STEP;
                if (heroProgress) heroProgress.style.width = `${this.progress}%`;
                
                if (this.progress >= 100) {
                    this.nextSlide();
                }
            }
        }, 16);
    }

    public stop() {
        if (this.interval) clearInterval(this.interval);
    }

    public getSlidesCount(): number {
        return this.slides.length;
    }

    public getCurrentIndex(): number {
        return this.currentIndex;
    }

    public refresh() {
        this.updateDOM();
    }

    public setSagaSlides() {
        // Prendre les 50 premières sagas (les plus connues)
        const topSagas = SAGAS_DATA.slice(0, 50);
        // En choisir 6 au hasard
        const shuffled = [...topSagas].sort(() => 0.5 - Math.random());
        this.slides = shuffled.slice(0, 6).map(s => ({ ...s, isSaga: true }));
        this.renderSlides();
        this.renderDots();
        this.goToSlide(0);
        this.start();
    }
}

const heroCarouselManager = new HeroCarouselManager();

// 3. Navbar Glassmorphism
window.addEventListener('scroll', () => {
    if (window.scrollY > 50 || currentType === 'iptv') {
        navbar?.classList.add('scrolled');
    } else {
        navbar?.classList.remove('scrolled');
    }
});

// Shortcut to focus search
window.addEventListener('keydown', (e) => {
    if (e.key === 's' && document.activeElement?.tagName !== 'INPUT') {
        e.preventDefault();
        searchInput?.focus();
    }
});

// Utilitaire pour basculer la visibilité de la recherche
function toggleSearchVisibility(show: boolean) {
    const trigger = document.getElementById('search-trigger');
    if (trigger) {
        trigger.style.display = show ? 'flex' : 'none';
    }
}


// 4. Navigation Management
const bottomNavItems = document.querySelectorAll('.bottom-nav-item');

function handleNavigation(type: any) {
    // Bloquer Direct TV sur Mobile
    if (type === 'iptv' && window.innerWidth <= 768) {
        return;
    }

    // Sécurité: Si le hero va être affiché mais est vide, on le charge
    if (type !== 'iptv' && type !== 'reprendre' && heroCarouselManager.getSlidesCount() === 0) {
        if (type === 'sagas') {
            heroCarouselManager.setSagaSlides();
        } else {
            fetch(`${BASE_URL}/trending/all/day?api_key=${TMDB_API_KEY}&language=fr-FR`)
                .then(res => res.json())
                .then(data => heroCarouselManager.setSlides(data.results || []));
        }
    }

    // Si on passe aux sagas, on met à jour le hero avec des sagas au hasard
    if (type === 'sagas') {
        heroCarouselManager.setSagaSlides();
    }


    
    // Fermer le menu mobile si ouvert
    navbar?.classList.remove('menu-open');
    const menuIcon = document.querySelector('#menu-toggle .material-symbols-outlined');
    if (menuIcon) menuIcon.textContent = 'menu';

    [navItems, bottomNavItems].forEach(collection => {
        collection.forEach(i => {
            if (i.getAttribute('data-type') === type) i.classList.add('active');
            else i.classList.remove('active');
        });
    });

    currentType = type as any;
    activeGenreId = null; 

    if (currentType !== 'iptv') {
        stopLiveTV();
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
        initLiveTV();
    } else {
        if (navbar) navbar.style.display = 'flex';
        // Afficher la recherche sauf pour les sagas
        toggleSearchVisibility(currentType !== 'sagas');
        
        if (currentType === 'reprendre') {
            renderResumePage();
        } else if (currentType === 'sagas') {
            renderSagasPage();
        } else {
            renderGenres(currentType as any);
            renderHomeSections(currentType as any);
        }
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
}
(window as any).handleNavigation = handleNavigation;


// 4b. Search Overlay Logic
searchTrigger?.addEventListener('click', () => {
    searchOverlay?.classList.add('active');
    searchInput?.focus();
});

closeSearch?.addEventListener('click', () => {
    searchOverlay?.classList.remove('active');
});

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

    const section = document.createElement('section');
    section.className = 'popular';
    section.innerHTML = `
        <h2 class="section-title">Continuer la lecture</h2>
        <div class="carousel-container resume-grid" id="carousel-resume">
            ${history.length > 0 
                ? history.filter(item => !GLOBAL_BLACKLIST_IDS.includes(item.mediaId.toString())).map(item => {
                    // Mapper VideoProgress vers le format attendu par renderMovieCard
                    const cardItem = {
                        id: item.mediaId,
                        media_type: item.mediaType,
                        poster_path: item.poster.replace(IMAGE_W500_URL, ''),
                        vote_average: item.rating,
                        title: item.title,
                        name: item.title
                    };
                    return renderMovieCard(cardItem as any, item.mediaType);
                }).join('')
                : '<div class="no-history">Aucun historique de lecture disponible.</div>'
            }
        </div>
    `;
    mainContent.appendChild(section);
}

async function renderHomeSections(type: 'movie' | 'tv' | 'trending', genreId: number | null = null) {
    if (!mainContent) return;
    mainContent.innerHTML = ''; 

    if (genreId !== null) {
        // Mode Filtré (un seul carrousel/grille)
        const section = document.createElement('section');
        section.className = 'popular';
        section.innerHTML = `
            <h2 class="section-title">Résultats filtrés</h2>
            <div class="carousel-container" id="carousel-filtered">
                <div class="loading-shimmer" style="height: 250px; width: 100%; border-radius: 16px;"></div>
            </div>
        `;
        mainContent.appendChild(section);
        
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
            const isMobile = window.innerWidth <= 768;
            const maxItems = isMobile ? 8 : 6;
            const sagasToDisplay = SAGAS_DATA.slice(0, maxItems);

            section.innerHTML = `
                <h2 class="section-title">
                    <span class="material-symbols-outlined">${conf.icon}</span>
                    ${conf.title}
                </h2>
                <div class="sagas-grid-container" id="carousel-sagas">
                    ${sagasToDisplay.map((saga, index) => {
                        const isLast = index === sagasToDisplay.length - 1;
                        const extra = isLast ? `
                            <div class="see-more-overlay" data-nav="sagas">
                                <span class="material-symbols-outlined">chevron_right</span>
                            </div>
                        ` : '';
                        
                        return `
                            <div class="saga-card" data-id="${saga.id}">
                                <img src="${saga.poster}" alt="${saga.title}" loading="lazy">
                                ${extra}
                                <div class="saga-card-overlay">
                                    <h3>${saga.title}</h3>
                                    <p>${saga.items.length} Films</p>
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
            `;
            mainContent.appendChild(section);
            return;
        }




        section.innerHTML = `
            <h2 class="section-title">
                <span class="material-symbols-outlined">${conf.icon}</span>
                ${conf.title}
            </h2>
            <div class="carousel-container" id="carousel-${conf.id}">
                <div class="loading-shimmer" style="height: 250px; width: 100%; border-radius: 16px;"></div>
            </div>
        `;
        mainContent.appendChild(section);
        fetchSectionData(conf);
    });
}

async function fetchSectionData(conf: SectionConfig) {
    const container = document.getElementById(`carousel-${conf.id}`);
    if (!container) return;

    try {
        const url = `${BASE_URL}${conf.endpoint}?api_key=${TMDB_API_KEY}&language=fr-FR${conf.params || ''}`;
        const res = await fetch(url);
        const data = (await res.json()) as { results: TMDBMedia[] };
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

    // Scroll to start of container for a clean switch
    container.scrollTo({ left: 0, behavior: 'smooth' });
    initCarouselDrag();
}

// Exposer au scope global pour les onclick
(window as any).renderCarouselPage = renderCarouselPage;

function renderMovieCard(item: TMDBMedia, forceType: string = 'auto', extra: string = '', extraUrlParams: string = '', loading: 'lazy' | 'eager' = 'lazy') {
    let displayType = item.media_type || forceType;
    
    // Si c'est toujours auto et pas de media_type (cas des endpoints spécifiques type /movie/popular)
    if (displayType === 'auto') {
        displayType = item.title ? 'movie' : 'tv';
    }
 
    // Utilisation de W342 pour les cartes normales (plus léger que W500)
    const poster = item.poster_path ? `${IMAGE_W342_URL}${item.poster_path}` : 'https://via.placeholder.com/500x750?text=No+Image';
    const rating = item.vote_average ? item.vote_average.toFixed(1) : '0.0';
    const badgeText = item.genre_ids?.includes(16) ? 'Animé' : (displayType === 'tv' ? 'Série' : 'Film');
    
    const releaseDate = item.release_date || item.first_air_date;
    const year = releaseDate ? new Date(releaseDate).getFullYear() : '';
    
    return `
        <div class="movie-card" data-id="${item.id}" data-type="${displayType}" data-extra="${extraUrlParams}">
            <div class="card-badge">${badgeText}</div>
            <img src="${poster}" alt="${item.title || item.name}" loading="${loading}">
            <div class="card-overlay">
                <div class="card-rating">★ ${rating}</div>
                <div class="card-info">
                    <h3 class="card-title">${item.title || item.name}</h3>
                    ${year ? `<span class="card-year">${year}</span>` : ''}
                </div>
            </div>
            ${extra}
        </div>
    `;
}

[navItems, bottomNavItems].forEach(collection => {
    collection.forEach(item => {
        // Ajouter le data-type="reprendre" si c'est le bouton reprendre
        if (item.textContent?.trim() === 'Reprendre') {
            item.setAttribute('data-type', 'reprendre');
        }

        item.addEventListener('click', (e) => {
            e.preventDefault();
            const type = item.getAttribute('data-type');
            if (type) handleNavigation(type);
        });
    });
});

// Centralized Event Delegation for Main Content
if (mainContent) {
    mainContent.addEventListener('click', (e) => {
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

const genreFiltersContainer = document.getElementById('genre-filters-container');
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
function initCarouselDrag() {
    const containers = document.querySelectorAll('.carousel-container, .sagas-grid-container');
    
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

        const beginDrag = (e: MouseEvent | TouchEvent) => {
            if ('button' in e && e.button !== 0) return;
            
            isDown = true;
            isDragging = false;
            container.style.cursor = 'grabbing';
            container.style.userSelect = 'none';
            
            const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
            startX = clientX;
            scrollLeft = container.scrollLeft;
            lastX = clientX;
            lastTime = performance.now();
            
            cancelAnimationFrame(rafId);

            // Attacher les écouteurs globaux SEULEMENT pendant le drag pour éviter les fuites de mémoire
            window.addEventListener('mousemove', moveDrag);
            window.addEventListener('mouseup', endDrag);
            window.addEventListener('touchmove', moveDragWrapper, { passive: false });
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
            
            container.scrollLeft = scrollLeft - walk;
            
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
        const [mRes, tRes] = await Promise.all([
            fetch(`${BASE_URL}/genre/movie/list?api_key=${TMDB_API_KEY}&language=fr-FR`),
            fetch(`${BASE_URL}/genre/tv/list?api_key=${TMDB_API_KEY}&language=fr-FR`)
        ]);

        const [mData, tData] = await Promise.all([mRes.json(), tRes.json()]);

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

async function initApp() {
    await fetchGenres();
    
    const urlParams = new URLSearchParams(window.location.search);
    const sagaId = urlParams.get('openSaga');
    
    if (sagaId) {
        // Toujours initialiser le hero en arrière-plan si on commence sur une saga
        fetch(`${BASE_URL}/trending/all/day?api_key=${TMDB_API_KEY}&language=fr-FR`)
            .then(res => res.json())
            .then(data => heroCarouselManager.setSlides(data.results || []));
            
        renderSagaDetailsPage(sagaId);
        // Nettoyer l'URL pour éviter que le paramètre ne reste affiché
        window.history.replaceState({}, document.title, window.location.pathname);
    } else {
        handleNavigation('trending'); 
    }
}

initApp();

// 10. Gestion de la Recherche
let searchTimeout: ReturnType<typeof setTimeout>;

if (searchInput) {
    searchInput.addEventListener('input', (e) => {
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
                initLiveTV();
            } else {
                renderHomeSections(currentType as any);
            }
        }
    });
}

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
                mainContent.appendChild(section);
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


// --- LIVE TV SECTION (Xtream Codes API) ---
let liveTVInitialized = false;
let allLiveChannels: any[] = [];
let liveCategories: any[] = [];
let xtreamConfig = {
    host: localStorage.getItem('xtream_host') || '',
    user: localStorage.getItem('xtream_user') || '',
    pass: localStorage.getItem('xtream_pass') || ''
};

// Global library declarations (Hls.js, mpegts.js)
declare const Hls: any;
declare const mpegts: any;

async function initLiveTV() {
    console.log("[IPTV] Initialisation de l'onglet TV...");
    const liveContent = document.getElementById('live-tv-content');
    const loginForm = document.getElementById('xtream-login');
    const liveGrid = document.getElementById('live-grid');
    const categoriesContainer = document.getElementById('live-categories');
    
    if (!liveContent || !loginForm || !liveGrid || !categoriesContainer) {
        console.error("[IPTV] Éléments DOM manquants pour l'IPTV", { liveContent, loginForm, liveGrid, categoriesContainer });
        return;
    }

    // Si on a déjà des identifiants, on tente de charger
    if (xtreamConfig.host && xtreamConfig.user && xtreamConfig.pass) {
        console.log("[IPTV] Identifiants trouvés, chargement des données...");
        if (navbar) navbar.style.display = 'none'; // Cacher le header global en mode TV active
        loginForm.style.display = 'none';
        liveContent.style.display = 'flex';
        if (!liveTVInitialized) await loadXtreamData();
        else console.log("[IPTV] Données déjà initialisées.");
    } else {
        console.log("[IPTV] Aucun identifiant trouvé, affichage du formulaire de login.");
        if (navbar) {
            navbar.style.display = 'flex'; // Garder le header sur la page de login
            navbar.classList.add('scrolled'); // Force background for visibility
        }
        loginForm.style.display = 'flex';
        liveContent.style.display = 'none';
    }
}

// Listeners pour fermer la TV (Retour aux films)
document.getElementById('close-live-tv-back')?.addEventListener('click', () => {
    document.getElementById('live-tv-content')!.style.display = 'none';
    if (navbar) navbar.style.display = 'flex';
});
document.getElementById('close-live-tv-x')?.addEventListener('click', () => {
    document.getElementById('live-tv-content')!.style.display = 'none';
    handleNavigation('trending');
});
document.getElementById('close-live-tv')?.addEventListener('click', () => {
    document.getElementById('live-tv-content')!.style.display = 'none';
    handleNavigation('trending');
});

// Gestionnaire de Login
document.getElementById('xtream-submit')?.addEventListener('click', async () => {
    const hostInput = document.getElementById('xtream-host') as HTMLInputElement;
    const userInput = document.getElementById('xtream-user') as HTMLInputElement;
    const passInput = document.getElementById('xtream-pass') as HTMLInputElement;
    const errorMsg = document.getElementById('login-error');

    const host = hostInput.value.trim().replace(/\/$/, ""); // Enlever le slash final
    const user = userInput.value.trim();
    const pass = passInput.value.trim();

    if (!host || !user || !pass) return;

    if (errorMsg) errorMsg.style.display = 'none';
    const btn = document.getElementById('xtream-submit');
    if (btn) btn.textContent = "CONNEXION EN COURS...";

    try {
        // Test de connexion via l'API player_api.php
        const rawTestUrl = `${host}/player_api.php?username=${user}&password=${pass}`;
        const proxyVercel = `/api/proxy?url=${encodeURIComponent(rawTestUrl)}`;
        
        let response;
        try {
            response = await fetch(proxyVercel);
            if (!response.ok) throw new Error();
        } catch (e) {
            // SÉCURITÉ : Pas de fallback vers corsproxy.io ou allorigins.win pour les identifiants
            throw new Error("Impossible de contacter le serveur TV sécurisé.");
        }
        
        if (!response || !response.ok) throw new Error(`Impossible de contacter le serveur TV (Status: ${response?.status || 'Unknown'})`);

        console.log("[IPTV] Test de connexion réussi, lecture de la réponse...");
        const text = await response.text();
        let data;
        try {
            data = JSON.parse(text);
        } catch (e) {
            console.error("[IPTV] Erreur parsing JSON:", text);
            throw new Error("Réponse serveur invalide (Pas du JSON).");
        }

        if (data && data.user_info && data.user_info.auth === 1) {
            console.log("[IPTV] Authentification réussie !");
            // Success ! Sauvegarde
            localStorage.setItem('xtream_host', host);
            localStorage.setItem('xtream_user', user);
            localStorage.setItem('xtream_pass', pass);
            xtreamConfig = { host, user, pass };
            
            initLiveTV(); // Recharger l'UI
        } else {
            console.warn("[IPTV] Échec Auth:", data);
            throw new Error("Authentification échouée (Login/Pass incorrect)");
        }
    } catch (err: any) {
        console.error("[IPTV] Erreur lors du Login:", err);
        if (errorMsg) {
            errorMsg.textContent = err.message || "Erreur de connexion";
            errorMsg.style.display = 'block';
        }
    } finally {
        if (btn) btn.textContent = "SE CONNECTER";
    }
});

// Logout Logic
document.getElementById('xtream-logout')?.addEventListener('click', () => {
    if (confirm("Voulez-vous vous déconnecter de la TV ?")) {
        console.log("[IPTV] Déconnexion demandée...");
        localStorage.removeItem('xtream_host');
        localStorage.removeItem('xtream_user');
        localStorage.removeItem('xtream_pass');
        xtreamConfig = { host: '', user: '', pass: '' };
        liveTVInitialized = false;
        allLiveChannels = [];
        liveCategories = [];
        // Clear IndexedDB
        clearXtreamCache();
        initLiveTV(); // Revenir au login
    }
});

// --- PRO CACHING : IndexedDB (Unlimited storage for massive playlists) ---
const DB_NAME = 'XtreamDB';
const DB_VERSION = 1;
const STORE_NAME = 'cache';

async function openDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME);
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function getFromCache(key: string): Promise<any> {
    try {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(STORE_NAME, 'readonly');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.get(key);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    } catch(e) { return null; }
}

async function saveToCache(key: string, value: any): Promise<void> {
    try {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(STORE_NAME, 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.put(value, key);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    } catch(e) { console.warn("[DB] Error saving:", e); }
}

async function clearXtreamCache() {
    try {
        const db = await openDB();
        const transaction = db.transaction(STORE_NAME, 'readwrite');
        transaction.objectStore(STORE_NAME).clear();
    } catch(e){}
}

async function loadXtreamData() {
    console.log("[IPTV] loadXtreamData démarré...");
    const liveGrid = document.getElementById('live-grid');
    const catsContainer = document.getElementById('live-categories');
    const initLoader = document.getElementById('live-init-loader');
    const loaderStatus = document.getElementById('live-loader-status');
    const loaderBar = document.getElementById('live-loader-progress');

    if (!liveGrid || !catsContainer || !initLoader || !loaderBar || !loaderStatus) return;

    // 1. Tenter de charger depuis IndexedDB (Capacité illimitée)
    if (!liveTVInitialized) {
        const cachedCats = await getFromCache('xtream_cats');
        const cachedChannels = await getFromCache('xtream_channels');

        if (cachedCats && cachedChannels) {
            console.log("[IPTV] Chargement depuis IndexedDB...");
            liveCategories = cachedCats;
            allLiveChannels = cachedChannels;
            renderCategories();
            renderLiveTV();
            liveTVInitialized = true;
            loaderStatus.textContent = "Vérification des mises à jour...";
        }
    }

    // 2. Synchronisation en arrière-plan
    if (!liveTVInitialized) {
        initLoader.style.display = 'flex';
        loaderBar.style.width = '10%';
        loaderStatus.textContent = "Authentification serveur...";
    }

    const { host, user, pass } = xtreamConfig;

    try {
        const fetchWithProxy = async (target: string) => {
            // SÉCURITÉ : Uniquement le proxy Vercel pour les identifiants IPTV
            return fetch(`/api/proxy?url=${encodeURIComponent(target)}`);
        };

        // Step 1: Categories
        if (!liveTVInitialized) loaderBar.style.width = '30%';
        const rawCatUrl = `${host}/player_api.php?username=${user}&password=${pass}&action=get_live_categories`;
        let catRes = await fetchWithProxy(rawCatUrl);
        if (!catRes.ok) throw new Error("Serveur indisponible");
        const newCats = await catRes.json();
        
        // Step 2: Streams
        if (!liveTVInitialized) loaderBar.style.width = '60%';
        const rawStreamUrl = `${host}/player_api.php?username=${user}&password=${pass}&action=get_live_streams`;
        let streamRes = await fetchWithProxy(rawStreamUrl);
        if (!streamRes.ok) throw new Error("Erreur flux");
        const newChannels = await streamRes.json();

        // Update Global State
        liveCategories = newCats;
        allLiveChannels = newChannels;

        // Save to IndexedDB (Capacité quasi illimitée)
        await saveToCache('xtream_cats', newCats);
        await saveToCache('xtream_channels', newChannels);

        // Finalize UI
        if (!liveTVInitialized) {
            loaderBar.style.width = '100%';
            loaderStatus.textContent = "Terminé !";
            setTimeout(() => {
                initLoader.style.display = 'none';
                renderCategories();
                renderLiveTV();
                liveTVInitialized = true;
            }, 600);
        } else {
            // Mise à jour silencieuse si déjà chargé depuis le cache
            renderCategories();
            renderLiveTV();
            console.log("[IPTV] Mise à jour du cache terminée.");
        }

    } catch (err: any) {
        console.error("[IPTV] Erreur Sync:", err);
        if (!liveTVInitialized) {
            loaderStatus.textContent = "Erreur de connexion.";
            loaderStatus.classList.add('text-error');
            loaderBar.classList.add('bg-error');
        }
    }
}

function renderCategories() {
    const container = document.getElementById('live-categories');
    if (!container) return;

    const allChannelsCount = allLiveChannels.length;

    // Styles inline directs - pas de dépendance Tailwind
    const applyBase = (el: Element) => {
        const e = el as HTMLElement;
        e.style.cssText = `
            width: 100%;
            padding: 16px 32px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            cursor: pointer;
            border-bottom: 1px solid rgba(255,255,255,0.04);
            border-left: 3px solid transparent;
            background: transparent;
            color: rgba(255,255,255,0.35);
            transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease;
            box-sizing: border-box;
        `;
    };

    const applyActive = (el: Element) => {
        const e = el as HTMLElement;
        e.style.cssText = `
            width: 100%;
            padding: 16px 32px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            cursor: pointer;
            border-bottom: 1px solid rgba(255,255,255,0.04);
            border-left: 3px solid #ef4444;
            background: rgba(239,68,68,0.1);
            color: #ef4444;
            transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease;
            box-sizing: border-box;
        `;
    };

    const html = `
        <div data-id="all">
            <span style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.15em;">All Channels</span>
            <span style="font-size:11px;font-weight:700;opacity:0.6;">${allChannelsCount}</span>
        </div>
        ${liveCategories.map(cat => {
            const count = allLiveChannels.filter(c => c.category_id === cat.category_id).length;
            return `
                <div data-id="${cat.category_id}">
                    <span style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:200px;">${cat.category_name}</span>
                    <span style="font-size:11px;font-weight:700;opacity:0.4;">${count}</span>
                </div>
            `;
        }).join('')}
    `;
    container.innerHTML = html;

    // Appliquer style de base à tous
    container.querySelectorAll('[data-id]').forEach(btn => {
        applyBase(btn);
    });

    // Activer le premier par défaut
    const firstBtn = container.querySelector('[data-id="all"]');
    if (firstBtn) applyActive(firstBtn);

    // Hover effect
    container.querySelectorAll('[data-id]').forEach(btn => {
        btn.addEventListener('mouseenter', () => {
            if (!(btn as HTMLElement).dataset.active) {
                (btn as HTMLElement).style.background = 'rgba(255,255,255,0.04)';
                (btn as HTMLElement).style.color = 'rgba(255,255,255,0.85)';
            }
        });
        btn.addEventListener('mouseleave', () => {
            if (!(btn as HTMLElement).dataset.active) {
                (btn as HTMLElement).style.background = 'transparent';
                (btn as HTMLElement).style.color = 'rgba(255,255,255,0.35)';
            }
        });
    });

    // Clic : sélection avec flash visuel
    container.querySelectorAll('[data-id]').forEach(btn => {
        btn.addEventListener('click', () => {
            stopLiveTV();

            // Retirer l'actif de tous
            container.querySelectorAll('[data-id]').forEach(b => {
                delete (b as HTMLElement).dataset.active;
                applyBase(b);
            });

            // Flash rouge immédiat puis état actif stable
            const el = btn as HTMLElement;
            el.style.background = 'rgba(239,68,68,0.25)';
            el.style.borderLeftColor = '#ef4444';
            el.style.color = '#ffffff';

            setTimeout(() => {
                el.dataset.active = '1';
                applyActive(el);
            }, 150);

            const catId = el.getAttribute('data-id') || 'all';
            renderLiveTV('', catId);
        });
    });
}

function renderLiveTV(filter: string = '', categoryId: string = 'all') {
    const liveGrid = document.getElementById('live-grid');
    if (!liveGrid) return;

    let filtered = allLiveChannels;

    // Filtre par catégorie
    if (categoryId !== 'all') {
        filtered = filtered.filter(c => c.category_id === categoryId);
    }

    // Filtre par recherche
    if (filter) {
        const f = filter.toLowerCase();
        filtered = filtered.filter(c => c.name.toLowerCase().includes(f));
    }

    if (filtered.length === 0) {
        liveGrid.innerHTML = '<div class="md:col-span-12 py-20 text-center text-white/30 font-medium italic">Aucune chaîne trouvée.</div>';
        return;
    }

    // 1. Initial State
    liveGrid.innerHTML = '';
    let renderedCount = 0;
    const batchSize = 24;

    // Create Sentinel for Intersection Observer
    const sentinel = document.createElement('div');
    sentinel.id = 'live-sentinel';
    sentinel.className = "w-full h-10 col-span-full flex items-center justify-center py-10 opacity-0";
    sentinel.innerHTML = '<div class="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>';

    const renderNextBatch = () => {
        if (renderedCount >= filtered.length) {
            sentinel.remove();
            return;
        }

        const nextBatch = filtered.slice(renderedCount, renderedCount + batchSize);
        const fragment = document.createDocumentFragment();

        nextBatch.forEach((c, index) => {
            const streamUrl = `${xtreamConfig.host}/live/${xtreamConfig.user}/${xtreamConfig.pass}/${c.stream_id}.ts`;
            const div = document.createElement('div');
            div.style.cssText = `
                position: relative;
                aspect-ratio: 2/3;
                overflow: hidden;
                cursor: pointer;
                border: 2px solid rgba(255,255,255,0.05);
                background: #111;
                transition: border-color 0.2s ease, box-shadow 0.2s ease, transform 0.2s ease;
                border-radius: 6px;
            `;
            div.style.animationDelay = `${(index % batchSize) * 20}ms`;
            div.className = 'fade-in-progressive live-channel-card';
            div.setAttribute('data-url', streamUrl);
            
            div.innerHTML = `
                <!-- Logo/Poster -->
                <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:#1a1a1a;">
                     <img src="${c.stream_icon || ''}" loading="lazy" style="width:100%;height:100%;object-fit:cover;opacity:0.8;transition:opacity 0.3s,transform 0.5s;" onerror="this.src='https://images.unsplash.com/photo-1594909122845-11baa439b7bf?auto=format&fit=crop&q=80&w=400';"/>
                </div>

                <!-- Overlay Gradient -->
                <div style="position:absolute;inset:0;background:linear-gradient(to top,rgba(0,0,0,0.85) 0%,rgba(0,0,0,0.15) 60%,transparent 100%);transition:opacity 0.3s;"></div>

                <!-- Channel Name -->
                <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;padding:12px 8px;text-align:center;">
                    <h3 style="font-size:11px;font-weight:800;color:#fff;text-transform:uppercase;letter-spacing:-0.02em;line-height:1.3;text-shadow:0 2px 6px rgba(0,0,0,0.9);margin:0;">
                        ${c.name}
                    </h3>
                </div>

                <!-- Play Icon (hover) -->
                <div class="play-icon-overlay" style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;opacity:0;transition:opacity 0.2s;z-index:20;">
                    <div style="width:44px;height:44px;border-radius:50%;background:rgba(239,68,68,0.25);backdrop-filter:blur(8px);border:2px solid rgba(239,68,68,0.6);display:flex;align-items:center;justify-content:center;">
                        <span class="material-symbols-outlined" style="color:#ef4444;font-size:28px;">play_arrow</span>
                    </div>
                </div>
            `;

            // Hover
            div.addEventListener('mouseenter', () => {
                if (!div.dataset.playing) {
                    div.style.borderColor = 'rgba(239,68,68,0.4)';
                    div.style.transform = 'scale(1.03)';
                }
                const overlay = div.querySelector('.play-icon-overlay') as HTMLElement;
                if (overlay) overlay.style.opacity = '1';
            });
            div.addEventListener('mouseleave', () => {
                if (!div.dataset.playing) {
                    div.style.borderColor = 'rgba(255,255,255,0.05)';
                    div.style.transform = 'scale(1)';
                }
                const overlay = div.querySelector('.play-icon-overlay') as HTMLElement;
                if (overlay) overlay.style.opacity = '0';
            });

            div.addEventListener('click', () => {
                const url = div.getAttribute('data-url');
                const name = div.querySelector('h3')?.textContent?.trim() || 'Chaîne';

                // Retirer le contour rouge de toutes les cartes
                document.querySelectorAll('.live-channel-card').forEach(card => {
                    const c = card as HTMLElement;
                    delete c.dataset.playing;
                    c.style.borderColor = 'rgba(255,255,255,0.05)';
                    c.style.boxShadow = 'none';
                    c.style.transform = 'scale(1)';
                });

                // Flash immédiat blanc → rouge persistant
                div.style.borderColor = '#ffffff';
                div.style.boxShadow = '0 0 0 2px rgba(239,68,68,0.6)';
                setTimeout(() => {
                    div.dataset.playing = '1';
                    div.style.borderColor = '#ef4444';
                    div.style.boxShadow = '0 0 20px rgba(239,68,68,0.35), 0 0 0 2px #ef4444';
                    div.style.transform = 'scale(1)';
                }, 120);

                if (url) playLiveChannel(url, name);
            });

            fragment.appendChild(div);
        });

        // Insert before sentinel
        liveGrid.insertBefore(fragment, sentinel);
        renderedCount += batchSize;
        
        // Make sentinel visible briefly to show loader if scroll is at bottom
        sentinel.style.opacity = '0.3';
    };

    // Add sentinel to grid
    liveGrid.appendChild(sentinel);

    // Initial Observer - Nettoyage avant réutilisation
    if (currentIptvObserver) {
        currentIptvObserver.disconnect();
    }

    currentIptvObserver = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting) {
            renderNextBatch();
        }
    }, { rootMargin: '200px' });

    currentIptvObserver.observe(sentinel);
}

// Logic for playing a live channel

function playLiveChannel(url: string, name: string) {
    const playerContainer = document.getElementById('live-player-container');
    const video = document.getElementById('live-video') as HTMLVideoElement;
    const nameLabel = document.getElementById('current-channel-name');
    const errorOverlay = document.getElementById('player-error');

    if (!playerContainer || !video || !nameLabel || !errorOverlay) return;

    playerContainer.style.display = 'block';
    nameLabel.textContent = name;
    errorOverlay.style.display = 'none';
    const msg = errorOverlay.querySelector('p');
    
    // Smooth scroll
    window.scrollTo({ top: playerContainer.offsetTop - 100, behavior: 'smooth' });

    // Anti-flood: On attend un court instant pour laisser le serveur fermer la connexion précédente
    if ((window as any).isSwitching) return;
    (window as any).isSwitching = true;

    const stopExisting = () => {
        if ((window as any).hls) {
            try { (window as any).hls.destroy(); } catch(e){}
            delete (window as any).hls;
        }
        if ((window as any).mpegtsPlayer) {
            try {
                const p = (window as any).mpegtsPlayer;
                p.pause();
                p.unload();
                p.detachMediaElement();
                p.destroy();
            } catch(e){}
            delete (window as any).mpegtsPlayer;
        }
        video.pause();
        video.src = "";
        video.load();
    };

    stopExisting();

    setTimeout(() => {
        (window as any).isSwitching = false;
        startStreamLoad();
    }, 650);

    function startStreamLoad() {
    const getProxyUrl = (targetUrl: string, type: 'vercel') => {
        const encoded = encodeURIComponent(targetUrl);
        const isHttps = window.location.protocol === 'https:';
        if (!isHttps && type === 'vercel') return targetUrl;
        return `/api/proxy?url=${encoded}`;
    };

    let currentProxyType: 'vercel' = 'vercel';
    let streamUrl = getProxyUrl(url, currentProxyType);

    const tryNextProxy = () => {
        // Suppression des proxys publics pour la sécurité des identifiants
        return false;
    };

    console.log(`Lecture via ${currentProxyType}: ${streamUrl}`);

    errorOverlay!.style.display = 'flex';
    if (msg) msg.textContent = "Connexion au flux...";
    errorOverlay!.querySelector('span')!.textContent = "⏳";

    if (url.includes('.m3u8')) {
        const loadHls = (target: string) => {
            if (Hls.isSupported()) {
                const hls = new Hls({ 
                    debug: false, 
                    manifestLoadingMaxRetry: 3,
                    manifestLoadingRetryDelay: 1000,
                    enableWorker: true,
                    capLevelToPlayerSize: true, // Empêche le téléchargement 4K sur petit écran
                    maxBufferLength: 30, // Limite le préchargement à 30 secondes pour sauver la RAM
                    maxMaxBufferLength: 60, // Limite absolue
                    maxBufferSize: 60 * 1000 * 1000 // Limite la RAM utilisée par la vidéo à 60 MB
                });
                (window as any).hls = hls;
                hls.loadSource(target);
                hls.attachMedia(video);
                hls.on(Hls.Events.MANIFEST_PARSED, () => {
                    errorOverlay!.style.display = 'none';
                    video.play().catch(() => {});
                });
                hls.on(Hls.Events.ERROR, (_event: any, data: any) => {
                    if (data.fatal) {
                        console.warn("HLS Fatal Error:", data.type);
                        if (tryNextProxy()) {
                            hls.destroy();
                            delete (window as any).hls;
                            loadHls(streamUrl);
                        } else {
                            if (msg) msg.textContent = "Flux indisponible (Erreur HLS).";
                            errorOverlay!.querySelector('span')!.textContent = "❌";
                        }
                    }
                });
            } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
                video.src = target;
                video.play().catch(() => {});
            }
        };
        loadHls(streamUrl);
    } else {
        const loadTs = (target: string) => {
            if (mpegts.getFeatureList().mseLivePlayback) {
                const player = mpegts.createPlayer({ 
                    type: 'mse', 
                    isLive: true, 
                    url: target,
                    cors: true
                });
                (window as any).mpegtsPlayer = player;
                player.attachMediaElement(video);
                
                try {
                    player.load();
                    player.play().catch((e: any) => console.warn("MPEGTS Play catch:", e));
                } catch (e) {
                    console.error("MPEGTS Load error:", e);
                }

                player.on(mpegts.Events.ERROR, (type: any, detail: any, info: any) => {
                    console.error("MPEGTS Error Event:", type, detail, info);
                    
                    const statusCode = info?.code || 0;
                    const isAuthError = statusCode === 401 || statusCode === 403;

                    const currentPlayer = (window as any).mpegtsPlayer;
                    if (currentPlayer) {
                        // FIX: On ne peut pas appeler off() sans la fonction d'origine
                        // On utilise destroy() directement qui nettoie tout
                        
                        if (tryNextProxy()) {
                            try { currentPlayer.pause(); currentPlayer.unload(); currentPlayer.detachMediaElement(); currentPlayer.destroy(); } catch(e) {}
                            delete (window as any).mpegtsPlayer;
                            setTimeout(() => loadTs(streamUrl), 500);
                        } else if (url.endsWith('.ts')) {
                            try { currentPlayer.pause(); currentPlayer.unload(); currentPlayer.detachMediaElement(); currentPlayer.destroy(); } catch(e) {}
                            delete (window as any).mpegtsPlayer;
                            playLiveChannel(url.replace('.ts', '.m3u8'), name);
                        } else {
                            if (msg) msg.textContent = isAuthError ? "Accès refusé (401/403)." : "Erreur de lecture.";
                            errorOverlay!.querySelector('span')!.textContent = "❌";
                        }
                    }
                });

                video.onplaying = () => { 
                    errorOverlay!.style.display = 'none';
                };
            } else {
                video.src = target;
                video.play().catch(() => {});
            }
        };
        loadTs(streamUrl);
    }
}
}

// Search event synchronized with current active category
document.getElementById('live-search')?.addEventListener('input', (e) => {
    const val = (e.target as HTMLInputElement).value;
    const activeCat = document.querySelector('#live-categories [data-id].active')?.getAttribute('data-id') || 'all';
    renderLiveTV(val, activeCat);
});

export function stopLiveTV() {
    const playerContainer = document.getElementById('live-player-container');
    const video = document.getElementById('live-video') as HTMLVideoElement;
    
    if ((window as any).hls) {
        try { (window as any).hls.destroy(); } catch(e){}
        delete (window as any).hls;
    }

    if ((window as any).mpegtsPlayer) {
        try {
            const p = (window as any).mpegtsPlayer;
            p.pause();
            p.unload();
            p.detachMediaElement();
            p.destroy();
        } catch(e){}
        delete (window as any).mpegtsPlayer;
    }

    if (playerContainer) playerContainer.style.display = 'none';
    if (video) {
        video.pause();
        video.src = "";
        video.load();
    }
}

document.getElementById('close-player')?.addEventListener('click', () => {
    stopLiveTV();
});

document.getElementById('close-live-tv')?.addEventListener('click', () => {
    handleNavigation('trending');
});

// --- Sagas System ---
// Variables pour la pagination des sagas
let sagasPageSize = 12;
let sagasVisibleCount = 12;

async function renderSagasPage() {
    if (!mainContent) return;
    
    // Titre de la page avec conteneur de grille
    mainContent.innerHTML = `
        <section class="popular">
            <h2 class="section-title" style="margin-bottom: 30px;">
                <span class="material-symbols-outlined">auto_awesome</span>
                Sagas Incontournables
            </h2>
            <div class="sagas-grid" id="sagas-grid">
                <!-- Les sagas seront injectées ici par updateSagasGrid() -->
            </div>
            <div id="load-more-sagas-container" style="text-align: center; padding: 40px; display: none;">
                <button class="nav-item" style="background: rgba(239, 68, 68, 0.1); border: 1px solid #ef4444; color: #fff; padding: 12px 30px; border-radius: 50px; cursor: pointer; font-weight: 700; text-transform: uppercase; letter-spacing: 2px; transition: all 0.3s ease;">
                    Voir plus de sagas
                </button>
            </div>
        </section>
    `;
    
    const loadMoreBtn = document.querySelector('#load-more-sagas-container button');
    loadMoreBtn?.addEventListener('click', () => {
        sagasVisibleCount += sagasPageSize;
        updateSagasGrid();
    });

    sagasVisibleCount = sagasPageSize;
    updateSagasGrid();
}

function updateSagasGrid() {
    const grid = document.getElementById('sagas-grid');
    const loadMoreContainer = document.getElementById('load-more-sagas-container');
    if (!grid) return;
    
    const visibleSagas = SAGAS_DATA.slice(0, sagasVisibleCount);
    grid.innerHTML = visibleSagas.map(saga => `
        <div class="saga-card" data-id="${saga.id}">
            <img src="${saga.poster}" alt="${saga.title}" loading="lazy">
            <div class="saga-card-overlay">
                <h3>${saga.title}</h3>
                <p>${saga.items.length} Films</p>
            </div>
        </div>
    `).join('');
    
    if (loadMoreContainer) {
        loadMoreContainer.style.display = sagasVisibleCount < SAGAS_DATA.length ? 'block' : 'none';
    }
}

async function renderSagaDetailsPage(sagaId: string) {
    const saga = SAGAS_DATA.find(s => s.id === sagaId);
    if (!saga || !mainContent) return;

    // Masquer le hero carousel et la recherche
    if (heroSection) heroSection.style.display = 'none';
    toggleSearchVisibility(false);
    mainContent.classList.add('no-hero');
    window.scrollTo({ top: 0, behavior: 'smooth' });

    mainContent.innerHTML = `
        <div class="saga-details-hero" style="background-image: url('${saga.backdrop}')">
            <div class="saga-details-content">
                <button class="back-btn-saga" data-nav="sagas">
                    <span class="material-symbols-outlined">arrow_back</span> Retour aux Sagas
                </button>
                <div class="saga-header-flex">
                    <img src="${saga.poster}" class="saga-mini-poster" />
                    <div class="saga-header-text">
                        <h1>${saga.title}</h1>
                        <p class="saga-desc">${saga.description}</p>
                        <div class="saga-stats">
                            <span class="tag">${saga.items.length} Films</span>
                            <span class="tag">Collection Complète</span>
                        </div>
                    </div>
                    <div class="saga-global-stats">
                        <div class="stat-box">
                            <span class="stat-value" id="total-duration">--</span>
                            <span class="stat-label">Durée Totale</span>
                        </div>
                        <div class="stat-box">
                            <span class="stat-value" id="avg-rating">--</span>
                            <span class="stat-label">Note Moyenne</span>
                        </div>
                        <div class="stat-box">
                            <span class="stat-value" id="total-budget">--</span>
                            <span class="stat-label">Budget</span>
                        </div>
                        <div class="stat-box">
                            <span class="stat-value" id="total-revenue">--</span>
                            <span class="stat-label">Recettes</span>
                        </div>
                        <div class="stat-box">
                            <span class="stat-value" id="saga-years">--</span>
                            <span class="stat-label">Période</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
        <section class="popular">
            <h2 class="section-title">Les films de la collection</h2>
            <div class="carousel-container" id="saga-movies-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 20px; padding: 20px; overflow: visible;">
                <div class="loading-shimmer" style="height: 250px; width: 100%; border-radius: 16px;"></div>
                <div class="loading-shimmer" style="height: 250px; width: 100%; border-radius: 16px;"></div>
                <div class="loading-shimmer" style="height: 250px; width: 100%; border-radius: 16px;"></div>
            </div>
        </section>
    `;

    const grid = document.getElementById('saga-movies-grid');
    if (!grid) return;

    // Charger les films par lots de 5 pour éviter le Rate Limiting (DDoS TMDB)
    const movies: TMDBMedia[] = [];
    const chunkSize = 5;
    
    for (let i = 0; i < saga.items.length; i += chunkSize) {
        const chunk = saga.items.slice(i, i + chunkSize);
        const chunkPromises = chunk.map(async (title: string) => {
            try {
                if (title.startsWith('id:')) {
                    const movieId = title.split(':')[1];
                    if (GLOBAL_BLACKLIST_IDS.includes(movieId)) return null;
                    const detailRes = await fetch(`${BASE_URL}/movie/${movieId}?api_key=${TMDB_API_KEY}&language=fr-FR`);
                    const data = await detailRes.json();
                    data.media_type = 'movie';
                    return data;
                }
                if (title.startsWith('tv:')) {
                    const tvId = title.split(':')[1];
                    if (GLOBAL_BLACKLIST_IDS.includes(tvId)) return null;
                    const detailRes = await fetch(`${BASE_URL}/tv/${tvId}?api_key=${TMDB_API_KEY}&language=fr-FR`);
                    const data = await detailRes.json();
                    data.media_type = 'tv';
                    return data;
                }
                const searchRes = await fetch(`${BASE_URL}/search/movie?api_key=${TMDB_API_KEY}&language=fr-FR&query=${encodeURIComponent(title)}&page=1`);
                const searchData = await searchRes.json();
                if (searchData.results && searchData.results.length > 0) {
                    const movie = searchData.results[0];
                    const detailRes = await fetch(`${BASE_URL}/movie/${movie.id}?api_key=${TMDB_API_KEY}&language=fr-FR`);
                    const data = await detailRes.json();
                    return data;
                }
                return null;
            } catch (e) { return null; }
        });
        
        const results = await Promise.all(chunkPromises);
        results.forEach(m => {
            if (m && m.id) movies.push(m);
        });
        
        // Petit délai entre les lots si nécessaire (throttle)
        if (i + chunkSize < saga.items.length) {
            await new Promise(r => setTimeout(r, 100));
        }
    }
    
    // Si pas de résultats
    if (movies.length === 0) {
        grid.innerHTML = '<p style="padding: 20px; color: #aaa;">Aucun contenu disponible pour cette saga.</p>';
        return;
    }

    grid.innerHTML = movies.map((m, index) => {
        const loadingMode = index < 4 ? 'eager' : 'lazy';
        return renderMovieCard(m, 'movie', '', `&fromSaga=${saga.id}`, loadingMode);
    }).join('');

    // Calculer les statistiques globales
    let totalMinutes = 0;
    let totalRating = 0;
    let totalBudget = 0;
    let totalRevenue = 0;
    let years: number[] = [];

    movies.forEach(m => {
        if (m.runtime) totalMinutes += m.runtime;
        if (m.vote_average) totalRating += m.vote_average;
        if (m.budget) totalBudget += m.budget;
        if (m.revenue) totalRevenue += m.revenue;
        const releaseDate = m.release_date || m.first_air_date;
        if (releaseDate) years.push(new Date(releaseDate).getFullYear());
    });

    const durationEl = document.getElementById('total-duration');
    const ratingEl = document.getElementById('avg-rating');
    const budgetEl = document.getElementById('total-budget');
    const revenueEl = document.getElementById('total-revenue');
    const yearsEl = document.getElementById('saga-years');

    const formatCurrency = (amount: number) => {
        const euroAmount = amount * 0.93; // Conversion approx USD to EUR
        if (euroAmount >= 1e9) return `${(euroAmount / 1e9).toFixed(1)} Md €`;
        if (euroAmount >= 1e6) return `${(euroAmount / 1e6).toFixed(0)} M €`;
        return `${Math.round(euroAmount).toLocaleString()} €`;
    };

    if (durationEl) {
        const hours = Math.floor(totalMinutes / 60);
        const mins = totalMinutes % 60;
        durationEl.textContent = `${hours}h ${mins}m`;
    }
    if (ratingEl) {
        const avg = movies.length > 0 ? (totalRating / movies.length).toFixed(1) : '0.0';
        ratingEl.textContent = `${avg}/10`;
    }
    if (budgetEl) budgetEl.textContent = formatCurrency(totalBudget);
    if (revenueEl) revenueEl.textContent = formatCurrency(totalRevenue);
    
    if (yearsEl && years.length > 0) {
        const minYear = Math.min(...years);
        const maxYear = Math.max(...years);
        yearsEl.textContent = minYear === maxYear ? `${minYear}` : `${minYear}-${maxYear}`;
    }
}

// Exposer au global
(window as any).renderSagasPage = renderSagasPage;
(window as any).renderSagaDetailsPage = renderSagaDetailsPage;

// Fonction utilitaire pour sélectionner un genre (utilisée par les tuiles du menu mobile)
function selectGenre(id: number, type: string) {
    activeGenreId = id;
    toggleMobileMenu(); // Ferme le menu
    renderGenres(type as any);
    renderHomeSections(type as any, id);
}
(window as any).selectGenre = selectGenre;

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
}
(window as any).toggleMobileMenu = toggleMobileMenu;

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


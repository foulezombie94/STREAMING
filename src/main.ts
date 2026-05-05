import './style.css';
import './antiblocker';
import { ProgressManager } from './storage';

// 1. Constantes TMDB
const TMDB_API_KEY = 'e1a2bb6a3ed288feb5d767908732e751';
const BASE_URL = 'https://api.themoviedb.org/3';
const IMAGE_BASE_URL = 'https://image.tmdb.org/t/p/original';
const IMAGE_W500_URL = 'https://image.tmdb.org/t/p/w500';

// 2. Éléments du DOM
let currentData: any[] = []; // Stocke les données actuelles
let activeId: number | null = null; // ID du film actuellement mis en avant
let currentType: 'movie' | 'tv' | 'trending' | 'reprendre' | 'iptv' = 'trending';

// Genre globals
let movieGenres: any[] = [];
let tvGenres: any[] = [];
let activeGenreId: number | null = null;

// Éléments du DOM
const navbar = document.getElementById('navbar');
const carousel = document.getElementById('carousel') as HTMLElement | null;
const heroSection = document.getElementById('hero-section');
const heroTitle = document.getElementById('hero-title');
const heroMeta = document.getElementById('hero-meta');
const heroTagline = document.getElementById('hero-tagline');
const heroSynopsis = document.getElementById('hero-synopsis');
const heroContent = document.querySelector('.hero-content');
const navItems = document.querySelectorAll('.nav-item');
const sectionTitle = document.querySelector('.section-title');
const searchInput = document.getElementById('search-input') as HTMLInputElement | null;
const popularSection = document.getElementById('popular-section');
const iptvSection = document.getElementById('iptv-section');

const watchBtn = document.getElementById('watch-btn');
const seeMoreBtn = document.getElementById('see-more-btn');

// Stockage global
let activeMediaType: 'movie' | 'tv' = 'movie';

// Gestion des clics sur les boutons Hero
function redirectToDetails() {
    if (activeId) {
        window.location.href = `/details.html?id=${activeId}&type=${activeMediaType}`;
    }
}
if (watchBtn) watchBtn.addEventListener('click', redirectToDetails);
if (seeMoreBtn) seeMoreBtn.addEventListener('click', redirectToDetails);

// 3. Gestion de la Navbar (Effet Glassmorphism au scroll)
window.addEventListener('scroll', () => {
    if (window.scrollY > 50) {
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

// 4. Gestion de la Navigation (Top & Bottom)
const bottomNavItems = document.querySelectorAll('.bottom-nav-item');

function handleNavigation(type: any) {
    [navItems, bottomNavItems].forEach(collection => {
        collection.forEach(i => {
            if (i.getAttribute('data-type') === type) i.classList.add('active');
            else i.classList.remove('active');
        });
    });

    currentType = type as any;
    activeGenreId = null; 

    // FERME LE LECTEUR LIVE SI ON QUITTE IPTV
    if (currentType !== 'iptv') {
        stopLiveTV();
        const liveContent = document.getElementById('live-tv-content');
        const loginForm = document.getElementById('xtream-login');
        if (liveContent) liveContent.style.display = 'none';
        if (loginForm) loginForm.style.display = 'none';
    }

    // Gestion de la visibilité des sections
    if (heroSection) heroSection.style.display = (currentType === 'iptv') ? 'none' : 'block';
    if (popularSection) popularSection.style.display = (currentType === 'iptv') ? 'none' : 'block';
    if (iptvSection) iptvSection.style.display = (currentType === 'iptv') ? 'block' : 'none';

    if (sectionTitle) {
        if (currentType === 'trending') sectionTitle.textContent = 'Tendances Actuelles';
        else if (currentType === 'tv') sectionTitle.textContent = 'Séries Populaires';
        else if (currentType === 'reprendre') sectionTitle.textContent = 'Reprendre la lecture';
        else if (currentType === 'iptv') sectionTitle.textContent = 'Télévision Direct';
        else sectionTitle.textContent = 'Films Populaires';
    }

    if (currentType === 'iptv') {
        if (genreFiltersContainer) genreFiltersContainer.style.display = 'none';
        initLiveTV();
    } else if (currentType === 'reprendre') {
        renderResumePage();
    } else {
        renderGenres(currentType as any);
        fetchPopularData(currentType as any);
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
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

const genreFiltersContainer = document.getElementById('genre-filters-container');
const desktopGenres = document.getElementById('desktop-genres');
const mobileFilterBtn = document.getElementById('mobile-filter-btn');
const mobileGenreOverlay = document.getElementById('mobile-genre-overlay');
const mobileGenreGrid = document.getElementById('mobile-genre-grid');
const closeGenreOverlay = document.getElementById('close-genre-overlay');

// Event listeners pour le mobile et PC (Overlay)
mobileFilterBtn?.addEventListener('click', () => {
    // On n'appelle renderGenres que si c'est nécessaire (si vide ou changement de type)
    // Mais ici on le fait pour s'assurer que l'UI reflète l'état actuel (activeGenreId)
    renderGenres(currentType);
    
    mobileGenreOverlay?.classList.add('active');
    document.body.style.overflow = 'hidden'; // Bloquer le scroll
});

closeGenreOverlay?.addEventListener('click', () => {
    mobileGenreOverlay?.classList.remove('active');
    document.body.style.overflow = '';
});

mobileGenreOverlay?.addEventListener('click', (e) => {
    if (e.target === mobileGenreOverlay) closeGenreOverlay?.click();
});

function renderGenres(type: 'movie' | 'tv' | 'trending' | 'reprendre' | 'iptv') {
    if (!genreFiltersContainer) return;
    
    if (type === 'trending' || type === 'reprendre' || type === 'iptv') {
        genreFiltersContainer.style.display = 'none';
        return;
    }
    
    genreFiltersContainer.style.display = 'flex';
    const genres = type === 'movie' ? movieGenres : tvGenres;
    
    // Rendre pour Desktop (si le conteneur est affiché)
    if (desktopGenres && desktopGenres.style.display !== 'none') {
        if (genres.length === 0) {
            desktopGenres.innerHTML = `<div class="genre-label">Chargement...</div>`;
        } else {
            desktopGenres.innerHTML = `
                <div class="genre-label">${type === 'movie' ? 'Genres Films' : 'Genres Séries'}</div>
                <button class="genre-btn ${activeGenreId === null ? 'active' : ''}" data-id="all">Tous</button>
                ${genres.map(g => `<button class="genre-btn ${activeGenreId === g.id ? 'active' : ''}" data-id="${g.id}">${g.name}</button>`).join('')}
            `;

            desktopGenres.querySelectorAll('.genre-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    const idStr = btn.getAttribute('data-id');
                    activeGenreId = idStr === 'all' ? null : parseInt(idStr!);
                    renderGenres(type);
                    heroContent?.classList.add('animating');
                    if (carousel) carousel.style.opacity = '0.5';
                    fetchPopularData(type, activeGenreId);
                });
            });
        }
    }

    // Rendre pour l'Overlay (Mobile & PC)
    if (mobileGenreGrid) {
        if (genres.length === 0) {
            mobileGenreGrid.innerHTML = `<div style="grid-column: 1/-1; text-align: center; color: #ef4444; padding: 40px; font-weight: bold;">Chargement des catégories...</div>`;
        } else {
            mobileGenreGrid.innerHTML = `
                <div class="mobile-genre-item ${activeGenreId === null ? 'active' : ''}" data-id="all">Tous</div>
                ${genres.map(g => `<div class="mobile-genre-item ${activeGenreId === g.id ? 'active' : ''}" data-id="${g.id}">${g.name}</div>`).join('')}
            `;
            
            mobileGenreGrid.querySelectorAll('.mobile-genre-item').forEach(item => {
                item.addEventListener('click', () => {
                    const idStr = item.getAttribute('data-id');
                    activeGenreId = idStr === 'all' ? null : parseInt(idStr!);
                    
                    closeGenreOverlay?.click();
                    renderGenres(type);
                    
                    heroContent?.classList.add('animating');
                    if (carousel) carousel.style.opacity = '0.5';
                    fetchPopularData(type, activeGenreId);
                });
            });
        }
    }
}

// 5. Gestion Drag Carrousel fluide
// 5. Gestion Drag Carrousel ultra-fluide (Inertie + Correction Jitter)
if (carousel) {
    let isDown = false;
    let startX: number;
    let scrollLeft: number;
    let velocity = 0;
    let rafId: number;
    let lastX: number;
    let lastTime: number;
    let isDragging = false;

    const beginDrag = (e: MouseEvent | TouchEvent) => {
        // Uniquement clic gauche pour éviter les conflits avec le clic droit
        if ('button' in e && e.button !== 0) return;
        
        isDown = true;
        isDragging = false;
        carousel.style.cursor = 'grabbing';
        
        const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
        startX = clientX;
        scrollLeft = carousel.scrollLeft;
        lastX = clientX;
        lastTime = performance.now();
        
        cancelAnimationFrame(rafId);
    };

    const endDrag = () => {
        if (!isDown) return;
        isDown = false;
        carousel.style.cursor = 'grab';
        
        // Appliquer un effet d'inertie fluide
        const step = () => {
            if (Math.abs(velocity) > 0.2) {
                carousel.scrollLeft -= velocity;
                velocity *= 0.95; // Friction constante
                rafId = requestAnimationFrame(step);
            }
        };
        rafId = requestAnimationFrame(step);
        
        // Petit délai pour valider la fin du drag
        setTimeout(() => isDragging = false, 50);
    };

    const moveDrag = (e: MouseEvent | TouchEvent) => {
        if (!isDown) return;
        
        const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
        const walk = (clientX - startX); 
        
        // Détecter si c'est vraiment un mouvement significatif
        if (Math.abs(walk) > 3) isDragging = true;
        
        const currentTime = performance.now();
        const deltaTime = currentTime - lastTime;
        
        if (deltaTime > 0) {
            // Calcul de la vélocité avec lissage
            const instantVelocity = (clientX - lastX) / deltaTime * 16;
            velocity = velocity * 0.2 + instantVelocity * 0.8;
        }
        
        // Mise à jour immédiate de la position
        carousel.scrollLeft = scrollLeft - walk;
        
        lastX = clientX;
        lastTime = currentTime;
    };

    carousel.addEventListener('mousedown', beginDrag);
    window.addEventListener('mousemove', moveDrag);
    window.addEventListener('mouseup', endDrag);
    
    // Support Touch
    carousel.addEventListener('touchstart', beginDrag, { passive: true });
    carousel.addEventListener('touchmove', moveDrag, { passive: true });
    carousel.addEventListener('touchend', endDrag);
    
    // Empêcher le clic si on était en train de dragger
    carousel.addEventListener('click', (e) => {
        if (isDragging) {
            e.stopImmediatePropagation();
            e.preventDefault();
        }
    }, true);

    carousel.style.transition = 'opacity 0.3s ease';
}

// 6. Fetch Data (Films, Séries ou Trending)
async function fetchPopularData(type: 'movie' | 'tv' | 'trending' | 'iptv', genreId: number | null = null) {
    try {
        let endpoint = '';
        let queryParams = `api_key=${TMDB_API_KEY}&language=fr-FR&page=1`;

        if (genreId !== null && type !== 'trending') {
            endpoint = `discover/${type}`;
            queryParams += `&with_genres=${genreId}&sort_by=popularity.desc`;
        } else {
            if (type === 'trending') {
                endpoint = 'trending/all/week';
            } else if (type === 'tv') {
                endpoint = 'tv/popular';
            } else {
                endpoint = 'movie/popular';
            }
        }

        const cacheKey = `cache_${endpoint}_${genreId || 'all'}`;
        const cachedData = sessionStorage.getItem(cacheKey);

        if (cachedData) {
            const parsedData = JSON.parse(cachedData);
            processData(parsedData);
            return;
        }

        const response = await fetch(`${BASE_URL}/${endpoint}?${queryParams}`);
        const data = await response.json();
        
        if (data.results && data.results.length > 0) {
            sessionStorage.setItem(cacheKey, JSON.stringify(data.results));
            processData(data.results);
        }
    } catch (error) {
        console.error('Erreur:', error);
        if (heroTitle) heroTitle.textContent = "Erreur de connexion";
    }
}

function processData(results: any[]) {
    currentData = results;
    
    // Remettre le carrousel opaque
    if (carousel) carousel.style.opacity = '1';

    // Forcer le rechargement de l'ID actif
    activeId = null;

    // Initialiser avec le premier élément
    const heroItem = currentData[0];
    updateHeroSection(heroItem, true);

    // Remplir le carrousel
    populateCarousel(currentData);
}

// 7. Mise à jour fluide de la section Héros
function updateHeroSection(item: any, isInitialLoad = false) {
    if (activeId === item.id) return;
    activeId = item.id;

    const applyUpdate = () => {
        let displayType = currentType;
        if (currentType === 'trending' || currentType === 'reprendre') {
            displayType = item.media_type; // L'API trending et notre stockage Reprendre utilisent media_type
        }
        activeMediaType = displayType as 'movie' | 'tv';

        // TMDB: les films ont 'title', les séries ont 'name'
        const title = displayType === 'tv' ? item.name : item.title;
        const releaseDate = displayType === 'tv' ? item.first_air_date : item.release_date;
        const releaseYear = releaseDate ? new Date(releaseDate).getFullYear() : 'N/A';
        const rating = item.vote_average ? item.vote_average.toFixed(1) : 'N/A';
        const mediaLabel = displayType === 'tv' ? 'TV Show' : 'Movie';

        if (heroTitle) heroTitle.textContent = title;
        if (heroTagline) heroTagline.textContent = item.tagline ? `"${item.tagline}"` : '';
        if (heroSynopsis) heroSynopsis.textContent = item.overview || "Aucun synopsis disponible.";
        
        if (heroMeta) {
            heroMeta.innerHTML = `<span class="rating">★ ${rating}/10</span> <span>&bull; ${releaseYear}</span> <span>&bull; ${mediaLabel}</span>`;
        }

        if (heroSection) {
            const backdropUrl = item.backdrop_path 
                ? `${IMAGE_BASE_URL}${item.backdrop_path}`
                : ''; 
            
            heroSection.style.backgroundImage = backdropUrl ? `url('${backdropUrl}')` : 'none';
        }

        // On enlève la classe d'animation pour relancer le fondu
        heroContent?.classList.remove('animating');
    };

    if (isInitialLoad) {
        applyUpdate();
    } else {
        heroContent?.classList.add('animating');
        setTimeout(applyUpdate, 400);
    }
}

// 8. Remplissage Carrousel interactif
function populateCarousel(items: any[]) {
    if (!carousel) return;
    
    // Remise à zéro fluide
    carousel.innerHTML = ''; 
    carousel.scrollLeft = 0;

    items.forEach((item, index) => {
        if (!item.poster_path) return;

        const card = document.createElement('div');
        card.className = `movie-card ${index === 0 ? 'active' : ''}`;
        card.dataset.id = item.id;

        let displayType = currentType;
        if (currentType === 'trending' || currentType === 'reprendre') {
            displayType = item.media_type;
        }
        const title = displayType === 'tv' ? item.name : item.title;
        
        const img = document.createElement('img');
        img.src = `${IMAGE_W500_URL}${item.poster_path}`;
        img.alt = title;
        img.loading = 'lazy';
        img.draggable = false; 

        card.appendChild(img);

        // Gestion du clic & double-clic (Mobile & Desktop)
        let lastClick = 0;
        card.addEventListener('click', () => {
            const now = Date.now();
            const delay = now - lastClick;
            
            if (delay < 350 && delay > 0) {
                // Double clic / Double tap
                let displayType = (currentType === 'trending' || currentType === 'reprendre') ? item.media_type : currentType;
                window.location.href = `/details.html?id=${item.id}&type=${displayType}`;
            } else {
                // Simple clic
                document.querySelectorAll('.movie-card').forEach(c => c.classList.remove('active'));
                card.classList.add('active');
                updateHeroSection(item);
            }
            lastClick = now;
        });

        carousel.appendChild(card);
    });
}

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
    handleNavigation('trending'); // Utiliser handleNavigation pour initialiser correctement l'UI
    setupHeroButtons();
}

function setupHeroButtons() {
    const watchBtn = document.getElementById('watch-btn');
    const seeMoreBtn = document.getElementById('see-more-btn');

    const handleAction = () => {
        if (!currentData || currentData.length === 0) return;
        const currentItem = currentData.find(i => i.id === activeId) || currentData[0];
        const displayType = (currentType === 'trending' || currentType === 'reprendre') ? currentItem.media_type : currentType;
        window.location.href = `/details.html?id=${currentItem.id}&type=${displayType}`;
    };

    watchBtn?.addEventListener('click', handleAction);
    seeMoreBtn?.addEventListener('click', handleAction);
}

initApp();

// 10. Gestion de la Recherche
let searchTimeout: any;

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
                fetchPopularData(currentType);
            }
        }
    });
}

async function performSearch(query: string) {
    try {
        // Mettre un effet de chargement visuel
        heroContent?.classList.add('animating');
        if (carousel) carousel.style.opacity = '0.5';

        const response = await fetch(`${BASE_URL}/search/multi?api_key=${TMDB_API_KEY}&language=fr-FR&query=${encodeURIComponent(query)}&page=1`);
        const data = await response.json();
        
        // On filtre pour ne garder que les films/séries (pas les acteurs) et ceux qui ont une affiche
        const filteredResults = data.results.filter((item: any) => 
            (item.media_type === 'movie' || item.media_type === 'tv') && item.poster_path
        );

        if (filteredResults.length > 0) {
            currentData = filteredResults;
            
            if (sectionTitle) sectionTitle.textContent = `Résultats pour "${query}"`;
            
            if (carousel) carousel.style.opacity = '1';
            activeId = null; // forcer la mise à jour visuelle du héro

            const heroItem = currentData[0];
            updateHeroSection(heroItem, false);
            populateCarousel(currentData);
        } else {
            // Si aucun résultat
            if (heroTitle) heroTitle.textContent = "Aucun résultat trouvé";
            if (heroSynopsis) heroSynopsis.textContent = `Nous n'avons rien trouvé pour la recherche "${query}".`;
            if (heroMeta) heroMeta.innerHTML = `<span>&bull; Désolé</span>`;
            if (heroSection) heroSection.style.backgroundImage = 'none';
            if (carousel) carousel.innerHTML = '';
            
            heroContent?.classList.remove('animating');
            if (carousel) carousel.style.opacity = '1';
        }
    } catch (error) {
        console.error('Erreur recherche:', error);
    }
}

// 11. Fonction pour la page "Reprendre"
function renderResumePage() {
    if (genreFiltersContainer) genreFiltersContainer.style.display = 'none';
    if (carousel) carousel.style.opacity = '0.5';

    const history = ProgressManager.getHistory();
    
    // Transformer l'historique en format TMDB-like pour réutiliser populateCarousel
    const items = history.map(h => ({
        id: h.mediaId,
        media_type: h.mediaType,
        poster_path: h.poster,
        backdrop_path: h.backdrop,
        title: h.title,
        name: h.title, // Pour les séries
        overview: h.overview,
        vote_average: h.rating,
        release_date: h.year,
        first_air_date: h.year,
        tagline: h.tagline,
        season: h.season,
        episode: h.episode,
        time: h.time,
        duration: h.duration
    }));

    if (items.length > 0) {
        currentData = items;
        if (carousel) carousel.style.opacity = '1';
        activeId = null;
        updateHeroSection(items[0], false);
        
        // On modifie légèrement populateCarousel pour afficher le badge de progression
        populateCarousel(currentData);
        
        // Ajouter des badges de progression sur les cartes (Optionnel mais premium)
        setTimeout(() => {
            document.querySelectorAll('.movie-card').forEach((card, index) => {
                const item = items[index];
                if (item.time && item.duration) {
                    const percent = (item.time / item.duration) * 100;
                    const progressDiv = document.createElement('div');
                    progressDiv.className = 'progress-bar-mini';
                    progressDiv.innerHTML = `<div class="progress-fill" style="width: ${percent}%"></div>`;
                    card.appendChild(progressDiv);
                }
                
                // Si c'est une série, ajouter le badge S01E01
                if (item.media_type === 'tv' && item.season) {
                    const epBadge = document.createElement('div');
                    epBadge.className = 'episode-badge';
                    epBadge.textContent = `S${item.season}E${item.episode}`;
                    card.appendChild(epBadge);
                }
            });
        }, 100);

    } else {
        if (heroTitle) heroTitle.textContent = "Aucun historique";
        if (heroSynopsis) heroSynopsis.textContent = "Vous n'avez pas encore commencé de films ou de séries. Vos contenus apparaîtront ici dès que vous lancerez la lecture.";
        if (heroMeta) heroMeta.innerHTML = "<span>Commencez à regarder !</span>";
        if (heroSection) heroSection.style.backgroundImage = 'none';
        if (carousel) {
            carousel.innerHTML = '<div class="no-results">Votre historique est vide.</div>';
            carousel.style.opacity = '1';
        }
        heroContent?.classList.remove('animating');
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
        loginForm.style.display = 'none';
        liveContent.style.display = 'flex';
        if (!liveTVInitialized) await loadXtreamData();
        else console.log("[IPTV] Données déjà initialisées.");
    } else {
        console.log("[IPTV] Aucun identifiant trouvé, affichage du formulaire de login.");
        loginForm.style.display = 'flex';
        liveContent.style.display = 'none';
    }
}

// Listeners pour fermer la TV (Retour aux films)
document.getElementById('close-live-tv-back')?.addEventListener('click', () => {
    document.getElementById('live-tv-content')!.style.display = 'none';
    document.getElementById('main-nav')!.style.display = 'flex';
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
        const proxyCors = `https://corsproxy.io/?${encodeURIComponent(rawTestUrl)}`;
        const proxyAllOrigins = `https://api.allorigins.win/raw?url=${encodeURIComponent(rawTestUrl)}`;
        
        let response;
        try {
            response = await fetch(proxyVercel);
            if (!response.ok) throw new Error();
        } catch (e) {
            try {
                response = await fetch(proxyCors);
                if (!response.ok) throw new Error();
            } catch (e2) {
                response = await fetch(proxyAllOrigins);
            }
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
            try {
                const r1 = await fetch(`/api/proxy?url=${encodeURIComponent(target)}`);
                if (r1.ok) return r1;
            } catch(e){}
            try {
                const r2 = await fetch(`https://corsproxy.io/?${encodeURIComponent(target)}`);
                if (r2.ok) return r2;
            } catch(e){}
            return fetch(`https://api.allorigins.win/raw?url=${encodeURIComponent(target)}`);
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
    const categoryLabel = document.getElementById('current-category-name');
    if (!container) return;

    // Style Smarters : Plat, Majuscule, Bord à bord
    const baseClasses = "w-full px-8 py-5 flex items-center justify-between transition-all hover:bg-white/5 group text-white/40 hover:text-white cursor-pointer border-b border-white/5 border-l-4 border-l-transparent";
    const activeClasses = "w-full px-8 py-5 flex items-center justify-between transition-all bg-[#136b7a]/20 text-[#136b7a] shadow-lg group active cursor-pointer border-b border-white/5 border-l-4 border-l-[#136b7a]";

    const allChannelsCount = allLiveChannels.length;

    const html = `
        <div class="${activeClasses}" data-id="all">
            <span class="font-bold text-xs uppercase tracking-[0.2em]">All Channels</span>
            <span class="text-[11px] font-bold opacity-60">${allChannelsCount}</span>
        </div>
        ${liveCategories.map(cat => {
            const count = allLiveChannels.filter(c => c.category_id === cat.category_id).length;
            return `
                <div class="${baseClasses}" data-id="${cat.category_id}">
                    <span class="font-bold text-xs uppercase tracking-[0.2em] truncate max-w-[180px]">${cat.category_name}</span>
                    <span class="text-[11px] font-bold opacity-30 group-hover:opacity-100 transition-opacity">${count}</span>
                </div>
            `;
        }).join('')}
    `;
    container.innerHTML = html;

    container.querySelectorAll('[data-id]').forEach(btn => {
        btn.addEventListener('click', () => {
            stopLiveTV();
            container.querySelectorAll('[data-id]').forEach(b => {
                b.className = baseClasses;
            });
            btn.className = activeClasses;
            
            const catId = btn.getAttribute('data-id') || 'all';
            const catName = btn.querySelector('span:first-child')?.textContent || 'Toutes les chaînes';
            
            if (categoryLabel) categoryLabel.textContent = catName;
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
            div.className = "group relative aspect-[2/3] overflow-hidden cursor-pointer border border-white/5 bg-[#111] transition-all duration-300 fade-in-progressive";
            div.style.animationDelay = `${(index % batchSize) * 20}ms`;
            div.setAttribute('data-url', streamUrl);
            
            div.innerHTML = `
                <!-- Logo/Poster -->
                <div class="absolute inset-0 flex items-center justify-center bg-[#1a1a1a]">
                     <img src="${c.stream_icon || ''}" loading="lazy" class="w-full h-full object-cover opacity-80 group-hover:opacity-100 group-hover:scale-105 transition-all duration-700" onerror="this.src='https://images.unsplash.com/photo-1594909122845-11baa439b7bf?auto=format&fit=crop&q=80&w=400';"/>
                </div>

                <!-- Overlay Gradient -->
                <div class="absolute inset-0 bg-gradient-to-t from-black via-black/20 to-transparent opacity-80 group-hover:opacity-60 transition-opacity"></div>

                <!-- Channel Name -->
                <div class="absolute inset-0 flex flex-col items-center justify-center p-4 text-center">
                    <h3 class="font-black text-lg text-white uppercase tracking-tighter leading-tight drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] group-hover:text-primary transition-colors">
                        ${c.name}
                    </h3>
                </div>

                <!-- Top Label -->
                <div class="absolute top-3 left-3 z-10">
                    <span class="bg-[#136b7a] text-white text-[9px] font-bold px-1.5 py-0.5 shadow-md">
                        ${c.stream_id % 99}
                    </span>
                </div>

                <!-- Play Icon -->
                <div class="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-20">
                    <div class="w-12 h-12 rounded-full bg-primary/20 backdrop-blur-md border border-primary/40 flex items-center justify-center">
                        <span class="material-symbols-outlined text-primary text-3xl">play_arrow</span>
                    </div>
                </div>
            `;

            div.addEventListener('click', () => {
                const url = div.getAttribute('data-url');
                const name = div.querySelector('h3')?.textContent || 'Chaîne';
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

    // Initial Observer
    const observer = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting) {
            renderNextBatch();
        }
    }, { rootMargin: '200px' });

    observer.observe(sentinel);
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
        const getProxyUrl = (targetUrl: string, type: 'vercel' | 'corsproxy' | 'allorigins') => {
        const encoded = encodeURIComponent(targetUrl);
        const isHttps = window.location.protocol === 'https:';
        if (!isHttps && type === 'vercel') return targetUrl;
        switch (type) {
            case 'vercel': return `/api/proxy?url=${encoded}`;
            case 'corsproxy': return `https://corsproxy.io/?${encoded}`;
            case 'allorigins': return `https://api.allorigins.win/raw?url=${encoded}`;
            default: return targetUrl;
        }
    };

    let currentProxyType: 'vercel' | 'corsproxy' | 'allorigins' = 'vercel';
    let streamUrl = getProxyUrl(url, currentProxyType);

    const tryNextProxy = () => {
        if (currentProxyType === 'vercel') {
            currentProxyType = 'corsproxy';
        } else if (currentProxyType === 'corsproxy') {
            currentProxyType = 'allorigins';
        } else {
            return false;
        }
        streamUrl = getProxyUrl(url, currentProxyType);
        console.log(`Bascule vers le proxy: ${currentProxyType}`);
        return true;
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
                            currentPlayer.destroy();
                            delete (window as any).mpegtsPlayer;
                            setTimeout(() => loadTs(streamUrl), 500);
                        } else if (url.endsWith('.ts')) {
                            currentPlayer.destroy();
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

// Logout feature
document.getElementById('xtream-logout')?.addEventListener('click', () => {
    if (confirm("Voulez-vous vraiment vous déconnecter du serveur TV ?")) {
        localStorage.removeItem('xtream_host');
        localStorage.removeItem('xtream_user');
        localStorage.removeItem('xtream_pass');
        location.reload();
    }
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

// Pause automatique quand on quitte l'onglet (Mobile & PC)
document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        const video = document.getElementById('live-video') as HTMLVideoElement;
        if (video && !video.paused) {
            video.pause();
        }
    }
});

// Update handleNavigation to use new init
// (We modify the handleNavigation function in the next chunk)

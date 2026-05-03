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
        initIPTV();
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
    
    genreFiltersContainer.style.display = 'block';
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
    fetchPopularData('trending');
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
                initIPTV();
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

// --- IPTV Section ---
const iptvLogin = document.getElementById('iptv-login');
const iptvContent = document.getElementById('iptv-content');
const iptvLoginForm = document.getElementById('iptv-login-form') as HTMLFormElement;
const iptvGrid = document.getElementById('iptv-grid');
const iptvLogout = document.getElementById('iptv-logout');
const iptvProviderName = document.getElementById('iptv-provider-name');
const iptvCatButtons = document.querySelectorAll('.iptv-cat-btn');

let iptvAccount = JSON.parse(localStorage.getItem('iptv_account') || 'null');

function initIPTV() {
    if (iptvAccount) {
        showIPTVContent();
    } else {
        showIPTVLogin();
    }
}

function showIPTVLogin() {
    if (iptvLogin) iptvLogin.style.display = 'block';
    if (iptvContent) iptvContent.style.display = 'none';
}

function showIPTVContent() {
    if (iptvLogin) iptvLogin.style.display = 'none';
    if (iptvContent) iptvContent.style.display = 'block';
    if (iptvProviderName) {
        iptvProviderName.textContent = iptvAccount.name || "Ma Télévision";
    }
    
    // Par défaut, charger le Live
    loadIPTVCategory('live');
}

// Password Visibility Toggle
const passInput = document.getElementById('iptv-pass') as HTMLInputElement;
const passToggle = document.querySelector('.password-toggle');
passToggle?.addEventListener('click', () => {
    if (passInput) {
        const type = passInput.getAttribute('type') === 'password' ? 'text' : 'password';
        passInput.setAttribute('type', type);
    }
});

iptvLoginForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = iptvLoginForm.querySelector('.btn-add-playlist') as HTMLButtonElement;
    const originalText = btn ? btn.textContent : "ADD PLAYLIST";

    if (btn) {
        btn.textContent = "VERIFYING...";
        btn.disabled = true;
    }

    const name = (document.getElementById('iptv-name') as HTMLInputElement).value;
    const url = (document.getElementById('iptv-url') as HTMLInputElement).value.replace(/\/$/, "");
    const user = (document.getElementById('iptv-user') as HTMLInputElement).value;
    const pass = (document.getElementById('iptv-pass') as HTMLInputElement).value;

    try {
        const loginUrl = `${url}/player_api.php?username=${user}&password=${pass}`;
        console.log("Tentative de connexion IPTV:", loginUrl);
        
        const proxyUrl = `/api/proxy?url=${encodeURIComponent(loginUrl)}`;
        const res = await fetch(proxyUrl);
        
        if (!res.ok) {
            throw new Error(`Erreur serveur (${res.status})`);
        }

        const data = await res.json();
        console.log("Données IPTV complètes:", data);
        
        // DEBUG: Afficher la réponse brute pour comprendre pourquoi ça bloque
        // alert("Réponse serveur: " + JSON.stringify(data));

        if (data.user_info) {
            iptvAccount = { url, user, pass, name };
            localStorage.setItem('iptv_account', JSON.stringify(iptvAccount));
            showIPTVContent();
        } else {
            const errorMsg = data.message || "Serveur IPTV incompatible ou erreur de connexion.";
            alert(errorMsg);
        }
    } catch (err) {
        console.error("Erreur IPTV Login:", err);
        alert("Erreur de connexion au serveur IPTV. Vérifiez l'URL et assurez-vous qu'elle commence par http:// ou https://");
    } finally {
        if (btn) {
            btn.textContent = originalText;
            btn.disabled = false;
        }
    }
});

iptvLogout?.addEventListener('click', () => {
    localStorage.removeItem('iptv_account');
    iptvAccount = null;
    showIPTVLogin();
});

iptvCatButtons.forEach(btn => {
    btn.addEventListener('click', () => {
        iptvCatButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const action = btn.getAttribute('data-action');
        loadIPTVCategory(action!);
    });
});

const iptvSubCategories = document.getElementById('iptv-sub-categories');

async function loadIPTVCategory(type: string) {
    if (!iptvGrid || !iptvAccount || !iptvSubCategories) return;
    iptvGrid.innerHTML = '<div class="loading-spinner" style="grid-column: 1/-1; text-align:center; padding: 50px;">Chargement des bouquets...</div>';
    iptvSubCategories.innerHTML = '';

    try {
        const action = `get_${type}_categories`;
        const fetchUrl = `${iptvAccount.url}/player_api.php?username=${iptvAccount.user}&password=${iptvAccount.pass}&action=${action}`;
        const proxyUrl = `/api/proxy?url=${encodeURIComponent(fetchUrl)}`;
        
        const res = await fetch(proxyUrl);
        if (!res.ok) throw new Error("Erreur serveur");
        const data = await res.json();
        
        let categories: any[] = [];
        if (Array.isArray(data)) {
            categories = data;
        } else if (data && typeof data === 'object') {
            categories = Object.values(data).filter(cat => cat && typeof cat === 'object') as any[];
        }

        console.log(`Bouquets ${type}:`, categories);
        renderIPTVSubCategories(categories, type);
        
        if (categories && categories.length > 0) {
            loadIPTVStreams(type, categories[0].category_id);
        } else {
            loadIPTVStreams(type, 'all');
        }
    } catch (err) {
        console.error(`Erreur bouquets ${type}:`, err);
        iptvGrid.innerHTML = '<div class="error" style="grid-column: 1/-1; text-align:center; color: #ef4444; padding: 50px;">Impossible de charger les bouquets.</div>';
    }
}

function renderIPTVSubCategories(data: any, type: string) {
    if (!iptvSubCategories) return;
    
    let categories: any[] = [];
    if (Array.isArray(data)) {
        categories = data;
    } else if (data && typeof data === 'object') {
        categories = Object.values(data).filter(cat => cat && typeof cat === 'object') as any[];
    }

    if (!categories || categories.length === 0) {
        console.warn(`Aucun bouquet trouvé pour ${type}`);
        return;
    }

    // DEBUG: Voir la structure du premier bouquet
    console.log(`Structure 1er bouquet ${type}:`, categories[0]);

    iptvSubCategories.innerHTML = categories.map((cat, index) => {
        const name = cat.category_name || cat.name || cat.title || `Bouquet ${index + 1}`;
        const id = cat.category_id || cat.id || cat.cid || '0';
        
        return `
            <button class="iptv-sub-cat-btn ${index === 0 ? 'active' : ''}" data-id="${id}" style="padding: 8px 15px; background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.1); border-radius: 20px; color: white; white-space: nowrap; cursor: pointer; font-size: 13px;">
                ${name}
            </button>
        `;
    }).join('');

    iptvSubCategories.querySelectorAll('.iptv-sub-cat-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            iptvSubCategories.querySelectorAll('.iptv-sub-cat-btn').forEach(b => {
                (b as HTMLElement).classList.remove('active');
                (b as HTMLElement).style.background = 'rgba(255,255,255,0.1)';
            });
            (btn as HTMLElement).classList.add('active');
            (btn as HTMLElement).style.background = '#ef4444';
            const categoryId = btn.getAttribute('data-id');
            loadIPTVStreams(type, categoryId!);
        });
    });
}

async function loadIPTVStreams(type: string, categoryId: string) {
    if (!iptvGrid || !iptvAccount) return;
    iptvGrid.innerHTML = '<div class="loading-spinner" style="grid-column: 1/-1; text-align:center; padding: 50px;">Chargement des chaînes...</div>';

    try {
        let action = '';
        if (type === 'live') action = 'get_live_streams';
        else if (type === 'vod') action = 'get_vod_streams';
        else if (type === 'series') action = 'get_series';

        let fetchUrl = `${iptvAccount.url}/player_api.php?username=${iptvAccount.user}&password=${iptvAccount.pass}&action=${action}`;
        if (categoryId !== 'all') {
            fetchUrl += `&category_id=${categoryId}`;
        }
        
        const proxyUrl = `/api/proxy?url=${encodeURIComponent(fetchUrl)}`;
        const res = await fetch(proxyUrl);
        const data = await res.json();

        console.log(`Flux reçus pour ${type}:`, data);
        renderIPTVData(data, type);
    } catch (err) {
        console.error(`Erreur flux ${type}:`, err);
        iptvGrid.innerHTML = '<div class="error" style="grid-column: 1/-1; text-align:center; color: #ef4444; padding: 50px;">Erreur de chargement des chaînes.</div>';
    }
}

function renderIPTVData(data: any, type: string) {
    if (!iptvGrid) return;
    let items: any[] = [];
    if (Array.isArray(data)) {
        items = data;
    } else if (data && typeof data === 'object') {
        // Certains serveurs retournent un objet avec des clés numériques
        items = Object.values(data).filter(item => item && typeof item === 'object' && ((item as any).name || (item as any).title)) as any[];
        
        // Si c'est vide, on cherche des clés standards
        if (items.length === 0) {
            items = data.streams || data.series || data.vod || [];
        }
    }

    if (!items || items.length === 0) {
        console.warn(`Aucun item trouvé pour ${type}`);
        iptvGrid.innerHTML = '<div class="no-results" style="grid-column: 1/-1; text-align:center; padding: 50px;">Aucun contenu trouvé dans ce bouquet.</div>';
        return;
    }

    // DEBUG: Voir la structure du premier item pour corriger les noms de champs
    console.log(`Structure 1er item ${type}:`, items[0]);

    // On limite l'affichage pour la performance
    const displayItems = items.slice(0, 200); 
    iptvGrid.innerHTML = displayItems.map(item => {
        const title = item.name || item.title || "Sans titre";
        const img = item.stream_icon || item.icon || item.series_cover || item.cover || item.thumbnail;
        const id = item.stream_id || item.series_id || item.id;
        
        return `
            <div class="movie-card iptv-card" data-id="${id}" data-type="${type}">
                <div class="card-img-container" style="aspect-ratio: 16/9; background: #1a1a1a; position: relative; overflow: hidden; border-radius: 12px;">
                    <img src="${img || ''}" alt="${title}" loading="lazy" onerror="this.src='https://via.placeholder.com/320x180?text=TV'" style="width: 100%; height: 100%; object-fit: cover;">
                    <div class="card-overlay" style="position: absolute; inset: 0; background: rgba(0,0,0,0.5); opacity: 0; display: flex; align-items: center; justify-content: center; transition: opacity 0.3s;">
                        <svg viewBox="0 0 24 24" width="40" height="40" fill="white"><path d="M8 5V19L19 12L8 5Z"/></svg>
                    </div>
                </div>
                <div class="card-info" style="padding: 10px 0;">
                    <h3 class="card-title" style="font-size: 13px; font-weight: 500; color: #fff; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${title}</h3>
                </div>
            </div>
        `;
    }).join('');

    iptvGrid.querySelectorAll('.iptv-card').forEach(card => {
        card.addEventListener('click', () => {
            const id = card.getAttribute('data-id');
            const itype = card.getAttribute('data-type');
            playIPTV(id!, itype!);
        });
    });
}

function playIPTV(id: string, type: string) {
    if (!iptvAccount) return;
    let playUrl = '';
    if (type === 'live') {
        playUrl = `${iptvAccount.url}/live/${iptvAccount.user}/${iptvAccount.pass}/${id}.ts`;
    } else if (type === 'vod') {
        playUrl = `${iptvAccount.url}/movie/${iptvAccount.user}/${iptvAccount.pass}/${id}`;
    } else {
        alert("Pour les séries IPTV, veuillez utiliser une application dédiée (le format est complexe en web).");
        return;
    }
    
    // Pour l'IPTV, on ouvre souvent dans un nouvel onglet car le format .ts/.m3u8 nécessite des lecteurs spécifiques
    // ou on pourrait l'injecter dans notre lecteur si compatible HLS.
    window.open(playUrl, '_blank');
}

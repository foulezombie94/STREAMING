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
let currentType: 'movie' | 'tv' | 'trending' | 'reprendre' = 'trending';

// Genre globals
let movieGenres: any[] = [];
let tvGenres: any[] = [];
let activeGenreId: number | null = null;
const genreFiltersEl = document.getElementById('genre-filters');

// Éléments du DOM
const navbar = document.getElementById('navbar');
const carousel = document.getElementById('carousel') as HTMLElement | null;
const heroSection = document.getElementById('hero-section');
const heroTitle = document.getElementById('hero-title');
const heroMeta = document.getElementById('hero-meta');
const heroSynopsis = document.getElementById('hero-synopsis');
const heroContent = document.querySelector('.hero-content');
const navItems = document.querySelectorAll('.nav-item');
const sectionTitle = document.querySelector('.section-title');
const searchInput = document.getElementById('search-input') as HTMLInputElement | null;

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

    currentType = type as 'movie' | 'tv' | 'trending' | 'reprendre';
    activeGenreId = null; 

    if (sectionTitle) {
        if (currentType === 'trending') sectionTitle.textContent = 'Tendances Actuelles';
        else if (currentType === 'tv') sectionTitle.textContent = 'Séries Populaires';
        else if (currentType === 'reprendre') sectionTitle.textContent = 'Reprendre la lecture';
        else sectionTitle.textContent = 'Films Populaires';
    }

    if (currentType === 'reprendre') {
        renderResumePage();
    } else {
        renderGenres(currentType);
        fetchPopularData(currentType);
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
const mobileFilterBtn = document.getElementById('mobile-filter-btn');
const mobileGenreOverlay = document.getElementById('mobile-genre-overlay');
const mobileGenreGrid = document.getElementById('mobile-genre-grid');
const closeGenreOverlay = document.getElementById('close-genre-overlay');

function renderGenres(type: 'movie' | 'tv' | 'trending' | 'reprendre') {
    if (!genreFiltersEl || !genreFiltersContainer) return;
    
    if (type === 'trending' || type === 'reprendre') {
        genreFiltersContainer.style.display = 'none';
        return;
    }
    
    genreFiltersContainer.style.display = 'block';
    const genres = type === 'movie' ? movieGenres : tvGenres;
    
    // Rendre pour Desktop (pills horizontales)
    genreFiltersEl.style.display = window.innerWidth > 768 ? 'flex' : 'none';
    genreFiltersEl.innerHTML = `
        <div class="genre-label">Genres :</div>
        <button class="genre-btn ${activeGenreId === null ? 'active' : ''}" data-id="all">Tous</button>
        ${genres.map(g => `<button class="genre-btn ${activeGenreId === g.id ? 'active' : ''}" data-id="${g.id}">${g.name}</button>`).join('')}
    `;

    // Rendre pour Mobile (grid dans l'overlay)
    if (mobileGenreGrid) {
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

    // Click listener pour desktop
    genreFiltersEl.querySelectorAll('.genre-btn').forEach(btn => {
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

// Event listeners pour le mobile
mobileFilterBtn?.addEventListener('click', () => {
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
async function fetchPopularData(type: 'movie' | 'tv' | 'trending', genreId: number | null = null) {
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
    try {
        const mRes = await fetch(`${BASE_URL}/genre/movie/list?api_key=${TMDB_API_KEY}&language=fr-FR`);
        const mData = await mRes.json();
        movieGenres = mData.genres || [];

        const tRes = await fetch(`${BASE_URL}/genre/tv/list?api_key=${TMDB_API_KEY}&language=fr-FR`);
        const tData = await tRes.json();
        tvGenres = tData.genres || [];
    } catch (e) {
        console.error("Erreur genres:", e);
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
        title: h.title,
        name: h.title, // Pour les séries
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

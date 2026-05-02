import './style.css';
import './antiblocker';

// 1. Constantes TMDB
const TMDB_API_KEY = 'e1a2bb6a3ed288feb5d767908732e751';
const BASE_URL = 'https://api.themoviedb.org/3';
const IMAGE_BASE_URL = 'https://image.tmdb.org/t/p/original';
const IMAGE_W500_URL = 'https://image.tmdb.org/t/p/w500';

// 2. Éléments du DOM
let currentData: any[] = []; // Stocke les données actuelles
let activeId: number | null = null; // ID du film actuellement mis en avant
let currentType: 'movie' | 'tv' | 'trending' = 'trending';

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

// 4. Gestion de la Navigation (Home / Séries / Films)
navItems.forEach(item => {
    item.addEventListener('click', (e) => {
        e.preventDefault();
        const type = item.getAttribute('data-type');
        if (!type) return;

        // Reset class
        navItems.forEach(nav => nav.classList.remove('active'));
        item.classList.add('active');

        // Changer le type global et refetch
        currentType = type as 'movie' | 'tv' | 'trending';
        activeGenreId = null; // Reset genre when switching tabs
        
        // Mettre à jour le titre de section
        if (sectionTitle) {
            if (currentType === 'trending') sectionTitle.textContent = 'Tendances Actuelles';
            else if (currentType === 'tv') sectionTitle.textContent = 'Séries Populaires';
            else sectionTitle.textContent = 'Films Populaires';
        }

        // Mettre à jour les filtres
        renderGenres(currentType);

        // Effacer doucement l'écran principal le temps du chargement
        heroContent?.classList.add('animating');
        if (carousel) carousel.style.opacity = '0.5';

        fetchPopularData(currentType);
    });
});

const genreFiltersContainer = document.getElementById('genre-filters-container');
const mobileFilterBtn = document.getElementById('mobile-filter-btn');
const mobileGenreOverlay = document.getElementById('mobile-genre-overlay');
const mobileGenreGrid = document.getElementById('mobile-genre-grid');
const closeGenreOverlay = document.getElementById('close-genre-overlay');

function renderGenres(type: 'movie' | 'tv' | 'trending') {
    if (!genreFiltersEl || !genreFiltersContainer) return;
    
    if (type === 'trending') {
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
if (carousel) {
    let isDown = false;
    let startX: number;
    let scrollLeft: number;

    carousel.addEventListener('mousedown', (e) => {
        isDown = true;
        carousel.style.cursor = 'grabbing';
        startX = e.pageX - carousel.offsetLeft;
        scrollLeft = carousel.scrollLeft;
    });

    carousel.addEventListener('mouseleave', () => {
        isDown = false;
        carousel.style.cursor = 'grab';
    });

    carousel.addEventListener('mouseup', () => {
        isDown = false;
        carousel.style.cursor = 'grab';
    });

    carousel.addEventListener('mousemove', (e) => {
        if (!isDown) return;
        e.preventDefault();
        const x = e.pageX - carousel.offsetLeft;
        const walk = (x - startX) * 2; 
        carousel.scrollLeft = scrollLeft - walk;
    });
    
    // Ajout d'une transition pour le fondu pendant le changement d'onglet
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
                endpoint = 'trending/all/week'; // Mélange séries et films tendance
            } else if (type === 'tv') {
                endpoint = 'tv/popular';
            } else {
                endpoint = 'movie/popular';
            }
        }

        const response = await fetch(`${BASE_URL}/${endpoint}?${queryParams}`);
        const data = await response.json();
        
        if (data.results && data.results.length > 0) {
            currentData = data.results;
            
            // Remettre le carrousel opaque
            if (carousel) carousel.style.opacity = '1';

            // Forcer le rechargement de l'ID actif pour être sûr que l'animation joue
            activeId = null;

            // Initialiser avec le premier élément
            const heroItem = currentData[0];
            updateHeroSection(heroItem, true); // initial load animation logic changed slightly below

            // Remplir le carrousel
            populateCarousel(currentData);
        }
    } catch (error) {
        console.error('Erreur:', error);
        if (heroTitle) heroTitle.textContent = "Erreur de connexion";
    }
}

// 7. Mise à jour fluide de la section Héros
function updateHeroSection(item: any, isInitialLoad = false) {
    if (activeId === item.id) return;
    activeId = item.id;

    const applyUpdate = () => {
        // Déterminer le type d'affichage pour l'item actuel
        let displayType = currentType;
        if (currentType === 'trending') {
            displayType = item.media_type; // L'API trending renvoie un champ media_type ('movie' ou 'tv')
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
        if (currentType === 'trending') {
            displayType = item.media_type;
        }
        const title = displayType === 'tv' ? item.name : item.title;
        
        const img = document.createElement('img');
        img.src = `${IMAGE_W500_URL}${item.poster_path}`;
        img.alt = title;
        img.loading = 'lazy';
        img.draggable = false; 

        card.appendChild(img);

        // Gestion du clic
        card.addEventListener('click', () => {
            document.querySelectorAll('.movie-card').forEach(c => c.classList.remove('active'));
            card.classList.add('active');

            updateHeroSection(item);
            
            // Centrage horizontal manuel pour éviter le saut vertical de la page
            const scrollPos = card.offsetLeft - (carousel.clientWidth / 2) + (card.clientWidth / 2);
            carousel.scrollTo({
                left: scrollPos,
                behavior: 'smooth'
            });
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
            fetchPopularData(currentType);
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

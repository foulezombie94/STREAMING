import { TMDBMedia } from './types';
import { 
    getMainContent, 
    BASE_URL,
    TMDB_API_KEY,
    getHeroSection,
    GLOBAL_BLACKLIST_IDS
} from './globals';
import { renderMovieCard, toggleSearchVisibility } from './main';

const SAGA_PRIORITY: { [key: string]: number } = {
    'mcu': 100,            // Marvel
    'starwars': 95,        // Star Wars
    'harrypotter': 90,     // Harry Potter
    'leseigneurdesan': 85, // Seigneur des Anneaux
    'avatarsaga': 80,      // Avatar
    'spidermanavenge': 78, // Spider-Man MCU
    'deadpoolsaga': 75,    // Deadpool
    'jurassicparksag': 72, // Jurassic Park
    'fastandfuriouss': 70, // Fast & Furious
    'johnwick': 68,        // John Wick
    'missionimpossib': 65, // Mission Impossible
    'dunesaga': 62,        // Dune
    'toystory': 60,        // Toy Story
    'shrek': 58,           // Shrek
    'despicable': 56,      // Moi, Moche et Méchant
    'conjuringsaga': 54,   // Conjuring
    'screamsaga': 52,      // Scream
    'iceage': 50           // L'Age de Glace
};

export let SAGAS_DATA: any[] = [];
let sagasLoadingPromise: Promise<any[]> | null = null;
const sagaCache: { [key: string]: TMDBMedia[] } = {};

export async function loadSagasData(): Promise<any[]> {
    if (SAGAS_DATA.length > 0) return SAGAS_DATA;
    if (sagasLoadingPromise) return sagasLoadingPromise;

    sagasLoadingPromise = (async () => {
        const module = await import('./sagas_data');
        const loadedSagas = [...module.SAGAS_DATA];
        loadedSagas.sort((a, b) => {
            const prioA = SAGA_PRIORITY[a.id] || 0;
            const prioB = SAGA_PRIORITY[b.id] || 0;
            if (prioA !== prioB) return prioB - prioA;
            return (b.items?.length || 0) - (a.items?.length || 0);
        });
        SAGAS_DATA = loadedSagas;
        return SAGAS_DATA;
    })();

    return sagasLoadingPromise;
}

// Variables pour la pagination des sagas
let sagasPageSize = 12;
let sagasVisibleCount = 12;

export async function renderSagasPage() {
    const mainContent = getMainContent();
    if (!mainContent) return;
    await loadSagasData();
    
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
            <img src="${saga.poster}" alt="${saga.title}" width="342" height="513" loading="lazy">
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

export async function renderSagaDetailsPage(sagaId: string) {
    await loadSagasData();
    const saga = SAGAS_DATA.find(s => s.id === sagaId);
    const mainContent = getMainContent();
    if (!saga || !mainContent) return;

    // Masquer le hero carousel et la recherche
    const heroSection = getHeroSection();
    if (heroSection) heroSection.style.display = 'none';
    toggleSearchVisibility(false);
    mainContent.classList.add('no-hero');

    mainContent.innerHTML = `
        <div class="saga-details-hero" style="background-image: url('${saga.backdrop}')">
            <div class="saga-details-content">
                <button class="back-btn-saga" data-nav="sagas">
                    <span class="material-symbols-outlined">arrow_back</span> Retour aux Sagas
                </button>
                <div class="saga-header-flex">
                    <img src="${saga.poster}" class="saga-mini-poster" width="185" height="278" />
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
                ${!sagaCache[sagaId] ? `
                    <div class="loading-shimmer" style="height: 250px; width: 100%; border-radius: 16px;"></div>
                    <div class="loading-shimmer" style="height: 250px; width: 100%; border-radius: 16px;"></div>
                    <div class="loading-shimmer" style="height: 250px; width: 100%; border-radius: 16px;"></div>
                ` : ''}
            </div>
        </section>
    `;

    const grid = document.getElementById('saga-movies-grid');
    if (!grid) return;

    // Helper pour formater les devises (conservé de l'original)
    const formatCurrency = (amount: number) => {
        const euroAmount = amount * 0.93;
        if (euroAmount >= 1e9) return `${(euroAmount / 1e9).toFixed(1)} Md €`;
        if (euroAmount >= 1e6) return `${(euroAmount / 1e6).toFixed(0)} M €`;
        return `${Math.round(euroAmount).toLocaleString()} €`;
    };

    // Helper de rendu partagé (Cache + Frais)
    const displaySagaResults = (movies: TMDBMedia[]) => {
        grid.innerHTML = movies.map((m, index) => {
            const loadingMode = index < 4 ? 'eager' : 'lazy';
            return renderMovieCard(m, m.media_type || 'movie', '', `&fromSaga=${saga.id}`, loadingMode);
        }).join('');

        let totalMinutes = 0, totalRating = 0, totalBudget = 0, totalRevenue = 0;
        let years: number[] = [];

        movies.forEach(m => {
            if (m.runtime) totalMinutes += m.runtime;
            if (m.vote_average) totalRating += m.vote_average;
            if (m.budget) totalBudget += m.budget;
            if (m.revenue) totalRevenue += m.revenue;
            const date = m.release_date || m.first_air_date;
            if (date) {
                const y = new Date(date).getFullYear();
                if (!isNaN(y)) years.push(y);
            }
        });

        const durationEl = document.getElementById('total-duration');
        const ratingEl = document.getElementById('avg-rating');
        const budgetEl = document.getElementById('total-budget');
        const revenueEl = document.getElementById('total-revenue');
        const yearsEl = document.getElementById('saga-years');

        if (durationEl) {
            const h = Math.floor(totalMinutes / 60);
            const min = totalMinutes % 60;
            durationEl.textContent = `${h}h ${min}m`;
        }
        if (ratingEl) ratingEl.textContent = movies.length ? (totalRating / movies.length).toFixed(1) + '/10' : '--';
        if (budgetEl) budgetEl.textContent = totalBudget > 0 ? formatCurrency(totalBudget) : 'N/A';
        if (revenueEl) revenueEl.textContent = totalRevenue > 0 ? formatCurrency(totalRevenue) : 'N/A';
        if (yearsEl && years.length) {
            const minYear = Math.min(...years), maxYear = Math.max(...years);
            yearsEl.textContent = minYear === maxYear ? `${minYear}` : `${minYear}-${maxYear}`;
        }
    };

    // 1. UTILISATION DU CACHE
    if (sagaCache[sagaId]) {
        displaySagaResults(sagaCache[sagaId]);
        return;
    }

    // 2. CHARGEMENT FRAIS (Original conservé)
    const movies: TMDBMedia[] = [];
    const chunkSize = 5;
    
    for (let i = 0; i < saga.items.length; i += chunkSize) {
        const chunk = saga.items.slice(i, i + chunkSize);
        const chunkPromises = chunk.map(async (title: string) => {
            try {
                if (title.startsWith('id:')) {
                    const movieId = title.split(':')[1];
                    if (GLOBAL_BLACKLIST_IDS.includes(movieId)) return null;
                    const res = await fetch(`${BASE_URL}/movie/${movieId}?api_key=${TMDB_API_KEY}&language=fr-FR`);
                    const data = await res.json();
                    data.media_type = 'movie';
                    return data;
                }
                if (title.startsWith('tv:')) {
                    const tvId = title.split(':')[1];
                    if (GLOBAL_BLACKLIST_IDS.includes(tvId)) return null;
                    const res = await fetch(`${BASE_URL}/tv/${tvId}?api_key=${TMDB_API_KEY}&language=fr-FR`);
                    const data = await res.json();
                    data.media_type = 'tv';
                    return data;
                }
                const searchRes = await fetch(`${BASE_URL}/search/movie?api_key=${TMDB_API_KEY}&language=fr-FR&query=${encodeURIComponent(title)}&page=1`);
                const searchData = await searchRes.json();
                if (searchData.results && searchData.results.length > 0) {
                    const detailRes = await fetch(`${BASE_URL}/movie/${searchData.results[0].id}?api_key=${TMDB_API_KEY}&language=fr-FR`);
                    const data = await detailRes.json();
                    data.media_type = 'movie';
                    return data;
                }
                return null;
            } catch (e) { return null; }
        });
        
        const results = await Promise.all(chunkPromises);
        results.forEach(m => { if (m && m.id) movies.push(m); });
        if (i + chunkSize < saga.items.length) await new Promise(r => setTimeout(r, 100));
    }
    
    if (movies.length === 0) {
        grid.innerHTML = '<p style="padding: 20px; color: #aaa;">Aucun contenu disponible pour cette saga.</p>';
        return;
    }

    sagaCache[sagaId] = movies;
    displaySagaResults(movies);
}

// Exposer au global
(window as any).renderSagasPage = renderSagasPage;
(window as any).renderSagaDetailsPage = renderSagaDetailsPage;
import './style.css';
import './antiblocker';

// 1. Constantes TMDB
const TMDB_API_KEY = 'e1a2bb6a3ed288feb5d767908732e751';
const BASE_URL = 'https://api.themoviedb.org/3';
const IMAGE_BASE_URL = 'https://image.tmdb.org/t/p/original';
const IMAGE_W500_URL = 'https://image.tmdb.org/t/p/w500';

// 2. Extraire les paramètres de l'URL
const urlParams = new URLSearchParams(window.location.search);
const mediaId = urlParams.get('id');
const mediaType = urlParams.get('type');

// 3. Éléments du DOM
const heroSection = document.getElementById('details-hero');
const titleEl = document.getElementById('details-title');
const metaEl = document.getElementById('details-meta');
const genresEl = document.getElementById('details-genres');
const taglineEl = document.getElementById('details-tagline');
const synopsisEl = document.getElementById('details-synopsis');
const posterEl = document.getElementById('details-poster') as HTMLImageElement;
const castListEl = document.getElementById('cast-list');
const playTrailerBtn = document.getElementById('play-trailer-btn');
const trailerModal = document.getElementById('trailer-modal');
const closeModalBtn = document.getElementById('close-modal');
const trailerIframe = document.getElementById('trailer-iframe') as HTMLIFrameElement;
const navbar = document.getElementById('navbar');

let trailerKey = '';

// Gestion Navbar
window.addEventListener('scroll', () => {
    if (window.scrollY > 50) {
        navbar?.classList.add('scrolled');
    } else {
        navbar?.classList.remove('scrolled');
    }
});

async function fetchDetails() {
    if (!mediaId || !mediaType) {
        if (titleEl) titleEl.textContent = "Erreur : Médias introuvables.";
        return;
    }

    try {
        // Fetch details + credits + videos en Français
        const response = await fetch(`${BASE_URL}/${mediaType}/${mediaId}?api_key=${TMDB_API_KEY}&language=fr-FR&append_to_response=credits,videos`);
        const data = await response.json();
        
        // Background
        if (heroSection && data.backdrop_path) {
            heroSection.style.backgroundImage = `url('${IMAGE_BASE_URL}${data.backdrop_path}')`;
        }
        
        // Poster
        if (posterEl && data.poster_path) {
            posterEl.src = `${IMAGE_W500_URL}${data.poster_path}`;
            posterEl.alt = data.title || data.name;
            posterEl.style.opacity = '1';
        }

        // Titre
        if (titleEl) titleEl.textContent = data.title || data.name;
        
        // Tagline
        if (taglineEl) taglineEl.textContent = data.tagline ? `"${data.tagline}"` : '';
        
        // Synopsis
        if (synopsisEl) synopsisEl.textContent = data.overview || "Aucun synopsis disponible.";
        
        // Meta (Année, Note, Durée)
        const releaseDate = data.release_date || data.first_air_date;
        const year = releaseDate ? new Date(releaseDate).getFullYear() : 'N/A';
        const rating = data.vote_average ? data.vote_average.toFixed(1) : 'N/A';
        const duration = data.runtime ? `${Math.floor(data.runtime / 60)}h ${data.runtime % 60}m` : (data.number_of_seasons ? `${data.number_of_seasons} Saisons` : '');
        
        if (metaEl) {
            metaEl.innerHTML = `<span class="rating">★ ${rating}/10</span> <span>&bull; ${year}</span> ${duration ? `<span>&bull; ${duration}</span>` : ''}`;
        }
        
        // Genres
        if (genresEl && data.genres) {
            genresEl.innerHTML = data.genres.map((g: any) => `<span class="genre-tag">${g.name}</span>`).join('');
        }
        
        // Extra Info Grid
        const extraInfoGrid = document.getElementById('extra-info-grid');
        const extraInfo = [];

        if (data.status) extraInfo.push({ label: 'Statut', value: data.status });
        if (data.original_language) extraInfo.push({ label: 'Langue', value: data.original_language.toUpperCase() });

        if (mediaType === 'movie') {
            const director = data.credits?.crew?.find((c: any) => c.job === 'Director');
            if (director) extraInfo.push({ label: 'Réalisateur', value: director.name });
            
            if (data.budget && data.budget > 0) {
                extraInfo.push({ label: 'Budget', value: `$${(data.budget / 1000000).toFixed(1)}M` });
            }
            if (data.revenue && data.revenue > 0) {
                extraInfo.push({ label: 'Box Office', value: `$${(data.revenue / 1000000).toFixed(1)}M` });
            }
        } else if (mediaType === 'tv') {
            if (data.created_by && data.created_by.length > 0) {
                extraInfo.push({ label: 'Créateur', value: data.created_by.map((c:any) => c.name).join(', ') });
            }
            if (data.number_of_episodes) {
                extraInfo.push({ label: 'Épisodes', value: data.number_of_episodes.toString() });
            }
            if (data.networks && data.networks.length > 0) {
                extraInfo.push({ label: 'Chaîne', value: data.networks[0].name });
            }
        }

        if (data.production_companies && data.production_companies.length > 0) {
            extraInfo.push({ label: 'Studio', value: data.production_companies[0].name });
        }

        // Watch Button Logic - Store season count
        currentSeasonsCount = data.number_of_seasons || 0;

        if (extraInfoGrid && extraInfo.length > 0) {
            extraInfoGrid.innerHTML = extraInfo.map(info => `
                <div class="info-block">
                    <span class="info-label">${info.label}</span>
                    <span class="info-value">${info.value}</span>
                </div>
            `).join('');
        } else if (extraInfoGrid) {
            extraInfoGrid.style.display = 'none';
        }

        // Cast
        if (castListEl && data.credits && data.credits.cast) {
            const topCast = data.credits.cast.slice(0, 5);
            castListEl.innerHTML = topCast.map((actor: any) => `
                <div class="cast-member" data-id="${actor.id}" data-character="${actor.character ? 'Rôle : ' + actor.character : 'Rôle inconnu'}">
                    <img src="${actor.profile_path ? IMAGE_W500_URL + actor.profile_path : 'https://i.pravatar.cc/100?img=11'}" alt="${actor.name}">
                    <span class="cast-name">${actor.name}</span>
                </div>
            `).join('');

            // Hover Card Logic
            const hoverCard = document.getElementById('actor-hover-card');
            const hoverImg = document.getElementById('hover-card-img') as HTMLImageElement;
            const hoverName = document.getElementById('hover-card-name');
            const hoverRole = document.getElementById('hover-card-role');
            const hoverMeta = document.getElementById('hover-card-meta');
            const hoverBio = document.getElementById('hover-card-bio');
            
            const actorCache: Record<string, any> = {};
            (window as any).actorCache = actorCache; // Partager le cache avec la modale
            let hoverTimeout: any;

            // Attach click listeners to actor cards
            document.querySelectorAll('.cast-member').forEach(card => {
                card.addEventListener('click', () => {
                    const actorId = card.getAttribute('data-id');
                    if (actorId) openActorModal(actorId);
                });

                card.addEventListener('mouseenter', async () => {
                    const actorId = card.getAttribute('data-id');
                    const roleStr = card.getAttribute('data-character');
                    if (!actorId) return;

                    if (hoverCard) {
                        const rect = card.getBoundingClientRect();
                        hoverCard.style.left = `${rect.left + rect.width / 2}px`;
                        
                        // Si la carte est trop haute, on affiche en dessous, sinon au dessus
                        if (rect.top > 300) {
                            hoverCard.style.top = `${rect.top - 20}px`;
                            hoverCard.style.transform = 'translate(-50%, -100%) scale(0.95)';
                        } else {
                            hoverCard.style.top = `${rect.bottom + 20}px`;
                            hoverCard.style.transform = 'translate(-50%, 0) scale(0.95)';
                        }
                    }

                    hoverTimeout = setTimeout(async () => {
                        // Reset visual
                        if (hoverImg) hoverImg.src = (card.querySelector('img') as HTMLImageElement).src;
                        if (hoverName) hoverName.textContent = 'Chargement...';
                        if (hoverRole) hoverRole.textContent = roleStr || '';
                        if (hoverMeta) hoverMeta.innerHTML = '';
                        if (hoverBio) hoverBio.textContent = '';
                        
                        if (hoverCard) {
                            hoverCard.classList.add('show');
                            const rect = card.getBoundingClientRect();
                            if (rect.top > 300) {
                                hoverCard.style.transform = 'translate(-50%, -100%) scale(1)';
                            } else {
                                hoverCard.style.transform = 'translate(-50%, 0) scale(1)';
                            }
                        }

                        let actorData;
                        if (actorCache[actorId]) {
                            actorData = actorCache[actorId];
                        } else {
                            try {
                                const response = await fetch(`${BASE_URL}/person/${actorId}?api_key=${TMDB_API_KEY}&language=fr-FR`);
                                actorData = await response.json();
                                actorCache[actorId] = actorData;
                            } catch (e) {
                                return;
                            }
                        }

                        // update card
                        if (hoverName) hoverName.textContent = actorData.name;
                        if (hoverMeta) {
                            const age = actorData.birthday ? Math.floor((new Date().getTime() - new Date(actorData.birthday).getTime()) / 3.15576e+10) : null;
                            const place = actorData.place_of_birth ? actorData.place_of_birth.split(',').pop() : '';
                            hoverMeta.innerHTML = `<span>${age ? age + ' ans' : 'Âge inconnu'}</span><span>${place}</span>`;
                        }
                        if (hoverBio) hoverBio.textContent = actorData.biography || "Biographie non disponible.";
                    }, 300);
                });

                card.addEventListener('mouseleave', () => {
                    clearTimeout(hoverTimeout);
                    if (hoverCard) hoverCard.classList.remove('show');
                });
            });
        }

        // Trailer
        if (data.videos && data.videos.results) {
            const trailer = data.videos.results.find((v: any) => v.type === 'Trailer' && v.site === 'YouTube');
            if (trailer) {
                trailerKey = trailer.key;
            } else {
                if (playTrailerBtn) playTrailerBtn.style.display = 'none';
            }
        } else {
            if (playTrailerBtn) playTrailerBtn.style.display = 'none';
        }

        // Animer l'entrée
        document.querySelector('.info-container')?.classList.add('loaded');
        
    } catch (error) {
        console.error('Erreur', error);
        if (titleEl) titleEl.textContent = "Erreur de chargement";
    }
}

// Modal Trailer
if (playTrailerBtn) {
    playTrailerBtn.addEventListener('click', () => {
        if (trailerKey && trailerModal && trailerIframe) {
            trailerIframe.src = `https://www.youtube.com/embed/${trailerKey}?autoplay=1`;
            trailerModal.classList.add('active');
        }
    });
}

if (closeModalBtn) {
    closeModalBtn.addEventListener('click', () => {
        if (trailerModal && trailerIframe) {
            trailerModal.classList.remove('active');
            trailerIframe.src = ''; 
        }
    });
}

// Fermer la modale si on clique en dehors de la vidéo
if (trailerModal) {
    trailerModal.addEventListener('click', (e) => {
        if (e.target === trailerModal && trailerIframe) {
            trailerModal.classList.remove('active');
            trailerIframe.src = '';
        }
    });
}

// Actor Modal Logic
const actorModal = document.getElementById('actor-modal');
const closeActorModalBtn = document.getElementById('close-actor-modal');
const actorModalImg = document.getElementById('actor-modal-img') as HTMLImageElement;
const actorModalName = document.getElementById('actor-modal-name');
const actorModalMeta = document.getElementById('actor-modal-meta');
const actorModalBio = document.getElementById('actor-modal-bio');

async function openActorModal(actorId: string) {
    if (!actorModal) return;
    actorModal.classList.add('active');
    
    // Reset contents
    if (actorModalImg) actorModalImg.src = '';
    if (actorModalName) actorModalName.textContent = 'Chargement...';
    if (actorModalMeta) actorModalMeta.innerHTML = '';
    if (actorModalBio) actorModalBio.textContent = '';

    try {
        const cache = (window as any).actorCache || {};
        let data;
        
        if (cache[actorId]) {
            data = cache[actorId];
        } else {
            const response = await fetch(`${BASE_URL}/person/${actorId}?api_key=${TMDB_API_KEY}&language=fr-FR`);
            data = await response.json();
            cache[actorId] = data;
        }

        if (actorModalImg) {
            actorModalImg.src = data.profile_path ? `${IMAGE_W500_URL}${data.profile_path}` : 'https://i.pravatar.cc/100?img=11';
        }
        
        if (actorModalName) actorModalName.textContent = data.name;
        
        if (actorModalMeta) {
            const birthday = data.birthday ? new Date(data.birthday).toLocaleDateString('fr-FR') : 'Date de naissance inconnue';
            const place = data.place_of_birth || 'Lieu inconnu';
            actorModalMeta.innerHTML = `<span>🎂 ${birthday}</span><span>📍 ${place}</span>`;
            if (data.deathday) {
                const deathday = new Date(data.deathday).toLocaleDateString('fr-FR');
                actorModalMeta.innerHTML += `<span>✝️ ${deathday}</span>`;
            }
        }
        
        if (actorModalBio) {
            actorModalBio.textContent = data.biography || "Aucune biographie traduite en français n'est disponible pour cet acteur.";
        }
    } catch (error) {
        console.error('Erreur chargement acteur', error);
        if (actorModalName) actorModalName.textContent = "Erreur de chargement";
    }
}

if (closeActorModalBtn) {
    closeActorModalBtn.addEventListener('click', () => {
        actorModal?.classList.remove('active');
    });
}

if (actorModal) {
    actorModal.addEventListener('click', (e) => {
        if (e.target === actorModal) {
            actorModal.classList.remove('active');
        }
    });
}

// Watch Button Logic & Embedded Player
const watchMovieBtn = document.getElementById('watch-movie-btn');
const playerSection = document.getElementById('player-section');
const playerControls = document.getElementById('player-controls');
const seasonSelect = document.getElementById('season-select') as HTMLSelectElement | null;
const episodeSelect = document.getElementById('episode-select') as HTMLSelectElement | null;
const videoIframe = document.getElementById('video-iframe') as HTMLIFrameElement | null;
const closePlayerBtn = document.getElementById('close-player-btn');
const serverButtons = document.querySelectorAll('.server-btn');

let currentSeasonsCount = 0;
let currentServer = 'videasy'; // Default server

// Server URL builders
function getMovieUrl(server: string, id: string | null): string {
    switch (server) {
        case 'multiembed':
            return `https://multiembed.mov/?video_id=${id}&tmdb=1`;
        case 'moviesapi':
            return `https://moviesapi.club/movie/${id}`;
        case 'vidfast':
            return `https://vidfast.pro/movie/${id}`;
        case 'videasy':
        default:
            return `https://player.videasy.net/movie/${id}`;
    }
}

function getTvUrl(server: string, id: string | null, season: string, episode: string): string {
    switch (server) {
        case 'multiembed':
            return `https://multiembed.mov/?video_id=${id}&tmdb=1&s=${season}&e=${episode}`;
        case 'moviesapi':
            return `https://moviesapi.club/tv/${id}-${season}-${episode}`;
        case 'vidfast':
            return `https://vidfast.pro/tv/${id}/${season}/${episode}`;
        case 'videasy':
        default:
            return `https://player.videasy.net/tv/${id}/${season}/${episode}`;
    }
}

// Server button click handlers
serverButtons.forEach(btn => {
    btn.addEventListener('click', () => {
        serverButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentServer = (btn as HTMLElement).dataset.server || 'videasy';
        // Reload current content with new server
        if (videoIframe && videoIframe.src && videoIframe.src !== '') {
            if (mediaType === 'movie') {
                videoIframe.src = getMovieUrl(currentServer, mediaId);
            } else {
                updateTvIframe();
            }
        }
    });
});

function updateTvIframe() {
    if (!videoIframe || !seasonSelect || !episodeSelect) return;
    const s = seasonSelect.value || "1";
    const e = episodeSelect.value || "1";
    videoIframe.src = getTvUrl(currentServer, mediaId, s, e);
}

if (watchMovieBtn && playerSection && videoIframe) {
    watchMovieBtn.addEventListener('click', () => {
        playerSection.style.display = 'block';
        
        // Scroll smoothly to the player
        playerSection.scrollIntoView({ behavior: 'smooth' });

        if (mediaType === 'movie') {
            if (playerControls) playerControls.style.display = 'none';
            videoIframe.src = getMovieUrl(currentServer, mediaId);
        } else {
            if (playerControls) playerControls.style.display = 'flex';
            // On a déjà récupéré le nombre de saisons lors du fetchDetails initial
            if (seasonSelect && seasonSelect.options.length === 0 && currentSeasonsCount > 0) {
                populateSeasonSelect();
            } else if (seasonSelect) {
                updateTvIframe();
            }
        }
    });
}

function populateSeasonSelect() {
    if (!seasonSelect) return;
    seasonSelect.innerHTML = '';
    for (let i = 1; i <= currentSeasonsCount; i++) {
        const option = document.createElement('option');
        option.value = i.toString();
        option.textContent = `Saison ${i}`;
        seasonSelect.appendChild(option);
    }
    
    // Auto fetch episodes for season 1
    fetchEpisodes(1);
    
    seasonSelect.addEventListener('change', (e) => {
        const selectedSeason = parseInt((e.target as HTMLSelectElement).value);
        fetchEpisodes(selectedSeason);
    });
}

function fetchEpisodes(seasonNumber: number) {
    if (!episodeSelect) return;
    episodeSelect.innerHTML = '<option value="">Chargement...</option>';
    
    fetch(`${BASE_URL}/tv/${mediaId}/season/${seasonNumber}?api_key=${TMDB_API_KEY}&language=fr-FR`)
        .then(res => res.json())
        .then(data => {
            episodeSelect.innerHTML = '';
            if (data.episodes && data.episodes.length > 0) {
                data.episodes.forEach((ep: any) => {
                    const option = document.createElement('option');
                    option.value = ep.episode_number.toString();
                    option.textContent = `Ép. ${ep.episode_number} - ${ep.name}`;
                    episodeSelect.appendChild(option);
                });
                updateTvIframe();
            } else {
                episodeSelect.innerHTML = '<option value="1">Épisode 1</option>';
                updateTvIframe();
            }
        })
        .catch(err => {
            console.error("Error fetching episodes:", err);
            episodeSelect.innerHTML = '<option value="1">Épisode 1</option>';
            updateTvIframe();
        });
}

if (episodeSelect) {
    episodeSelect.addEventListener('change', updateTvIframe);
}

if (closePlayerBtn && playerSection && videoIframe) {
    closePlayerBtn.addEventListener('click', () => {
        playerSection.style.display = 'none';
        videoIframe.src = ''; // Stop video playing in background
        // Scroll back to top
        window.scrollTo({ top: 0, behavior: 'smooth' });
    });
}

fetchDetails();

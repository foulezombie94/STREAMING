import { SectionConfig, TMDBGenre } from './types';

// 1. Constantes TMDB
export const TMDB_API_KEY = import.meta.env.VITE_TMDB_API_KEY;
export const BASE_URL = 'https://api.themoviedb.org/3';

export const MOVIE_GENRES: TMDBGenre[] = [
    { id: 28, name: "Action" },
    { id: 12, name: "Aventure" },
    { id: 16, name: "Animation" },
    { id: 35, name: "Comédie" },
    { id: 80, name: "Crime" },
    { id: 99, name: "Documentaire" },
    { id: 18, name: "Drame" },
    { id: 10751, name: "Familial" },
    { id: 14, name: "Fantastique" },
    { id: 36, name: "Histoire" },
    { id: 27, name: "Horreur" },
    { id: 10402, name: "Musique" },
    { id: 9648, name: "Mystère" },
    { id: 10749, name: "Romance" },
    { id: 878, name: "Science-Fiction" },
    { id: 10770, name: "Téléfilm" },
    { id: 53, name: "Thriller" },
    { id: 10752, name: "Guerre" },
    { id: 37, name: "Western" }
];

export const TV_GENRES: TMDBGenre[] = [
    { id: 10759, name: "Action & Adventure" },
    { id: 16, name: "Animation" },
    { id: 35, name: "Comédie" },
    { id: 80, name: "Crime" },
    { id: 99, name: "Documentaire" },
    { id: 18, name: "Drame" },
    { id: 10751, name: "Familial" },
    { id: 10762, name: "Kids" },
    { id: 9648, name: "Mystère" },
    { id: 10763, name: "News" },
    { id: 10764, name: "Reality" },
    { id: 10765, name: "Sci-Fi & Fantasy" },
    { id: 10766, name: "Soap" },
    { id: 10767, name: "Talk" },
    { id: 10768, name: "War & Politics" },
    { id: 37, name: "Western" }
];

// Détection de matériel limité
export function detectLowEndDevice(): boolean {
    if (navigator.hardwareConcurrency && navigator.hardwareConcurrency < 4) {
        return true;
    }
    if ((navigator as any).deviceMemory && (navigator as any).deviceMemory < 6) {
        return true;
    }
    const conn = (navigator as any).connection;
    if (conn) {
        if (conn.saveData) return true;
        if (['slow-2g', '2g', '3g'].includes(conn.effectiveType)) return true;
    }
    return false;
}

export const isLowEnd = detectLowEndDevice();
const savedPerfMode = localStorage.getItem('perf_mode');
export const isLowEndActive = savedPerfMode === 'low' || (!savedPerfMode && isLowEnd);

export const IMAGE_W500_URL = isLowEndActive ? 'https://image.tmdb.org/t/p/w342' : 'https://image.tmdb.org/t/p/w500';
export const IMAGE_W342_URL = isLowEndActive ? 'https://image.tmdb.org/t/p/w185' : 'https://image.tmdb.org/t/p/w342';
export const IMAGE_W185_URL = isLowEndActive ? 'https://image.tmdb.org/t/p/w154' : 'https://image.tmdb.org/t/p/w185';

export const GLOBAL_BLACKLIST_IDS = ['36659', '927306', '212502', '77150', '77151', '1017007', '1025539', '1013441', '1439930']; 

export const GENRE_ICONS: { [key: string]: string } = {
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

// 2. Viewport Detection Cache
export let cachedInnerWidth = window.innerWidth;
window.addEventListener('resize', () => {
    cachedInnerWidth = window.innerWidth;
}, { passive: true });

export const isMobileViewport = () => cachedInnerWidth <= 768;

// 3. Shared State
let currentType: 'movie' | 'tv' | 'trending' | 'reprendre' | 'iptv' | 'sagas' = 'trending';
export const getCurrentType = () => currentType;
export const setCurrentType = (type: any) => { currentType = type; };

// 4. API Request Cache
const apiPromises: Record<string, Promise<any>> = {};
export function fetchWithCache(url: string): Promise<any> {
    if (!apiPromises[url]) {
        apiPromises[url] = fetch(url)
            .then(res => {
                if (!res.ok) {
                    delete apiPromises[url];
                    throw new Error(`HTTP error! status: ${res.status}`);
                }
                return res.json();
            })
            .catch(err => {
                delete apiPromises[url];
                throw err;
            });
    }
    return apiPromises[url];
}

// 5. DOM Getters
export const getNavbar = () => document.getElementById('navbar');
export const getHeroSection = () => document.getElementById('hero-carousel');
export const getHeroSlidesContainer = () => document.getElementById('hero-slides');
export const getHeroDotsContainer = () => document.getElementById('carousel-dots');
export const getHeroProgress = () => document.getElementById('carousel-progress');
export const getHeroPauseBtn = () => document.getElementById('carousel-pause');
export const getHeroPrevBtn = () => document.getElementById('carousel-prev');
export const getHeroNextBtn = () => document.getElementById('carousel-next');

export const getNavItems = () => document.querySelectorAll('.nav-item');
export const getSectionTitle = () => document.querySelector('.section-title');
export const getSearchTrigger = () => document.getElementById('search-trigger');
export const getSearchOverlay = () => document.getElementById('search-overlay');
export const getCloseSearch = () => document.getElementById('close-search');
export const getSearchInput = () => document.getElementById('search-input-premium') as HTMLInputElement | null;

export const getMainContent = () => document.getElementById('main-content');
export const getIptvSection = () => document.getElementById('iptv-section');
export const getGenreFiltersContainer = () => document.getElementById('genre-filters-container');

// 6. Global Toast Helper
export function showToast(message: string, duration = 3500) {
    let toast = document.getElementById('mv-toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'mv-toast';
        toast.style.cssText = [
            'position:fixed',
            'bottom:90px',
            'left:50%',
            'transform:translateX(-50%) translateY(20px)',
            'background:rgba(15,15,15,0.95)',
            'color:#fff',
            'padding:12px 24px',
            'border-radius:50px',
            'font-size:14px',
            'font-weight:600',
            'font-family:Inter,sans-serif',
            'border:1px solid rgba(255,255,255,0.1)',
            'backdrop-filter:blur(20px)',
            'box-shadow:0 8px 30px rgba(0,0,0,0.5)',
            'z-index:99999',
            'opacity:0',
            'transition:opacity 0.3s ease,transform 0.3s ease',
            'pointer-events:none',
            'white-space:nowrap',
            'max-width:90vw',
            'text-align:center',
        ].join(';');
        document.body.appendChild(toast);
    }
    toast.textContent = message;
    requestAnimationFrame(() => {
        toast!.style.opacity = '1';
        toast!.style.transform = 'translateX(-50%) translateY(0)';
    });
    setTimeout(() => {
        toast!.style.opacity = '0';
        toast!.style.transform = 'translateX(-50%) translateY(20px)';
    }, duration);
}

export const SECTIONS_CONFIG: SectionConfig[] = [
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

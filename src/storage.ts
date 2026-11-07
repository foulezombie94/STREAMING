import { profileStorageKey } from './profile-store';
/**
 * Gestionnaire de progression et d'historique (LocalStorage)
 */

interface VideoProgress {
    mediaId: string;
    mediaType: 'movie' | 'tv';
    time: number; // en secondes
    duration: number;
    season?: number;
    episode?: number;
    lastUpdated: number;
    title: string;
    poster: string;
    backdrop: string;
    overview: string;
    rating: number;
    year: string;
    tagline: string;
    genres?: string[];
}

const STORAGE_KEY = 'movieverse_progress';

let progressCache: Record<string, VideoProgress> | null = null;

export const ProgressManager = {
    /**
     * Sauvegarde la progression d'une vidéo
     */
    saveProgress(data: Partial<VideoProgress>) {
        if (!data.mediaId) return;

        const allProgress = this.getAllProgress();
        const id = this.generateId(data.mediaId, data.mediaType as string);

        const progress: VideoProgress = {
            ...allProgress[id],
            mediaId: data.mediaId,
            mediaType: (data.mediaType || allProgress[id]?.mediaType) as any,
            time: data.time !== undefined ? data.time : (allProgress[id]?.time || 0),
            duration: data.duration !== undefined ? data.duration : (allProgress[id]?.duration || 0),
            season: data.season !== undefined ? data.season : allProgress[id]?.season,
            episode: data.episode !== undefined ? data.episode : allProgress[id]?.episode,
            title: data.title || allProgress[id]?.title || '',
            poster: data.poster || allProgress[id]?.poster || '',
            backdrop: data.backdrop || allProgress[id]?.backdrop || '',
            overview: data.overview || allProgress[id]?.overview || '',
            rating: data.rating !== undefined ? data.rating : (allProgress[id]?.rating || 0),
            year: data.year || allProgress[id]?.year || '',
            tagline: data.tagline || allProgress[id]?.tagline || '',
            genres: data.genres || allProgress[id]?.genres || [],
            lastUpdated: Date.now()
        };

        // Mettre à jour avec les nouvelles valeurs
        if (data.time !== undefined) progress.time = data.time;
        if (data.duration !== undefined) progress.duration = data.duration;
        if (data.lastUpdated !== undefined) progress.lastUpdated = data.lastUpdated;

        allProgress[id] = progress;
        progressCache = allProgress;
        
        try {
            localStorage.setItem(profileStorageKey(STORAGE_KEY), JSON.stringify(allProgress));
        } catch (e) {
            console.warn("LocalStorage bloqué ou plein", e);
        }
    },

    /**
     * Récupère la progression pour une vidéo spécifique
     */
    getProgress(mediaId: string, mediaType: string): VideoProgress | null {
        const allProgress = this.getAllProgress();
        const id = this.generateId(mediaId, mediaType);
        
        const data = allProgress[id];
        if (!data) return null;

        // Sécurité : Vérifier que c'est bien un chiffre valide
        if (typeof data.time !== 'number' || isNaN(data.time)) return null;

        return data;
    },

    /**
     * Récupère tout l'historique trié par date (du plus récent au plus ancien)
     */
    getHistory(): VideoProgress[] {
        const all = this.getAllProgress();
        return Object.values(all).sort((a, b) => b.lastUpdated - a.lastUpdated);
    },

    /**
     * Supprime la progression (quand la vidéo est terminée)
     */
    clearProgress(mediaId: string, mediaType: string) {
        const allProgress = this.getAllProgress();
        const id = this.generateId(mediaId, mediaType);
        
        if (allProgress[id]) {
            delete allProgress[id];
            progressCache = allProgress;
            try {
                localStorage.setItem(profileStorageKey(STORAGE_KEY), JSON.stringify(allProgress));
            } catch (e) {
                console.warn("LocalStorage bloqué ou plein", e);
            }
        }
    },

    /**
     * Génère un identifiant unique (Rule 1)
     */
    generateId(mediaId: string, mediaType: string): string {
        return `${mediaType.toLowerCase()}_${mediaId}`;
    },

    /**
     * Helper pour lire le stockage
     */
    getAllProgress(): Record<string, VideoProgress> {
        if (progressCache !== null) {
            return progressCache;
        }
        try {
            const data = localStorage.getItem(profileStorageKey(STORAGE_KEY));
            progressCache = data ? JSON.parse(data) : {};
            return progressCache!;
        } catch (e) {
            progressCache = {};
            return progressCache;
        }
    }
};

const FAVORITES_KEY = 'movieverse_favorites';

// Cache mémoire : isFavorite() est appelé pour CHAQUE carte rendue,
// on évite donc de re-parser le JSON du localStorage à chaque fois.
let favoritesCache: Record<string, any> | null = null;

function saveFavorites(favorites: Record<string, any>) {
    favoritesCache = favorites;
    try {
        localStorage.setItem(profileStorageKey(FAVORITES_KEY), JSON.stringify(favorites));
    } catch (e) {
        console.warn("LocalStorage bloqué ou plein", e);
    }
}

// Synchronisation si les favoris sont modifiés dans un autre onglet
window.addEventListener('storage', (e) => {
    if (e.key === profileStorageKey(FAVORITES_KEY)) favoritesCache = null;
    if (e.key === profileStorageKey(STORAGE_KEY)) progressCache = null;
});

export const FavoritesManager = {
    toggleFavorite(mediaId: string, mediaType: string, details: any): boolean {
        const favorites = this.getAllFavorites();
        const id = `${mediaType}_${mediaId}`;
        if (favorites[id]) {
            delete favorites[id];
            saveFavorites(favorites);
            return false;
        } else {
            favorites[id] = {
                mediaId,
                mediaType,
                title: details.title || details.name,
                poster: details.poster_path || details.poster,
                backdrop: details.backdrop_path || details.backdrop,
                overview: details.overview || details.description,
                rating: details.vote_average,
                year: details.release_date || details.first_air_date ? new Date(details.release_date || details.first_air_date).getFullYear().toString() : '',
                genres: details.genres ? details.genres.map((g: any) => g.name || g) : []
            };
            saveFavorites(favorites);
            return true;
        }
    },
    isFavorite(mediaId: string, mediaType: string): boolean {
        const favorites = this.getAllFavorites();
        return !!favorites[`${mediaType}_${mediaId}`];
    },
    getAllFavorites(): Record<string, any> {
        if (favoritesCache !== null) return favoritesCache;
        try {
            const data = localStorage.getItem(profileStorageKey(FAVORITES_KEY));
            favoritesCache = data ? JSON.parse(data) : {};
        } catch (e) {
            favoritesCache = {};
        }
        return favoritesCache!;
    }
};


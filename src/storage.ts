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
}

const STORAGE_KEY = 'movieverse_progress';

export const ProgressManager = {
    /**
     * Sauvegarde la progression d'une vidéo
     */
    saveProgress(data: Partial<VideoProgress>) {
        if (!data.mediaId) return;

        const allProgress = this.getAllProgress();
        const id = this.generateId(data.mediaId, data.mediaType as string, data.season, data.episode);

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
            lastUpdated: Date.now()
        };

        // Mettre à jour avec les nouvelles valeurs
        if (data.time !== undefined) progress.time = data.time;
        if (data.duration !== undefined) progress.duration = data.duration;
        if (data.lastUpdated !== undefined) progress.lastUpdated = data.lastUpdated;

        allProgress[id] = progress;
        
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(allProgress));
        } catch (e) {
            console.warn("LocalStorage bloqué ou plein", e);
        }
    },

    /**
     * Récupère la progression pour une vidéo spécifique
     */
    getProgress(mediaId: string, mediaType: string, season?: number, episode?: number): VideoProgress | null {
        const allProgress = this.getAllProgress();
        const id = this.generateId(mediaId, mediaType, season, episode);
        
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
    clearProgress(mediaId: string, mediaType: string, season?: number, episode?: number) {
        const allProgress = this.getAllProgress();
        const id = this.generateId(mediaId, mediaType, season, episode);
        
        if (allProgress[id]) {
            delete allProgress[id];
            localStorage.setItem(STORAGE_KEY, JSON.stringify(allProgress));
        }
    },

    /**
     * Génère un identifiant unique (Rule 1)
     */
    generateId(mediaId: string, mediaType: string, season?: number, episode?: number): string {
        let id = `${mediaType}_${mediaId}`;
        if (mediaType === 'tv') {
            id += `_s${season || 1}_e${episode || 1}`;
        }
        return id;
    },

    /**
     * Helper pour lire le stockage
     */
    getAllProgress(): Record<string, VideoProgress> {
        try {
            const data = localStorage.getItem(STORAGE_KEY);
            return data ? JSON.parse(data) : {};
        } catch (e) {
            return {};
        }
    }
};

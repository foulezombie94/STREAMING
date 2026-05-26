export interface TMDBMedia {
    id: number | string;
    title?: string;
    name?: string;
    original_title?: string;
    original_name?: string;
    overview?: string;
    poster_path?: string;
    backdrop_path?: string;
    vote_average?: number;
    vote_count?: number;
    popularity?: number;
    genre_ids?: number[];
    media_type?: string;
    release_date?: string;
    first_air_date?: string;
    tagline?: string;
    runtime?: number;
    status?: string;
    original_language?: string;
    number_of_seasons?: number;
    number_of_episodes?: number;
    genres?: TMDBGenre[];
    credits?: {
        cast: TMDBCastMember[];
        crew: TMDBCrewMember[];
    };
    videos?: {
        results: TMDBVideo[];
    };
    production_companies?: { name: string }[];
    networks?: { name: string }[];
    created_by?: { name: string }[];
    budget?: number;
    revenue?: number;
    poster?: string;
    backdrop?: string;
    description?: string;
    isSaga?: boolean;
    seasons?: TMDBSeason[];
}

export interface SectionConfig {
    id: string;
    title: string;
    endpoint: string;
    params?: string;
    icon: string;
    mediaType: 'movie' | 'tv' | 'trending' | string;
}

export interface TMDBGenre {
    id: number;
    name: string;
}

export interface TMDBCredits {
    cast: TMDBCastMember[];
    crew: TMDBCrewMember[];
}

export interface TMDBCastMember {
    id: number;
    name: string;
    character: string;
    profile_path: string | null;
}

export interface TMDBCrewMember {
    id: number;
    name: string;
    job: string;
    department: string;
}

export interface TMDBVideo {
    key: string;
    site: string;
    type: string;
}

export interface TMDBActorDetail {
    id: number;
    name: string;
    biography: string;
    birthday: string | null;
    place_of_birth: string | null;
    profile_path: string | null;
    deathday: string | null;
}

export interface CoflixSource {
    url: string;
    name: string;
    lang: string;
}

export interface TMDBSeason {
    season_number: number;
    episode_count: number;
    id: number;
    name: string;
}

export interface TMDBEpisode {
    episode_number: number;
    name: string;
    overview: string;
}

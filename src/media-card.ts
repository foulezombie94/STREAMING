import type { TMDBMedia } from './types';
import { ProgressManager, FavoritesManager } from './storage';
import { escapeHtml as esc, imageUrl, icon } from './ui';

export function renderMediaCard(item: TMDBMedia, forceType = 'auto', extra = '', extraUrlParams = '', loading: 'lazy' | 'eager' = 'lazy', rank = 0) {
    const type = item.media_type === 'tv' || item.media_type === 'movie' ? item.media_type : (forceType === 'tv' || forceType === 'movie' ? forceType : item.title ? 'movie' : 'tv');
    const title = item.title || item.name || 'Sans titre';
    const year = (item.release_date || item.first_air_date || '').slice(0, 4);
    const favorite = FavoritesManager.isFavorite(String(item.id), type);
    const progress = ProgressManager.getProgress(String(item.id), type);
    const percentage = progress?.duration ? Math.min(100, Math.round(progress.time / progress.duration * 100)) : 0;
    const picture = rank ? item.poster_path : item.backdrop_path || item.poster_path;
    const posterFallback = !rank && !item.backdrop_path;
    return `<article class="movie-card${rank ? ' top-ten-card' : ''}${posterFallback ? ' poster-fallback' : ''}" data-id="${esc(item.id)}" data-type="${type}" data-extra="${esc(extraUrlParams)}" data-media="${esc(JSON.stringify(item))}">${rank ? `<span class="rank-number" aria-hidden="true">${rank}</span>` : ''}<button class="card-open" aria-label="Plus d’infos sur ${esc(title)}">${picture ? `<img src="${esc(imageUrl(picture, rank ? 'w342' : 'w500'))}" alt="" width="${rank ? 342 : 500}" height="${rank ? 513 : 281}" loading="${loading}" decoding="async">` : '<span class="card-placeholder">MOVIEVERSE</span>'}<span class="card-shade"></span><span class="card-wordmark">${esc(title)}</span></button><div class="card-hover-details"><div class="card-actions"><a class="round-control card-play" aria-label="Lire ${esc(title)}" href="/details.html?id=${esc(item.id)}&type=${type}&autoplay=1${esc(extraUrlParams)}">${icon('play')}</a><button class="round-control card-fav-btn${favorite ? ' active' : ''}" aria-label="${favorite ? 'Retirer de ma liste' : 'Ajouter à ma liste'}" aria-pressed="${favorite}" onclick="toggleFavoriteFromCard('${esc(item.id)}','${type}',this,event)">${icon(favorite ? 'check' : 'plus')}</button><button class="round-control card-more" aria-label="Plus d’infos sur ${esc(title)}">${icon('down')}</button></div><h3 class="card-title">${esc(title)}</h3><div class="card-meta">${item.vote_average ? `<span class="card-rating">${item.vote_average.toFixed(1)}/10</span>` : ''}<span class="card-year">${esc(year)}</span><span>${type === 'tv' ? 'Série' : 'Film'}</span></div></div>${percentage ? `<div class="progress-bar-mini"><div class="progress-fill" style="width:${percentage}%"></div></div>` : ''}${extra}</article>`;
}

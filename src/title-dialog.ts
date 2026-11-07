import { TMDB_API_KEY, BASE_URL, fetchWithCache } from './globals';
import { FavoritesManager } from './storage';
import type { TMDBMedia } from './types';
import { escapeHtml as esc, imageUrl, icon, prepareDialog } from './ui';
import { profileStorageKey } from './profile-store';

export function openTitle(id: string, type: string, preview?: TMDBMedia, extra = '') {
    if (!['movie', 'tv'].includes(type)) return;
    document.querySelector<HTMLDialogElement>('.title-dialog')?.close();
    const dialog = document.createElement('dialog');
    dialog.className = 'title-dialog';
    dialog.setAttribute('aria-labelledby', 'title-dialog-heading');
    let media = preview;
    let active = true;
    const url = `/details.html?id=${encodeURIComponent(id)}&type=${type}`;
    const draw = (data?: TMDBMedia) => {
        media = data;
        const title = data?.title || data?.name || 'Chargement…';
        const favorite = FavoritesManager.isFavorite(id, type);
        const year = (data?.release_date || data?.first_air_date || '').slice(0, 4);
        dialog.innerHTML = `<div class="title-dialog-hero" ${data?.backdrop_path ? `style="background-image:url('${esc(imageUrl(data.backdrop_path, 'w1280'))}')"` : ''}><button class="round-control dialog-close" aria-label="Fermer la fiche">${icon('close')}</button><div class="title-dialog-heading"><span class="original-label"><b>M</b> ${type === 'tv' ? 'S É R I E' : 'F I L M'}</span><h1 id="title-dialog-heading">${esc(title)}</h1><div class="title-dialog-actions"><a class="white-button" href="${url}&autoplay=1${esc(extra)}">${icon('play')} Lecture</a><button class="round-control title-favorite ${favorite ? 'is-saved' : ''}" aria-label="${favorite ? 'Retirer de ma liste' : 'Ajouter à ma liste'}" aria-pressed="${favorite}">${icon(favorite ? 'check' : 'plus')}</button><button class="round-control title-like" aria-label="J’aime" aria-pressed="false">${icon('like')}</button></div></div></div><div class="title-dialog-body"><div class="title-description"><div class="title-meta">${data?.vote_average ? `<span class="match-score">Note ${data.vote_average.toFixed(1)}/10</span>` : ''}<span>${year}</span>${data?.number_of_seasons ? `<span>${data.number_of_seasons} saison${data.number_of_seasons > 1 ? 's' : ''}</span>` : ''}${data?.runtime ? `<span>${Math.floor(data.runtime / 60)} h ${data.runtime % 60} min</span>` : ''}</div><p>${esc(data?.overview || 'Les informations du programme sont en cours de chargement.')}</p></div><div class="title-credits">${data?.credits?.cast?.length ? `<p><span>Distribution :</span> ${esc(data.credits.cast.slice(0, 5).map(c => c.name).join(', '))}</p>` : ''}${data?.genres?.length ? `<p><span>Genres :</span> ${esc(data.genres.map(g => g.name).join(', '))}</p>` : ''}<a href="${url}">Voir la fiche complète ›</a></div><div class="dialog-episodes"></div><div class="dialog-similar"></div><div class="title-about"><h2>À propos de ${esc(title)}</h2><p>${esc(data?.tagline || 'Découvrez les détails, la distribution et les bandes-annonces de ce programme.')}</p></div></div>`;
        dialog.querySelector('.dialog-close')?.addEventListener('click', () => dialog.close());
        const favoriteButton = dialog.querySelector<HTMLButtonElement>('.title-favorite')!;
        favoriteButton.disabled = !data;
        favoriteButton.addEventListener('click', () => {
            if (!media) return;
            const saved = FavoritesManager.toggleFavorite(id, type, media);
            favoriteButton.innerHTML = icon(saved ? 'check' : 'plus');
            favoriteButton.setAttribute('aria-pressed', String(saved));
            favoriteButton.setAttribute('aria-label', saved ? 'Retirer de ma liste' : 'Ajouter à ma liste');
            document.dispatchEvent(new CustomEvent('library-changed'));
        });
        const likeKey = profileStorageKey(`movieverse_like_${id}_${type}`);
        const like = dialog.querySelector('.title-like')!;
        like.setAttribute('aria-pressed', String(localStorage.getItem(likeKey) === 'true'));
        like.addEventListener('click', () => {
            const liked = like.getAttribute('aria-pressed') !== 'true';
            localStorage.setItem(likeKey, String(liked));
            like.setAttribute('aria-pressed', String(liked));
        });
    };
    draw(preview);
    prepareDialog(dialog);
    dialog.addEventListener('close', () => { active = false; }, { once: true });
    fetchWithCache(`${BASE_URL}/${type}/${encodeURIComponent(id)}?api_key=${TMDB_API_KEY}&language=fr-FR&append_to_response=credits,recommendations`).then(data => {
        if (!active) return;
        draw(data);
        if (type === 'tv' && data.seasons?.length) {
            const seasons = data.seasons.filter((s: { season_number: number }) => s.season_number > 0);
            const container = dialog.querySelector<HTMLElement>('.dialog-episodes')!;
            container.innerHTML = `<div class="episodes-heading"><h2>Épisodes</h2><select aria-label="Choisir une saison">${seasons.map((s: { season_number: number; name: string }) => `<option value="${s.season_number}">${esc(s.name)}</option>`).join('')}</select></div><div class="episode-list" aria-live="polite"></div>`;
            const list = container.querySelector<HTMLElement>('.episode-list')!;
            let version = 0;
            const load = async (season: string) => {
                const request = ++version;
                list.innerHTML = '<p class="loading-message">Chargement des épisodes…</p>';
                try {
                    const result = await fetchWithCache(`${BASE_URL}/tv/${encodeURIComponent(id)}/season/${season}?api_key=${TMDB_API_KEY}&language=fr-FR`);
                    if (!active || request !== version) return;
                    list.innerHTML = result.episodes?.length ? result.episodes.map((ep: { episode_number: number; still_path?: string; name: string; runtime?: number; overview?: string }) => `<a class="episode-row" href="${url}&autoplay=1&season=${season}&episode=${ep.episode_number}"><span class="episode-number">${ep.episode_number}</span><span class="episode-still">${ep.still_path ? `<img src="${esc(imageUrl(ep.still_path, 'w300'))}" alt="" loading="lazy">` : icon('play')}</span><span class="episode-description"><strong>${esc(ep.name)}${ep.runtime ? `<small>${ep.runtime} min</small>` : ''}</strong><span>${esc(ep.overview || 'Découvrez cet épisode.')}</span></span></a>`).join('') : '<p class="loading-message">Aucun épisode disponible pour cette saison.</p>';
                } catch { if (active && request === version) list.innerHTML = '<p class="loading-message">Les épisodes sont indisponibles pour le moment. Réessayez en changeant de saison.</p>'; }
            };
            const select = container.querySelector('select')!;
            select.addEventListener('change', () => load(select.value));
            if (select.value) load(select.value);
        }
        const similar = dialog.querySelector<HTMLElement>('.dialog-similar')!;
        const recommendations: TMDBMedia[] = (data.recommendations?.results || []).filter((m: TMDBMedia) => m.backdrop_path).slice(0, 6);
        if (recommendations.length) {
            similar.innerHTML = `<h2>Vous aimerez aussi</h2><div class="similar-grid">${recommendations.map(m => `<button class="similar-card" data-id="${m.id}"><img src="${esc(imageUrl(m.backdrop_path, 'w500'))}" alt="" loading="lazy"><strong>${esc(m.title || m.name)}</strong><span>${esc(m.overview || '')}</span></button>`).join('')}</div>`;
            similar.querySelectorAll<HTMLElement>('[data-id]').forEach(button => button.addEventListener('click', () => openTitle(button.dataset.id!, type, recommendations.find(m => String(m.id) === button.dataset.id))));
        }
    }).catch(() => {
        if (!active) return;
        const body = dialog.querySelector('.title-dialog-body')!;
        const message = document.createElement('p');
        message.className = 'loading-message';
        message.textContent = 'Les informations détaillées sont momentanément indisponibles.';
        body.prepend(message);
    });
}

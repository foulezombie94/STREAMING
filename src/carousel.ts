import { TMDBMedia } from './types';
import { 
    GLOBAL_BLACKLIST_IDS, 
    cachedInnerWidth, 
    getCurrentType, 
    getHeroProgress, 
    getHeroPauseBtn, 
    getHeroPrevBtn, 
    getHeroNextBtn, 
    getHeroSlidesContainer, 
    getHeroDotsContainer 
} from './globals';
// sagas est importé dynamiquement dans setSagaSlides() uniquement

export class HeroCarouselManager {
    private slides: TMDBMedia[] = [];
    private currentIndex: number = 0;
    private rafId: number = 0;
    private lastTimestamp: number = 0;
    private progress: number = 0;
    private isPaused: boolean = false;
    private isIntersecting: boolean = true;
    private readonly DURATION: number = 8000;

    constructor() {
        this.initEventListeners();
        this.initSwipe();
        
        // Pause le carousel quand l'onglet est en arrière-plan (économie CPU/batterie)
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                this.stop();
            } else if (this.slides.length > 0 && !this.isPaused) {
                this.start();
            }
        });

        // Désactive le carrousel lorsqu'il n'est pas affiché à l'écran (économie CPU/batterie)
        const heroSection = document.getElementById('hero-carousel');
        if (heroSection && 'IntersectionObserver' in window) {
            const observer = new IntersectionObserver((entries) => {
                const entry = entries[0];
                this.isIntersecting = entry.isIntersecting;
                if (!entry.isIntersecting) {
                    this.stop();
                } else if (this.slides.length > 0 && !this.isPaused) {
                    this.start();
                }
            }, { threshold: 0.05 });
            observer.observe(heroSection);
        }
    }

    private initEventListeners() {
        getHeroPauseBtn()?.addEventListener('click', () => this.togglePause());
        getHeroPrevBtn()?.addEventListener('click', () => this.prevSlide());
        getHeroNextBtn()?.addEventListener('click', () => this.nextSlide());

        // Event Delegation for slides
        getHeroSlidesContainer()?.addEventListener('click', (e) => {
            const target = e.target as HTMLElement;
            const btn = target.closest('button');
            if (btn) {
                const id = btn.getAttribute('data-id');
                const type = btn.getAttribute('data-type');
                if (id && type) {
                    if (type === 'saga') {
                        (window as any).renderSagaDetailsPage(id);
                    } else {
                        // Trouver le media dans les slides du carousel pour l'aperçu instantané
                        const foundMedia = this.slides.find(s => s.id.toString() === id);
                        if (foundMedia) {
                            sessionStorage.setItem('current_media_preview', JSON.stringify(foundMedia));
                        } else {
                            sessionStorage.removeItem('current_media_preview');
                        }
                        window.location.href = `/details.html?id=${id}&type=${type}`;
                    }
                }
            }
        });
    }

    // Swipe tactile natif sur le hero carousel (H-1)
    private initSwipe() {
        let touchStartX = 0;
        let touchStartY = 0;
        getHeroSlidesContainer()?.addEventListener('touchstart', (e) => {
            touchStartX = e.touches[0].clientX;
            touchStartY = e.touches[0].clientY;
        }, { passive: true });
        getHeroSlidesContainer()?.addEventListener('touchend', (e) => {
            const dx = touchStartX - e.changedTouches[0].clientX;
            const dy = Math.abs(touchStartY - e.changedTouches[0].clientY);
            // Swipe horizontal uniquement (évite conflit avec scroll vertical)
            if (Math.abs(dx) > 50 && Math.abs(dx) > dy) {
                dx > 0 ? this.nextSlide() : this.prevSlide();
            }
        }, { passive: true });
    }

    public setSlides(data: TMDBMedia[]) {
        // Filtrer les IDs blacklistés
        const filtered = data.filter(item => !GLOBAL_BLACKLIST_IDS.includes(item.id.toString()));
        // Mélanger les données au hasard entre films et séries tendances
        const shuffled = [...filtered].sort(() => 0.5 - Math.random());
        this.slides = shuffled.slice(0, 6); 
        this.renderSlides();
        this.renderDots();
        this.goToSlide(0);
        this.start();
    }

    private renderSlides() {
        const slidesContainer = getHeroSlidesContainer();
        if (!slidesContainer) return;
        // Retirer le placeholder LCP statique avant d'injecter les vraies slides
        const placeholder = document.getElementById('hero-lcp-placeholder');
        if (placeholder) placeholder.remove();

        // Poids réseau optimisé de manière granulaire sur mobile (M-2 : w300 pour mobile <480px, w780 pour tablette, w1280 pour desktop)
        const width = cachedInnerWidth;
        const backdropSize = width <= 480 ? 'w300' : (width <= 768 ? 'w780' : 'w1280');
        const IMAGE_HERO_URL = `https://image.tmdb.org/t/p/${backdropSize}`;

        slidesContainer.innerHTML = this.slides.map((item, index) => {
            const isSaga = !!(item as any).isSaga;
            const displayType = isSaga ? 'saga' : (item.media_type || (getCurrentType() === 'tv' ? 'tv' : 'movie'));
            const title = isSaga ? (item as any).title : (displayType === 'tv' ? (item.name || item.original_name) : (item.title || item.original_title));
            const releaseDate = isSaga ? null : (displayType === 'tv' ? item.first_air_date : item.release_date);
            const releaseYear = releaseDate ? new Date(releaseDate).getFullYear() : (isSaga ? 'SAGA' : 'N/A');
            const rating = isSaga ? 'N/A' : (item.vote_average ? item.vote_average.toFixed(1) : '0.0');
            
            // Pour les sagas, on utilise l'image des icônes (poster) comme demandé par l'utilisateur
            let backdropUrl = isSaga ? item.poster : (item.backdrop || (item.backdrop_path ? `${IMAGE_HERO_URL}${item.backdrop_path}` : ''));
            
            // Si l'image est manquante ou cassée
            if (!backdropUrl || backdropUrl.includes('86Yp1S669SFWFWFW') || backdropUrl === '') {
                backdropUrl = 'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?q=80&w=2070&auto=format&fit=crop';
            }

            const overview = (item as any).description || item.overview || "Aucun synopsis disponible.";
            const isLongTitle = title && title.length > 18;

            return `
                <div class="hero-slide ${index === 0 ? 'active' : ''} ${isLongTitle ? 'long-title' : ''}" style="${index === 0 ? '' : `background-image: url('${backdropUrl}')`}" data-index="${index}">
                    ${index === 0
                        ? `<img src="${backdropUrl}"
                               alt=""
                               fetchpriority="high"
                               loading="eager"
                               decoding="async"
                               style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:center;z-index:0;pointer-events:none;"
                               onerror="this.parentElement.style.backgroundImage='url(https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?q=80&w=1400&auto=format&fit=crop)';">`
                        : ''
                    }
                    <div class="slide-content">
                        <div class="slide-info">
                            <span class="type-tag">${isSaga ? 'COLLECTION' : (item.genre_ids?.includes(16) ? 'ANIMÉ' : (displayType === 'tv' ? 'SÉRIE' : 'FILM'))}</span>
                            <span class="year-tag">
                                <span class="material-symbols-outlined">calendar_today</span>
                                ${releaseYear}
                            </span>
                            <span class="rating-tag" style="${isSaga ? 'display:none' : ''}">
                                <span class="material-symbols-outlined">star</span>
                                ${rating}
                            </span>
                        </div>
                        <h1>${title}</h1>
                        <p class="slide-synopsis">${overview}</p>
                        <div class="slide-actions">
                            <button class="hero-btn-play" data-id="${item.id}" data-type="${displayType}"><span class="material-symbols-outlined">${isSaga ? 'visibility' : 'play_arrow'}</span><span>${isSaga ? 'Découvrir' : 'Lecture'}</span></button>
                            <button class="hero-btn-info" data-id="${item.id}" data-type="${displayType}"><span class="material-symbols-outlined">info</span><span>Plus d'infos</span></button>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    }

    private renderDots() {
        const dotsContainer = getHeroDotsContainer();
        if (!dotsContainer) return;
        dotsContainer.innerHTML = this.slides.map((_, index) => `
            <div class="dot ${index === 0 ? 'active' : ''}" data-index="${index}"></div>
        `).join('');

        dotsContainer.querySelectorAll('.dot').forEach(dot => {
            dot.addEventListener('click', () => {
                const index = parseInt(dot.getAttribute('data-index') || '0');
                this.goToSlide(index);
            });
        });
    }

    private goToSlide(index: number) {
        this.currentIndex = index;
        this.progress = 0;
        this.updateDOM();
    }

    private updateDOM() {
        const slides = document.querySelectorAll('.hero-slide');
        const dots = document.querySelectorAll('.dot');
        
        slides.forEach(s => s.classList.remove('active'));
        dots.forEach(d => d.classList.remove('active'));

        if (slides[this.currentIndex]) slides[this.currentIndex].classList.add('active');
        if (dots[this.currentIndex]) dots[this.currentIndex].classList.add('active');

        const progressEl = getHeroProgress();
        if (progressEl) progressEl.style.width = '0%';
    }

    public nextSlide() {
        this.currentIndex = (this.currentIndex + 1) % this.slides.length;
        this.goToSlide(this.currentIndex);
    }

    public prevSlide() {
        this.currentIndex = (this.currentIndex - 1 + this.slides.length) % this.slides.length;
        this.goToSlide(this.currentIndex);
    }

    private togglePause() {
        this.isPaused = !this.isPaused;
        const icon = getHeroPauseBtn()?.querySelector('.material-symbols-outlined');
        if (icon) icon.textContent = this.isPaused ? 'play_arrow' : 'pause';
        if (this.isPaused) {
            this.stop();
        } else {
            this.start();
        }
    }

    public start() {
        this.stop();
        if (this.isPaused || !this.isIntersecting || document.documentElement.classList.contains('low-perf')) return;
        this.lastTimestamp = 0;
        const tick = (timestamp: number) => {
            if (this.isPaused || !this.isIntersecting || document.documentElement.classList.contains('low-perf')) {
                this.stop();
                return;
            }
            if (this.lastTimestamp === 0) this.lastTimestamp = timestamp;
            const elapsed = timestamp - this.lastTimestamp;
            this.lastTimestamp = timestamp;
            this.progress += (elapsed / this.DURATION) * 100;
            const progressEl = getHeroProgress();
            if (progressEl) progressEl.style.width = `${Math.min(this.progress, 100)}%`;
            if (this.progress >= 100) {
                this.nextSlide();
                this.lastTimestamp = timestamp;
            }
            this.rafId = requestAnimationFrame(tick);
        };
        this.rafId = requestAnimationFrame(tick);
    }

    public stop() {
        if (this.rafId) cancelAnimationFrame(this.rafId);
        this.rafId = 0;
    }

    public getSlidesCount(): number {
        return this.slides.length;
    }

    public getCurrentIndex(): number {
        return this.currentIndex;
    }

    public refresh() {
        this.updateDOM();
    }

    public async setSagaSlides() {
        // Chargement dynamique : sagas.ts + sagas_data.ts ne sont téléchargés que si on navigue sur la page Sagas
        const { loadSagasData, SAGAS_DATA } = await import('./sagas');
        await loadSagasData();
        // Prendre les 50 premières sagas (les plus connues)
        const topSagas = SAGAS_DATA.slice(0, 50);
        // En choisir 6 au hasard
        const shuffled = [...topSagas].sort(() => 0.5 - Math.random());
        this.slides = shuffled.slice(0, 6).map(s => ({ ...s, isSaga: true }));
        this.renderSlides();
        this.renderDots();
        this.goToSlide(0);
        this.start();
    }
}

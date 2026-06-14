import { 
    getNavbar 
} from './globals';

// --- LIVE TV SECTION (Xtream Codes API) ---
let liveTVInitialized = false;
let allLiveChannels: any[] = [];
let liveCategories: any[] = [];
let iptvCurrentPage = 1;
const iptvItemsPerPage = 48;
let xtreamConfig = {
    host: localStorage.getItem('xtream_host') || '',
    user: localStorage.getItem('xtream_user') || '',
    pass: localStorage.getItem('xtream_pass') || ''
};

// HLS.js et MPEG-TS sont chargés dynamiquement uniquement quand nécessaire (voir playLiveChannel)
let HlsLib: any = null;
let mpegtsLib: any = null;

async function loadHlsLib(): Promise<any> {
    if (HlsLib) return HlsLib;
    const mod = await import('https://cdn.jsdelivr.net/npm/hls.js@1.5.15/dist/hls.mjs' as any);
    HlsLib = (mod as any).default ?? mod;
    return HlsLib;
}

async function loadMpegtsLib(): Promise<any> {
    if (mpegtsLib) return mpegtsLib;
    const mod = await import('https://cdn.jsdelivr.net/npm/mpegts.js@1.7.3/+esm' as any);
    mpegtsLib = (mod as any).default ?? mod;
    return mpegtsLib;
}

export async function initLiveTV() {
    console.log("[IPTV] Initialisation de l'onglet TV...");
    const liveContent = document.getElementById('live-tv-content');
    const loginForm = document.getElementById('xtream-login');
    const liveGrid = document.getElementById('live-grid');
    const categoriesContainer = document.getElementById('live-categories');
    
    if (!liveContent || !loginForm || !liveGrid || !categoriesContainer) {
        console.error("[IPTV] Éléments DOM manquants pour l'IPTV", { liveContent, loginForm, liveGrid, categoriesContainer });
        return;
    }

    // Si on a déjà des identifiants, on tente de charger
    if (xtreamConfig.host && xtreamConfig.user && xtreamConfig.pass) {
        console.log("[IPTV] Identifiants trouvés, chargement des données...");
        const navbar = getNavbar(); if (navbar) navbar.style.display = 'none'; // Cacher le header global en mode TV active
        loginForm.style.display = 'none';
        liveContent.style.display = 'flex';
        if (!liveTVInitialized) await loadXtreamData();
        else console.log("[IPTV] Données déjà initialisées.");
    } else {
        console.log("[IPTV] Aucun identifiant trouvé, affichage du formulaire de login.");
        const navbar = getNavbar(); if (navbar) {
            navbar.style.display = 'flex'; // Garder le header sur la page de login
            navbar.classList.add('scrolled'); // Force background for visibility
        }
        loginForm.style.display = 'flex';
        liveContent.style.display = 'none';
    }
}

// Listeners pour fermer la TV (Retour aux films)
document.getElementById('close-live-tv-back')?.addEventListener('click', () => {
    document.getElementById('live-tv-content')!.style.display = 'none';
    const navbar = getNavbar(); if (navbar) navbar.style.display = 'flex';
});
document.getElementById('close-live-tv-x')?.addEventListener('click', () => {
    document.getElementById('live-tv-content')!.style.display = 'none';
    (window as any).handleNavigation('trending');
});
document.getElementById('close-live-tv')?.addEventListener('click', () => {
    document.getElementById('live-tv-content')!.style.display = 'none';
    (window as any).handleNavigation('trending');
});

// Gestionnaire de Login
document.getElementById('xtream-submit')?.addEventListener('click', async () => {
    const hostInput = document.getElementById('xtream-host') as HTMLInputElement;
    const userInput = document.getElementById('xtream-user') as HTMLInputElement;
    const passInput = document.getElementById('xtream-pass') as HTMLInputElement;
    const errorMsg = document.getElementById('login-error');

    const host = hostInput.value.trim().replace(/\/$/, ""); // Enlever le slash final
    const user = userInput.value.trim();
    const pass = passInput.value.trim();

    if (!host || !user || !pass) return;

    if (errorMsg) errorMsg.style.display = 'none';
    const btn = document.getElementById('xtream-submit');
    if (btn) btn.textContent = "CONNEXION EN COURS...";

    try {
        // Test de connexion via l'API player_api.php
        const rawTestUrl = `${host}/player_api.php?username=${user}&password=${pass}`;
        const proxyVercel = `/api/proxy?url=${encodeURIComponent(rawTestUrl)}`;
        
        let response;
        try {
            response = await fetch(proxyVercel);
            if (!response.ok) throw new Error();
        } catch (e) {
            // SÉCURITÉ : Pas de fallback vers corsproxy.io ou allorigins.win pour les identifiants
            throw new Error("Impossible de contacter le serveur TV sécurisé.");
        }
        
        if (!response || !response.ok) throw new Error(`Impossible de contacter le serveur TV (Status: ${response?.status || 'Unknown'})`);

        console.log("[IPTV] Test de connexion réussi, lecture de la réponse...");
        const text = await response.text();
        let data;
        try {
            data = JSON.parse(text);
        } catch (e) {
            console.error("[IPTV] Erreur parsing JSON:", text);
            throw new Error("Réponse serveur invalide (Pas du JSON).");
        }

        if (data && data.user_info && data.user_info.auth === 1) {
            console.log("[IPTV] Authentification réussie !");
            // Success ! Sauvegarde
            localStorage.setItem('xtream_host', host);
            localStorage.setItem('xtream_user', user);
            localStorage.setItem('xtream_pass', pass);
            xtreamConfig = { host, user, pass };
            
            initLiveTV(); // Recharger l'UI
        } else {
            console.warn("[IPTV] Échec Auth:", data);
            throw new Error("Authentification échouée (Login/Pass incorrect)");
        }
    } catch (err: any) {
        console.error("[IPTV] Erreur lors du Login:", err);
        if (errorMsg) {
            errorMsg.textContent = err.message || "Erreur de connexion";
            errorMsg.style.display = 'block';
        }
    } finally {
        if (btn) btn.textContent = "SE CONNECTER";
    }
});

// Logout Logic
document.getElementById('xtream-logout')?.addEventListener('click', () => {
    if (confirm("Voulez-vous vous déconnecter de la TV ?")) {
        console.log("[IPTV] Déconnexion demandée...");
        localStorage.removeItem('xtream_host');
        localStorage.removeItem('xtream_user');
        localStorage.removeItem('xtream_pass');
        xtreamConfig = { host: '', user: '', pass: '' };
        liveTVInitialized = false;
        allLiveChannels = [];
        liveCategories = [];
        // Clear IndexedDB
        clearXtreamCache();
        initLiveTV(); // Revenir au login
    }
});

// --- PRO CACHING : IndexedDB (Unlimited storage for massive playlists) ---
const DB_NAME = 'XtreamDB';
const DB_VERSION = 1;
const STORE_NAME = 'cache';

async function openDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME);
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function getFromCache(key: string): Promise<any> {
    try {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(STORE_NAME, 'readonly');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.get(key);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    } catch(e) { return null; }
}

async function saveToCache(key: string, value: any): Promise<void> {
    try {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(STORE_NAME, 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.put(value, key);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    } catch(e) { console.warn("[DB] Error saving:", e); }
}

async function clearXtreamCache() {
    try {
        const db = await openDB();
        const transaction = db.transaction(STORE_NAME, 'readwrite');
        transaction.objectStore(STORE_NAME).clear();
    } catch(e){}
}

async function loadXtreamData() {
    console.log("[IPTV] loadXtreamData démarré...");
    const liveGrid = document.getElementById('live-grid');
    const catsContainer = document.getElementById('live-categories');
    const initLoader = document.getElementById('live-init-loader');
    const loaderStatus = document.getElementById('live-loader-status');
    const loaderBar = document.getElementById('live-loader-progress');

    if (!liveGrid || !catsContainer || !initLoader || !loaderBar || !loaderStatus) return;

    // 1. Tenter de charger depuis IndexedDB (Capacité illimitée)
    if (!liveTVInitialized) {
        const cachedCats = await getFromCache('xtream_cats');
        const cachedChannels = await getFromCache('xtream_channels');

        if (cachedCats && cachedChannels) {
            console.log("[IPTV] Chargement depuis IndexedDB...");
            liveCategories = cachedCats;
            allLiveChannels = cachedChannels;
            renderCategories();
            renderLiveTV();
            liveTVInitialized = true;
            loaderStatus.textContent = "Vérification des mises à jour...";
        }
    }

    // 2. Synchronisation en arrière-plan
    if (!liveTVInitialized) {
        initLoader.style.display = 'flex';
        loaderBar.style.width = '10%';
        loaderStatus.textContent = "Authentification serveur...";
    }

    const { host, user, pass } = xtreamConfig;

    try {
        const fetchWithProxy = async (target: string) => {
            // SÉCURITÉ : Uniquement le proxy Vercel pour les identifiants IPTV
            return fetch(`/api/proxy?url=${encodeURIComponent(target)}`);
        };

        // Step 1: Categories
        if (!liveTVInitialized) loaderBar.style.width = '30%';
        const rawCatUrl = `${host}/player_api.php?username=${user}&password=${pass}&action=get_live_categories`;
        let catRes = await fetchWithProxy(rawCatUrl);
        if (!catRes.ok) throw new Error("Serveur indisponible");
        const newCats = await catRes.json();
        
        // Step 2: Streams
        if (!liveTVInitialized) loaderBar.style.width = '60%';
        const rawStreamUrl = `${host}/player_api.php?username=${user}&password=${pass}&action=get_live_streams`;
        let streamRes = await fetchWithProxy(rawStreamUrl);
        if (!streamRes.ok) throw new Error("Erreur flux");
        const newChannels = await streamRes.json();

        // Update Global State
        liveCategories = newCats;
        allLiveChannels = newChannels;

        // Save to IndexedDB (Capacité quasi illimitée)
        await saveToCache('xtream_cats', newCats);
        await saveToCache('xtream_channels', newChannels);

        // Finalize UI
        if (!liveTVInitialized) {
            loaderBar.style.width = '100%';
            loaderStatus.textContent = "Terminé !";
            setTimeout(() => {
                initLoader.style.display = 'none';
                renderCategories();
                renderLiveTV();
                liveTVInitialized = true;
            }, 600);
        } else {
            // Mise à jour silencieuse si déjà chargé depuis le cache
            renderCategories();
            renderLiveTV();
            console.log("[IPTV] Mise à jour du cache terminée.");
        }

    } catch (err: any) {
        console.error("[IPTV] Erreur Sync:", err);
        if (!liveTVInitialized) {
            loaderStatus.textContent = "Erreur de connexion.";
            loaderStatus.classList.add('text-error');
            loaderBar.classList.add('bg-error');
        }
    }
}

function renderCategories() {
    const container = document.getElementById('live-categories');
    if (!container) return;

    const allChannelsCount = allLiveChannels.length;

    // Styles inline directs - pas de dépendance Tailwind
    const applyBase = (el: Element) => {
        const e = el as HTMLElement;
        e.style.cssText = `
            width: 100%;
            padding: 16px 32px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            cursor: pointer;
            border-bottom: 1px solid rgba(255,255,255,0.04);
            border-left: 3px solid transparent;
            background: transparent;
            color: rgba(255,255,255,0.35);
            transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease;
            box-sizing: border-box;
        `;
    };

    const applyActive = (el: Element) => {
        const e = el as HTMLElement;
        e.style.cssText = `
            width: 100%;
            padding: 16px 32px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            cursor: pointer;
            border-bottom: 1px solid rgba(255,255,255,0.04);
            border-left: 3px solid #ef4444;
            background: rgba(239,68,68,0.1);
            color: #ef4444;
            transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease;
            box-sizing: border-box;
        `;
    };

    const html = `
        <div data-id="all">
            <span style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.15em;">All Channels</span>
            <span style="font-size:11px;font-weight:700;opacity:0.6;">${allChannelsCount}</span>
        </div>
        ${liveCategories.map(cat => {
            const count = allLiveChannels.filter(c => c.category_id === cat.category_id).length;
            return `
                <div data-id="${cat.category_id}">
                    <span style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:200px;">${cat.category_name}</span>
                    <span style="font-size:11px;font-weight:700;opacity:0.4;">${count}</span>
                </div>
            `;
        }).join('')}
    `;
    container.innerHTML = html;

    // Appliquer style de base à tous
    container.querySelectorAll('[data-id]').forEach(btn => {
        applyBase(btn);
    });

    // Activer le premier par défaut
    const firstBtn = container.querySelector('[data-id="all"]');
    if (firstBtn) applyActive(firstBtn);

    // Hover effect
    container.querySelectorAll('[data-id]').forEach(btn => {
        btn.addEventListener('mouseenter', () => {
            if (!(btn as HTMLElement).dataset.active) {
                (btn as HTMLElement).style.background = 'rgba(255,255,255,0.04)';
                (btn as HTMLElement).style.color = 'rgba(255,255,255,0.85)';
            }
        });
        btn.addEventListener('mouseleave', () => {
            if (!(btn as HTMLElement).dataset.active) {
                (btn as HTMLElement).style.background = 'transparent';
                (btn as HTMLElement).style.color = 'rgba(255,255,255,0.35)';
            }
        });
    });

    // Clic : sélection avec flash visuel
    container.querySelectorAll('[data-id]').forEach(btn => {
        btn.addEventListener('click', () => {
            stopLiveTV();

            // Retirer l'actif de tous
            container.querySelectorAll('[data-id]').forEach(b => {
                delete (b as HTMLElement).dataset.active;
                applyBase(b);
            });

            // Flash rouge immédiat puis état actif stable
            const el = btn as HTMLElement;
            el.style.background = 'rgba(239,68,68,0.25)';
            el.style.borderLeftColor = '#ef4444';
            el.style.color = '#ffffff';

            setTimeout(() => {
                el.dataset.active = '1';
                applyActive(el);
            }, 150);

            const catId = el.getAttribute('data-id') || 'all';
            iptvCurrentPage = 1;
            renderLiveTV('', catId);
        });
    });
}

function renderLiveTV(filter: string = '', categoryId: string = 'all') {
    const liveGrid = document.getElementById('live-grid');
    if (!liveGrid) return;

    let filtered = allLiveChannels;

    // Filtre par catégorie
    if (categoryId !== 'all') {
        filtered = filtered.filter(c => c.category_id === categoryId);
    }

    // Filtre par recherche
    if (filter) {
        const f = filter.toLowerCase();
        filtered = filtered.filter(c => c.name.toLowerCase().includes(f));
    }

    if (filtered.length === 0) {
        liveGrid.innerHTML = '<div class="md:col-span-12 py-20 text-center text-white/30 font-medium italic">Aucune chaîne trouvée.</div>';
        return;
    }

    // Calcul de la pagination
    const totalPages = Math.ceil(filtered.length / iptvItemsPerPage);
    if (iptvCurrentPage > totalPages) {
        iptvCurrentPage = totalPages || 1;
    }
    if (iptvCurrentPage < 1) {
        iptvCurrentPage = 1;
    }

    const startIdx = (iptvCurrentPage - 1) * iptvItemsPerPage;
    const pageItems = filtered.slice(startIdx, startIdx + iptvItemsPerPage);

    // 1. Initial State
    liveGrid.innerHTML = '';

    const fragment = document.createDocumentFragment();

    pageItems.forEach((c, index) => {
        const streamUrl = `${xtreamConfig.host}/live/${xtreamConfig.user}/${xtreamConfig.pass}/${c.stream_id}.ts`;
        const div = document.createElement('div');
        div.style.cssText = `
            position: relative;
            aspect-ratio: 2/3;
            overflow: hidden;
            cursor: pointer;
            border: 2px solid rgba(255,255,255,0.05);
            background: #111;
            transition: border-color 0.2s ease, box-shadow 0.2s ease, transform 0.2s ease;
            border-radius: 6px;
        `;
        div.style.animationDelay = `${(index % iptvItemsPerPage) * 15}ms`;
        div.className = 'fade-in-progressive live-channel-card';
        div.setAttribute('data-url', streamUrl);
        
        div.innerHTML = `
            <!-- Logo/Poster -->
            <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:#1a1a1a;">
                 <img src="${c.stream_icon || ''}" loading="lazy" style="width:100%;height:100%;object-fit:cover;opacity:0.8;transition:opacity 0.3s,transform 0.5s;" onerror="this.src='https://images.unsplash.com/photo-1594909122845-11baa439b7bf?auto=format&fit=crop&q=80&w=400';"/>
            </div>

            <!-- Overlay Gradient -->
            <div style="position:absolute;inset:0;background:linear-gradient(to top,rgba(0,0,0,0.85) 0%,rgba(0,0,0,0.15) 60%,transparent 100%);transition:opacity 0.3s;"></div>

            <!-- Channel Name -->
            <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;padding:12px 8px;text-align:center;">
                <h3 style="font-size:11px;font-weight:800;color:#fff;text-transform:uppercase;letter-spacing:-0.02em;line-height:1.3;text-shadow:0 2px 6px rgba(0,0,0,0.9);margin:0;">
                    ${c.name}
                </h3>
            </div>

            <!-- Play Icon (hover) -->
            <div class="play-icon-overlay" style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;opacity:0;transition:opacity 0.2s;z-index:20;">
                <div style="width:44px;height:44px;border-radius:50%;background:rgba(239,68,68,0.25);backdrop-filter:blur(8px);border:2px solid rgba(239,68,68,0.6);display:flex;align-items:center;justify-content:center;">
                    <span class="material-symbols-outlined" style="color:#ef4444;font-size:28px;">play_arrow</span>
                </div>
            </div>
        `;

        // Hover
        div.addEventListener('mouseenter', () => {
            if (!div.dataset.playing) {
                div.style.borderColor = 'rgba(239,68,68,0.4)';
                div.style.transform = 'scale(1.03)';
            }
            const overlay = div.querySelector('.play-icon-overlay') as HTMLElement;
            if (overlay) overlay.style.opacity = '1';
        });
        div.addEventListener('mouseleave', () => {
            if (!div.dataset.playing) {
                div.style.borderColor = 'rgba(255,255,255,0.05)';
                div.style.transform = 'scale(1)';
            }
            const overlay = div.querySelector('.play-icon-overlay') as HTMLElement;
            if (overlay) overlay.style.opacity = '0';
        });

        div.addEventListener('click', () => {
            const url = div.getAttribute('data-url');
            const name = div.querySelector('h3')?.textContent?.trim() || 'Chaîne';

            // Retirer le contour rouge de toutes les cartes
            document.querySelectorAll('.live-channel-card').forEach(card => {
                const c = card as HTMLElement;
                delete c.dataset.playing;
                c.style.borderColor = 'rgba(255,255,255,0.05)';
                c.style.boxShadow = 'none';
                c.style.transform = 'scale(1)';
            });

            // Flash immédiat blanc → rouge persistant
            div.style.borderColor = '#ffffff';
            div.style.boxShadow = '0 0 0 2px rgba(239,68,68,0.6)';
            setTimeout(() => {
                div.dataset.playing = '1';
                div.style.borderColor = '#ef4444';
                div.style.boxShadow = '0 0 20px rgba(239,68,68,0.35), 0 0 0 2px #ef4444';
                div.style.transform = 'scale(1)';
            }, 120);

            if (url) playLiveChannel(url, name);
        });

        fragment.appendChild(div);
    });

    liveGrid.appendChild(fragment);

    // Create / Update pagination UI container at the end of liveGrid
    const paginationContainerId = 'live-pagination-controls';
    let paginationContainer = document.getElementById(paginationContainerId);
    if (paginationContainer) {
        paginationContainer.remove();
    }

    paginationContainer = document.createElement('div');
    paginationContainer.id = paginationContainerId;
    paginationContainer.className = 'col-span-full flex items-center justify-center gap-4 py-8 mt-4';
    paginationContainer.style.cssText = `
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 16px;
        padding: 32px 0 16px 0;
        margin-top: 16px;
        width: 100%;
        color: #fff;
    `;

    // Button Prev
    const btnPrev = document.createElement('button');
    btnPrev.className = 'w-10 h-10 rounded-full flex items-center justify-center bg-white/5 border border-white/10 hover:bg-white/10 transition-all disabled:opacity-30 disabled:cursor-not-allowed';
    btnPrev.disabled = iptvCurrentPage === 1;
    btnPrev.innerHTML = '<span class="material-symbols-outlined">chevron_left</span>';
    btnPrev.addEventListener('click', () => {
        if (iptvCurrentPage > 1) {
            iptvCurrentPage--;
            renderLiveTV(filter, categoryId);
            const gridParent = liveGrid.parentElement;
            if (gridParent) gridParent.scrollTop = 0;
        }
    });

    // Page Info text
    const pageInfo = document.createElement('span');
    pageInfo.style.cssText = `
        font-size: 11px;
        font-weight: 800;
        text-transform: uppercase;
        letter-spacing: 0.25em;
        opacity: 0.8;
    `;
    pageInfo.textContent = `Page ${iptvCurrentPage} / ${totalPages}`;

    // Button Next
    const btnNext = document.createElement('button');
    btnNext.className = 'w-10 h-10 rounded-full flex items-center justify-center bg-white/5 border border-white/10 hover:bg-white/10 transition-all disabled:opacity-30 disabled:cursor-not-allowed';
    btnNext.disabled = iptvCurrentPage === totalPages;
    btnNext.innerHTML = '<span class="material-symbols-outlined">chevron_right</span>';
    btnNext.addEventListener('click', () => {
        if (iptvCurrentPage < totalPages) {
            iptvCurrentPage++;
            renderLiveTV(filter, categoryId);
            const gridParent = liveGrid.parentElement;
            if (gridParent) gridParent.scrollTop = 0;
        }
    });

    paginationContainer.appendChild(btnPrev);
    paginationContainer.appendChild(pageInfo);
    paginationContainer.appendChild(btnNext);

    liveGrid.appendChild(paginationContainer);
}

// Logic for playing a live channel

function playLiveChannel(url: string, name: string) {
    const playerContainer = document.getElementById('live-player-container');
    const video = document.getElementById('live-video') as HTMLVideoElement;
    const nameLabel = document.getElementById('current-channel-name');
    const errorOverlay = document.getElementById('player-error');

    if (!playerContainer || !video || !nameLabel || !errorOverlay) return;

    // Lire offsetTop AVANT de modifier le DOM → évite le forced reflow (228ms PageSpeed)
    const scrollTarget = playerContainer.offsetTop - 100;

    playerContainer.style.display = 'block';
    nameLabel.textContent = name;
    errorOverlay.style.display = 'none';
    const msg = errorOverlay.querySelector('p');
    
    // Smooth scroll différé au prochain frame pour ne pas bloquer le paint
    requestAnimationFrame(() => {
        window.scrollTo({ top: scrollTarget, behavior: 'smooth' });
    });


    // Anti-flood: On attend un court instant pour laisser le serveur fermer la connexion précédente
    if ((window as any).isSwitching) return;
    (window as any).isSwitching = true;

    const stopExisting = () => {
        if ((window as any).hls) {
            try { (window as any).hls.destroy(); } catch(e){}
            delete (window as any).hls;
        }
        if ((window as any).mpegtsPlayer) {
            try {
                const p = (window as any).mpegtsPlayer;
                p.pause();
                p.unload();
                p.detachMediaElement();
                p.destroy();
            } catch(e){}
            delete (window as any).mpegtsPlayer;
        }
        video.pause();
        video.src = "";
        video.load();
    };

    stopExisting();

    setTimeout(() => {
        (window as any).isSwitching = false;
        startStreamLoad();
    }, 650);

    function startStreamLoad() {
    const getProxyUrl = (targetUrl: string, type: 'vercel') => {
        const encoded = encodeURIComponent(targetUrl);
        const isHttps = window.location.protocol === 'https:';
        if (!isHttps && type === 'vercel') return targetUrl;
        return `/api/proxy?url=${encoded}`;
    };

    let currentProxyType: 'vercel' = 'vercel';
    let streamUrl = getProxyUrl(url, currentProxyType);

    const tryNextProxy = () => {
        // Suppression des proxys publics pour la sécurité des identifiants
        return false;
    };

    console.log(`Lecture via ${currentProxyType}: ${streamUrl}`);

    errorOverlay!.style.display = 'flex';
    if (msg) msg.textContent = "Connexion au flux...";
    errorOverlay!.querySelector('span')!.textContent = "⏳";

    if (url.includes('.m3u8')) {
        loadHlsLib().then(Hls => {
            const loadHls = (target: string) => {
                if (Hls.isSupported()) {
                    const hls = new Hls({
                        debug: false,
                        manifestLoadingMaxRetry: 6,
                        manifestLoadingRetryDelay: 1500,
                        enableWorker: true,
                        capLevelToPlayerSize: true,
                        // Buffer court adapté au direct TV pour économiser la RAM
                        maxBufferLength: 6,
                        maxMaxBufferLength: 10,
                        maxBufferSize: 8 * 1024 * 1024,
                        liveSyncDurationCount: 3,
                        liveMaxLatencyDurationCount: 5
                    });
                    (window as any).hls = hls;
                    hls.loadSource(target);
                    hls.attachMedia(video);
                    hls.on(Hls.Events.MANIFEST_PARSED, () => {
                        errorOverlay!.style.display = 'none';
                        video.play().catch(() => {});
                    });
                    hls.on(Hls.Events.ERROR, (_event: any, data: any) => {
                        if (data.fatal) {
                            console.warn('HLS Fatal Error:', data.type);
                            if (tryNextProxy()) {
                                hls.destroy();
                                delete (window as any).hls;
                                loadHls(streamUrl);
                            } else {
                                if (msg) msg.textContent = 'Flux indisponible (Erreur HLS).';
                                errorOverlay!.querySelector('span')!.textContent = '❌';
                            }
                        }
                    });
                } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
                    video.src = target;
                    video.play().catch(() => {});
                }
            };
            loadHls(streamUrl);
        }).catch(err => {
            console.error('Impossible de charger HLS.js:', err);
            if (msg) msg.textContent = 'Erreur de chargement du lecteur HLS.';
        });
    } else {
        loadMpegtsLib().then(mpegts => {
            const loadTs = (target: string) => {
                if (mpegts.getFeatureList().mseLivePlayback) {
                    const player = mpegts.createPlayer({
                        type: 'mse',
                        isLive: true,
                        url: target,
                        cors: true
                    }, {
                        // Configuration optimisée pour tolérer les micro-coupures et instabilités
                        enableStashBuffer: true,
                        stashInitialSize: 384 * 1024, // Augmente le buffer avant de démarrer la lecture
                        liveBufferLatencyChasing: false, // Ne pas chercher à rattraper le direct absolu
                        liveBufferLatencyMaxLatency: 15, // Accepter jusqu'à 15s de retard
                        liveBufferLatencyMinRemain: 5, // Garder une bonne marge dans le buffer
                        lazyLoadMaxKeepBehindDuration: 10,
                        lazyLoad: true
                    });
                    (window as any).mpegtsPlayer = player;
                    player.attachMediaElement(video);
                    try {
                        player.load();
                        player.play().catch((e: any) => console.warn('MPEGTS Play catch:', e));
                    } catch (e) {
                        console.error('MPEGTS Load error:', e);
                    }
                    player.on(mpegts.Events.ERROR, (type: any, detail: any, info: any) => {
                        console.error('MPEGTS Error:', type, detail, info);
                        const statusCode = info?.code || 0;
                        const isAuthError = statusCode === 401 || statusCode === 403;
                        const currentPlayer = (window as any).mpegtsPlayer;
                        if (currentPlayer) {
                            if (tryNextProxy()) {
                                try { currentPlayer.pause(); currentPlayer.unload(); currentPlayer.detachMediaElement(); currentPlayer.destroy(); } catch(e) {}
                                delete (window as any).mpegtsPlayer;
                                setTimeout(() => loadTs(streamUrl), 500);
                            } else if (url.endsWith('.ts')) {
                                try { currentPlayer.pause(); currentPlayer.unload(); currentPlayer.detachMediaElement(); currentPlayer.destroy(); } catch(e) {}
                                delete (window as any).mpegtsPlayer;
                                playLiveChannel(url.replace('.ts', '.m3u8'), name);
                            } else {
                                if (msg) msg.textContent = isAuthError ? 'Accès refusé (401/403).' : 'Erreur de lecture.';
                                errorOverlay!.querySelector('span')!.textContent = '❌';
                            }
                        }
                    });
                    video.onplaying = () => { errorOverlay!.style.display = 'none'; };
                } else {
                    video.src = target;
                    video.play().catch(() => {});
                }
            };
            loadTs(streamUrl);
        }).catch(err => {
            console.error('Impossible de charger mpegts.js:', err);
            if (msg) msg.textContent = 'Erreur de chargement du lecteur TS.';
        });
    }
}
}

// Search event synchronized with current active category
document.getElementById('live-search')?.addEventListener('input', (e) => {
    const val = (e.target as HTMLInputElement).value;
    const activeCat = document.querySelector('#live-categories [data-id].active')?.getAttribute('data-id') || 'all';
    iptvCurrentPage = 1;
    renderLiveTV(val, activeCat);
});

export function stopLiveTV() {
    const playerContainer = document.getElementById('live-player-container');
    const video = document.getElementById('live-video') as HTMLVideoElement;
    
    if ((window as any).hls) {
        try { (window as any).hls.destroy(); } catch(e){}
        delete (window as any).hls;
    }

    if ((window as any).mpegtsPlayer) {
        try {
            const p = (window as any).mpegtsPlayer;
            p.pause();
            p.unload();
            p.detachMediaElement();
            p.destroy();
        } catch(e){}
        delete (window as any).mpegtsPlayer;
    }

    if (playerContainer) playerContainer.style.display = 'none';
    if (video) {
        video.pause();
        video.src = "";
        video.load();
    }
}

document.getElementById('close-player')?.addEventListener('click', () => {
    stopLiveTV();
});

document.getElementById('close-live-tv')?.addEventListener('click', () => {
    (window as any).handleNavigation('trending');
});

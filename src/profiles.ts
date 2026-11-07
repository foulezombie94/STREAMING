import { getActiveProfile, getProfiles, saveProfiles, profileColors, type Profile } from './profile-store';
import { escapeHtml, icon, prepareDialog } from './ui';

export function avatar(profile: Profile, extraClass = ''): string {
    return `<span class="profile-avatar ${extraClass}" style="--avatar-color:${profile.color}" aria-hidden="true"><span class="avatar-eyes"></span><span class="avatar-smile"></span></span>`;
}

export function openProfiles(manage = false) {
    document.querySelector<HTMLDialogElement>('.profiles-dialog')?.close();
    const dialog = document.createElement('dialog');
    dialog.className = 'profiles-dialog';
    dialog.setAttribute('aria-label', 'Choix du profil');
    const render = () => {
        const profiles = getProfiles();
        dialog.innerHTML = `<a class="profiles-brand logo" href="/">MOVIEVERSE</a><button class="round-control profiles-close" aria-label="Fermer">${icon('close')}</button><div class="profiles-inner"><h1>${manage ? 'Gérer les profils' : 'Qui est-ce ?'}</h1><div class="profiles-grid">${profiles.map(profile => `<button class="profile-tile" data-profile="${escapeHtml(profile.id)}">${avatar(profile)}${manage ? `<span class="profile-edit-icon">${icon('edit')}</span>` : ''}<span>${escapeHtml(profile.name)}</span></button>`).join('')}${profiles.length < 5 ? `<button class="profile-tile add-profile" aria-label="Ajouter un profil"><span class="add-avatar">${icon('plus')}</span><span>Ajouter un profil</span></button>` : ''}</div><button class="outline-button manage-profiles">${manage ? 'Terminé' : 'Gérer les profils'}</button><p class="profiles-note">Vos profils et préférences sont enregistrés sur cet appareil.</p></div>`;
        dialog.querySelector('.profiles-close')?.addEventListener('click', () => dialog.close());
        dialog.querySelector('.manage-profiles')?.addEventListener('click', () => { manage = !manage; render(); });
        dialog.querySelector('.add-profile')?.addEventListener('click', () => edit());
        dialog.querySelectorAll<HTMLElement>('[data-profile]').forEach(button => button.addEventListener('click', () => {
            const profile = profiles.find(p => p.id === button.dataset.profile)!;
            if (manage) edit(profile);
            else {
                localStorage.setItem('movieverse_active_profile', profile.id);
                window.location.assign('/');
            }
        }));
    };
    const edit = (profile?: Profile) => {
        let color = profile?.color || profileColors[getProfiles().length % profileColors.length]!;
        dialog.innerHTML = `<div class="profile-editor"><h1>${profile ? 'Modifier le profil' : 'Ajouter un profil'}</h1><p>Un espace pour vos films et séries préférés.</p><form class="profile-form"><div class="profile-form-row"><div id="avatar-preview">${avatar({ id: '', name: '', color })}</div><label>Nom du profil<input name="name" aria-label="Nom du profil" maxlength="24" value="${escapeHtml(profile?.name || '')}" placeholder="Nom" required autocomplete="off"></label></div><fieldset class="avatar-colors"><legend>Couleur du profil</legend>${profileColors.map(c => `<label style="--color:${c}"><input type="radio" name="color" value="${c}" ${c === color ? 'checked' : ''} aria-label="${c}"><span></span></label>`).join('')}</fieldset><div class="profile-form-actions"><button class="white-button" type="submit">Enregistrer</button><button type="button" class="outline-button cancel-profile">Annuler</button></div></form></div>`;
        dialog.querySelectorAll<HTMLInputElement>('[name="color"]').forEach(input => input.addEventListener('change', () => {
            color = input.value;
            dialog.querySelector('#avatar-preview')!.innerHTML = avatar({ id: '', name: '', color });
        }));
        dialog.querySelector('.cancel-profile')?.addEventListener('click', render);
        dialog.querySelector('form')?.addEventListener('submit', event => {
            event.preventDefault();
            const input = dialog.querySelector<HTMLInputElement>('[name="name"]')!;
            const name = input.value.trim();
            if (!name) { input.setCustomValidity('Saisissez un nom.'); input.reportValidity(); input.addEventListener('input', () => input.setCustomValidity(''), { once: true }); return; }
            const profiles = getProfiles();
            const value = { id: profile?.id || crypto.randomUUID(), name, color };
            if (profile) profiles[profiles.findIndex(p => p.id === profile.id)] = value;
            else if (profiles.length < 5) profiles.push(value);
            saveProfiles(profiles);
            refreshProfileButton();
            render();
        });
        dialog.querySelector<HTMLInputElement>('[name="name"]')?.focus();
    };
    render();
    prepareDialog(dialog);
}

export function openPreferences() {
    const dialog = document.createElement('dialog');
    dialog.className = 'preferences-dialog';
    dialog.setAttribute('aria-labelledby', 'preferences-title');
    dialog.innerHTML = `<button class="round-control dialog-close" aria-label="Fermer">${icon('close')}</button><h1 id="preferences-title">Mon profil</h1><div class="preference-profile">${avatar(getActiveProfile())}<div><h2>${escapeHtml(getActiveProfile().name)}</h2><p>Préférences de cet appareil</p></div></div><form><label class="preference-row"><span><strong>Défilement de la sélection à la une</strong><small>Changer automatiquement de programme sur l’accueil.</small></span><input type="checkbox" name="autoplay" ${localStorage.getItem('movieverse_autoplay') !== 'false' ? 'checked' : ''}></label><label class="preference-row"><span><strong>Économiser les données</strong><small>Charger des images plus légères.</small></span><input type="checkbox" name="low" ${localStorage.getItem('perf_mode') === 'low' ? 'checked' : ''}></label><p class="preference-local">Ma liste, l’historique et les profils sont conservés dans votre navigateur. Aucun compte en ligne n’est nécessaire.</p><button class="white-button" type="submit">Enregistrer</button></form>`;
    dialog.querySelector('.dialog-close')?.addEventListener('click', () => dialog.close());
    dialog.querySelector('form')?.addEventListener('submit', event => {
        event.preventDefault();
        localStorage.setItem('movieverse_autoplay', String(dialog.querySelector<HTMLInputElement>('[name="autoplay"]')!.checked));
        localStorage.setItem('perf_mode', dialog.querySelector<HTMLInputElement>('[name="low"]')!.checked ? 'low' : 'high');
        window.location.reload();
    });
    prepareDialog(dialog);
}

function refreshProfileButton() {
    const button = document.getElementById('profile-trigger');
    if (button) button.innerHTML = avatar(getActiveProfile()) + icon('down');
}

export function initProfiles() {
    refreshProfileButton();
    const trigger = document.getElementById('profile-trigger');
    const menu = document.getElementById('profile-menu');
    trigger?.addEventListener('click', () => {
        const expanded = trigger.getAttribute('aria-expanded') !== 'true';
        trigger.setAttribute('aria-expanded', String(expanded));
        if (menu) menu.hidden = !expanded;
    });
    document.addEventListener('click', event => {
        if (!(event.target as HTMLElement).closest('.profile-navigation')) {
            if (menu) menu.hidden = true;
            trigger?.setAttribute('aria-expanded', 'false');
        }
    });
    document.addEventListener('keydown', event => {
        if (event.key === 'Escape') { if (menu) menu.hidden = true; trigger?.setAttribute('aria-expanded', 'false'); }
    });
    document.querySelectorAll('[data-open-profiles]').forEach(button => button.addEventListener('click', () => { if (menu) menu.hidden = true; openProfiles(); }));
    document.querySelectorAll('[data-manage-profiles]').forEach(button => button.addEventListener('click', () => { if (menu) menu.hidden = true; openProfiles(true); }));
    document.querySelectorAll('[data-open-preferences]').forEach(button => button.addEventListener('click', () => { if (menu) menu.hidden = true; openPreferences(); }));
}

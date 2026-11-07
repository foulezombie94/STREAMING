import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';

// Run the browser storage modules without a browser or additional dependencies.
const values = new Map();
globalThis.localStorage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
};
globalThis.window = new EventTarget();
const dataModule = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const compile = async file => ts.transpileModule(await readFile(new URL(file, import.meta.url), 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText;
const profileModule = dataModule(await compile('../src/profile-store.ts'));
const profiles = await import(profileModule);
const storageSource = (await compile('../src/storage.ts')).replace("'./profile-store'", JSON.stringify(profileModule));
let instance = 0;
const loadStorage = () => import(dataModule(`${storageSource}\n// Fresh page ${++instance}`));

test('existing library is preserved and new profiles have separate persistent libraries', async () => {
    values.clear();
    values.set('movieverse_favorites', JSON.stringify({ movie_42: { mediaId: '42', mediaType: 'movie', title: 'Existing film' } }));
    let { FavoritesManager, ProgressManager } = await loadStorage();
    assert.equal(FavoritesManager.isFavorite('42', 'movie'), true);
    ProgressManager.saveProgress({ mediaId: '42', mediaType: 'movie', time: 120, duration: 3600, title: 'Existing film' });

    profiles.saveProfiles([{ id: 'default', name: 'Original', color: '#177bb4' }, { id: 'second', name: 'Second', color: '#319779' }]);
    values.set('movieverse_active_profile', 'second');
    ({ FavoritesManager, ProgressManager } = await loadStorage());
    assert.deepEqual(FavoritesManager.getAllFavorites(), {});
    assert.equal(ProgressManager.getProgress('42', 'movie'), null);
    FavoritesManager.toggleFavorite('99', 'tv', { name: 'Second show', backdrop_path: '/backdrop.jpg' });
    ProgressManager.saveProgress({ mediaId: '99', mediaType: 'tv', season: 2, episode: 3, time: 60, duration: 1800 });

    ({ FavoritesManager, ProgressManager } = await loadStorage());
    assert.equal(FavoritesManager.isFavorite('99', 'tv'), true);
    assert.equal(ProgressManager.getProgress('99', 'tv').episode, 3);
    assert.equal(FavoritesManager.getAllFavorites().tv_99.backdrop, '/backdrop.jpg');

    values.set('movieverse_active_profile', 'default');
    ({ FavoritesManager, ProgressManager } = await loadStorage());
    assert.equal(FavoritesManager.isFavorite('42', 'movie'), true);
    assert.equal(FavoritesManager.isFavorite('99', 'tv'), false);
    assert.equal(ProgressManager.getProgress('42', 'movie').time, 120);
});

test('damaged profile preferences fall back to the existing profile', () => {
    values.set('movieverse_profiles', '{broken');
    assert.equal(profiles.getActiveProfile().id, 'default');
    assert.equal(profiles.profileStorageKey('movieverse_favorites'), 'movieverse_favorites');
});

test('remote titles and profile names are escaped before HTML rendering', async () => {
    const { escapeHtml } = await import(dataModule(await compile('../src/ui.ts')));
    assert.equal(escapeHtml('<img src=x onerror="alert(1)">'), '&lt;img src=x onerror=&quot;alert(1)&quot;&gt;');
    assert.equal(escapeHtml("L'Odyssée & Lupin"), 'L&#39;Odyssée &amp; Lupin');
});

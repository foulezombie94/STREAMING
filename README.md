# MovieVerse

Application Vite / TypeScript : catalogue TMDB, films, séries, recherche, collections, Ma liste, historique et TV en direct.

## Démarrage

Node.js 22.12 ou version compatible avec Vite 8 est nécessaire.

```sh
npm ci
cp .env.example .env.local
# Renseigner VITE_TMDB_API_KEY dans .env.local
npm run dev
```

```sh
npm run build
npm run preview
```

Le lecteur et la TV conservent leurs intégrations existantes. Le serveur associé se lance avec `npm run start-backend`. L’interface et TMDB peuvent être utilisés indépendamment du serveur de lecture. La disponibilité d’un flux dépend des services tiers.

## Interface

- `/` : sélection à la une, rangées horizontales et top 10 des tendances TMDB.
- `/movie`, `/tv` : catalogues et filtres par genre.
- `/new` : nouveautés et tendances.
- `/favorites` : Ma liste du profil actif.
- `/reprendre` : historique et progression du profil actif.
- `/profiles` : choix, ajout et modification des profils locaux (5 au maximum).
- `/sagas`, `/iptv` : collections et TV en direct existantes.
- Les fiches s’ouvrent en dialogue avec distribution, suggestions, saisons et épisodes. La fiche complète et le lecteur restent accessibles dans `details.html`.
- Le menu de profil donne accès aux préférences de défilement et d’économie des données.

Les profils utilisent uniquement le navigateur : il ne s’agit pas de comptes authentifiés synchronisés. Le premier profil conserve les favoris et l’historique déjà présents. Les autres profils disposent d’une bibliothèque indépendante. Aucun faux paiement, abonnement ou formulaire d’identification Netflix n’a été ajouté.

Le thème partagé se trouve dans `src/theme.css`. Les cartes, dialogues et profils sont dans des modules dédiés. Les pages d’assistance et les pages légales utilisent `src/support-theme.css`. Les réécritures Vercel couvrent les routes de navigation, y compris Ma liste, les nouveautés et les profils.

## Références visuelles

Analyse des pages publiques et des documents officiels Netflix effectuée le 8 novembre 2026. Les écrans abonnés n’ont pas été inspectés derrière une connexion. Cette adaptation conserve la marque MovieVerse et son catalogue ; elle ne garantit pas une reproduction pixel par pixel de toutes les variantes ou expériences Netflix.

| Écran | Référence et adaptation |
| --- | --- |
| Accueil public | [Netflix France](https://www.netflix.com/fr/) : noir, rouge, mise en avant des visuels, tendances et pied de page. |
| Identification | [Netflix identification](https://www.netflix.com/fr/login) : sobriété des formulaires observée ; pas de formulaire de connexion ajouté sans service d’authentification. |
| Navigation / recherche | [Aide officielle](https://help.netflix.com/fr/node/47765) : navigation de catalogue et recherche ; grille de résultats dédiée. |
| Ma liste | [Aide officielle](https://help.netflix.com/fr/node/10523) : ajout et retrait depuis les fiches, accès direct depuis la navigation. |
| Profils | [Aide officielle](https://help.netflix.com/fr/node/10421) : choix des profils et édition ; adaptation locale sans compte Netflix. |
| Mobile | [Présentation officielle mobile](https://about.netflix.com/fr/news/introducing-exciting-new-ways-to-find-and-enjoy-your-next-favorite-on-mobile) : navigation compacte et accès aux contenus personnels. Les extraits vidéo ne sont pas simulés en l’absence d’une source vidéo adaptée. |
| TV | [Présentation officielle TV](https://about.netflix.com/en/news/unveiling-our-innovative-new-tv-experience) : raccourcis visibles et informations de programme. L’intégration TV existante est conservée. |

La navigation au clavier, la fermeture par Échap, les dialogues natifs et la réduction des animations sont pris en charge. Les notes affichées et le classement du top 10 proviennent de TMDB ; aucun taux de compatibilité Netflix ni qualité vidéo non vérifiée n’est inventé.

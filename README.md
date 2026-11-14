# Rocket League rank overlay

Petite fenêtre toujours au premier plan qui affiche ton **rang, ta division, ton MMR** et tes **victoires/défaites de session** en 2v2 classé (1v1 et 3v3 au menu), sans toucher au processus du jeu.

![Aperçu de l'overlay : 3 victoires, 4 défaites, 1148 MMR, Champion I division III](docs/overlay.png)

Victoires en bleu, défaites en orange, MMR et rang au centre. La barre est découpée en 4 segments, un par division, avec la distance pour descendre (à gauche) et pour monter (à droite).

> L'image est le rendu réel de l'interface avec de vrais relevés, générée par `npm run screenshot` : ce n'est pas une capture d'écran du jeu.

## Comment ça marche

Rocket League écrit dans `Documents\My Games\Rocket League\TAGame\Logs\Launch.log`, à chaque entrée en file, ton MMR interne, ton tier et la playlist. L'appli lit ce fichier en **lecture seule** (un `stat` toutes les 2 secondes, lecture incrémentale) :

- `MMR = mu × 20 + 100` (formule communautaire, cohérente avec les tiers lus dans le journal)
- le **tier** vient du journal et fait foi ; la **division** est déduite du MMR avec une table de seuils 2v2 ;
- victoires et défaites se déduisent de la variation de MMR entre deux files (les gains réels, pas un +9 fixe) ;
- les seuils réels de montée et de descente de tier sont **appris** à chaque changement de tier observé (le jeu applique une hystérésis : on monte à un seuil plus haut que celui où l'on redescend).

Aucune injection, aucune lecture de mémoire, aucun réseau : l'appli ne fait que lire un fichier texte que le jeu écrit déjà.

## Limites connues

- Le journal ne donne le MMR **qu'à l'entrée en file** : juste après un match, l'affichage garde l'ancien MMR et indique « 1 match en attente ».
- Les seuils de division (`data/ranks/doubles.json`) viennent de la distribution Tracker Network (plages observées, pas des seuils officiels) et se mettent à jour sans toucher au code, voir `data/README.md`. Les valeurs approximatives sont précédées de « ≈ ». Seul le 2v2 a sa table : en 1v1 et 3v3, le tier vient du journal mais la division est estimée avec la table du 2v2, et l'overlay l'indique.
- En groupe (duo), le journal donne le MMR du **chef de groupe**. L'appli le compte seulement si tu es le chef (vérifié sur des files en duo où tu avais créé le groupe : le MMR prolongeait bien ta progression) et si le relevé prolonge ta progression sans saut de plus de 50. Quand le chef est ton coéquipier, la file est ignorée et l'overlay l'indique. « Le chef est le membre d'index 0 du groupe » reste une hypothèse : elle n'a pas pu être testée quand c'est l'autre joueur qui crée le groupe.
- Testé sur un compte Epic, Windows. Compatibilité avec Steam probable mais non vérifiée.
- Non testé pendant une partie classée avec Easy Anti-Cheat actif. L'appli ne touche pas au jeu, mais je ne peux pas le garantir à la place de Psyonix.
- Pas de lien avec Psyonix ni Epic Games. « Rocket League » est une marque de Psyonix.

## Installation

Node.js 20 ou plus.

```bash
npm install
npm start
```

- La fenêtre n'apparaît que quand Rocket League tourne (le jeu écrit dans son journal toutes les 60 s ; sans écriture depuis 3 minutes, l'overlay se masque). « Toujours afficher » dans le menu désactive ce comportement.
- Glisser avec le bouton gauche pour déplacer la fenêtre.
- Clic droit sur la fenêtre ou sur l'icône de la zone de notification : playlist (1v1, 2v2, 3v3), écran (si plusieurs), « Toujours afficher », page web locale, aide « Overlay invisible ? » et quitter.
- Relancer `npm start` quand l'appli tourne déjà force l'affichage de la fenêtre.
- `RL_LOG_DIR` permet de pointer vers un autre dossier de journaux.

L'historique des relevés et la position de la fenêtre sont enregistrés dans le dossier de données de l'application (`%APPDATA%\rocket-league-rank-overlay`).

## Compatibilité d'affichage

L'overlay est une fenêtre « toujours au premier plan » : il ne s'injecte pas dans le jeu (Easy Anti-Cheat l'interdirait), il se pose par-dessus.

- Mesuré sur un poste Windows 11, jeu en mode sans bordure 2560 × 1440 : la fenêtre s'affiche bien par-dessus le jeu.
- Windows ne remet pas toujours une fenêtre devant un jeu lancé **après** elle (observé : l'overlay lancé 14 secondes avant le jeu restait caché derrière). L'appli se repose donc au premier plan toutes les 2 secondes tant qu'elle est affichée ; vérifié en plaçant volontairement le jeu devant : elle revient en moins de 2 secondes.
- Non vérifié : le plein écran « exclusif » du jeu, où Windows peut masquer toute fenêtre externe. Dans ce cas : mode fenêtré ou sans bordure, autre écran, ou page web ci-dessous.
- Deux écrans : l'overlay s'ouvre par défaut sur l'écran secondaire (menu **Écran** pour choisir). Une position glissée à la main est conservée tant que l'écran reste branché.

## Page web locale

Menu **Page web locale** : la même interface dans un navigateur, sur un téléphone, une tablette ou comme source navigateur d'OBS. Elle n'est jamais cachée par le jeu.

- Désactivée par défaut. Activée, elle n'écoute que sur ce PC (`http://127.0.0.1:49210`).
- **Ouverte au réseau local** (case du menu) : accessible depuis un téléphone sur le même Wi-Fi. Le pare-feu Windows demandera une autorisation. Il n'y a pas de mot de passe : la page ne montre que le rang, le MMR et la session, aucun identifiant de compte.
- OBS : ajouter `?transparent` à l'adresse pour un fond transparent.
- Seuls quelques fichiers d'une liste fixe sont servis, en lecture seule ; les requêtes dont l'en-tête `Host` n'est pas une adresse IP ou `localhost` sont refusées.

## Paquet Windows (sans Node.js)

```bash
npm run package
```

Produit `dist/rocket-league-rank-overlay-win32-x64/` (environ 360 Mo non compressé) avec `rocket-league-rank-overlay.exe` : un dossier à copier ou à zipper, qui se lance sans installer Node.js. Le programme n'est pas signé : Windows SmartScreen affichera un avertissement au premier lancement.

## Architecture

```
core/              logique pure, sans Electron ni accès disque, entièrement testée
  ranks.js           localisation d'un MMR dans une table de seuils, validation du format
  logparser.js       extraction des relevés depuis les lignes du journal, détection du chef de groupe
  samples.js         quels relevés sont ceux du joueur (solo, ou groupe dont il est chef)
  calibration.js     apprentissage des seuils de montée/descente de tier (hystérésis)
  view.js            relevés -> modèle d'affichage (session, segments, distances)
data/              données modifiables sans toucher au code
  ranks/             une table de seuils de division par playlist (voir data/README.md)
src/main/          Electron (processus principal)
  main.js            démarrage et branchement des modules, rien d'autre
  overlayState.js    état de l'overlay : relie journal, stockage, réglages, visibilité (sans Electron)
  overlayWindow.js   fenêtre transparente sans focus, déplacement, affichage/masquage
  menu.js            menu contextuel et icône de la zone de notification
  placement.js       où poser la fenêtre selon les écrans branchés (fonction pure)
  webServer.js       page web locale (HTTP + événements en direct), sans Electron
  logWatcher.js      tail incrémental de Launch.log, reprise après relance du jeu, détection « jeu ouvert »
  store.js           historique JSON dédoublonné et réglages
  trayIcon.js        icône dessinée en code
  paths.js           localisation du dossier de journaux
src/preload/       pont minimal et sûr vers l'interface (contextIsolation)
src/renderer/      interface : HTML/CSS/JS sans framework, polices locales (licence OFL)
test/              tests node:test sur données synthétiques
scripts/           outils de développement : diagnostic sur de vrais journaux, capture d'écran
docs/              image du README
.github/workflows/ vérification automatique (Linux et Windows)
```

Flux de données :

```
Launch.log --(logWatcher)--> relevés --(store)--> historique
                                        |
                       core/view.js <---+--- data/ranks/*.json
                            |
                    overlayState --(overlayWindow)--> interface
```

`core/` ne dépend ni d'Electron ni du système de fichiers : on peut le réutiliser tel quel avec une autre interface. `overlayState.js` non plus, ce qui permet de tester la logique de visibilité sans lancer Electron.

## Performances

Mesuré sur la version actuelle : 3 processus, environ 86 Mo de mémoire privée, environ 0,1 % d'un cœur au repos. L'accélération matérielle est désactivée (l'appli n'affiche que du texte et quelques barres) et rien ne tourne en boucle à part le `stat` toutes les 2 secondes.

## Tests

```bash
npm test
```

## Licence

MIT. Police Barlow Condensed sous licence SIL OFL 1.1 (`src/renderer/fonts/LICENSE-OFL.txt`).

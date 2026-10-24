# KronoJ

Application desktop Windows pour les zmanim et le calendrier hébraïque. Les calculs astronomiques sont locaux ; la carte et le géocodage utilisent OpenStreetMap.

## Stack

- **Tauri 2** (Rust) — tray système, persistance native
- **Vite + TypeScript vanilla** — UI sans framework
- **Leaflet + OpenStreetMap** — choix du lieu sur carte interactive
- **tz-lookup** — fuseau horaire calculé hors ligne depuis les coordonnées
- **kosher-zmanim** — calculs astronomiques
- **calj-jdates** (cloné dans `src/lib/calj-jdates`) — dates hébraïques, fêtes, Omer

## Développement

```bash
npm install
npm run tauri dev
```

## Build .exe

Prérequis : [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) avec « Développement Desktop en C++ ».

```bash
npm run tauri build
```

L'exécutable se trouve dans `src-tauri/target/release/bundle/`.

## Publication GitHub

Une release Windows publique est compilée automatiquement lorsqu'un tag de version `v*` est poussé. Le workflow publie quatre installateurs x64 : MSI et EXE avec WebView2 téléchargé si nécessaire, ainsi que MSI et EXE avec le programme d'installation WebView2 hors ligne inclus. GitHub ajoute aussi les archives du code source correspondant au tag.

Quand vous souhaitez publier les changements actuels, lancez une seule commande pour incrémenter la version, synchroniser les fichiers, créer le commit et le tag, puis tout pousser sur GitHub :

```bash
npm run release -- patch
```

La commande inclut dans le commit de release les changements déjà présents dans le dépôt, synchronise les versions dans les fichiers npm, Tauri et Rust, puis pousse le commit et le tag ensemble vers `origin`. Remplacez `patch` par `minor` ou `major` pour choisir le type d'incrément. Vérifiez `git status` avant de la lancer : toutes les modifications non ignorées (indexées, modifiées ou nouvelles) seront incluses.

La compilation et la publication peuvent être suivies dans l'onglet **Actions** du dépôt ; la release apparaît ensuite dans **Releases**.

## Build Microsoft Store

Le profil Store produit uniquement l'installateur NSIS et utilise l'installateur WebView2 hors ligne :

```bash
npm run tauri:store
```

Dans Partner Center, indiquez `/S` (S majuscule) comme argument d’installation silencieuse pour l’installateur `-setup.exe`. Vous pouvez le vérifier manuellement en exécutant le fichier généré avec `/S`, par exemple `KronoJ_<version>_x64-setup.exe /S`. La publication demande également une signature de code et un mécanisme de mise à jour.

## Fonctionnalités

- Timeline zmanim chronologique (Tzeit en bas)
- Surbrillance du prochain zman
- Bascule automatique au lendemain après Tzeit
- Paracha hebdomadaire affichée toute la semaine et mise en évidence le Shabbat
- Jour de la semaine selon le calendrier hébraïque
- Notifications natives de bureau pour les zmanim sélectionnés, planifiées même lorsque la fenêtre est masquée
- Démarrage automatique configurable et lancement réduit dans la zone de notification
- Instance unique : une seconde ouverture réaffiche la fenêtre déjà lancée
- Méthode Rav Ovadia (minutes proportionnelles) / Or Méir (angles solaires)
- Zmanim calculés pour la date et les coordonnées sélectionnées, dont Tzeit et Rabbénou Tam
- Sélection d’une date par jour, mois et année dans les calendriers civil ou hébraïque
- Choix initial et réglage du mode de localisation : automatique ou carte
- Langue des horaires sélectionnable : français ou hébreu
- Widgets PWA Windows pour la date hébraïque en formats carré 1:1 et large 2:1
- Fêtes et paracha déterminées à partir du pays de la position (Israël / diaspora)
- Géolocalisation GPS ou sélection manuelle sur la carte mondiale, avec recherche de lieux (tuiles OpenStreetMap)
- Cache local des coordonnées pour fonctionnement offline au redémarrage
- Configuration de la langue et de la position au premier lancement
- Fermeture → icône dans la barre des tâches

Les notifications Windows sont prises en charge dans la version installée de l’application. Le système peut également nécessiter l’autorisation des notifications dans ses réglages.

## Widgets Windows

KronoJ fournit deux widgets PWA pour le tableau des widgets de Windows 11 : un format carré et un format horizontal. Ils reprennent la position et la méthode de calcul enregistrées dans la PWA et actualisent la date hébraïque selon le coucher du soleil local.

Pour les utiliser, la version web doit être publiée sur une adresse HTTPS publique et installée comme application depuis Microsoft Edge. Ouvrez ensuite le tableau des widgets avec `Windows + W`, sélectionnez **Ajouter des widgets**, puis ajoutez les formats KronoJ souhaités. Le projet Tauri seul ne peut pas inscrire ces widgets auprès de Windows ; le paquet Windows Widgets/PWA doit être distribué séparément depuis l’URL publiée. Les widgets apparaissent dans le tableau des widgets, pas sur l’écran de verrouillage.

## Calcul des zmanim

Les calculs utilisent la date civile du lieu, ses coordonnées et son fuseau horaire, sans correction d’altitude afin de rester cohérents avec CalJ.net. Le lever et le coucher définissent les 12 heures proportionnelles du GR"A. Le choix de méthode détermine l’aube, le début des téfilines et Rabbénou Tam :

- **Rav Ovadia Yossef** : alot 72 minutes saisonnières avant le lever, début téfilines 6 minutes saisonnières après l’aube et Rabbénou Tam 72 minutes saisonnières après le coucher.
- **Or Méir** : alot et Rabbénou Tam à 16,1° sous l’horizon et début téfilines à 11°.

Tzeit est calculé à 7,083° sous l’horizon. La fin du Shema M"A suit les bornes Posen (aube et Rabbénou Tam à 16,1°) ; la fin du Shema GR"A est calculée après 3 heures proportionnelles entre lever et coucher. La fin de la Tefila suit le GR"A (4 heures). Hatzot est le milieu entre lever et coucher ; Min’ha Guedola survient après la plus longue durée entre 30 minutes fixes et une demi-heure proportionnelle après Hatzot ; Min’ha Ketana survient après 9,5 heures et le Plag GR"A après 10,75 heures. Le Plag de Yalkout Yossef reste calculé selon la formule de la spécification fournie. L’allumage des bougies est affiché le vendredi, 18 minutes avant le coucher (40 minutes à Jérusalem) ; la fin de Shabbat est affichée le samedi à 8,5° sous l’horizon.

Les horaires du matin et les limites diurnes sont arrondis à la minute inférieure ; les horaires du soir sont arrondis à la minute supérieure, sans arrondir les durées intermédiaires. Les horaires impossibles à établir astronomiquement (par exemple en période de soleil de minuit) ne sont pas inventés.

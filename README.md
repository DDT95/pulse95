# Carte de stress

Carte publique des pressions territoriales du Val-d’Oise. Les couches sont indépendantes et superposables :

- validations en gare IDFM ;
- 1 676 arrêts de bus et tram issus du GTFS IDFM, représentés par leur aire piétonne indicative ;
- trafic Sytadin et avions ADS-B en direct ;
- incidents routiers en direct (TomTom Traffic Incidents) ;
- perturbations du réseau IDFM en direct (PRIM, SIRI Lite) ;
- qualité de l’air en direct (LCSQA/INERIS, réseau Airparif, sans clé) ;
- cartes de bruit Bruitparif et classement sonore réglementaire ;
- coexposition air-bruit Airparif / Bruitparif ;
- chaleur urbaine de L’Institut Paris Region et température Open-Meteo ;
- artificialisation OCS GE de l’IGN ;
- équipements publics issus des bases publiques OSM, INSEE/BPE et DILA.

L’influence des équipements est une mesure cumulative sur une grille de 500 m : chaque maille compte les lieux de sa maille et des huit voisines (environ 750 m), sans pondération par catégorie. Cette lecture reprend le principe des indicateurs d’accessibilité cumulative documentés par le Cerema ; elle mesure une concentration de lieux, pas leur fréquentation.

Les gares utilisent un socle d’influence de 800 m, élargi visuellement selon leurs validations journalières IDFM. Les arrêts utilisent un rayon de 200 m. Onze grands pôles commerciaux OpenStreetMap sont signalés par un halo de 1 km, explicitement distinct d’une zone de chalandise.

Un clic ouvre une fiche de stress territoriale complète, indépendamment des couches visibles. Les huit sous-notes disponibles sont ramenées sur 100 puis moyennées à poids égal. La fiche est reliée au géocodage inverse BAN de la Géoplateforme et peut être imprimée ou exportée en JSON. Les données brutes et les limites restent affichées avec le score.

## Publication

Le site est statique et publié par GitHub Pages depuis la branche `main`.

## Flux en direct : activation

Le trafic Sytadin, les avions ADS-B et la qualité de l’air (LCSQA/INERIS)
fonctionnent sans configuration. Deux couches supplémentaires nécessitent
une clé gratuite, à ajouter en secret du dépôt GitHub (`Settings › Secrets
and variables › Actions`) :

- **`TOMTOM_API_KEY`** — incidents routiers en direct. Inscription libre sur
  [developer.tomtom.com](https://developer.tomtom.com/), palier gratuit
  largement suffisant pour un appel toutes les 5 minutes.
- **`PRIM_API_KEY`** — perturbations du réseau IDFM. Inscription libre sur
  [prim.iledefrance-mobilites.fr](https://prim.iledefrance-mobilites.fr/),
  abonnement à l’API « IVTR info-trafic » (SIRI Lite GeneralMessage) pour
  obtenir le jeton.

Une fois un secret ajouté, la couche correspondante s’active toute seule au
prochain passage de `.github/workflows/sync-live.yml` (toutes les 5 min),
sans autre changement de code.

**Bruit mesuré en direct (Bruitparif RUMEUR) et survols mesurés au sol
autour de Roissy (Bruitparif/ADP/ACNUSA)** restent hors de portée : ces
organismes ne publient ces mesures que via des tableaux de bord de
consultation, sans API publique documentée. Un accès nécessiterait un
contact direct, en tant que service partenaire de l’État.

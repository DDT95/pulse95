# Carte de stress

Carte publique des pressions territoriales du Val-d’Oise. Les couches sont indépendantes et superposables :

- validations en gare IDFM ;
- 1 676 arrêts de bus et tram issus du GTFS IDFM, représentés par leur aire piétonne indicative ;
- trafic Sytadin et avions ADS-B en direct ;
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

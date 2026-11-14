# Données

## `ranks/`

Une table de seuils de division par playlist (`doubles.json` = 2v2 classé, playlist 11).

```json
{
  "playlist": 11,
  "name": "Doubles (2v2) classé",
  "season": null,
  "updated": "2026-11-14",
  "source": "d'où viennent les chiffres",
  "tiers": [
    { "name": "Bronze I", "divisions": [-100, 120, 138, 157] },
    ...
    { "name": "Supersonic Legend", "divisions": [1861] }
  ]
}
```

- 22 tiers, du plus bas au plus haut. Chacun a 4 valeurs (le MMR minimum de la division I à IV), sauf
  Supersonic Legend qui n'en a qu'une.
- Les valeurs sont strictement croissantes d'un bout à l'autre du fichier.
- Le format est vérifié au chargement (`validateRanksData` dans `core/ranks.js`) et par les tests :
  un fichier invalide fait échouer le démarrage plutôt que d'afficher de mauvaises divisions.

### Mettre à jour une saison

1. Modifier les `divisions` (et `season`, `updated`, `source`) dans le fichier.
2. `npm test`.

### Ajouter une playlist (1v1, 3v3)

Créer `ranks/duel.json` ou `ranks/standard.json` avec le bon `playlist` (10 ou 13), puis l'ajouter à la
table `TABLES` de `core/ranks.js`. Tant qu'une playlist n'a pas sa table, l'overlay utilise celle du
2v2 et l'indique (« divisions estimées »).

Ces seuils sont des plages observées de MMR, pas des valeurs officielles : le tier affiché vient
toujours du journal de jeu, seule la division est déduite de cette table.

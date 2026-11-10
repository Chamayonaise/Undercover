# Undercover

Jeu d'ambiance et de déduction sociale (3 à 20 joueurs), jouable sur **un seul téléphone** qu'on se passe.

👉 **Jouer : https://chamayonaise.github.io/Undercover/**

- Règles complètes : [regles.md](regles.md)
- Banque de mots : [paires.json](paires.json) — provenance dans [CREDITS.md](CREDITS.md)

## Fonctionnalités

- Ajout des joueurs (mémorisés d'une partie à l'autre)
- Répartition des rôles recommandée ou personnalisée (contraintes des règles vérifiées)
- Filtres par catégorie et difficulté, sans répétition des paires déjà jouées
- Distribution secrète des mots, ordre de parole aléatoire (Mr. White ne commence jamais)
- Vote avec décompte des voix, départage en cas d'égalité puis tirage au sort
- Dernière chance de Mr. White, conditions de victoire, points et classement
- Partie sauvegardée en cas de rechargement, utilisable hors ligne, installable sur l'écran d'accueil

## Lancer en local

```sh
python3 -m http.server
```

puis ouvrir http://localhost:8000 (un serveur est nécessaire pour charger `paires.json`).

# Lecteur d'écran vocal

Application web qui capture l'écran de l'ordinateur, en extrait le texte (OCR), et le lit à
voix haute en respectant sa structure (titres, paragraphes, listes, tableaux).

Pensée pour une personne malvoyante : gros boutons, contrastes forts, flux d'utilisation le
plus court possible (un seul bouton principal).

## Fonctionnement

Tout se passe dans le navigateur, aucune donnée n'est envoyée à un serveur :

1. **Capture** : `getDisplayMedia` demande de partager l'écran (le navigateur affiche une
   fenêtre de confirmation — choisir « Écran entier »).
2. **OCR** : [Tesseract.js](https://github.com/naptha/tesseract.js) extrait le texte et la
   position de chaque mot, entièrement côté client.
3. **Structuration** : des règles (taille de police, puces, alignement en colonnes) classent
   le texte en titres, paragraphes, listes ou tableaux.
4. **Lecture vocale** : l'API `SpeechSynthesis` du navigateur lit le texte, avec des annonces
   ("Titre.", "Liste.", "Ligne 1.") pour restituer la structure à l'oral.

## Développement local

```bash
npm install
npm run dev
```

Ouvrir [http://localhost:3000](http://localhost:3000). `getDisplayMedia` fonctionne sur
`localhost` sans certificat HTTPS ; en production HTTPS est obligatoire (Vercel le fournit
automatiquement).

## Déploiement (Vercel)

1. Connecter ce dépôt GitHub à un nouveau projet Vercel (aucune configuration nécessaire,
   Vercel détecte Next.js automatiquement).
2. Chaque `git push` sur la branche principale redéploie automatiquement.

## Compatibilité navigateur

- **Recommandé** : Google Chrome ou Microsoft Edge à jour (support complet de la capture
  d'écran et des voix françaises).
- Safari : la capture d'écran fonctionne, mais le choix de voix françaises de haute qualité
  peut être plus limité selon la version de macOS.
- Firefox : support partiel de la synthèse vocale selon les systèmes.

## Limites connues (version actuelle, voix gratuite)

- La qualité de la voix dépend des voix installées sur l'ordinateur (voix système gratuites
  via `SpeechSynthesis`). Une voix cloud plus naturelle (ex. Google Cloud TTS, ElevenLabs)
  pourra être ajoutée dans une prochaine version si besoin.
- La détection des tableaux est basée sur des heuristiques (alignement des colonnes) : les
  mises en page très complexes peuvent être lues comme de simples paragraphes.
- Une confirmation de partage d'écran est requise par le navigateur à chaque capture (limite
  de sécurité imposée par les navigateurs, non contournable en version web).

# Mettre à jour GitHub et Vercel

## Méthode 1 : sur le site GitHub (sans rien installer)

1. Décompressez `cas-zero.zip` sur l'ordinateur. Ouvrez le dossier `cas-zero`.
2. Sur GitHub, ouvrez votre dépôt, puis **Add file → Upload files**.
3. Glissez **tout le contenu** du dossier `cas-zero` (fichiers ET dossiers `data`, `icons`, `tools`, `modeles`), pas le dossier lui-même.
4. En bas, écrivez un message (ex. « Menu, thème sombre, examen par silhouette ») et cliquez **Commit changes**.
5. Vercel redéploie tout seul en 1 à 2 minutes. Ouvrez le site, puis **Ctrl+Maj+R** (sur téléphone : fermez et rouvrez l'application).

GitHub remplace les fichiers du même nom. Le dossier `data` doit rester à la racine (à côté de `index.html`), sinon le cas ne se charge pas.

## Méthode 2 : GitHub Desktop (plus confortable pour continuer)

1. Installez GitHub Desktop et connectez votre compte.
2. **File → Clone repository**, choisissez votre dépôt : un dossier local est créé.
3. Copiez le contenu de `cas-zero` dans ce dossier (remplacez les fichiers).
4. Dans GitHub Desktop : écrivez un message en bas à gauche, **Commit to main**, puis **Push origin**.

Par la suite, chaque nouvelle version se met en ligne de la même façon, en trois clics.

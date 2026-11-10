# Guide : écrire un nouveau cas clinique

Le cas « méningite / paludisme » sert de modèle. Un nouveau cas ne demande **aucun code** : on remplit un fichier JSON.

## 1. Les 5 étapes

1. Copiez `modeles/modele-cas.json` vers `data/cas-NOM-DU-CAS.json`.
2. Remplissez tous les champs « À remplir » (voir les sections ci-dessous).
3. Vérifiez le fichier :
   ```bash
   node tools/validate-case.js data/cas-NOM-DU-CAS.json
   ```
   (ou, sans Node, relisez la liste de contrôle en fin de guide).
4. Ajoutez le cas dans `data/cas-index.json` :
   ```json
   { "id": "cas-nom-du-cas", "fichier": "data/cas-NOM-DU-CAS.json",
     "service": "medecine-interne", "titre": "Titre affiché dans le menu",
     "difficulte": "Intermédiaire", "duree": "10 minutes",
     "resume": "Une ligne : qui est le patient et pourquoi il est là." }
   ```
   `service` doit être l'un des `id` de `accueil.services` dans `data/interface.json` (medecine-interne, urgences, reanimation, gynéco-obstétrique…). Le cas apparaît alors dans ce service du menu. Ajoutez `"aLaUne": true` pour en faire le « Cas du jour ».
   L'application s'ouvre sur le menu d'accueil. Pour ouvrir directement un cas (lien à partager) : `https://votre-site.vercel.app/?cas=cas-nom-du-cas`.
5. Ajoutez le fichier dans la liste `APP_SHELL` de `sw.js` et changez `cas-zero-v8` en `cas-zero-v8` (pour le mode hors ligne), puis publiez sur GitHub.

## 2. Ce que contient un cas

| Section | Rôle |
|---|---|
| `metadonnees` | Difficulté et durée affichées sur l'écran d'accueil |
| `regles` | `penaliteAide` (points perdus par indice) et `tentativesDiagnosticAvantReponse` |
| `introduction` | Lieu, contexte, motif : écran « Aperçu » (les constantes viennent de l'étape 2) |
| `etape1_anamnese` | Conversation avec la famille : éléments (questions clés, utiles, standard), récit spontané, accueil |
| `etape2_examen_physique` | Constantes et manœuvres de l'examen clinique (clés, utiles, par défaut) |
| `etape3_paraclinique` | Examens prioritaires, examens acceptables, malus d'examen inutile |
| `etape4_diagnostic` | Diagnostics attendus avec leurs points |
| `etape5_traitement` | Classes de traitement obligatoires, erreurs fatales |
| `etape6_debriefing` | Points à retenir (format « Titre : explication ») |

## 3. Règles de score

- On part de `scoreInitial` (100) et il n'y a **que des pénalités**. Le score ne passe jamais sous 0.
- Indice « Besoin d'aide ? » : `penaliteAide` (une fois par étape).
- Anamnèse : **aucune pénalité** (seulement le retour du débriefing).
- Examen clinique : `malusSiOubli` si l'étudiant part sans avoir réalisé aucune manœuvre clé.
- Examen sans rapport à l'étape 3 : `malusExamenInutile` (une seule fois par texte identique).
- Diagnostic que l'étudiant n'a pas trouvé (il clique sur « Voir la réponse ») : les `points` du diagnostic.
- Examen sensible demandé sans précaution préalable (ex. PL sans imagerie) : `malus` du `prerequis` (une seule fois par examen).
- Erreur fatale à l'étape 5 : `punition`.
- Total des pénalités fixes à garder sous le score initial (le validateur vous prévient).

## 4. Écrire de bons mots-clés

- Écrivez-les **sans accent, en minuscules**. Le moteur ignore de toute façon accents, majuscules et ponctuation.
- Un mot de **3 lettres ou moins** (`pl`, `ge`, `tdm`) doit apparaître comme mot entier : « pl » ne se déclenche pas dans « plasmodium ».
- Un mot de plus de 3 lettres est trouvé **à l'intérieur** d'un mot : `cepha` reconnaît « céphalées ».
- Les mots de 6 lettres ou plus tolèrent **une faute de frappe** (deux pour 10 lettres ou plus) : « ceftriaxon » est reconnu.
- Prévoyez les synonymes, les abréviations courantes et les noms commerciaux.
- Une négation juste avant un mot de l'étape 5 annule l'erreur fatale (« pas de midazolam »).

## 5. Anamnèse : une conversation avec la famille

L'étudiant pose ses questions librement. La famille répond à la première personne, comme dans la vraie vie. Rien n'est affiché à l'avance : chaque information doit être demandée. L'étudiant peut **terminer quand il veut** ; les remarques arrivent au débriefing, sans pénalité.

### Les 4 rubriques (dans cet ordre)

1. **Symptôme dominant** : motif de consultation, installation du symptôme principal
2. **Antécédents** : médicaux, chirurgicaux, gynéco-obstétrique, médicaments habituels, allergies, familiaux, vaccination
3. **Histoire de la maladie actuelle** : caractérisation de la plainte (OLDCARTS : apparition, localisation, durée/évolution, caractère, facteurs aggravants/atténuants, irradiation, chronologie, intensité), symptômes associés, traitements reçus avant la consultation
4. **Compléments d'anamnèse** : mode de vie, environnement/voyage/prévention, revue des systèmes

### Les questions standard (réutilisées dans tous les cas)

`data/interface.json`, bloc `anamnese.questionsStandard`, contient les questions classiques avec leurs mots-clés, une question type, une explication pédagogique et, pour certaines, une **réponse normale par défaut** (comme pour les constantes). Un cas n'écrit que ce qui le distingue :

- **Question standard avec réponse par défaut** (antécédents, allergies, tabac, revue des systèmes…) : si le cas ne la mentionne pas, la famille répond « normal ». Pour la changer ou la rendre importante, ajoutez un élément avec le même `id`.
- **Question standard sans réponse par défaut** (grossesse, caractère, localisation, facteurs, irradiation, chronologie, gravité, prévention du paludisme, symptômes associés) : le cas **doit** fournir la réponse, sinon la question n'existe pas dans ce cas.
- **Question propre au cas** (fièvre, midazolam à domicile…) : élément complet avec `rubrique`, `sousRubrique`, `libelle`, `questionExemple`, `motsCles`, `reponse`.

### Un élément du cas

```json
{ "id": "automedication", "rubrique": "histoire_maladie", "sousRubrique": "prise_en_charge",
  "pertinence": "cle",
  "libelle": "Automédication",
  "questionExemple": "A-t-elle pris des médicaments pour ses maux de tête ? Lesquels ?",
  "motsCles": ["=ains", "anti inflammatoire", "paracetamol"],
  "exclusions": ["habituel"],
  "reponse": "Oui, elle a pris des anti-inflammatoires qu'on avait à la maison.",
  "note": "Automédication par AINS",
  "pourquoi": "L'automédication peut masquer la fièvre et retarder la prise en charge.",
  "aValider": true }
```

| Champ | Rôle |
|---|---|
| `pertinence` | `cle` (l'étudiant doit la poser), `utile`, ou `systematique` (par défaut pour une question standard) |
| `reponse` | Ce que dit la famille, **à la première personne, ton naturel** |
| `note` | Phrase courte écrite dans le carnet de l'étudiant |
| `pourquoi` | Explication du débriefing (surtout pour les questions clés) |
| `motsCles` | Mots en plus de ceux de la question standard |
| `exclusions` | Si un de ces mots est présent, la question ne se déclenche pas (évite les confusions) |
| `inclut` | Liste d'autres `id` marqués comme obtenus quand cette réponse est donnée |
| `aValider` | À vrai si la réponse est une proposition à faire relire par un médecin |

### Comportement de la famille

- Une question précise donne la réponse correspondante. Une même question peut déclencher plusieurs réponses (3 au maximum) ; au-delà, la famille demande de poser les questions **une par une**.
- Une **question ouverte** (« racontez-moi… ») fait raconter 2 éléments de la liste `recitSpontane`, dans l'ordre. N'y mettez pas les éléments qui doivent être demandés précisément (par exemple un sédatif donné à domicile).
- Une question sans rapport : « je ne sais pas, pouvez-vous reformuler ? ». Une question déjà posée : « je vous l'ai déjà dit ».
- Salutation, présentation, empathie et synthèse sont repérées et commentées au débriefing (**sans note**).
- Le bouton « Besoin d'aide ? » (-2) désigne la première rubrique non explorée, puis ajoute l'`aide` du cas.

### Mots-clés

- Écrits en **minuscules, sans accent, sans apostrophe** (le moteur ignore de toute façon accents et majuscules).
- 3 lettres ou moins : mot entier. Pour forcer un mot entier plus long, écrivez `=ains` (sinon « certains » le déclencherait).
- Plus de 3 lettres : trouvé à l'intérieur d'un mot (`cepha` reconnaît « céphalées »). Fautes de frappe légères tolérées à partir de 6 lettres.
- Testez avec de vraies phrases d'étudiants (`node tools/test-engine.js` contient une batterie à imiter).

### Relecture médicale

`node tools/export-a-valider.js > A-VALIDER.md` produit la liste de tout ce qui reste à faire valider par un clinicien : réponses marquées `aValider`, réponses par défaut utilisées, textes « pourquoi » des questions clés.

## 5b. Examen clinique : l'étudiant mène l'examen

À l'étape 2, une silhouette du patient et cinq outils (Inspecter, Palper, Percuter, Ausculter, Neuro). L'étudiant choisit un outil puis touche une zone du corps (tête et cou, thorax, abdomen, membres, corps entier). Les résultats s'affichent et vont dans le « Carnet d'examen ».

- Le **catalogue** de manœuvres est commun à tous les cas (`data/interface.json`, bloc `examenPhysique`). Chaque manœuvre a une région (pour le débriefing), une `zone` du corps, une `technique` (donc un outil) et un **résultat normal par défaut**.
- Un cas ne liste dans `manoeuvres` que ce qui le distingue : `id` (celui du catalogue), `resultat`, `pertinence` (`cle`, `utile`, `systematique`), `pourquoi`, `aValider`.
- Une manœuvre **clé** doit avoir son propre `resultat` (le validateur refuse le résultat normal par défaut).
- Une manœuvre **utile** sans `resultat` garde le résultat normal : écrivez seulement le `pourquoi` (ex. chercher un purpura ou une splénomégalie).
- Une manœuvre **propre au cas** (absente du catalogue) demande `region`, `zone`, `libelle`, `technique`, `resultat`.
- Un outil appliqué sur une zone sans manœuvre correspondante donne « Rien de particulier à noter ». Aucune pénalité.
- Si l'étudiant continue sans aucune manœuvre clé : `malusSiOubli` points en moins, et les manœuvres clés sont ajoutées à son carnet.
- Au débriefing : une carte repliée « Examen clinique » (manœuvres clés réalisées, détail par région au clic).

## 5c. Menu d'accueil et thème

- Le menu (services, modes express, cas du jour) est piloté par `data/interface.json`, bloc `accueil`. Un service avec au moins un cas dans `data/cas-index.json` est ouvert ; les autres affichent « Bientôt ».
- Pour ajouter un service : une entrée dans `accueil.services` (`id`, `nom`, `couleur`, `icone`).
- Le mode clair/sombre se règle avec le bouton soleil/lune (choix mémorisé ; sinon suit le réglage du téléphone). Les couleurs sont des variables dans `styles.css` (`:root` et `:root[data-theme="dark"]`).

## 6. Adapter le cas au contexte (les « nuances »)

Ces champs changent l'esprit du cas sans toucher au moteur :

- **Lieu et ressources** : `introduction.lieu` et `introduction.contexte` (zone d'endémie, structure isolée, consultation, domicile...).
- **Constantes** : ne renseignez que celles qui sont citées ou pathologiques. Toutes les autres sont complétées automatiquement par des **valeurs normales** (`constantesParDefaut` dans `data/interface.json` : TA 120/80, FC 80, FR 16, SpO₂ 98 %, T° 37,0 °C, glycémie 100 mg/dl). Les six constantes sont toujours visibles dans l'aperçu, à l'examen physique et sur le moniteur. Une valeur du cas remplace la valeur normale.
- **Examens acceptables** : listez les examens raisonnables mais non prioritaires, avec `malus: 0` (ou un petit malus). Sans `resultat`, l'étudiant voit « aucun résultat disponible dans ce cas ».
- **Traitement** : une `groupesTraitement` par classe thérapeutique exigée. L'étudiant doit en couvrir **chacune**.
- **Difficulté** : jouez sur le nombre d'informations essentielles, les pièges (examen utile mais non prioritaire, erreur fatale plausible) et `tentativesDiagnosticAvantReponse`.

## 7. Examens avec prérequis (ex. imagerie avant la PL)

Certains examens exigent une précaution préalable. Dans `examensValides` :

- Les examens qui peuvent se **substituer** l'un à l'autre portent le même `groupeAlternatif` (ex. imagerie cérébrale **ou** fond d'œil). Un seul suffit pour valider le groupe.
- L'examen sensible porte un `prerequis` : `groupe` (le groupe à faire d'abord), `malus`, `libelleJournal` (intitulé dans le débriefing) et `message` (explication affichée à l'étudiant).
- Si l'étudiant demande l'examen sensible trop tôt : il est **bloqué** (pas de résultat), le malus s'applique une seule fois, puis l'examen passe dès qu'un examen du groupe est fait.
- Si les deux sont demandés dans le même message dans le bon ordre (« scanner puis PL »), aucune pénalité.
- Le bilan est complet quand tous les examens sans groupe sont faits **et** qu'un examen de chaque groupe est fait.

Voir `modeles/modele-cas.json` pour un exemple complet.

## 8. Liste de contrôle avant publication

- [ ] Constantes cohérentes avec les résultats de l'examen (même fréquence cardiaque, etc.)
- [ ] Chaque manœuvre clé de l'examen a son résultat et son « pourquoi » ; les résultats par défaut ne contredisent pas le cas
- [ ] Masculin/féminin cohérent partout (patient ou patiente)
- [ ] Chaque étape a un `aide` (sauf traitement et débriefing)
- [ ] L'anamnèse a 5 à 10 questions clés, chacune avec un `pourquoi`, et aucune réponse n'est un récit (la famille parle à la première personne)
- [ ] Les réponses marquées `aValider` ont été relues par un clinicien
- [ ] Aucun mot-clé d'examen acceptable n'est aussi un examen prioritaire
- [ ] Les examens à risque (PL, etc.) ont leur `prerequis` si une précaution est nécessaire
- [ ] Aucun médicament attendu n'est aussi une erreur fatale
- [ ] Le cas a été joué en entier, une fois sans faute et une fois avec des erreurs
- [ ] Contenu médical relu et validé par un clinicien

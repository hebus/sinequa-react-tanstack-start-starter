# Publier le tutoriel sur GitHub Pages

Procédure reproductible utilisée pour publier le tutoriel interactif (`tutorial/`) sur les
**GitHub Pages** du repo, à l'URL :

> **https://hebus.github.io/sinequa-react-tanstack-start-starter/**

Le principe : une branche **`gh-pages`** dédiée, contenant le **contenu de `tutorial/` à sa
racine**. La branche `main` n'est pas modifiée (le tutoriel y reste dans `tutorial/`).

---

## 0. Prérequis

- Le code est déjà poussé sur `main`.
- `gh` (GitHub CLI) **authentifié** avec les droits sur le repo :
  ```bash
  gh auth status   # doit lister le compte propriétaire du repo
  ```
- Le tutoriel est généré (`npm run tutorial`) → `tutorial/index.html` et
  `tutorial/aller-plus-loin/index.html` existent.

---

## 1. Pourquoi une branche `gh-pages` (et tutoriel à la racine)

- GitHub Pages (mode « branch ») ne sert qu'une **racine** ou un dossier `/docs` — **pas** un
  sous-dossier arbitraire comme `tutorial/`.
- En mettant le **contenu de `tutorial/` à la racine de `gh-pages`**, le site est servi à
  l'URL racine du repo Pages, et les **liens relatifs** du tutoriel restent valides :
  - `index.html` (accueil) → `aller-plus-loin/index.html` ✔
  - `aller-plus-loin/index.html` → `../index.html` (retour) ✔
- On garde ainsi `main` propre (le tutoriel y vit dans `tutorial/`), `gh-pages` ne sert qu'au
  déploiement.

---

## 2. Construire et pousser la branche `gh-pages`

On utilise un **worktree orphelin** (branche sans historique) pour ne pas toucher au répertoire
de travail de `main`.

```bash
# 1) Worktree orphelin (branche gh-pages vide), dans un dossier voisin
git worktree add --orphan -b gh-pages ../ghp

# 2) Copier le contenu du tutoriel À LA RACINE du worktree + désactiver Jekyll
cp -r tutorial/* ../ghp/
touch ../ghp/.nojekyll

# 3) Commit + push de la branche
git -C ../ghp add -A
git -C ../ghp commit -m "docs: publish interactive tutorial to GitHub Pages"
git -C ../ghp push -u origin gh-pages

# 4) Nettoyer le worktree
git worktree remove ../ghp
git worktree prune
```

> 💡 **`.nojekyll`** : sans ce fichier, GitHub Pages passe le site dans **Jekyll**, qui
> **ignore les fichiers/dossiers commençant par `_`** et peut altérer le rendu. Le fichier
> `.nojekyll` (vide) désactive Jekyll et sert les fichiers tels quels.

> 💡 **`--orphan`** : la branche `gh-pages` ne partage **aucun** historique avec `main`
> (c'est un site déployé, pas du code). Le worktree évite de basculer la copie de travail
> principale.

---

## 3. Activer GitHub Pages sur la branche `gh-pages`

Via l'API GitHub (`gh api`), source = branche `gh-pages`, chemin `/` :

```bash
echo '{"source":{"branch":"gh-pages","path":"/"}}' \
  | gh api -X POST repos/hebus/sinequa-react-tanstack-start-starter/pages --input -
```

> ⚠️ Si Pages est **déjà activé**, le `POST` renvoie **HTTP 409** (`GitHub Pages is already
> enabled.`). Dans ce cas, **mettre à jour** la source avec un `PUT` (idempotent, renvoie 204) :
>
> ```bash
> echo '{"source":{"branch":"gh-pages","path":"/"}}' \
>   | gh api -X PUT repos/hebus/sinequa-react-tanstack-start-starter/pages --input -
> ```

Lire la configuration et l'URL publique :

```bash
gh api repos/hebus/sinequa-react-tanstack-start-starter/pages \
  --jq '{status, html_url, branch:.source.branch, path:.source.path}'
# → { "status":"built", "html_url":"https://hebus.github.io/sinequa-react-tanstack-start-starter/", "branch":"gh-pages", "path":"/" }
```

---

## 4. Vérifier

Le build Pages est asynchrone (quelques secondes à ~1 min après le push) :

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://hebus.github.io/sinequa-react-tanstack-start-starter/
curl -s -o /dev/null -w "%{http_code}\n" https://hebus.github.io/sinequa-react-tanstack-start-starter/aller-plus-loin/
# Attendu : 200 et 200
```

---

## 5. Re-déployer après une mise à jour du tutoriel

Quand on régénère le tutoriel (`npm run tutorial`) sur `main`, il faut **re-publier** la branche
`gh-pages` :

```bash
git worktree add --orphan -b gh-pages-tmp ../ghp
cp -r tutorial/* ../ghp/
touch ../ghp/.nojekyll
git -C ../ghp add -A
git -C ../ghp commit -m "docs: update published tutorial"
# remplacer le contenu de gh-pages par ce nouvel état :
git -C ../ghp push -f origin gh-pages-tmp:gh-pages
git worktree remove ../ghp && git worktree prune
git branch -D gh-pages-tmp 2>/dev/null || true
```

> Le `push -f` ici ne concerne que la branche **de déploiement** (`gh-pages`), pas `main` ;
> son historique n'a pas de valeur, on peut le réécrire sans risque.

---

## 6. Automatisation via GitHub Actions (en place)

La publication est automatisée par le workflow **`.github/workflows/deploy-tutorial.yml`**. À
chaque push sur `main` touchant `tutorial/**` (ou manuellement via *Run workflow*), il :

1. installe les deps (`npm ci --ignore-scripts` — seul `marked` est requis pour le build ;
   on évite ainsi le téléchargement des navigateurs Playwright) ;
2. **régénère** le tutoriel (`npm run tutorial`) → la source de vérité reste donc les `.md`,
   pas le HTML committé ;
3. publie le dossier `tutorial/` sur GitHub Pages (`upload-pages-artifact` + `deploy-pages`).

> ⚠️ **Prérequis (une seule fois)** : ce mode requiert *Settings → Pages → Build and deployment
> → **Source : GitHub Actions*** (au lieu de « Deploy from a branch »). En CLI :
>
> ```bash
> gh api -X POST repos/hebus/sinequa-react-tanstack-start-starter/pages \
>   -f build_type=workflow
> # si Pages est déjà activé (HTTP 409), basculer le mode avec un PUT :
> gh api -X PUT repos/hebus/sinequa-react-tanstack-start-starter/pages \
>   -f build_type=workflow
> ```
>
> Une fois en mode `workflow`, la branche **`gh-pages`** (sections 2 à 5) n'est plus utilisée —
> le dossier `tutorial/` est publié directement depuis `main`. Les sections 2-5 restent
> documentées comme **procédure manuelle de secours**.

# Sixième Bœuf

Jeu de cartes multijoueur en temps réel, de 2 à 10 joueurs, chacun sur son ordinateur ou son téléphone.
Aucun compte n'est nécessaire : l'hôte crée une table et envoie le lien à ses amis.

## Contenu

- `server.js` : le serveur de jeu. Il distribue les cartes, garde les mains secrètes et résout les tours.
- `public/index.html` : la page que voient les joueurs.
- `package.json` : la seule dépendance est `ws` (WebSocket).

## Mettre le jeu en ligne gratuitement (Render)

À faire une seule fois, environ 10 minutes.

1. **Mettre le code sur GitHub**
   - Crée un compte sur <https://github.com> si tu n'en as pas.
   - Clique sur **New repository**, nomme-le `sixieme-boeuf`, puis **Create repository**.
   - Clique sur **uploading an existing file** et glisse-dépose `server.js`, `package.json`, `README.md` et le dossier `public`.
   - Clique sur **Commit changes**.

2. **Héberger sur Render**
   - Crée un compte sur <https://render.com> (tu peux te connecter avec GitHub).
   - Clique sur **New +**, puis **Web Service**, et choisis ton dépôt `sixieme-boeuf`.
   - Remplis les réglages :
     - Runtime : **Node**
     - Build Command : `npm install`
     - Start Command : `npm start`
     - Instance Type : **Free**
   - Clique sur **Deploy Web Service**. Au bout de 2 ou 3 minutes, Render affiche une adresse du type `https://sixieme-boeuf-xxxx.onrender.com`.

3. **Jouer**
   - Ouvre l'adresse, entre ton pseudo et clique sur **Créer la table**.
   - Clique sur **Copier** pour copier le lien d'invitation, puis envoie-le à tes amis (WhatsApp, SMS, Discord…).
   - Quand tout le monde est installé, règle la partie et clique sur **Lancer la partie**.

### Bon à savoir avec l'offre gratuite de Render

- Si personne n'a utilisé le serveur depuis 15 minutes, il s'endort. La première ouverture prend alors environ 1 minute, puis tout est fluide.
- Les tables sont gardées en mémoire. Si le serveur redémarre (mise en veille ou nouveau déploiement), les parties en cours sont perdues. Pendant que vous jouez, le serveur reste éveillé.

## Jouer en local, sans hébergement

Si tout le monde est sur le même Wi-Fi :

```bash
npm install
```

```bash
npm start
```

Ensuite :
- Ouvre `http://localhost:3000` sur ton ordinateur.
- Tes amis ouvrent `http://<adresse-IP-de-ton-ordi>:3000`.
- Le lien d'invitation affiché dans le jeu reprend l'adresse que tu utilises : ouvre toi-même le jeu avec ton adresse IP plutôt que `localhost`, pour que le lien copié fonctionne chez les autres.

## Réglages modifiables par l'hôte

Dans le salon, avant de lancer la partie :

| Réglage | Valeur par défaut |
|---|---|
| Fin de partie (têtes) | 66 |
| Cartes en main | 10 |
| Nombre de rangées | 4 |
| Cartes max par rangée | 5 (la 6e fait ramasser) |
| Plus haute carte | 104 |
| Temps par tour | Illimité (sinon une carte est jouée au hasard à la fin du temps) |
| Vitesse de résolution | Normale |
| Variante tactique | Non (si oui : paquet réduit à joueurs × cartes en main + rangées) |

Pour changer les valeurs par défaut, modifie la ligne `DEFAULTS` en haut de `server.js`.

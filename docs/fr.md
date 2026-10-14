# Certificate Expiry

Surveillez depuis Gladys les certificats TLS de vos sites web, NAS, box,
reverse proxy ou serveur mail, et soyez prévenu **avant** leur expiration.

L'intégration se connecte directement à chaque hôte, depuis votre machine
Gladys : une négociation TLS, le certificat est lu, la connexion est fermée.
Aucune requête HTTP, aucun compte, aucun service cloud. Elle fonctionne aussi
bien pour les sites publics que pour les appareils de votre réseau local.

## Installation

1. Installez l'intégration depuis le store Gladys.
2. Dans **Configuration**, remplissez le champ **Hôtes**, puis enregistrez.
3. Ouvrez l'onglet **Découverte** : chaque hôte y apparaît comme un appareil.
   Créez ceux que vous voulez garder dans Gladys.

### Le champ Hôtes

Les hôtes sont séparés par des virgules, des espaces ou des retours à la ligne.
Chaque entrée peut être :

| Vous tapez                 | Vérifié sur                                   |
| -------------------------- | --------------------------------------------- |
| `exemple.fr`               | `exemple.fr`, port 443                        |
| `nas.local:5001`           | `nas.local`, port 5001                        |
| `192.168.1.1:8443`         | `192.168.1.1`, port 8443                      |
| `[fe80::1]:8443`           | IPv6 `fe80::1`, port 8443                     |
| `https://exemple.fr/login` | `exemple.fr`, port 443 (le chemin est ignoré) |

Une entrée qui n'est pas un hôte est ignorée ; le bouton **Vérifier
maintenant** liste les entrées ignorées. 100 hôtes au maximum.

### Autres réglages

| Réglage                               | Défaut | Rôle                                                                                                                                                                                                                              |
| ------------------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Seuil d'alerte (jours)                | 30     | À partir de ce nombre de jours restants, le certificat **expire bientôt**.                                                                                                                                                        |
| Seuil critique (jours)                | 7      | À partir de ce nombre de jours restants, il est **critique**.                                                                                                                                                                     |
| Intervalle de vérification (heures)   | 12     | Fréquence de vérification de chaque hôte. Une vérification a aussi lieu au démarrage et à l'enregistrement de la configuration.                                                                                                   |
| Délai de connexion (s)                | 10     | Au-delà, l'hôte est **injoignable**.                                                                                                                                                                                              |
| Signaler les certificats non reconnus | activé | Signale aussi un certificat auto-signé, signé par une autorité privée, ou qui ne correspond pas au nom de l'hôte. Désactivez-le si vos appareils locaux utilisent des certificats auto-signés : leur expiration reste surveillée. |

## Ce que vous obtenez

### Un appareil par hôte

| Fonctionnalité | Contenu                                                                                                                        |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Days remaining | Jours entiers avant expiration. `0` le dernier jour, négatif une fois expiré. Gardé en historique, pour en faire un graphique. |
| Expiry date    | Date et heure d'expiration, en UTC.                                                                                            |
| Issuer         | Qui a signé le certificat (par ex. `R11` pour Let's Encrypt).                                                                  |

La carte de l'appareil affiche aussi un **badge de connexion** : vert quand
l'hôte a répondu, rouge quand il est injoignable, avec un point orange quand le
certificat n'est pas reconnu (la raison est dans l'infobulle).

Quand un hôte ne répond pas, ses dernières valeurs sont gardées et les jours
restants continuent de décompter depuis la dernière date d'expiration lue : une
alerte n'est pas manquée parce que le serveur était éteint ce jour-là.

### Boutons de l'écran Configuration

- **Vérifier maintenant** : vérifie tous les hôtes et liste le résultat.
- **Inspecter un hôte** : lit le certificat de n'importe quel hôte, surveillé ou
  non, et l'affiche en entier : noms couverts, émetteur, dates, confiance,
  version TLS, empreinte SHA-256. Pratique avant d'ajouter un hôte, ou après
  avoir renouvelé un certificat.

### Widget « Certificats » du tableau de bord

Trois compteurs (valides, à renouveler, problèmes), les certificats triés par
urgence, et un bouton **Vérifier**. Réglages par widget : nombre de lignes
affichées (1 à 10), et « Seulement ce qui demande attention » pour masquer les
certificats en ordre.

### Déclencheurs de scène

Chaque déclencheur se déclenche **une fois par changement**, pas à chaque
vérification.

| Déclencheur                              | Quand                                                                            | Filtres              | Variables                                                     |
| ---------------------------------------- | -------------------------------------------------------------------------------- | -------------------- | ------------------------------------------------------------- |
| Un certificat arrive à expiration        | Un certificat entre dans la période d'alerte, la période critique, ou expire.    | certificat, niveau   | host, level, days_remaining, expires_at, issuer               |
| Un certificat a été renouvelé            | Un hôte présente un nouveau certificat qui dure plus longtemps que le précédent. | certificat           | host, days_remaining, expires_at, previous_expires_at, issuer |
| La vérification d'un certificat a échoué | Un hôte ne répond plus, ou présente un certificat non reconnu.                   | certificat, problème | host, reason, error, message                                  |

Exemple : _« Quand un certificat arrive à expiration, niveau Critique → envoyez-moi
un message : `{{triggerEvent.data.host}} expire dans {{triggerEvent.data.days_remaining}} jours` »._

Vous pouvez aussi utiliser le déclencheur standard **état d'un appareil** sur la
fonctionnalité **Days remaining** (par exemple « inférieur à 15 »).

L'intégration garde le dernier état de chaque certificat dans son volume de
données : un redémarrage de Gladys ne renvoie pas les mêmes alertes.

### Actions de scène

| Action                        | Résultat (pour les actions suivantes)                           |
| ----------------------------- | --------------------------------------------------------------- |
| Vérifier un certificat        | `days_remaining`, `expires_at`, `level`, `reachable`, `trusted` |
| Vérifier tous les certificats | `checked`, `expiring`, `problems`                               |

`level` vaut `ok`, `warning`, `critical`, `expired`, `unreachable` ou
`untrusted`. Une vérification lancée par une action de scène ne déclenche jamais
de déclencheur elle-même (une scène pourrait sinon se relancer toute seule) ;
la prochaine vérification automatique le fait.

## Limites

- Seul le TLS direct est vérifié (HTTPS, IMAPS 993, SMTPS 465, LDAPS 636…). Les
  services qui démarrent en clair puis passent en TLS (STARTTLS sur SMTP 587 ou
  IMAP 143) ne sont pas pris en charge.
- La confiance est vérifiée avec les autorités publiques connues de Node.js. Une
  autorité privée (votre propre AC) apparaît « non reconnue » : désactivez
  **Signaler les certificats non reconnus** dans ce cas.
- Les jours restants et la date d'expiration sont en UTC.

## Dépannage

- **Injoignable (ENOTFOUND)** : le nom ne se résout pas depuis la machine
  Gladys. Essayez l'adresse IP.
- **Injoignable (ETIMEDOUT / ECONNREFUSED)** : rien ne répond sur ce port, ou un
  pare-feu le bloque. Vérifiez le port.
- **Non reconnu (DEPTH_ZERO_SELF_SIGNED_CERT, SELF_SIGNED_CERT_IN_CHAIN)** :
  certificat auto-signé ou autorité privée.
- **Non reconnu (ERR_TLS_CERT_ALTNAME_INVALID)** : le certificat ne couvre pas le
  nom tapé. **Inspecter un hôte** montre les noms qu'il couvre.
- **Non reconnu (UNABLE_TO_VERIFY_LEAF_SIGNATURE)** : le serveur n'envoie pas son
  certificat intermédiaire. Corrigez la chaîne de certificats sur le serveur.

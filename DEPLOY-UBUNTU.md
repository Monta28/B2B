# Déploiement MECACOMM B2B sur Ubuntu avec Docker

## Prérequis

### 1. Installer Docker et Docker Compose

```bash
# Mettre à jour le système
sudo apt update && sudo apt upgrade -y

# Installer les dépendances
sudo apt install -y apt-transport-https ca-certificates curl software-properties-common

# Ajouter la clé GPG Docker
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg

# Ajouter le repository Docker
echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

# Installer Docker
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin

# Ajouter l'utilisateur au groupe docker (pour éviter sudo)
sudo usermod -aG docker $USER

# Redémarrer ou se reconnecter pour appliquer les changements
newgrp docker
```

### 2. Vérifier l'installation

```bash
docker --version
docker compose version
```

## Déploiement

### 1. Copier le projet sur le serveur

```bash
# Option 1: Via Git
git clone <votre-repo> /opt/mecacomm-b2b
cd /opt/mecacomm-b2b

# Option 2: Via SCP
scp -r ./mecacomm-b2b user@server:/opt/
```

### 2. Créer le fichier .env

```bash
cd /opt/mecacomm-b2b
cp .env.example .env
nano .env
```

Configurer les variables importantes:

```env
# Base de données
DB_USERNAME=postgres
DB_PASSWORD=VotreMotDePasseSecurise123!
DB_DATABASE=mecacomm_b2b

# JWT - IMPORTANT: changer en production!
JWT_SECRET=votre-cle-secrete-tres-longue-et-aleatoire-minimum-32-caracteres
JWT_EXPIRES_IN=7d

# SQL Server DMS (optionnel)
SQL_SERVER_HOST=
SQL_SERVER_PORT=1433
SQL_SERVER_USER=
SQL_SERVER_PASSWORD=
SQL_SERVER_DATABASE=
```

### 3. Lancer l'application

```bash
# Construire et démarrer tous les services
docker compose -f docker-compose.ubuntu.yml up -d --build

# Vérifier que tout fonctionne
docker compose -f docker-compose.ubuntu.yml ps

# Voir les logs
docker compose -f docker-compose.ubuntu.yml logs -f
```

### 4. Vérifier l'installation

- Frontend: http://votre-ip/
- API: http://votre-ip/api/

## Commandes utiles

```bash
# Arrêter les services
docker compose -f docker-compose.ubuntu.yml down

# Redémarrer les services
docker compose -f docker-compose.ubuntu.yml restart

# Voir les logs d'un service spécifique
docker compose -f docker-compose.ubuntu.yml logs -f backend
docker compose -f docker-compose.ubuntu.yml logs -f frontend
docker compose -f docker-compose.ubuntu.yml logs -f postgres

# Reconstruire après des modifications
docker compose -f docker-compose.ubuntu.yml up -d --build

# Accéder au shell d'un conteneur
docker exec -it mecacomm-backend sh
docker exec -it mecacomm-db psql -U postgres -d mecacomm_b2b

# Sauvegarder la base de données
docker exec mecacomm-db pg_dump -U postgres mecacomm_b2b > backup.sql

# Restaurer la base de données
docker exec -i mecacomm-db psql -U postgres mecacomm_b2b < backup.sql
```

## Mise à jour de l'application

```bash
cd /opt/mecacomm-b2b

# Récupérer les dernières modifications
git pull

# Reconstruire et redémarrer
docker compose -f docker-compose.ubuntu.yml up -d --build
```

## Configuration du pare-feu (UFW)

```bash
# Autoriser HTTP
sudo ufw allow 80/tcp

# Autoriser HTTPS (si vous ajoutez SSL)
sudo ufw allow 443/tcp

# Activer le pare-feu
sudo ufw enable
```

## HTTPS avec Let's Encrypt (Optionnel)

Pour ajouter HTTPS, vous pouvez utiliser Certbot:

```bash
# Installer Certbot
sudo apt install -y certbot

# Arrêter nginx temporairement
docker compose -f docker-compose.ubuntu.yml stop frontend

# Obtenir le certificat
sudo certbot certonly --standalone -d votre-domaine.com

# Les certificats seront dans /etc/letsencrypt/live/votre-domaine.com/
```

Puis modifier nginx.conf pour utiliser SSL.

## Dépannage

### Les conteneurs ne démarrent pas

```bash
# Vérifier les logs
docker compose -f docker-compose.ubuntu.yml logs

# Vérifier l'espace disque
df -h

# Vérifier la mémoire
free -h
```

### Erreur de connexion à la base de données

```bash
# Vérifier que PostgreSQL est prêt
docker compose -f docker-compose.ubuntu.yml logs postgres

# Tester la connexion
docker exec -it mecacomm-db psql -U postgres -d mecacomm_b2b -c "SELECT 1"
```

### L'API ne répond pas

```bash
# Vérifier les logs du backend
docker compose -f docker-compose.ubuntu.yml logs backend

# Redémarrer le backend
docker compose -f docker-compose.ubuntu.yml restart backend
```

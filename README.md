# Réseau Social - Architecture Microservices

## Vue d'Ensemble

Cette plateforme de réseau social est construite sur une architecture de microservices, utilisant Node.js et divers protocoles de communication pour créer une application scalable et robuste. La plateforme permet aux utilisateurs de partager des posts, des stories éphémères (24h), de discuter en temps réel et de recevoir des notifications d'activités.

### Technologies utilisées
-  Node.js: Plateforme d'exécution
-  Express.js: Framework web pour les API REST
-  MongoDB & Mongoose: Base de données et ODM
-  Kafka: Bus de messages pour la communication entre services
-  Apollo Server: Serveur GraphQL
-  gRPC: Framework RPC pour la communication en temps réel du chat
-  Protocol Buffers: Format d'échange pour gRPC

## Structure du Projet

```
projet-micro/
├── services/
│   ├── posts-service/       # Service REST pour les posts
│   │   └── app.js
│   ├── graphql-service/     # Service GraphQL
│   │   └── server.js
│   ├── chat-service/        # Service gRPC pour le chat
│   │   ├── server.js
│   │   └── chat.proto
│   └── kafka-consumers/     # Consumers Kafka
│       ├── stories.js
│       └── notifications.js
├── package-lock.json
├── package.json
└── .env
```


## Architecture Technique
Le système est composé de plusieurs services qui communiquent entre eux via différents protocoles:
- API Gateway: Point d'entrée principal pour les clients 
- Service GraphQL: Interface unifiée pour les requêtes de données
- Service Posts: Gestion des publications et des stories
- Service Stories: Traitement des événements liés aux stories
- Service Notifications: Traitement des notifications utilisateur
- Service Chat: Communication en temps réel via gRPC

Ces services communiquent entre eux principalement via Kafka pour les communications asynchrones événementielles, et utilisent MongoDB comme base de données commune.

```mermaid
graph TB
    %% Styles
    classDef service fill:#2563eb,stroke:#1d4ed8,color:white,rx:10,ry:10;
    classDef database fill:#059669,stroke:#047857,color:white,rx:10,ry:10;
    classDef broker fill:#7c3aed,stroke:#6d28d9,color:white,rx:10,ry:10;
    classDef consumer fill:#ea580c,stroke:#c2410c,color:white,rx:10,ry:10;

    %% Core Services
    subgraph "API Layer"
        direction LR
        Posts["Posts Service<br/>(Express/REST)<br/>:3000"];
        GraphQL["GraphQL Gateway<br/>(Apollo Server)<br/>:4000"];
        Chat["Real-time Chat<br/>(gRPC)<br/>:50051"];
    end

    %% Message Broker
    subgraph "Event Bus"
        Kafka["Apache Kafka<br/>Message Broker<br/>:9092"];
    end

    %% Event Consumers
    subgraph "Event Processors"
        direction LR
        Notifications["Notifications<br/>Consumer"];
        Stories["Stories<br/>Consumer"];
    end

    %% Persistence Layer
    subgraph "Data Store"
        MongoDB["MongoDB<br/>Document Store<br/>:27017"];
    end

    %% Relations
    GraphQL --> |"REST API"| Posts;
    Posts --> |"Publishes Events"| Kafka;
    Chat --> |"Publishes Events"| Kafka;
    
    Kafka --> |"Consumes Events"| Notifications;
    Kafka --> |"Consumes Events"| Stories;
    
    Posts --> |"CRUD Operations"| MongoDB;
    Chat --> |"Store Messages"| MongoDB;
    Notifications --> |"Stores Notifications"| MongoDB;
    Stories --> |"Manages Stories"| MongoDB;

    %% Apply styles
    class Posts,GraphQL,Chat service;
    class MongoDB database;
    class Kafka broker;
    class Notifications,Stories consumer;
```

## Services Détaillés

### 1. Posts Service (Port 3000)

Ce service gère les posts et les stories via une API REST. Il permet de:
- Créer, lire, commenter et liker des posts
- Créer et lire des stories éphémères (24h)
Le service publie des événements sur Kafka pour informer les autres services des activités pertinentes.

#### Points d'API principaux:

- POST /posts: Créer un nouveau post
- GET /posts: Récupérer tous les posts
- POST /posts/:id/like: Aimer un post
- POST /posts/:id/comments: Commenter un post
- GET /posts/:id/comments: Récupérer les commentaires d'un post
- POST /stories: Créer une nouvelle story
- GET /stories: Récupérer toutes les stories actives
- GET /stories/user/:userId: Récupérer les stories d'un utilisateur spécifique


### 2. GraphQL Service (Port 4000)
Ce service fournit une API GraphQL qui sert de façade pour les autres services. Il offre:
- Un point d'entrée unifié pour les requêtes clients
- Des resolvers qui communiquent avec le service Posts via HTTP
- Une interface structurée pour récupérer les posts et leurs données associées

#### Types GraphQL

##### Post
- id: ID!
- content: String!
- userId: String!
- likes: Int!
- comments: [Comment!]!
- createdAt: String!

##### Comment
- text: String!
- userId: String!
- createdAt: String!

#### Requêtes Disponibles
- feed(userId: ID!): [Post!]!
- post(id: ID!): Post

### 3. Chat Service 
Ce service implémente une API gRPC pour la messagerie en temps réel. Il permet:
- L'envoi de messages privés entre utilisateurs
- La souscription en streaming pour recevoir des messages en temps réel
- La persistance des messages dans MongoDB
- La publication d'événements de notification via Kafka

### 4. Notification Consumer
Ce service écoute les événements sur le topic Kafka 'notifications' et crée des notifications dans la base de données. Il traite:
- Les likes sur les posts
- Les commentaires sur les posts
- Les nouveaux messages chat

#### Modèle de Notification
- Type (LIKE, COMMENT, CHAT_MESSAGE)
- Émetteur (userId)
- Destinataire (targetUserId)
- Références (postId, commentId)
- État de lecture
- Horodatage

### 5. Stories Consumer

Ce service gère le cycle de vie des stories éphémères. Il:
- Écoute les événements sur le topic Kafka 'stories'
- Traite les événements de création de stories
- Gère l'expiration des stories (24h après leur création)
- Publie des notifications pour informer les abonnés des nouvelles stories

#### Modèle de Story
- Contenu
- Auteur
- Date de création
- Date d'expiration

## Flux de Données

```mermaid
sequenceDiagram
    participant C as Client
    participant G as GraphQL Gateway
    participant S as Services<br/>(Posts + Chat)
    participant K as Kafka
    participant M as MongoDB

    %% Interactions Posts/Stories
    C->>G: Action utilisateur<br/>(post, like, comment, story)
    G->>S: REST/gRPC
    S->>M: Sauvegarder
    S->>K: Événement
    K-->>M: Notification

    %% Chat temps réel
    C->>S: Stream chat (gRPC)
    S->>M: Message
    S->>K: Événement
    K-->>M: Notification

    %% Lecture des données
    C->>G: Query GraphQL
    G->>S: Requêtes
    S->>M: Lecture
    G->>C: Réponse agrégée
```


## Configuration Technique

### Variables d'Environnement
Créez un fichier `.env` à la racine du projet avec les variables suivantes :

```env
# Base de données
MONGODB_URI=mongodb://localhost:27017/social-network

# Services
POSTS_SERVICE_PORT=3000
GRAPHQL_PORT=4000
CHAT_SERVICE_PORT=50051

# Message Broker
KAFKA_BROKERS=localhost:9092
KAFKA_CLIENT_ID=social-network

# Configuration
STORY_EXPIRATION_HOURS=24
NODE_ENV=development
```

### Dépendances Principales
- Express.js (API REST)
- Apollo Server (GraphQL)
- KafkaJS (Message Broker)
- Mongoose (MongoDB ODM)

## Guide d'Installation

### Prérequis
- Node.js v16+ 
- MongoDB 4.4+
- Apache Kafka 2.8+
- Zookeeper 3.8+
- Docker (optionnel)

### Installation et Démarrage

1. **Configuration Initiale**
   ```bash
   # Cloner le projet
   git clone <git@github.com:amalbenalii/projet-micro.git>
   cd projet-micro

   # Installer les dépendances du projet
   npm install              # Installe toutes les dépendances listées dans package.json

   ```

2. **Configuration de l'Infrastructure**
   
   b. **Apache Kafka**
   ```bash
   # Démarrer Zookeeper (Windows)
   .\bin\windows\zookeeper-server-start.bat .\config\zookeeper.properties

   # Démarrer Kafka (dans un nouveau terminal)
   .\bin\windows\kafka-server-start.bat .\config\server.properties

   # Créer les topics nécessaires
   .\bin\windows\kafka-topics.bat --create --topic notifications --bootstrap-server localhost:9092 --partitions 3 --replication-factor 1
   .\bin\windows\kafka-topics.bat --create --topic stories --bootstrap-server localhost:9092 --partitions 3 --replication-factor 1
   ```

4. **Démarrage des Services**

   a. Démarrer le service de posts (http://localhost:3000)
   ```bash
   node app.js (dans le répertoire du service Posts)
   ```
   b. Démarrer le service GraphQL (http://localhost:4000/graphql)
   ```bash
   node server.js (dans le répertoire du service Graphql)
   ```
   
   c. Démarrer le service de chat gRPC (http://localhost:50051)
   ```bash
   node server.js  (dans le répertoire du service Chat)
   # Service de chat en temps réel via gRPC
   ```
   
   d. Démarrer le consumer de notifications  (dans le répertoire du service kafka-consumers)
   ```bash
   node notifications.js
   # Traite les événements de notifications en arrière-plan
   node stories.js 
   # Traite les événements de notifications en arrière-plan
   ```

6. **Services (par ordre)** 
   - Démarrer le service Posts
   - Lancer le service GraphQL
   - Activer les consumers



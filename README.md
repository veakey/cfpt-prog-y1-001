# Pixel Art Animator

Outil web pour animer vos créations pixel art ! Chargez vos PNG, configurez des contrôles clavier/souris, enregistrez vos animations.

## Démarrage rapide

1. Ouvrir `index.html` dans un navigateur (Chrome/Firefox/Edge)
2. Glisser-déposer vos images PNG dans la zone "Assets"
3. Double-cliquer sur un asset pour créer un calque
4. Configurer les bindings clavier dans le panneau de droite
5. Appuyer sur **Play** (ou Espace) pour animer !

## Architecture de l'application

```mermaid
graph TB
    subgraph Fichiers
        HTML[index.html<br/>Structure de la page]
        CSS[style.css<br/>Glass UI & Layout]
        JS[app.js<br/>Logique & Moteur]
        TEST[tests.js + tests.html<br/>Tests unitaires & fonctionnels]
    end

    HTML --> CSS
    HTML --> JS
    TEST --> JS

    style HTML fill:#7c5cfc,color:#fff
    style CSS fill:#fc5c9c,color:#fff
    style JS fill:#5cfc7c,color:#000
    style TEST fill:#fccc5c,color:#000
```

## Flux de données

```mermaid
flowchart LR
    A[PNG Assets] -->|Drag & Drop| B[Asset Manager]
    B -->|Double-clic ou Drag| C[Calques / Layers]
    C --> D[Canvas Rendering]

    E[Clavier / Souris] -->|Bindings| C
    C -->|Positions| F[Keyframes]
    F -->|Interpolation| D

    D -->|captureStream| G[MediaRecorder]
    G --> H[Export WebM]
```

## Comment ça marche : le moteur d'animation

```mermaid
sequenceDiagram
    participant U as Utilisateur
    participant B as Bindings (clavier)
    participant L as Calques
    participant K as Keyframes
    participant C as Canvas
    participant R as Recorder

    U->>B: Appuie sur une touche
    B->>L: Déplace le calque (dx, dy)
    Note over K: Si mode enregistrement
    L->>K: Sauvegarde position à cette frame

    loop Chaque frame (30 FPS)
        K->>L: Interpole les positions
        L->>C: Dessine tous les calques
        C->>R: Capture l'image (si recording)
    end

    R->>U: Export vidéo WebM
```

## Concepts clés

### Calques (Layers)

```mermaid
graph TB
    subgraph Canvas[Canvas - Ce que vous voyez]
        direction TB
        L3[Calque 3 - UI / Texte<br/>z-index: 2]
        L2[Calque 2 - Personnage<br/>z-index: 1]
        L1[Calque 1 - Décor<br/>z-index: 0]
    end

    L3 ~~~ L2 ~~~ L1

    style L3 fill:#fc5c7c,color:#fff
    style L2 fill:#7c5cfc,color:#fff
    style L1 fill:#5cfc7c,color:#000
```

Chaque calque a :
- **Position** (x, y) — où il est sur le canvas
- **Échelle** (scaleX, scaleY) — taille relative
- **Opacité** — transparence (0 = invisible, 1 = opaque)
- **Visibilité** — on/off
- **Bindings** — touches clavier pour le déplacer
- **Sprite sheet** — pour les animations image par image

### Keyframes et interpolation

```mermaid
graph LR
    KF1[Frame 0<br/>x=0, y=0] -->|interpolation linéaire| KF2[Frame 30<br/>x=100, y=50]
    KF2 -->|interpolation linéaire| KF3[Frame 60<br/>x=200, y=0]

    style KF1 fill:#7c5cfc,color:#fff
    style KF2 fill:#fc5c7c,color:#fff
    style KF3 fill:#5cfc7c,color:#000
```

Les keyframes sont des "points de passage". L'outil calcule automatiquement les positions intermédiaires.

**Exemple :** Si à la frame 0 votre perso est à x=0, et à la frame 30 il est à x=100, alors à la frame 15 il sera automatiquement à x=50.

### Sprite Sheets

Si votre asset est un sprite sheet (plusieurs frames d'animation sur une seule image) :

```
┌────┬────┬────┬────┐
│ F1 │ F2 │ F3 │ F4 │  ← 4 frames, 1 ligne, 4 colonnes
└────┴────┴────┴────┘

Configurer :
- Largeur frame : largeur d'une cellule (px)
- Hauteur frame : hauteur d'une cellule (px)
- Nb frames : nombre total d'images
- Colonnes : nombre de colonnes
- Vitesse : frames par seconde de l'animation du sprite
```

## Bindings (contrôles)

Pour chaque calque, vous pouvez assigner des touches :

| Direction | Action | Par défaut |
|-----------|--------|------------|
| Haut ↑    | Déplace le calque vers le haut | Non configuré |
| Bas ↓     | Déplace le calque vers le bas | Non configuré |
| Gauche ← | Déplace le calque vers la gauche | Non configuré |
| Droite → | Déplace le calque vers la droite | Non configuré |
| Idle 😴   | Quand aucune touche n'est pressée | — |

**Pour configurer :** Cliquez sur le champ de touche, puis appuyez sur la touche souhaitée.

La **vitesse** (en pixels par frame) est configurable pour chaque direction.

### Animation directionnelle

Chaque direction (+ idle) peut aussi changer l'image affichée. Deux modes :

#### Mode 1 : Sprite Sheet par direction (recommandé pour les sprite sheets)

```mermaid
graph TB
    subgraph SpriteSheet[Sprite Sheet 4×4]
        R0[Ligne 0 — Idle]
        R1[Ligne 1 — Gauche]
        R2[Ligne 2 — Droite]
        R3[Ligne 3 — Haut]
    end

    K1[Appui ← gauche] -->|spriteRow: 1| R1
    K2[Appui → droite] -->|spriteRow: 2| R2
    K3[Aucune touche] -->|idle spriteRow: 0| R0

    style R0 fill:#5cfc7c,color:#000
    style R1 fill:#7c5cfc,color:#fff
    style R2 fill:#fc5c7c,color:#fff
    style R3 fill:#fccc5c,color:#000
```

Configurez le numéro de **ligne (Sprite row)** pour chaque direction. L'animation cycle automatiquement entre les colonnes de cette ligne.

#### Mode 2 : Images séparées par direction

```mermaid
graph LR
    subgraph Gauche[Touche ← Gauche]
        L1[walk-left-1.png]
        L2[walk-left-2.png]
        L3[walk-left-3.png]
    end

    subgraph Droite[Touche → Droite]
        R1[walk-right-1.png]
        R2[walk-right-2.png]
    end

    subgraph Repos[Idle]
        I1[idle.png]
    end

    L1 --> L2 --> L3 --> L1
    R1 --> R2 --> R1
```

Ajoutez des images à chaque direction via le menu déroulant. L'outil cycle automatiquement entre elles quand la touche est maintenue. Quand la touche est relâchée, il revient à l'image idle.

### Saut

Chaque calque peut être configuré pour sauter avec un arc parabolique :

```mermaid
graph LR
    subgraph Arc de saut
        A[Sol<br/>y=200] -->|montée| B[Sommet<br/>y=200-hauteur]
        B -->|descente| C[Sol<br/>y=200]
    end

    style A fill:#5cfc7c,color:#000
    style B fill:#fc5c7c,color:#fff
    style C fill:#5cfc7c,color:#000
```

| Paramètre | Description | Défaut |
|-----------|-------------|--------|
| Touche | Touche pour déclencher le saut | Non configuré |
| Hauteur | Hauteur max du saut en pixels | 80 px |
| Durée | Durée totale du saut en secondes | 0.5 s |
| Drift H | Déplacement horizontal pendant le saut (px/frame) | 0 |

- Le saut suit une courbe **sin(π·t)** : montée douce, sommet, descente douce
- **Pas de double saut** : il faut attendre l'atterrissage
- On peut se déplacer horizontalement pendant le saut (drift)
- On peut assigner un **sprite row** ou des **images** spécifiques pour l'animation de saut

## Modes

### Mode Lecture (par défaut)
Les keyframes sont lus et les calques bougent automatiquement selon l'animation enregistrée.

### Mode Enregistrement
Chaque mouvement (clavier ou souris) crée automatiquement un keyframe. C'est comme ça que vous "dessinez" votre animation.

**Workflow typique :**
1. Activer le mode enregistrement
2. Appuyer sur Play
3. Utiliser les touches pour bouger vos calques
4. Les mouvements sont enregistrés en keyframes
5. Désactiver le mode enregistrement
6. Relancer en mode lecture pour voir le résultat
7. Enregistrer en WebM avec le bouton Rec

## Export

Le bouton **Rec** enregistre tout ce qui se passe sur le canvas en vidéo **WebM**. L'enregistrement démarre automatiquement la lecture et s'arrête à la fin de la timeline.

## Tests

Ouvrir `tests.html` dans un navigateur pour exécuter la suite de tests unitaires et fonctionnels.

```mermaid
graph LR
    T1[Tests Utilitaires] --> T2[Tests Assets]
    T2 --> T3[Tests Calques]
    T3 --> T4[Tests Keyframes]
    T4 --> T5[Tests Interpolation]
    T5 --> T6[Tests Bindings]
    T6 --> T7[Tests Fonctionnels]

    style T1 fill:#5cfc7c,color:#000
    style T7 fill:#7c5cfc,color:#fff
```

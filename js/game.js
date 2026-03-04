class Game {
    constructor() {
        this.currentScreen = 'start-screen';
        this.characterCreator = new CharacterCreator(this);

        this.initEventListeners();
        this.checkSaveGame();
    }

    checkSaveGame() {
        const savedData = localStorage.getItem('highSchoolLifeSave');
        const loadBtn = document.getElementById('btn-load-game');
        const deleteBtn = document.getElementById('btn-delete-save');

        if (savedData) {
            if (loadBtn) loadBtn.style.display = 'inline-block';
            if (deleteBtn) deleteBtn.style.display = 'inline-block';
        } else {
            if (loadBtn) loadBtn.style.display = 'none';
            if (deleteBtn) deleteBtn.style.display = 'none';
        }
    }

    initEventListeners() {
        document.getElementById('btn-start-game').addEventListener('click', () => {
            this.switchScreen('character-creation-screen');
            this.characterCreator.init();
        });

        document.getElementById('btn-load-game').addEventListener('click', async () => {
            const savedData = localStorage.getItem('highSchoolLifeSave');
            if (savedData) {
                try {
                    const parsedData = JSON.parse(savedData);

                    // Se as texturas do jogo não tiverem sido carregadas ainda, carrega antes
                    if (Object.keys(this.characterCreator.emojis).length === 0) {
                        await this.characterCreator.loadEmojis();
                        await this.characterCreator.loadAssets();
                    }

                    this.switchScreen('game-screen');

                    if (!this.playableGame) {
                        this.playableGame = new PlayableGame(this, parsedData.characterState, this.characterCreator.assets, this.characterCreator.emojis);
                    } else {
                        this.playableGame.characterState = parsedData.characterState;
                        this.playableGame.assets = this.characterCreator.assets;
                        this.playableGame.emojis = this.characterCreator.emojis;
                    }

                    this.playableGame.loadGameState(parsedData);
                    this.playableGame.start(true); // pass true to indicate a loaded start
                } catch (e) {
                    console.error("Failed to load save:", e);
                    alert("Erro ao carregar o save. O arquivo pode estar corrompido.");
                }
            }
        });

        const btnDeleteSave = document.getElementById('btn-delete-save');
        if (btnDeleteSave) {
            btnDeleteSave.addEventListener('click', () => {
                if (confirm("Tem certeza que deseja apagar seu progresso? Esta ação não pode ser desfeita.")) {
                    localStorage.removeItem('highSchoolLifeSave');
                    alert("Progresso apagado com sucesso.");
                    this.checkSaveGame(); // Update UI to hide buttons
                }
            });
        }

        // Prevention of accidental navigation or other global events could go here
    }

    switchScreen(screenId) {
        document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
        document.getElementById(screenId).classList.add('active');
        this.currentScreen = screenId;
    }

    startGame(characterState, characterAssets, emojis) {
        this.switchScreen('game-screen');
        if (!this.playableGame) {
            this.playableGame = new PlayableGame(this, characterState, characterAssets, emojis);
        } else {
            this.playableGame.characterState = characterState;
            this.playableGame.assets = characterAssets;
        }
        this.playableGame.start();
    }
}

class CharacterCreator {
    constructor(game) {
        this.game = game;
        this.canvas = document.getElementById('char-preview-canvas');
        this.ctx = this.canvas.getContext('2d');

        // Configuration State
        this.state = {
            gender: 'male',
            skinColor: '#ffdbac',
            body: { index: 0, color: '#ffdbac' },
            hair: { index: 0, color: '#000000' },
            torso: { index: 0, color: '#ff0000' },
            legs: { index: 0, color: '#0000ff' },
            feet: { index: 0, color: '#333333' },
            face: { type: 'static', isAnimating: false, currentFrame: 0, pendingType: null },
            direction: 0,
            frame: 0,
            animationType: 'walk' // 'walk' or 'idle'
        };

        this.assets = {
            walk: { body: [], hair: [], torso: [], legs: [], feet: [], face: {} },
            idle: { body: [], hair: [], torso: [], legs: [], feet: [], face: {} }
        };

        this.cache = {}; // Caches colored images
        this.emojis = {}; // Store loaded emojis
    }

    async init() {
        console.log("Initializing Character Creator...");
        await this.loadEmojis();
        await this.loadAssets();
        this.initUI();
        this.startPreviewLoop();
    }

    async loadEmojis() {
        try {
            const response = await fetch('emojis.json');
            this.emojis = await response.json();
            console.log("Emojis carregados:", this.emojis);
        } catch (error) {
            console.error("Failed to load emojis.json:", error);
            // Fallback default emojis
            this.emojis = {
                'static': '😐',
                'smile': '😀',
                'angry': '😠',
                'kissing': '😘',
                'sad': '😢',
                'boring': '🙄',
                'tired': '🥱'
            };
        }

        // Atualiza os botões na tela com os novos emojis
        document.querySelectorAll('.btn-face').forEach(btn => {
            const faceType = btn.dataset.face;
            if (this.emojis[faceType]) {
                btn.innerText = this.emojis[faceType];
            }
        });
    }

    async loadAssets() {
        console.log("Starting dynamic asset loading...");

        // Base paths for our assets
        // Base paths for our assets
        const basePath = 'modelos/Male/';

        const loadSequence = async (folder, prefix, labelBase) => {
            const list = [];
            let index = 1;
            let maxCheck = 50;

            while (index <= maxCheck) {
                // Check both Walk and Idle folders if not specific? 
                // Actually helper is generic, we call it with specific paths.
                const src = `${basePath}${folder}/${prefix}_${index}.png`;
                const img = await this.loadImage(src, `${labelBase} ${index}`);

                if (img) {
                    list.push(img);
                    index++;
                } else {
                    break;
                }
            }
            // console.log(`Loaded ${list.length} assets for ${labelBase} at ${folder}`);
            return list;
        };

        // Load Walk Assets
        console.log("Loading Walk Assets...");
        this.assets.walk.body = await loadSequence('Walk/Base', 'male_base_walk', 'Walk Body');
        this.assets.walk.hair = await loadSequence('Walk/Hair', 'male_walk_hair', 'Walk Hair');
        this.assets.walk.torso = await loadSequence('Walk/Shirt', 'male_base_walk_shirt', 'Walk Torso');
        this.assets.walk.legs = await loadSequence('Walk/Leg', 'male_base_walk_leg', 'Walk Legs');
        this.assets.walk.feet = await loadSequence('Walk/Shoe', 'male_base_walk_shoe', 'Walk Feet');

        // Load Idle Assets
        console.log("Loading Idle Assets...");
        this.assets.idle.body = await loadSequence('Idle/Base', 'male_base_idle', 'Idle Body');
        // Idle parts might be missing, but we attempt to load them same way
        this.assets.idle.hair = await loadSequence('Idle/Hair', 'male_idle_hair', 'Idle Hair');
        this.assets.idle.torso = await loadSequence('Idle/Shirt', 'male_base_idle_shirt', 'Idle Torso');
        this.assets.idle.legs = await loadSequence('Idle/Leg', 'male_base_idle_leg', 'Idle Legs');
        this.assets.idle.feet = await loadSequence('Idle/Shoe', 'male_base_idle_shoe', 'Idle Feet');

        // Load Face Assets
        console.log("Loading Face Assets...");
        const faceTypes = ['static', 'smile', 'angry', 'kissing', 'sad', 'boring', 'tired'];
        for (const type of faceTypes) {
            this.assets.walk.face[type] = await this.loadImage(`${basePath}Walk/Face/male_face_idle_${type}.png`, `Walk Face ${type}`);
            this.assets.idle.face[type] = await this.loadImage(`${basePath}Idle/Face/male_face_idle_${type}.png`, `Idle Face ${type}`);
        }

        console.log("All assets loaded");
        this.updatePreview();
    }

    loadImage(src, label = 'Image') {
        return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => {
                // console.log(`Loaded: ${src}`); // Optional: reduce spam
                resolve(img);
            };
            img.onerror = () => {
                // console.log(`Not found (end of sequence?): ${src}`);
                resolve(null);
            };
            img.src = src;
        });
    }

    initUI() {
        // Rotation
        document.getElementById('btn-rotate-char').addEventListener('click', () => {
            this.state.direction = (this.state.direction + 1) % 4;
            this.updatePreview();
        });

        // Randomize
        document.getElementById('btn-random-char').addEventListener('click', () => {
            this.randomizeCharacter();
        });

        // Animation Type
        const animSelect = document.getElementById('anim-type');
        if (animSelect) {
            animSelect.addEventListener('change', (e) => {
                this.state.animationType = e.target.value;
                this.state.frame = 0; // Reset frame to avoid out of bounds
                this.updatePreview();
            });
        }

        // Face Selectors
        document.querySelectorAll('.btn-face').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const faceType = e.target.dataset.face;
                document.querySelectorAll('.btn-face').forEach(b => b.classList.remove('active-face'));
                e.target.classList.add('active-face');
                this.playFaceAnimation(faceType);
            });
        });

        // Style Selectors
        document.querySelectorAll('.arrow-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const target = e.target.dataset.target; // hair, torso, etc.
                const dir = parseInt(e.target.dataset.dir);
                this.changeStyle(target, dir);
            });
        });

        // Color Pickers
        document.getElementById('color-skin').addEventListener('input', (e) => {
            this.state.skinColor = e.target.value;
            this.state.body.color = e.target.value; // Update body object color too for consistency
            this.clearCache('body');
            this.updatePreview();
        });

        // Loop for other parts
        ['hair', 'torso', 'legs', 'feet'].forEach(part => {
            document.getElementById(`color-${part}`).addEventListener('input', (e) => {
                this.state[part].color = e.target.value;
                this.clearCache(part);
                this.updatePreview();
            });
        });

        // Initialize Attributes & Interests State
        this.state.attributes = {
            beauty: 0,
            intelligence: 0,
            charisma: 0,
            fitness: 0
        };
        this.state.interests = [];
        let availablePoints = 10;

        const updatePointsUI = () => {
            document.getElementById('points-remaining').innerText = availablePoints;
            Object.keys(this.state.attributes).forEach(attr => {
                document.getElementById(`attr-${attr}`).innerText = this.state.attributes[attr];
            });
        };

        // Attribute Buttons Logic
        document.querySelectorAll('.btn-attr-plus').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const attr = e.target.dataset.attr;
                if (availablePoints > 0) {
                    this.state.attributes[attr]++;
                    availablePoints--;
                    updatePointsUI();
                }
            });
        });

        document.querySelectorAll('.btn-attr-minus').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const attr = e.target.dataset.attr;
                if (this.state.attributes[attr] > 0) {
                    this.state.attributes[attr]--;
                    availablePoints++;
                    updatePointsUI();
                }
            });
        });

        // Interests Logic
        document.querySelectorAll('.interest-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const interest = e.target.dataset.interest;
                if (this.state.interests.includes(interest)) {
                    // Remove
                    this.state.interests = this.state.interests.filter(i => i !== interest);
                    e.target.classList.remove('selected');
                } else {
                    // Add
                    if (this.state.interests.length < 3) {
                        this.state.interests.push(interest);
                        e.target.classList.add('selected');
                    } else {
                        alert("Você só pode escolher exatamente 3 afinidades!");
                    }
                }
            });
        });

        // Finish Character Setup -> Go to Attributes Screen
        document.getElementById('btn-finish-char').addEventListener('click', () => {
            const nameInput = document.getElementById('char-name');
            const charName = nameInput ? nameInput.value.trim() : '';

            if (!charName) {
                alert("Por favor, digite um nome para o seu personagem!");
                if (nameInput) nameInput.focus();
                return;
            }

            // Save the name in the character state
            this.state.name = charName;

            // Transition logic
            document.getElementById('character-creation-screen').classList.remove('active');
            document.getElementById('attributes-screen').classList.add('active');
        });

        // Start Game from Attributes Screen
        document.getElementById('btn-start-life').addEventListener('click', () => {
            if (this.state.interests.length !== 3) {
                alert("Sua jornada não pode começar sem personalidade. Por favor, volte e escolha exatamente 3 Afinidades na tela de criação!");

                // Transição de volta se necessário (opcional UX)
                document.getElementById('attributes-screen').classList.remove('active');
                document.getElementById('character-creation-screen').classList.add('active');
                return;
            }
            this.game.startGame(this.state, this.assets, this.emojis);
        });
    }

    playFaceAnimation(type) {
        this.state.face.pendingType = type;
    }

    randomizeCharacter() {
        // Random Skin
        const skinColors = ['#ffdbac', '#f1c27d', '#e0ac69', '#8d5524', '#c68642', '#3d2314'];
        this.state.skinColor = skinColors[Math.floor(Math.random() * skinColors.length)];
        document.getElementById('color-skin').value = this.state.skinColor;

        // Random Parts
        ['body', 'hair', 'torso', 'legs', 'feet'].forEach(part => { // Added body to randomization
            // Use WALK assets as the "master" list for counts/availability
            const assetCount = this.assets.walk[part].length;
            if (assetCount > 0) {
                this.state[part].index = Math.floor(Math.random() * assetCount);

                const styleText = document.getElementById(`style-text-${part}`);
                if (styleText) styleText.textContent = `Estilo ${this.state[part].index + 1}`;

                // Random Color (Only for non-skin parts, preserving skin logic)
                if (part !== 'body') {
                    const randomColor = '#' + Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0');
                    this.state[part].color = randomColor;
                    document.getElementById(`color-${part}`).value = randomColor;
                }
            }
        });

        this.cache = {}; // Clear cache completely
        this.updatePreview();
    }

    changeStyle(part, dir) {
        // Use Walk assets for navigation limits
        const listLength = this.assets.walk[part].length;
        if (listLength === 0) return;

        let newIndex = this.state[part].index + dir;
        if (newIndex < 0) newIndex = listLength - 1;
        if (newIndex >= listLength) newIndex = 0;

        this.state[part].index = newIndex;
        document.getElementById(`style-text-${part}`).textContent = `Estilo ${newIndex + 1}`;
        this.updatePreview();
    }

    clearCache(part) {
        // Simple cache invalidation could be more granular, but this is fine
        // Using a key based scheme for cache: "part_index_color"
    }

    getCachedImage(partName, img, color, animType, customIndex) {
        // Include animType in key so we don't mix Idle/Walk caches for same index/color
        const index = customIndex !== undefined ? customIndex : (this.state[partName]?.index || 0);
        const key = `${partName}_${index}_${color}_${animType}`;

        if (this.cache[key]) return this.cache[key];

        // Create new tinted image
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');

        // Step 1: Draw the original image (The shape)
        ctx.drawImage(img, 0, 0);

        // Step 2: Tinting using Composite Operations (Safe for local files!)
        // 'source-in' : The new shape is drawn only where both the new shape and the destination canvas overlap.
        // Everything else is made transparent.

        // We need to preserve the alpha channel carefully.

        // Method:
        // 1. Draw image (already done).
        // 2. Set globalCompositeOperation to 'source-in'.
        // 3. Fill with color. Implementation: This replaces the image content with the flat color, keeping the alpha.
        // 4. Reset globalCompositeOperation.
        // 5. Draw the original image again on top with 'multiply' to keep shading?
        //    OR: If the original image is grayscale, we want to multiply color onto it.

        // Let's try 'multiply' approach for shading preservation (better for clothing folds)

        // 1. Draw Image
        // 2. Set globalCompositeOperation = 'multiply'
        // 3. Fill Rect with Color
        // 4. Set globalCompositeOperation = 'destination-in'
        // 5. Draw Image again (to mask the colored rect to the image shape)

        ctx.globalCompositeOperation = 'multiply';
        ctx.fillStyle = color;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.globalCompositeOperation = 'destination-in';
        ctx.drawImage(img, 0, 0);

        // Reset
        ctx.globalCompositeOperation = 'source-over';

        // Check if cache key exists before assigning? JS objects handle it.
        this.cache[key] = canvas;
        return canvas;
    }

    updatePreview() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.imageSmoothingEnabled = false; // Pixel art style

        // Draw Order: Body -> Feet -> Legs -> Torso -> Hair
        // NOTE: This order might need adjustment based on how the assets are drawn

        const drawLayer = (img, color, partName) => {
            if (!img) return;

            // Handle Part State (index is handled by retrieving img before calling drawLayer, except for body which was special)
            // Actually, let's keep it simple.

            const finalImg = this.getCachedImage(partName, img, color, this.state.animationType);

            // Asset Logic from SpriteCreator
            // Rows = Directions (0: Down, 1: Up, 2: Right, 3: Left)
            // Cols = Frames 

            // User provided a 4x4 spritesheet for Idle.
            const frameCount = 4; // Standardized to 4 frames for both Walk and Idle 
            const frameWidth = finalImg.width / frameCount;
            const frameHeight = finalImg.height / 4; // 4 rows

            const sx = this.state.frame * frameWidth;
            const sy = this.state.direction * frameHeight;

            // Draw to 48x120 Canvas
            // Aspect ratio of frame might not match 48x120 exactly
            // We want to fit it nicely.

            // Calculate scale to fit width?
            // If the frame is huge (e.g. 500x500), we stick it in.

            // Center the sprite in the 48x120 box
            // Let's use a fixed scale or calculating scale based on height?
            // "Miami Nights" characters are tall. 
            // 48x120 is a 1:2.5 ratio.

            // Let's match the height to 100? or 110?
            const scale = Math.min(this.canvas.width / frameWidth, this.canvas.height / frameHeight); // Fit to box
            // Wait, we want it to fill the box mostly.

            // If we just drawImage to 0,0, 48, 120 it might stretch
            // Let's keep aspect ratio

            const dWidth = frameWidth * (this.canvas.height / frameHeight); // Scale by height
            const dHeight = this.canvas.height;
            const dx = (this.canvas.width - dWidth) / 2;
            const dy = 0;

            this.ctx.drawImage(finalImg, sx, sy, frameWidth, frameHeight, dx, dy, dWidth, dHeight);
        };

        const currentAssets = this.assets[this.state.animationType];

        // Draw Body - Updated for Array
        const bodyImg = currentAssets.body[this.state.body.index];
        if (bodyImg) {
            // Use skinColor for body color
            drawLayer(bodyImg, this.state.skinColor, 'body');
        }

        // Draw Feet
        const shoesImg = currentAssets.feet[this.state.feet.index];
        if (shoesImg) drawLayer(shoesImg, this.state.feet.color, 'feet');

        // Draw Legs
        const legsImg = currentAssets.legs[this.state.legs.index];
        if (legsImg) drawLayer(legsImg, this.state.legs.color, 'legs');

        // Draw Torso
        const torsoImg = currentAssets.torso[this.state.torso.index];
        if (torsoImg) drawLayer(torsoImg, this.state.torso.color, 'torso');

        // Draw Face
        const faceImg = currentAssets.face[this.state.face.type];
        if (faceImg) {
            const frameCount = 4;
            const frameWidth = faceImg.width / frameCount;
            const frameHeight = faceImg.height / 4; // 4 rows

            let fFrame = 0;
            if (this.state.face.type === 'static') {
                fFrame = this.state.frame;
            } else if (this.state.face.isAnimating) {
                fFrame = this.state.face.currentFrame;
            }

            const sx = fFrame * frameWidth;
            const sy = this.state.direction * frameHeight;

            const dWidth = frameWidth * (this.canvas.height / frameHeight);
            const dHeight = this.canvas.height;
            const dx = (this.canvas.width - dWidth) / 2;
            const dy = 0;

            this.ctx.drawImage(faceImg, sx, sy, frameWidth, frameHeight, dx, dy, dWidth, dHeight);
        }

        // Draw Hair
        const hairImg = currentAssets.hair[this.state.hair.index];
        if (hairImg) drawLayer(hairImg, this.state.hair.color, 'hair');

        // Draw Emoji Balloon
        if (this.state.face.isAnimating && this.state.face.type !== 'static') {
            const emoji = this.emojis[this.state.face.type];
            if (emoji) {
                // Posicionado mais para cima e mais para a esquerda
                const bx = (this.canvas.width / 2) - 25;
                const by = 12;

                // Draw Bubble
                this.ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
                this.ctx.beginPath();
                this.ctx.arc(bx, by, 12, 0, Math.PI * 2);
                this.ctx.fill();

                // Draw Tail apontando para a direita (em direção à cabeça)
                this.ctx.beginPath();
                this.ctx.moveTo(bx + 10, by - 3); // Base superior da cauda
                this.ctx.lineTo(bx + 18, by + 5); // Ponta da cauda na cabeça
                this.ctx.lineTo(bx + 10, by + 3);  // Base inferior da cauda
                this.ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
                this.ctx.fill();

                // Draw Emoji
                this.ctx.font = '14px Arial';
                this.ctx.textAlign = 'center';
                this.ctx.textBaseline = 'middle';
                this.ctx.fillText(emoji, bx, by + 1);
            }
        }
    }

    startPreviewLoop() {
        // Simple animation loop for walking state
        let lastTime = 0;

        const animate = (timestamp) => {
            if (!lastTime) lastTime = timestamp;
            const elapsed = timestamp - lastTime;

            // Dynamic FPS: 3 for Idle (slower), 6 for Walk
            const fps = (this.state.animationType === 'idle') ? 3 : 6;

            if (elapsed > (1000 / fps)) {

                const maxFrames = 4; // Both utilize 4 frames now
                this.state.frame = (this.state.frame + 1) % maxFrames; // Cycle frames

                if (this.state.frame === 0 && this.state.face.pendingType) {
                    this.state.face.type = this.state.face.pendingType;
                    this.state.face.isAnimating = true;
                    this.state.face.currentFrame = 0;
                    this.state.face.pendingType = null;
                } else if (this.state.face.isAnimating && this.state.face.type !== 'static') {
                    this.state.face.currentFrame++;
                    if (this.state.face.currentFrame >= 4) {
                        this.state.face.isAnimating = false;
                        this.state.face.currentFrame = 0;
                        this.state.face.type = 'static'; // revert to static

                        document.querySelectorAll('.btn-face').forEach(b => b.classList.remove('active-face'));
                        const staticBtn = document.querySelector('.btn-face[data-face="static"]');
                        if (staticBtn) staticBtn.classList.add('active-face');
                    }
                }

                this.updatePreview();
                lastTime = timestamp;
            }

            if (this.game.currentScreen === 'character-creation-screen') {
                requestAnimationFrame(animate);
            }
        };
        requestAnimationFrame(animate);
    }
}

// Start Game
document.addEventListener('DOMContentLoaded', () => {
    window.game = new Game();
});

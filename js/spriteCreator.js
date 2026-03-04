class SpriteCreator {
    constructor() {
        this.canvas = document.getElementById('spritePreview');
        this.ctx = this.canvas.getContext('2d');

        // Layer configuration
        this.layers = {
            body: { image: null, color: '#8B4513', cached: null },
            hair: { image: null, color: '#000000', cached: null },
            torso: { image: null, color: '#FF0000', cached: null },
            legs: { image: null, color: '#0000FF', cached: null },
            feet: { image: null, color: '#654321', cached: null }
        };

        // Animation State
        this.currentState = {
            gender: 'male',
            animationType: 'idle', // 'idle' or 'walk' (Now just labels, logic is same)
            direction: 'down',
            frameCount: 4,
            currentFrame: 0,
            isPlaying: true,
            fps: 6,
            removeBackground: false,
            autoRotate: false
        };

        // Direction Map (Indices 0-3 for ROWS)
        this.directionMap = {
            'down': 0,
            'up': 1,
            'right': 2,
            'left': 3
        };

        // Auto-Rotate Timer
        this.lastRotationTime = 0;
        this.rotationInterval = 2000; // 2 seconds per direction
        this.directionsList = ['down', 'up', 'right', 'left'];

        this.lastFrameTime = 0;
        this.savedSprites = [];
        this.animationId = null;

        this.initEventListeners();
        this.loadSavedSprites();
        this.startAnimation();

        // Update UI default
        document.getElementById('frameCount').value = 4;
    }

    initEventListeners() {
        document.querySelectorAll('.layer-upload').forEach(input => {
            input.addEventListener('change', (e) => this.handleImageUpload(e));
        });

        document.querySelectorAll('.color-picker input').forEach(picker => {
            picker.addEventListener('input', (e) => this.handleColorChange(e));
        });

        document.getElementById('gender').addEventListener('change', (e) => {
            this.currentState.gender = e.target.value;
        });

        document.querySelectorAll('input[name="animationType"]').forEach(radio => {
            radio.addEventListener('change', (e) => {
                this.currentState.animationType = e.target.value;
                this.currentState.currentFrame = 0;
            });
        });

        // New Checkboxes
        document.getElementById('removeBackground').addEventListener('change', (e) => {
            this.currentState.removeBackground = e.target.checked;
            this.refreshAllLayersCache();
        });

        document.getElementById('autoRotate').addEventListener('change', (e) => {
            this.currentState.autoRotate = e.target.checked;
        });

        document.getElementById('frameCount').addEventListener('change', (e) => {
            this.currentState.frameCount = parseInt(e.target.value) || 4;
            document.getElementById('totalFrames').textContent = this.currentState.frameCount;
            this.currentState.currentFrame = 0;
        });

        document.querySelectorAll('.direction-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.setDirection(e.target.dataset.dir);
            });
        });

        document.getElementById('prevFrame').addEventListener('click', () => {
            this.currentState.isPlaying = false;
            this.updateFrame(-1);
        });

        document.getElementById('nextFrame').addEventListener('click', () => {
            this.currentState.isPlaying = false;
            this.updateFrame(1);
        });

        this.canvas.addEventListener('click', () => {
            this.currentState.isPlaying = !this.currentState.isPlaying;
        });

        document.getElementById('saveSprite').addEventListener('click', () => this.saveSprite());
        document.getElementById('exportSprite').addEventListener('click', () => this.exportSprite());
        document.getElementById('resetLayers').addEventListener('click', () => this.resetLayers());
    }

    setDirection(dir) {
        this.currentState.direction = dir;
        document.querySelectorAll('.direction-btn').forEach(b => {
            b.classList.toggle('active', b.dataset.dir === dir);
        });
    }

    startAnimation() {
        const animate = (timestamp) => {
            if (!this.lastFrameTime) this.lastFrameTime = timestamp;
            if (!this.lastRotationTime) this.lastRotationTime = timestamp;

            const elapsed = timestamp - this.lastFrameTime;
            const rotationElapsed = timestamp - this.lastRotationTime;

            // Auto Rotate Logic
            if (this.currentState.autoRotate && rotationElapsed > this.rotationInterval) {
                const currentIdx = this.directionsList.indexOf(this.currentState.direction);
                const nextIdx = (currentIdx + 1) % this.directionsList.length;
                this.setDirection(this.directionsList[nextIdx]);
                this.lastRotationTime = timestamp;
            }

            // Frame Animation Logic
            // Both Idle and Walk should animate through frames (Left-to-Right)
            if (this.currentState.isPlaying && elapsed > (1000 / this.currentState.fps)) {
                this.updateFrame(1);
                this.lastFrameTime = timestamp;
                this.renderPreview();
            } else if (!this.currentState.isPlaying) {
                this.renderPreview();
            }

            this.animationId = requestAnimationFrame(animate);
        };
        this.animationId = requestAnimationFrame(animate);
    }

    updateFrame(increment) {
        let nextFrame = this.currentState.currentFrame + increment;
        const maxFrames = this.currentState.frameCount;

        if (nextFrame >= maxFrames) nextFrame = 0;
        if (nextFrame < 0) nextFrame = maxFrames - 1;

        this.currentState.currentFrame = nextFrame;
        const el = document.getElementById('currentFrame');
        if (el) el.textContent = this.currentState.currentFrame + 1;
    }

    handleImageUpload(event) {
        const file = event.target.files[0];
        const layer = event.target.dataset.layer;

        if (file) {
            const reader = new FileReader();
            reader.onload = (e) => {
                const img = new Image();
                img.onload = () => {
                    this.layers[layer].image = img;
                    this.updateLayerCache(layer);
                };
                img.src = e.target.result;
            };
            reader.readAsDataURL(file);
        }
    }

    handleColorChange(event) {
        const colorPicker = event.target.closest('.color-picker');
        if (colorPicker) {
            const layer = colorPicker.id.replace('Color', '').toLowerCase();
            if (this.layers[layer]) {
                this.layers[layer].color = event.target.value;
                this.updateLayerCache(layer);
            }
        }
    }

    refreshAllLayersCache() {
        Object.keys(this.layers).forEach(key => this.updateLayerCache(key));
    }

    updateLayerCache(layerName) {
        const layer = this.layers[layerName];
        if (layer.image) {
            layer.cached = this.applyColorToImage(layer.image, layer.color);
        }
    }

    applyColorToImage(img, color) {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');

        ctx.drawImage(img, 0, 0);

        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;

        const r = parseInt(color.substr(1, 2), 16);
        const g = parseInt(color.substr(3, 2), 16);
        const b = parseInt(color.substr(5, 2), 16);

        const removeBg = this.currentState.removeBackground;

        for (let i = 0; i < data.length; i += 4) {
            // Background Removal (White tolerance)
            if (removeBg && data[i] > 240 && data[i + 1] > 240 && data[i + 2] > 240) {
                data[i + 3] = 0; // Set Alpha to 0
                continue;
            }

            if (data[i + 3] > 0) {
                data[i] = (data[i] * r) / 255;
                data[i + 1] = (data[i + 1] * g) / 255;
                data[i + 2] = (data[i + 2] * b) / 255;
            }
        }

        ctx.putImageData(imageData, 0, 0);
        return canvas;
    }

    renderPreview() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.imageSmoothingEnabled = false;

        const layerOrder = ['body', 'feet', 'legs', 'torso', 'hair'];

        layerOrder.forEach(layerName => {
            const layer = this.layers[layerName];
            const sourceImage = layer.cached || layer.image;

            if (sourceImage) {
                // UNIFIED LAYOUT LOGIC (Horizontal)
                // Rows = Directions (Fixed 4: Down, Up, Right, Left)
                // Cols = Frames (Variable based on frameCount)

                const dirIndex = this.directionMap[this.currentState.direction];
                const frameCount = this.currentState.frameCount;

                const frameWidth = sourceImage.width / frameCount;
                const frameHeight = sourceImage.height / 4;

                const sx = this.currentState.currentFrame * frameWidth;
                const sy = dirIndex * frameHeight;

                // Render
                const scale = Math.min(this.canvas.width / frameWidth, this.canvas.height / frameHeight) * 0.8;
                const dWidth = frameWidth * scale;
                const dHeight = frameHeight * scale;
                const dx = (this.canvas.width - dWidth) / 2;
                const dy = (this.canvas.height - dHeight) / 2;

                this.ctx.drawImage(
                    sourceImage,
                    sx, sy, frameWidth, frameHeight,
                    dx, dy, dWidth, dHeight
                );
            }
        });
    }

    saveSprite() {
        const characterName = prompt('Nome do personagem:', 'personagem_' + Date.now());
        if (!characterName) return;

        const spriteData = {
            id: Date.now(),
            name: characterName,
            frameCount: this.currentState.frameCount,
            layers: {},
            timestamp: new Date().toISOString()
        };

        Object.keys(this.layers).forEach(layerName => {
            if (this.layers[layerName].image) {
                spriteData.layers[layerName] = {
                    color: this.layers[layerName].color
                };
            }
        });

        this.savedSprites.push(spriteData);
        localStorage.setItem('savedSprites', JSON.stringify(this.savedSprites));
        this.updateSpriteList();
        alert(`Sprite "${characterName}" salvo!`);
    }

    exportSprite() {
        const activeLayerName = Object.keys(this.layers).find(k => this.layers[k].image);
        if (!activeLayerName) {
            alert('Adicione pelo menos uma camada para exportar.');
            return;
        }

        const refImage = this.layers[activeLayerName].cached || this.layers[activeLayerName].image;
        const exportCanvas = document.createElement('canvas');
        exportCanvas.width = refImage.width;
        exportCanvas.height = refImage.height;
        const exportCtx = exportCanvas.getContext('2d');

        const layerOrder = ['body', 'feet', 'legs', 'torso', 'hair'];

        layerOrder.forEach(layerName => {
            const layer = this.layers[layerName];
            if (layer.cached) {
                exportCtx.drawImage(layer.cached, 0, 0);
            } else if (layer.image) {
                exportCtx.drawImage(layer.image, 0, 0);
            }
        });

        const link = document.createElement('a');
        link.download = `sprite_${Date.now()}.png`;
        link.href = exportCanvas.toDataURL('image/png');
        link.click();
    }

    resetLayers() {
        Object.keys(this.layers).forEach(key => {
            this.layers[key].image = null;
            this.layers[key].cached = null;
        });
        document.querySelectorAll('.layer-upload').forEach(input => input.value = '');
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.refreshAllLayersCache();
    }

    loadSavedSprites() {
        const saved = localStorage.getItem('savedSprites');
        if (saved) {
            try {
                this.savedSprites = JSON.parse(saved);
                this.updateSpriteList();
            } catch (e) {
                console.error("Error loading saved sprites", e);
                this.savedSprites = [];
            }
        }
    }

    updateSpriteList() {
        const container = document.getElementById('spriteList');
        container.innerHTML = '';
        this.savedSprites.slice().reverse().forEach(sprite => {
            const item = document.createElement('div');
            item.className = 'sprite-item';
            item.textContent = sprite.name;
            item.style.padding = '5px';
            item.style.textAlign = 'center';
            item.style.background = '#ddd';
            item.style.marginBottom = '5px';

            item.addEventListener('click', () => {
                alert('Carregar ainda não implementado.');
            });

            container.appendChild(item);
        });
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new SpriteCreator();
});
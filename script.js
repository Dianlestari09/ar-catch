// ==========================================
// BAGIAN 1: KONFIGURASI AI, KAMERA & BACKGROUND
// ==========================================
const videoElement = document.querySelector('.input_video');
const canvasElement = document.getElementById('bg-canvas');
const canvasCtx = canvasElement.getContext('2d');

const loadingOverlay = document.getElementById('loading-overlay');
const welcomeScreen = document.getElementById('welcome-screen');
// Kita sembunyikan input manual karena pakai Monitor 2
if (welcomeScreen) welcomeScreen.style.display = 'none';

let playerX = 0.5;
let playerY = 0.8;
let isAIReady = false;
let currentPlayerName = "Player";

// --- DUAL MONITOR COMMUNICATION ---
const gameChannel = new BroadcastChannel('ar_catch_channel');

gameChannel.onmessage = (event) => {
    if (event.data.type === 'START_GAME') {
        const receivedName = event.data.playerName;
        console.log("Monitor 2 Meminta Start untuk:", receivedName);

        currentPlayerName = receivedName;
        window.gameHasStarted = true;

        game.scene.getScenes(true).forEach(s => s.scene.stop());
        game.scene.start('PlayScene');
    }
};

const bgImage = new Image();
bgImage.src = 'assets/images/bg.png';
bgImage.onload = () => console.log("Background siap.");

// --- FUNGSI UTAMA RENDERING AI ---
function onPoseResults(results) {
    if (canvasElement.width !== window.innerWidth || canvasElement.height !== window.innerHeight) {
        canvasElement.width = window.innerWidth;
        canvasElement.height = window.innerHeight;
    }

    const cw = canvasElement.width;
    const ch = canvasElement.height;

    // Menghitung skala agar video cover satu layar penuh (no black bars)
    const imgW = results.image.width;
    const imgH = results.image.height;
    const scale = Math.max(cw / imgW, ch / imgH);
    const drawW = imgW * scale;
    const drawH = imgH * scale;
    const drawX = (cw - drawW) / 2;
    const drawY = ch - drawH;

    canvasCtx.save();
    canvasCtx.clearRect(0, 0, cw, ch);

    // Gambar Masking & Video
    if (results.segmentationMask) {
        canvasCtx.globalCompositeOperation = 'source-over';
        canvasCtx.filter = 'blur(4px)';
        canvasCtx.drawImage(results.segmentationMask, drawX, drawY, drawW, drawH);
        canvasCtx.filter = 'none';
        canvasCtx.globalCompositeOperation = 'source-in';
        canvasCtx.drawImage(results.image, drawX, drawY, drawW, drawH);
    } else {
        canvasCtx.globalCompositeOperation = 'source-over';
        canvasCtx.drawImage(results.image, drawX, drawY, drawW, drawH);
    }

    // Gambar Background di belakang orang
    canvasCtx.globalCompositeOperation = 'destination-over';
    canvasCtx.drawImage(bgImage, 0, 0, cw, ch);
    canvasCtx.restore();

    if (!results.poseLandmarks) return;

    if (!isAIReady) {
        isAIReady = true;
        if (loadingOverlay) {
            loadingOverlay.style.opacity = '0';
            setTimeout(() => loadingOverlay.style.display = 'none', 500);
        }
    }

    // Deteksi Tangan untuk Posisi Keranjang
    const leftWrist = results.poseLandmarks[15];
    const rightWrist = results.poseLandmarks[16];

    const isLeftVisible = leftWrist && leftWrist.visibility > 0.3;
    const isRightVisible = rightWrist && rightWrist.visibility > 0.3;

    if (isLeftVisible || isRightVisible) {
        let rawX, rawY;
        if (isLeftVisible && isRightVisible) {
            rawX = (leftWrist.x + rightWrist.x) / 2;
            rawY = (leftWrist.y + rightWrist.y) / 2;
        } else if (isLeftVisible) {
            rawX = leftWrist.x;
            rawY = leftWrist.y;
        } else {
            rawX = rightWrist.x;
            rawY = rightWrist.y;
        }

        // Konversi koordinat video ke koordinat layar game
        const screenPxX = drawX + (rawX * drawW);
        const screenPxY = drawY + (rawY * drawH);
        
        // Normalisasi 0.0 - 1.0 untuk Phaser
        playerX = 1 - (screenPxX / cw); // Mirror effect
        playerY = screenPxY / ch;
    }
}

const pose = new Pose({ locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}` });
pose.setOptions({
    modelComplexity: 1, smoothLandmarks: true, enableSegmentation: true, smoothSegmentation: true,
    minDetectionConfidence: 0.5, minTrackingConfidence: 0.5
});
pose.onResults(onPoseResults);

const camera = new Camera(videoElement, {
    onFrame: async () => { await pose.send({ image: videoElement }); },
    width: 1280, height: 720
});
camera.start();


// ==========================================
// BAGIAN 2: LOGIKA GAME PHASER (RESPONSIF PRO)
// ==========================================

function saveHighScore(name, score) {
    let highscores = JSON.parse(localStorage.getItem('ar_catch_scores')) || [];
    highscores.push({ name: name, score: score });
    highscores.sort((a, b) => b.score - a.score);
    highscores = highscores.slice(0, 7);
    localStorage.setItem('ar_catch_scores', JSON.stringify(highscores));
    gameChannel.postMessage({ type: 'GAME_OVER_DONE' });
}

function getHighScores() {
    return JSON.parse(localStorage.getItem('ar_catch_scores')) || [];
}

// --- SCENE 1: MENU ---
class MenuScene extends Phaser.Scene {
    constructor() { super('MenuScene'); }
    preload() {
        this.load.image('judul_game', 'assets/images/catch.png');
        this.load.image('keranjang', 'assets/images/keranjang.png');
        ['mangga', 'nanas', 'apel', 'cengkeh', 'madu', 'kopi', 'cabe', 'bawang', 'pete'].forEach(item => this.load.image(item, `assets/images/${item}.png`));
        
        this.load.audio('bgm_menu', 'assets/audio/menu.mp3');
        this.load.audio('bgm_game', 'assets/audio/game.mp3');
        this.load.audio('sfx_catch', 'assets/audio/catch.mp3');
        this.load.audio('sfx_over', 'assets/audio/gameover.mp3');
        this.load.audio('sfx_click', 'assets/audio/click.wav');
        this.load.audio('sfx_boom', 'assets/audio/explosion.wav');
        this.load.audio('sfx_win', 'assets/audio/fanfare.wav');
        this.load.audio('sfx_countdown', 'assets/audio/countdown.mp3');
        this.load.audio('sfx_tension', 'assets/audio/alert.mp3');
    }
    create() {
        this.scene.stop('PlayScene'); this.scene.stop('GameOverScene');
        this.sound.stopAll();
        if (this.sys.game.device.audio.webAudio) try { this.sound.play('bgm_menu', { loop: true, volume: 0.5 }); } catch (e) { }

        this.bgOverlay = this.add.rectangle(0, 0, 0, 0, 0x000000, 0.6);

        // Dekorasi Floating Items
        this.createFloatingDecorations();
        
        // Judul Image
        this.titleImage = this.add.image(0, 0, 'judul_game').setOrigin(0.5).setDepth(10);

        // Teks Operator
        this.welcomeText = this.add.text(0, 0, `MENUNGGU OPERATOR...`, { 
            fontFamily: 'Fredoka One', 
            color: '#FFF', 
            stroke: '#000', 
            strokeThickness: 4, 
            align: 'center' 
        }).setOrigin(0.5).setDepth(10);

        this.resize(this.scale.gameSize); 
        this.scale.on('resize', this.resize, this);
    }

    createFloatingDecorations() {
        const items = ['mangga', 'nanas', 'apel', 'cengkeh', 'madu', 'kopi', 'cabe', 'bawang', 'pete'];
        this.decorGroup = this.add.group();
        // Jumlah item background disesuaikan agar tidak terlalu ramai/sepi
        const numItems = Math.min(Math.floor(this.scale.width / 100), 12);

        for (let i = 0; i < numItems; i++) {
            const key = Phaser.Math.RND.pick(items);
            const x = Phaser.Math.Between(50, this.scale.width - 50);
            const y = Phaser.Math.Between(50, this.scale.height - 50);
            const sprite = this.add.image(x, y, key);
            
            // LOGIKA SIZE: Ukuran background item 60% - 90% dari ukuran item gameplay
            // Agar terlihat sebagai background (lebih kecil sedikit)
            const targetSize = Phaser.Math.Clamp(this.scale.width * 0.08, 60, 110);
            sprite.displayWidth = targetSize;
            sprite.scaleY = sprite.scaleX;

            sprite.setAngle(Phaser.Math.Between(-180, 180));
            sprite.setDepth(Phaser.Math.Between(1, 5));
            sprite.setAlpha(0.85); // Sedikit transparan

            this.tweens.add({
                targets: sprite,
                y: y + Phaser.Math.Between(-40, 40),
                angle: sprite.angle + Phaser.Math.Between(-20, 20),
                duration: Phaser.Math.Between(3000, 6000),
                yoyo: true, repeat: -1, ease: 'Sine.easeInOut'
            });
            this.decorGroup.add(sprite);
        }
    }
    
    resize(gameSize) {
        const w = gameSize.width, h = gameSize.height;
        this.bgOverlay.setPosition(w / 2, h / 2).setSize(w, h);
        
        // 1. RESIZE JUDUL
        if (this.titleImage) {
            // Lebar judul 60% layar, tapi max 700px, min 300px
            const targetW = Phaser.Math.Clamp(w * 0.6, 300, 700);
            const scale = targetW / this.titleImage.width;
            this.titleImage.setScale(scale);
            // Posisi agak naik sedikit
            this.titleImage.setPosition(w / 2, h * 0.35);
        }

        // 2. RESIZE TEKS
        // Ukuran font responsif (4% lebar layar), dibatasi min 24px max 40px
        const fontSize = Phaser.Math.Clamp(w * 0.04, 24, 40);
        this.welcomeText.setFontSize(fontSize + 'px')
                        .setPosition(w / 2, h * 0.75);
    }
}

// --- SCENE 2: PLAY SCENE (CORE GAMEPLAY) ---
class PlayScene extends Phaser.Scene {
    constructor() { super('PlayScene'); }
    create() {
        this.score = 0;
        this.isGameOver = false;
        this.initialTime = 25;
        this.timeLeft = this.initialTime;
        this.isGameRunning = false;
        this.sound.stopAll();

        // Setup Text UI
        this.scoreText = this.add.text(20, 20, 'SCORE: 0', {
            fontFamily: 'Fredoka One', color: '#FFD700', stroke: '#000', strokeThickness: 6
        });
        this.timerText = this.add.text(0, 0, 'TIME: ' + this.initialTime, { 
            fontFamily: 'Fredoka One', color: '#FFF', stroke: '#000', strokeThickness: 4 
        }).setOrigin(1, 0);
        this.countdownText = this.add.text(0, 0, '', {
            fontFamily: 'Fredoka One', color: '#FFD700', stroke: '#000', strokeThickness: 10
        }).setOrigin(0.5).setDepth(20);

        // Setup Basket
        this.basket = this.physics.add.sprite(0, 0, 'keranjang');
        this.basket.body.allowGravity = false; 
        this.basket.body.immovable = true; 
        this.basket.setAlpha(0.95);

        // Setup Physics Group
        this.itemsGroup = this.physics.add.group();
        this.particleManagers = {};
        ['mangga', 'nanas', 'apel', 'cengkeh', 'madu', 'kopi'].forEach(type => {
            this.particleManagers[type] = this.add.particles(0, 0, type, { speed: 150, scale: { start: 0.3, end: 0 }, lifespan: 400, emitting: false });
        });

        this.physics.add.overlap(this.basket, this.itemsGroup, (basket, item) => this.handleCatch(item));
        
        // Panggil Resize Pertama Kali
        this.resize(this.scale.gameSize); 
        this.scale.on('resize', this.resize, this);

        this.startCountdownSequence();
    }

    startCountdownSequence() {
        let count = 3;
        this.countdownText.setText(count);
        this.countdownText.setVisible(true);
        this.playCountdownSound();

        this.time.addEvent({
            delay: 1000, repeat: 3,
            callback: () => {
                count--;
                if (count > 0) {
                    this.countdownText.setText(count);
                    this.tweens.add({ targets: this.countdownText, scale: { from: 1.5, to: 1 }, duration: 200 });
                    this.playCountdownSound();
                } else if (count === 0) {
                    this.countdownText.setText('GO!');
                    this.tweens.add({ targets: this.countdownText, scale: { from: 1.5, to: 1 }, duration: 200 });
                    this.playCountdownSound(true);
                } else {
                    this.countdownText.setVisible(false);
                    this.startGameGameplay();
                }
            }, callbackScope: this
        });
    }

    playCountdownSound(isGo = false) {
        try {
            if (this.cache.audio.exists('sfx_countdown')) {
                this.sound.play('sfx_countdown', { rate: isGo ? 1.5 : 1.0 });
            } else {
                this.sound.play('sfx_click', { volume: 1.5, rate: isGo ? 1.5 : 1.0 });
            }
        } catch (e) { }
    }

    startGameGameplay() {
        this.isGameRunning = true;
        try { this.sound.play('bgm_game', { loop: true, volume: 0.4 }); } catch (e) { }
        this.spawnEvent = this.time.addEvent({ delay: 1000, callback: this.spawnItem, callbackScope: this, loop: true });
        this.gameTimer = this.time.addEvent({ delay: 1000, callback: this.updateTimer, callbackScope: this, loop: true });
    }

    update() {
        if (this.isGameOver) return;
        if (isAIReady) {
            // Gerakan Keranjang Smooth
            const targetX = playerX * this.scale.width;
            this.basket.x = Phaser.Math.Interpolation.Linear([this.basket.x, targetX], 0.2);
            
            const targetY = (playerY * this.scale.height);
            // Batasi agar keranjang tidak terlalu ke atas (menutupi wajah) atau terlalu ke bawah
            const clampedY = Phaser.Math.Clamp(targetY, this.scale.height * 0.2, this.scale.height * 0.95);
            this.basket.y = Phaser.Math.Interpolation.Linear([this.basket.y, clampedY], 0.2);
        }
        this.itemsGroup.children.iterate((item) => { if (item && item.y > this.scale.height + 150) item.destroy(); });
    }

    // --- LOGIKA RESIZE PENTING ---
    resize(gameSize) {
        const w = gameSize.width, h = gameSize.height;
        this.cameras.main.setViewport(0, 0, w, h); 
        this.physics.world.setBounds(0, 0, w, h);

        // 1. UI SCORE & TIME (Proporsional tapi ada batasnya)
        // Target: 4% lebar layar. Min: 24px (HP), Max: 48px (Monitor Besar)
        const uiFontSize = Phaser.Math.Clamp(w * 0.045, 24, 48); 
        const margin = Math.max(w * 0.05, 20);

        this.scoreText.setPosition(margin, margin)
                      .setFontSize(uiFontSize + 'px')
                      .setStroke('#000', uiFontSize * 0.15); // Tebal stroke menyesuaikan font

        this.timerText.setPosition(w - margin, margin)
                      .setFontSize(uiFontSize + 'px')
                      .setStroke('#000', uiFontSize * 0.15);

        // 2. COUNTDOWN (Besar di tengah)
        this.countdownText.setPosition(w / 2, h / 2)
                          .setFontSize(Math.min(w * 0.3, 200) + 'px');

        // 3. BASKET (KUNCI PROPORSIONAL)
        // Lebar keranjang ideal: 22% - 25% dari lebar layar
        // TAPI: Jangan lebih kecil dari 180px (susah nangkep) & jangan lebih besar dari 350px (kegedean)
        const basketTargetW = Phaser.Math.Clamp(w * 0.25, 180, 350); 
        
        this.basket.displayWidth = basketTargetW;
        this.basket.scaleY = this.basket.scaleX; // Jaga aspek rasio gambar

        // Update Physics Hitbox
        if (this.basket.body) {
            // Radius hitbox sedikit lebih kecil dari gambar agar terlihat "masuk"
            this.basket.body.setCircle(this.basket.width * 0.35); 
            this.basket.body.setOffset(this.basket.width * 0.15, this.basket.height * 0.2);
        }
    }

    updateTimer() {
        if (this.isGameOver || !this.isGameRunning) return;
        this.timeLeft--;
        this.timerText.setText('TIME: ' + this.timeLeft);

        if (this.timeLeft === 5) { try { this.sound.play('sfx_tension', { volume: 2.0 }); } catch (e) { } }
        if (this.timeLeft <= 5) {
            this.timerText.setColor('#FF0000');
            if (this.tweens.isTweening(this.timerText)) this.tweens.killTweensOf(this.timerText);
            this.timerText.setScale(1.0);
            this.tweens.add({ targets: this.timerText, scale: 1.5, duration: 200, yoyo: true });
        } else {
            this.timerText.setColor('#FFF'); this.timerText.setScale(1);
        }
        if (this.timeLeft <= 0) this.gameOver();
    }

    spawnItem() {
        if (this.isGameOver || !this.isGameRunning) return;
        const w = this.scale.width, h = this.scale.height;
        
        // Spawn di area 10% - 90% lebar layar
        const x = Phaser.Math.Between(w * 0.1, w * 0.9);
        const isBad = Math.random() < 0.25;
        const textureKey = isBad ? Phaser.Math.RND.pick(['cabe', 'bawang', 'pete']) : Phaser.Math.RND.pick(['mangga', 'nanas', 'apel', 'cengkeh', 'madu', 'kopi']);
        
        const item = this.itemsGroup.create(x, -150, textureKey);
        item.setData('isBad', isBad); 
        
        // --- ITEM SIZE PROPORSIONAL ---
        // Target: Sekitar 10% - 12% lebar layar (setengah ukuran keranjang)
        // Min: 80px, Max: 130px (Supaya enak dilihat di layar gede)
        const itemSize = Phaser.Math.Clamp(w * 0.11, 80, 130);
        
        item.displayWidth = itemSize;
        item.scaleY = item.scaleX; 
        
        item.body.setCircle(item.width * 0.45); // Hitbox bulat
        
        // Kecepatan
        const minSpeed = h * 0.35; 
        const maxSpeed = h * 0.65;
        item.setVelocityY(Phaser.Math.Between(minSpeed, maxSpeed)); 
        item.setAngularVelocity(Phaser.Math.Between(-100, 100));
    }

    handleCatch(item) {
        if (this.isGameOver || !this.isGameRunning) return;
        const isBad = item.getData('isBad');
        if (isBad) {
            try { this.sound.play('sfx_boom'); } catch (e) { }
            this.cameras.main.shake(200, 0.02); this.score -= 500;
        } else {
            this.score += 1000; try { this.sound.play('sfx_catch'); } catch (e) { }
            if (this.particleManagers[item.texture.key]) this.particleManagers[item.texture.key].emitParticleAt(item.x, item.y, 10);
            this.tweens.add({ targets: this.basket, scaleX: this.basket.scaleX * 1.2, scaleY: this.basket.scaleY * 0.9, duration: 50, yoyo: true });
        }
        this.scoreText.setText('SCORE: ' + this.score); item.destroy();
    }

    gameOver() {
        this.isGameOver = true; this.isGameRunning = false;
        this.physics.pause(); if (this.spawnEvent) this.spawnEvent.remove(); if (this.gameTimer) this.gameTimer.remove(); this.sound.stopAll();
        try { this.score >= 50 ? this.sound.play('sfx_win') : this.sound.play('sfx_over'); } catch (e) { }
        saveHighScore(currentPlayerName, this.score);
        this.time.delayedCall(1500, () => this.scene.start('GameOverScene', { score: this.score }));
    }
}

// --- SCENE 3: GAME OVER ---
class GameOverScene extends Phaser.Scene {
    constructor() { super('GameOverScene'); }
    create(data) {
        this.bgOverlay = this.add.rectangle(0, 0, 0, 0, 0x000000, 0.85);
        
        this.titleText = this.add.text(0, 0, 'Selamat, kamu berhasil\nmendapatkan :', {
            fontFamily: 'Fredoka One', color: '#ffd900ff', align: 'center', stroke: '#000', strokeThickness: 3,
            shadow: { offsetX: 2, offsetY: 2, color: '#000', blur: 4, fill: true }
        }).setOrigin(0.5);

        this.scoreCircle = this.add.graphics();
        this.scoreCircle.setDepth(1);
        
        this.scoreText = this.add.text(0, 0, data.score, { 
            fontFamily: 'Fredoka One', color: '#FFF', stroke: '#000', strokeThickness: 4 
        }).setOrigin(0.5).setDepth(2);
        
        this.pointText = this.add.text(0, 0, 'Point', { 
            fontFamily: 'Fredoka One', color: '#DDD', stroke: '#000', strokeThickness: 2 
        }).setOrigin(0.5).setDepth(2);

        this.welcomeText = this.add.text(0, 0, 'Silakan input nama pemain baru di Operator', { 
            fontFamily: 'Fredoka One', color: '#AAA' 
        }).setOrigin(0.5);

        this.resize(this.scale.gameSize); 
        this.scale.on('resize', this.resize, this);
    }

    resize(gameSize) {
        const w = gameSize.width, h = gameSize.height;
        this.bgOverlay.setPosition(w / 2, h / 2).setSize(w, h);
        
        const titleSize = Phaser.Math.Clamp(w * 0.05, 24, 40);
        this.titleText.setPosition(w / 2, h * 0.20)
                      .setFontSize(titleSize + 'px')
                      .setLineSpacing(10);
        
        // Lingkaran Score Proporsional
        const circleRadius = Phaser.Math.Clamp(w * 0.15, 80, 150);
        const circleY = h * 0.5;
        
        this.scoreCircle.clear();
        this.scoreCircle.fillStyle(0x666666, 0.8);
        this.scoreCircle.fillCircle(w / 2, circleY, circleRadius);
        
        this.scoreText.setPosition(w / 2, circleY - 10)
                      .setFontSize((circleRadius * 0.6) + 'px');
                      
        this.pointText.setPosition(w / 2, circleY + (circleRadius * 0.4))
                      .setFontSize((circleRadius * 0.25) + 'px');

        this.welcomeText.setPosition(w / 2, h * 0.85)
                        .setFontSize(Math.max(16, h * 0.03) + 'px');
    }
}

// --- SCENE 4: LEADERBOARD ---
class LeaderboardScene extends Phaser.Scene {
    constructor() { super('LeaderboardScene'); }
    create() {
        this.bgOverlay = this.add.rectangle(0, 0, 0, 0, 0x000000, 0.85);
        this.titleText = this.add.text(0, 0, 'LEADERBOARD \n 🏆 TOP 7 🏆', {
            fontFamily: 'Fredoka One', color: '#FFD700', stroke: '#FFF', strokeThickness: 2,
            shadow: { offsetX: 2, offsetY: 2, color: '#000', blur: 4, fill: true },
            align: 'center'
        }).setOrigin(0.5);

        this.listContainer = this.add.container(0, 0);
        const scores = getHighScores();
        
        if (scores.length === 0) {
            const noData = this.add.text(0, 0, 'Belum ada data.', { fontFamily: 'Fredoka One', fontSize: '24px', color: '#AAA' }).setOrigin(0.5);
            this.listContainer.add(noData);
        } else {
            scores.slice(0, 7).forEach((entry, index) => { this.createScoreBubble(index, entry.name, entry.score); });
        }
        
        this.resize(this.scale.gameSize); 
        this.scale.on('resize', this.resize, this);
    }

    createScoreBubble(index, name, score) {
        const rank = index + 1;
        let bubbleColor, textColor, strokeColor;
        if (rank === 1) { bubbleColor = 0xFFD700; textColor = '#783f04'; strokeColor = 0xF5A623; }
        else { bubbleColor = 0xE0E0E0; textColor = '#333333'; strokeColor = 0xCCCCCC; }
        
        const rowContainer = this.add.container(0, index * 70);
        const barWidth = 320; 
        const barHeight = 55;
        
        const bgGraphics = this.add.graphics();
        bgGraphics.fillStyle(bubbleColor, 1); 
        bgGraphics.fillRoundedRect(-barWidth / 2, -barHeight / 2, barWidth, barHeight, 15);
        bgGraphics.lineStyle(2, strokeColor, 0.9); 
        bgGraphics.strokeRoundedRect(-barWidth / 2, -barHeight / 2, barWidth, barHeight, 15);
        
        const rankCircle = this.add.graphics();
        rankCircle.fillStyle(0x000000, 0.2); 
        rankCircle.fillCircle(-barWidth / 2 + 30, 0, 18);
        
        const rankText = this.add.text(-barWidth / 2 + 30, 0, '#' + rank, { fontFamily: 'Fredoka One', fontSize: '18px', color: '#FFFFFF' }).setOrigin(0.5);
        const nameText = this.add.text(-barWidth / 2 + 60, 0, name.toUpperCase(), { fontFamily: 'Fredoka One', fontSize: '20px', color: textColor }).setOrigin(0, 0.5);
        const scoreText = this.add.text(barWidth / 2 - 20, 0, score, { fontFamily: 'Fredoka One', fontSize: '22px', color: textColor }).setOrigin(1, 0.5);
        
        rowContainer.add([bgGraphics, rankCircle, rankText, nameText, scoreText]);
        this.listContainer.add(rowContainer);
    }

    resize(gameSize) {
        const w = gameSize.width, h = gameSize.height;
        this.bgOverlay.setPosition(w / 2, h / 2).setSize(w, h);
        
        // Title Scaling
        const titleSize = Phaser.Math.Clamp(h * 0.05, 32, 60);
        this.titleText.setPosition(w / 2, h * 0.15)
                      .setFontSize(titleSize + 'px');

        const itemHeight = 70; 
        const numberOfItems = getHighScores().slice(0, 7).length; 
        const totalListHeight = numberOfItems * itemHeight;
        
        let listY = h * 0.25 + (totalListHeight/2);
        this.listContainer.setPosition(w / 2, listY);

        // Responsive Scale untuk container (biar gak kepotong di HP)
        const maxContainerW = w * 0.85;
        const currentW = 320; 
        const scale = Math.min(1, maxContainerW / currentW);
        this.listContainer.setScale(scale);
    }
}

const config = {
    type: Phaser.AUTO, 
    parent: 'game-container', 
    width: window.innerWidth, 
    height: window.innerHeight, 
    transparent: true,
    scale: { mode: Phaser.Scale.RESIZE, autoCenter: Phaser.Scale.CENTER_BOTH },
    physics: { default: 'arcade', arcade: { gravity: { y: 0 }, debug: false } },
    scene: [MenuScene, PlayScene, GameOverScene, LeaderboardScene]
};
const game = new Phaser.Game(config);

window.addEventListener('resize', () => {
    game.scale.resize(window.innerWidth, window.innerHeight);
});
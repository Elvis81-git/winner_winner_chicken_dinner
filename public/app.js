// Connect to the socket server
const socket = io({ transports: ['websocket'] });

// UI Elements
const joinScreen = document.getElementById('join-screen');
const gameScreen = document.getElementById('game-screen');
const joinBtn = document.getElementById('join-btn');
const usernameInput = document.getElementById('username-input');
const roomInput = document.getElementById('room-input');
const displayRoomId = document.getElementById('display-room-id');
const onlineCount = document.getElementById('online-count');
const rosterList = document.getElementById('players-roster');
const startGameBtn = document.getElementById('start-game-btn');
const hostSettingsPanel = document.getElementById('host-settings-panel');
const botCountSelect = document.getElementById('bot-count');
const maxPlayersSelect = document.getElementById('max-players');
const hudStatus = document.getElementById('hud-status');
const hudTimer = document.getElementById('hud-timer');
const hudHumans = document.getElementById('hud-humans');
const hudHpFill = document.getElementById('hud-hp-fill');
const hudHpVal = document.getElementById('hud-hp-val');
const hudEnergyFill = document.getElementById('hud-energy-fill');
const hudEnergyVal = document.getElementById('hud-energy-val');
const hudTrapDisplay = document.getElementById('hud-trap-display');
const cooldownFill = document.getElementById('cooldown-fill');
const feedLogs = document.getElementById('feed-logs');
const endOverlay = document.getElementById('end-overlay');
const winnerAnnouncement = document.getElementById('winner-announcement');
const restartCountdown = document.getElementById('restart-countdown');

// Canvas setups
const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');
const minimapCanvas = document.getElementById('minimap');

// Game state variables
let localSocketId = null;
let roomState = 'LOBBY';
let serverData = {
    state: 'LOBBY',
    players: {},
    boxes: [],
    traps: [],
    powerups: [],
    zone: { x: 800, y: 800, radius: 1000 },
    winner: null,
    logs: [],
    mapWidth: 1600,
    mapHeight: 1600
};

// Input flags
let selectedTrapType = 'teleport';
let dashTriggered = false;
let placeTrapTriggered = false;

// Mobile controls
let isMobile = false;
let joystick = null;
const mobileControls = document.getElementById('mobile-controls-container');
const mobileShootBtn = document.getElementById('mobile-shoot-btn');

// Camera & Visuals
let cameraShake = 0;
const particles = [];
let announcementMsg = '';
let announcementTimer = 0;

// Local End-Game Timer
let localEndCountdown = 8;
let endCountdownInterval = null;

// Desktop inputs listener
const keys = {
    w: false, a: false, s: false, d: false,
    ArrowUp: false, ArrowDown: false, ArrowLeft: false, ArrowRight: false
};

// Web Audio API Synth Sound Generator
let audioCtx = null;
const sounds = {
    init: () => {
        if (!audioCtx) {
            try {
                audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            } catch (e) {
                console.warn("Web Audio API is not supported in this browser");
            }
        }
        if (audioCtx && audioCtx.state === 'suspended') {
            audioCtx.resume();
        }
    },
    play: (type) => {
        sounds.init();
        if (!audioCtx) return;
        const now = audioCtx.currentTime;
        switch (type) {
            case 'start': {
                // Triumphant opening notes
                const notes = [261.63, 329.63, 392.00, 523.25];
                notes.forEach((freq, idx) => {
                    const osc = audioCtx.createOscillator();
                    const gain = audioCtx.createGain();
                    osc.type = 'sine';
                    osc.frequency.setValueAtTime(freq, now + idx * 0.1);
                    gain.gain.setValueAtTime(0.15, now + idx * 0.1);
                    gain.gain.exponentialRampToValueAtTime(0.01, now + idx * 0.1 + 0.3);
                    osc.connect(gain);
                    gain.connect(audioCtx.destination);
                    osc.start(now + idx * 0.1);
                    osc.stop(now + idx * 0.1 + 0.3);
                });
                break;
            }
            case 'infect': { // Death sound
                const osc = audioCtx.createOscillator();
                const gain = audioCtx.createGain();
                osc.type = 'sawtooth';
                osc.frequency.setValueAtTime(300, now);
                osc.frequency.linearRampToValueAtTime(80, now + 0.6);
                gain.gain.setValueAtTime(0.3, now);
                gain.gain.exponentialRampToValueAtTime(0.01, now + 0.6);
                osc.connect(gain);
                gain.connect(audioCtx.destination);
                osc.start(now);
                osc.stop(now + 0.6);
                break;
            }
            case 'victory': {
                const notes = [523.25, 659.25, 783.99, 1046.50];
                notes.forEach((freq, idx) => {
                    const osc = audioCtx.createOscillator();
                    const gain = audioCtx.createGain();
                    osc.type = 'triangle';
                    osc.frequency.setValueAtTime(freq, now + idx * 0.08);
                    gain.gain.setValueAtTime(0.15, now + idx * 0.08);
                    gain.gain.exponentialRampToValueAtTime(0.01, now + idx * 0.08 + 0.5);
                    osc.connect(gain);
                    gain.connect(audioCtx.destination);
                    osc.start(now + idx * 0.08);
                    osc.stop(now + idx * 0.08 + 0.5);
                });
                break;
            }
            case 'defeat': {
                const notes = [220.00, 207.65, 196.00, 164.81];
                notes.forEach((freq, idx) => {
                    const osc = audioCtx.createOscillator();
                    const gain = audioCtx.createGain();
                    osc.type = 'sawtooth';
                    osc.frequency.setValueAtTime(freq, now + idx * 0.15);
                    gain.gain.setValueAtTime(0.2, now + idx * 0.15);
                    gain.gain.exponentialRampToValueAtTime(0.01, now + idx * 0.15 + 0.6);
                    osc.connect(gain);
                    gain.connect(audioCtx.destination);
                    osc.start(now + idx * 0.15);
                    osc.stop(now + idx * 0.15 + 0.6);
                });
                break;
            }
            case 'dash': {
                // Noise Whoosh
                const bufferSize = audioCtx.sampleRate * 0.2;
                const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
                const data = buffer.getChannelData(0);
                for (let i = 0; i < bufferSize; i++) {
                    data[i] = Math.random() * 2 - 1;
                }
                const noise = audioCtx.createBufferSource();
                noise.buffer = buffer;
                
                const filter = audioCtx.createBiquadFilter();
                filter.type = 'bandpass';
                filter.Q.setValueAtTime(2.0, now);
                filter.frequency.setValueAtTime(1200, now);
                filter.frequency.exponentialRampToValueAtTime(200, now + 0.2);

                const gain = audioCtx.createGain();
                gain.gain.setValueAtTime(0.35, now);
                gain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);

                noise.connect(filter);
                filter.connect(gain);
                gain.connect(audioCtx.destination);
                noise.start(now);
                noise.stop(now + 0.2);
                break;
            }
            case 'boxHit':
            case 'knockback': {
                // Thud impact sound
                const osc = audioCtx.createOscillator();
                const gain = audioCtx.createGain();
                osc.type = 'sine';
                osc.frequency.setValueAtTime(150, now);
                osc.frequency.exponentialRampToValueAtTime(45, now + 0.15);
                gain.gain.setValueAtTime(0.4, now);
                gain.gain.linearRampToValueAtTime(0.01, now + 0.15);
                osc.connect(gain);
                gain.connect(audioCtx.destination);
                osc.start(now);
                osc.stop(now + 0.15);
                break;
            }
            case 'shieldBreak': {
                const osc1 = audioCtx.createOscillator();
                const osc2 = audioCtx.createOscillator();
                const gain = audioCtx.createGain();
                osc1.type = 'sine';
                osc1.frequency.setValueAtTime(2000, now);
                osc1.frequency.linearRampToValueAtTime(800, now + 0.3);
                osc2.type = 'triangle';
                osc2.frequency.setValueAtTime(1500, now);
                osc2.frequency.linearRampToValueAtTime(600, now + 0.25);
                
                gain.gain.setValueAtTime(0.25, now);
                gain.gain.exponentialRampToValueAtTime(0.01, now + 0.35);
                
                osc1.connect(gain);
                osc2.connect(gain);
                gain.connect(audioCtx.destination);
                osc1.start(now);
                osc2.start(now);
                osc1.stop(now + 0.35);
                osc2.stop(now + 0.35);
                break;
            }
            case 'freezeTrigger': {
                const osc = audioCtx.createOscillator();
                const gain = audioCtx.createGain();
                osc.type = 'sine';
                osc.frequency.setValueAtTime(880, now);
                osc.frequency.linearRampToValueAtTime(1200, now + 0.4);
                
                const mod = audioCtx.createOscillator();
                const modGain = audioCtx.createGain();
                mod.frequency.setValueAtTime(30, now);
                modGain.gain.setValueAtTime(100, now);
                
                mod.connect(modGain);
                modGain.connect(osc.frequency);
                
                gain.gain.setValueAtTime(0.2, now);
                gain.gain.exponentialRampToValueAtTime(0.01, now + 0.45);
                
                osc.connect(gain);
                gain.connect(audioCtx.destination);
                
                mod.start(now);
                osc.start(now);
                mod.stop(now + 0.45);
                osc.stop(now + 0.45);
                break;
            }
            case 'springTrigger': {
                const osc = audioCtx.createOscillator();
                const gain = audioCtx.createGain();
                osc.type = 'triangle';
                osc.frequency.setValueAtTime(160, now);
                osc.frequency.exponentialRampToValueAtTime(950, now + 0.3);
                
                gain.gain.setValueAtTime(0.2, now);
                gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
                
                osc.connect(gain);
                gain.connect(audioCtx.destination);
                osc.start(now);
                osc.stop(now + 0.3);
                break;
            }
            case 'glueTrigger': {
                const osc = audioCtx.createOscillator();
                const gain = audioCtx.createGain();
                osc.type = 'sawtooth';
                osc.frequency.setValueAtTime(90, now);
                osc.frequency.linearRampToValueAtTime(45, now + 0.3);
                
                const filter = audioCtx.createBiquadFilter();
                filter.type = 'lowpass';
                filter.frequency.setValueAtTime(300, now);
                filter.frequency.linearRampToValueAtTime(90, now + 0.3);
                
                gain.gain.setValueAtTime(0.25, now);
                gain.gain.exponentialRampToValueAtTime(0.01, now + 0.35);
                
                osc.connect(filter);
                filter.connect(gain);
                gain.connect(audioCtx.destination);
                osc.start(now);
                osc.stop(now + 0.35);
                break;
            }
            case 'teleportTrigger': {
                const osc = audioCtx.createOscillator();
                const gain = audioCtx.createGain();
                osc.type = 'sine';
                osc.frequency.setValueAtTime(320, now);
                osc.frequency.exponentialRampToValueAtTime(1600, now + 0.25);
                
                gain.gain.setValueAtTime(0.18, now);
                gain.gain.exponentialRampToValueAtTime(0.01, now + 0.25);
                
                osc.connect(gain);
                gain.connect(audioCtx.destination);
                osc.start(now);
                osc.stop(now + 0.25);
                break;
            }
            case 'pickup': {
                const notes = [587.33, 880.00];
                notes.forEach((freq, idx) => {
                    const osc = audioCtx.createOscillator();
                    const gain = audioCtx.createGain();
                    osc.type = 'sine';
                    osc.frequency.setValueAtTime(freq, now + idx * 0.06);
                    gain.gain.setValueAtTime(0.12, now + idx * 0.06);
                    gain.gain.exponentialRampToValueAtTime(0.01, now + idx * 0.06 + 0.2);
                    osc.connect(gain);
                    gain.connect(audioCtx.destination);
                    osc.start(now + idx * 0.06);
                    osc.stop(now + idx * 0.06 + 0.2);
                });
                break;
            }
        }
    }
};

// Particle Effects Generator
function spawnParticles(x, y, count, color, type = 'dust') {
    for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = Math.random() * 2.5 + 0.8;
        let size = Math.random() * 3.5 + 1.5;
        let maxLife = Math.random() * 200 + 200; // ms
        let vx = Math.cos(angle) * speed;
        let vy = Math.sin(angle) * speed;

        if (type === 'dash') {
            vx *= 2.2;
            vy *= 2.2;
            size = Math.random() * 4.5 + 2.5;
            maxLife = Math.random() * 300 + 150;
        } else if (type === 'knockback') {
            vx *= 2.8;
            vy *= 2.8;
            size = Math.random() * 5.5 + 2.5;
            maxLife = Math.random() * 350 + 250;
        } else if (type === 'freezeTrigger') {
            color = '#97E5EF';
            size = Math.random() * 4.5 + 2;
            maxLife = Math.random() * 500 + 250;
        } else if (type === 'springTrigger') {
            color = '#2ECC71';
            size = Math.random() * 5.5 + 2;
        } else if (type === 'glueTrigger') {
            color = '#F39C12';
            size = Math.random() * 6.5 + 3.5;
        } else if (type === 'teleportTrigger') {
            color = '#9B59B6';
            size = Math.random() * 4.5 + 2;
        } else if (type === 'boxHit') {
            vx *= 1.8;
            vy *= 1.8;
        }

        particles.push({
            x, y,
            vx, vy,
            color,
            size,
            life: maxLife,
            maxLife
        });
    }
}

// Check if mobile device
function detectMobile() {
    isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) 
               || (window.innerWidth <= 900);
}

// Join screen click handler
joinBtn.addEventListener('click', () => {
    sounds.init();
    const name = usernameInput.value.trim();
    const room = roomInput.value.trim().toUpperCase();

    if (!name) {
        alert('請輸入你的暱稱！');
        return;
    }

    // Connect to room
    socket.emit('joinRoom', { roomId: room, name: name });
    
    // Save username locally
    localStorage.setItem('gravity_royale_username', name);

    // Transition screens
    joinScreen.classList.remove('active');
    joinScreen.classList.add('hidden');
    gameScreen.classList.remove('hidden');

    resizeCanvas();

    // Init mobile controls if detected
    detectMobile();
    if (isMobile) {
        joystick = new VirtualJoystick('joystick-zone');
        mobileControls.classList.remove('hidden');
    }
});

// Auto-fill username
const savedName = localStorage.getItem('gravity_royale_username');
if (savedName) {
    usernameInput.value = savedName;
}

// Resize canvas listener
window.addEventListener('resize', resizeCanvas);
function resizeCanvas() {
    if (canvas) {
        const container = canvas.parentElement;
        canvas.width = container.clientWidth;
        canvas.height = container.clientHeight;
    }
}

// Keyboard input mapping
window.addEventListener('keydown', (e) => {
    if (gameScreen.classList.contains('hidden')) return;
    
    const key = e.key;
    if (key === 'w' || key === 'W' || key === 'ArrowUp') keys.w = true;
    if (key === 'a' || key === 'A' || key === 'ArrowLeft') keys.a = true;
    if (key === 's' || key === 'S' || key === 'ArrowDown') keys.s = true;
    if (key === 'd' || key === 'D' || key === 'ArrowRight') keys.d = true;
    
    if (key === ' ') {
        dashTriggered = true;
        e.preventDefault();
    }
    if (key === 'e' || key === 'E') {
        placeTrapTriggered = true;
    }
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(key)) {
        e.preventDefault();
    }
});

window.addEventListener('keyup', (e) => {
    const key = e.key;
    if (key === 'w' || key === 'W' || key === 'ArrowUp') keys.w = false;
    if (key === 'a' || key === 'A' || key === 'ArrowLeft') keys.a = false;
    if (key === 's' || key === 'S' || key === 'ArrowDown') keys.s = false;
    if (key === 'd' || key === 'D' || key === 'ArrowRight') keys.d = false;
});

// Click to place trap
canvas.addEventListener('mousedown', (e) => {
    if (e.button === 0 && !isMobile) { // Left click on desktop places trap
        placeTrapTriggered = true;
    }
});

// Canvas touch to place trap on mobile (avoiding buttons)
canvas.addEventListener('touchstart', (e) => {
    if (isMobile) {
        const touch = e.touches[0];
        const target = touch.target;
        if (target === canvas) {
            placeTrapTriggered = true;
        }
    }
});

// Mobile button shoves/dashes
if (mobileShootBtn) {
    mobileShootBtn.addEventListener('touchstart', (e) => {
        e.preventDefault();
        dashTriggered = true;
    });
}

// Start Game request
startGameBtn.addEventListener('click', () => {
    socket.emit('startGame');
    document.activeElement.blur(); // Remove focus so keys work
});

// Host settings listener
botCountSelect.addEventListener('change', sendHostSettings);
maxPlayersSelect.addEventListener('change', sendHostSettings);
function sendHostSettings() {
    socket.emit('updateSettings', {
        botCount: parseInt(botCountSelect.value),
        maxPlayers: parseInt(maxPlayersSelect.value)
    });
}

// Trap/Skill selection binds (Disable changes after starting game)
document.querySelectorAll('.btn-trap').forEach(btn => {
    btn.addEventListener('click', () => {
        if (roomState !== 'LOBBY') return; // Cannot change skill during active match!
        
        document.querySelectorAll('.btn-trap').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        
        selectedTrapType = btn.getAttribute('data-trap');
        
        btn.blur();
        
        // Notify server immediately
        socket.emit('playerInput', { trapType: selectedTrapType });
    });
});

// Connection listener
socket.on('connect', () => {
    localSocketId = socket.id;
    console.log("Connected to room. ID:", localSocketId);
});

// Audio listeners from server
socket.on('sound', (type) => {
    sounds.play(type);
});

// Visual and knockback effects listeners from server
socket.on('effect', (eff) => {
    // Play synth sound
    sounds.play(eff.type);

    // Draw visual particles
    let pCount = 10;
    if (eff.type === 'knockback') pCount = 20;
    if (eff.type === 'shieldBreak') pCount = 25;
    if (eff.type === 'teleportTrigger') pCount = 15;
    spawnParticles(eff.x, eff.y, pCount, eff.color, eff.type);

    // Apply camera shake on impacts
    if (['knockback', 'boxHit', 'shieldBreak'].includes(eff.type)) {
        cameraShake = Math.max(cameraShake, eff.type === 'knockback' ? 14 : 9);
    }
});

// Trap placing sound/particle response
socket.on('trapPlaced', (trap) => {
    sounds.play('pickup');
    spawnParticles(trap.x, trap.y, 8, '#ffffff', 'dust');
});

// Flashing announcements
socket.on('announcement', (msg) => {
    announcementMsg = msg;
    announcementTimer = 180; // 3 seconds at 60 FPS
});

// Game state sync
socket.on('gameState', (data) => {
    serverData = data;
    roomState = data.state;
    displayRoomId.textContent = data.roomId || roomInput.value.trim().toUpperCase() || 'DEFAULT';

    const playersArr = Object.values(data.players);
    onlineCount.textContent = playersArr.length;

    // Roster rendering
    rosterList.innerHTML = '';
    
    // Sort players (me first, then alphabetical)
    playersArr.sort((a, b) => {
        if (a.id === localSocketId) return -1;
        if (b.id === localSocketId) return 1;
        return a.name.localeCompare(b.name);
    });

    playersArr.forEach(p => {
        const item = document.createElement('div');
        item.className = `roster-item ${p.id === localSocketId ? 'me' : ''}`;
        if (!p.isAlive) item.style.opacity = '0.4';
        
        const nameWrap = document.createElement('div');
        nameWrap.className = 'player-name-wrapper';
        
        const dot = document.createElement('span');
        dot.className = 'player-dot';
        dot.style.background = p.color;
        
        const nameText = document.createTextNode(p.name + (p.id === localSocketId ? ' (你)' : ''));
        nameWrap.appendChild(dot);
        nameWrap.appendChild(nameText);

        const badge = document.createElement('span');
        badge.className = 'badge human';
        badge.textContent = p.isBot ? '🤖 BOT' : (p.isAlive ? '🏃 活著' : '💀 死亡');
        if (!p.isAlive) badge.style.borderColor = '#ff007f';

        item.appendChild(nameWrap);
        item.appendChild(badge);
        rosterList.appendChild(item);
    });

    const localPlayer = data.players[localSocketId];

    // Host setting panel state
    if (localPlayer && localPlayer.isHost && roomState === 'LOBBY') {
        hostSettingsPanel.classList.remove('hidden');
    } else {
        hostSettingsPanel.classList.add('hidden');
    }

    // Sync dropdown selections programmatically without firing 'change' loop
    if (data.settings) {
        botCountSelect.value = data.settings.botCount;
        maxPlayersSelect.value = data.settings.maxPlayers;
    }

    // Start Button Display
    if (roomState === 'LOBBY' && localPlayer && localPlayer.isHost) {
        startGameBtn.classList.remove('hidden');
    } else {
        startGameBtn.classList.add('hidden');
    }

    // Disable skill selector UI container when playing
    const trapSelectorBox = document.querySelector('.trap-selector-box');
    if (trapSelectorBox) {
        if (roomState === 'LOBBY') {
            trapSelectorBox.style.opacity = '1';
            trapSelectorBox.style.pointerEvents = 'auto';
        } else {
            trapSelectorBox.style.opacity = '0.5';
            trapSelectorBox.style.pointerEvents = 'none';
        }
    }

    // Alive players counts
    const alivePlayersCount = playersArr.filter(p => p.isAlive).length;
    hudHumans.textContent = alivePlayersCount;

    // HUD settings
    if (roomState === 'LOBBY') {
        hudStatus.textContent = '等待玩家加入...';
        hudTimer.textContent = '--';
        endOverlay.classList.add('hidden');
        if (endCountdownInterval) {
            clearInterval(endCountdownInterval);
            endCountdownInterval = null;
        }
    } else if (roomState === 'PLAYING') {
        hudStatus.textContent = `生存戰 ‧ 階段 ${data.zone.shrinkStage + 1}`;
        // Calculate remaining shrink time
        const shrinkStages = [15000, 15000, 12000, 10000, 15000];
        const delays = [15000, 12000, 10000, 8000, 8000];
        const currentStage = shrinkStages[data.zone.shrinkStage] || 10000;
        const currentDelay = delays[data.zone.shrinkStage] || 8000;
        
        hudTimer.textContent = `毒圈收縮中`;
        endOverlay.classList.add('hidden');
        if (endCountdownInterval) {
            clearInterval(endCountdownInterval);
            endCountdownInterval = null;
        }
    } else if (roomState === 'ENDED') {
        hudStatus.textContent = '戰局結束！';
        hudTimer.textContent = '0';

        // End Game overlays
        endOverlay.classList.remove('hidden');
        if (data.winner) {
            winnerAnnouncement.textContent = `🎉 倖存者 ${data.winner.name} 獲勝！`;
            winnerAnnouncement.style.color = data.winner.color;
        } else {
            winnerAnnouncement.textContent = `☠️ 無人生還，全軍覆沒！`;
            winnerAnnouncement.style.color = '#ff007f';
        }

        // Trigger local 8s reset countdown if not running
        if (!endCountdownInterval) {
            localEndCountdown = 8;
            restartCountdown.textContent = localEndCountdown;
            endCountdownInterval = setInterval(() => {
                localEndCountdown--;
                if (localEndCountdown < 0) localEndCountdown = 0;
                restartCountdown.textContent = localEndCountdown;
            }, 1000);
        }
    }

    // HUD Bars & Cooldowns update
    if (localPlayer) {
        // HP bar
        hudHpFill.style.width = `${localPlayer.health}%`;
        hudHpVal.textContent = Math.round(localPlayer.health);

        // Energy (stamina) bar
        hudEnergyFill.style.width = `${localPlayer.stamina}%`;
        hudEnergyVal.textContent = Math.round(localPlayer.stamina);

        // Skill inventories
        const trapNames = {
            teleport: '瞬間移動 🌌',
            speed: '跑速變快 ⚡',
            freeze: '召喚冰牆 🧊',
            shockwave: '重力衝擊波 💥'
        };
        const activeTrapName = trapNames[localPlayer.selectedTrap || 'teleport'];
        hudTrapDisplay.textContent = `${activeTrapName} (x${localPlayer.trapsInventory})`;

        // Cooldown overlay
        cooldownFill.style.height = `${(localPlayer.dashCooldown / 1200) * 100}%`;
    }

    // Message Logs
    feedLogs.innerHTML = '';
    const recentLogs = data.logs.slice(-4);
    recentLogs.forEach(log => {
        const entry = document.createElement('div');
        entry.className = 'log-entry';
        entry.textContent = log.text;
        feedLogs.appendChild(entry);
    });
});

// Periodic Input Sending loop (40ms interval)
function sendInput() {
    if (gameScreen.classList.contains('hidden') || roomState !== 'PLAYING') return;

    let dx = 0;
    let dy = 0;

    if (!isMobile) {
        if (keys.w) dy -= 1;
        if (keys.s) dy += 1;
        if (keys.a) dx -= 1;
        if (keys.d) dx += 1;

        const len = Math.sqrt(dx * dx + dy * dy);
        if (len > 0) {
            dx /= len;
            dy /= len;
        }
    } else if (joystick) {
        dx = joystick.dx;
        dy = joystick.dy;
    }

    socket.emit('playerInput', {
        dx,
        dy,
        dash: dashTriggered,
        placeTrap: placeTrapTriggered,
        trapType: selectedTrapType
    });

    // Reset single-frame triggers
    dashTriggered = false;
    placeTrapTriggered = false;
}
setInterval(sendInput, 40);

// Rendering Game loops (60fps Canvas Loop)
function gameLoop() {
    requestAnimationFrame(gameLoop);

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const localP = serverData.players[localSocketId];
    if (!localP) {
        drawGridBg(0, 0);
        return;
    }

    // Apply Camera translation
    const cameraX = localP.x;
    const cameraY = localP.y;

    // Apply Screen Shake
    let shakeX = 0;
    let shakeY = 0;
    if (cameraShake > 0) {
        cameraShake *= 0.9;
        if (cameraShake < 0.5) cameraShake = 0;
        shakeX = (Math.random() - 0.5) * cameraShake;
        shakeY = (Math.random() - 0.5) * cameraShake;
    }

    ctx.save();
    ctx.translate(canvas.width / 2 + shakeX, canvas.height / 2 + shakeY);

    // Drawing Game Elements relative to camera
    const offsetX = -cameraX;
    const offsetY = -cameraY;

    drawGridBg(offsetX, offsetY);
    drawTraps(offsetX, offsetY);
    drawPowerups(offsetX, offsetY);
    drawBoxes(offsetX, offsetY);
    drawPlayers(offsetX, offsetY);
    drawParticles(offsetX, offsetY);
    drawToxicZoneMask(offsetX, offsetY);

    ctx.restore();

    // Overlays outside camera transform
    drawMinimap();
    drawAnnouncementBanner();
}

// Background Grid
function drawGridBg(offsetX, offsetY) {
    ctx.save();
    ctx.fillStyle = '#06080d';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.translate(offsetX, offsetY);
    ctx.strokeStyle = '#121724';
    ctx.lineWidth = 1;

    const gridSize = 60;
    const mapW = serverData.mapWidth || 1600;
    const mapH = serverData.mapHeight || 1600;

    for (let x = 0; x <= mapW; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, mapH);
        ctx.stroke();
    }
    for (let y = 0; y <= mapH; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(mapW, y);
        ctx.stroke();
    }

    // Draw Map Outer border
    ctx.strokeStyle = 'rgba(0, 255, 204, 0.4)';
    ctx.lineWidth = 5;
    ctx.strokeRect(0, 0, mapW, mapH);

    ctx.restore();
}

// Traps Drawing
function drawTraps(offsetX, offsetY) {
    ctx.save();
    ctx.translate(offsetX, offsetY);
    const now = Date.now();

    serverData.traps.forEach(trap => {
        ctx.save();
        if (trap.type === 'freeze') {
            ctx.strokeStyle = '#97E5EF';
            ctx.shadowBlur = 8;
            ctx.shadowColor = '#97E5EF';
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.arc(trap.x, trap.y, trap.radius, 0, Math.PI * 2);
            ctx.stroke();
            
            ctx.beginPath();
            for (let i = 0; i < 4; i++) {
                const angle = (i * Math.PI) / 4;
                ctx.moveTo(trap.x - Math.cos(angle) * trap.radius * 0.8, trap.y - Math.sin(angle) * trap.radius * 0.8);
                ctx.lineTo(trap.x + Math.cos(angle) * trap.radius * 0.8, trap.y + Math.sin(angle) * trap.radius * 0.8);
            }
            ctx.stroke();
        } else if (trap.type === 'spring') {
            ctx.strokeStyle = '#2ECC71';
            ctx.shadowBlur = 8;
            ctx.shadowColor = '#2ECC71';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(trap.x, trap.y, trap.radius, 0, Math.PI * 2);
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(trap.x, trap.y, trap.radius * 0.6, 0, Math.PI * 2);
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(trap.x, trap.y, trap.radius * 0.3, 0, Math.PI * 2);
            ctx.stroke();
        } else if (trap.type === 'glue') {
            ctx.fillStyle = 'rgba(243, 156, 18, 0.4)';
            ctx.strokeStyle = '#F39C12';
            ctx.lineWidth = 1.5;
            ctx.shadowBlur = 5;
            ctx.shadowColor = '#F39C12';
            ctx.beginPath();
            ctx.arc(trap.x, trap.y, trap.radius, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
        } else if (trap.type === 'teleport') {
            const rot = (now * 0.003) % (Math.PI * 2);
            ctx.strokeStyle = '#9B59B6';
            ctx.shadowBlur = 10;
            ctx.shadowColor = '#9B59B6';
            ctx.lineWidth = 2.5;
            
            ctx.save();
            ctx.translate(trap.x, trap.y);
            ctx.rotate(rot);
            ctx.beginPath();
            ctx.arc(0, 0, trap.radius, 0, Math.PI * 1.5);
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(0, 0, trap.radius * 0.65, Math.PI * 0.5, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
        } else if (trap.type === 'reverse') {
            const rot = (now * 0.004) % (Math.PI * 2);
            ctx.strokeStyle = '#E74C3C';
            ctx.shadowBlur = 8;
            ctx.shadowColor = '#E74C3C';
            ctx.lineWidth = 2.5;
            
            ctx.save();
            ctx.translate(trap.x, trap.y);
            ctx.rotate(rot);
            ctx.beginPath();
            ctx.arc(0, 0, trap.radius, 0, Math.PI * 0.5);
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(0, 0, trap.radius, Math.PI, Math.PI * 1.5);
            ctx.stroke();
            
            ctx.fillStyle = '#E74C3C';
            ctx.font = "900 11px sans-serif";
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('🔄', 0, 0);
            ctx.restore();
        }
        ctx.restore();
    });
    ctx.restore();
}

// Powerups Drawing
function drawPowerups(offsetX, offsetY) {
    ctx.save();
    ctx.translate(offsetX, offsetY);
    const now = Date.now();
    const pulse = Math.sin(now * 0.005) * 4;

    serverData.powerups.forEach(pw => {
        ctx.save();
        ctx.shadowBlur = 10 + pulse;
        
        if (pw.type === 'shield') {
            ctx.fillStyle = 'rgba(52, 152, 219, 0.2)';
            ctx.strokeStyle = '#3498DB';
            ctx.shadowColor = '#3498DB';
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.arc(pw.x, pw.y, pw.radius + pulse/2, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            
            ctx.fillStyle = '#3498DB';
            ctx.font = "900 11px sans-serif";
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('🛡️', pw.x, pw.y);
        } else if (pw.type === 'trap_pack') {
            ctx.fillStyle = 'rgba(241, 196, 15, 0.2)';
            ctx.strokeStyle = '#F1C40F';
            ctx.shadowColor = '#F1C40F';
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.arc(pw.x, pw.y, pw.radius + pulse/2, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            
            ctx.fillStyle = '#F1C40F';
            ctx.font = "900 11px sans-serif";
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('🔋', pw.x, pw.y);
        } else if (pw.type === 'boots') {
            ctx.fillStyle = 'rgba(46, 204, 113, 0.2)';
            ctx.strokeStyle = '#2ECC71';
            ctx.shadowColor = '#2ECC71';
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.arc(pw.x, pw.y, pw.radius + pulse/2, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            
            ctx.fillStyle = '#2ECC71';
            ctx.font = "900 11px sans-serif";
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('⚡', pw.x, pw.y);
        }
        ctx.restore();
    });
    ctx.restore();
}

// Boxes (Wood/Iron Obstacles)
function drawBoxes(offsetX, offsetY) {
    ctx.save();
    ctx.translate(offsetX, offsetY);

    serverData.boxes.forEach(box => {
        ctx.save();
        const r = box.radius;

        if (box.type === 'wood') {
            ctx.fillStyle = '#8B5A2B';
            ctx.strokeStyle = '#5C3A21';
            ctx.lineWidth = 3;
            
            ctx.beginPath();
            ctx.arc(box.x, box.y, r, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();

            ctx.strokeRect(box.x - r * 0.6, box.y - r * 0.6, r * 1.2, r * 1.2);
            
            ctx.beginPath();
            ctx.moveTo(box.x - r * 0.6, box.y - r * 0.6);
            ctx.lineTo(box.x + r * 0.6, box.y + r * 0.6);
            ctx.moveTo(box.x + r * 0.6, box.y - r * 0.6);
            ctx.lineTo(box.x - r * 0.6, box.y + r * 0.6);
            ctx.stroke();
        } else if (box.type === 'ice') {
            // Ice Wall obstacle
            ctx.fillStyle = 'rgba(151, 229, 239, 0.7)';
            ctx.strokeStyle = '#00f0ff';
            ctx.lineWidth = 3;
            ctx.shadowBlur = 12;
            ctx.shadowColor = '#00f0ff';
            
            ctx.beginPath();
            ctx.arc(box.x, box.y, r, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();

            // Inner cracks
            ctx.shadowBlur = 0;
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(box.x - r * 0.5, box.y - r * 0.5);
            ctx.lineTo(box.x + r * 0.3, box.y + r * 0.3);
            ctx.moveTo(box.x + r * 0.4, box.y - r * 0.2);
            ctx.lineTo(box.x - r * 0.4, box.y + r * 0.5);
            ctx.stroke();
        } else {
            // Iron crate
            ctx.fillStyle = '#34495E';
            ctx.strokeStyle = '#2C3E50';
            ctx.lineWidth = 3;
            
            if (box.slideSpeed > 2.5) {
                ctx.strokeStyle = '#ff007f';
                ctx.shadowBlur = 12;
                ctx.shadowColor = '#ff007f';
                if (Math.random() < 0.2) {
                    spawnParticles(box.x, box.y, 1, '#ff007f', 'dust');
                }
            }
            
            ctx.beginPath();
            ctx.arc(box.x, box.y, r, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();

            // Hazard stripe highlights
            ctx.save();
            ctx.beginPath();
            ctx.arc(box.x, box.y, r - 3, 0, Math.PI * 2);
            ctx.clip();
            ctx.strokeStyle = '#F1C40F';
            ctx.lineWidth = 4;
            ctx.beginPath();
            for (let stripeOffset = -r; stripeOffset < r * 2; stripeOffset += 10) {
                ctx.moveTo(box.x - r + stripeOffset, box.y - r);
                ctx.lineTo(box.x + r + stripeOffset, box.y + r);
            }
            ctx.stroke();
            ctx.restore();
            
            ctx.strokeStyle = box.slideSpeed > 2.5 ? '#ff007f' : '#7F8C8D';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(box.x, box.y, r, 0, Math.PI * 2);
            ctx.stroke();
        }
        ctx.restore();
    });
    ctx.restore();
}

// Players (Self, enemies, bots)
function drawPlayers(offsetX, offsetY) {
    ctx.save();
    ctx.translate(offsetX, offsetY);

    Object.values(serverData.players).forEach(p => {
        if (!p.isAlive) return;

        const r = p.radius;
        const now = Date.now();

        // Stunned status stars
        const isStunned = now < p.stunnedUntil;
        const isFrozen = now < p.frozenUntil;
        const isSlowed = now < p.slowedUntil;

        // Player custom neon shadow
        ctx.save();
        ctx.shadowBlur = p.isDashing ? 18 : 10;
        ctx.shadowColor = p.color;
        
        ctx.fillStyle = 'rgba(13, 17, 28, 0.9)';
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 3.5;

        // Main body circle
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.restore();

        // Hands pointing direction (Uses persistent server-calculated facing angle)
        const angle = p.angle || 0;

        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(angle);
        ctx.fillStyle = p.color;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5;

        const handReach = p.isDashing ? 15 : 6;
        // Left hand
        ctx.beginPath();
        ctx.arc(r + handReach, -8, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        // Right hand
        ctx.beginPath();
        ctx.arc(r + handReach, 8, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.restore();

        // Shield bubble
        if (p.shieldCount > 0) {
            ctx.save();
            ctx.strokeStyle = '#3498DB';
            ctx.lineWidth = 3;
            ctx.shadowBlur = 10;
            ctx.shadowColor = '#3498DB';
            ctx.beginPath();
            ctx.arc(p.x, p.y, r + 5, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
        }

        // Frozen ice overlay
        if (isFrozen) {
            ctx.save();
            ctx.fillStyle = 'rgba(151, 229, 239, 0.55)';
            ctx.strokeStyle = '#00f0ff';
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.rect(p.x - r - 2, p.y - r - 2, r * 2 + 4, r * 2 + 4);
            ctx.fill();
            ctx.stroke();
            ctx.restore();
        }

        // Slowed indicator
        if (isSlowed) {
            ctx.save();
            ctx.fillStyle = '#F39C12';
            ctx.font = "900 12px sans-serif";
            ctx.fillText('🕸️', p.x + r - 2, p.y + r + 2);
            ctx.restore();
        }

        // Reversed controls indicator
        const isReversed = now < p.reversedUntil;
        if (isReversed) {
            ctx.save();
            ctx.fillStyle = '#E74C3C';
            ctx.font = "900 12px sans-serif";
            ctx.fillText('🌀', p.x - r - 2, p.y + r + 2);
            ctx.restore();
        }

        // Stunned visual stars
        if (isStunned) {
            ctx.save();
            ctx.fillStyle = '#F1C40F';
            ctx.font = '10px sans-serif';
            ctx.textAlign = 'center';
            const starRot = (now * 0.005) % (Math.PI * 2);
            const sx = p.x + Math.cos(starRot) * (r + 4);
            const sy = p.y - r - 8 + Math.sin(starRot) * 2;
            ctx.fillText('⭐', sx, sy);
            ctx.restore();
        }

        // HP bar above head
        ctx.save();
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(p.x - 20, p.y - r - 10, 40, 4);
        ctx.fillStyle = '#2ECC71';
        ctx.fillRect(p.x - 20, p.y - r - 10, (p.health / 100) * 40, 4);
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 0.8;
        ctx.strokeRect(p.x - 20, p.y - r - 10, 40, 4);
        ctx.restore();

        // Label details (Name + Identity tags)
        ctx.fillStyle = '#ffffff';
        ctx.font = "bold 11px 'Orbitron', sans-serif";
        ctx.textAlign = 'center';
        const labelText = p.name + (p.id === localSocketId ? ' (你)' : '');
        ctx.fillText(labelText, p.x, p.y - r - 15);
    });

    ctx.restore();
}

// Particle updates and drawing
function drawParticles(offsetX, offsetY) {
    ctx.save();
    ctx.translate(offsetX, offsetY);
    for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.life -= 16.67; // delta frame calculation
        
        const alpha = Math.max(0, p.life / p.maxLife);
        ctx.fillStyle = p.color;
        ctx.globalAlpha = alpha;
        
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();

        if (p.life <= 0) {
            particles.splice(i, 1);
        }
    }
    ctx.restore();
}

// Toxic zone shrinking visual mask overlay
function drawToxicZoneMask(offsetX, offsetY) {
    if (!serverData.zone) return;

    ctx.save();
    ctx.translate(offsetX, offsetY);
    
    const zoneX = serverData.zone.x;
    const zoneY = serverData.zone.y;
    const zoneRad = serverData.zone.radius;

    // Glowing border of the safe zone
    ctx.strokeStyle = '#ff007f';
    ctx.lineWidth = 4;
    ctx.shadowBlur = 18;
    ctx.shadowColor = '#ff007f';
    ctx.beginPath();
    ctx.arc(zoneX, zoneY, zoneRad, 0, Math.PI * 2);
    ctx.stroke();

    // Overlay full toxic zone outside using evenodd rule
    ctx.shadowBlur = 0; // reset glow shadow
    ctx.fillStyle = 'rgba(255, 0, 127, 0.18)';
    
    ctx.beginPath();
    const mapW = serverData.mapWidth || 1600;
    const mapH = serverData.mapHeight || 1600;
    ctx.rect(-300, -300, mapW + 600, mapH + 600);
    ctx.arc(zoneX, zoneY, zoneRad, 0, Math.PI * 2, true); // counter-clockwise cutout
    ctx.fill('evenodd');
    
    ctx.restore();
}

// Circular minimap renderer
function drawMinimap() {
    if (!minimapCanvas || roomState === 'LOBBY') return;
    const mCtx = minimapCanvas.getContext('2d');
    const mRad = minimapCanvas.width / 2;
    const mCenter = mRad;

    mCtx.clearRect(0, 0, minimapCanvas.width, minimapCanvas.height);
    mCtx.save();

    // Clip to circle boundary
    mCtx.beginPath();
    mCtx.arc(mCenter, mCenter, mRad - 2, 0, Math.PI * 2);
    mCtx.clip();

    // Background color
    mCtx.fillStyle = '#06080d';
    mCtx.fillRect(0, 0, minimapCanvas.width, minimapCanvas.height);

    // Map scaling
    const mapW = serverData.mapWidth || 1600;
    const scale = (mRad * 2 - 4) / mapW;

    if (serverData.zone) {
        const zx = serverData.zone.x * scale;
        const zy = serverData.zone.y * scale;
        const zr = serverData.zone.radius * scale;

        // Draw toxic magenta layer
        mCtx.fillStyle = 'rgba(255, 0, 127, 0.25)';
        mCtx.fillRect(0, 0, minimapCanvas.width, minimapCanvas.height);

        // Erase safe circle cutout
        mCtx.save();
        mCtx.globalCompositeOperation = 'destination-out';
        mCtx.beginPath();
        mCtx.arc(zx, zy, zr, 0, Math.PI * 2);
        mCtx.fill();
        mCtx.restore();

        // Safe zone neon border
        mCtx.strokeStyle = '#ff007f';
        mCtx.lineWidth = 1.5;
        mCtx.beginPath();
        mCtx.arc(zx, zy, zr, 0, Math.PI * 2);
        mCtx.stroke();
    }

    // Players dots
    Object.values(serverData.players).forEach(p => {
        if (!p.isAlive) return;
        const px = p.x * scale;
        const py = p.y * scale;

        if (p.id === localSocketId) {
            mCtx.fillStyle = '#00f0ff'; // Cyan for self
            mCtx.beginPath();
            mCtx.arc(px, py, 3, 0, Math.PI * 2);
            mCtx.fill();
        } else if (p.isBot) {
            mCtx.fillStyle = '#7F8C8D'; // Gray for bots
            mCtx.beginPath();
            mCtx.arc(px, py, 2, 0, Math.PI * 2);
            mCtx.fill();
        } else {
            mCtx.fillStyle = '#ff007f'; // Magenta for other players
            mCtx.beginPath();
            mCtx.arc(px, py, 2, 0, Math.PI * 2);
            mCtx.fill();
        }
    });

    mCtx.restore();

    // Map outer border outline
    mCtx.strokeStyle = 'rgba(0, 255, 204, 0.4)';
    mCtx.lineWidth = 2;
    mCtx.beginPath();
    mCtx.arc(mCenter, mCenter, mRad - 1, 0, Math.PI * 2);
    mCtx.stroke();
}

// Temporary Flashing Notification text
function drawAnnouncementBanner() {
    if (announcementTimer > 0 && roomState === 'PLAYING') {
        announcementTimer--;
        ctx.save();
        ctx.font = "900 22px 'Orbitron', sans-serif";
        ctx.fillStyle = '#ff007f';
        ctx.strokeStyle = '#080a10';
        ctx.lineWidth = 5;
        ctx.textAlign = 'center';
        ctx.shadowBlur = 10;
        ctx.shadowColor = '#ff007f';
        
        ctx.strokeText(announcementMsg, canvas.width / 2, 120);
        ctx.fillText(announcementMsg, canvas.width / 2, 120);
        ctx.restore();
    }
}

// Launch animation frame loop
requestAnimationFrame(gameLoop);

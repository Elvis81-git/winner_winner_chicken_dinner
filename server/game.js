const MAP_WIDTH = 1600;
const MAP_HEIGHT = 1600;
const TICK_RATE = 60; // 60 Ticks per second for high-precision physics
const TICK_INTERVAL = 1000 / TICK_RATE;

// PLAYER COLORS (Neon theme)
const PLAYER_COLORS = [
  '#00f0ff', // Neon Cyan
  '#ff007f', // Neon Magenta
  '#39ff14', // Neon Green
  '#fffb00', // Neon Yellow
  '#b10dc9', // Purple
  '#ff851b', // Orange
  '#e67e22', // Dark Orange
  '#f012be'  // Pink
];

// Helper to generate IDs
function generateId() {
  return Math.random().toString(36).substring(2, 9);
}

class GameRoom {
  constructor(roomId, io) {
    this.roomId = roomId;
    this.io = io;
    this.players = {}; // socketId -> player
    this.boxes = [];
    this.traps = [];
    this.powerups = [];
    this.state = 'LOBBY'; // LOBBY, PLAYING, ENDED
    this.winner = null;
    this.logs = [];
    
    // Default Host settings
    this.settings = {
      maxPlayers: 8,
      botCount: 0
    };
    
    // Toxic zone
    this.zone = {
      x: MAP_WIDTH / 2,
      y: MAP_HEIGHT / 2,
      radius: MAP_WIDTH * 0.8,
      targetRadius: MAP_WIDTH * 0.8,
      shrinkStage: 0,
      damage: 1,
      lastShrinkTime: 0
    };

    this.lastTickTime = Date.now();
    this.intervalId = null;
  }

  addPlayer(socketId, name) {
    const activeColors = Object.values(this.players).map(p => p.color);
    const color = PLAYER_COLORS.find(c => !activeColors.includes(c)) || PLAYER_COLORS[Math.floor(Math.random() * PLAYER_COLORS.length)];
    
    // Host is the first player who joins
    const isRoomHost = Object.keys(this.players).filter(id => !this.players[id].isBot).length === 0;

    this.players[socketId] = {
      id: socketId,
      name: name || `生存者_${generateId().substring(0, 3)}`,
      x: 100 + Math.random() * (MAP_WIDTH - 200),
      y: 100 + Math.random() * (MAP_HEIGHT - 200),
      vx: 0,
      vy: 0,
      dx: 0,
      dy: 0,
      angle: 0,
      radius: 20,
      speed: 4,
      stamina: 100,
      maxStamina: 100,
      dashCooldown: 0,
      dashActiveTimer: 0,
      isDashing: false,
      stunnedUntil: 0,
      slowedUntil: 0,
      frozenUntil: 0,
      reversedUntil: 0,
      shieldCount: 0,
      trapsInventory: 3, // Start with 3 skill uses
      selectedTrap: 'teleport',
      speedBoostUntil: 0,
      skillRegenTimer: 12000,
      health: 100,
      isAlive: true,
      isBot: false,
      color: color,
      isHost: isRoomHost
    };

    this.addLog(`${this.players[socketId].name} 進入了大廳`);

    // Start tick loop if not active
    if (!this.intervalId) {
      this.lastTickTime = Date.now();
      this.intervalId = setInterval(() => this.tick(), TICK_INTERVAL);
    }

    this.broadcastState();
  }

  removePlayer(socketId) {
    if (this.players[socketId]) {
      const name = this.players[socketId].name;
      const wasHost = this.players[socketId].isHost;
      delete this.players[socketId];
      
      this.addLog(`${name} 離開了戰區`);

      // Transfer host if host left
      if (wasHost) {
        const remainingHumanIds = Object.keys(this.players).filter(id => !this.players[id].isBot);
        if (remainingHumanIds.length > 0) {
          this.players[remainingHumanIds[0]].isHost = true;
          this.addLog(`${this.players[remainingHumanIds[0]].name} 成為了新房主`);
        }
      }

      if (this.state === 'PLAYING') {
        this.checkGameOver();
      }

      // Stop loop if no players left
      if (Object.keys(this.players).length === 0) {
        this.stop();
      } else {
        this.broadcastState();
      }
    }
  }

  updatePlayerInput(socketId, input) {
    const player = this.players[socketId];
    if (player && player.isAlive) {
      const now = Date.now();
      const isReversed = now < player.reversedUntil;

      player.dx = input.dx || 0;
      player.dy = input.dy || 0;
      
      if (isReversed) {
        player.dx = -player.dx;
        player.dy = -player.dy;
      }
      
      if (player.dx !== 0 || player.dy !== 0) {
        player.angle = Math.atan2(player.dy, player.dx);
      }

      if (input.trapType) {
        player.selectedTrap = input.trapType;
      }
      
      // Handle Dash trigger
      if (input.dash) {
        this.performDash(player);
      }

      // Handle Trap Placement trigger
      if (input.placeTrap) {
        this.castSkill(socketId);
      }
    }
  }

  // Lobby Settings update
  updateSettings(settings) {
    this.settings.botCount = Math.min(7, Math.max(0, parseInt(settings.botCount) || 0));
    this.settings.maxPlayers = Math.min(8, Math.max(2, parseInt(settings.maxPlayers) || 8));
    this.broadcastState();
  }

  addLog(msg) {
    this.logs.push({ text: msg, time: Date.now() });
    if (this.logs.length > 20) this.logs.shift();
  }

  initGame() {
    this.state = 'PLAYING';
    this.winner = null;
    this.boxes = [];
    this.traps = [];
    this.powerups = [];
    this.logs = [];

    this.zone.radius = MAP_WIDTH * 0.7; // Start directly at Stage 2 size (0.7 instead of 0.8)
    this.zone.targetRadius = MAP_WIDTH * 0.7;
    this.zone.shrinkStage = 0;
    this.zone.damage = 1;
    this.zone.lastShrinkTime = Date.now();

    // Reposition human players
    const humanPlayers = Object.values(this.players).filter(p => !p.isBot);
    humanPlayers.forEach((p, idx) => {
      const angle = (idx / humanPlayers.length) * Math.PI * 2;
      const spawnRadius = (MAP_WIDTH / 2) * 0.4;
      p.x = MAP_WIDTH / 2 + Math.cos(angle) * spawnRadius;
      p.y = MAP_HEIGHT / 2 + Math.sin(angle) * spawnRadius;
      p.vx = 0;
      p.vy = 0;
      p.dx = 0;
      p.dy = 0;
      p.angle = angle;
      p.health = 100;
      p.stamina = 100;
      p.isAlive = true;
      p.shieldCount = 0;
      p.trapsInventory = 3;
      p.speedBoostUntil = 0;
      p.stunnedUntil = 0;
      p.slowedUntil = 0;
      p.frozenUntil = 0;
      p.reversedUntil = 0;
    });

    // Remove old bots
    Object.keys(this.players).forEach(id => {
      if (this.players[id].isBot) {
        delete this.players[id];
      }
    });

    // Add new bots
    for (let i = 0; i < this.settings.botCount; i++) {
      const botId = `bot_${generateId()}`;
      const angle = Math.random() * Math.PI * 2;
      const spawnRadius = (MAP_WIDTH / 2) * 0.5;

      this.players[botId] = {
        id: botId,
        name: `🤖 Bot ${i + 1}`,
        x: MAP_WIDTH / 2 + Math.cos(angle) * spawnRadius,
        y: MAP_HEIGHT / 2 + Math.sin(angle) * spawnRadius,
        vx: 0,
        vy: 0,
        dx: 0,
        dy: 0,
        angle: angle,
        radius: 20,
        speed: 3.5,
        stamina: 100,
        maxStamina: 100,
        dashCooldown: 0,
        dashActiveTimer: 0,
        isDashing: false,
        stunnedUntil: 0,
        slowedUntil: 0,
        frozenUntil: 0,
        reversedUntil: 0,
        shieldCount: 0,
        trapsInventory: 3,
        selectedTrap: ['teleport', 'speed', 'freeze', 'shockwave'][Math.floor(Math.random() * 4)],
        speedBoostUntil: 0,
        skillRegenTimer: 12000,
        health: 100,
        isAlive: true,
        isBot: true,
        color: '#7F8C8D',
        isHost: false,
        
        // Bot AI states
        aiState: 'wander',
        aiTargetId: null,
        aiTimer: 0,
        aiWanderAngle: Math.random() * Math.PI * 2
      };
    }

    // Spawn boxes (Wood / Iron circular crates)
    const boxCount = 30;
    for (let i = 0; i < boxCount; i++) {
      const isIron = Math.random() < 0.3; // 30% iron boxes
      this.boxes.push({
        id: `box_${generateId()}`,
        x: 150 + Math.random() * (MAP_WIDTH - 300),
        y: 150 + Math.random() * (MAP_HEIGHT - 300),
        vx: 0,
        vy: 0,
        radius: isIron ? 24 : 20,
        mass: isIron ? 4.0 : 1.0,
        type: isIron ? 'iron' : 'wood',
        slideSpeed: 0
      });
    }

    // Spawn items
    this.spawnPowerups(10);
    this.spawnTraps(12); // Spawn 12 traps randomly across map

    this.lastTickTime = Date.now();
    this.addLog("☠️ 大逃殺開始！用衝撞推開對手，存活至最後！");
    this.io.to(this.roomId).emit('sound', 'start');
  }

  spawnPowerups(count) {
    const types = ['shield', 'trap_pack', 'boots'];
    for (let i = 0; i < count; i++) {
      const type = types[Math.floor(Math.random() * types.length)];
      this.powerups.push({
        id: `pw_${generateId()}`,
        x: 100 + Math.random() * (MAP_WIDTH - 200),
        y: 100 + Math.random() * (MAP_HEIGHT - 200),
        type: type,
        radius: 12
      });
    }
  }

  spawnTraps(count) {
    const types = ['freeze', 'glue', 'reverse'];
    for (let i = 0; i < count; i++) {
      const type = types[Math.floor(Math.random() * types.length)];
      this.traps.push({
        id: `trap_${generateId()}`,
        x: 150 + Math.random() * (MAP_WIDTH - 300),
        y: 150 + Math.random() * (MAP_HEIGHT - 300),
        type: type,
        radius: 15
      });
    }
  }

  // Dash Shove mechanics
  performDash(player) {
    if (player.dashCooldown > 0 || player.stamina < 30 || !player.isAlive) return;

    player.stamina -= 30;
    player.isDashing = true;
    player.dashActiveTimer = 180; // 180ms dash
    player.dashCooldown = 1200; // 1.2s cooldown

    let angle = Math.atan2(player.dy || 0, player.dx || 0);
    if ((player.dx || 0) === 0 && (player.dy || 0) === 0) {
      angle = player.isBot ? player.aiWanderAngle : 0;
    }

    player.vx = Math.cos(angle) * 550;
    player.vy = Math.sin(angle) * 550;

    this.io.to(this.roomId).emit('effect', {
      type: 'dash',
      x: player.x,
      y: player.y,
      color: player.color
    });
  }

  // Cast Character Skill
  castSkill(socketId) {
    const player = this.players[socketId];
    if (!player || !player.isAlive || player.trapsInventory <= 0) return;

    // Check if player is frozen or stunned (cannot cast skills)
    const now = Date.now();
    if (now < player.frozenUntil || now < player.stunnedUntil) return;

    const skillType = player.selectedTrap || 'teleport';

    if (skillType === 'teleport') {
      // 1. Blink forward in facing direction
      const angle = player.angle || 0;
      const blinkDist = 150;
      player.x += Math.cos(angle) * blinkDist;
      player.y += Math.sin(angle) * blinkDist;
      
      // Clamp boundaries
      player.x = Math.max(player.radius, Math.min(MAP_WIDTH - player.radius, player.x));
      player.y = Math.max(player.radius, Math.min(MAP_HEIGHT - player.radius, player.y));

      player.trapsInventory--;
      this.io.to(this.roomId).emit('effect', { type: 'teleportTrigger', x: player.x, y: player.y, color: '#9B59B6' });
      this.addLog(`🌀 ${player.name} 使用了瞬間移動！`);
    } 
    else if (skillType === 'speed') {
      // 2. Speed Boost
      player.speedBoostUntil = now + 3000; // 3 seconds speed boost
      player.trapsInventory--;
      this.io.to(this.roomId).emit('effect', { type: 'springTrigger', x: player.x, y: player.y, color: '#2ECC71' }); // reuse spring/speed sound and green particles
      this.addLog(`⚡ ${player.name} 啟動了加速技能！`);
    } 
    else if (skillType === 'freeze') {
      // 3. Spawn ice wall (5 blocks perpendicular to player's facing direction, flying outward)
      const angle = player.angle || 0;
      const spawnDistance = player.radius + 22 + 5; // Spawn just in front of player to avoid trapping caster
      const centerX = player.x + Math.cos(angle) * spawnDistance;
      const centerY = player.y + Math.sin(angle) * spawnDistance;
      const perpAngle = angle + Math.PI / 2;

      // Calculate ice wall velocity (flies outward in facing direction)
      const wallSpeed = 3.0; // 180 pixels per second constant velocity
      const vx = Math.cos(angle) * wallSpeed;
      const vy = Math.sin(angle) * wallSpeed;

      for (let i = -2; i <= 2; i++) {
        let spawnX = centerX + Math.cos(perpAngle) * (i * 44);
        let spawnY = centerY + Math.sin(perpAngle) * (i * 44);

        // Clamp inside map boundaries
        spawnX = Math.max(22, Math.min(MAP_WIDTH - 22, spawnX));
        spawnY = Math.max(22, Math.min(MAP_HEIGHT - 22, spawnY));

        const iceBox = {
          id: `box_${generateId()}_${i}`,
          x: spawnX,
          y: spawnY,
          vx: vx,
          vy: vy,
          originalVx: vx,
          originalVy: vy,
          radius: 22,
          mass: 15.0, // extremely heavy, plows through obstacles
          type: 'ice',
          slideSpeed: wallSpeed,
          expiresAt: now + 1550 // melts in 1.55 seconds (approx 7 body lengths push)
        };
        this.boxes.push(iceBox);
      }
      player.trapsInventory--;

      this.io.to(this.roomId).emit('effect', { type: 'freezeTrigger', x: centerX, y: centerY, color: '#97E5EF' });
      this.addLog(`🧊 ${player.name} 召喚了冰牆，正向前飛去！`);
    } 
    else if (skillType === 'shockwave') {
      // 4. Gravitational Shockwave: push everyone in 250px radius away
      const range = 250;
      
      // Push opponents
      Object.values(this.players).forEach(p => {
        if (p.id === player.id || !p.isAlive) return;
        const d = Math.hypot(p.x - player.x, p.y - player.y);
        if (d < range) {
          const dx = p.x - player.x;
          const dy = p.y - player.y;
          const dist = Math.hypot(dx, dy);
          const nx = dx / (dist || 1);
          const ny = dy / (dist || 1);
          
          this.applyKnockback(player, p, nx, ny, now, 28.0); // Extreme push (increased from 15.0 to 28.0)
        }
      });

      // Push boxes
      this.boxes.forEach(box => {
        const d = Math.hypot(box.x - player.x, box.y - player.y);
        if (d < range) {
          const dx = box.x - player.x;
          const dy = box.y - player.y;
          const dist = Math.hypot(dx, dy);
          const nx = dx / (dist || 1);
          const ny = dy / (dist || 1);

          const pushForce = 100 / box.mass; // heavy push (increased from 35 to 100)
          box.vx = nx * pushForce;
          box.vy = ny * pushForce;
        }
      });

      player.trapsInventory--;
      this.io.to(this.roomId).emit('effect', { type: 'shieldBreak', x: player.x, y: player.y, color: '#ff007f' }); // shockwave effect visual
      this.io.to(this.roomId).emit('sound', 'infect'); // plays death/shockwave intense sound
      this.addLog(`💥 ${player.name} 施放了重力衝擊波，推開了周圍的所有物體與對手！`);
    }
  }

  tick() {
    const now = Date.now();
    const dt = (now - this.lastTickTime) / 1000;
    this.lastTickTime = now;

    if (this.state === 'PLAYING') {
      this.updateZone(now);
      this.updatePlayers(dt, now);
      this.updateBoxes(dt);
      this.handleCollisions(now);
      this.checkTraps(now);
      this.checkPowerups(now);

      if (this.powerups.length < 4 && Math.random() < 0.01) {
        this.spawnPowerups(2);
      }

      if (this.traps.length < 5 && Math.random() < 0.01) {
        this.spawnTraps(2);
      }

      this.checkGameOver();
    }

    this.broadcastState();
  }

  updateZone(now) {
    const zoneStages = [
      { size: MAP_WIDTH * 0.45, delay: 12000, shrinkTime: 15000, damage: 2 },
      { size: MAP_WIDTH * 0.25, delay: 10000, shrinkTime: 12000, damage: 4 },
      { size: MAP_WIDTH * 0.1, delay: 8000, shrinkTime: 10000, damage: 8 },
      { size: 0, delay: 8000, shrinkTime: 15000, damage: 15 }
    ];

    const currentStage = zoneStages[this.zone.shrinkStage];
    if (!currentStage) return;

    const timeElapsed = now - this.zone.lastShrinkTime;

    if (timeElapsed < currentStage.delay) {
      this.zone.targetRadius = currentStage.size;
    } else if (timeElapsed < currentStage.delay + currentStage.shrinkTime) {
      const progress = (timeElapsed - currentStage.delay) / currentStage.shrinkTime;
      const prevSize = this.zone.shrinkStage === 0 ? MAP_WIDTH * 0.8 : zoneStages[this.zone.shrinkStage - 1].size;
      this.zone.radius = prevSize - (prevSize - currentStage.size) * progress;
      this.zone.damage = currentStage.damage;

      if (Math.random() < 0.005) {
        this.io.to(this.roomId).emit('announcement', '⚠️ 毒圈正在收縮，請迅速前往安全區！');
      }
    } else {
      this.zone.radius = currentStage.size;
      this.zone.shrinkStage++;
      this.zone.lastShrinkTime = now;
      this.io.to(this.roomId).emit('announcement', `💀 毒圈收縮完畢！下一階段半徑: ${Math.round(zoneStages[this.zone.shrinkStage]?.size || 0)}`);
    }
  }

  updatePlayers(dt, now) {
    const playersArr = Object.values(this.players);
    playersArr.forEach(player => {
      if (!player.isAlive) return;

      const isStunned = now < player.stunnedUntil;
      const isFrozen = now < player.frozenUntil;
      const isSlowed = now < player.slowedUntil;

      // Update timers
      if (player.dashCooldown > 0) player.dashCooldown -= dt * 1000;
      if (player.dashActiveTimer > 0) {
        player.dashActiveTimer -= dt * 1000;
        if (player.dashActiveTimer <= 0) {
          player.isDashing = false;
        }
      }

      if (!player.isDashing && player.stamina < player.maxStamina) {
        player.stamina = Math.min(player.maxStamina, player.stamina + dt * 18);
      }

      // Bot AI
      if (player.isBot && !isFrozen && !isStunned) {
        this.updateBotAI(player, now);
      }

      // Skill Charges Passive Regeneration
      if (player.trapsInventory < 3) {
        if (player.skillRegenTimer === undefined) player.skillRegenTimer = 12000;
        player.skillRegenTimer -= dt * 1000;
        if (player.skillRegenTimer <= 0) {
          player.trapsInventory++;
          player.skillRegenTimer = 12000;
        }
      } else {
        player.skillRegenTimer = 12000;
      }

      // Physics
      let moveSpeed = player.speed * 60;
      if (now < player.speedBoostUntil) {
        moveSpeed *= 1.6; // 60% speed boost
      }

      let moveX = (player.dx || 0) * moveSpeed;
      let moveY = (player.dy || 0) * moveSpeed;

      if (isSlowed) {
        moveX *= 0.4;
        moveY *= 0.4;
      }

      moveX += player.vx;
      moveY += player.vy;

      const decay = Math.exp(-6 * dt);
      player.vx *= decay;
      player.vy *= decay;
      if (Math.abs(player.vx) < 5) player.vx = 0;
      if (Math.abs(player.vy) < 5) player.vy = 0;

      if (!isFrozen && !isStunned) {
        player.x += moveX * dt;
        player.y += moveY * dt;
      } else {
        player.x += player.vx * dt;
        player.y += player.vy * dt;
      }

      // Map limits
      player.x = Math.max(player.radius, Math.min(MAP_WIDTH - player.radius, player.x));
      player.y = Math.max(player.radius, Math.min(MAP_HEIGHT - player.radius, player.y));

      // Zone Damage
      const distToCenter = Math.hypot(player.x - this.zone.x, player.y - this.zone.y);
      if (distToCenter > this.zone.radius) {
        player.health -= this.zone.damage * dt * 10;
        if (player.health <= 0) {
          player.health = 0;
          player.isAlive = false;
          this.addLog(`💀 ${player.name} 死在毒氣中`);
          this.io.to(this.roomId).emit('sound', 'infect'); // plays death sound
        }
      }
    });
  }

  updateBotAI(bot, now) {
    bot.aiTimer -= TICK_INTERVAL;

    const distToCenter = Math.hypot(bot.x - this.zone.x, bot.y - this.zone.y);
    const inDanger = distToCenter > bot.radius + this.zone.radius * 0.9;

    if (inDanger) {
      bot.aiState = 'flee_zone';
      const angle = Math.atan2(this.zone.y - bot.y, this.zone.x - bot.x);
      bot.dx = Math.cos(angle);
      bot.dy = Math.sin(angle);

      // Bot uses teleport or speed skill to flee danger
      if (bot.trapsInventory > 0 && Math.random() < 0.02) {
        if (bot.selectedTrap === 'teleport' || bot.selectedTrap === 'speed') {
          this.castSkill(bot.id);
        }
      }

      if (distToCenter > this.zone.radius && bot.stamina >= 30 && bot.dashCooldown <= 0) {
        this.performDash(bot);
      }
      return;
    }

    let nearestEnemy = null;
    let minEnemyDist = Infinity;
    let nearestPowerup = null;
    let minPowerupDist = Infinity;

    Object.values(this.players).forEach(p => {
      if (p.id === bot.id || !p.isAlive) return;
      const d = Math.hypot(p.x - bot.x, p.y - bot.y);
      if (d < minEnemyDist) {
        minEnemyDist = d;
        nearestEnemy = p;
      }
    });

    this.powerups.forEach(pw => {
      const d = Math.hypot(pw.x - bot.x, pw.y - bot.y);
      if (d < minPowerupDist) {
        minPowerupDist = d;
        nearestPowerup = pw;
      }
    });

    if (bot.aiTimer <= 0) {
      bot.aiTimer = 1000 + Math.random() * 2000;
      if (minEnemyDist < 250) {
        bot.aiState = 'target';
        bot.aiTargetId = nearestEnemy.id;
      } else if (minPowerupDist < 300) {
        bot.aiState = 'loot';
      } else {
        bot.aiState = 'wander';
        bot.aiWanderAngle = Math.random() * Math.PI * 2;
      }
    }

    if (bot.aiState === 'target' && nearestEnemy) {
      const angle = Math.atan2(nearestEnemy.y - bot.y, nearestEnemy.x - bot.x);
      bot.dx = Math.cos(angle);
      bot.dy = Math.sin(angle);

      if (minEnemyDist < 90 && bot.stamina >= 35 && bot.dashCooldown <= 0) {
        this.performDash(bot);
      }

      // Bot uses active skills in combat
      if (bot.trapsInventory > 0 && Math.random() < 0.03) {
        if (bot.selectedTrap === 'freeze' && minEnemyDist < 250) {
          this.castSkill(bot.id);
        } else if (bot.selectedTrap === 'speed' && minEnemyDist > 150) {
          this.castSkill(bot.id);
        } else if (bot.selectedTrap === 'teleport' && minEnemyDist > 200) {
          this.castSkill(bot.id);
        } else if (bot.selectedTrap === 'shockwave' && minEnemyDist < 160) {
          this.castSkill(bot.id);
        }
      }
    } else if (bot.aiState === 'loot' && nearestPowerup) {
      const angle = Math.atan2(nearestPowerup.y - bot.y, nearestPowerup.x - bot.x);
      bot.dx = Math.cos(angle);
      bot.dy = Math.sin(angle);
    } else {
      bot.dx = Math.cos(bot.aiWanderAngle);
      bot.dy = Math.sin(bot.aiWanderAngle);
      if (Math.random() < 0.02) {
        bot.aiWanderAngle += (Math.random() - 0.5) * 1.5;
      }
    }

    if (bot.dx !== 0 || bot.dy !== 0) {
      bot.angle = Math.atan2(bot.dy, bot.dx);
    }
  }

  updateBoxes(dt) {
    const now = Date.now();
    this.boxes = this.boxes.filter(box => {
      if (box.type === 'ice' && now > box.expiresAt) {
        this.io.to(this.roomId).emit('effect', { type: 'freezeTrigger', x: box.x, y: box.y, color: '#97E5EF' });
        return false;
      }
      return true;
    });

    this.boxes.forEach(box => {
      // Bypass friction decay for moving ice blocks to maintain constant velocity
      if (box.type === 'ice') {
        box.vx = box.originalVx;
        box.vy = box.originalVy;
      }

      box.x += box.vx * dt * 60;
      box.y += box.vy * dt * 60;
      
      if (box.type !== 'ice') {
        box.vx *= 0.92;
        box.vy *= 0.92;
      }
      box.slideSpeed = Math.hypot(box.vx, box.vy);

      if (box.x < box.radius) {
        box.x = box.radius;
        box.vx *= -0.5;
        if (box.type === 'ice') box.originalVx = box.vx;
      }
      if (box.x > MAP_WIDTH - box.radius) {
        box.x = MAP_WIDTH - box.radius;
        box.vx *= -0.5;
        if (box.type === 'ice') box.originalVx = box.vx;
      }
      if (box.y < box.radius) {
        box.y = box.radius;
        box.vy *= -0.5;
        if (box.type === 'ice') box.originalVy = box.vy;
      }
      if (box.y > MAP_HEIGHT - box.radius) {
        box.y = MAP_HEIGHT - box.radius;
        box.vy *= -0.5;
        if (box.type === 'ice') box.originalVy = box.vy;
      }
    });
  }

  handleCollisions(now) {
    const playersArr = Object.values(this.players).filter(p => p.isAlive);

    // Player vs Player
    for (let i = 0; i < playersArr.length; i++) {
      for (let j = i + 1; j < playersArr.length; j++) {
        const p1 = playersArr[i];
        const p2 = playersArr[j];

        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const dist = Math.hypot(dx, dy);
        const minDist = p1.radius + p2.radius;

        if (dist < minDist) {
          const overlap = minDist - dist;
          const nx = dx / (dist || 1);
          const ny = dy / (dist || 1);

          p1.x -= nx * overlap * 0.5;
          p1.y -= ny * overlap * 0.5;
          p2.x += nx * overlap * 0.5;
          p2.y += ny * overlap * 0.5;

          if (p1.isDashing && !p2.isDashing) {
            this.applyKnockback(p1, p2, nx, ny, now);
          } else if (p2.isDashing && !p1.isDashing) {
            this.applyKnockback(p2, p1, -nx, -ny, now);
          } else {
            const kx = p1.vx - p2.vx;
            const ky = p1.vy - p2.vy;
            p1.vx -= kx * 0.2;
            p1.vy -= ky * 0.2;
            p2.vx += kx * 0.2;
            p2.vy += ky * 0.2;
          }
        }
      }
    }

    // Player vs Box (Includes integrated High-speed Box collision check)
    playersArr.forEach(player => {
      this.boxes.forEach(box => {
        const dx = box.x - player.x;
        const dy = box.y - player.y;
        const dist = Math.hypot(dx, dy);
        const minDist = player.radius + box.radius;

        if (dist < minDist) {
          const overlap = minDist - dist;
          const nx = dx / (dist || 1); // points from player to box
          const ny = dy / (dist || 1);

          if (player.isDashing) {
            box.x += nx * overlap;
            box.y += ny * overlap;

            const pushForce = 12 / box.mass;
            box.vx = nx * pushForce;
            box.vy = ny * pushForce;

            player.vx = -nx * 3;
            player.vy = -ny * 3;
            player.isDashing = false;
            player.dashActiveTimer = 0;
            player.stunnedUntil = now + 150;

            this.io.to(this.roomId).emit('effect', { type: 'boxHit', x: box.x, y: box.y, color: '#F39C12' });
          } else if (box.slideSpeed > 2.5) {
            // High-speed Box hits Player!
            // Check if player is behind the ice wall (moving away from player)
            const bToP_x = -dx; // vector from box to player
            const bToP_y = -dy;
            const dot = box.vx * bToP_x + box.vy * bToP_y;

            if (box.type === 'ice' && dot <= 0) {
              // Ice wall moving away from player: acts as normal blocking shield
              const pushRatio = 1 / (box.mass + 1);
              box.x += nx * overlap * pushRatio;
              box.y += ny * overlap * pushRatio;

              box.vx += nx * 0.3 / box.mass;
              box.vy += ny * 0.3 / box.mass;

              player.x -= nx * overlap * (1 - pushRatio);
              player.y -= ny * overlap * (1 - pushRatio);
            } else {
              // Opponent/Player is in front of the sliding box: apply knockback and push
              const knockbackPower = box.slideSpeed * 1.5;
              this.applyKnockback({ name: '滑行的箱子', vx: box.vx, vy: box.vy, isDashing: true }, player, -nx, -ny, now, knockbackPower);
              
              if (box.type !== 'ice') {
                box.vx *= 0.3;
                box.vy *= 0.3;
              }
            }
          } else {
            // Normal Box vs Player collision
            const pushRatio = 1 / (box.mass + 1);
            box.x += nx * overlap * pushRatio;
            box.y += ny * overlap * pushRatio;
            
            box.vx += nx * 0.3 / box.mass;
            box.vy += ny * 0.3 / box.mass;

            player.x -= nx * overlap * (1 - pushRatio);
            player.y -= ny * overlap * (1 - pushRatio);
          }
        }
      });
    });

    // Box vs Box
    for (let i = 0; i < this.boxes.length; i++) {
      for (let j = i + 1; j < this.boxes.length; j++) {
        const b1 = this.boxes[i];
        const b2 = this.boxes[j];

        const dx = b2.x - b1.x;
        const dy = b2.y - b1.y;
        const dist = Math.hypot(dx, dy);
        const minDist = b1.radius + b2.radius;

        if (dist < minDist) {
          const overlap = minDist - dist;
          const nx = dx / (dist || 1);
          const ny = dy / (dist || 1);

          const totalMass = b1.mass + b2.mass;
          const ratio1 = b2.mass / totalMass;
          const ratio2 = b1.mass / totalMass;

          b1.x -= nx * overlap * ratio1;
          b1.y -= ny * overlap * ratio1;
          b2.x += nx * overlap * ratio2;
          b2.y += ny * overlap * ratio2;

          const kx = b1.vx - b2.vx;
          const ky = b1.vy - b2.vy;
          b1.vx -= kx * ratio1 * 0.8;
          b1.vy -= ky * ratio1 * 0.8;
          b2.vx += kx * ratio2 * 0.8;
          b2.vy += ky * ratio2 * 0.8;
        }
      }
    }
  }

  applyKnockback(attacker, victim, nx, ny, now, customPower) {
    if (victim.shieldCount > 0) {
      victim.shieldCount--;
      victim.stunnedUntil = now + 100;
      victim.vx = nx * 1.5;
      victim.vy = ny * 1.5;
      this.io.to(this.roomId).emit('effect', { type: 'shieldBreak', x: victim.x, y: victim.y, color: '#3498DB' });
      return;
    }

    const power = customPower || 7.0;
    // Scale the velocity values to match dt system (velocity is pixels/second)
    victim.vx = nx * power * 45;
    victim.vy = ny * power * 45;

    victim.stunnedUntil = now + 400;
    victim.isDashing = false;
    victim.dashActiveTimer = 0;

    this.io.to(this.roomId).emit('effect', { type: 'knockback', x: victim.x, y: victim.y, color: victim.color });
  }

  checkTraps(now) {
    const playersArr = Object.values(this.players).filter(p => p.isAlive);

    this.traps = this.traps.filter(trap => {
      let triggered = false;

      for (let i = 0; i < playersArr.length; i++) {
        const player = playersArr[i];
        const dist = Math.hypot(player.x - trap.x, player.y - trap.y);

        if (dist < player.radius + trap.radius) {
          triggered = true;
          this.triggerTrapEffect(player, trap, now);
          break;
        }
      }

      return !triggered;
    });
  }

  triggerTrapEffect(player, trap, now) {
    if (player.shieldCount > 0) {
      player.shieldCount--;
      this.io.to(this.roomId).emit('effect', { type: 'shieldBreak', x: player.x, y: player.y, color: '#3498DB' });
      return;
    }

    switch (trap.type) {
      case 'freeze':
        player.frozenUntil = now + 3000; // Frozen for 3 seconds
        player.vx = 0;
        player.vy = 0;
        this.io.to(this.roomId).emit('effect', { type: 'freezeTrigger', x: player.x, y: player.y, color: '#97E5EF' });
        this.addLog(`❄️ ${player.name} 踩中冰凍陷阱，被凍結 3 秒！`);
        break;

      case 'glue':
        player.slowedUntil = now + 4000; // Slowed for 4 seconds
        this.io.to(this.roomId).emit('effect', { type: 'glueTrigger', x: player.x, y: player.y, color: '#F39C12' });
        this.addLog(`🕸️ ${player.name} 踩中黏膠陷阱，速度變慢！`);
        break;

      case 'reverse':
        player.reversedUntil = now + 5000; // Reversed controls for 5 seconds
        this.io.to(this.roomId).emit('effect', { type: 'teleportTrigger', x: player.x, y: player.y, color: '#E74C3C' });
        this.addLog(`🌀 ${player.name} 踩中混亂陷阱，方向相反 5 秒！`);
        break;

      case 'spring':
        let angle = Math.atan2(player.dy || 0, player.dx || 0);
        if ((player.dx || 0) === 0 && (player.dy || 0) === 0) angle = Math.random() * Math.PI * 2;
        player.vx = Math.cos(angle) * 700;
        player.vy = Math.sin(angle) * 700;
        player.stunnedUntil = now + 600;
        this.io.to(this.roomId).emit('effect', { type: 'springTrigger', x: player.x, y: player.y, color: '#2ECC71' });
        break;

      case 'teleport':
        const candidates = Object.values(this.players).filter(p => p.id !== player.id && p.isAlive);
        if (candidates.length > 0) {
          const target = candidates[Math.floor(Math.random() * candidates.length)];
          const tempX = player.x;
          const tempY = player.y;

          player.x = target.x;
          player.y = target.y;
          target.x = tempX;
          target.y = tempY;

          this.io.to(this.roomId).emit('effect', { type: 'teleportTrigger', x: player.x, y: player.y, color: '#9B59B6' });
          this.io.to(this.roomId).emit('effect', { type: 'teleportTrigger', x: target.x, y: target.y, color: '#9B59B6' });
          this.addLog(`🌀 傳送！ ${player.name} 與 ${target.name} 對調了位置！`);
        } else {
          player.x = this.zone.x + (Math.random() - 0.5) * (this.zone.radius * 0.5);
          player.y = this.zone.y + (Math.random() - 0.5) * (this.zone.radius * 0.5);
          this.io.to(this.roomId).emit('effect', { type: 'teleportTrigger', x: player.x, y: player.y, color: '#9B59B6' });
        }
        break;
    }
  }

  checkPowerups(now) {
    const playersArr = Object.values(this.players).filter(p => p.isAlive);

    this.powerups = this.powerups.filter(pw => {
      let picked = false;

      for (let i = 0; i < playersArr.length; i++) {
        const player = playersArr[i];
        const dist = Math.hypot(player.x - pw.x, player.y - pw.y);

        if (dist < player.radius + pw.radius) {
          picked = true;
          if (pw.type === 'shield') {
            player.shieldCount = Math.min(2, player.shieldCount + 1);
          } else if (pw.type === 'trap_pack') {
            player.trapsInventory = Math.min(5, player.trapsInventory + 1); // +1 skill charge, max 5
          } else if (pw.type === 'boots') {
            if (player.speed < 6.0) player.speed += 0.4;
          }

          this.io.to(this.roomId).emit('effect', { type: 'pickup', x: pw.x, y: pw.y, color: '#F1C40F' });
          break;
        }
      }

      return !picked;
    });
  }

  checkGameOver() {
    if (this.state !== 'PLAYING') return;

    const alivePlayers = Object.values(this.players).filter(p => p.isAlive);

    if (alivePlayers.length === 1) {
      this.endGame(alivePlayers[0]);
    } else if (alivePlayers.length === 0) {
      this.endGame(null);
    }
  }

  endGame(winner) {
    this.state = 'ENDED';
    this.winner = winner;
    this.boxes = [];
    this.traps = [];

    if (winner) {
      this.addLog(`🎉 遊戲結束！生存者 ${winner.name} 贏得了最終勝利！`);
      this.io.to(this.roomId).emit('sound', 'victory');
    } else {
      this.addLog("☠️ 所有生存者皆已被毒死，無人獲勝！");
      this.io.to(this.roomId).emit('sound', 'defeat');
    }

    this.broadcastState();

    // Reset to lobby after 8 seconds
    setTimeout(() => {
      this.resetToLobby();
    }, 8000);
  }

  resetToLobby() {
    this.state = 'LOBBY';
    this.winner = null;
    this.boxes = [];
    this.traps = [];
    this.logs = [];

    for (const socketId in this.players) {
      const p = this.players[socketId];
      p.x = 100 + Math.random() * (MAP_WIDTH - 200);
      p.y = 100 + Math.random() * (MAP_HEIGHT - 200);
      p.vx = 0;
      p.vy = 0;
      p.dx = 0;
      p.dy = 0;
      p.angle = 0;
      p.health = 100;
      p.isAlive = true;
      p.shieldCount = 0;
      p.trapsInventory = 3;
      p.speedBoostUntil = 0;
      p.skillRegenTimer = 12000;
      p.reversedUntil = 0;
    }

    this.addLog("回到大廳，準備下一場大逃殺...");
    this.broadcastState();
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  broadcastState() {
    const payload = {
      state: this.state,
      players: this.players,
      boxes: this.boxes,
      traps: this.traps,
      powerups: this.powerups,
      zone: {
        x: this.zone.x,
        y: this.zone.y,
        radius: this.zone.radius,
        targetRadius: this.zone.targetRadius,
        shrinkStage: this.zone.shrinkStage
      },
      winner: this.winner ? { name: this.winner.name, color: this.winner.color } : null,
      logs: this.logs,
      settings: this.settings,
      mapWidth: MAP_WIDTH,
      mapHeight: MAP_HEIGHT
    };

    this.io.to(this.roomId).emit('gameState', payload);
  }
}

module.exports = { GameRoom };

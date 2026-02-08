const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const statusLine = document.getElementById("statusLine");
const roundLine = document.getElementById("roundLine");
const playersList = document.getElementById("playersList");
const logList = document.getElementById("logList");

const startButton = document.getElementById("startButton");
const restartButton = document.getElementById("restartButton");
const executeButton = document.getElementById("executeButton");

const commandControls = {
  up: {
    action: document.getElementById("cmd-up-action"),
    direction: document.getElementById("cmd-up-direction"),
  },
  left: {
    action: document.getElementById("cmd-left-action"),
    direction: document.getElementById("cmd-left-direction"),
  },
  down: {
    action: document.getElementById("cmd-down-action"),
    direction: document.getElementById("cmd-down-direction"),
  },
  right: {
    action: document.getElementById("cmd-right-action"),
    direction: document.getElementById("cmd-right-direction"),
  },
};

const MAP_ROWS = 11;
const MAP_COLS = 11;
const DEFAULT_HP = 10;
const LASER_DAMAGE = 1;
const LASER_BEAM_DURATION_MS = 1000;
const HIT_FLASH_DURATION_MS = 700;
const HIT_SHAKE_DURATION_MS = 260;
const HIT_SHAKE_AMPLITUDE = 4.5;

const TURN_ORDER = ["up", "left", "down", "right"];

const DIRECTION = {
  up: { dr: -1, dc: 0 },
  left: { dr: 0, dc: -1 },
  down: { dr: 1, dc: 0 },
  right: { dr: 0, dc: 1 },
};

const OPPOSITE = {
  up: "down",
  down: "up",
  left: "right",
  right: "left",
};

const COLORS = {
  up: "#c94833",
  left: "#2a61b8",
  down: "#27864f",
  right: "#986c1f",
};

const SIDES = {
  up: "Up",
  left: "Left",
  down: "Down",
  right: "Right",
};

const PLAYER_LABELS = {
  up: "A",
  left: "B",
  down: "C",
  right: "D",
};

const KNIGHT_SPRITE_URLS = {
  idle: "https://img.itch.zone/aW1nLzE3NzY1MjYxLmdpZg%3D%3D/original/bPmjnC.gif",
  run: "https://img.itch.zone/aW1nLzE3Nzc0MjM5LmdpZg%3D%3D/original/0C5J0V.gif",
  attack: "https://img.itch.zone/aW1nLzE3Nzc0MjUzLmdpZg%3D%3D/original/z7%2FgDs.gif",
  roll: "https://img.itch.zone/aW1nLzE3Nzc0MjYxLmdpZg%3D%3D/original/3xUf8y.gif",
};

const KNIGHT_SPRITES = Object.fromEntries(
  Object.entries(KNIGHT_SPRITE_URLS).map(([key, url]) => {
    const img = new Image();
    img.src = url;
    return [key, img];
  })
);

const TEMPLATE = [
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 2, 0, 0, 0, 2, 0, 0, 0],
  [0, -1, 0, 0, 0, 1, 0, 0, 0, -1, 0],
  [2, 0, 1, 0, -1, 0, -1, 0, 1, 0, 2],
  [0, 0, 0, 0, 2, 0, 2, 0, 0, 0, 0],
  [0, 1, -1, 2, 0, 0, 0, 2, -1, 1, 0],
  [0, 0, 0, 0, 2, 0, 2, 0, 0, 0, 0],
  [2, 0, 1, 0, -1, 0, -1, 0, 1, 0, 2],
  [0, -1, 0, 0, 0, 1, 0, 0, 0, -1, 0],
  [0, 0, 0, 2, 0, 0, 0, 2, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
];

const state = {
  phase: "idle",
  map: [],
  players: [],
  currentTurnIndex: 0,
  round: 1,
  logs: [],
  laserBeams: [],
  hitFlashes: [],
  hitShakes: [],
  laserAnimationFrame: null,
};

let audioCtx = null;

function displayName(id) {
  return `Player ${PLAYER_LABELS[id]} (${SIDES[id]})`;
}

function cloneMapFromTemplate() {
  return TEMPLATE.map((row) =>
    row.map((cell) => {
      if (cell === 0) {
        return { type: "empty" };
      }
      return { type: "block", strength: cell };
    })
  );
}

function createPlayers() {
  const midRow = Math.floor(MAP_ROWS / 2);
  const midCol = Math.floor(MAP_COLS / 2);

  return [
    { id: "up", row: 0, col: midCol, hp: DEFAULT_HP, shield: "up", aim: "up", spriteMode: "idle", alive: true },
    { id: "left", row: midRow, col: 0, hp: DEFAULT_HP, shield: "left", aim: "left", spriteMode: "idle", alive: true },
    { id: "down", row: MAP_ROWS - 1, col: midCol, hp: DEFAULT_HP, shield: "down", aim: "down", spriteMode: "idle", alive: true },
    { id: "right", row: midRow, col: MAP_COLS - 1, hp: DEFAULT_HP, shield: "right", aim: "right", spriteMode: "idle", alive: true },
  ];
}

function clearCommandInputs() {
  for (const control of Object.values(commandControls)) {
    control.action.value = "move";
    control.direction.value = "up";
  }
}

function ensureAudioContext() {
  const AudioContextRef = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextRef) {
    return null;
  }

  if (!audioCtx) {
    audioCtx = new AudioContextRef();
  }

  if (audioCtx.state === "suspended") {
    audioCtx.resume().catch(() => {});
  }

  return audioCtx;
}

function playHitSound(kind) {
  const ctxAudio = ensureAudioContext();
  if (!ctxAudio) {
    return;
  }

  const now = ctxAudio.currentTime;
  const gain = ctxAudio.createGain();
  const osc = ctxAudio.createOscillator();

  let startFreq = 260;
  let endFreq = 140;
  let peakGain = 0.08;
  let type = "square";

  if (kind === "player") {
    startFreq = 520;
    endFreq = 230;
    peakGain = 0.1;
    type = "sawtooth";
  } else if (kind === "shield") {
    startFreq = 390;
    endFreq = 260;
    peakGain = 0.09;
    type = "triangle";
  }

  osc.type = type;
  osc.frequency.setValueAtTime(startFreq, now);
  osc.frequency.exponentialRampToValueAtTime(endFreq, now + 0.14);

  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(peakGain, now + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.17);

  osc.connect(gain);
  gain.connect(ctxAudio.destination);

  osc.start(now);
  osc.stop(now + 0.18);
}

function pushLog(message) {
  state.logs.unshift(message);
  state.logs = state.logs.slice(0, 14);
}

function startMatch() {
  state.phase = "playing";
  state.map = cloneMapFromTemplate();
  state.players = createPlayers();
  state.currentTurnIndex = 0;
  state.round = 1;
  state.logs = [];
  state.laserBeams = [];
  state.hitFlashes = [];
  state.hitShakes = [];
  stopLaserAnimationLoop();
  clearCommandInputs();
  pushLog("Match started. Turn order: Up -> Left -> Down -> Right.");
  render();
  focusActiveCommandInput();
}

function getPlayerById(id) {
  return state.players.find((p) => p.id === id);
}

function getActivePlayer() {
  const activeId = TURN_ORDER[state.currentTurnIndex];
  return getPlayerById(activeId);
}

function alivePlayers() {
  return state.players.filter((p) => p.alive);
}

function playerAt(row, col) {
  return state.players.find((p) => p.alive && p.row === row && p.col === col) || null;
}

function inBounds(row, col) {
  return row >= 0 && row < MAP_ROWS && col >= 0 && col < MAP_COLS;
}

function blockTile(row, col) {
  if (!inBounds(row, col)) {
    return null;
  }
  const tile = state.map[row][col];
  return tile.type === "block" ? tile : null;
}

function getCellSize() {
  return {
    tileW: canvas.width / MAP_COLS,
    tileH: canvas.height / MAP_ROWS,
  };
}

function getCellCenter(row, col) {
  const { tileW, tileH } = getCellSize();
  return {
    x: col * tileW + tileW / 2,
    y: row * tileH + tileH / 2,
  };
}

function getPlayerRenderMetrics(player) {
  const { tileW, tileH } = getCellSize();
  const centerX = player.col * tileW + tileW / 2;
  const centerY = player.row * tileH + tileH / 2;
  const radius = Math.min(tileW, tileH) * 0.28;
  const knightY = centerY + Math.min(tileH, tileW) * 0.08;
  return { centerX, centerY, knightY, radius };
}

function colorWithAlpha(hex, alpha) {
  const safeHex = hex.replace("#", "");
  const r = parseInt(safeHex.slice(0, 2), 16);
  const g = parseInt(safeHex.slice(2, 4), 16);
  const b = parseInt(safeHex.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function edgePointForDirection(startX, startY, direction) {
  if (direction === "up") {
    return { x: startX, y: 2 };
  }
  if (direction === "down") {
    return { x: startX, y: canvas.height - 2 };
  }
  if (direction === "left") {
    return { x: 2, y: startY };
  }
  return { x: canvas.width - 2, y: startY };
}

function getGunMuzzlePoint(player, direction) {
  const metrics = getPlayerRenderMetrics(player);
  const gunSize = metrics.radius * 0.95;
  const sideShift = direction === player.shield ? 0.72 : 0;
  const gunBase = attachmentPosition(
    metrics.centerX,
    metrics.knightY,
    direction,
    metrics.radius * 1.62,
    metrics.radius,
    sideShift
  );
  const dir = directionVector(direction);
  return {
    x: gunBase.x + dir.dc * gunSize * 1.7,
    y: gunBase.y + dir.dr * gunSize * 1.7,
  };
}

function addLaserBeam(player, direction, endPoint) {
  const startPoint = getGunMuzzlePoint(player, direction);
  state.laserBeams.push({
    startX: startPoint.x,
    startY: startPoint.y,
    endX: endPoint.x,
    endY: endPoint.y,
    color: glowColor(player.id),
    startedAt: performance.now(),
    duration: LASER_BEAM_DURATION_MS,
  });
}

function addHitFlash(row, col) {
  state.hitFlashes.push({
    row,
    col,
    startedAt: performance.now(),
    duration: HIT_FLASH_DURATION_MS,
  });
}

function addHitShake(row, col, amplitude = HIT_SHAKE_AMPLITUDE) {
  state.hitShakes.push({
    row,
    col,
    amplitude,
    startedAt: performance.now(),
    duration: HIT_SHAKE_DURATION_MS,
  });
}

function pruneLaserBeams(now) {
  state.laserBeams = state.laserBeams.filter((beam) => now - beam.startedAt < beam.duration);
}

function pruneHitFlashes(now) {
  state.hitFlashes = state.hitFlashes.filter((flash) => now - flash.startedAt < flash.duration);
}

function pruneHitShakes(now) {
  state.hitShakes = state.hitShakes.filter((shake) => now - shake.startedAt < shake.duration);
}

function stopLaserAnimationLoop() {
  if (state.laserAnimationFrame !== null) {
    cancelAnimationFrame(state.laserAnimationFrame);
    state.laserAnimationFrame = null;
  }
}

function ensureLaserAnimationLoop() {
  if (state.laserAnimationFrame !== null) {
    return;
  }

  const tick = () => {
    const now = performance.now();
    pruneLaserBeams(now);
    pruneHitFlashes(now);
    pruneHitShakes(now);
    render();

    if (state.laserBeams.length > 0 || state.hitFlashes.length > 0 || state.hitShakes.length > 0) {
      state.laserAnimationFrame = requestAnimationFrame(tick);
      return;
    }

    state.laserAnimationFrame = null;
  };

  state.laserAnimationFrame = requestAnimationFrame(tick);
}

function spendTurn() {
  const activeBefore = state.currentTurnIndex;
  const currentPlayer = getPlayerById(TURN_ORDER[activeBefore]);
  if (currentPlayer && currentPlayer.alive) {
    currentPlayer.spriteMode = "idle";
  }
  let next = activeBefore;

  for (let i = 0; i < TURN_ORDER.length; i += 1) {
    next = (next + 1) % TURN_ORDER.length;
    const candidate = getPlayerById(TURN_ORDER[next]);
    if (candidate && candidate.alive) {
      state.currentTurnIndex = next;
      if (next <= activeBefore) {
        state.round += 1;
      }
      break;
    }
  }
}

function checkWinner() {
  const alive = alivePlayers();
  if (alive.length === 1) {
    state.phase = "finished";
    const winner = alive[0];
    pushLog(`${displayName(winner.id)} wins the match.`);
    return true;
  }
  return false;
}

function tryMove(activePlayer, direction) {
  const delta = DIRECTION[direction];
  const nextRow = activePlayer.row + delta.dr;
  const nextCol = activePlayer.col + delta.dc;

  if (!inBounds(nextRow, nextCol)) {
    pushLog(`${displayName(activePlayer.id)} cannot move out of map.`);
    return false;
  }

  if (blockTile(nextRow, nextCol)) {
    pushLog(`${displayName(activePlayer.id)} cannot move into a block.`);
    return false;
  }

  if (playerAt(nextRow, nextCol)) {
    pushLog(`${displayName(activePlayer.id)} cannot move into another player.`);
    return false;
  }

  activePlayer.row = nextRow;
  activePlayer.col = nextCol;
  pushLog(`${displayName(activePlayer.id)} moved ${direction}.`);
  return true;
}

function applyLaserToBlock(tile, row, col) {
  if (tile.strength === -1) {
    pushLog(`Laser hit an indestructible block at (${row}, ${col}).`);
    return;
  }

  tile.strength -= 1;
  if (tile.strength <= 0) {
    state.map[row][col] = { type: "empty" };
    pushLog(`Laser destroyed block at (${row}, ${col}).`);
    return;
  }

  pushLog(`Laser weakened block at (${row}, ${col}) to ${tile.strength}.`);
}

function shoot(activePlayer, direction) {
  if (direction === activePlayer.shield) {
    pushLog(
      `${displayName(activePlayer.id)} cannot shoot toward ${direction} because their shield is there.`
    );
    return false;
  }

  const delta = DIRECTION[direction];
  const muzzle = getGunMuzzlePoint(activePlayer, direction);
  const missEndPoint = edgePointForDirection(muzzle.x, muzzle.y, direction);
  let row = activePlayer.row + delta.dr;
  let col = activePlayer.col + delta.dc;

  while (inBounds(row, col)) {
    const tile = blockTile(row, col);
    if (tile) {
      addLaserBeam(activePlayer, direction, getCellCenter(row, col));
      addHitFlash(row, col);
      addHitShake(row, col);
      playHitSound("block");
      ensureLaserAnimationLoop();
      applyLaserToBlock(tile, row, col);
      return true;
    }

    const target = playerAt(row, col);
    if (target) {
      addLaserBeam(activePlayer, direction, getCellCenter(row, col));
      addHitFlash(target.row, target.col);
      ensureLaserAnimationLoop();
      const incomingSide = OPPOSITE[direction];
      if (target.shield === incomingSide) {
        pushLog(
          `${displayName(activePlayer.id)} shot ${displayName(target.id)}, but shield blocked from ${incomingSide}.`
        );
        return true;
      }

      addHitShake(target.row, target.col);
      playHitSound("player");
      target.hp -= LASER_DAMAGE;
      pushLog(
        `${displayName(activePlayer.id)} hit ${displayName(target.id)} for ${LASER_DAMAGE} damage (HP ${Math.max(0, target.hp)}).`
      );

      if (target.hp <= 0) {
        target.hp = 0;
        target.alive = false;
        pushLog(`${displayName(target.id)} is eliminated.`);
      }
      return true;
    }

    row += delta.dr;
    col += delta.dc;
  }

  addLaserBeam(activePlayer, direction, missEndPoint);
  ensureLaserAnimationLoop();
  pushLog(`${displayName(activePlayer.id)} shot ${direction}, but hit nothing.`);
  return true;
}

function runAction(activePlayer, action, direction) {
  if (action === "move") {
    const moved = tryMove(activePlayer, direction);
    if (moved) {
      activePlayer.aim = direction;
      activePlayer.spriteMode = "run";
    }
    return moved;
  }

  if (action === "shield") {
    activePlayer.shield = direction;
    activePlayer.spriteMode = "roll";
    pushLog(`${displayName(activePlayer.id)} moved shield to ${direction}.`);
    return true;
  }

  if (action === "shoot") {
    activePlayer.aim = direction;
    activePlayer.spriteMode = "attack";
    return shoot(activePlayer, direction);
  }

  return false;
}

function executeActiveCommand() {
  if (state.phase !== "playing") {
    return;
  }

  const activePlayer = getActivePlayer();
  if (!activePlayer || !activePlayer.alive) {
    return;
  }

  const control = commandControls[activePlayer.id];
  const action = control.action.value;
  const direction = control.direction.value;

  const actionConsumed = runAction(activePlayer, action, direction);
  if (!actionConsumed) {
    render();
    return;
  }

  if (checkWinner()) {
    render();
    return;
  }

  spendTurn();
  render();
  focusActiveCommandInput();
}

function drawBoard(now) {
  const width = canvas.width;
  const height = canvas.height;
  const tileW = width / MAP_COLS;
  const tileH = height / MAP_ROWS;

  ctx.clearRect(0, 0, width, height);

  for (let r = 0; r < MAP_ROWS; r += 1) {
    for (let c = 0; c < MAP_COLS; c += 1) {
      const x = c * tileW;
      const y = r * tileH;
      const tile = state.map[r]?.[c] || { type: "empty" };

      ctx.fillStyle = "#f2d3a2";
      ctx.fillRect(x, y, tileW, tileH);

      if (tile.type === "block") {
        const shake = getCellShakeOffset(r, c, now);
        if (tile.strength === -1) {
          ctx.fillStyle = "#4f3f33";
        } else if (tile.strength === 1) {
          ctx.fillStyle = "#9f5f34";
        } else {
          ctx.fillStyle = "#7d4a2a";
        }
        ctx.fillRect(x + 4 + shake.dx, y + 4 + shake.dy, tileW - 8, tileH - 8);

        ctx.fillStyle = "#ffe8c8";
        ctx.font = '700 18px "Cabin", sans-serif';
        const value = tile.strength === -1 ? "∞" : String(tile.strength);
        ctx.fillText(value, x + tileW / 2 - 6 + shake.dx, y + tileH / 2 + 6 + shake.dy);
      }

      ctx.strokeStyle = "rgba(84, 46, 24, 0.28)";
      ctx.strokeRect(x, y, tileW, tileH);
    }
  }
}

function drawLaserBeams(now) {
  if (state.laserBeams.length === 0) {
    return;
  }

  ctx.save();
  ctx.lineCap = "round";

  for (const beam of state.laserBeams) {
    const elapsed = now - beam.startedAt;
    const progress = Math.min(1, elapsed / beam.duration);
    const pulse = 0.5 + 0.5 * Math.sin(elapsed * 0.045);
    const alpha = Math.max(0, 1 - progress);
    const width = 2 + (1 - progress) * 3;

    ctx.strokeStyle = colorWithAlpha(beam.color, 0.65 * alpha + 0.15 * pulse);
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(beam.startX, beam.startY);
    ctx.lineTo(beam.endX, beam.endY);
    ctx.stroke();

    ctx.strokeStyle = colorWithAlpha("#ffffff", 0.35 * alpha);
    ctx.lineWidth = Math.max(1, width * 0.36);
    ctx.beginPath();
    ctx.moveTo(beam.startX, beam.startY);
    ctx.lineTo(beam.endX, beam.endY);
    ctx.stroke();
  }

  ctx.restore();
}

function drawHitFlashes(now) {
  if (state.hitFlashes.length === 0) {
    return;
  }

  const { tileW, tileH } = getCellSize();
  ctx.save();

  for (const flash of state.hitFlashes) {
    const elapsed = now - flash.startedAt;
    const progress = Math.min(1, elapsed / flash.duration);
    const pulse = 0.45 + 0.55 * Math.abs(Math.sin(elapsed * 0.03));
    const alpha = Math.max(0.1, (1 - progress) * pulse);
    const lineW = 2 + (1 - progress) * 2;
    const x = flash.col * tileW + 1.5;
    const y = flash.row * tileH + 1.5;
    const w = tileW - 3;
    const h = tileH - 3;

    ctx.strokeStyle = `rgba(235, 38, 38, ${alpha})`;
    ctx.lineWidth = lineW;
    ctx.strokeRect(x, y, w, h);
  }

  ctx.restore();
}

function getCellShakeOffset(row, col, now) {
  if (state.hitShakes.length === 0) {
    return { dx: 0, dy: 0 };
  }

  let dx = 0;
  let dy = 0;
  for (const shake of state.hitShakes) {
    if (shake.row !== row || shake.col !== col) {
      continue;
    }

    const elapsed = now - shake.startedAt;
    const progress = Math.min(1, elapsed / shake.duration);
    const strength = shake.amplitude * (1 - progress);
    const phase = elapsed * 0.18;
    dx += Math.sin(phase + row * 1.3 + col * 0.7) * strength;
    dy += Math.cos(phase * 0.9 + row * 0.5 + col * 1.1) * strength * 0.7;
  }

  return { dx, dy };
}

function directionAngle(direction) {
  if (direction === "up") return -Math.PI / 2;
  if (direction === "down") return Math.PI / 2;
  if (direction === "left") return Math.PI;
  return 0;
}

function directionVector(direction) {
  return DIRECTION[direction] || DIRECTION.right;
}

function attachmentPosition(x, y, direction, baseOffset, size, sideShift) {
  const dir = directionVector(direction);
  const px = -dir.dr;
  const py = dir.dc;
  return {
    x: x + dir.dc * baseOffset + px * sideShift * size,
    y: y + dir.dr * baseOffset + py * sideShift * size,
  };
}

function glowColor(playerId) {
  if (playerId === "up") return "#ff5f8f";
  if (playerId === "left") return "#62d2ff";
  if (playerId === "down") return "#78f47f";
  return "#ffd27a";
}

function drawKnightShield(x, y, direction, size, playerId) {
  const glow = glowColor(playerId);
  const cellHalf = size * 1.785;
  const margin = 2.5;
  const shieldThickness = Math.max(2, size * 0.13);
  const shieldLength = (cellHalf * 2 - margin * 2) * 0.95;
  const edgeX = cellHalf - margin - shieldThickness;

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(directionAngle(direction));

  ctx.fillStyle = "rgba(10, 16, 34, 0.85)";
  ctx.strokeStyle = "#9eb6d7";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.rect(edgeX, -shieldLength / 2, shieldThickness, shieldLength);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.strokeStyle = glow;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(edgeX + shieldThickness * 0.5, -shieldLength * 0.35);
  ctx.lineTo(edgeX + shieldThickness * 0.5, -shieldLength * 0.12);
  ctx.moveTo(edgeX + shieldThickness * 0.5, shieldLength * 0.12);
  ctx.lineTo(edgeX + shieldThickness * 0.5, shieldLength * 0.35);
  ctx.stroke();
  ctx.restore();
}

function drawLaserGun(x, y, direction, size, playerId, shieldDirection) {
  const sideShift = direction === shieldDirection ? 0.72 : 0;
  const pos = attachmentPosition(x, y, direction, size * 1.62, size, sideShift);
  const gx = pos.x;
  const gy = pos.y;
  const glow = glowColor(playerId);
  const gunSize = size * 0.95;

  ctx.save();
  ctx.translate(gx, gy);
  ctx.rotate(directionAngle(direction));

  ctx.fillStyle = "#1a2333";
  ctx.fillRect(-gunSize * 0.18, -gunSize * 0.14, gunSize * 1.42, gunSize * 0.28);

  ctx.fillStyle = "#3a495f";
  ctx.fillRect(-gunSize * 0.1, gunSize * 0.02, gunSize * 0.24, gunSize * 0.34);

  ctx.fillStyle = glow;
  ctx.fillRect(gunSize * 1.12, -gunSize * 0.1, gunSize * 0.18, gunSize * 0.2);

  ctx.strokeStyle = glow;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(gunSize * 1.28, 0);
  ctx.lineTo(gunSize * 1.7, 0);
  ctx.stroke();
  ctx.restore();
}

function drawHpBadge(x, y, hp, playerId) {
  const label = `${PLAYER_LABELS[playerId]}  HP ${hp}`;
  ctx.save();
  ctx.font = '700 11px "Cabin", sans-serif';
  ctx.fillStyle = "#2e1a12";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillText(label, x, y);
  ctx.restore();
}

function drawKnightSprite(player, x, y, radius) {
  const sprite = KNIGHT_SPRITES[player.spriteMode] || KNIGHT_SPRITES.idle;
  const facing = player.aim || player.id;
  const width = radius * 2.35;
  const height = radius * 2.35;

  ctx.save();
  ctx.translate(x, y);
  if (facing === "left") {
    ctx.scale(-1, 1);
  }

  if (sprite && sprite.complete && sprite.naturalWidth > 0) {
    ctx.drawImage(sprite, -width / 2, -height * 0.82, width, height);
  } else {
    ctx.fillStyle = "#1f2433";
    ctx.beginPath();
    ctx.arc(0, -radius * 0.15, radius * 0.55, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

function drawPlayer(player, isActive, now) {
  if (!player.alive) {
    return;
  }

  const tileW = canvas.width / MAP_COLS;
  const tileH = canvas.height / MAP_ROWS;
  const shake = getCellShakeOffset(player.row, player.col, now);
  const x = player.col * tileW + tileW / 2 + shake.dx;
  const y = player.row * tileH + tileH / 2 + shake.dy;
  const knightY = y + Math.min(tileH, tileW) * 0.08;
  const radius = Math.min(tileW, tileH) * 0.28;

  if (isActive) {
    ctx.strokeStyle = "#e13333";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(x, knightY, radius + 9, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Draw attachments first so the knight body remains readable.
  drawKnightShield(x, y, player.shield, radius, player.id);
  drawLaserGun(x, knightY, player.aim || player.id, radius, player.id, player.shield);
  drawKnightSprite(player, x, knightY, radius);

  drawHpBadge(x, y + radius * 1.22 - 6, player.hp, player.id);
}

function updateStatusPanel() {
  const activePlayer = getActivePlayer();

  if (state.phase === "idle") {
    statusLine.textContent = "Press Start Match.";
  } else if (state.phase === "finished") {
    const winner = alivePlayers()[0];
    statusLine.textContent = winner ? `${displayName(winner.id)} wins.` : "Match finished.";
  } else if (activePlayer) {
    statusLine.textContent = `Active: ${displayName(activePlayer.id)}. Choose command and direction.`;
  }

  roundLine.textContent = `Round: ${state.round}`;

  playersList.innerHTML = "";
  for (const player of state.players) {
    const li = document.createElement("li");
    li.className = player.alive ? "" : "dead";
    li.textContent = `${displayName(player.id)} | HP ${player.hp} | Shield ${player.shield} | ${player.alive ? "Alive" : "Dead"}`;
    playersList.appendChild(li);
  }

  logList.innerHTML = "";
  for (const entry of state.logs) {
    const li = document.createElement("li");
    li.textContent = entry;
    logList.appendChild(li);
  }
}

function focusActiveCommandInput() {
  if (state.phase !== "playing") {
    return;
  }

  const activePlayer = getActivePlayer();
  if (!activePlayer) {
    return;
  }

  const control = commandControls[activePlayer.id];
  if (!control || control.action.disabled) {
    return;
  }

  control.action.focus();
}

function updateControls() {
  const playable = state.phase === "playing";
  const activePlayer = getActivePlayer();
  executeButton.disabled = !playable;

  for (const playerId of TURN_ORDER) {
    const control = commandControls[playerId];
    const player = getPlayerById(playerId);
    const enabled = playable && player && player.alive;
    control.action.disabled = !enabled;
    control.direction.disabled = !enabled;
    const isActive = enabled && activePlayer && activePlayer.id === playerId;
    control.action.classList.toggle("active-input", isActive);
    control.direction.classList.toggle("active-input", isActive);
  }
}

function render() {
  const now = performance.now();
  pruneLaserBeams(now);
  pruneHitFlashes(now);
  pruneHitShakes(now);
  drawBoard(now);
  const activePlayer = getActivePlayer();
  for (const player of state.players) {
    drawPlayer(player, activePlayer && player.id === activePlayer.id, now);
  }
  drawLaserBeams(now);
  drawHitFlashes(now);

  updateStatusPanel();
  updateControls();
}

executeButton.addEventListener("click", executeActiveCommand);
startButton.addEventListener("click", startMatch);
restartButton.addEventListener("click", startMatch);

for (const [playerId, control] of Object.entries(commandControls)) {
  for (const select of [control.action, control.direction]) {
    select.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") {
        return;
      }

      event.preventDefault();

      if (state.phase !== "playing") {
        return;
      }

      const activePlayer = getActivePlayer();
      if (!activePlayer) {
        return;
      }

      if (activePlayer.id !== playerId) {
        pushLog(`Not ${displayName(playerId)} turn. Active is ${displayName(activePlayer.id)}.`);
        render();
        return;
      }

      executeActiveCommand();
    });
  }
}

window.addEventListener("keydown", (event) => {
  if (event.key !== "Enter") {
    return;
  }

  const isField =
    event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement;
  if (!isField) {
    executeActiveCommand();
  }
});

state.map = cloneMapFromTemplate();
state.players = createPlayers();
clearCommandInputs();
pushLog("Ready. Press Start Match. Choose command and direction from selects.");
render();

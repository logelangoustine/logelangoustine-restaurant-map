const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
const startOverlay = document.getElementById("startOverlay");
const startButton = document.getElementById("startButton");
const overlayText = document.getElementById("overlayText");
const scoreElement = document.getElementById("score");
const bestScoreElement = document.getElementById("bestScore");
const soundButton = document.getElementById("soundButton");

const W = 960;
const H = 360;
const groundY = 292;

let gameState = "idle";
let score = 0;
let bestScore = Number(localStorage.getItem("langoustineRunBest") || 0);
let speed = 390;
let spawnTimer = 1.2;
let shellTimer = 6;
let lastTime = 0;
let soundEnabled = true;
let audioContext = null;
let shake = 0;
let musicTimer = null;
let musicStep = 0;
const logoImage = new Image();
logoImage.src = "game-logo.png";

const player = {
  x: 125,
  y: groundY - 82,
  w: 82,
  h: 82,
  vy: 0,
  onGround: true,
  frame: 0
};

let obstacles = [];
let shells = [];
let particles = [];

bestScoreElement.textContent = formatScore(bestScore);

function formatScore(value) {
  return Math.floor(value).toString().padStart(5, "0");
}

function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(rect.width * ratio);
  canvas.height = Math.round(rect.height * ratio);
  ctx.setTransform(canvas.width / W, 0, 0, canvas.height / H, 0, 0);
}

function ensureAudio() {
  if (!soundEnabled) return;
  try {
    audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
    if (audioContext.state === "suspended") audioContext.resume();
  } catch (_) {}
}

function beep(frequency, duration, volume = 0.05, type = "square") {
  if (!soundEnabled) return;
  ensureAudio();
  if (!audioContext) return;

  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, audioContext.currentTime);
  gain.gain.setValueAtTime(volume, audioContext.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + duration);
  oscillator.connect(gain);
  gain.connect(audioContext.destination);
  oscillator.start();
  oscillator.stop(audioContext.currentTime + duration);
}

function playArpeggio(notes, noteLength = 0.09) {
  notes.forEach((frequency, index) => {
    window.setTimeout(() => beep(frequency, noteLength, 0.045), index * noteLength * 1000);
  });
}

function stopMusic() {
  if (musicTimer !== null) {
    window.clearTimeout(musicTimer);
    musicTimer = null;
  }
}

function startMusic() {
  stopMusic();
  if (!soundEnabled) return;
  ensureAudio();

  const bass = [130.81, 130.81, 196.00, 130.81, 174.61, 174.61, 196.00, 146.83];
  const lead = [523.25, 659.25, 783.99, 659.25, 698.46, 783.99, 659.25, 587.33];

  function playBeat() {
    if (!soundEnabled || gameState !== "running") return;
    beep(bass[musicStep % bass.length], 0.11, 0.018, "triangle");
    if (musicStep % 2 === 0) {
      beep(lead[musicStep % lead.length], 0.075, 0.022, "square");
    }
    musicStep++;
    const speedProgress = Math.max(0, Math.min((speed - 390) / 430, 1));
    const beatLength = 190 - speedProgress * 95;
    musicTimer = window.setTimeout(playBeat, beatLength);
  }

  playBeat();
}

function startGame() {
  gameState = "running";
  score = 0;
  speed = 390;
  spawnTimer = 1.2;
  shellTimer = 5;
  obstacles = [];
  shells = [];
  particles = [];
  player.y = groundY - player.h;
  player.vy = 0;
  player.onGround = true;
  startOverlay.classList.add("hidden");
  ensureAudio();
  playArpeggio([392, 523.25, 659.25, 783.99], 0.075);
  musicStep = 0;
  window.setTimeout(startMusic, 330);
}

function endGame() {
  if (gameState !== "running") return;
  gameState = "dead";
  stopMusic();
  shake = 12;
  playArpeggio([220, 196, 174.61, 130.81], 0.13);
  if (score > bestScore) {
    bestScore = Math.floor(score);
    localStorage.setItem("langoustineRunBest", String(bestScore));
    bestScoreElement.textContent = formatScore(bestScore);
  }
  overlayText.textContent = `Du nåede ${formatScore(score)} point. Prøv igen!`;
  startButton.textContent = "Prøv igen";
  startOverlay.classList.remove("hidden");
}

function jump() {
  if (gameState === "idle" || gameState === "dead") {
    startGame();
    return;
  }
  if (gameState === "running" && player.onGround) {
    player.vy = -760;
    player.onGround = false;
    playArpeggio([392, 523.25, 659.25], 0.045);
  }
}

function spawnObstacle() {
  const tall = Math.random() > 0.58;
  const w = tall ? 48 : 58;
  const h = tall ? 72 : 42;
  obstacles.push({
    x: W + 30,
    y: groundY - h,
    w,
    h,
    type: tall ? "rock" : "urchin"
  });
}

function spawnShell() {
  shells.push({
    x: W + 30,
    y: groundY - 105 - Math.random() * 70,
    w: 28,
    h: 28,
    spin: Math.random() * Math.PI
  });
}

function createBurst(x, y) {
  for (let i = 0; i < 12; i++) {
    particles.push({
      x,
      y,
      vx: (Math.random() - 0.5) * 180,
      vy: -50 - Math.random() * 150,
      life: 0.55,
      size: 2 + Math.random() * 4
    });
  }
}

function intersects(a, b) {
  const px = 8;
  const py = 8;
  return a.x + px < b.x + b.w &&
    a.x + a.w - px > b.x &&
    a.y + py < b.y + b.h &&
    a.y + a.h - py > b.y;
}

function update(dt) {
  if (gameState !== "running") {
    player.frame += dt;
    return;
  }

  score += dt * 12;
  scoreElement.textContent = formatScore(score);
  speed = 390 + Math.min(score * 2.2, 430);

  player.vy += 2100 * dt;
  player.y += player.vy * dt;
  if (player.y >= groundY - player.h) {
    player.y = groundY - player.h;
    player.vy = 0;
    player.onGround = true;
  }
  player.frame += dt * (speed / 55);

  spawnTimer -= dt;
  if (spawnTimer <= 0) {
    spawnObstacle();
    spawnTimer = Math.max(0.72, 1.42 - score / 900) + Math.random() * 0.55;
  }

  shellTimer -= dt;
  if (shellTimer <= 0) {
    spawnShell();
    shellTimer = 4.5 + Math.random() * 5;
  }

  obstacles.forEach(obstacle => obstacle.x -= speed * dt);
  shells.forEach(shell => {
    shell.x -= speed * dt;
    shell.spin += dt * 5;
  });
  particles.forEach(particle => {
    particle.x += particle.vx * dt;
    particle.y += particle.vy * dt;
    particle.vy += 300 * dt;
    particle.life -= dt;
  });

  obstacles = obstacles.filter(obstacle => obstacle.x + obstacle.w > -20);
  shells = shells.filter(shell => shell.x + shell.w > -20);
  particles = particles.filter(particle => particle.life > 0);

  for (const obstacle of obstacles) {
    if (intersects(player, obstacle)) endGame();
  }

  for (let i = shells.length - 1; i >= 0; i--) {
    if (intersects(player, shells[i])) {
      const shell = shells[i];
      createBurst(shell.x + 14, shell.y + 14);
      score += 35;
      playArpeggio([659.25, 783.99, 1046.5], 0.055);
      shells.splice(i, 1);
    }
  }

  if (shake > 0) shake -= dt * 30;
}

function drawSky() {
  ctx.fillStyle = "#fffaf0";
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = "rgba(118, 189, 177, 0.12)";
  ctx.beginPath();
  ctx.arc(790, 76, 58, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "rgba(239, 180, 76, 0.13)";
  ctx.beginPath();
  ctx.arc(790, 76, 38, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "rgba(24, 51, 58, 0.08)";
  ctx.lineWidth = 2;
  for (let i = 0; i < 5; i++) {
    const y = 75 + i * 36;
    ctx.beginPath();
    ctx.moveTo(40, y);
    ctx.bezierCurveTo(90, y - 8, 120, y + 8, 170, y);
    ctx.stroke();
  }
}

function drawGround() {
  ctx.fillStyle = "#cce2d8";
  ctx.fillRect(0, groundY, W, H - groundY);
  ctx.fillStyle = "#18333a";
  ctx.fillRect(0, groundY, W, 3);

  ctx.fillStyle = "rgba(24, 51, 58, 0.16)";
  const offset = (gameState === "running" ? score * 13 : 0) % 70;
  for (let x = -offset - 20; x < W + 70; x += 70) {
    ctx.beginPath();
    ctx.ellipse(x, groundY + 31, 16, 3, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawPlayer() {
  const x = player.x;
  const y = player.y;
  const bob = player.onGround ? Math.sin(player.frame) * 2 : 0;

  ctx.save();
  ctx.translate(x, y + bob);
  ctx.beginPath();
  ctx.arc(player.w / 2, player.h / 2, player.w / 2 - 2, 0, Math.PI * 2);
  ctx.clip();
  if (logoImage.complete && logoImage.naturalWidth > 0) {
    ctx.drawImage(logoImage, 0, 0, player.w, player.h);
  } else {
    ctx.fillStyle = "#ef735f";
    ctx.fillRect(0, 0, player.w, player.h);
  }
  ctx.restore();

  ctx.save();
  ctx.translate(x, y + bob);
  ctx.strokeStyle = "#18333a";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(player.w / 2, player.h / 2, player.w / 2 - 2, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawObstacle(obstacle) {
  if (obstacle.type === "rock") {
    ctx.fillStyle = "#6f8079";
    ctx.strokeStyle = "#18333a";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(obstacle.x + 5, obstacle.y + 12, obstacle.w - 10, obstacle.h - 12, 5);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "#18333a";
    ctx.fillRect(obstacle.x + 2, obstacle.y + 8, obstacle.w - 4, 8);
    ctx.fillRect(obstacle.x + obstacle.w / 2 - 8, obstacle.y + 2, 16, 7);

    ctx.fillStyle = "#fffaf0";
    ctx.beginPath();
    ctx.arc(obstacle.x + obstacle.w / 2, obstacle.y + 42, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#18333a";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(obstacle.x + 17, obstacle.y + 42);
    ctx.lineTo(obstacle.x + 31, obstacle.y + 42);
    ctx.moveTo(obstacle.x + 24, obstacle.y + 35);
    ctx.lineTo(obstacle.x + 24, obstacle.y + 49);
    ctx.stroke();
  } else {
    ctx.fillStyle = "#7f9289";
    ctx.strokeStyle = "#18333a";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(obstacle.x + 5, obstacle.y + 8);
    ctx.lineTo(obstacle.x + obstacle.w - 5, obstacle.y + 8);
    ctx.lineTo(obstacle.x + obstacle.w - 11, obstacle.y + obstacle.h);
    ctx.lineTo(obstacle.x + 11, obstacle.y + obstacle.h);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "#18333a";
    ctx.fillRect(obstacle.x, obstacle.y + 4, obstacle.w, 8);
    ctx.fillRect(obstacle.x + 18, obstacle.y, 22, 6);

    ctx.fillStyle = "#ef735f";
    ctx.beginPath();
    ctx.arc(obstacle.x + obstacle.w / 2 - 8, obstacle.y + 24, 5, 0, Math.PI * 2);
    ctx.arc(obstacle.x + obstacle.w / 2 + 8, obstacle.y + 24, 5, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawShell(shell) {
  ctx.save();
  ctx.translate(shell.x + shell.w / 2, shell.y + shell.h / 2);
  ctx.rotate(Math.sin(shell.spin) * 0.12);

  ctx.fillStyle = "#fffaf0";
  ctx.strokeStyle = "#18333a";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(0, 5, 16, 9, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "#ef735f";
  ctx.beginPath();
  ctx.ellipse(-3, 1, 11, 6, -0.15, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#18333a";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(-10, 1);
  ctx.quadraticCurveTo(-13, -5, -16, -3);
  ctx.moveTo(7, 2);
  ctx.quadraticCurveTo(11, -4, 14, -2);
  ctx.stroke();

  ctx.fillStyle = "#efb44c";
  ctx.beginPath();
  ctx.arc(8, 4, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawParticles() {
  for (const particle of particles) {
    ctx.globalAlpha = Math.max(0, particle.life * 1.8);
    ctx.fillStyle = "#efb44c";
    ctx.fillRect(particle.x, particle.y, particle.size, particle.size);
  }
  ctx.globalAlpha = 1;
}

function draw() {
  ctx.save();
  if (shake > 0) {
    ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
  }
  drawSky();
  drawGround();
  shells.forEach(drawShell);
  obstacles.forEach(drawObstacle);
  drawPlayer();
  drawParticles();
  ctx.restore();
}

function loop(time) {
  const dt = Math.min((time - lastTime) / 1000 || 0, 0.032);
  lastTime = time;
  update(dt);
  draw();
  requestAnimationFrame(loop);
}

startButton.addEventListener("click", event => {
  event.stopPropagation();
  startGame();
});

canvas.addEventListener("pointerdown", event => {
  event.preventDefault();
  jump();
});

window.addEventListener("keydown", event => {
  if (event.code === "Space" || event.code === "ArrowUp") {
    event.preventDefault();
    jump();
  }
});

soundButton.addEventListener("click", () => {
  soundEnabled = !soundEnabled;
  soundButton.textContent = soundEnabled ? "Lyd på" : "Lyd af";
  soundButton.setAttribute("aria-label", soundEnabled ? "Sluk lyd" : "Tænd lyd");
  if (!soundEnabled) {
    stopMusic();
  } else if (gameState === "running") {
    ensureAudio();
    startMusic();
  }
});

window.addEventListener("resize", resizeCanvas);
resizeCanvas();
requestAnimationFrame(loop);

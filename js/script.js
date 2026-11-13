"use strict";

const runner = document.querySelector(".runner");
const canvas = runner.querySelector(".runner-track");
const context = canvas.getContext("2d");
const scoreLabel = runner.querySelector(".runner-score");
const scoreValue = runner.querySelector("#score");
const bestValue = runner.querySelector("#best-score");
const status = runner.querySelector(".runner-status");

const frameWidth = 81;
const jumpFrameWidth = 89;
const frameHeight = 63;
const frameDuration = 0.04;
const jumpDuration = 0.66;
const jumpHeight = 41;
const landingDuration = 0.16;
// Последняя поза перед касанием взята из бегового цикла Джейка.
const jakeLandingFrame = 2;
const jakeJumpPoseTimes = [0, 0.13, 0.27, 0.55, 0.72, 0.82, 0.92];
const roadRevealDuration = 0.55;
const distancePerPoint = 12.5;
const recordKey = "finnthehuman.runner.best";
const startSpeed = 125;
const maxSpeed = 195;
const navy = "#0b1868";
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");

// Координаты отсчитываются от общего левого края кадров Финна и Джейка.
const characters = [
  { frames: 16, delay: 0.15, left: 23, right: 39, shadow: 29, strideTime: 0 },
  { frames: 8, delay: 0, left: 51, right: 70, shadow: 57, strideTime: 0 },
];

const obstacleTileSize = 18;
const obstacleTypes = [
  { tile: 0, inset: 3, width: 12, height: 12, pace: 0, frameTime: 0.20 },
  { tile: 1, inset: 3, width: 12, height: 13, pace: 0, frameTime: 0.17 },
  { tile: 2, inset: 3, width: 11, height: 16, pace: 12, frameTime: 0.10 },
  { tile: 3, inset: 3, width: 12, height: 16, pace: -12, frameTime: 0.14 }, // Гантер
  { tile: 4, inset: 3, width: 12, height: 13, pace: 0, frameTime: 0.17 }, // Лиловые и белые цветы
  { tile: 5, inset: 3, width: 12, height: 13, pace: 0, frameTime: 0.17 }, // Красные и голубые цветы
  { tile: 6, inset: 4, width: 10, height: 13, pace: 0, frameTime: 0.19 }, // Корона Снежного короля
  { tile: 7, inset: 4, width: 10, height: 12, pace: 0, frameTime: 0.24 }, // Энхиридион
  { tile: 8, inset: 4, width: 10, height: 14, pace: 0, frameTime: 0.18 }, // Кристальное яблоко
  { tile: 9, inset: 3, width: 12, height: 10, pace: 0, frameTime: 0.22 }, // Сэндвич Джейка
  { tile: 10, inset: 3, width: 13, height: 10, pace: -3, frameTime: 0.22 }, // Улитка
  { tile: 11, inset: 4, width: 9, height: 15, pace: -7, frameTime: 0.13 }, // Мятный лакей
  { tile: 12, inset: 3, width: 12, height: 13, pace: 7, frameTime: 0.15 }, // Булочка с корицей
  { tile: 13, inset: 3, width: 12, height: 13, pace: -5, frameTime: 0.16 }, // Деревяшка
  { tile: 14, inset: 4, width: 10, height: 15, pace: 12, frameTime: 0.10 }, // Второй спрайт Бимо
];

let obstacleImage;
let obstacles = [];
let upcomingTypes = [];
let lastObstacleType;
let width = 320;
let roadY = 130;
let runTime = 0;
let idleTime = 0;
let jumpStart = -Infinity;
let nextObstacle = 0;
let distance = 0;
let score = 0;
let best = readRecord();
let roadAlreadyOpen = false;
let lastTick;
let state = "loading";

function readRecord() {
  try {
    const value = Number(localStorage.getItem(recordKey));
    return Number.isSafeInteger(value) && value >= 0 ? value : 0;
  } catch {
    return 0;
  }
}

function updateScore() {
  best = Math.max(best, score);
  scoreValue.textContent = formatScore(score);
  bestValue.textContent = formatScore(best);
}

function formatScore(value) {
  return String(value).padStart(3, "0");
}

function saveRecord() {
  const stored = readRecord();
  best = Math.max(best, stored);
  if (best <= stored) return;
  try {
    localStorage.setItem(recordKey, String(best));
  } catch {
    // При недоступном хранилище рекорд живёт до закрытия страницы.
  }
}

function setState(next) {
  state = next;
  runner.dataset.state = next;
  scoreLabel.hidden = next === "idle";
  status.textContent = next === "finished"
    ? `Game Over. Score: ${formatScore(score)}. Best: ${formatScore(best)}.`
    : "";
}

function startRun() {
  const restarting = state === "finished";
  for (const character of characters) character.strideTime = restarting ? 0 : idleTime;
  obstacles = [];
  upcomingTypes = [];
  lastObstacleType = undefined;
  runTime = 0;
  distance = 0;
  score = 0;
  jumpStart = 0;
  nextObstacle = 0.6;
  roadAlreadyOpen = restarting;
  best = Math.max(best, readRecord());
  updateScore();
  setState("running");
}

function activate() {
  if (state === "idle" || state === "finished") {
    startRun();
  } else if (state === "running" && runTime - jumpStart >= jumpDuration + characters[0].delay) {
    jumpStart = runTime;
  }
}

function jumpAge(character) {
  return runTime - jumpStart - character.delay;
}

function heightAt(character) {
  const progress = jumpAge(character) / jumpDuration;
  if (progress <= 0 || progress >= 1) return 0;
  return 4 * jumpHeight * progress * (1 - progress);
}

function stretchAt(character) {
  if (reducedMotion.matches) return 0;
  const age = jumpAge(character);
  if (age > 0 && age < jumpDuration) {
    const progress = age / jumpDuration;
    return 0.065 * Math.sin(2 * Math.PI * progress) * (1 - progress);
  }
  const landing = (age - jumpDuration) / landingDuration;
  return landing > 0 && landing < 1 ? -0.085 * Math.sin(Math.PI * landing) : 0;
}

function roadReveal() {
  if (state === "idle") return 0;
  if (roadAlreadyOpen || reducedMotion.matches) return 1;
  const progress = Math.min(runTime / roadRevealDuration, 1);
  return progress * progress * (3 - 2 * progress);
}

function characterX() {
  const center = Math.floor((width - frameWidth) / 2);
  return Math.round(center + (22 - center) * roadReveal());
}

function spawnObstacle(speed) {
  if (!upcomingTypes.length) upcomingTypes = [...obstacleTypes];
  // Каждый вид появляется за один цикл. На стыке циклов избегаем повтора.
  const choices = upcomingTypes.filter(type => type !== lastObstacleType);
  const type = choices[Math.floor(Math.random() * choices.length)];
  upcomingTypes.splice(upcomingTypes.indexOf(type), 1);
  lastObstacleType = type;
  const previous = obstacles.at(-1);
  let x = width + 5;
  if (previous) {
    const approach = characterX() + characters[1].right;
    const timeToPrevious = (previous.x - approach) / (speed - previous.pace);
    // Оставляем время на следующий прыжок, даже если Гантер догоняет Бимо.
    x = Math.max(x, approach + (timeToPrevious + 1.12) * (speed - type.pace));
  }
  obstacles.push({ ...type, x, spawnedAt: runTime });
}

function updateRun(delta) {
  runTime += delta;
  for (const character of characters) {
    const age = jumpAge(character);
    if (character.jumpImage && age >= 0 && age - delta < jumpDuration) {
      character.strideTime = jakeLandingFrame * frameDuration;
    } else {
      const inAir = Math.max(0, Math.min(age, jumpDuration) - Math.max(0, age - delta));
      // В полёте Финн проходит лишь несколько кадров исходного шага.
      character.strideTime += delta - inAir * 0.82;
    }
  }
  const speed = Math.min(startSpeed + runTime * 2, maxSpeed);
  const movement = speed * delta;
  distance += movement;
  const points = Math.floor(distance / distancePerPoint);
  if (points !== score) {
    score = points;
    updateScore();
  }
  if (runTime >= nextObstacle) {
    spawnObstacle(speed);
    nextObstacle = runTime + 1.12 + Math.random() * 0.45;
  }

  const origin = characterX();
  for (const obstacle of obstacles) obstacle.x -= (speed - obstacle.pace) * delta;
  const collision = obstacles.some(obstacle => characters.some(character =>
    obstacle.x + obstacle.inset + obstacle.width > origin + character.left &&
    obstacle.x + obstacle.inset < origin + character.right &&
    heightAt(character) + 3 < obstacle.height
  ));
  if (collision) {
    saveRecord();
    updateScore();
    setState("finished");
  }
  obstacles = obstacles.filter(obstacle => obstacle.x + obstacleTileSize >= 0);
}

function drawRoad() {
  const origin = characterX();
  const reveal = roadReveal();
  // Две строки исходной полоски, в координатах общего спрайта.
  const left = Math.round((origin + 12) * (1 - reveal));
  const right = Math.round((origin + 73) * (1 - reveal) + width * reveal);
  const lowerLeft = Math.round((origin + 24) * (1 - reveal));
  const lowerRight = Math.round((origin + 62) * (1 - reveal) + width * reveal);
  context.fillStyle = navy;
  context.fillRect(left, roadY, right - left, 1);
  context.globalAlpha = 1 - 0.54 * reveal;
  context.fillRect(lowerLeft, roadY + 1, lowerRight - lowerLeft, 1);
  context.globalAlpha = 1;
}

function drawObstacle(obstacle) {
  const x = Math.round(obstacle.x);
  const y = roadY - obstacleTileSize;
  const frame = reducedMotion.matches ? 0 : Math.floor((runTime - obstacle.spawnedAt) / obstacle.frameTime) % 4;
  context.drawImage(obstacleImage, obstacle.tile * obstacleTileSize, frame * obstacleTileSize,
    obstacleTileSize, obstacleTileSize, x, y, obstacleTileSize, obstacleTileSize);
}

function drawCharacter(character, origin) {
  const age = jumpAge(character);
  const progress = age / jumpDuration;
  const jumpPose = character.jumpImage && age >= 0 && age < jumpDuration;
  const image = jumpPose ? character.jumpImage : character.runImage;
  const spriteWidth = jumpPose ? jumpFrameWidth : frameWidth;
  const strideTime = state === "idle" ? idleTime : character.strideTime;
  const pose = jumpPose
    ? jakeJumpPoseTimes.findLastIndex(time => progress >= time)
    : Math.floor(strideTime / frameDuration) % character.frames;
  const stretch = stretchAt(character);
  const scaleX = 1 - stretch * 0.8;
  const scaleY = 1 + stretch;
  const x = origin + Math.round(character.shadow * (1 - scaleX));
  const y = Math.round(roadY - heightAt(character) - 61 * scaleY);
  context.drawImage(image, pose * spriteWidth, 0, spriteWidth, frameHeight, x, y,
    Math.round(spriteWidth * scaleX), Math.round(frameHeight * scaleY));
}

function draw() {
  context.clearRect(0, 0, width, canvas.height);
  drawRoad();
  obstacles.forEach(drawObstacle);
  const origin = characterX();
  const shadowReveal = Math.max(0, (roadReveal() - 0.25) / 0.75);
  if (shadowReveal > 0) {
    for (const character of characters) {
      const height = heightAt(character);
      const shadowWidth = Math.round(21 - 13 * height / jumpHeight);
      context.globalAlpha = shadowReveal * (0.65 - 0.38 * height / jumpHeight);
      context.fillStyle = navy;
      context.fillRect(origin + character.shadow - Math.floor(shadowWidth / 2), roadY + 2, shadowWidth, 1);
    }
    context.globalAlpha = 1;
  }
  for (const character of characters) {
    drawCharacter(character, origin);
  }
}

function resize() {
  const bounds = canvas.getBoundingClientRect();
  // Сохраняем пропорции пикселей и оставляем место для прыжка на узких экранах.
  const scale = Math.min(bounds.height / 142, bounds.width / 222);
  width = Math.max(222, Math.round(bounds.width / scale));
  canvas.width = width;
  canvas.height = Math.round(bounds.height / scale);
  roadY = canvas.height - 12;
  context.imageSmoothingEnabled = false;
  draw();
}

function tick(now) {
  const delta = lastTick === undefined ? 0 : Math.min((now - lastTick) / 1000, 0.05);
  lastTick = now;
  if (state === "running") {
    updateRun(delta);
    draw();
  } else if (state === "idle" && !reducedMotion.matches) {
    idleTime += delta;
    draw();
  }
  requestAnimationFrame(tick);
}

async function loadSprite(name) {
  const image = new Image();
  image.src = `assets/images/main-layers/${name}.png`;
  await image.decode();
  return image;
}

async function init() {
  if (!context) throw Error("Canvas is unavailable");
  const [finn, jake] = characters;
  [finn.runImage, jake.runImage, jake.jumpImage, obstacleImage] = await Promise.all([
    loadSprite("finn-sprites"),
    loadSprite("jake-sprites"),
    loadSprite("jake-jump"),
    loadSprite("obstacles"),
  ]);

  document.addEventListener("keydown", event => {
    const startsRun = event.key === "Enter" && (state === "idle" || state === "finished");
    if ((!startsRun && event.code !== "Space") || event.altKey || event.ctrlKey || event.metaKey ||
        event.target.closest("button, a, input, textarea, select, [contenteditable]")) return;
    event.preventDefault();
    if (!event.repeat) activate();
  });
  document.addEventListener("pointerdown", event => {
    if (event.isPrimary && event.button === 0 && !event.target.closest("button, a")) activate();
  });
  // В Safari долгий тап может открыть меню поверх Canvas или счёта даже при user-select: none.
  // Прыжок уже обработан через pointerdown, а отмена touchstart убирает системный жест.
  document.addEventListener("touchstart", event => {
    if (event.touches.length === 1) event.preventDefault();
  }, { passive: false });
  for (const type of ["selectstart", "contextmenu"]) {
    document.addEventListener(type, event => event.preventDefault());
  }
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) saveRecord();
    lastTick = undefined;
  });
  window.addEventListener("pagehide", saveRecord);

  setState("idle");
  resize();
  new ResizeObserver(resize).observe(canvas);
  requestAnimationFrame(tick);
}

init().catch(error => {
  status.textContent = "Game failed to load. Refresh to try again.";
  console.error(error);
});

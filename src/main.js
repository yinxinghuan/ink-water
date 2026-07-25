import './style.css';

const query = new URLSearchParams(location.search);
const baseline = query.get('baseline') === '1';
const localeOverride = localStorage.getItem('game_locale');
const locale = localeOverride === 'zh' || localeOverride === 'en'
  ? localeOverride
  : navigator.language.toLowerCase().startsWith('zh') ? 'zh' : 'en';
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const copy = {
  zh: {
    water: '双指开合调水',
    hiddenHint: '双指开合 · 调节扩散',
    resultKicker: '水墨已醒来',
    resultTitle: '你的流场',
    again: '再画一次',
    errorTitle: '水面没有醒来',
    errorCopy: '这台设备暂时无法运行水墨模拟。',
    retry: '重新载入'
  },
  en: {
    water: 'PINCH FOR WATER',
    hiddenHint: 'PINCH · CHANGE DIFFUSION',
    resultKicker: 'INK AWAKENED',
    resultTitle: 'YOUR CURRENT',
    again: 'DRAW AGAIN',
    errorTitle: 'WATER STAYED STILL',
    errorCopy: 'This device could not start the ink simulation.',
    retry: 'RELOAD'
  }
}[locale];

const app = document.querySelector('.iw-app');
const canvas = document.querySelector('#canvas');
const ghost = document.querySelector('[data-ghost]');
const resultPanel = document.querySelector('.iw-result');
const errorPanel = document.querySelector('.iw-error');
const progressNode = document.querySelector('[data-progress]');
const startButton = document.querySelector('[data-start]');
const restartButton = document.querySelector('[data-restart]');

document.documentElement.lang = locale === 'zh' ? 'zh-CN' : 'en';
document.querySelector('[data-water-label]').textContent = copy.water;
document.querySelector('[data-hidden-hint]').textContent = copy.hiddenHint;
document.querySelector('[data-result-kicker]').textContent = copy.resultKicker;
document.querySelector('[data-result-title]').textContent = copy.resultTitle;
restartButton.textContent = copy.again;
document.querySelector('[data-error-title]').textContent = copy.errorTitle;
document.querySelector('[data-error-copy]').textContent = copy.errorCopy;
document.querySelector('[data-retry]').textContent = copy.retry;
document.querySelector('[data-retry]').addEventListener('click', () => location.reload());
if (baseline) document.body.classList.add('iw-baseline');

let experience;
let path = 0;
let completed = false;
let userInteracted = false;
let ghostTimer = 0;
let audioContext;
const targetPath = 3.2;

function tone(kind) {
  if (baseline) return;
  try {
    audioContext ??= new AudioContext();
    const now = audioContext.currentTime;
    const notes = kind === 'complete' ? [220, 330, 495] : [kind === 'water' ? 260 : kind === 'touch' ? 110 : 160];
    notes.forEach((frequency, index) => {
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      oscillator.type = kind === 'touch' ? 'triangle' : 'sine';
      oscillator.frequency.setValueAtTime(frequency, now + index * 0.1);
      gain.gain.setValueAtTime(0.0001, now + index * 0.1);
      gain.gain.exponentialRampToValueAtTime(0.022, now + index * 0.1 + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + index * 0.1 + (kind === 'complete' ? 0.42 : 0.1));
      oscillator.connect(gain).connect(audioContext.destination);
      oscillator.start(now + index * 0.1);
      oscillator.stop(now + index * 0.1 + 0.45);
    });
  } catch {
    // Audio is optional.
  }
}

function firstInteraction() {
  if (userInteracted) return;
  userInteracted = true;
  clearTimeout(ghostTimer);
  ghost.classList.remove('iw-ghost--show');
  experience?.stopDemo();
  tone('touch');
}

function addPath(distance) {
  if (completed) return;
  path += distance;
  const progress = Math.min(1, path / targetPath);
  progressNode.textContent = String(Math.round(progress * 100)).padStart(2, '0');
  if (progress >= 1) {
    completed = true;
    app.dataset.state = 'result';
    resultPanel.hidden = false;
    tone('complete');
  }
}

function runGhost() {
  if (!experience || userInteracted || reducedMotion || baseline) return;
  ghost.classList.add('iw-ghost--show');
  const start = performance.now();
  experience.startDemo();
  const tick = (now) => {
    const elapsed = now - start;
    if (userInteracted || elapsed > 2250) {
      ghost.classList.remove('iw-ghost--show');
      experience?.stopDemo();
      return;
    }
    const t = Math.min(1, elapsed / 2250);
    experience.setDemoPoint(
      0.2 + t * 0.6,
      0.58 + Math.sin(t * Math.PI * 2) * 0.11
    );
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

async function start() {
  if (experience || app.dataset.state === 'loading') return;
  app.dataset.state = 'loading';
  tone('start');
  try {
    const { InkExperience } = await import('./InkExperience.js');
    experience = new InkExperience(canvas, new URL('./noise_1.jpg', document.baseURI), {
      onPath: addPath,
      onFirstInteraction: firstInteraction,
      onWaterChange: () => tone('water')
    });
    await experience.init();
    app.dataset.state = 'active';
    if (!baseline) ghostTimer = window.setTimeout(runGhost, 900);
  } catch (error) {
    console.error(error);
    app.dataset.state = 'error';
    errorPanel.hidden = false;
  }
}

startButton.addEventListener('pointerdown', start);
restartButton.addEventListener('click', () => {
  path = 0;
  completed = false;
  userInteracted = false;
  progressNode.textContent = '00';
  resultPanel.hidden = true;
  app.dataset.state = 'active';
  experience?.reset();
  if (!reducedMotion) ghostTimer = window.setTimeout(runGhost, 700);
});

document.addEventListener('visibilitychange', () => {
  if (!experience) return;
  document.hidden ? experience.pause() : experience.play();
});
new IntersectionObserver(([entry]) => {
  if (!experience) return;
  entry.isIntersecting && !document.hidden ? experience.play() : experience.pause();
}, { threshold: 0.01 }).observe(canvas);

if (baseline) start();

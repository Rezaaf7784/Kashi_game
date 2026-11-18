import { useCallback, useEffect, useRef, useState, type PointerEvent } from 'react';
import { ArrowLeft, Heart, RotateCcw, Sparkles, Trophy, Volume2, VolumeX, Zap } from 'lucide-react';

type Screen = 'start' | 'playing' | 'over';
type TileRow = { id: number; y: number; target: number; cleared: boolean };
type Game = { rows: TileRow[]; width: number; height: number; tileHeight: number; score: number; nextId: number; lastTime: number; frame: number; ended: boolean };

const BEST_KEY = 'tile-tap-best-v1';
const COLORS = ['#ffe9df', '#e6f7f3', '#fff3d9', '#eae8ff'];

function randomColumn(previous?: number) {
  let next = Math.floor(Math.random() * 4);
  if (previous !== undefined && next === previous) next = (next + 1 + Math.floor(Math.random() * 3)) % 4;
  return next;
}

function readBest() {
  try { return Number(localStorage.getItem(BEST_KEY)) || 0; } catch { return 0; }
}

function playTone(frequency: number, duration: number, enabled: boolean) {
  if (!enabled) return;
  try {
    const AudioContextClass = window.AudioContext;
    const audio = new AudioContextClass();
    const oscillator = audio.createOscillator();
    const gain = audio.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(frequency, audio.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(frequency * 1.28, audio.currentTime + duration);
    gain.gain.setValueAtTime(0.09, audio.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + duration);
    oscillator.connect(gain);
    gain.connect(audio.destination);
    oscillator.start();
    oscillator.stop(audio.currentTime + duration);
    oscillator.onended = () => void audio.close();
  } catch { /* Sound is optional when audio is unavailable. */ }
}

function drawRoundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, radius: number, color: string) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, radius);
  ctx.fill();
}

function drawBoard(ctx: CanvasRenderingContext2D, game: Game) {
  const { width, height, tileHeight, rows } = game;
  const cellWidth = width / 4;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = '#f8f7fc';
  ctx.fillRect(0, 0, width, height);

  for (let col = 1; col < 4; col++) {
    ctx.fillStyle = '#ebe9f2';
    ctx.fillRect(col * cellWidth - 0.5, 0, 1, height);
  }

  for (const row of rows) {
    if (row.y > height || row.y + tileHeight < 0) continue;
    for (let col = 0; col < 4; col++) {
      const x = col * cellWidth + 3;
      const y = row.y + 3;
      const w = cellWidth - 6;
      const h = tileHeight - 6;
      if (col === row.target && !row.cleared) {
        drawRoundRect(ctx, x, y + 3, w, h, 13, '#c9c7d8');
        drawRoundRect(ctx, x, y, w, h, 13, '#25253e');
        ctx.fillStyle = '#ffffff';
        ctx.globalAlpha = 0.9;
        ctx.beginPath();
        ctx.arc(x + w / 2, y + h / 2, Math.min(w, h) * 0.13, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      } else if (col === row.target) {
        drawRoundRect(ctx, x, y, w, h, 13, '#e8e5f6');
        ctx.strokeStyle = '#b9aedc';
        ctx.lineWidth = 2.5;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(x + w / 2 - 9, y + h / 2);
        ctx.lineTo(x + w / 2 - 2, y + h / 2 + 7);
        ctx.lineTo(x + w / 2 + 11, y + h / 2 - 8);
        ctx.stroke();
      } else {
        drawRoundRect(ctx, x, y + 2, w, h, 13, '#e9e8ef');
        drawRoundRect(ctx, x, y, w, h - 1, 13, '#ffffff');
        ctx.fillStyle = COLORS[(row.id + col) % COLORS.length];
        ctx.beginPath();
        ctx.arc(x + w / 2, y + h / 2, Math.min(w, h) * 0.11, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  const gradient = ctx.createLinearGradient(0, height - 55, 0, height);
  gradient.addColorStop(0, 'rgba(239,91,108,0)');
  gradient.addColorStop(1, 'rgba(239,91,108,0.10)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, height - 55, width, 55);
  ctx.fillStyle = '#ef5b6c';
  ctx.fillRect(0, height - 4, width, 4);
}

function App() {
  const [screen, setScreen] = useState<Screen>('start');
  const [score, setScore] = useState(0);
  const [finalScore, setFinalScore] = useState(0);
  const [best, setBest] = useState(readBest);
  const [soundOn, setSoundOn] = useState(true);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<Game | null>(null);
  const soundRef = useRef(soundOn);
  soundRef.current = soundOn;

  const endGame = useCallback((game: Game) => {
    if (game.ended) return;
    game.ended = true;
    cancelAnimationFrame(game.frame);
    playTone(180, 0.27, soundRef.current);
    setFinalScore(game.score);
    setBest((previous) => {
      const next = Math.max(previous, game.score);
      try { localStorage.setItem(BEST_KEY, String(next)); } catch { /* Private browsing may block storage. */ }
      return next;
    });
    setScreen('over');
  }, []);

  const startGame = () => {
    setScore(0);
    setScreen('playing');
  };

  useEffect(() => {
    if (screen !== 'playing') return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext('2d');
    if (!context) return;

    const game: Game = { rows: [], width: 0, height: 0, tileHeight: 0, score: 0, nextId: 0, lastTime: 0, frame: 0, ended: false };
    gameRef.current = game;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const oldHeight = game.height;
      const oldTileHeight = game.tileHeight;
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(rect.width * ratio);
      canvas.height = Math.round(rect.height * ratio);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      game.width = rect.width;
      game.height = rect.height;
      game.tileHeight = Math.min(118, rect.width / 4 * 1.12);
      if (game.rows.length && oldHeight && oldTileHeight) {
        for (const row of game.rows) row.y = (row.y - oldHeight) / oldTileHeight * game.tileHeight + game.height;
      } else {
        let y = game.height - game.tileHeight * 2.5;
        let previous: number | undefined;
        while (y > -game.tileHeight * 1.5) {
          const target = randomColumn(previous);
          game.rows.push({ id: game.nextId++, y, target, cleared: false });
          previous = target;
          y -= game.tileHeight;
        }
      }
      drawBoard(context, game);
    };

    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();

    const tick = (time: number) => {
      if (game.ended) return;
      const delta = game.lastTime ? Math.min((time - game.lastTime) / 1000, 0.05) : 0;
      game.lastTime = time;
      const speed = Math.min(54 + game.score * 3.4, 235);
      for (const row of game.rows) row.y += speed * delta;
      if (game.rows.some((row) => !row.cleared && row.y + game.tileHeight >= game.height)) {
        drawBoard(context, game);
        endGame(game);
        return;
      }
      game.rows = game.rows.filter((row) => row.y < game.height);
      while (game.rows.length && game.rows[game.rows.length - 1].y > -game.tileHeight) {
        const top = game.rows[game.rows.length - 1];
        game.rows.push({ id: game.nextId++, y: top.y - game.tileHeight, target: randomColumn(top.target), cleared: false });
      }
      drawBoard(context, game);
      game.frame = requestAnimationFrame(tick);
    };
    game.frame = requestAnimationFrame(tick);

    const onVisibility = () => {
      game.lastTime = 0;
      if (document.hidden) cancelAnimationFrame(game.frame);
      else if (!game.ended) game.frame = requestAnimationFrame(tick);
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      game.ended = true;
      cancelAnimationFrame(game.frame);
      observer.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      gameRef.current = null;
    };
  }, [screen, endGame]);

  const handleTap = (event: PointerEvent<HTMLCanvasElement>) => {
    const game = gameRef.current;
    const canvas = canvasRef.current;
    if (!game || !canvas || game.ended) return;
    event.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    if (x < 0 || x >= game.width || y < 0 || y >= game.height) return;
    const column = Math.floor(x / (game.width / 4));
    const row = game.rows.find((item) => y >= item.y && y < item.y + game.tileHeight);
    if (!row) return;
    if (column !== row.target) {
      endGame(game);
      return;
    }
    if (row.cleared) return;
    row.cleared = true;
    game.score += 1;
    setScore(game.score);
    playTone(420 + Math.min(game.score * 18, 350), 0.09, soundRef.current);
    const context = canvas.getContext('2d');
    if (context) drawBoard(context, game);
  };

  return (
    <main className="relative flex h-dvh w-full flex-col overflow-hidden bg-[#f5f2fa] text-[#25253e]" dir="rtl">
      <div className="pointer-events-none absolute -right-24 -top-24 size-64 rounded-full bg-[#ffe5e9] blur-3xl" />
      <div className="pointer-events-none absolute -bottom-28 -left-20 size-72 rounded-full bg-[#e9e5ff] blur-3xl" />
      <div className="relative mx-auto flex min-h-0 w-full max-w-[520px] flex-1 flex-col bg-white/70 shadow-[0_0_80px_rgba(45,35,79,0.08)] sm:border-x sm:border-[#eae7f2]">
        {screen === 'start' && (
          <div className="flex min-h-0 flex-1 flex-col px-6 pb-[max(28px,env(safe-area-inset-bottom))] pt-[max(28px,env(safe-area-inset-top))] sm:px-10" data-testid="start-screen">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-bold text-[#5b5377]"><span className="flex size-9 items-center justify-center rounded-xl bg-[#eee9ff] text-[#7159d9]"><Zap size={19} fill="currentColor" /></span> بازی‌های کوچک</div>
              <button type="button" onClick={() => setSoundOn((value) => !value)} aria-label={soundOn ? 'قطع صدا' : 'وصل صدا'} data-testid="sound-toggle" className="flex size-11 items-center justify-center rounded-2xl border border-[#ece9f2] bg-white text-[#6d6488] transition hover:bg-[#f3efff] focus-visible:outline-2 focus-visible:outline-[#7159d9]">{soundOn ? <Volume2 size={20} /> : <VolumeX size={20} />}</button>
            </div>

            <div className="flex flex-1 flex-col items-center justify-center py-7 text-center">
              <div className="relative mb-7 grid w-full max-w-[260px] grid-cols-4 gap-2 rounded-[28px] border border-[#ece8f3] bg-white p-3 shadow-[0_24px_60px_rgba(73,54,128,0.13)] -rotate-3" aria-hidden="true">
                {Array.from({ length: 16 }, (_, index) => {
                  const dark = [1, 6, 8, 15].includes(index);
                  return <div key={index} className={`flex aspect-square items-center justify-center rounded-xl ${dark ? 'bg-[#25253e] shadow-md' : 'bg-[#f6f3fa]'}`}><span className={`size-3 rounded-full ${dark ? 'bg-white' : index % 3 === 0 ? 'bg-[#ffd8d0]' : index % 3 === 1 ? 'bg-[#d5f1e8]' : 'bg-[#e3dcff]'}`} /></div>;
                })}
                <span className="absolute -right-5 top-9 flex size-11 items-center justify-center rounded-2xl bg-[#ffdfaa] text-[#a1691a] shadow-lg rotate-12"><Sparkles size={22} /></span>
              </div>
              <div className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-[#f0ebff] px-3 py-1 text-xs font-bold text-[#7159d9]"><span className="size-1.5 rounded-full bg-[#7159d9]" /> سریع، ساده، هیجان‌انگیز</div>
              <h1 className="text-4xl font-black leading-tight sm:text-5xl">ضربه به <span className="text-[#7159d9]">کاشی</span></h1>
              <p className="mt-4 max-w-[290px] text-sm leading-7 text-[#79728d]">فقط کاشی‌های تیره رو لمس کن، امتیاز بگیر و نذار هیچ‌کدوم از پایین رد بشن!</p>
              {best > 0 && <div className="mt-5 flex items-center gap-2 rounded-full bg-[#fff6e7] px-4 py-2 text-sm font-bold text-[#8d6631]" data-testid="best-score"><Trophy size={17} /> بهترین رکورد: {best.toLocaleString('fa-IR')}</div>}
            </div>

            <div className="space-y-4">
              <button type="button" onClick={startGame} data-testid="start-button" className="flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-[#7159d9] px-6 text-base font-extrabold text-white shadow-[0_10px_24px_rgba(113,89,217,0.27)] transition hover:bg-[#624bc9] active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7159d9]">شروع بازی <ArrowLeft size={20} /></button>
              <p className="text-center text-xs font-medium text-[#9b95a9]">لمس اشتباه یا جا ماندن یک کاشی = پایان بازی</p>
            </div>
          </div>
        )}

        {screen === 'playing' && (
          <div className="flex min-h-0 flex-1 flex-col" data-testid="game-screen">
            <header className="flex min-h-[104px] items-center justify-between gap-3 px-5 pb-3 pt-[max(18px,env(safe-area-inset-top))] sm:px-7">
              <div><p className="text-xs font-bold text-[#938ca7]">امتیاز شما</p><div className="text-4xl font-black tabular-nums leading-tight text-[#25253e]" data-testid="score">{score.toLocaleString('fa-IR')}</div></div>
              <div className="flex items-center gap-2"><div className="flex items-center gap-1.5 rounded-full bg-[#fff1f1] px-3 py-2 text-xs font-bold text-[#ca596a]"><Heart size={14} fill="currentColor" /> فقط تیره‌ها</div><button type="button" onClick={() => setSoundOn((value) => !value)} aria-label={soundOn ? 'قطع صدا' : 'وصل صدا'} data-testid="sound-toggle-game" className="flex size-11 items-center justify-center rounded-2xl bg-[#f2eff8] text-[#6d6488] transition hover:bg-[#e8e1fc] focus-visible:outline-2 focus-visible:outline-[#7159d9]">{soundOn ? <Volume2 size={20} /> : <VolumeX size={20} />}</button></div>
            </header>
            <div className="relative min-h-0 flex-1 overflow-hidden border-y border-[#eae8f0] bg-[#f8f7fc]">
              <canvas ref={canvasRef} onPointerDown={handleTap} data-testid="game-board" aria-label="صفحه کاشی‌ها؛ فقط کاشی‌های تیره را لمس کنید" className="absolute inset-0 h-full w-full cursor-pointer touch-none" />
            </div>
            <footer className="flex min-h-[68px] items-center justify-center gap-2 px-4 pb-[max(8px,env(safe-area-inset-bottom))] text-sm font-semibold text-[#827a99]"><span className="size-3 rounded bg-[#25253e]" /> روی کاشی‌های تیره ضربه بزن <Sparkles size={17} className="text-[#7159d9]" /></footer>
          </div>
        )}

        {screen === 'over' && (
          <div className="flex min-h-0 flex-1 flex-col px-6 pb-[max(28px,env(safe-area-inset-bottom))] pt-[max(28px,env(safe-area-inset-top))] sm:px-10" data-testid="game-over-screen">
            <div className="flex items-center gap-2 text-sm font-bold text-[#5b5377]"><span className="flex size-9 items-center justify-center rounded-xl bg-[#eee9ff] text-[#7159d9]"><Zap size={19} fill="currentColor" /></span> ضربه به کاشی</div>
            <div className="flex flex-1 flex-col items-center justify-center text-center">
              <div className="mb-7 flex size-24 items-center justify-center rounded-[30px] bg-[#fff0e0] text-[#e2a340] shadow-[0_16px_36px_rgba(226,163,64,0.16)]"><Trophy size={47} strokeWidth={1.8} /></div>
              <p className="text-sm font-bold text-[#938ca7]">بازی تموم شد!</p>
              <h1 className="mt-2 text-3xl font-black">آفرین، خوب بازی کردی!</h1>
              <div className="mt-8 w-full max-w-[300px] rounded-[26px] border border-[#ece8f4] bg-white px-6 py-5 shadow-[0_14px_40px_rgba(73,54,128,0.07)]">
                <p className="text-sm font-semibold text-[#8c849d]">امتیاز نهایی</p>
                <p className="mt-1 text-6xl font-black tabular-nums leading-tight text-[#7159d9]" data-testid="final-score">{finalScore.toLocaleString('fa-IR')}</p>
                <div className="mx-auto mt-3 h-px w-full bg-[#f0edf5]" />
                <p className="mt-3 flex items-center justify-center gap-2 text-sm font-bold text-[#746d86]" data-testid="best-score-over"><Trophy size={16} className="text-[#e2a340]" /> بهترین رکورد: {best.toLocaleString('fa-IR')}</p>
              </div>
              <p className="mt-6 text-sm text-[#8e879f]">این بار چند تا کاشی بیشتر می‌زنی؟</p>
            </div>
            <button type="button" onClick={startGame} data-testid="restart-button" className="flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-[#7159d9] px-6 text-base font-extrabold text-white shadow-[0_10px_24px_rgba(113,89,217,0.27)] transition hover:bg-[#624bc9] active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7159d9]"><RotateCcw size={20} /> بازی مجدد</button>
          </div>
        )}
      </div>
    </main>
  );
}

export default App;

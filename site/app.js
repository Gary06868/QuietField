// Optional previews only. No analytics, accounts or background requests.
const labels = document.body.dataset;
const rows = [...document.querySelectorAll('.sample')];
const status = document.querySelector('.play-error');
let request = 0;
function render(row, playing, loading = false) {
  const button = row.querySelector('button');
  button.disabled = loading;
  button.setAttribute('aria-pressed', String(playing));
  const label = loading ? labels.loading : playing ? labels.pause : labels.play;
  button.setAttribute('aria-label', label + ' ' + button.dataset.name);
  row.querySelector('.play-mark').textContent = loading ? '…' : playing ? 'Ⅱ' : '▶';
  row.querySelector('.sr-only').textContent = label;
  row.classList.toggle('active', playing);
}
function stopAll() {
  rows.forEach(row => { const audio = row.querySelector('audio'); audio.pause(); audio.currentTime = 0; render(row, false); });
}
rows.forEach(row => {
  const audio = row.querySelector('audio'), button = row.querySelector('button');
  audio.volume = .45;
  button.addEventListener('click', async () => {
    const pause = !audio.paused, generation = ++request;
    stopAll(); status.textContent = '';
    if (pause) return;
    render(row, false, true);
    try {
      await audio.play();
      if (generation !== request) { audio.pause(); return; }
      render(row, true);
    } catch {
      if (generation === request) { render(row, false); status.textContent = labels.error; }
    }
  });
  audio.addEventListener('ended', () => render(row, false));
  audio.addEventListener('error', () => { render(row, false); status.textContent = labels.error; });
});
document.addEventListener('visibilitychange', () => { if (document.hidden) { request++; stopAll(); } });

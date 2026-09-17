// Used by render-site-previews.py; shares the app's loop and loudness DSP.
import fs from 'node:fs';
import {makeLoop} from '../src/dsp.js';
import {normalizeLoudness} from '../src/loudness.js';

const job = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const tracks = new Map();
for (const source of job.sources) {
  const bytes = fs.readFileSync(source.pcm);
  const raw = new Float32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 4);
  const channels = Array.from({length: source.channels}, (_, c) =>
    Float32Array.from({length: raw.length / source.channels}, (_, i) => raw[i * source.channels + c]));
  const loop = makeLoop(channels, source.rate, source.crossfade || 4);
  const loudness = normalizeLoudness(loop.channels, source.rate);
  tracks.set(source.id, {loop, loudness});
}
const report = [];
for (const preview of job.previews) {
  const rate = job.sources[0].rate, frames = rate * job.seconds;
  const output = new Float32Array(frames * 2);
  const busGain = .7 / Math.sqrt(Object.keys(preview.mix).length);
  const layers = [];
  for (const [id, volume] of Object.entries(preview.mix)) {
    const {loop, loudness} = tracks.get(id);
    for (let i = 0; i < frames; i++) for (let c = 0; c < 2; c++) {
      output[i * 2 + c] += loop.channels[c % loop.channels.length][i % loop.channels[0].length] * volume * busGain;
    }
    layers.push({soundId: id, volume, loopSeconds: loop.duration,
      crossfadeSeconds: loop.crossfade, normalizationGainDb: loudness.gainDb});
  }
  // The web master is level-matched by the Python encoder, independently of
  // the app's adjustable master and real-time compressor.
  fs.writeFileSync(preview.pcm, Buffer.from(output.buffer));
  report.push({file: preview.file, layers});
}
fs.writeFileSync(job.report, JSON.stringify(report, null, 2));

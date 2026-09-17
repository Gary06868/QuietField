// The rendered loop ends at head[X-1] and starts at head[X]: adjacent
// original samples, not an end/start jump. All transitions run in PCM.
export function makeLoop(channels, rate, seconds = 4) {
  const length = channels[0].length;
  if (length < rate * .3) throw new Error('音频太短，请选择至少 0.3 秒的录音');
  const block = Math.max(1, Math.floor(rate * .02));
  let peak = 0;
  for (const c of channels) for (const v of c) peak = Math.max(peak, Math.abs(v));
  if (peak < 1e-7) throw new Error('这段音频没有可听见的声音');
  const threshold = Math.max(1e-7, peak * .001);
  function audible(start) {
    let sum = 0, n = 0;
    for (const c of channels) for (let i = start; i < Math.min(start + block, length); i++) {sum += c[i] * c[i]; n++;}
    return Math.sqrt(sum / n) > threshold;
  }
  let start = 0, end = length;
  while (start + block < end && !audible(start)) start += block;
  while (end - block > start && !audible(end - block)) end -= block;
  let n = end - start;
  const fade = Math.max(2, Math.min(Math.round(rate * seconds), Math.floor(n / 4)));
  if (n < 8) throw new Error('有效声音太短');
  // An exactly representable duration avoids Chromium's fractional loop-end
  // rounding edge case, which can repeat the last render quantum forever.
  // At 48 kHz the odd factor is 375: this trims less than 7.813 ms, before
  // constructing the crossfade, so it never introduces a new splice.
  let quantum=rate;while(quantum%2===0)quantum/=2;
  const extra=(n-fade)%quantum;
  if(n-extra>fade*2){n-=extra;end-=extra;}
  const size = n - fade;
  const output = channels.map(c => {
    const dst = new Float32Array(size);
    dst.set(c.subarray(start + fade, end - fade));
    let dot = 0, aa = 0, bb = 0;
    for (let i = 0; i < fade; i++) {
      const a = c[end - fade + i], b = c[start + i];
      dot += a * b; aa += a * a; bb += b * b;
    }
    const correlation = Math.max(0, Math.min(1, dot / Math.sqrt(aa * bb || 1)));
    for (let i = 0; i < fade; i++) {
      const t = i / (fade - 1), a = Math.cos(t * Math.PI / 2), b = Math.sin(t * Math.PI / 2);
      const norm = Math.sqrt(1 + 2 * correlation * a * b);
      dst[n - 2 * fade + i] = (c[end - fade + i] * a + c[start + i] * b) / norm;
    }
    return dst;
  });
  // Leave headroom without normalizing quiet recordings upwards.
  let outPeak = 0;
  for (const c of output) for (const v of c) outPeak = Math.max(outPeak, Math.abs(v));
  if (outPeak > .95) for (const c of output) for (let i = 0; i < c.length; i++) c[i] *= .95 / outPeak;
  return {channels: output, rate, trimmed: (length - n) / rate, crossfade: fade / rate, duration: size / rate};
}

export function makeNoise(kind, rate = 48000, duration = 40, seed = 1234567) {
  let state = seed >>> 0;
  const random = () => {state ^= state << 13; state ^= state >>> 17; state ^= state << 5; return (state >>> 0) / 2147483648 - 1;};
  const channels = Array.from({length:2}, () => {
    const data = new Float32Array(Math.floor(rate * duration));
    let brown = 0, b0=0,b1=0,b2=0,b3=0,b4=0,b5=0,b6=0;
    for (let i = 0; i < data.length; i++) {
      const w = random();
      if (kind === 'brown-noise') {brown = (brown + .02*w)/1.02; data[i]=brown*1.6;}
      else if (kind === 'pink-noise') {
        b0=.99886*b0+w*.0555179; b1=.99332*b1+w*.0750759; b2=.969*b2+w*.153852;
        b3=.8665*b3+w*.3104856; b4=.55*b4+w*.5329522; b5=-.7616*b5-w*.016898;
        data[i]=(b0+b1+b2+b3+b4+b5+b6+w*.5362)*.045; b6=w*.115926;
      } else data[i]=w*.22;
    }
    return data;
  });
  return makeLoop(channels, rate, 3);
}

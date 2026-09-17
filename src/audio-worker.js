import {makeLoop, makeNoise} from './dsp.js';
import {normalizeLoudness} from './loudness.js';
self.onmessage = ({data}) => {
  try {
    const result = data.kind ? makeNoise(data.kind, data.rate) : makeLoop(data.channels, data.rate, data.seconds);
    result.loudness=normalizeLoudness(result.channels,result.rate);
    self.postMessage({id:data.id,result},result.channels.map(c=>c.buffer));
  } catch (error) {self.postMessage({id:data.id,error:error.message});}
};

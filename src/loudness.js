export const trackVolume=v=>Math.max(0,Math.min(3,Number(v)||0));
export const masterVolume=v=>Math.max(0,Math.min(1,Number(v)||0));

// A fixed gain per recording, not a moving AGC: ambient sound does not pump.
// Ignore near-silent 100 ms blocks when estimating the audible baseline.
export function normalizeLoudness(channels,rate) {
  const size=channels[0].length,block=Math.max(1,Math.round(rate*.1));
  const blocks=[];let total=0,count=0;
  for(let start=0;start<size;start+=block){
    let sum=0,n=0;
    for(const c of channels)for(let i=start;i<Math.min(size,start+block);i++){sum+=c[i]*c[i];n++;}
    blocks.push({sum,n,mean:sum/n});total+=sum;count+=n;
  }
  const gate=Math.max(1e-10,total/count*.1);let energy=0,samples=0;
  for(const b of blocks)if(b.mean>gate){energy+=b.sum;samples+=b.n;}
  const inputRms=Math.sqrt(energy/Math.max(1,samples));
  const gain=inputRms>1e-8?Math.min(32,.12/inputRms):1;
  let limited=0,outputEnergy=0;
  for(const c of channels)for(let i=0;i<size;i++){
    const value=c[i]*gain,mag=Math.abs(value);
    // Smoothly restrain exceptional transients without letting their peaks
    // prevent gain correction for the rest of a very quiet recording.
    const out=mag<=.7?value:Math.sign(value)*(.7+.25*Math.tanh((mag-.7)/.25));
    if(mag>.7)limited++;
    c[i]=out;outputEnergy+=out*out;
  }
  return {gainDb:20*Math.log10(gain),inputRms,outputRms:Math.sqrt(outputEnergy/count),limitedFraction:limited/count};
}

export function protectionCurve() {
  return Float32Array.from({length:16385},(_,i)=>{
    const x=i/8192-1,mag=Math.abs(x);
    return mag<=.7?x:Math.sign(x)*(.7+.2*Math.tanh((mag-.7)/.2));
  });
}

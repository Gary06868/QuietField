"""Reproduce the approved G treatment from the unchanged SoundBible source.

Optional offline authoring tool: python -m pip install numpy soundfile
The rendered WAV is bundled in public/processed, so normal builds need no Python.
"""
from pathlib import Path
import hashlib,json
import numpy as np
import soundfile as sf

ROOT=Path(__file__).resolve().parents[1]
SOURCE=ROOT/'public/sounds/wav/wav-waves.wav'
OUT=ROOT/'public/processed/wav-waves-g.wav'
SOURCE_SHA='05df3e036af5700ee357be14db7593702c96eeb1307406c6998b523bac3a29e1'
assert hashlib.sha256(SOURCE.read_bytes()).hexdigest()==SOURCE_SHA
x,sr=sf.read(SOURCE,dtype='float64',always_2d=True)
assert sr==44100 and x.shape[1]==2
x-=x.mean(axis=0,keepdims=True)
padding=sr;p=np.pad(x,((padding,padding),(0,0)),mode='reflect')
freq=np.fft.rfftfreq(len(p),1/sr)
hp=1/np.sqrt(1+(180/np.maximum(freq,.001))**8)
d=np.fft.irfft(np.fft.rfft(p,axis=0)*hp[:,None],n=len(p),axis=0)[padding:padding+len(x)]
# Set the same fixed reference level as the reviewed D excerpt BEFORE G.
# No gain recovery is performed after the wind reduction.
reference=d[10*sr:30*sr]
fixedGain=(10**(-24/20))/np.sqrt(np.mean(reference*reference))
fixedGain=min(fixedGain,.85/np.max(np.abs(d)))
d*=fixedGain

nfft=4096;hop=1024;pad=nfft;win=np.hanning(nfft)
p=np.pad(d,((pad,pad),(0,0)),mode='reflect')
starts=np.arange(0,len(p)-nfft+1,hop)
z=np.array([np.fft.rfft(p[i:i+nfft]*win[:,None],axis=0) for i in starts])
power=np.mean(np.abs(z)**2,axis=2);freq=np.fft.rfftfreq(nfft,1/sr)
low=power[:,(freq>=180)&(freq<450)].sum(axis=1)
water=power[:,(freq>=900)&(freq<5000)].sum(axis=1)
ratio=low/np.maximum(water,1e-15)
referenceRatio=max(1.2,float(np.quantile(ratio,.4)))
depth=np.clip(10*np.log10(np.maximum(ratio/referenceRatio,1)),0,14)
span=25;depth=np.convolve(np.pad(depth,(span//2,span//2),mode='edge'),np.ones(span)/span,mode='valid')
shape=1/(1+(freq/520)**6);mask=10**(-depth[:,None]*shape[None,:]/20)
frames=np.fft.irfft(z*mask[:,:,None],n=nfft,axis=1)*win[None,:,None]
f=np.zeros_like(p);weights=np.zeros(len(p))
for i,frame in zip(starts,frames):f[i:i+nfft]+=frame;weights[i:i+nfft]+=win**2
f/=np.maximum(weights[:,None],1e-12);f=f[pad:pad+len(x)]
p=np.pad(f,((padding,padding),(0,0)),mode='reflect');freq=np.fft.rfftfreq(len(p),1/sr)
lowMid=-3*np.exp(-.5*(np.log2(np.maximum(freq,1)/360)/.8)**2)
highShelf=-3*(freq/3200)**4/(1+(freq/3200)**4)
gain=10**((lowMid+highShelf)/20)
g=np.fft.irfft(np.fft.rfft(p,axis=0)*gain[:,None],n=len(p),axis=0)[padding:padding+len(x)]
assert g.shape==x.shape and np.isfinite(g).all() and np.max(np.abs(g))<1
edge=int(.025*sr);g[:edge]*=np.linspace(0,1,edge)[:,None];g[-edge:]*=np.linspace(1,0,edge)[:,None]
OUT.parent.mkdir(exist_ok=True);sf.write(OUT,g,sr,subtype='PCM_24')
info=sf.info(OUT)
record=dict(id='wav-waves',variant='G',path='./processed/wav-waves-g.wav',sha256=hashlib.sha256(OUT.read_bytes()).hexdigest(),
 duration=info.duration,sampleRate=sr,channels=2,format='WAV',bitDepth=24,preserveLoudness=True,
 source='https://soundbible.com/885-Sea-Waves.html',author='Mike Koenig',license='CC BY 3.0',licenseURL='https://creativecommons.org/licenses/by/3.0/',
 originalSHA256=SOURCE_SHA,originalSampleRate=44100,originalBitDepth=16,originalDuration=info.duration,
 processing='180 Hz high-pass, shared stereo adaptive wind reduction, gentle low-mid and high-shelf attenuation; no gain recovery after G.',
 userApproved='2026-10-08: selected G and requested only the processed recording, with no extra settings or controls.',
 peak=float(np.max(np.abs(g))),rmsDbFS=float(20*np.log10(np.sqrt(np.mean(g*g)))),fixedReferenceGainDb=float(20*np.log10(fixedGain)))
(ROOT/'public/licenses/wave-g-processing.json').write_text(json.dumps(record,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
assert hashlib.sha256(SOURCE.read_bytes()).hexdigest()==SOURCE_SHA
print(json.dumps(record,ensure_ascii=False))

import React from 'react';
import {SlidersHorizontal} from 'lucide-react';
export function ToneControl({tone,onTone,locale,compact=false,disabled=false}){
 const en=locale==='en';
 return <label className={`tone-control${compact?' tone-control-compact':''}`} title={en?'Tone · adjusts playback without changing recordings':'音色 · 调节播放，不改动录音文件'}><SlidersHorizontal size={16}/><span className="tone-label">{en?'Tone':'音色'}</span><select aria-label={en?'Tone':'音色'} value={tone||'natural'} disabled={disabled} onChange={event=>onTone(event.target.value)}><option value="natural">{en?'Natural':'原声'}</option><option value="soft">{en?'Soft':'柔和'}</option><option value="deep">{en?'Deep':'低沉'}</option></select></label>;
}

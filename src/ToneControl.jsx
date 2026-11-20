import React from 'react';
import {SlidersHorizontal} from 'lucide-react';
export function ToneControl({tone,onTone,locale,compact=false,disabled=false}){
 const en=locale==='en';
 const label=en?'Tone':'音色';
 const natural=en?'Natural':'原声';
 const deep=en?'Deep':'低沉';
 const valueText=tone===0?natural:tone===50?(en?'Soft':'柔和'):tone===100?deep:`${tone}%`;
 return <label className={`tone-control${compact?' tone-control-compact':''}`} title={`${label} · ${natural} → ${deep}`}>
  <SlidersHorizontal size={16} aria-hidden="true"/><span className="tone-label">{label}</span>
  <input type="range" aria-label={label} aria-valuetext={valueText} min="0" max="100" step="1" value={tone} disabled={disabled} style={{'--value':`${tone}%`}} onChange={event=>onTone(event.target.valueAsNumber)}/>
  <span className="tone-value" aria-hidden="true">{valueText}</span>
 </label>;
}

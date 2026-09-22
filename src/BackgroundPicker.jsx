import React,{useId} from 'react';
import {Check,Sparkles} from 'lucide-react';
import {backgrounds,getBackground,validateBackground} from './backgrounds.js';

const labels = {
  'zh-CN': {
    intro:'换一片风景，留住同一份宁静。',
    options:'选择背景',selected:'已选择',landscape:'风景',solid:'纯色',dynamic:'可动态',
    motion:'轻柔动态',motionHint:'让极光缓缓流动、星光轻轻明灭。',
    staticHint:'选择极光或星海时生效，其他背景保持静止。',
    footnote:'轻量模式、系统减少动态效果或窗口隐藏时，动态会自动暂停。',
  },
  en: {
    intro:'A different view. The same quiet moment.',
    options:'Choose a background',selected:'Selected',landscape:'Landscape',solid:'Solid',dynamic:'Motion',
    motion:'Gentle motion',motionHint:'Let the aurora drift and the stars softly shimmer.',
    staticHint:'Applies to aurora and starlight; other backgrounds stay still.',
    footnote:'Motion pauses in light mode, with reduced motion enabled, or while the window is hidden.',
  },
};

export function BackgroundPicker({backgroundId,animateBackground=true,onSelect,onAnimateChange,locale='zh-CN'}) {
  const text = labels[locale === 'zh-CN' ? 'zh-CN' : 'en'];
  const selectedId = validateBackground(backgroundId);
  const current = getBackground(selectedId);
  const motionHintId = useId();

  return <div className="background-picker">
    <p className="background-picker-intro">{text.intro}</p>
    <div className="background-grid" role="group" aria-label={text.options}>
      {backgrounds.map(background => {
        const selected = selectedId === background.id;
        const name = locale === 'zh-CN' ? background.nameZh : background.nameEn;
        const style = background.image ? {backgroundImage:`url("${background.image}")`} : {backgroundColor:background.color};
        return <button type="button" key={background.id} className={`background-card${selected?' is-selected':''}`} aria-pressed={selected} onClick={() => onSelect(background.id)}>
          <span className={`background-swatch background-swatch--${background.id}`} style={style} aria-hidden="true">
            {background.animated && <Sparkles className="background-motion-icon" size={14}/>}
            {selected && <span className="background-selected-mark"><Check size={13} strokeWidth={2.5}/></span>}
          </span>
          <span className="background-card-copy"><span className="background-card-name">{name}</span><span className="background-card-kind">{text[background.kind]}</span></span>
        </button>;
      })}
    </div>
    <label className="background-motion-setting">
      <span className="background-motion-copy"><span>{text.motion}</span><span id={motionHintId}>{current.animated ? text.motionHint : text.staticHint}</span></span>
      <input type="checkbox" checked={Boolean(animateBackground)} onChange={event => onAnimateChange(event.target.checked)} aria-describedby={motionHintId}/>
      <span className="background-motion-switch" aria-hidden="true"/>
    </label>
    <p className="background-picker-note">{text.footnote}</p>
  </div>;
}
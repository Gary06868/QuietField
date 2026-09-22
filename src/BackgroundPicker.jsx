import React,{useId} from 'react';
import {Check,Sparkles} from 'lucide-react';
import {useReducedMotion} from './BackgroundScene.jsx';
import {backgrounds,getBackground,validateBackground} from './backgrounds.js';

const labels = {
  'zh-CN': {
    intro:'换一片风景，留住同一份宁静。',
    options:'选择背景',selected:'已选择',landscape:'静态风景',solid:'静态纯色',dynamic:'动态背景',
    motion:'轻柔动态',motionHint:'让极光缓缓流动、星海轻轻漂移。',
    staticHint:'选择极光或星海时生效，其他背景保持静止。',
    active:'背景正在轻柔流动。',paused:'动态已关闭，当前显示静态画面。',systemPaused:'系统已开启减少动态效果，背景动画已暂停。',lightPaused:'轻量模式已开启，背景动画已暂停。',disableLight:'关闭轻量模式',still:'这是静态背景。选择极光或星海，即可体验动态。',
    footnote:'轻量模式、系统减少动态效果或窗口隐藏时，动态会自动暂停。',
  },
  en: {
    intro:'A different view. The same quiet moment.',
    options:'Choose a background',selected:'Selected',landscape:'Still landscape',solid:'Still color',dynamic:'Animated',
    motion:'Gentle motion',motionHint:'Let the aurora flow and the starfield gently drift.',
    staticHint:'Applies to aurora and starlight; other backgrounds stay still.',
    active:'Your background is gently moving.',paused:'Motion is off. A still background is shown.',systemPaused:'Your system has reduced motion enabled. Background motion is paused.',lightPaused:'Light mode is on. Background motion is paused.',disableLight:'Turn off light mode',still:'This is a still background. Choose aurora or starlight for motion.',
    footnote:'Motion pauses in light mode, with reduced motion enabled, or while the window is hidden.',
  },
};

export function BackgroundPicker({backgroundId,animateBackground=true,onSelect,onAnimateChange,reducedEffects=false,onDisableReducedEffects,locale='zh-CN'}) {
  const text = labels[locale === 'zh-CN' ? 'zh-CN' : 'en'];
  const selectedId = validateBackground(backgroundId);
  const current = getBackground(selectedId);
  const motionHintId = useId();
  const reducedMotion = useReducedMotion();
  const status = !current.animated ? text.still : reducedMotion ? text.systemPaused : reducedEffects ? text.lightPaused : !animateBackground ? text.paused : text.active;

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
    <div className="background-motion-status" role="status"><p>{status}</p>{current.animated&&reducedEffects&&onDisableReducedEffects&&<button type="button" className="outline" onClick={onDisableReducedEffects}>{text.disableLight}</button>}</div>
    <p className="background-picker-note">{text.footnote}</p>
  </div>;
}
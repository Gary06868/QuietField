export const backgrounds = [
  {id:'alpine',nameZh:'蓝境雪山',nameEn:'Alpine blue',kind:'landscape',image:'./art/blue-mountains.png'},
  {id:'forest',nameZh:'雾隐深林',nameEn:'Misty forest',kind:'landscape',image:'./art/misty-forest.png'},
  {id:'coast',nameZh:'月下海岸',nameEn:'Moonlit coast',kind:'landscape',image:'./art/moonlit-coast.png'},
  {id:'midnight',nameZh:'午夜蓝',nameEn:'Midnight',kind:'solid',color:'#060e1a'},
  {id:'deep-ocean',nameZh:'深海蓝',nameEn:'Deep ocean',kind:'solid',color:'#0c1d30'},
  {id:'graphite',nameZh:'石墨灰',nameEn:'Graphite',kind:'solid',color:'#181d26'},
  {id:'aurora',nameZh:'极光微澜',nameEn:'Quiet aurora',kind:'dynamic',animated:true},
  {id:'starlight',nameZh:'静夜星海',nameEn:'Starlit night',kind:'dynamic',animated:true},
];

const backgroundIds = new Set(backgrounds.map(background => background.id));

export function validateBackground(value) {
  return typeof value === 'string' && backgroundIds.has(value) ? value : 'alpine';
}

export function getBackground(value) {
  return backgrounds.find(background => background.id === validateBackground(value));
}
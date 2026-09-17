import React,{createContext,useContext,useEffect,useState} from 'react';
import {readSettings} from './storage.js';
import {resolveLocale,translate,soundName} from './i18n.js';
const LocaleContext=createContext(null);
export function LocaleProvider({children}){
  const [locale,setLocale]=useState(()=>resolveLocale(readSettings().locale,navigator.languages));
  useEffect(()=>{document.documentElement.lang=locale;document.title=locale==='en'?'Quiet Field · A little quiet, just for you':'静野 · 留一点安静给自己';},[locale]);
  const value={locale,setLocale,t:(key,params)=>translate(locale,key,params),nameOf:sound=>soundName(sound,locale)};
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}
export const useLocale=()=>useContext(LocaleContext);

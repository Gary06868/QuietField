import React from 'react';
import {WindowChrome} from './WindowChrome.jsx';
import {useLocale} from './LocaleContext.jsx';
function Recovery(){
 const {t}=useLocale();
 return <div style={{padding:'70px 32px',maxWidth:640,margin:'auto'}}><WindowChrome/><h1>{t('暂时无法打开界面')}</h1><p style={{margin:'20px 0',lineHeight:1.8}}>{t('可以先重新打开，或重置界面偏好。导入的音频副本会保留。')}</p><button className="primary" onClick={()=>location.reload()}>{t('重新打开')}</button><button className="outline" style={{marginLeft:12}} onClick={()=>{try{localStorage.removeItem('quiet-field-settings');}catch{}location.reload();}}>{t('重置界面偏好')}</button></div>;
}
export class ErrorBoundary extends React.Component{
 state={failed:false};static getDerivedStateFromError(){return{failed:true};}
 render(){return this.state.failed?<Recovery/>:this.props.children;}
}

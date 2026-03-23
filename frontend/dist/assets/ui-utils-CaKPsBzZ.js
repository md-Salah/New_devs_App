var e=Object.defineProperty,t=Object.defineProperties,r=Object.getOwnPropertyDescriptors,a=Object.getOwnPropertySymbols,o=Object.prototype.hasOwnProperty,i=Object.prototype.propertyIsEnumerable,s=(t,r,a)=>r in t?e(t,r,{enumerable:!0,configurable:!0,writable:!0,value:a}):t[r]=a,n=(e,t)=>{for(var r in t||(t={}))o.call(t,r)&&s(e,r,t[r]);if(a)for(var r of a(t))i.call(t,r)&&s(e,r,t[r]);return e},l=(e,a)=>t(e,r(a));import{r as d}from"./react-router-qpxRsT6p.js";import"./data-query-DIoVICGX.js";let c,p,u,m={data:""},f=/(?:([\u0080-\uFFFF\w-%@]+) *:? *([^{;]+?);|([^;}{]*?) *{)|(}\s*)/g,y=/\/\*[^]*?\*\/|  +/g,g=/\n+/g,b=(e,t)=>{let r="",a="",o="";for(let i in e){let s=e[i];"@"==i[0]?"i"==i[1]?r=i+" "+s+";":a+="f"==i[1]?b(s,i):i+"{"+b(s,"k"==i[1]?"":t)+"}":"object"==typeof s?a+=b(s,t?t.replace(/([^,])+/g,e=>i.replace(/([^,]*:\S+\([^)]*\))|([^,])+/g,t=>/&/.test(t)?t.replace(/&/g,e):e?e+" "+t:t)):i):null!=s&&(i=/^--/.test(i)?i:i.replace(/[A-Z]/g,"-$&").toLowerCase(),o+=b.p?b.p(i,s):i+":"+s+";")}return r+(t&&o?t+"{"+o+"}":o)+a},h={},v=e=>{if("object"==typeof e){let t="";for(let r in e)t+=r+v(e[r]);return t}return e};function x(e){let t=this||{},r=e.call?e(t.p):e;return((e,t,r,a,o)=>{let i=v(e),s=h[i]||(h[i]=(e=>{let t=0,r=11;for(;t<e.length;)r=101*r+e.charCodeAt(t++)>>>0;return"go"+r})(i));if(!h[s]){let t=i!==e?e:(e=>{let t,r,a=[{}];for(;t=f.exec(e.replace(y,""));)t[4]?a.shift():t[3]?(r=t[3].replace(g," ").trim(),a.unshift(a[0][r]=a[0][r]||{})):a[0][t[1]]=t[2].replace(g," ").trim();return a[0]})(e);h[s]=b(o?{["@keyframes "+s]:t}:t,r?"":"."+s)}let n=r&&h.g?h.g:null;return r&&(h.g=h[s]),l=h[s],d=t,c=a,(p=n)?d.data=d.data.replace(p,l):-1===d.data.indexOf(l)&&(d.data=c?l+d.data:d.data+l),s;var l,d,c,p})(r.unshift?r.raw?((e,t,r)=>e.reduce((e,a,o)=>{let i=t[o];if(i&&i.call){let e=i(r),t=e&&e.props&&e.props.className||/^go/.test(e)&&e;i=t?"."+t:e&&"object"==typeof e?e.props?"":b(e,""):!1===e?"":e}return e+a+(null==i?"":i)},""))(r,[].slice.call(arguments,1),t.p):r.reduce((e,r)=>Object.assign(e,r&&r.call?r(t.p):r),{}):r,(a=t.target,"object"==typeof window?((a?a.querySelector("#_goober"):window._goober)||Object.assign((a||document.head).appendChild(document.createElement("style")),{innerHTML:" ",id:"_goober"})).firstChild:a||m),t.g,t.o,t.k);var a}x.bind({g:1});let w=x.bind({k:1});function E(e,t){let r=this||{};return function(){let t=arguments;return function a(o,i){let s=Object.assign({},o),n=s.className||a.className;r.p=Object.assign({theme:p&&p()},s),r.o=/ *go\d+/.test(n),s.className=x.apply(r,t)+(n?" "+n:"");let l=e;return e[0]&&(l=s.as||e,delete s.as),u&&l[0]&&u(s),c(l,s)}}}var O=(e,t)=>(e=>"function"==typeof e)(e)?e(t):e,j=(()=>{let e=0;return()=>(++e).toString()})(),k=(()=>{let e;return()=>{if(void 0===e&&typeof window<"u"){let t=matchMedia("(prefers-reduced-motion: reduce)");e=!t||t.matches}return e}})(),$="default",C=(e,t)=>{let{toastLimit:r}=e.settings;switch(t.type){case 0:return l(n({},e),{toasts:[t.toast,...e.toasts].slice(0,r)});case 1:return l(n({},e),{toasts:e.toasts.map(e=>e.id===t.toast.id?n(n({},e),t.toast):e)});case 2:let{toast:a}=t;return C(e,{type:e.toasts.find(e=>e.id===a.id)?1:0,toast:a});case 3:let{toastId:o}=t;return l(n({},e),{toasts:e.toasts.map(e=>e.id===o||void 0===o?l(n({},e),{dismissed:!0,visible:!1}):e)});case 4:return void 0===t.toastId?l(n({},e),{toasts:[]}):l(n({},e),{toasts:e.toasts.filter(e=>e.id!==t.toastId)});case 5:return l(n({},e),{pausedAt:t.time});case 6:let i=t.time-(e.pausedAt||0);return l(n({},e),{pausedAt:void 0,toasts:e.toasts.map(e=>l(n({},e),{pauseDuration:e.pauseDuration+i}))})}},D=[],P={toasts:[],pausedAt:void 0,settings:{toastLimit:20}},I={},A=(e,t=$)=>{I[t]=C(I[t]||P,e),D.forEach(([e,r])=>{e===t&&r(I[t])})},N=e=>Object.keys(I).forEach(t=>A(e,t)),z=(e=$)=>t=>{A(t,e)},F={blank:4e3,error:4e3,success:2e3,loading:1/0,custom:4e3},L=e=>(t,r)=>{let a=((e,t="blank",r)=>l(n({createdAt:Date.now(),visible:!0,dismissed:!1,type:t,ariaProps:{role:"status","aria-live":"polite"},message:e,pauseDuration:0},r),{id:(null==r?void 0:r.id)||j()}))(t,e,r);return z(a.toasterId||(e=>Object.keys(I).find(t=>I[t].toasts.some(t=>t.id===e)))(a.id))({type:2,toast:a}),a.id},M=(e,t)=>L("blank")(e,t);M.error=L("error"),M.success=L("success"),M.loading=L("loading"),M.custom=L("custom"),M.dismiss=(e,t)=>{let r={type:3,toastId:e};t?z(t)(r):N(r)},M.dismissAll=e=>M.dismiss(void 0,e),M.remove=(e,t)=>{let r={type:4,toastId:e};t?z(t)(r):N(r)},M.removeAll=e=>M.remove(void 0,e),M.promise=(e,t,r)=>{let a=M.loading(t.loading,n(n({},r),null==r?void 0:r.loading));return"function"==typeof e&&(e=e()),e.then(e=>{let o=t.success?O(t.success,e):void 0;return o?M.success(o,n(n({id:a},r),null==r?void 0:r.success)):M.dismiss(a),e}).catch(e=>{let o=t.error?O(t.error,e):void 0;o?M.error(o,n(n({id:a},r),null==r?void 0:r.error)):M.dismiss(a)}),e};var S,T=w`
from {
  transform: scale(0) rotate(45deg);
	opacity: 0;
}
to {
 transform: scale(1) rotate(45deg);
  opacity: 1;
}`,H=w`
from {
  transform: scale(0);
  opacity: 0;
}
to {
  transform: scale(1);
  opacity: 1;
}`,R=w`
from {
  transform: scale(0) rotate(90deg);
	opacity: 0;
}
to {
  transform: scale(1) rotate(90deg);
	opacity: 1;
}`,_=E("div")`
  width: 20px;
  opacity: 0;
  height: 20px;
  border-radius: 10px;
  background: ${e=>e.primary||"#ff4b4b"};
  position: relative;
  transform: rotate(45deg);

  animation: ${T} 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)
    forwards;
  animation-delay: 100ms;

  &:after,
  &:before {
    content: '';
    animation: ${H} 0.15s ease-out forwards;
    animation-delay: 150ms;
    position: absolute;
    border-radius: 3px;
    opacity: 0;
    background: ${e=>e.secondary||"#fff"};
    bottom: 9px;
    left: 4px;
    height: 2px;
    width: 12px;
  }

  &:before {
    animation: ${R} 0.15s ease-out forwards;
    animation-delay: 180ms;
    transform: rotate(90deg);
  }
`,q=w`
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
`,U=E("div")`
  width: 12px;
  height: 12px;
  box-sizing: border-box;
  border: 2px solid;
  border-radius: 100%;
  border-color: ${e=>e.secondary||"#e0e0e0"};
  border-right-color: ${e=>e.primary||"#616161"};
  animation: ${q} 1s linear infinite;
`,B=w`
from {
  transform: scale(0) rotate(45deg);
	opacity: 0;
}
to {
  transform: scale(1) rotate(45deg);
	opacity: 1;
}`,Y=w`
0% {
	height: 0;
	width: 0;
	opacity: 0;
}
40% {
  height: 0;
	width: 6px;
	opacity: 1;
}
100% {
  opacity: 1;
  height: 10px;
}`,Z=E("div")`
  width: 20px;
  opacity: 0;
  height: 20px;
  border-radius: 10px;
  background: ${e=>e.primary||"#61d345"};
  position: relative;
  transform: rotate(45deg);

  animation: ${B} 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)
    forwards;
  animation-delay: 100ms;
  &:after {
    content: '';
    box-sizing: border-box;
    animation: ${Y} 0.2s ease-out forwards;
    opacity: 0;
    animation-delay: 200ms;
    position: absolute;
    border-right: 2px solid;
    border-bottom: 2px solid;
    border-color: ${e=>e.secondary||"#fff"};
    bottom: 6px;
    left: 6px;
    height: 10px;
    width: 6px;
  }
`,G=E("div")`
  position: absolute;
`,J=E("div")`
  position: relative;
  display: flex;
  justify-content: center;
  align-items: center;
  min-width: 20px;
  min-height: 20px;
`,K=w`
from {
  transform: scale(0.6);
  opacity: 0.4;
}
to {
  transform: scale(1);
  opacity: 1;
}`,Q=E("div")`
  position: relative;
  transform: scale(0.6);
  opacity: 0.4;
  min-width: 20px;
  animation: ${K} 0.3s 0.12s cubic-bezier(0.175, 0.885, 0.32, 1.275)
    forwards;
`,V=({toast:e})=>{let{icon:t,type:r,iconTheme:a}=e;return void 0!==t?"string"==typeof t?d.createElement(Q,null,t):t:"blank"===r?null:d.createElement(J,null,d.createElement(U,n({},a)),"loading"!==r&&d.createElement(G,null,"error"===r?d.createElement(_,n({},a)):d.createElement(Z,n({},a))))},W=e=>`\n0% {transform: translate3d(0,${-200*e}%,0) scale(.6); opacity:.5;}\n100% {transform: translate3d(0,0,0) scale(1); opacity:1;}\n`,X=e=>`\n0% {transform: translate3d(0,0,-1px) scale(1); opacity:1;}\n100% {transform: translate3d(0,${-150*e}%,-1px) scale(.6); opacity:0;}\n`,ee=E("div")`
  display: flex;
  align-items: center;
  background: #fff;
  color: #363636;
  line-height: 1.3;
  will-change: transform;
  box-shadow: 0 3px 10px rgba(0, 0, 0, 0.1), 0 3px 3px rgba(0, 0, 0, 0.05);
  max-width: 350px;
  pointer-events: auto;
  padding: 8px 10px;
  border-radius: 8px;
`,te=E("div")`
  display: flex;
  justify-content: center;
  margin: 4px 10px;
  color: inherit;
  flex: 1 1 auto;
  white-space: pre-line;
`,re=d.memo(({toast:e,position:t,style:r,children:a})=>{let o=e.height?((e,t)=>{let r=e.includes("top")?1:-1,[a,o]=k()?["0%{opacity:0;} 100%{opacity:1;}","0%{opacity:1;} 100%{opacity:0;}"]:[W(r),X(r)];return{animation:t?`${w(a)} 0.35s cubic-bezier(.21,1.02,.73,1) forwards`:`${w(o)} 0.4s forwards cubic-bezier(.06,.71,.55,1)`}})(e.position||t||"top-center",e.visible):{opacity:0},i=d.createElement(V,{toast:e}),s=d.createElement(te,n({},e.ariaProps),O(e.message,e));return d.createElement(ee,{className:e.className,style:n(n(n({},o),r),e.style)},"function"==typeof a?a({icon:i,message:s}):d.createElement(d.Fragment,null,i,s))});S=d.createElement,b.p=undefined,c=S,p=undefined,u=undefined;var ae=({id:e,className:t,style:r,onHeightUpdate:a,children:o})=>{let i=d.useCallback(t=>{if(t){let r=()=>{let r=t.getBoundingClientRect().height;a(e,r)};r(),new MutationObserver(r).observe(t,{subtree:!0,childList:!0,characterData:!0})}},[e,a]);return d.createElement("div",{ref:i,className:t,style:r},o)},oe=x`
  z-index: 9999;
  > * {
    pointer-events: auto;
  }
`,ie=({reverseOrder:e,position:t="top-center",toastOptions:r,gutter:a,children:o,toasterId:i,containerStyle:s,containerClassName:c})=>{let{toasts:p,handlers:u}=((e,t="default")=>{let{toasts:r,pausedAt:a}=((e={},t=$)=>{let[r,a]=d.useState(I[t]||P),o=d.useRef(I[t]);d.useEffect(()=>(o.current!==I[t]&&a(I[t]),D.push([t,a]),()=>{let e=D.findIndex(([e])=>e===t);e>-1&&D.splice(e,1)}),[t]);let i=r.toasts.map(t=>{var r,a,o;return l(n(n(n({},e),e[t.type]),t),{removeDelay:t.removeDelay||(null==(r=e[t.type])?void 0:r.removeDelay)||(null==e?void 0:e.removeDelay),duration:t.duration||(null==(a=e[t.type])?void 0:a.duration)||(null==e?void 0:e.duration)||F[t.type],style:n(n(n({},e.style),null==(o=e[t.type])?void 0:o.style),t.style)})});return l(n({},r),{toasts:i})})(e,t),o=d.useRef(new Map).current,i=d.useCallback((e,t=1e3)=>{if(o.has(e))return;let r=setTimeout(()=>{o.delete(e),s({type:4,toastId:e})},t);o.set(e,r)},[]);d.useEffect(()=>{if(a)return;let e=Date.now(),o=r.map(r=>{if(r.duration===1/0)return;let a=(r.duration||0)+r.pauseDuration-(e-r.createdAt);if(!(a<0))return setTimeout(()=>M.dismiss(r.id,t),a);r.visible&&M.dismiss(r.id)});return()=>{o.forEach(e=>e&&clearTimeout(e))}},[r,a,t]);let s=d.useCallback(z(t),[t]),c=d.useCallback(()=>{s({type:5,time:Date.now()})},[s]),p=d.useCallback((e,t)=>{s({type:1,toast:{id:e,height:t}})},[s]),u=d.useCallback(()=>{a&&s({type:6,time:Date.now()})},[a,s]),m=d.useCallback((e,t)=>{let{reverseOrder:a=!1,gutter:o=8,defaultPosition:i}=t||{},s=r.filter(t=>(t.position||i)===(e.position||i)&&t.height),n=s.findIndex(t=>t.id===e.id),l=s.filter((e,t)=>t<n&&e.visible).length;return s.filter(e=>e.visible).slice(...a?[l+1]:[0,l]).reduce((e,t)=>e+(t.height||0)+o,0)},[r]);return d.useEffect(()=>{r.forEach(e=>{if(e.dismissed)i(e.id,e.removeDelay);else{let t=o.get(e.id);t&&(clearTimeout(t),o.delete(e.id))}})},[r,i]),{toasts:r,handlers:{updateHeight:p,startPause:c,endPause:u,calculateOffset:m}}})(r,i);return d.createElement("div",{"data-rht-toaster":i||"",style:n({position:"fixed",zIndex:9999,top:16,left:16,right:16,bottom:16,pointerEvents:"none"},s),className:c,onMouseEnter:u.startPause,onMouseLeave:u.endPause},p.map(r=>{let i=r.position||t,s=((e,t)=>{let r=e.includes("top"),a=r?{top:0}:{bottom:0},o=e.includes("center")?{justifyContent:"center"}:e.includes("right")?{justifyContent:"flex-end"}:{};return n(n({left:0,right:0,display:"flex",position:"absolute",transition:k()?void 0:"all 230ms cubic-bezier(.21,1.02,.73,1)",transform:`translateY(${t*(r?1:-1)}px)`},a),o)})(i,u.calculateOffset(r,{reverseOrder:e,gutter:a,defaultPosition:t}));return d.createElement(ae,{id:r.id,key:r.id,onHeightUpdate:u.updateHeight,className:r.visible?oe:"",style:s},"custom"===r.type?O(r.message,r):o?o(r):d.createElement(re,{toast:r,position:i}))}))};export{ie as F,M as n};

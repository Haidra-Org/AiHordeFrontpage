import{$ as v,$a as xe,Aa as ie,Ba as Ne,C as Ae,Fb as $e,Gb as je,H as Ce,Hb as ze,Kb as oe,Lb as Ve,Ob as x,Pb as ae,Q as be,Qa as Be,S as ve,Sa as se,T as Z,Ta as K,U as y,Ua as X,W as w,Y as E,Ya as ke,Z as c,a as W,ba as Se,c as ye,ca as ne,d as te,da as Te,db as Ue,fa as Ie,g as N,ga as Re,ia as Me,m as Ee,n as Y,na as Oe,r as we,ra as re,s as B,sa as Pe,wa as k,ya as _e,z as Fe,za as Le}from"./chunk-OJB3JNYL.js";var Ke=null;function ue(){return Ke}function Zn(e){Ke??=e}var Ge=class{};var U=new w(""),Xe=(()=>{let t=class t{historyGo(n){throw new Error("")}};t.\u0275fac=function(r){return new(r||t)},t.\u0275prov=y({token:t,factory:()=>c(At),providedIn:"platform"});let e=t;return e})();var At=(()=>{let t=class t extends Xe{constructor(){super(),this._doc=c(U),this._location=window.location,this._history=window.history}getBaseHrefFromDOM(){return ue().getBaseHref(this._doc)}onPopState(n){let r=ue().getGlobalEventTarget(this._doc,"window");return r.addEventListener("popstate",n,!1),()=>r.removeEventListener("popstate",n)}onHashChange(n){let r=ue().getGlobalEventTarget(this._doc,"window");return r.addEventListener("hashchange",n,!1),()=>r.removeEventListener("hashchange",n)}get href(){return this._location.href}get protocol(){return this._location.protocol}get hostname(){return this._location.hostname}get port(){return this._location.port}get pathname(){return this._location.pathname}get search(){return this._location.search}get hash(){return this._location.hash}set pathname(n){this._location.pathname=n}pushState(n,r,i){this._history.pushState(n,r,i)}replaceState(n,r,i){this._history.replaceState(n,r,i)}forward(){this._history.forward()}back(){this._history.back()}historyGo(n=0){this._history.go(n)}getState(){return this._history.state}};t.\u0275fac=function(r){return new(r||t)},t.\u0275prov=y({token:t,factory:()=>new t,providedIn:"platform"});let e=t;return e})();function qe(e,t){if(e.length==0)return t;if(t.length==0)return e;let s=0;return e.endsWith("/")&&s++,t.startsWith("/")&&s++,s==2?e+t.substring(1):s==1?e+t:e+"/"+t}function We(e){let t=e.match(/#|\?|$/),s=t&&t.index||e.length,n=s-(e[s-1]==="/"?1:0);return e.slice(0,n)+e.slice(s)}function O(e){return e&&e[0]!=="?"?"?"+e:e}var ce=(()=>{let t=class t{historyGo(n){throw new Error("")}};t.\u0275fac=function(r){return new(r||t)},t.\u0275prov=y({token:t,factory:()=>c(bt),providedIn:"root"});let e=t;return e})(),Ct=new w(""),bt=(()=>{let t=class t extends ce{constructor(n,r){super(),this._platformLocation=n,this._removeListenerFns=[],this._baseHref=r??this._platformLocation.getBaseHrefFromDOM()??c(U).location?.origin??""}ngOnDestroy(){for(;this._removeListenerFns.length;)this._removeListenerFns.pop()()}onPopState(n){this._removeListenerFns.push(this._platformLocation.onPopState(n),this._platformLocation.onHashChange(n))}getBaseHref(){return this._baseHref}prepareExternalUrl(n){return qe(this._baseHref,n)}path(n=!1){let r=this._platformLocation.pathname+O(this._platformLocation.search),i=this._platformLocation.hash;return i&&n?`${r}${i}`:r}pushState(n,r,i,a){let o=this.prepareExternalUrl(i+O(a));this._platformLocation.pushState(n,r,o)}replaceState(n,r,i,a){let o=this.prepareExternalUrl(i+O(a));this._platformLocation.replaceState(n,r,o)}forward(){this._platformLocation.forward()}back(){this._platformLocation.back()}getState(){return this._platformLocation.getState()}historyGo(n=0){this._platformLocation.historyGo?.(n)}};t.\u0275fac=function(r){return new(r||t)(E(Xe),E(Ct,8))},t.\u0275prov=y({token:t,factory:t.\u0275fac,providedIn:"root"});let e=t;return e})();var vt=(()=>{let t=class t{constructor(n){this._subject=new Pe,this._urlChangeListeners=[],this._urlChangeSubscription=null,this._locationStrategy=n;let r=this._locationStrategy.getBaseHref();this._basePath=It(We(Ye(r))),this._locationStrategy.onPopState(i=>{this._subject.emit({url:this.path(!0),pop:!0,state:i.state,type:i.type})})}ngOnDestroy(){this._urlChangeSubscription?.unsubscribe(),this._urlChangeListeners=[]}path(n=!1){return this.normalize(this._locationStrategy.path(n))}getState(){return this._locationStrategy.getState()}isCurrentPathEqualTo(n,r=""){return this.path()==this.normalize(n+O(r))}normalize(n){return t.stripTrailingSlash(Tt(this._basePath,Ye(n)))}prepareExternalUrl(n){return n&&n[0]!=="/"&&(n="/"+n),this._locationStrategy.prepareExternalUrl(n)}go(n,r="",i=null){this._locationStrategy.pushState(i,"",n,r),this._notifyUrlChangeListeners(this.prepareExternalUrl(n+O(r)),i)}replaceState(n,r="",i=null){this._locationStrategy.replaceState(i,"",n,r),this._notifyUrlChangeListeners(this.prepareExternalUrl(n+O(r)),i)}forward(){this._locationStrategy.forward()}back(){this._locationStrategy.back()}historyGo(n=0){this._locationStrategy.historyGo?.(n)}onUrlChange(n){return this._urlChangeListeners.push(n),this._urlChangeSubscription??=this.subscribe(r=>{this._notifyUrlChangeListeners(r.url,r.state)}),()=>{let r=this._urlChangeListeners.indexOf(n);this._urlChangeListeners.splice(r,1),this._urlChangeListeners.length===0&&(this._urlChangeSubscription?.unsubscribe(),this._urlChangeSubscription=null)}}_notifyUrlChangeListeners(n="",r){this._urlChangeListeners.forEach(i=>i(n,r))}subscribe(n,r,i){return this._subject.subscribe({next:n,error:r,complete:i})}};t.normalizeQueryParams=O,t.joinWithSlash=qe,t.stripTrailingSlash=We,t.\u0275fac=function(r){return new(r||t)(E(ce))},t.\u0275prov=y({token:t,factory:()=>St(),providedIn:"root"});let e=t;return e})();function St(){return new vt(E(ce))}function Tt(e,t){if(!e||!t.startsWith(e))return t;let s=t.substring(e.length);return s===""||["/",";","?","#"].includes(s[0])?s:t}function Ye(e){return e.replace(/\/index.html$/,"")}function It(e){if(new RegExp("^(https?:)?//").test(e)){let[,s]=e.split(/\/\/[^\/]+/);return s}return e}function Je(e,t){t=encodeURIComponent(t);for(let s of e.split(";")){let n=s.indexOf("="),[r,i]=n==-1?[s,""]:[s.slice(0,n),s.slice(n+1)];if(r.trim()===t)return decodeURIComponent(i)}return null}function Rt(e,t){return new Z(2100,!1)}var Kn=(()=>{let t=class t{transform(n){if(n==null)return null;if(typeof n!="string")throw Rt(t,n);return n.toUpperCase()}};t.\u0275fac=function(r){return new(r||t)},t.\u0275pipe=ne({name:"uppercase",type:t,pure:!0,standalone:!0});let e=t;return e})();function Mt(e,t){return{key:e,value:t}}var Xn=(()=>{let t=class t{constructor(n){this.differs=n,this.keyValues=[],this.compareFn=Ze}transform(n,r=Ze){if(!n||!(n instanceof Map)&&typeof n!="object")return null;this.differ??=this.differs.find(n).create();let i=this.differ.diff(n),a=r!==this.compareFn;return i&&(this.keyValues=[],i.forEachItem(o=>{this.keyValues.push(Mt(o.key,o.currentValue))})),(i||a)&&(this.keyValues.sort(r),this.compareFn=r),this.keyValues}};t.\u0275fac=function(r){return new(r||t)(Be(Ve,16))},t.\u0275pipe=ne({name:"keyvalue",type:t,pure:!1,standalone:!0});let e=t;return e})();function Ze(e,t){let s=e.key,n=t.key;if(s===n)return 0;if(s===void 0)return 1;if(n===void 0)return-1;if(s===null)return 1;if(n===null)return-1;if(typeof s=="string"&&typeof n=="string")return s<n?-1:1;if(typeof s=="number"&&typeof n=="number")return s-n;if(typeof s=="boolean"&&typeof n=="boolean")return s<n?-1:1;let r=String(s),i=String(n);return r==i?0:r<i?-1:1}var Ot="browser",Pt="server";function qn(e){return e===Ot}function de(e){return e===Pt}var q=class{};var He=e=>e.src,_t=new w("",{providedIn:"root",factory:()=>He});var Lt=new w("NG_OPTIMIZED_PRELOADED_IMAGES",{providedIn:"root",factory:()=>new Set}),Nt=(()=>{let t=class t{constructor(){this.preloadedImages=c(Lt),this.document=c(U)}createPreloadLinkTag(n,r,i,a){if(this.preloadedImages.has(r))return;this.preloadedImages.add(r);let o=n.createElement("link");n.setAttribute(o,"as","image"),n.setAttribute(o,"href",r),n.setAttribute(o,"rel","preload"),n.setAttribute(o,"fetchpriority","high"),a&&n.setAttribute(o,"imageSizes",a),i&&n.setAttribute(o,"imageSrcset",i),n.appendChild(this.document.head,o)}};t.\u0275fac=function(r){return new(r||t)},t.\u0275prov=y({token:t,factory:t.\u0275fac,providedIn:"root"});let e=t;return e})();var Bt=/^((\s*\d+w\s*(,|$)){1,})$/;var kt=[1,2],xt=640;var Ut=1920,$t=1080;var Jn=(()=>{let t=class t{constructor(){this.imageLoader=c(_t),this.config=jt(c(Le)),this.renderer=c(se),this.imgElement=c(re).nativeElement,this.injector=c(Oe),this.isServer=de(c(k)),this.preloadLinkCreator=c(Nt),this.lcpObserver=null,this._renderedSrc=null,this.priority=!1,this.disableOptimizedSrcset=!1,this.fill=!1}ngOnInit(){K("NgOptimizedImage"),this.placeholder&&this.removePlaceholderOnLoad(this.imgElement),this.setHostAttributes()}setHostAttributes(){this.fill?this.sizes||="100vw":(this.setHostAttribute("width",this.width.toString()),this.setHostAttribute("height",this.height.toString())),this.setHostAttribute("loading",this.getLoadingBehavior()),this.setHostAttribute("fetchpriority",this.getFetchPriority()),this.setHostAttribute("ng-img","true");let n=this.updateSrcAndSrcset();this.sizes&&this.setHostAttribute("sizes",this.sizes),this.isServer&&this.priority&&this.preloadLinkCreator.createPreloadLinkTag(this.renderer,this.getRewrittenSrc(),n,this.sizes)}ngOnChanges(n){if(n.ngSrc&&!n.ngSrc.isFirstChange()){let r=this._renderedSrc;this.updateSrcAndSrcset(!0);let i=this._renderedSrc;this.lcpObserver!==null&&r&&i&&r!==i&&this.injector.get(X).runOutsideAngular(()=>{this.lcpObserver?.updateImage(r,i)})}}callImageLoader(n){let r=n;return this.loaderParams&&(r.loaderParams=this.loaderParams),this.imageLoader(r)}getLoadingBehavior(){return!this.priority&&this.loading!==void 0?this.loading:this.priority?"eager":"lazy"}getFetchPriority(){return this.priority?"high":"auto"}getRewrittenSrc(){if(!this._renderedSrc){let n={src:this.ngSrc};this._renderedSrc=this.callImageLoader(n)}return this._renderedSrc}getRewrittenSrcset(){let n=Bt.test(this.ngSrcset);return this.ngSrcset.split(",").filter(i=>i!=="").map(i=>{i=i.trim();let a=n?parseFloat(i):parseFloat(i)*this.width;return`${this.callImageLoader({src:this.ngSrc,width:a})} ${i}`}).join(", ")}getAutomaticSrcset(){return this.sizes?this.getResponsiveSrcset():this.getFixedSrcset()}getResponsiveSrcset(){let{breakpoints:n}=this.config,r=n;return this.sizes?.trim()==="100vw"&&(r=n.filter(a=>a>=xt)),r.map(a=>`${this.callImageLoader({src:this.ngSrc,width:a})} ${a}w`).join(", ")}updateSrcAndSrcset(n=!1){n&&(this._renderedSrc=null);let r=this.getRewrittenSrc();this.setHostAttribute("src",r);let i;return this.ngSrcset?i=this.getRewrittenSrcset():this.shouldGenerateAutomaticSrcset()&&(i=this.getAutomaticSrcset()),i&&this.setHostAttribute("srcset",i),i}getFixedSrcset(){return kt.map(r=>`${this.callImageLoader({src:this.ngSrc,width:this.width*r})} ${r}x`).join(", ")}shouldGenerateAutomaticSrcset(){let n=!1;return this.sizes||(n=this.width>Ut||this.height>$t),!this.disableOptimizedSrcset&&!this.srcset&&this.imageLoader!==He&&!n}generatePlaceholder(n){let{placeholderResolution:r}=this.config;return n===!0?`url(${this.callImageLoader({src:this.ngSrc,width:r,isPlaceholder:!0})})`:typeof n=="string"&&n.startsWith("data:")?`url(${n})`:null}shouldBlurPlaceholder(n){return!n||!n.hasOwnProperty("blur")?!0:!!n.blur}removePlaceholderOnLoad(n){let r=()=>{let o=this.injector.get(oe);i(),a(),this.placeholder=!1,o.markForCheck()},i=this.renderer.listen(n,"load",r),a=this.renderer.listen(n,"error",r)}ngOnDestroy(){}setHostAttribute(n,r){this.renderer.setAttribute(this.imgElement,n,r)}};t.\u0275fac=function(r){return new(r||t)},t.\u0275dir=Se({type:t,selectors:[["img","ngSrc",""]],hostVars:18,hostBindings:function(r,i){r&2&&Ue("position",i.fill?"absolute":null)("width",i.fill?"100%":null)("height",i.fill?"100%":null)("inset",i.fill?"0":null)("background-size",i.placeholder?"cover":null)("background-position",i.placeholder?"50% 50%":null)("background-repeat",i.placeholder?"no-repeat":null)("background-image",i.placeholder?i.generatePlaceholder(i.placeholder):null)("filter",i.placeholder&&i.shouldBlurPlaceholder(i.placeholderConfig)?"blur(15px)":null)},inputs:{ngSrc:[v.HasDecoratorInputTransform,"ngSrc","ngSrc",zt],ngSrcset:"ngSrcset",sizes:"sizes",width:[v.HasDecoratorInputTransform,"width","width",ae],height:[v.HasDecoratorInputTransform,"height","height",ae],loading:"loading",priority:[v.HasDecoratorInputTransform,"priority","priority",x],loaderParams:"loaderParams",disableOptimizedSrcset:[v.HasDecoratorInputTransform,"disableOptimizedSrcset","disableOptimizedSrcset",x],fill:[v.HasDecoratorInputTransform,"fill","fill",x],placeholder:[v.HasDecoratorInputTransform,"placeholder","placeholder",Vt],placeholderConfig:"placeholderConfig",src:"src",srcset:"srcset"},standalone:!0,features:[ke,Me]});let e=t;return e})();function jt(e){let t={};return e.breakpoints&&(t.breakpoints=e.breakpoints.sort((s,n)=>s-n)),Object.assign({},_e,e,t)}function zt(e){return typeof e=="string"?e:Ne(e)}function Vt(e){return typeof e=="string"&&e.startsWith("data:")?e:x(e)}function er(e){return e instanceof Promise?e:e instanceof N?we(e):Promise.resolve(e)}var j=class{},z=class{},C=class e{constructor(t){this.normalizedNames=new Map,this.lazyUpdate=null,t?typeof t=="string"?this.lazyInit=()=>{this.headers=new Map,t.split(`
`).forEach(s=>{let n=s.indexOf(":");if(n>0){let r=s.slice(0,n),i=r.toLowerCase(),a=s.slice(n+1).trim();this.maybeSetNormalizedName(r,i),this.headers.has(i)?this.headers.get(i).push(a):this.headers.set(i,[a])}})}:typeof Headers<"u"&&t instanceof Headers?(this.headers=new Map,t.forEach((s,n)=>{this.setHeaderEntries(n,s)})):this.lazyInit=()=>{this.headers=new Map,Object.entries(t).forEach(([s,n])=>{this.setHeaderEntries(s,n)})}:this.headers=new Map}has(t){return this.init(),this.headers.has(t.toLowerCase())}get(t){this.init();let s=this.headers.get(t.toLowerCase());return s&&s.length>0?s[0]:null}keys(){return this.init(),Array.from(this.normalizedNames.values())}getAll(t){return this.init(),this.headers.get(t.toLowerCase())||null}append(t,s){return this.clone({name:t,value:s,op:"a"})}set(t,s){return this.clone({name:t,value:s,op:"s"})}delete(t,s){return this.clone({name:t,value:s,op:"d"})}maybeSetNormalizedName(t,s){this.normalizedNames.has(s)||this.normalizedNames.set(s,t)}init(){this.lazyInit&&(this.lazyInit instanceof e?this.copyFrom(this.lazyInit):this.lazyInit(),this.lazyInit=null,this.lazyUpdate&&(this.lazyUpdate.forEach(t=>this.applyUpdate(t)),this.lazyUpdate=null))}copyFrom(t){t.init(),Array.from(t.headers.keys()).forEach(s=>{this.headers.set(s,t.headers.get(s)),this.normalizedNames.set(s,t.normalizedNames.get(s))})}clone(t){let s=new e;return s.lazyInit=this.lazyInit&&this.lazyInit instanceof e?this.lazyInit:this,s.lazyUpdate=(this.lazyUpdate||[]).concat([t]),s}applyUpdate(t){let s=t.name.toLowerCase();switch(t.op){case"a":case"s":let n=t.value;if(typeof n=="string"&&(n=[n]),n.length===0)return;this.maybeSetNormalizedName(t.name,s);let r=(t.op==="a"?this.headers.get(s):void 0)||[];r.push(...n),this.headers.set(s,r);break;case"d":let i=t.value;if(!i)this.headers.delete(s),this.normalizedNames.delete(s);else{let a=this.headers.get(s);if(!a)return;a=a.filter(o=>i.indexOf(o)===-1),a.length===0?(this.headers.delete(s),this.normalizedNames.delete(s)):this.headers.set(s,a)}break}}setHeaderEntries(t,s){let n=(Array.isArray(s)?s:[s]).map(i=>i.toString()),r=t.toLowerCase();this.headers.set(r,n),this.maybeSetNormalizedName(t,r)}forEach(t){this.init(),Array.from(this.normalizedNames.keys()).forEach(s=>t(this.normalizedNames.get(s),this.headers.get(s)))}};var fe=class{encodeKey(t){return Qe(t)}encodeValue(t){return Qe(t)}decodeKey(t){return decodeURIComponent(t)}decodeValue(t){return decodeURIComponent(t)}};function Wt(e,t){let s=new Map;return e.length>0&&e.replace(/^\?/,"").split("&").forEach(r=>{let i=r.indexOf("="),[a,o]=i==-1?[t.decodeKey(r),""]:[t.decodeKey(r.slice(0,i)),t.decodeValue(r.slice(i+1))],f=s.get(a)||[];f.push(o),s.set(a,f)}),s}var Yt=/%(\d[a-f0-9])/gi,Zt={40:"@","3A":":",24:"$","2C":",","3B":";","3D":"=","3F":"?","2F":"/"};function Qe(e){return encodeURIComponent(e).replace(Yt,(t,s)=>Zt[s]??t)}function J(e){return`${e}`}var T=class e{constructor(t={}){if(this.updates=null,this.cloneFrom=null,this.encoder=t.encoder||new fe,t.fromString){if(t.fromObject)throw new Error("Cannot specify both fromString and fromObject.");this.map=Wt(t.fromString,this.encoder)}else t.fromObject?(this.map=new Map,Object.keys(t.fromObject).forEach(s=>{let n=t.fromObject[s],r=Array.isArray(n)?n.map(J):[J(n)];this.map.set(s,r)})):this.map=null}has(t){return this.init(),this.map.has(t)}get(t){this.init();let s=this.map.get(t);return s?s[0]:null}getAll(t){return this.init(),this.map.get(t)||null}keys(){return this.init(),Array.from(this.map.keys())}append(t,s){return this.clone({param:t,value:s,op:"a"})}appendAll(t){let s=[];return Object.keys(t).forEach(n=>{let r=t[n];Array.isArray(r)?r.forEach(i=>{s.push({param:n,value:i,op:"a"})}):s.push({param:n,value:r,op:"a"})}),this.clone(s)}set(t,s){return this.clone({param:t,value:s,op:"s"})}delete(t,s){return this.clone({param:t,value:s,op:"d"})}toString(){return this.init(),this.keys().map(t=>{let s=this.encoder.encodeKey(t);return this.map.get(t).map(n=>s+"="+this.encoder.encodeValue(n)).join("&")}).filter(t=>t!=="").join("&")}clone(t){let s=new e({encoder:this.encoder});return s.cloneFrom=this.cloneFrom||this,s.updates=(this.updates||[]).concat(t),s}init(){this.map===null&&(this.map=new Map),this.cloneFrom!==null&&(this.cloneFrom.init(),this.cloneFrom.keys().forEach(t=>this.map.set(t,this.cloneFrom.map.get(t))),this.updates.forEach(t=>{switch(t.op){case"a":case"s":let s=(t.op==="a"?this.map.get(t.param):void 0)||[];s.push(J(t.value)),this.map.set(t.param,s);break;case"d":if(t.value!==void 0){let n=this.map.get(t.param)||[],r=n.indexOf(J(t.value));r!==-1&&n.splice(r,1),n.length>0?this.map.set(t.param,n):this.map.delete(t.param)}else{this.map.delete(t.param);break}}}),this.cloneFrom=this.updates=null)}};var ge=class{constructor(){this.map=new Map}set(t,s){return this.map.set(t,s),this}get(t){return this.map.has(t)||this.map.set(t,t.defaultValue()),this.map.get(t)}delete(t){return this.map.delete(t),this}has(t){return this.map.has(t)}keys(){return this.map.keys()}};function Kt(e){switch(e){case"DELETE":case"GET":case"HEAD":case"OPTIONS":case"JSONP":return!1;default:return!0}}function et(e){return typeof ArrayBuffer<"u"&&e instanceof ArrayBuffer}function tt(e){return typeof Blob<"u"&&e instanceof Blob}function nt(e){return typeof FormData<"u"&&e instanceof FormData}function Xt(e){return typeof URLSearchParams<"u"&&e instanceof URLSearchParams}var $=class e{constructor(t,s,n,r){this.url=s,this.body=null,this.reportProgress=!1,this.withCredentials=!1,this.responseType="json",this.method=t.toUpperCase();let i;if(Kt(this.method)||r?(this.body=n!==void 0?n:null,i=r):i=n,i&&(this.reportProgress=!!i.reportProgress,this.withCredentials=!!i.withCredentials,i.responseType&&(this.responseType=i.responseType),i.headers&&(this.headers=i.headers),i.context&&(this.context=i.context),i.params&&(this.params=i.params),this.transferCache=i.transferCache),this.headers??=new C,this.context??=new ge,!this.params)this.params=new T,this.urlWithParams=s;else{let a=this.params.toString();if(a.length===0)this.urlWithParams=s;else{let o=s.indexOf("?"),f=o===-1?"?":o<s.length-1?"&":"";this.urlWithParams=s+f+a}}}serializeBody(){return this.body===null?null:typeof this.body=="string"||et(this.body)||tt(this.body)||nt(this.body)||Xt(this.body)?this.body:this.body instanceof T?this.body.toString():typeof this.body=="object"||typeof this.body=="boolean"||Array.isArray(this.body)?JSON.stringify(this.body):this.body.toString()}detectContentTypeHeader(){return this.body===null||nt(this.body)?null:tt(this.body)?this.body.type||null:et(this.body)?null:typeof this.body=="string"?"text/plain":this.body instanceof T?"application/x-www-form-urlencoded;charset=UTF-8":typeof this.body=="object"||typeof this.body=="number"||typeof this.body=="boolean"?"application/json":null}clone(t={}){let s=t.method||this.method,n=t.url||this.url,r=t.responseType||this.responseType,i=t.transferCache??this.transferCache,a=t.body!==void 0?t.body:this.body,o=t.withCredentials??this.withCredentials,f=t.reportProgress??this.reportProgress,u=t.headers||this.headers,g=t.params||this.params,p=t.context??this.context;return t.setHeaders!==void 0&&(u=Object.keys(t.setHeaders).reduce((d,A)=>d.set(A,t.setHeaders[A]),u)),t.setParams&&(g=Object.keys(t.setParams).reduce((d,A)=>d.set(A,t.setParams[A]),g)),new e(s,n,a,{params:g,headers:u,context:p,reportProgress:f,responseType:r,withCredentials:o,transferCache:i})}},I=function(e){return e[e.Sent=0]="Sent",e[e.UploadProgress=1]="UploadProgress",e[e.ResponseHeader=2]="ResponseHeader",e[e.DownloadProgress=3]="DownloadProgress",e[e.Response=4]="Response",e[e.User=5]="User",e}(I||{}),V=class{constructor(t,s=G.Ok,n="OK"){this.headers=t.headers||new C,this.status=t.status!==void 0?t.status:s,this.statusText=t.statusText||n,this.url=t.url||null,this.ok=this.status>=200&&this.status<300}},Q=class e extends V{constructor(t={}){super(t),this.type=I.ResponseHeader}clone(t={}){return new e({headers:t.headers||this.headers,status:t.status!==void 0?t.status:this.status,statusText:t.statusText||this.statusText,url:t.url||this.url||void 0})}},P=class e extends V{constructor(t={}){super(t),this.type=I.Response,this.body=t.body!==void 0?t.body:null}clone(t={}){return new e({body:t.body!==void 0?t.body:this.body,headers:t.headers||this.headers,status:t.status!==void 0?t.status:this.status,statusText:t.statusText||this.statusText,url:t.url||this.url||void 0})}},S=class extends V{constructor(t){super(t,0,"Unknown Error"),this.name="HttpErrorResponse",this.ok=!1,this.status>=200&&this.status<300?this.message=`Http failure during parsing for ${t.url||"(unknown url)"}`:this.message=`Http failure response for ${t.url||"(unknown url)"}: ${t.status} ${t.statusText}`,this.error=t.error||null}},G=function(e){return e[e.Continue=100]="Continue",e[e.SwitchingProtocols=101]="SwitchingProtocols",e[e.Processing=102]="Processing",e[e.EarlyHints=103]="EarlyHints",e[e.Ok=200]="Ok",e[e.Created=201]="Created",e[e.Accepted=202]="Accepted",e[e.NonAuthoritativeInformation=203]="NonAuthoritativeInformation",e[e.NoContent=204]="NoContent",e[e.ResetContent=205]="ResetContent",e[e.PartialContent=206]="PartialContent",e[e.MultiStatus=207]="MultiStatus",e[e.AlreadyReported=208]="AlreadyReported",e[e.ImUsed=226]="ImUsed",e[e.MultipleChoices=300]="MultipleChoices",e[e.MovedPermanently=301]="MovedPermanently",e[e.Found=302]="Found",e[e.SeeOther=303]="SeeOther",e[e.NotModified=304]="NotModified",e[e.UseProxy=305]="UseProxy",e[e.Unused=306]="Unused",e[e.TemporaryRedirect=307]="TemporaryRedirect",e[e.PermanentRedirect=308]="PermanentRedirect",e[e.BadRequest=400]="BadRequest",e[e.Unauthorized=401]="Unauthorized",e[e.PaymentRequired=402]="PaymentRequired",e[e.Forbidden=403]="Forbidden",e[e.NotFound=404]="NotFound",e[e.MethodNotAllowed=405]="MethodNotAllowed",e[e.NotAcceptable=406]="NotAcceptable",e[e.ProxyAuthenticationRequired=407]="ProxyAuthenticationRequired",e[e.RequestTimeout=408]="RequestTimeout",e[e.Conflict=409]="Conflict",e[e.Gone=410]="Gone",e[e.LengthRequired=411]="LengthRequired",e[e.PreconditionFailed=412]="PreconditionFailed",e[e.PayloadTooLarge=413]="PayloadTooLarge",e[e.UriTooLong=414]="UriTooLong",e[e.UnsupportedMediaType=415]="UnsupportedMediaType",e[e.RangeNotSatisfiable=416]="RangeNotSatisfiable",e[e.ExpectationFailed=417]="ExpectationFailed",e[e.ImATeapot=418]="ImATeapot",e[e.MisdirectedRequest=421]="MisdirectedRequest",e[e.UnprocessableEntity=422]="UnprocessableEntity",e[e.Locked=423]="Locked",e[e.FailedDependency=424]="FailedDependency",e[e.TooEarly=425]="TooEarly",e[e.UpgradeRequired=426]="UpgradeRequired",e[e.PreconditionRequired=428]="PreconditionRequired",e[e.TooManyRequests=429]="TooManyRequests",e[e.RequestHeaderFieldsTooLarge=431]="RequestHeaderFieldsTooLarge",e[e.UnavailableForLegalReasons=451]="UnavailableForLegalReasons",e[e.InternalServerError=500]="InternalServerError",e[e.NotImplemented=501]="NotImplemented",e[e.BadGateway=502]="BadGateway",e[e.ServiceUnavailable=503]="ServiceUnavailable",e[e.GatewayTimeout=504]="GatewayTimeout",e[e.HttpVersionNotSupported=505]="HttpVersionNotSupported",e[e.VariantAlsoNegotiates=506]="VariantAlsoNegotiates",e[e.InsufficientStorage=507]="InsufficientStorage",e[e.LoopDetected=508]="LoopDetected",e[e.NotExtended=510]="NotExtended",e[e.NetworkAuthenticationRequired=511]="NetworkAuthenticationRequired",e}(G||{});function le(e,t){return{body:t,headers:e.headers,context:e.context,observe:e.observe,params:e.params,reportProgress:e.reportProgress,responseType:e.responseType,withCredentials:e.withCredentials,transferCache:e.transferCache}}var qt=(()=>{let t=class t{constructor(n){this.handler=n}request(n,r,i={}){let a;if(n instanceof $)a=n;else{let u;i.headers instanceof C?u=i.headers:u=new C(i.headers);let g;i.params&&(i.params instanceof T?g=i.params:g=new T({fromObject:i.params})),a=new $(n,r,i.body!==void 0?i.body:null,{headers:u,context:i.context,params:g,reportProgress:i.reportProgress,responseType:i.responseType||"json",withCredentials:i.withCredentials,transferCache:i.transferCache})}let o=Y(a).pipe(Ae(u=>this.handler.handle(u)));if(n instanceof $||i.observe==="events")return o;let f=o.pipe(Fe(u=>u instanceof P));switch(i.observe||"body"){case"body":switch(a.responseType){case"arraybuffer":return f.pipe(B(u=>{if(u.body!==null&&!(u.body instanceof ArrayBuffer))throw new Error("Response is not an ArrayBuffer.");return u.body}));case"blob":return f.pipe(B(u=>{if(u.body!==null&&!(u.body instanceof Blob))throw new Error("Response is not a Blob.");return u.body}));case"text":return f.pipe(B(u=>{if(u.body!==null&&typeof u.body!="string")throw new Error("Response is not a string.");return u.body}));case"json":default:return f.pipe(B(u=>u.body))}case"response":return f;default:throw new Error(`Unreachable: unhandled observe type ${i.observe}}`)}}delete(n,r={}){return this.request("DELETE",n,r)}get(n,r={}){return this.request("GET",n,r)}head(n,r={}){return this.request("HEAD",n,r)}jsonp(n,r){return this.request("JSONP",n,{params:new T().append(r,"JSONP_CALLBACK"),observe:"body",responseType:"json"})}options(n,r={}){return this.request("OPTIONS",n,r)}patch(n,r,i={}){return this.request("PATCH",n,le(i,r))}post(n,r,i={}){return this.request("POST",n,le(i,r))}put(n,r,i={}){return this.request("PUT",n,le(i,r))}};t.\u0275fac=function(r){return new(r||t)(E(j))},t.\u0275prov=y({token:t,factory:t.\u0275fac});let e=t;return e})(),Jt=/^\)\]\}',?\n/,Ht="X-Request-URL";function rt(e){if(e.url)return e.url;let t=Ht.toLocaleLowerCase();return e.headers.get(t)}var he=(()=>{let t=class t{constructor(){this.fetchImpl=c(De,{optional:!0})?.fetch??fetch.bind(globalThis),this.ngZone=c(X)}handle(n){return new N(r=>{let i=new AbortController;return this.doRequest(n,i.signal,r).then(pe,a=>r.error(new S({error:a}))),()=>i.abort()})}doRequest(n,r,i){return te(this,null,function*(){let a=this.createRequestInit(n),o;try{let m=this.fetchImpl(n.urlWithParams,W({signal:r},a));Qt(m),i.next({type:I.Sent}),o=yield m}catch(m){i.error(new S({error:m,status:m.status??0,statusText:m.statusText,url:n.urlWithParams,headers:m.headers}));return}let f=new C(o.headers),u=o.statusText,g=rt(o)??n.urlWithParams,p=o.status,d=null;if(n.reportProgress&&i.next(new Q({headers:f,status:p,statusText:u,url:g})),o.body){let m=o.headers.get("content-length"),R=[],l=o.body.getReader(),h=0,F,b,D=typeof Zone<"u"&&Zone.current;yield this.ngZone.runOutsideAngular(()=>te(this,null,function*(){for(;;){let{done:M,value:L}=yield l.read();if(M)break;if(R.push(L),h+=L.length,n.reportProgress){b=n.responseType==="text"?(b??"")+(F??=new TextDecoder).decode(L,{stream:!0}):void 0;let me=()=>i.next({type:I.DownloadProgress,total:m?+m:void 0,loaded:h,partialText:b});D?D.run(me):me()}}}));let _=this.concatChunks(R,h);try{let M=o.headers.get("Content-Type")??"";d=this.parseBody(n,_,M)}catch(M){i.error(new S({error:M,headers:new C(o.headers),status:o.status,statusText:o.statusText,url:rt(o)??n.urlWithParams}));return}}p===0&&(p=d?G.Ok:0),p>=200&&p<300?(i.next(new P({body:d,headers:f,status:p,statusText:u,url:g})),i.complete()):i.error(new S({error:d,headers:f,status:p,statusText:u,url:g}))})}parseBody(n,r,i){switch(n.responseType){case"json":let a=new TextDecoder().decode(r).replace(Jt,"");return a===""?null:JSON.parse(a);case"text":return new TextDecoder().decode(r);case"blob":return new Blob([r],{type:i});case"arraybuffer":return r.buffer}}createRequestInit(n){let r={},i=n.withCredentials?"include":void 0;if(n.headers.forEach((a,o)=>r[a]=o.join(",")),r.Accept??="application/json, text/plain, */*",!r["Content-Type"]){let a=n.detectContentTypeHeader();a!==null&&(r["Content-Type"]=a)}return{body:n.serializeBody(),method:n.method,headers:r,credentials:i}}concatChunks(n,r){let i=new Uint8Array(r),a=0;for(let o of n)i.set(o,a),a+=o.length;return i}};t.\u0275fac=function(r){return new(r||t)},t.\u0275prov=y({token:t,factory:t.\u0275fac});let e=t;return e})(),De=class{};function pe(){}function Qt(e){e.then(pe,pe)}function en(e,t){return t(e)}function tn(e,t,s){return(n,r)=>Re(s,()=>t(n,i=>e(i,r)))}var ft=new w(""),gt=new w(""),Dt=new w("");var it=(()=>{let t=class t extends j{constructor(n,r){super(),this.backend=n,this.injector=r,this.chain=null,this.pendingTasks=c(xe);let i=c(Dt,{optional:!0});this.backend=i??n}handle(n){if(this.chain===null){let i=Array.from(new Set([...this.injector.get(ft),...this.injector.get(gt,[])]));this.chain=i.reduceRight((a,o)=>tn(a,o,this.injector),en)}let r=this.pendingTasks.add();return this.chain(n,i=>this.backend.handle(i)).pipe(Ce(()=>this.pendingTasks.remove(r)))}};t.\u0275fac=function(r){return new(r||t)(E(z),E(Ie))},t.\u0275prov=y({token:t,factory:t.\u0275fac});let e=t;return e})();var nn=/^\)\]\}',?\n/;function rn(e){return"responseURL"in e&&e.responseURL?e.responseURL:/^X-Request-URL:/m.test(e.getAllResponseHeaders())?e.getResponseHeader("X-Request-URL"):null}var st=(()=>{let t=class t{constructor(n){this.xhrFactory=n}handle(n){if(n.method==="JSONP")throw new Z(-2800,!1);let r=this.xhrFactory;return(r.\u0275loadImpl?Ee(r.\u0275loadImpl()):Y(null)).pipe(be(()=>new N(a=>{let o=r.build();if(o.open(n.method,n.urlWithParams),n.withCredentials&&(o.withCredentials=!0),n.headers.forEach((l,h)=>o.setRequestHeader(l,h.join(","))),n.headers.has("Accept")||o.setRequestHeader("Accept","application/json, text/plain, */*"),!n.headers.has("Content-Type")){let l=n.detectContentTypeHeader();l!==null&&o.setRequestHeader("Content-Type",l)}if(n.responseType){let l=n.responseType.toLowerCase();o.responseType=l!=="json"?l:"text"}let f=n.serializeBody(),u=null,g=()=>{if(u!==null)return u;let l=o.statusText||"OK",h=new C(o.getAllResponseHeaders()),F=rn(o)||n.url;return u=new Q({headers:h,status:o.status,statusText:l,url:F}),u},p=()=>{let{headers:l,status:h,statusText:F,url:b}=g(),D=null;h!==G.NoContent&&(D=typeof o.response>"u"?o.responseText:o.response),h===0&&(h=D?G.Ok:0);let _=h>=200&&h<300;if(n.responseType==="json"&&typeof D=="string"){let M=D;D=D.replace(nn,"");try{D=D!==""?JSON.parse(D):null}catch(L){D=M,_&&(_=!1,D={error:L,text:D})}}_?(a.next(new P({body:D,headers:l,status:h,statusText:F,url:b||void 0})),a.complete()):a.error(new S({error:D,headers:l,status:h,statusText:F,url:b||void 0}))},d=l=>{let{url:h}=g(),F=new S({error:l,status:o.status||0,statusText:o.statusText||"Unknown Error",url:h||void 0});a.error(F)},A=!1,m=l=>{A||(a.next(g()),A=!0);let h={type:I.DownloadProgress,loaded:l.loaded};l.lengthComputable&&(h.total=l.total),n.responseType==="text"&&o.responseText&&(h.partialText=o.responseText),a.next(h)},R=l=>{let h={type:I.UploadProgress,loaded:l.loaded};l.lengthComputable&&(h.total=l.total),a.next(h)};return o.addEventListener("load",p),o.addEventListener("error",d),o.addEventListener("timeout",d),o.addEventListener("abort",d),n.reportProgress&&(o.addEventListener("progress",m),f!==null&&o.upload&&o.upload.addEventListener("progress",R)),o.send(f),a.next({type:I.Sent}),()=>{o.removeEventListener("error",d),o.removeEventListener("abort",d),o.removeEventListener("load",p),o.removeEventListener("timeout",d),n.reportProgress&&(o.removeEventListener("progress",m),f!==null&&o.upload&&o.upload.removeEventListener("progress",R)),o.readyState!==o.DONE&&o.abort()}})))}};t.\u0275fac=function(r){return new(r||t)(E(q))},t.\u0275prov=y({token:t,factory:t.\u0275fac});let e=t;return e})(),pt=new w(""),sn="XSRF-TOKEN",on=new w("",{providedIn:"root",factory:()=>sn}),an="X-XSRF-TOKEN",un=new w("",{providedIn:"root",factory:()=>an}),ee=class{},cn=(()=>{let t=class t{constructor(n,r,i){this.doc=n,this.platform=r,this.cookieName=i,this.lastCookieString="",this.lastToken=null,this.parseCount=0}getToken(){if(this.platform==="server")return null;let n=this.doc.cookie||"";return n!==this.lastCookieString&&(this.parseCount++,this.lastToken=Je(n,this.cookieName),this.lastCookieString=n),this.lastToken}};t.\u0275fac=function(r){return new(r||t)(E(U),E(k),E(on))},t.\u0275prov=y({token:t,factory:t.\u0275fac});let e=t;return e})();function dn(e,t){let s=e.url.toLowerCase();if(!c(pt)||e.method==="GET"||e.method==="HEAD"||s.startsWith("http://")||s.startsWith("https://"))return t(e);let n=c(ee).getToken(),r=c(un);return n!=null&&!e.headers.has(r)&&(e=e.clone({headers:e.headers.set(r,n)})),t(e)}var mt=function(e){return e[e.Interceptors=0]="Interceptors",e[e.LegacyInterceptors=1]="LegacyInterceptors",e[e.CustomXsrfConfiguration=2]="CustomXsrfConfiguration",e[e.NoXsrfProtection=3]="NoXsrfProtection",e[e.JsonpSupport=4]="JsonpSupport",e[e.RequestsMadeViaParent=5]="RequestsMadeViaParent",e[e.Fetch=6]="Fetch",e}(mt||{});function ln(e,t){return{\u0275kind:e,\u0275providers:t}}function hr(...e){let t=[qt,st,it,{provide:j,useExisting:it},{provide:z,useExisting:st},{provide:ft,useValue:dn,multi:!0},{provide:pt,useValue:!0},{provide:ee,useClass:cn}];for(let s of e)t.push(...s.\u0275providers);return Te(t)}function fr(){return ln(mt.Fetch,[he,{provide:z,useExisting:he},{provide:Dt,useExisting:he}])}var ot="b",at="h",ut="s",ct="st",dt="u",lt="rt",H=new w(""),hn=["GET","HEAD"];function fn(e,t){let p=c(H),{isCacheActive:s}=p,n=ye(p,["isCacheActive"]),{transferCache:r,method:i}=e;if(!s||i==="POST"&&!n.includePostRequests&&!r||i!=="POST"&&!hn.includes(i)||r===!1||n.filter?.(e)===!1)return t(e);let a=c(ie),o=Dn(e),f=a.get(o,null),u=n.includeHeaders;if(typeof r=="object"&&r.includeHeaders&&(u=r.includeHeaders),f){let{[ot]:d,[lt]:A,[at]:m,[ut]:R,[ct]:l,[dt]:h}=f,F=d;switch(A){case"arraybuffer":F=new TextEncoder().encode(d).buffer;break;case"blob":F=new Blob([d]);break}let b=new C(m);return Y(new P({body:F,headers:b,status:R,statusText:l,url:h}))}let g=de(c(k));return t(e).pipe(ve(d=>{d instanceof P&&g&&a.set(o,{[ot]:d.body,[at]:gn(d.headers,u),[ut]:d.status,[ct]:d.statusText,[dt]:d.url||"",[lt]:e.responseType})}))}function gn(e,t){if(!t)return{};let s={};for(let n of t){let r=e.getAll(n);r!==null&&(s[n]=r)}return s}function ht(e){return[...e.keys()].sort().map(t=>`${t}=${e.getAll(t)}`).join("&")}function Dn(e){let{params:t,method:s,responseType:n,url:r}=e,i=ht(t),a=e.serializeBody();a instanceof URLSearchParams?a=ht(a):typeof a!="string"&&(a="");let o=[s,n,r,a,i].join("|"),f=pn(o);return f}function pn(e){let t=0;for(let s of e)t=Math.imul(31,t)+s.charCodeAt(0)<<0;return t+=2147483648,t.toString()}function gr(e){return[{provide:H,useFactory:()=>(K("NgHttpTransferCache"),W({isCacheActive:!0},e))},{provide:gt,useValue:fn,multi:!0,deps:[ie,H]},{provide:$e,multi:!0,useFactory:()=>{let t=c(je),s=c(H);return()=>{ze(t).then(()=>{s.isCacheActive=!1})}}}]}export{ue as a,Zn as b,Ge as c,U as d,ce as e,vt as f,Je as g,Kn as h,Xn as i,Ot as j,qn as k,de as l,q as m,Jn as n,qt as o,hr as p,fr as q,gr as r,er as s};

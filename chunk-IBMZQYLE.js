import{g as y,l as I,u as x}from"./chunk-COTEZH4F.js";import{Ma as l,Ra as s,V as r,Xa as m,Ya as f,aa as a,ba as c,bb as u,d as o,db as d,gb as h,nb as g,qb as v,ra as p,vb as C}from"./chunk-TSANLP43.js";function z(e,t){if(e&1&&g(0,"span",0),e&2){let T=v();d("innerHTML",T.svgContent(),l)}}var F=(()=>{let t=class t{constructor(n,i){this.httpClient=n,this.sanitizer=i,this.href=p.required(),this.svgContent=m(null)}ngOnInit(){return o(this,null,function*(){this.svgContent.set(this.sanitizer.bypassSecurityTrustHtml(yield x(this.httpClient.get(this.href(),{responseType:"text"}))))})}};t.\u0275fac=function(i){return new(i||t)(s(y),s(I))},t.\u0275cmp=c({type:t,selectors:[["inline-svg"]],inputs:{href:[a.SignalBased,"href"]},standalone:!0,features:[C],decls:1,vars:1,consts:[[3,"innerHTML"]],template:function(i,H){i&1&&u(0,z,1,1,"span",0),i&2&&h(0,H.svgContent()?0:-1)}});let e=t;return e})();var O=(()=>{let t=class t{constructor(){this.dark=f(!1)}};t.\u0275fac=function(i){return new(i||t)},t.\u0275prov=r({token:t,factory:t.\u0275fac,providedIn:"root"});let e=t;return e})();export{F as a,O as b};

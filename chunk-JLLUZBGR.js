import{o as h}from"./chunk-FUCMUY4Q.js";import{U as o,Y as p,n,s as a}from"./chunk-OJB3JNYL.js";var f=(()=>{let t=class t{constructor(e){this.httpClient=e}get imageStats(){return this.httpClient.get("https://aihorde.net/api/v2/stats/img/totals")}get textStats(){return this.httpClient.get("https://aihorde.net/api/v2/stats/text/totals")}get performance(){return this.httpClient.get("https://aihorde.net/api/v2/status/performance")}get interrogationStats(){return n({processed:663723})}getTerms(){return this.httpClient.get("https://aihorde.net/api/v2/documents/terms?format=html").pipe(a(e=>e.html))}getNews(e){return this.httpClient.get("https://aihorde.net/api/v2/status/news").pipe(a(r=>e?r.slice(0,e):r),a(r=>r.map(i=>{let l=/\[([^\[]+)\]\(([^\)]+)\)/g,c=i.newspiece.replace(l,'<a href="$2">$1</a>');return{title:i.title,date_published:i.date_published,excerpt:c,moreLink:i.more_info_urls.length>0?i.more_info_urls[0]:null}})))}};t.\u0275fac=function(r){return new(r||t)(p(h))},t.\u0275prov=o({token:t,factory:t.\u0275fac,providedIn:"root"});let s=t;return s})();export{f as a};
import"./chunk-4EY2ITIA.js";import{g as H,k as E}from"./chunk-7ARKW5W4.js";import{a as L}from"./chunk-VVJGNX6O.js";import{s as I}from"./chunk-7IMKBQP2.js";import{$ as w,$a as k,Ka as d,La as u,Oa as i,Pa as y,Va as h,bb as p,d as v,eb as x,hb as b,ib as C,jb as o,kb as a,lb as m,ob as g,qb as r,rb as s,tb as T,yb as f,zb as _}from"./chunk-HTB7U7SQ.js";var S=(e,t)=>t.title;function F(e,t){if(e&1&&m(0,"p",14),e&2){let n=g().$implicit;p("innerHTML",n.excerpt,d)}}function N(e,t){if(e&1&&(o(0,"p",10)(1,"a",15),r(2),f(3,"transloco"),a()()),e&2){let n=g().$implicit;i(),p("href",n.moreLink,u),i(),s(_(3,2,"read_more"))}}function $(e,t){if(e&1&&(o(0,"div",9)(1,"h3",11)(2,"span",12),r(3),a(),r(4," - "),m(5,"span",13),a(),k(6,F,1,1,"p",14)(7,N,4,4,"p",10),a()),e&2){let n=t.$implicit;i(3),s(n.date_published),i(2),p("innerHTML",n.title,d),i(),x(6,n.excerpt?6:-1),i(),x(7,n.moreLink?7:-1)}}function z(e,t){e&1&&(o(0,"p",10),r(1),f(2,"transloco"),a()),e&2&&(i(),s(_(2,1,"no_news")))}var U=(()=>{let t=class t{constructor(c){this.aiHorde=c,this.news=h([])}ngOnInit(){return v(this,null,function*(){this.news.set(yield I(this.aiHorde.getNews()))})}};t.\u0275fac=function(l){return new(l||t)(y(L))},t.\u0275cmp=w({type:t,selectors:[["app-news"]],standalone:!0,features:[T],decls:12,vars:1,consts:[[1,"bg-white","dark:bg-gray-900"],[1,"grid","max-w-screen-xl","px-4","pt-20","pb-8","mx-auto","lg:gap-8","xl:gap-0"],[1,"mr-auto","place-self-center","lg:col-span-7"],[1,"mb-4","text-4xl","font-extrabold","leading-none","tracking-tight","md:text-5xl","xl:text-6xl","dark:text-white"],["key","latest_news"],[1,"bg-gray-50","dark:bg-gray-800"],[1,"max-w-screen-xl","px-4","py-8","mx-auto","space-y-12","lg:px-6"],[1,"items-center","gap-8","lg:grid","xl:gap-16"],[1,"text-gray-500","sm:text-lg","dark:text-gray-400"],[1,"mb-6"],[1,"mb-2","font-light","lg:text-xl"],[1,"mb-3","text-2xl","text-gray-900","dark:text-white"],[1,"text-gray-500","dark:text-gray-200"],[3,"innerHTML"],[1,"mb-2","font-light","lg:text-xl",3,"innerHTML"],["target","_blank",3,"href"]],template:function(l,M){l&1&&(o(0,"section",0)(1,"div",1)(2,"div",2)(3,"h1",3),m(4,"transloco",4),a()()()(),o(5,"section",5)(6,"div",6)(7,"div",7)(8,"div",8),b(9,$,8,4,"div",9,S,!1,z,3,3,"p",10),a()()()()),l&2&&(i(9),C(M.news()))},dependencies:[E,H]});let e=t;return e})();export{U as NewsComponent};

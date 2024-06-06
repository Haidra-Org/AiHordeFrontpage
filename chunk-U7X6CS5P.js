import{a as K,b as N,c as D}from"./chunk-QMVM2DYC.js";import{a as $,b as H}from"./chunk-CVGTARYY.js";import{b as E,k as j}from"./chunk-WDJTM7BO.js";import{i as V,s as f}from"./chunk-FUCMUY4Q.js";import{Bb as O,La as b,Pa as n,Qa as c,Wa as x,aa as C,ab as g,cb as F,d as v,eb as m,fb as u,hb as P,ib as _,ja as k,jb as q,ka as w,kb as o,lb as l,mb as p,nb as S,ob as T,pb as d,rb as y,sb as h,ub as I,zb as M}from"./chunk-OJB3JNYL.js";var B=(t,i)=>i.question;function L(t,i){if(t&1&&(o(0,"h2",9),y(1),l()),t&2){let e=d().$implicit;n(),h(e.key)}}function A(t,i){if(t&1){let e=S();o(0,"h3")(1,"button",10),T("click",function(){let r=k(e).$implicit,s=d(3);return w(s.selectedFaq.set(s.selectedFaq()===r.question?null:r.question))}),o(2,"span"),y(3),l(),p(4,"inline-svg",11),l()(),o(5,"div")(6,"div",12),p(7,"div",13),l()()}if(t&2){let e=i.$implicit,a=d(3);n(),m("text-gray-500",a.selectedFaq()!==e.question)("dark:text-gray-400",a.selectedFaq()!==e.question)("text-gray-900",a.selectedFaq()===e.question)("dark:text-white",a.selectedFaq()===e.question)("font-bold",a.selectedFaq()===e.question),n(2),h(e.question),n(),m("rotate-180",a.selectedFaq()===e.question),n(),m("hidden",a.selectedFaq()!==e.question),n(2),F("innerHTML",e.answer,b)}}function G(t,i){if(t&1&&(g(0,L,2,1,"h2",9),_(1,A,8,16,null,null,B)),t&2){let e=i.$implicit;u(0,e.key!==""?0:-1),n(),q(e.value)}}function J(t,i){if(t&1&&(o(0,"section",5)(1,"div",6)(2,"div",7)(3,"div",8),_(4,G,3,1,null,null,P),M(6,"keyvalue"),l()()()()),t&2){let e=d();n(4),q(O(6,0,e.faq(),e.NoSorterKeyValue))}}var oe=(()=>{let i=class i{constructor(a,r,s,z){this.title=a,this.translator=r,this.dataService=s,this.footerColor=z,this.NoSorterKeyValue=K,this.faq=x(new Map),this.selectedFaq=x(null)}ngOnInit(){return v(this,null,function*(){this.title.setTitle((yield f(this.translator.get("frequently_asked_questions")))+" | "+(yield f(this.translator.get("app_title")))),this.faq.set(yield f(this.dataService.faq)),this.footerColor.dark.set(!0)})}};i.\u0275fac=function(r){return new(r||i)(c(E),c(D),c(N),c(H))},i.\u0275cmp=C({type:i,selectors:[["app-faq"]],standalone:!0,features:[I],decls:6,vars:1,consts:[[1,"bg-white","dark:bg-gray-900"],[1,"grid","max-w-screen-xl","px-4","pt-20","pb-8","mx-auto","lg:gap-8","xl:gap-0","lg:py-16","lg:pt-28"],[1,"mr-auto","place-self-center","lg:col-span-7"],[1,"mb-4","text-4xl","font-extrabold","leading-none","tracking-tight","md:text-5xl","xl:text-6xl","dark:text-white"],["key","frequently_asked_questions"],[1,"bg-gray-50","dark:bg-gray-800"],[1,"max-w-screen-xl","px-4","pb-8","mx-auto","lg:pb-24","lg:px-6"],[1,"max-w-screen-xl","mx-auto"],["data-active-classes","bg-white dark:bg-gray-900 text-gray-900 dark:text-white","data-inactive-classes","text-gray-500 dark:text-gray-400"],[1,"mt-12","text-3xl","font-extrabold","tracking-tight","text-center","text-gray-900","lg:text-3xl","dark:text-white"],["type","button",1,"flex","items-center","justify-between","w-full","py-5","font-medium","text-left","border-b","border-gray-200","dark:border-gray-700",3,"click"],["href","assets/img/faq-closed.svg"],[1,"py-5","border-b","border-gray-200","dark:border-gray-700","faq-answer"],[3,"innerHTML"]],template:function(r,s){r&1&&(o(0,"section",0)(1,"div",1)(2,"div",2)(3,"h1",3),p(4,"transloco",4),l()()()(),g(5,J,7,3,"section",5)),r&2&&(n(5),u(5,s.faq()?5:-1))},dependencies:[j,V,$],styles:["[_nghost-%COMP%]     .faq-answer p, [_nghost-%COMP%]     .faq-answer ul{margin-bottom:.5rem;color:#6b7280;margin-top:.2rem}[_nghost-%COMP%]     .faq-answer li{list-style-type:disc;margin-left:18px;padding-left:18px;margin-bottom:.5rem}[_nghost-%COMP%]     .faq-answer a{text-decoration:underline}[_nghost-%COMP%]     .faq-answer a:hover{text-decoration:none;color:#25282d}.dark   [_nghost-%COMP%]     .faq-answer p, .dark   [_nghost-%COMP%]     .faq-answer ul{color:#9ca3af}.dark   [_nghost-%COMP%]     .faq-answer a:hover{color:#f1f2f3}"]});let t=i;return t})();export{oe as FaqComponent};

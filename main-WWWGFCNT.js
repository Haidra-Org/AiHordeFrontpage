import{a as D,b as U,c as P,d as q}from"./chunk-4EY2ITIA.js";import{a as $,b as G}from"./chunk-W6HWWYOS.js";import{a as j,d as F,g as z,h as O,i as K,j as N,k as W}from"./chunk-7ARKW5W4.js";import{e as T,n as B,o as R,p as A,q as H}from"./chunk-7IMKBQP2.js";import{$ as w,Ib as L,Oa as i,Pa as S,T as u,Va as C,X as v,Y as k,bb as y,db as h,jb as t,kb as r,lb as g,nb as f,pb as _,qb as n,rb as d,sb as I,tb as M,ub as E,yb as o,zb as a}from"./chunk-HTB7U7SQ.js";var J=[{path:"",loadComponent:()=>import("./chunk-EW6FW4WG.js").then(e=>e.HomepageComponent)},{path:"faq",loadComponent:()=>import("./chunk-VJOHUE6T.js").then(e=>e.FaqComponent)},{path:"news",loadComponent:()=>import("./chunk-KMKRFXFL.js").then(e=>e.NewsComponent)},{path:"register",loadComponent:()=>import("./chunk-7XJPRUWZ.js").then(e=>e.RegisterComponent)},{path:"sponsors",loadComponent:()=>import("./chunk-DYGX4LV3.js").then(e=>e.SponsorsComponent)},{path:"privacy",loadComponent:()=>import("./chunk-OJBOAXW4.js").then(e=>e.PrivacyComponent)},{path:"terms",loadComponent:()=>import("./chunk-FINGB24M.js").then(e=>e.TermsComponent)}];var V=(()=>{let s=class s{constructor(){this.http=k(R)}getTranslation(l){return this.http.get(`/assets/i18n/${l}.json`)}};s.\u0275fac=function(m){return new(m||s)},s.\u0275prov=u({token:s,factory:s.\u0275fac,providedIn:"root"});let e=s;return e})();function X(e,s){return typeof e=="object"&&e!==null&&s in e}function te(e){return X(e,"route")&&(typeof e.route=="string"||Array.isArray(e.route))&&(!X(e,"target")||e.target===void 0||typeof e.target=="string")}var ie=(()=>{class e{constructor(p,l){this.router=p,this.locationStrategy=l}supports(p){return te(p)}render(p,l){this.setAnchorElementHref(l,p),this.setAnchorElementTarget(l,p),this.setAnchorElementClickHandler(l,p)}setAnchorElementHref(p,l){p.href=this.getRouterLinkTargetUrl(l)}setAnchorElementTarget(p,l){l.target!==void 0&&(p.target=l.target)}setAnchorElementClickHandler(p,l){p.addEventListener("click",m=>{ne(m)||oe(l)||(m.preventDefault(),this.navigateTo(l))})}navigateTo(p){this.router.navigateByUrl(this.convertRouterLinkToUrlTree(p),p)}getRouterLinkTargetUrl(p){let l=this.convertRouterLinkToUrlTree(p),m=this.router.serializeUrl(l);return this.locationStrategy.prepareExternalUrl(m)}convertRouterLinkToUrlTree(p){let l=re(p);return this.router.createUrlTree(l,p)}}return e.\u0275fac=function(p){return new(p||e)(v(U),v(T))},e.\u0275prov=u({token:e,factory:e.\u0275fac}),e})();function re(e){return Array.isArray(e.route)?e.route:[e.route]}function ne(e){return e.button!==0||e.ctrlKey||e.metaKey||e.shiftKey}function oe(e){return e.target!==void 0&&e.target!=="_self"}function Y(){return[K(ie)]}var Z={providers:[q(J),F(),A(H()),O({config:{availableLangs:["en"],defaultLang:"en",reRenderOnLangChange:!0,prodMode:!L(),fallbackLang:"en"},loader:V}),N(),Y()]};var ae=()=>({flowbiteLink:"https://flowbite.com",tailwindLink:"https://tailwindcss.com",angularLink:"https://angular.dev"}),ee=(()=>{let s=class s{constructor(l){this.footerColor=l,this.darkMode=C(!1),this.darkFooter=this.footerColor.dark,this.showMobileMenu=!1}ngOnInit(){this.darkMode.set(typeof window<"u"&&window.matchMedia("(prefers-color-scheme: dark)").matches)}toggleMobileMenu(){this.showMobileMenu=!this.showMobileMenu}closeMobileMenu(){this.showMobileMenu=!1}};s.\u0275fac=function(m){return new(m||s)(S(G))},s.\u0275cmp=w({type:s,selectors:[["app-root"]],standalone:!0,features:[M],decls:122,vars:89,consts:[[1,"wrapper",3,"click"],[1,"fixed","w-full"],[1,"bg-white","border-gray-200","py-2.5","dark:bg-gray-900"],[1,"flex","flex-wrap","items-center","justify-between","max-w-screen-xl","px-4","mx-auto"],["routerLink","/",1,"flex","items-center"],["ngSrc","./assets/img/logo.png","height","455","width","393","priority","",1,"h-6","mr-3","sm:h-9","w-auto",3,"alt"],[1,"self-center","text-xl","font-semibold","whitespace-nowrap","dark:text-white"],[1,"flex","items-end","lg:order-2"],["data-collapse-toggle","mobile-menu-2","type","button","aria-controls","mobile-menu-2","aria-expanded","false",1,"inline-flex","items-center","p-2","ml-1","text-sm","text-gray-500","rounded-lg","lg:hidden","hover:bg-gray-100","focus:outline-none","focus:ring-2","focus:ring-gray-200","dark:text-gray-400","dark:hover:bg-gray-700","dark:focus:ring-gray-600",3,"click"],[1,"sr-only"],["href","assets/img/open-menu.svg"],["href","assets/img/close-menu.svg"],["id","mobile-menu-2",1,"items-end","justify-between","hidden","w-full","lg:flex","lg:w-auto","lg:order-1",3,"click"],[1,"flex","flex-col","mt-4","font-medium","border-b","border-gray-300","lg:border-0","lg:flex-row","lg:space-x-8","lg:mt-0"],["routerLink","/","aria-current","page",1,"block","py-2","pl-3","pr-4","text-gray-500","bg-gray-400","rounded","lg:bg-transparent","lg:text-gray-500","lg:p-0","dark:text-white"],["href","/register","aria-current","page",1,"block","py-2","pl-3","pr-4","text-gray-500","bg-gray-400","rounded","lg:bg-transparent","lg:text-gray-500","lg:p-0","dark:text-white"],["routerLink","/news","aria-current","page",1,"block","py-2","pl-3","pr-4","text-gray-500","bg-gray-400","rounded","lg:bg-transparent","lg:text-gray-500","lg:p-0","dark:text-white"],["routerLink","/faq","aria-current","page",1,"block","py-2","pl-3","pr-4","text-gray-500","bg-gray-400","rounded","lg:bg-transparent","lg:text-gray-500","lg:p-0","dark:text-white"],["href","/api/","aria-current","page",1,"block","py-2","pl-3","pr-4","text-gray-500","bg-gray-400","rounded","lg:bg-transparent","lg:text-gray-500","lg:p-0","dark:text-white"],[1,"max-w-screen-xl","p-4","py-6","mx-auto","lg:py-16","md:p-8","lg:p-10"],[1,"grid","grid-cols-2","gap-8","md:grid-cols-3","lg:grid-cols-5"],[1,"mb-6","text-sm","font-semibold","text-gray-900","uppercase","dark:text-white"],[1,"text-gray-500","dark:text-gray-400"],[1,"mb-4"],["href","https://discord.gg/3DxrhksKzn","target","_blank",1,"hover:underline"],["href","https://www.patreon.com/db0","target","_blank",1,"hover:underline"],["href","https://github.com/Haidra-Org","target","_blank",1,"hover:underline"],["href","https://sigmoid.social/@stablehorde","target","_blank",1,"hover:underline"],["href","https://lemmy.dbzer0.com/c/aihorde","target","_blank",1,"hover:underline"],["href","https://dbzer0.com/","target","_blank",1,"hover:underline"],["href","https://github.com/haidra-org","target","_blank",1,"hover:underline"],["routerLink","/sponsors",1,"hover:underline"],["routerLink","/privacy",1,"hover:underline"],["routerLink","/terms",1,"hover:underline"],["href","https://aihorde.net/api/","target","_blank",1,"hover:underline"],["href","https://github.com/Haidra-Org/AI-Horde/blob/main/README_StableHorde.md#joining-the-horde","target","_blank",1,"hover:underline"],["routerLink","/faq",1,"hover:underline"],[1,"my-6","border-gray-200","sm:mx-auto","dark:border-gray-700","lg:my-8"],[1,"text-center"],["href","#",1,"flex","items-center","justify-center","mb-5","text-2xl","font-semibold","text-gray-900","dark:text-white"],["ngSrc","./assets/img/logo.png","height","455","width","393",1,"h-6","mr-3","sm:h-9","w-auto",3,"alt"],[1,"block","text-sm","text-center","text-gray-500","dark:text-gray-400","built-with"],["key","built_with",3,"params"]],template:function(m,c){m&1&&(t(0,"div",0),f("click",function(){return c.closeMobileMenu()}),t(1,"header",1)(2,"nav",2)(3,"div",3)(4,"a",4),g(5,"img",5),o(6,"transloco"),t(7,"span",6),n(8),o(9,"transloco"),r()(),t(10,"div",7)(11,"button",8),f("click",function(x){return c.toggleMobileMenu(),x.stopPropagation()}),t(12,"span",9),n(13),o(14,"transloco"),r(),g(15,"inline-svg",10)(16,"inline-svg",11),r()(),t(17,"div",12),f("click",function(x){return x.stopPropagation()}),t(18,"ul",13)(19,"li")(20,"a",14),n(21),o(22,"transloco"),r()(),t(23,"li")(24,"a",15),n(25),o(26,"transloco"),r()(),t(27,"li")(28,"a",16),n(29),o(30,"transloco"),r()(),t(31,"li")(32,"a",17),n(33),o(34,"transloco"),r()(),t(35,"li")(36,"a",18),n(37),o(38,"transloco"),r()()()()()()(),g(39,"router-outlet"),t(40,"footer")(41,"div",19)(42,"div",20)(43,"div")(44,"h3",21),n(45),o(46,"transloco"),r(),t(47,"ul",22)(48,"li",23)(49,"a",24),n(50),o(51,"transloco"),r()(),t(52,"li",23)(53,"a",25),n(54),o(55,"transloco"),r()(),t(56,"li",23)(57,"a",26),n(58),o(59,"transloco"),r()(),t(60,"li",23)(61,"a",27),n(62),o(63,"transloco"),r()(),t(64,"li",23)(65,"a",28),n(66),o(67,"transloco"),r()()()(),t(68,"div")(69,"h3",21),n(70),o(71,"transloco"),r(),t(72,"ul",22)(73,"li",23)(74,"a",29),n(75,"db0"),r()(),t(76,"li",23)(77,"a",30),n(78,"Haidra"),r()(),t(79,"li",23)(80,"a",31),n(81),o(82,"transloco"),r()()()(),t(83,"div")(84,"h3",21),n(85),o(86,"transloco"),r(),t(87,"ul",22)(88,"li",23)(89,"a",32),n(90),o(91,"transloco"),r()(),t(92,"li",23)(93,"a",33),n(94),o(95,"transloco"),r()()()(),t(96,"div")(97,"h3",21),n(98),o(99,"transloco"),r(),t(100,"ul",22)(101,"li",23)(102,"a",34),n(103),o(104,"transloco"),r()(),t(105,"li",23)(106,"a",35),n(107),o(108,"transloco"),r()(),t(109,"li",23)(110,"a",36),n(111),o(112,"transloco"),r()()()()(),g(113,"hr",37),t(114,"div",38)(115,"a",39),g(116,"img",40),o(117,"transloco"),n(118),o(119,"transloco"),r(),t(120,"span",41),g(121,"transloco",42),r()()()()()),m&2&&(h("dark",c.darkMode()),i(5),_("alt",a(6,38,"logo.alt")),i(3),d(a(9,40,"app_title")),i(5),d(a(14,42,"open_main_menu")),i(4),h("hidden",!c.showMobileMenu),i(4),d(a(22,44,"home")),i(4),d(a(26,46,"register_account")),i(4),d(a(30,48,"news")),i(4),d(a(34,50,"faq")),i(4),d(a(38,52,"api")),i(3),h("bg-gray-50",!c.darkFooter())("dark:bg-gray-800",!c.darkFooter())("bg-white",c.darkFooter())("dark:bg-gray-900",c.darkFooter()),i(5),d(a(46,54,"community")),i(5),d(a(51,56,"discord")),i(4),d(a(55,58,"patreon")),i(4),d(a(59,60,"github")),i(4),d(a(63,62,"mastodon")),i(4),d(a(67,64,"lemmy")),i(4),d(a(71,66,"credits")),i(11),d(a(82,68,"sponsors")),i(4),d(a(86,70,"legal")),i(5),d(a(91,72,"privacy_policy")),i(4),d(a(95,74,"terms_of_service")),i(4),d(a(99,76,"documentation")),i(5),d(a(104,78,"rest_api")),i(4),d(a(108,80,"join_horde")),i(4),d(a(112,82,"frequently_asked_questions")),i(5),y("alt",a(117,84,"logo.alt")),i(2),I(" ",a(119,86,"app_title")," "),i(3),y("params",E(88,ae)))},dependencies:[D,B,z,W,P,$],styles:["header[_ngcontent-%COMP%]{z-index:1000}"]});let e=s;return e})();j(ee,Z).catch(e=>console.error(e));

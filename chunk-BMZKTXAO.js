import{a as x,b as R,ga as P}from"./chunk-EMLD44XD.js";function N(){return{async:!1,breaks:!1,extensions:null,gfm:!0,hooks:null,pedantic:!1,renderer:null,silent:!1,tokenizer:null,walkTokens:null}}var z=N();function se(c){z=c}var ie=/[&<>"']/,fe=new RegExp(ie.source,"g"),re=/[<>"']|&(?!(#\d{1,7}|#[Xx][a-fA-F0-9]{1,6}|\w+);)/,ge=new RegExp(re.source,"g"),de={"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"},V=c=>de[c];function b(c,e){if(e){if(ie.test(c))return c.replace(fe,V)}else if(re.test(c))return c.replace(ge,V);return c}var ke=/&(#(?:\d+)|(?:#x[0-9A-Fa-f]+)|(?:\w+));?/ig;function xe(c){return c.replace(ke,(e,t)=>(t=t.toLowerCase(),t==="colon"?":":t.charAt(0)==="#"?t.charAt(1)==="x"?String.fromCharCode(parseInt(t.substring(2),16)):String.fromCharCode(+t.substring(1)):""))}var be=/(^|[^\[])\^/g;function d(c,e){let t=typeof c=="string"?c:c.source;e=e||"";let n={replace:(s,i)=>{let r=typeof i=="string"?i:i.source;return r=r.replace(be,"$1"),t=t.replace(s,r),n},getRegex:()=>new RegExp(t,e)};return n}function Y(c){try{c=encodeURI(c).replace(/%25/g,"%")}catch{return null}return c}var L={exec:()=>null};function ee(c,e){let t=c.replace(/\|/g,(i,r,l)=>{let o=!1,h=r;for(;--h>=0&&l[h]==="\\";)o=!o;return o?"|":" |"}),n=t.split(/ \|/),s=0;if(n[0].trim()||n.shift(),n.length>0&&!n[n.length-1].trim()&&n.pop(),e)if(n.length>e)n.splice(e);else for(;n.length<e;)n.push("");for(;s<n.length;s++)n[s]=n[s].trim().replace(/\\\|/g,"|");return n}function A(c,e,t){let n=c.length;if(n===0)return"";let s=0;for(;s<n;){let i=c.charAt(n-s-1);if(i===e&&!t)s++;else if(i!==e&&t)s++;else break}return c.slice(0,n-s)}function me(c,e){if(c.indexOf(e[1])===-1)return-1;let t=0;for(let n=0;n<c.length;n++)if(c[n]==="\\")n++;else if(c[n]===e[0])t++;else if(c[n]===e[1]&&(t--,t<0))return n;return-1}function te(c,e,t,n){let s=e.href,i=e.title?b(e.title):null,r=c[1].replace(/\\([\[\]])/g,"$1");if(c[0].charAt(0)!=="!"){n.state.inLink=!0;let l={type:"link",raw:t,href:s,title:i,text:r,tokens:n.inlineTokens(r)};return n.state.inLink=!1,l}return{type:"image",raw:t,href:s,title:i,text:b(r)}}function we(c,e){let t=c.match(/^(\s+)(?:```)/);if(t===null)return e;let n=t[1];return e.split(`
`).map(s=>{let i=s.match(/^\s+/);if(i===null)return s;let[r]=i;return r.length>=n.length?s.slice(n.length):s}).join(`
`)}var _=class{options;rules;lexer;constructor(e){this.options=e||z}space(e){let t=this.rules.block.newline.exec(e);if(t&&t[0].length>0)return{type:"space",raw:t[0]}}code(e){let t=this.rules.block.code.exec(e);if(t){let n=t[0].replace(/^ {1,4}/gm,"");return{type:"code",raw:t[0],codeBlockStyle:"indented",text:this.options.pedantic?n:A(n,`
`)}}}fences(e){let t=this.rules.block.fences.exec(e);if(t){let n=t[0],s=we(n,t[3]||"");return{type:"code",raw:n,lang:t[2]?t[2].trim().replace(this.rules.inline.anyPunctuation,"$1"):t[2],text:s}}}heading(e){let t=this.rules.block.heading.exec(e);if(t){let n=t[2].trim();if(/#$/.test(n)){let s=A(n,"#");(this.options.pedantic||!s||/ $/.test(s))&&(n=s.trim())}return{type:"heading",raw:t[0],depth:t[1].length,text:n,tokens:this.lexer.inline(n)}}}hr(e){let t=this.rules.block.hr.exec(e);if(t)return{type:"hr",raw:A(t[0],`
`)}}blockquote(e){let t=this.rules.block.blockquote.exec(e);if(t){let n=A(t[0],`
`).split(`
`),s="",i="",r=[];for(;n.length>0;){let l=!1,o=[],h;for(h=0;h<n.length;h++)if(/^ {0,3}>/.test(n[h]))o.push(n[h]),l=!0;else if(!l)o.push(n[h]);else break;n=n.slice(h);let a=o.join(`
`),p=a.replace(/\n {0,3}((?:=+|-+) *)(?=\n|$)/g,`
    $1`).replace(/^ {0,3}>[ \t]?/gm,"");s=s?`${s}
${a}`:a,i=i?`${i}
${p}`:p;let g=this.lexer.state.top;if(this.lexer.state.top=!0,this.lexer.blockTokens(p,r,!0),this.lexer.state.top=g,n.length===0)break;let k=r[r.length-1];if(k?.type==="code")break;if(k?.type==="blockquote"){let u=k,m=u.raw+`
`+n.join(`
`),w=this.blockquote(m);r[r.length-1]=w,s=s.substring(0,s.length-u.raw.length)+w.raw,i=i.substring(0,i.length-u.text.length)+w.text;break}else if(k?.type==="list"){let u=k,m=u.raw+`
`+n.join(`
`),w=this.list(m);r[r.length-1]=w,s=s.substring(0,s.length-k.raw.length)+w.raw,i=i.substring(0,i.length-u.raw.length)+w.raw,n=m.substring(r[r.length-1].raw.length).split(`
`);continue}}return{type:"blockquote",raw:s,tokens:r,text:i}}}list(e){let t=this.rules.block.list.exec(e);if(t){let n=t[1].trim(),s=n.length>1,i={type:"list",raw:"",ordered:s,start:s?+n.slice(0,-1):"",loose:!1,items:[]};n=s?`\\d{1,9}\\${n.slice(-1)}`:`\\${n}`,this.options.pedantic&&(n=s?n:"[*+-]");let r=new RegExp(`^( {0,3}${n})((?:[	 ][^\\n]*)?(?:\\n|$))`),l=!1;for(;e;){let o=!1,h="",a="";if(!(t=r.exec(e))||this.rules.block.hr.test(e))break;h=t[0],e=e.substring(h.length);let p=t[2].split(`
`,1)[0].replace(/^\t+/,v=>" ".repeat(3*v.length)),g=e.split(`
`,1)[0],k=!p.trim(),u=0;if(this.options.pedantic?(u=2,a=p.trimStart()):k?u=t[1].length+1:(u=t[2].search(/[^ ]/),u=u>4?1:u,a=p.slice(u),u+=t[1].length),k&&/^ *$/.test(g)&&(h+=g+`
`,e=e.substring(g.length+1),o=!0),!o){let v=new RegExp(`^ {0,${Math.min(3,u-1)}}(?:[*+-]|\\d{1,9}[.)])((?:[ 	][^\\n]*)?(?:\\n|$))`),G=new RegExp(`^ {0,${Math.min(3,u-1)}}((?:- *){3,}|(?:_ *){3,}|(?:\\* *){3,})(?:\\n+|$)`),J=new RegExp(`^ {0,${Math.min(3,u-1)}}(?:\`\`\`|~~~)`),K=new RegExp(`^ {0,${Math.min(3,u-1)}}#`);for(;e;){let D=e.split(`
`,1)[0];if(g=D,this.options.pedantic&&(g=g.replace(/^ {1,4}(?=( {4})*[^ ])/g,"  ")),J.test(g)||K.test(g)||v.test(g)||G.test(e))break;if(g.search(/[^ ]/)>=u||!g.trim())a+=`
`+g.slice(u);else{if(k||p.search(/[^ ]/)>=4||J.test(p)||K.test(p)||G.test(p))break;a+=`
`+g}!k&&!g.trim()&&(k=!0),h+=D+`
`,e=e.substring(D.length+1),p=g.slice(u)}}i.loose||(l?i.loose=!0:/\n *\n *$/.test(h)&&(l=!0));let m=null,w;this.options.gfm&&(m=/^\[[ xX]\] /.exec(a),m&&(w=m[0]!=="[ ] ",a=a.replace(/^\[[ xX]\] +/,""))),i.items.push({type:"list_item",raw:h,task:!!m,checked:w,loose:!1,text:a,tokens:[]}),i.raw+=h}i.items[i.items.length-1].raw=i.items[i.items.length-1].raw.trimEnd(),i.items[i.items.length-1].text=i.items[i.items.length-1].text.trimEnd(),i.raw=i.raw.trimEnd();for(let o=0;o<i.items.length;o++)if(this.lexer.state.top=!1,i.items[o].tokens=this.lexer.blockTokens(i.items[o].text,[]),!i.loose){let h=i.items[o].tokens.filter(p=>p.type==="space"),a=h.length>0&&h.some(p=>/\n.*\n/.test(p.raw));i.loose=a}if(i.loose)for(let o=0;o<i.items.length;o++)i.items[o].loose=!0;return i}}html(e){let t=this.rules.block.html.exec(e);if(t)return{type:"html",block:!0,raw:t[0],pre:t[1]==="pre"||t[1]==="script"||t[1]==="style",text:t[0]}}def(e){let t=this.rules.block.def.exec(e);if(t){let n=t[1].toLowerCase().replace(/\s+/g," "),s=t[2]?t[2].replace(/^<(.*)>$/,"$1").replace(this.rules.inline.anyPunctuation,"$1"):"",i=t[3]?t[3].substring(1,t[3].length-1).replace(this.rules.inline.anyPunctuation,"$1"):t[3];return{type:"def",tag:n,raw:t[0],href:s,title:i}}}table(e){let t=this.rules.block.table.exec(e);if(!t||!/[:|]/.test(t[2]))return;let n=ee(t[1]),s=t[2].replace(/^\||\| *$/g,"").split("|"),i=t[3]&&t[3].trim()?t[3].replace(/\n[ \t]*$/,"").split(`
`):[],r={type:"table",raw:t[0],header:[],align:[],rows:[]};if(n.length===s.length){for(let l of s)/^ *-+: *$/.test(l)?r.align.push("right"):/^ *:-+: *$/.test(l)?r.align.push("center"):/^ *:-+ *$/.test(l)?r.align.push("left"):r.align.push(null);for(let l=0;l<n.length;l++)r.header.push({text:n[l],tokens:this.lexer.inline(n[l]),header:!0,align:r.align[l]});for(let l of i)r.rows.push(ee(l,r.header.length).map((o,h)=>({text:o,tokens:this.lexer.inline(o),header:!1,align:r.align[h]})));return r}}lheading(e){let t=this.rules.block.lheading.exec(e);if(t)return{type:"heading",raw:t[0],depth:t[2].charAt(0)==="="?1:2,text:t[1],tokens:this.lexer.inline(t[1])}}paragraph(e){let t=this.rules.block.paragraph.exec(e);if(t){let n=t[1].charAt(t[1].length-1)===`
`?t[1].slice(0,-1):t[1];return{type:"paragraph",raw:t[0],text:n,tokens:this.lexer.inline(n)}}}text(e){let t=this.rules.block.text.exec(e);if(t)return{type:"text",raw:t[0],text:t[0],tokens:this.lexer.inline(t[0])}}escape(e){let t=this.rules.inline.escape.exec(e);if(t)return{type:"escape",raw:t[0],text:b(t[1])}}tag(e){let t=this.rules.inline.tag.exec(e);if(t)return!this.lexer.state.inLink&&/^<a /i.test(t[0])?this.lexer.state.inLink=!0:this.lexer.state.inLink&&/^<\/a>/i.test(t[0])&&(this.lexer.state.inLink=!1),!this.lexer.state.inRawBlock&&/^<(pre|code|kbd|script)(\s|>)/i.test(t[0])?this.lexer.state.inRawBlock=!0:this.lexer.state.inRawBlock&&/^<\/(pre|code|kbd|script)(\s|>)/i.test(t[0])&&(this.lexer.state.inRawBlock=!1),{type:"html",raw:t[0],inLink:this.lexer.state.inLink,inRawBlock:this.lexer.state.inRawBlock,block:!1,text:t[0]}}link(e){let t=this.rules.inline.link.exec(e);if(t){let n=t[2].trim();if(!this.options.pedantic&&/^</.test(n)){if(!/>$/.test(n))return;let r=A(n.slice(0,-1),"\\");if((n.length-r.length)%2===0)return}else{let r=me(t[2],"()");if(r>-1){let o=(t[0].indexOf("!")===0?5:4)+t[1].length+r;t[2]=t[2].substring(0,r),t[0]=t[0].substring(0,o).trim(),t[3]=""}}let s=t[2],i="";if(this.options.pedantic){let r=/^([^'"]*[^\s])\s+(['"])(.*)\2/.exec(s);r&&(s=r[1],i=r[3])}else i=t[3]?t[3].slice(1,-1):"";return s=s.trim(),/^</.test(s)&&(this.options.pedantic&&!/>$/.test(n)?s=s.slice(1):s=s.slice(1,-1)),te(t,{href:s&&s.replace(this.rules.inline.anyPunctuation,"$1"),title:i&&i.replace(this.rules.inline.anyPunctuation,"$1")},t[0],this.lexer)}}reflink(e,t){let n;if((n=this.rules.inline.reflink.exec(e))||(n=this.rules.inline.nolink.exec(e))){let s=(n[2]||n[1]).replace(/\s+/g," "),i=t[s.toLowerCase()];if(!i){let r=n[0].charAt(0);return{type:"text",raw:r,text:r}}return te(n,i,n[0],this.lexer)}}emStrong(e,t,n=""){let s=this.rules.inline.emStrongLDelim.exec(e);if(!s||s[3]&&n.match(/[\p{L}\p{N}]/u))return;if(!(s[1]||s[2]||"")||!n||this.rules.inline.punctuation.exec(n)){let r=[...s[0]].length-1,l,o,h=r,a=0,p=s[0][0]==="*"?this.rules.inline.emStrongRDelimAst:this.rules.inline.emStrongRDelimUnd;for(p.lastIndex=0,t=t.slice(-1*e.length+r);(s=p.exec(t))!=null;){if(l=s[1]||s[2]||s[3]||s[4]||s[5]||s[6],!l)continue;if(o=[...l].length,s[3]||s[4]){h+=o;continue}else if((s[5]||s[6])&&r%3&&!((r+o)%3)){a+=o;continue}if(h-=o,h>0)continue;o=Math.min(o,o+h+a);let g=[...s[0]][0].length,k=e.slice(0,r+s.index+g+o);if(Math.min(r,o)%2){let m=k.slice(1,-1);return{type:"em",raw:k,text:m,tokens:this.lexer.inlineTokens(m)}}let u=k.slice(2,-2);return{type:"strong",raw:k,text:u,tokens:this.lexer.inlineTokens(u)}}}}codespan(e){let t=this.rules.inline.code.exec(e);if(t){let n=t[2].replace(/\n/g," "),s=/[^ ]/.test(n),i=/^ /.test(n)&&/ $/.test(n);return s&&i&&(n=n.substring(1,n.length-1)),n=b(n,!0),{type:"codespan",raw:t[0],text:n}}}br(e){let t=this.rules.inline.br.exec(e);if(t)return{type:"br",raw:t[0]}}del(e){let t=this.rules.inline.del.exec(e);if(t)return{type:"del",raw:t[0],text:t[2],tokens:this.lexer.inlineTokens(t[2])}}autolink(e){let t=this.rules.inline.autolink.exec(e);if(t){let n,s;return t[2]==="@"?(n=b(t[1]),s="mailto:"+n):(n=b(t[1]),s=n),{type:"link",raw:t[0],text:n,href:s,tokens:[{type:"text",raw:n,text:n}]}}}url(e){let t;if(t=this.rules.inline.url.exec(e)){let n,s;if(t[2]==="@")n=b(t[0]),s="mailto:"+n;else{let i;do i=t[0],t[0]=this.rules.inline._backpedal.exec(t[0])?.[0]??"";while(i!==t[0]);n=b(t[0]),t[1]==="www."?s="http://"+t[0]:s=t[0]}return{type:"link",raw:t[0],text:n,href:s,tokens:[{type:"text",raw:n,text:n}]}}}inlineText(e){let t=this.rules.inline.text.exec(e);if(t){let n;return this.lexer.state.inRawBlock?n=t[0]:n=b(t[0]),{type:"text",raw:t[0],text:n}}}},ye=/^(?: *(?:\n|$))+/,$e=/^( {4}[^\n]+(?:\n(?: *(?:\n|$))*)?)+/,Te=/^ {0,3}(`{3,}(?=[^`\n]*(?:\n|$))|~{3,})([^\n]*)(?:\n|$)(?:|([\s\S]*?)(?:\n|$))(?: {0,3}\1[~`]* *(?=\n|$)|$)/,q=/^ {0,3}((?:-[\t ]*){3,}|(?:_[ \t]*){3,}|(?:\*[ \t]*){3,})(?:\n+|$)/,ze=/^ {0,3}(#{1,6})(?=\s|$)(.*)(?:\n+|$)/,le=/(?:[*+-]|\d{1,9}[.)])/,oe=d(/^(?!bull |blockCode|fences|blockquote|heading|html)((?:.|\n(?!\s*?\n|bull |blockCode|fences|blockquote|heading|html))+?)\n {0,3}(=+|-+) *(?:\n+|$)/).replace(/bull/g,le).replace(/blockCode/g,/ {4}/).replace(/fences/g,/ {0,3}(?:`{3,}|~{3,})/).replace(/blockquote/g,/ {0,3}>/).replace(/heading/g,/ {0,3}#{1,6}/).replace(/html/g,/ {0,3}<[^\n>]+>\n/).getRegex(),F=/^([^\n]+(?:\n(?!hr|heading|lheading|blockquote|fences|list|html|table| +\n)[^\n]+)*)/,Re=/^[^\n]+/,H=/(?!\s*\])(?:\\.|[^\[\]\\])+/,Ie=d(/^ {0,3}\[(label)\]: *(?:\n *)?([^<\s][^\s]*|<.*?>)(?:(?: +(?:\n *)?| *\n *)(title))? *(?:\n+|$)/).replace("label",H).replace("title",/(?:"(?:\\"?|[^"\\])*"|'[^'\n]*(?:\n[^'\n]+)*\n?'|\([^()]*\))/).getRegex(),_e=d(/^( {0,3}bull)([ \t][^\n]+?)?(?:\n|$)/).replace(/bull/g,le).getRegex(),Q="address|article|aside|base|basefont|blockquote|body|caption|center|col|colgroup|dd|details|dialog|dir|div|dl|dt|fieldset|figcaption|figure|footer|form|frame|frameset|h[1-6]|head|header|hr|html|iframe|legend|li|link|main|menu|menuitem|meta|nav|noframes|ol|optgroup|option|p|param|search|section|summary|table|tbody|td|tfoot|th|thead|title|tr|track|ul",U=/<!--(?:-?>|[\s\S]*?(?:-->|$))/,Se=d("^ {0,3}(?:<(script|pre|style|textarea)[\\s>][\\s\\S]*?(?:</\\1>[^\\n]*\\n+|$)|comment[^\\n]*(\\n+|$)|<\\?[\\s\\S]*?(?:\\?>\\n*|$)|<![A-Z][\\s\\S]*?(?:>\\n*|$)|<!\\[CDATA\\[[\\s\\S]*?(?:\\]\\]>\\n*|$)|</?(tag)(?: +|\\n|/?>)[\\s\\S]*?(?:(?:\\n *)+\\n|$)|<(?!script|pre|style|textarea)([a-z][\\w-]*)(?:attribute)*? */?>(?=[ \\t]*(?:\\n|$))[\\s\\S]*?(?:(?:\\n *)+\\n|$)|</(?!script|pre|style|textarea)[a-z][\\w-]*\\s*>(?=[ \\t]*(?:\\n|$))[\\s\\S]*?(?:(?:\\n *)+\\n|$))","i").replace("comment",U).replace("tag",Q).replace("attribute",/ +[a-zA-Z:_][\w.:-]*(?: *= *"[^"\n]*"| *= *'[^'\n]*'| *= *[^\s"'=<>`]+)?/).getRegex(),ae=d(F).replace("hr",q).replace("heading"," {0,3}#{1,6}(?:\\s|$)").replace("|lheading","").replace("|table","").replace("blockquote"," {0,3}>").replace("fences"," {0,3}(?:`{3,}(?=[^`\\n]*\\n)|~{3,})[^\\n]*\\n").replace("list"," {0,3}(?:[*+-]|1[.)]) ").replace("html","</?(?:tag)(?: +|\\n|/?>)|<(?:script|pre|style|textarea|!--)").replace("tag",Q).getRegex(),Ae=d(/^( {0,3}> ?(paragraph|[^\n]*)(?:\n|$))+/).replace("paragraph",ae).getRegex(),W={blockquote:Ae,code:$e,def:Ie,fences:Te,heading:ze,hr:q,html:Se,lheading:oe,list:_e,newline:ye,paragraph:ae,table:L,text:Re},ne=d("^ *([^\\n ].*)\\n {0,3}((?:\\| *)?:?-+:? *(?:\\| *:?-+:? *)*(?:\\| *)?)(?:\\n((?:(?! *\\n|hr|heading|blockquote|code|fences|list|html).*(?:\\n|$))*)\\n*|$)").replace("hr",q).replace("heading"," {0,3}#{1,6}(?:\\s|$)").replace("blockquote"," {0,3}>").replace("code"," {4}[^\\n]").replace("fences"," {0,3}(?:`{3,}(?=[^`\\n]*\\n)|~{3,})[^\\n]*\\n").replace("list"," {0,3}(?:[*+-]|1[.)]) ").replace("html","</?(?:tag)(?: +|\\n|/?>)|<(?:script|pre|style|textarea|!--)").replace("tag",Q).getRegex(),Ee=R(x({},W),{table:ne,paragraph:d(F).replace("hr",q).replace("heading"," {0,3}#{1,6}(?:\\s|$)").replace("|lheading","").replace("table",ne).replace("blockquote"," {0,3}>").replace("fences"," {0,3}(?:`{3,}(?=[^`\\n]*\\n)|~{3,})[^\\n]*\\n").replace("list"," {0,3}(?:[*+-]|1[.)]) ").replace("html","</?(?:tag)(?: +|\\n|/?>)|<(?:script|pre|style|textarea|!--)").replace("tag",Q).getRegex()}),Le=R(x({},W),{html:d(`^ *(?:comment *(?:\\n|\\s*$)|<(tag)[\\s\\S]+?</\\1> *(?:\\n{2,}|\\s*$)|<tag(?:"[^"]*"|'[^']*'|\\s[^'"/>\\s]*)*?/?> *(?:\\n{2,}|\\s*$))`).replace("comment",U).replace(/tag/g,"(?!(?:a|em|strong|small|s|cite|q|dfn|abbr|data|time|code|var|samp|kbd|sub|sup|i|b|u|mark|ruby|rt|rp|bdi|bdo|span|br|wbr|ins|del|img)\\b)\\w+(?!:|[^\\w\\s@]*@)\\b").getRegex(),def:/^ *\[([^\]]+)\]: *<?([^\s>]+)>?(?: +(["(][^\n]+[")]))? *(?:\n+|$)/,heading:/^(#{1,6})(.*)(?:\n+|$)/,fences:L,lheading:/^(.+?)\n {0,3}(=+|-+) *(?:\n+|$)/,paragraph:d(F).replace("hr",q).replace("heading",` *#{1,6} *[^
]`).replace("lheading",oe).replace("|table","").replace("blockquote"," {0,3}>").replace("|fences","").replace("|list","").replace("|html","").replace("|tag","").getRegex()}),ce=/^\\([!"#$%&'()*+,\-./:;<=>?@\[\]\\^_`{|}~])/,Ce=/^(`+)([^`]|[^`][\s\S]*?[^`])\1(?!`)/,he=/^( {2,}|\\)\n(?!\s*$)/,qe=/^(`+|[^`])(?:(?= {2,}\n)|[\s\S]*?(?:(?=[\\<!\[`*_]|\b_|$)|[^ ](?= {2,}\n)))/,B="\\p{P}\\p{S}",Be=d(/^((?![*_])[\spunctuation])/,"u").replace(/punctuation/g,B).getRegex(),Pe=/\[[^[\]]*?\]\([^\(\)]*?\)|`[^`]*?`|<[^<>]*?>/g,Ze=d(/^(?:\*+(?:((?!\*)[punct])|[^\s*]))|^_+(?:((?!_)[punct])|([^\s_]))/,"u").replace(/punct/g,B).getRegex(),je=d("^[^_*]*?__[^_*]*?\\*[^_*]*?(?=__)|[^*]+(?=[^*])|(?!\\*)[punct](\\*+)(?=[\\s]|$)|[^punct\\s](\\*+)(?!\\*)(?=[punct\\s]|$)|(?!\\*)[punct\\s](\\*+)(?=[^punct\\s])|[\\s](\\*+)(?!\\*)(?=[punct])|(?!\\*)[punct](\\*+)(?!\\*)(?=[punct])|[^punct\\s](\\*+)(?=[^punct\\s])","gu").replace(/punct/g,B).getRegex(),Qe=d("^[^_*]*?\\*\\*[^_*]*?_[^_*]*?(?=\\*\\*)|[^_]+(?=[^_])|(?!_)[punct](_+)(?=[\\s]|$)|[^punct\\s](_+)(?!_)(?=[punct\\s]|$)|(?!_)[punct\\s](_+)(?=[^punct\\s])|[\\s](_+)(?!_)(?=[punct])|(?!_)[punct](_+)(?!_)(?=[punct])","gu").replace(/punct/g,B).getRegex(),ve=d(/\\([punct])/,"gu").replace(/punct/g,B).getRegex(),De=d(/^<(scheme:[^\s\x00-\x1f<>]*|email)>/).replace("scheme",/[a-zA-Z][a-zA-Z0-9+.-]{1,31}/).replace("email",/[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+(@)[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+(?![-_])/).getRegex(),Oe=d(U).replace("(?:-->|$)","-->").getRegex(),Me=d("^comment|^</[a-zA-Z][\\w:-]*\\s*>|^<[a-zA-Z][\\w-]*(?:attribute)*?\\s*/?>|^<\\?[\\s\\S]*?\\?>|^<![a-zA-Z]+\\s[\\s\\S]*?>|^<!\\[CDATA\\[[\\s\\S]*?\\]\\]>").replace("comment",Oe).replace("attribute",/\s+[a-zA-Z:_][\w.:-]*(?:\s*=\s*"[^"]*"|\s*=\s*'[^']*'|\s*=\s*[^\s"'=<>`]+)?/).getRegex(),j=/(?:\[(?:\\.|[^\[\]\\])*\]|\\.|`[^`]*`|[^\[\]\\`])*?/,Ne=d(/^!?\[(label)\]\(\s*(href)(?:\s+(title))?\s*\)/).replace("label",j).replace("href",/<(?:\\.|[^\n<>\\])+>|[^\s\x00-\x1f]*/).replace("title",/"(?:\\"?|[^"\\])*"|'(?:\\'?|[^'\\])*'|\((?:\\\)?|[^)\\])*\)/).getRegex(),pe=d(/^!?\[(label)\]\[(ref)\]/).replace("label",j).replace("ref",H).getRegex(),ue=d(/^!?\[(ref)\](?:\[\])?/).replace("ref",H).getRegex(),Fe=d("reflink|nolink(?!\\()","g").replace("reflink",pe).replace("nolink",ue).getRegex(),X={_backpedal:L,anyPunctuation:ve,autolink:De,blockSkip:Pe,br:he,code:Ce,del:L,emStrongLDelim:Ze,emStrongRDelimAst:je,emStrongRDelimUnd:Qe,escape:ce,link:Ne,nolink:ue,punctuation:Be,reflink:pe,reflinkSearch:Fe,tag:Me,text:qe,url:L},He=R(x({},X),{link:d(/^!?\[(label)\]\((.*?)\)/).replace("label",j).getRegex(),reflink:d(/^!?\[(label)\]\s*\[([^\]]*)\]/).replace("label",j).getRegex()}),O=R(x({},X),{escape:d(ce).replace("])","~|])").getRegex(),url:d(/^((?:ftp|https?):\/\/|www\.)(?:[a-zA-Z0-9\-]+\.?)+[^\s<]*|^email/,"i").replace("email",/[A-Za-z0-9._+-]+(@)[a-zA-Z0-9-_]+(?:\.[a-zA-Z0-9-_]*[a-zA-Z0-9])+(?![-_])/).getRegex(),_backpedal:/(?:[^?!.,:;*_'"~()&]+|\([^)]*\)|&(?![a-zA-Z0-9]+;$)|[?!.,:;*_'"~)]+(?!$))+/,del:/^(~~?)(?=[^\s~])([\s\S]*?[^\s~])\1(?=[^~]|$)/,text:/^([`~]+|[^`~])(?:(?= {2,}\n)|(?=[a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-]+@)|[\s\S]*?(?:(?=[\\<!\[`*~_]|\b_|https?:\/\/|ftp:\/\/|www\.|$)|[^ ](?= {2,}\n)|[^a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-](?=[a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-]+@)))/}),Ue=R(x({},O),{br:d(he).replace("{2,}","*").getRegex(),text:d(O.text).replace("\\b_","\\b_| {2,}\\n").replace(/\{2,\}/g,"*").getRegex()}),Z={normal:W,gfm:Ee,pedantic:Le},E={normal:X,gfm:O,breaks:Ue,pedantic:He},y=class c{tokens;options;state;tokenizer;inlineQueue;constructor(e){this.tokens=[],this.tokens.links=Object.create(null),this.options=e||z,this.options.tokenizer=this.options.tokenizer||new _,this.tokenizer=this.options.tokenizer,this.tokenizer.options=this.options,this.tokenizer.lexer=this,this.inlineQueue=[],this.state={inLink:!1,inRawBlock:!1,top:!0};let t={block:Z.normal,inline:E.normal};this.options.pedantic?(t.block=Z.pedantic,t.inline=E.pedantic):this.options.gfm&&(t.block=Z.gfm,this.options.breaks?t.inline=E.breaks:t.inline=E.gfm),this.tokenizer.rules=t}static get rules(){return{block:Z,inline:E}}static lex(e,t){return new c(t).lex(e)}static lexInline(e,t){return new c(t).inlineTokens(e)}lex(e){e=e.replace(/\r\n|\r/g,`
`),this.blockTokens(e,this.tokens);for(let t=0;t<this.inlineQueue.length;t++){let n=this.inlineQueue[t];this.inlineTokens(n.src,n.tokens)}return this.inlineQueue=[],this.tokens}blockTokens(e,t=[],n=!1){this.options.pedantic?e=e.replace(/\t/g,"    ").replace(/^ +$/gm,""):e=e.replace(/^( *)(\t+)/gm,(l,o,h)=>o+"    ".repeat(h.length));let s,i,r;for(;e;)if(!(this.options.extensions&&this.options.extensions.block&&this.options.extensions.block.some(l=>(s=l.call({lexer:this},e,t))?(e=e.substring(s.raw.length),t.push(s),!0):!1))){if(s=this.tokenizer.space(e)){e=e.substring(s.raw.length),s.raw.length===1&&t.length>0?t[t.length-1].raw+=`
`:t.push(s);continue}if(s=this.tokenizer.code(e)){e=e.substring(s.raw.length),i=t[t.length-1],i&&(i.type==="paragraph"||i.type==="text")?(i.raw+=`
`+s.raw,i.text+=`
`+s.text,this.inlineQueue[this.inlineQueue.length-1].src=i.text):t.push(s);continue}if(s=this.tokenizer.fences(e)){e=e.substring(s.raw.length),t.push(s);continue}if(s=this.tokenizer.heading(e)){e=e.substring(s.raw.length),t.push(s);continue}if(s=this.tokenizer.hr(e)){e=e.substring(s.raw.length),t.push(s);continue}if(s=this.tokenizer.blockquote(e)){e=e.substring(s.raw.length),t.push(s);continue}if(s=this.tokenizer.list(e)){e=e.substring(s.raw.length),t.push(s);continue}if(s=this.tokenizer.html(e)){e=e.substring(s.raw.length),t.push(s);continue}if(s=this.tokenizer.def(e)){e=e.substring(s.raw.length),i=t[t.length-1],i&&(i.type==="paragraph"||i.type==="text")?(i.raw+=`
`+s.raw,i.text+=`
`+s.raw,this.inlineQueue[this.inlineQueue.length-1].src=i.text):this.tokens.links[s.tag]||(this.tokens.links[s.tag]={href:s.href,title:s.title});continue}if(s=this.tokenizer.table(e)){e=e.substring(s.raw.length),t.push(s);continue}if(s=this.tokenizer.lheading(e)){e=e.substring(s.raw.length),t.push(s);continue}if(r=e,this.options.extensions&&this.options.extensions.startBlock){let l=1/0,o=e.slice(1),h;this.options.extensions.startBlock.forEach(a=>{h=a.call({lexer:this},o),typeof h=="number"&&h>=0&&(l=Math.min(l,h))}),l<1/0&&l>=0&&(r=e.substring(0,l+1))}if(this.state.top&&(s=this.tokenizer.paragraph(r))){i=t[t.length-1],n&&i?.type==="paragraph"?(i.raw+=`
`+s.raw,i.text+=`
`+s.text,this.inlineQueue.pop(),this.inlineQueue[this.inlineQueue.length-1].src=i.text):t.push(s),n=r.length!==e.length,e=e.substring(s.raw.length);continue}if(s=this.tokenizer.text(e)){e=e.substring(s.raw.length),i=t[t.length-1],i&&i.type==="text"?(i.raw+=`
`+s.raw,i.text+=`
`+s.text,this.inlineQueue.pop(),this.inlineQueue[this.inlineQueue.length-1].src=i.text):t.push(s);continue}if(e){let l="Infinite loop on byte: "+e.charCodeAt(0);if(this.options.silent){console.error(l);break}else throw new Error(l)}}return this.state.top=!0,t}inline(e,t=[]){return this.inlineQueue.push({src:e,tokens:t}),t}inlineTokens(e,t=[]){let n,s,i,r=e,l,o,h;if(this.tokens.links){let a=Object.keys(this.tokens.links);if(a.length>0)for(;(l=this.tokenizer.rules.inline.reflinkSearch.exec(r))!=null;)a.includes(l[0].slice(l[0].lastIndexOf("[")+1,-1))&&(r=r.slice(0,l.index)+"["+"a".repeat(l[0].length-2)+"]"+r.slice(this.tokenizer.rules.inline.reflinkSearch.lastIndex))}for(;(l=this.tokenizer.rules.inline.blockSkip.exec(r))!=null;)r=r.slice(0,l.index)+"["+"a".repeat(l[0].length-2)+"]"+r.slice(this.tokenizer.rules.inline.blockSkip.lastIndex);for(;(l=this.tokenizer.rules.inline.anyPunctuation.exec(r))!=null;)r=r.slice(0,l.index)+"++"+r.slice(this.tokenizer.rules.inline.anyPunctuation.lastIndex);for(;e;)if(o||(h=""),o=!1,!(this.options.extensions&&this.options.extensions.inline&&this.options.extensions.inline.some(a=>(n=a.call({lexer:this},e,t))?(e=e.substring(n.raw.length),t.push(n),!0):!1))){if(n=this.tokenizer.escape(e)){e=e.substring(n.raw.length),t.push(n);continue}if(n=this.tokenizer.tag(e)){e=e.substring(n.raw.length),s=t[t.length-1],s&&n.type==="text"&&s.type==="text"?(s.raw+=n.raw,s.text+=n.text):t.push(n);continue}if(n=this.tokenizer.link(e)){e=e.substring(n.raw.length),t.push(n);continue}if(n=this.tokenizer.reflink(e,this.tokens.links)){e=e.substring(n.raw.length),s=t[t.length-1],s&&n.type==="text"&&s.type==="text"?(s.raw+=n.raw,s.text+=n.text):t.push(n);continue}if(n=this.tokenizer.emStrong(e,r,h)){e=e.substring(n.raw.length),t.push(n);continue}if(n=this.tokenizer.codespan(e)){e=e.substring(n.raw.length),t.push(n);continue}if(n=this.tokenizer.br(e)){e=e.substring(n.raw.length),t.push(n);continue}if(n=this.tokenizer.del(e)){e=e.substring(n.raw.length),t.push(n);continue}if(n=this.tokenizer.autolink(e)){e=e.substring(n.raw.length),t.push(n);continue}if(!this.state.inLink&&(n=this.tokenizer.url(e))){e=e.substring(n.raw.length),t.push(n);continue}if(i=e,this.options.extensions&&this.options.extensions.startInline){let a=1/0,p=e.slice(1),g;this.options.extensions.startInline.forEach(k=>{g=k.call({lexer:this},p),typeof g=="number"&&g>=0&&(a=Math.min(a,g))}),a<1/0&&a>=0&&(i=e.substring(0,a+1))}if(n=this.tokenizer.inlineText(i)){e=e.substring(n.raw.length),n.raw.slice(-1)!=="_"&&(h=n.raw.slice(-1)),o=!0,s=t[t.length-1],s&&s.type==="text"?(s.raw+=n.raw,s.text+=n.text):t.push(n);continue}if(e){let a="Infinite loop on byte: "+e.charCodeAt(0);if(this.options.silent){console.error(a);break}else throw new Error(a)}}return t}},S=class{options;parser;constructor(e){this.options=e||z}space(e){return""}code({text:e,lang:t,escaped:n}){let s=(t||"").match(/^\S*/)?.[0],i=e.replace(/\n$/,"")+`
`;return s?'<pre><code class="language-'+b(s)+'">'+(n?i:b(i,!0))+`</code></pre>
`:"<pre><code>"+(n?i:b(i,!0))+`</code></pre>
`}blockquote({tokens:e}){return`<blockquote>
${this.parser.parse(e)}</blockquote>
`}html({text:e}){return e}heading({tokens:e,depth:t}){return`<h${t}>${this.parser.parseInline(e)}</h${t}>
`}hr(e){return`<hr>
`}list(e){let t=e.ordered,n=e.start,s="";for(let l=0;l<e.items.length;l++){let o=e.items[l];s+=this.listitem(o)}let i=t?"ol":"ul",r=t&&n!==1?' start="'+n+'"':"";return"<"+i+r+`>
`+s+"</"+i+`>
`}listitem(e){let t="";if(e.task){let n=this.checkbox({checked:!!e.checked});e.loose?e.tokens.length>0&&e.tokens[0].type==="paragraph"?(e.tokens[0].text=n+" "+e.tokens[0].text,e.tokens[0].tokens&&e.tokens[0].tokens.length>0&&e.tokens[0].tokens[0].type==="text"&&(e.tokens[0].tokens[0].text=n+" "+e.tokens[0].tokens[0].text)):e.tokens.unshift({type:"text",raw:n+" ",text:n+" "}):t+=n+" "}return t+=this.parser.parse(e.tokens,!!e.loose),`<li>${t}</li>
`}checkbox({checked:e}){return"<input "+(e?'checked="" ':"")+'disabled="" type="checkbox">'}paragraph({tokens:e}){return`<p>${this.parser.parseInline(e)}</p>
`}table(e){let t="",n="";for(let i=0;i<e.header.length;i++)n+=this.tablecell(e.header[i]);t+=this.tablerow({text:n});let s="";for(let i=0;i<e.rows.length;i++){let r=e.rows[i];n="";for(let l=0;l<r.length;l++)n+=this.tablecell(r[l]);s+=this.tablerow({text:n})}return s&&(s=`<tbody>${s}</tbody>`),`<table>
<thead>
`+t+`</thead>
`+s+`</table>
`}tablerow({text:e}){return`<tr>
${e}</tr>
`}tablecell(e){let t=this.parser.parseInline(e.tokens),n=e.header?"th":"td";return(e.align?`<${n} align="${e.align}">`:`<${n}>`)+t+`</${n}>
`}strong({tokens:e}){return`<strong>${this.parser.parseInline(e)}</strong>`}em({tokens:e}){return`<em>${this.parser.parseInline(e)}</em>`}codespan({text:e}){return`<code>${e}</code>`}br(e){return"<br>"}del({tokens:e}){return`<del>${this.parser.parseInline(e)}</del>`}link({href:e,title:t,tokens:n}){let s=this.parser.parseInline(n),i=Y(e);if(i===null)return s;e=i;let r='<a href="'+e+'"';return t&&(r+=' title="'+t+'"'),r+=">"+s+"</a>",r}image({href:e,title:t,text:n}){let s=Y(e);if(s===null)return n;e=s;let i=`<img src="${e}" alt="${n}"`;return t&&(i+=` title="${t}"`),i+=">",i}text(e){return"tokens"in e&&e.tokens?this.parser.parseInline(e.tokens):e.text}},C=class{strong({text:e}){return e}em({text:e}){return e}codespan({text:e}){return e}del({text:e}){return e}html({text:e}){return e}text({text:e}){return e}link({text:e}){return""+e}image({text:e}){return""+e}br(){return""}},$=class c{options;renderer;textRenderer;constructor(e){this.options=e||z,this.options.renderer=this.options.renderer||new S,this.renderer=this.options.renderer,this.renderer.options=this.options,this.renderer.parser=this,this.textRenderer=new C}static parse(e,t){return new c(t).parse(e)}static parseInline(e,t){return new c(t).parseInline(e)}parse(e,t=!0){let n="";for(let s=0;s<e.length;s++){let i=e[s];if(this.options.extensions&&this.options.extensions.renderers&&this.options.extensions.renderers[i.type]){let l=i,o=this.options.extensions.renderers[l.type].call({parser:this},l);if(o!==!1||!["space","hr","heading","code","table","blockquote","list","html","paragraph","text"].includes(l.type)){n+=o||"";continue}}let r=i;switch(r.type){case"space":{n+=this.renderer.space(r);continue}case"hr":{n+=this.renderer.hr(r);continue}case"heading":{n+=this.renderer.heading(r);continue}case"code":{n+=this.renderer.code(r);continue}case"table":{n+=this.renderer.table(r);continue}case"blockquote":{n+=this.renderer.blockquote(r);continue}case"list":{n+=this.renderer.list(r);continue}case"html":{n+=this.renderer.html(r);continue}case"paragraph":{n+=this.renderer.paragraph(r);continue}case"text":{let l=r,o=this.renderer.text(l);for(;s+1<e.length&&e[s+1].type==="text";)l=e[++s],o+=`
`+this.renderer.text(l);t?n+=this.renderer.paragraph({type:"paragraph",raw:o,text:o,tokens:[{type:"text",raw:o,text:o}]}):n+=o;continue}default:{let l='Token with "'+r.type+'" type was not found.';if(this.options.silent)return console.error(l),"";throw new Error(l)}}}return n}parseInline(e,t){t=t||this.renderer;let n="";for(let s=0;s<e.length;s++){let i=e[s];if(this.options.extensions&&this.options.extensions.renderers&&this.options.extensions.renderers[i.type]){let l=this.options.extensions.renderers[i.type].call({parser:this},i);if(l!==!1||!["escape","html","link","image","strong","em","codespan","br","del","text"].includes(i.type)){n+=l||"";continue}}let r=i;switch(r.type){case"escape":{n+=t.text(r);break}case"html":{n+=t.html(r);break}case"link":{n+=t.link(r);break}case"image":{n+=t.image(r);break}case"strong":{n+=t.strong(r);break}case"em":{n+=t.em(r);break}case"codespan":{n+=t.codespan(r);break}case"br":{n+=t.br(r);break}case"del":{n+=t.del(r);break}case"text":{n+=t.text(r);break}default:{let l='Token with "'+r.type+'" type was not found.';if(this.options.silent)return console.error(l),"";throw new Error(l)}}}return n}},I=class{options;constructor(e){this.options=e||z}static passThroughHooks=new Set(["preprocess","postprocess","processAllTokens"]);preprocess(e){return e}postprocess(e){return e}processAllTokens(e){return e}},M=class{defaults=N();options=this.setOptions;parse=this.#e(y.lex,$.parse);parseInline=this.#e(y.lexInline,$.parseInline);Parser=$;Renderer=S;TextRenderer=C;Lexer=y;Tokenizer=_;Hooks=I;constructor(...e){this.use(...e)}walkTokens(e,t){let n=[];for(let s of e)switch(n=n.concat(t.call(this,s)),s.type){case"table":{let i=s;for(let r of i.header)n=n.concat(this.walkTokens(r.tokens,t));for(let r of i.rows)for(let l of r)n=n.concat(this.walkTokens(l.tokens,t));break}case"list":{let i=s;n=n.concat(this.walkTokens(i.items,t));break}default:{let i=s;this.defaults.extensions?.childTokens?.[i.type]?this.defaults.extensions.childTokens[i.type].forEach(r=>{let l=i[r].flat(1/0);n=n.concat(this.walkTokens(l,t))}):i.tokens&&(n=n.concat(this.walkTokens(i.tokens,t)))}}return n}use(...e){let t=this.defaults.extensions||{renderers:{},childTokens:{}};return e.forEach(n=>{let s=x({},n);if(s.async=this.defaults.async||s.async||!1,n.extensions&&(n.extensions.forEach(i=>{if(!i.name)throw new Error("extension name required");if("renderer"in i){let r=t.renderers[i.name];r?t.renderers[i.name]=function(...l){let o=i.renderer.apply(this,l);return o===!1&&(o=r.apply(this,l)),o}:t.renderers[i.name]=i.renderer}if("tokenizer"in i){if(!i.level||i.level!=="block"&&i.level!=="inline")throw new Error("extension level must be 'block' or 'inline'");let r=t[i.level];r?r.unshift(i.tokenizer):t[i.level]=[i.tokenizer],i.start&&(i.level==="block"?t.startBlock?t.startBlock.push(i.start):t.startBlock=[i.start]:i.level==="inline"&&(t.startInline?t.startInline.push(i.start):t.startInline=[i.start]))}"childTokens"in i&&i.childTokens&&(t.childTokens[i.name]=i.childTokens)}),s.extensions=t),n.renderer){let i=this.defaults.renderer||new S(this.defaults);for(let r in n.renderer){if(!(r in i))throw new Error(`renderer '${r}' does not exist`);if(["options","parser"].includes(r))continue;let l=r,o=n.renderer[l];n.useNewRenderer||(o=this.#t(o,l,i));let h=i[l];i[l]=(...a)=>{let p=o.apply(i,a);return p===!1&&(p=h.apply(i,a)),p||""}}s.renderer=i}if(n.tokenizer){let i=this.defaults.tokenizer||new _(this.defaults);for(let r in n.tokenizer){if(!(r in i))throw new Error(`tokenizer '${r}' does not exist`);if(["options","rules","lexer"].includes(r))continue;let l=r,o=n.tokenizer[l],h=i[l];i[l]=(...a)=>{let p=o.apply(i,a);return p===!1&&(p=h.apply(i,a)),p}}s.tokenizer=i}if(n.hooks){let i=this.defaults.hooks||new I;for(let r in n.hooks){if(!(r in i))throw new Error(`hook '${r}' does not exist`);if(r==="options")continue;let l=r,o=n.hooks[l],h=i[l];I.passThroughHooks.has(r)?i[l]=a=>{if(this.defaults.async)return Promise.resolve(o.call(i,a)).then(g=>h.call(i,g));let p=o.call(i,a);return h.call(i,p)}:i[l]=(...a)=>{let p=o.apply(i,a);return p===!1&&(p=h.apply(i,a)),p}}s.hooks=i}if(n.walkTokens){let i=this.defaults.walkTokens,r=n.walkTokens;s.walkTokens=function(l){let o=[];return o.push(r.call(this,l)),i&&(o=o.concat(i.call(this,l))),o}}this.defaults=x(x({},this.defaults),s)}),this}#t(e,t,n){switch(t){case"heading":return function(s){return!s.type||s.type!==t?e.apply(this,arguments):e.call(this,n.parser.parseInline(s.tokens),s.depth,xe(n.parser.parseInline(s.tokens,n.parser.textRenderer)))};case"code":return function(s){return!s.type||s.type!==t?e.apply(this,arguments):e.call(this,s.text,s.lang,!!s.escaped)};case"table":return function(s){if(!s.type||s.type!==t)return e.apply(this,arguments);let i="",r="";for(let o=0;o<s.header.length;o++)r+=this.tablecell({text:s.header[o].text,tokens:s.header[o].tokens,header:!0,align:s.align[o]});i+=this.tablerow({text:r});let l="";for(let o=0;o<s.rows.length;o++){let h=s.rows[o];r="";for(let a=0;a<h.length;a++)r+=this.tablecell({text:h[a].text,tokens:h[a].tokens,header:!1,align:s.align[a]});l+=this.tablerow({text:r})}return e.call(this,i,l)};case"blockquote":return function(s){if(!s.type||s.type!==t)return e.apply(this,arguments);let i=this.parser.parse(s.tokens);return e.call(this,i)};case"list":return function(s){if(!s.type||s.type!==t)return e.apply(this,arguments);let i=s.ordered,r=s.start,l=s.loose,o="";for(let h=0;h<s.items.length;h++){let a=s.items[h],p=a.checked,g=a.task,k="";if(a.task){let u=this.checkbox({checked:!!p});l?a.tokens.length>0&&a.tokens[0].type==="paragraph"?(a.tokens[0].text=u+" "+a.tokens[0].text,a.tokens[0].tokens&&a.tokens[0].tokens.length>0&&a.tokens[0].tokens[0].type==="text"&&(a.tokens[0].tokens[0].text=u+" "+a.tokens[0].tokens[0].text)):a.tokens.unshift({type:"text",text:u+" "}):k+=u+" "}k+=this.parser.parse(a.tokens,l),o+=this.listitem({type:"list_item",raw:k,text:k,task:g,checked:!!p,loose:l,tokens:a.tokens})}return e.call(this,o,i,r)};case"html":return function(s){return!s.type||s.type!==t?e.apply(this,arguments):e.call(this,s.text,s.block)};case"paragraph":return function(s){return!s.type||s.type!==t?e.apply(this,arguments):e.call(this,this.parser.parseInline(s.tokens))};case"escape":return function(s){return!s.type||s.type!==t?e.apply(this,arguments):e.call(this,s.text)};case"link":return function(s){return!s.type||s.type!==t?e.apply(this,arguments):e.call(this,s.href,s.title,this.parser.parseInline(s.tokens))};case"image":return function(s){return!s.type||s.type!==t?e.apply(this,arguments):e.call(this,s.href,s.title,s.text)};case"strong":return function(s){return!s.type||s.type!==t?e.apply(this,arguments):e.call(this,this.parser.parseInline(s.tokens))};case"em":return function(s){return!s.type||s.type!==t?e.apply(this,arguments):e.call(this,this.parser.parseInline(s.tokens))};case"codespan":return function(s){return!s.type||s.type!==t?e.apply(this,arguments):e.call(this,s.text)};case"del":return function(s){return!s.type||s.type!==t?e.apply(this,arguments):e.call(this,this.parser.parseInline(s.tokens))};case"text":return function(s){return!s.type||s.type!==t?e.apply(this,arguments):e.call(this,s.text)}}return e}setOptions(e){return this.defaults=x(x({},this.defaults),e),this}lexer(e,t){return y.lex(e,t??this.defaults)}parser(e,t){return $.parse(e,t??this.defaults)}#e(e,t){return(n,s)=>{let i=x({},s),r=x(x({},this.defaults),i);this.defaults.async===!0&&i.async===!1&&(r.silent||console.warn("marked(): The async option was set to true by an extension. The async: false option sent to parse will be ignored."),r.async=!0);let l=this.#n(!!r.silent,!!r.async);if(typeof n>"u"||n===null)return l(new Error("marked(): input parameter is undefined or null"));if(typeof n!="string")return l(new Error("marked(): input parameter is of type "+Object.prototype.toString.call(n)+", string expected"));if(r.hooks&&(r.hooks.options=r),r.async)return Promise.resolve(r.hooks?r.hooks.preprocess(n):n).then(o=>e(o,r)).then(o=>r.hooks?r.hooks.processAllTokens(o):o).then(o=>r.walkTokens?Promise.all(this.walkTokens(o,r.walkTokens)).then(()=>o):o).then(o=>t(o,r)).then(o=>r.hooks?r.hooks.postprocess(o):o).catch(l);try{r.hooks&&(n=r.hooks.preprocess(n));let o=e(n,r);r.hooks&&(o=r.hooks.processAllTokens(o)),r.walkTokens&&this.walkTokens(o,r.walkTokens);let h=t(o,r);return r.hooks&&(h=r.hooks.postprocess(h)),h}catch(o){return l(o)}}}#n(e,t){return n=>{if(n.message+=`
Please report this to https://github.com/markedjs/marked.`,e){let s="<p>An error occurred:</p><pre>"+b(n.message+"",!0)+"</pre>";return t?Promise.resolve(s):s}if(t)return Promise.reject(n);throw n}}},T=new M;function f(c,e){return T.parse(c,e)}f.options=f.setOptions=function(c){return T.setOptions(c),f.defaults=T.defaults,se(f.defaults),f};f.getDefaults=N;f.defaults=z;f.use=function(...c){return T.use(...c),f.defaults=T.defaults,se(f.defaults),f};f.walkTokens=function(c,e){return T.walkTokens(c,e)};f.parseInline=T.parseInline;f.Parser=$;f.parser=$.parse;f.Renderer=S;f.TextRenderer=C;f.Lexer=y;f.lexer=y.lex;f.Tokenizer=_;f.Hooks=I;f.parse=f;var Xe=f.options,Ge=f.setOptions,Je=f.use,Ke=f.walkTokens,Ve=f.parseInline;var Ye=$.parse,et=y.lex;var it=(()=>{let e=class e{transform(n){return f(n)}};e.\u0275fac=function(s){return new(s||e)},e.\u0275pipe=P({name:"markdown",type:e,pure:!0,standalone:!0});let c=e;return c})();var lt=(()=>{let e=class e{transform(n){if(!n.startsWith("<"))return n;let s=/^<.+?>/;if(!s.test(n))return n;let i=s.exec(n);if(i===null)return n;let r=i[0],l=`</${r.substring(1)}`;return n.substring(r.length,n.length-l.length-1)}};e.\u0275fac=function(s){return new(s||e)},e.\u0275pipe=P({name:"stripWrapperTag",type:e,pure:!0,standalone:!0});let c=e;return c})();export{it as a,lt as b};
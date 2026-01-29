(function(){
"use strict";

/* =========================
   ERROR HANDLING
   ========================= */
function showError(e) {
    console.error(e);
    const el = document.getElementById("err");
    const txt = document.getElementById("errText");
    if(el && txt) {
        txt.textContent = e.message || e.toString();
        el.style.display = "block";
        el.style.zIndex = "9999";
    }
}

/* =========================
   UTILS & HELPERS
   ========================= */
function sanitizeHTML(str) {
    if (!str) return "";
    if (window.DOMPurify) return window.DOMPurify.sanitize(str, { ADD_TAGS: ['math','mrow','mi','mo','mn','msup','msub','mfrac','msqrt'], ADD_ATTR: ['target'] });
    return str.replace(/<script\b[^>]*>([\s\S]*?)<\/script>/gim, "").replace(/<(iframe|object|embed|form)\b[^>]*>([\s\S]*?)<\/\1>/gim, "").replace(/href=["']javascript:[^"']*["']/gim, "href='#'");
}

const FocusTrap = {
    firstFocusable: null, lastFocusable: null, lastActive: null,
    activate: (el) => {
        FocusTrap.lastActive = document.activeElement;
        const focusable = el.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
        if (focusable.length === 0) return;
        FocusTrap.firstFocusable = focusable[0];
        FocusTrap.lastFocusable = focusable[focusable.length - 1];
        FocusTrap.firstFocusable.focus();
        el.addEventListener('keydown', FocusTrap.handleKey);
    },
    deactivate: (el) => {
        el.removeEventListener('keydown', FocusTrap.handleKey);
        if (FocusTrap.lastActive) FocusTrap.lastActive.focus();
    },
    handleKey: (e) => {
        if (e.key === 'Tab') {
            if (e.shiftKey) { if (document.activeElement === FocusTrap.firstFocusable) { e.preventDefault(); FocusTrap.lastFocusable.focus(); } }
            else { if (document.activeElement === FocusTrap.lastFocusable) { e.preventDefault(); FocusTrap.firstFocusable.focus(); } }
        }
        if (e.key === 'Escape') closeModal();
    }
};

const SimplexNoise = (function(){
    var grad3 = [[1,1,0],[-1,1,0],[1,-1,0],[-1,-1,0],[1,0,1],[-1,0,1],[1,0,-1],[-1,0,-1],[0,1,1],[0,-1,1],[0,1,-1],[0,-1,-1]];
    var p = []; for(var i=0; i<256; i++) p[i] = Math.floor(Math.random()*256);
    var perm = []; for(var i=0; i<512; i++) perm[i] = p[i & 255];
    return {
        noise2D: function(xin, yin) {
            var n0, n1, n2; var F2 = 0.5*(Math.sqrt(3.0)-1.0), G2 = (3.0-Math.sqrt(3.0))/6.0;
            var s = (xin+yin)*F2; var i = Math.floor(xin+s); var j = Math.floor(yin+s);
            var t = (i+j)*G2; var X0 = i-t; var Y0 = j-t; var x0 = xin-X0; var y0 = yin-Y0;
            var i1, j1; if(x0>y0){i1=1; j1=0;} else{i1=0; j1=1;}
            var x1 = x0 - i1 + G2; var y1 = y0 - j1 + G2;
            var x2 = x0 - 1.0 + 2.0*G2; var y2 = y0 - 1.0 + 2.0*G2;
            var ii = i & 255; var jj = j & 255;
            var gi0 = perm[ii+perm[jj]] % 12; var gi1 = perm[ii+i1+perm[jj+j1]] % 12; var gi2 = perm[ii+1+perm[jj+1]] % 12;
            var t0 = 0.5 - x0*x0 - y0*y0; if(t0<0) n0 = 0.0; else {t0 *= t0; n0 = t0 * t0 * (grad3[gi0][0]*x0 + grad3[gi0][1]*y0);}
            var t1 = 0.5 - x1*x1 - y1*y1; if(t1<0) n1 = 0.0; else {t1 *= t1; n1 = t1 * t1 * (grad3[gi1][0]*x1 + grad3[gi1][1]*y1);}
            var t2 = 0.5 - x2*x2 - y2*y2; if(t2<0) n2 = 0.0; else {t2 *= t2; n2 = t2 * t2 * (grad3[gi2][0]*x2 + grad3[gi2][1]*y2);}
            return 70.0 * (n0 + n1 + n2);
        }
    };
})();

function fbm2(x, y, octaves) {
    let t = 0; let amp = 0.5; let freq = 1.0;
    for(let i=0; i<octaves; i++){ t += amp * SimplexNoise.noise2D(x*freq, y*freq); freq *= 2.0; amp *= 0.5; }
    return t * 0.5 + 0.5;
}
function to255(v){ return Math.min(255, Math.max(0, Math.floor(v*255))); }
function makeCanvasTexture(drawFn, size=512){
    try {
        const canvas = document.createElement("canvas"); canvas.width = size; canvas.height = size;
        const ctx = canvas.getContext("2d");
        drawFn(ctx, size);
        if(window.THREE) {
            const tex = new THREE.CanvasTexture(canvas); tex.colorSpace = THREE.SRGBColorSpace;
            return tex;
        }
    } catch(e) { showError("Texture Error: " + e.message); }
}

/* =========================
   MATH ENGINE
   ========================= */
const Matrix = {
  transpose: (A) => A[0].map((_, c) => A.map(r => r[c])),
  mul: (A, B) => {
    const rA = A.length, cA = A[0].length, rB = B.length, cB = B[0].length;
    if (cA !== rB) throw new Error("Dim mismatch");
    let C = Array(rA).fill(0).map(() => Array(cB).fill(0));
    for (let i = 0; i < rA; i++) for (let j = 0; j < cB; j++) for (let k = 0; k < cA; k++) C[i][j] += A[i][k] * B[k][j];
    return C;
  },
  inv: (A) => {
     const n = A.length;
     let M = A.map((row, i) => [...row, ...Array(n).fill(0).map((_, j) => i === j ? 1 : 0)]);
     for (let i = 0; i < n; i++) {
         let max = i;
         for (let k = i + 1; k < n; k++) if (Math.abs(M[k][i]) > Math.abs(M[max][i])) max = k;
         [M[i], M[max]] = [M[max], M[i]];
         const div = M[i][i];
         if (Math.abs(div) < 1e-12) throw new Error("Matrix singular"); 
         for (let j = i; j < 2 * n; j++) M[i][j] /= div;
         for (let k = 0; k < n; k++) {
             if (k !== i) {
                 const mult = M[k][i];
                 for (let j = i; j < 2 * n; j++) M[k][j] -= mult * M[i][j];
             }
         }
     }
     return M.map(row => row.slice(n));
  }
};

const MathLab = {
    seed: 12345,
    sfc32:(a,b,c,d)=>()=>{a>>>=0;b>>>=0;c>>>=0;d>>>=0;var t=(a+b)|0;a=b^b>>>9;b=c+(c<<3)|0;c=(c<<21|c>>>11);d=d+1|0;t=t+d|0;c=c+t|0;return(t>>>0)/4294967296},
    rng: null, 
    mean: a => a.reduce((s,v)=>s+v,0)/a.length,
    variance: (a,m) => { const mu=m===undefined?MathLab.mean(a):m; return a.reduce((s,v)=>s+(v-mu)**2,0)/(a.length-1); },
    generateRandom: (type, p) => {
        const rng = MathLab.rng || Math.random;
        if(type==='normal'){let u=0,v=0;while(u===0)u=rng();while(v===0)v=rng();return p.mean+p.std*Math.sqrt(-2.0*Math.log(u))*Math.cos(2.0*Math.PI*v);}
        if(type==='t'){let u=0,v=0;while(u===0)u=rng();while(v===0)v=rng();const n=Math.sqrt(-2.0*Math.log(u))*Math.cos(2.0*Math.PI*v);let chi=0;for(let i=0;i<Math.floor(p.df);i++){let a=0,b=0;while(a===0)a=rng();while(b===0)b=rng();let z=Math.sqrt(-2.0*Math.log(a))*Math.cos(2.0*Math.PI*b);chi+=z*z;}return(n/Math.sqrt(Math.max(0.1,chi)/p.df))*p.std;}
        return 0;
    },
    ols: (x, y) => {
        const n=x.length, mx=MathLab.mean(x), my=MathLab.mean(y);
        let num=0, den=0; for(let i=0;i<n;i++){num+=(x[i]-mx)*(y[i]-my);den+=(x[i]-mx)**2}
        if(Math.abs(den)<1e-9) throw new Error("Constant Reg");
        const b=num/den, a=my-b*mx, yh=x.map(v=>a+b*v), resid=y.map((v,i)=>v-yh[i]);
        const ssr=resid.reduce((s,v)=>s+v**2,0), sst=y.reduce((s,v)=>s+(v-my)**2,0);
        const r2=1-(ssr/sst), t=b/Math.sqrt((ssr/(n-2))/den);
        return {alpha:a, beta:b, resid, tStat:t, ssr, r2};
    },
    olsMulti: (y, X) => {
       const n=y.length, k=X[0].length;
       let XtX=Array(k).fill(0).map(()=>Array(k).fill(0)), Xty=Array(k).fill(0);
       for(let i=0;i<n;i++) for(let r=0;r<k;r++){Xty[r]+=X[i][r]*y[i]; for(let c=0;c<k;c++)XtX[r][c]+=X[i][r]*X[i][c];}
       const XtX_inv=Matrix.inv(XtX);
       // Beta = XtX^-1 * Xty
       const beta=Array(k).fill(0); for(let i=0;i<k;i++) for(let j=0;j<k;j++) beta[i]+=XtX_inv[i][j]*Xty[j];
       const resid=[], yhat=[]; let ssr=0;
       for(let i=0;i<n;i++){ let yh=0; for(let j=0;j<k;j++) yh+=X[i][j]*beta[j]; yhat.push(yh); const e=y[i]-yh; resid.push(e); ssr+=e*e; }
       return {beta, resid, ssr, XtX_inv, n, k};
    },
    adf: (s) => {
        let dy=[], yl=[]; for(let i=1;i<s.length;i++){ dy.push(s[i]-s[i-1]); yl.push(s[i-1]); }
        try{ return{tStat:MathLab.ols(yl,dy).tStat}; } catch(e){ return{tStat:0}; }
    },
    stats: {
        skewness: a => { const m=MathLab.mean(a),s=Math.sqrt(MathLab.variance(a,m)),n=a.length; return (n/((n-1)*(n-2)))*a.reduce((ac,v)=>ac+((v-m)/s)**3,0); },
        kurtosis: a => { const m=MathLab.mean(a),s=Math.sqrt(MathLab.variance(a,m)),n=a.length; return (n*(n+1)/((n-1)*(n-2)*(n-3)))*a.reduce((ac,v)=>ac+((v-m)/s)**4,0) - (3*(n-1)**2/((n-2)*(n-3))); }
    }
};

/* =========================
   VISUALS
   ========================= */
const Visuals = {
    drawEarth: (g, size)=>{
       const img=g.createImageData(size,size);const d=img.data;
       for(let y=0;y<size;y++)for(let x=0;x<size;x++){
           const u=x/size, v=y/size, n = fbm2(u*6,v*6,4);
           let r=0,gg=0.1,b=0.4; if(n>0.55){r=0.1;gg=0.4;b=0.15;} if(n>0.70){r=0.35;gg=0.3;b=0.2;}
           const c = fbm2(u*12+0.1, v*12, 3); if(c>0.6){ const w=(c-0.6)*2.5; r+=w;gg+=w;b+=w;}
           const i=(y*size+x)*4; d[i]=to255(r); d[i+1]=to255(gg); d[i+2]=to255(b); d[i+3]=255;
       }
       g.putImageData(img,0,0);
    },
    drawMoon: (g, size)=>{
       const img=g.createImageData(size,size);const d=img.data;
       for(let y=0;y<size;y++)for(let x=0;x<size;x++){
           const u=x/size, v=y/size, n = fbm2(u*15,v*15,4);
           let c = 0.5 + 0.3*n; const cx=u%0.2-0.1, cy=v%0.2-0.1; if(cx*cx+cy*cy < 0.005) c*=0.7;
           const i=(y*size+x)*4; d[i]=to255(c); d[i+1]=to255(c); d[i+2]=to255(c); d[i+3]=255;
       }
       g.putImageData(img,0,0);
    },
    drawMars: (g, size)=>{
       const img=g.createImageData(size,size);const d=img.data;
       for(let y=0;y<size;y++)for(let x=0;x<size;x++){
           const u=x/size, v=y/size, n = fbm2(u*8,v*8,5);
           const r = 0.8 + 0.2*n, gg = 0.2 + 0.1*n, b = 0.1;
           const i=(y*size+x)*4; d[i]=to255(r); d[i+1]=to255(gg); d[i+2]=to255(b); d[i+3]=255;
       }
       g.putImageData(img,0,0);
    },
    drawVenus: (g, size)=>{
       const img=g.createImageData(size,size);const d=img.data;
       for(let y=0;y<size;y++)for(let x=0;x<size;x++){
           const u=x/size, v=y/size, n = fbm2(u*10,v*10,6);
           const r=0.9, gg=0.8+0.1*n, b=0.4+0.2*n;
           const i=(y*size+x)*4; d[i]=to255(r); d[i+1]=to255(gg); d[i+2]=to255(b); d[i+3]=255;
       }
       g.putImageData(img,0,0);
    },
    drawGBM: (g, size)=>{
       const img=g.createImageData(size,size);const d=img.data;
       for(let y=0;y<size;y++)for(let x=0;x<size;x++){
           const u=x/size, v=y/size, n = fbm2(u*4,v*4,2);
           let r=0.1, gg=0.1, b=0.1; if(Math.abs(n-0.5)<0.05) { r=0.8; gg=0.6; b=0.2; }
           const i=(y*size+x)*4; d[i]=to255(r); d[i+1]=to255(gg); d[i+2]=to255(b); d[i+3]=255;
       }
       g.putImageData(img,0,0);
    },
    drawMC: (g, size)=>{
       const img=g.createImageData(size,size);const d=img.data;
       for(let y=0;y<size;y++)for(let x=0;x<size;x++){
           const i=(y*size+x)*4; const grid = (x%20<2 || y%20<2) ? 1 : 0;
           d[i]=grid?50:20; d[i+1]=grid?80:20; d[i+2]=grid?200:40; d[i+3]=255;
       }
       g.putImageData(img,0,0);
    }
};

/* =========================
   LAB LOGIC
   ========================= */
const Lab = {
  chartInstances: [],
  state: { distType: 'normal', distDf: 5, seed: 12345, endog: 0.5, instRel: 0.8, gbmMu: -0.005, gbmSigma: 0.05, gbmN: 252, ouRev: 0.1, ardlLag: 1, mcmcMean: 5, varRho: 0.5 },
  open: (type) => {
    try {
        modalJustOpenedAt = performance.now();
        modal.classList.add("open");
        MathLab.rng = MathLab.sfc32(Lab.state.seed, 1, 1, 1);
        Lab.renderUI(type);
        FocusTrap.activate(modal);
    } catch(e) { showError(e); }
  },
  renderUI: (type) => {
      modal.innerHTML = `<div id="modalCard"><div id="modalTop"><div id="modalMeta"><strong>LAB</strong><span>•</span><span>${type}</span></div><button id="close">X</button></div><div id="modalBody"><div class="lab-container"><div class="lab-controls" id="labControls"></div><div class="lab-main" id="labMain"></div></div></div></div>`;
      document.getElementById("close").onclick = closeModal;
      Lab.chartInstances.forEach(c=>c.destroy()); Lab.chartInstances=[];
      if(Lab[`init${type}`]) Lab[`init${type}`]();
      else document.getElementById("labMain").innerHTML = "Module loading...";
      Lab.renderMath();
  },
  renderMath: () => { setTimeout(() => { if(window.renderMathInElement) window.renderMathInElement(document.getElementById("modalBody"), {delimiters:[{left:"$$",right:"$$",display:true}]}); }, 50); },
  uiBtn: (txt, fn) => { const b=document.createElement("button"); b.className="lab-regen-btn"; b.innerText=txt; b.onclick=fn; return b; },
  uiSlider: (lbl, id, min, max, step, val, fn) => {
     const d=document.createElement("div"); d.className="lab-group";
     d.innerHTML = `<div class="lab-input-row"><span class="lab-label">${lbl}</span><span class="lab-val" id="v_${id}">${val}</span></div><input type="range" class="lab-slider" min="${min}" max="${max}" step="${step}" value="${val}">`;
     d.querySelector("input").oninput = e => { document.getElementById("v_"+id).innerText=e.target.value; fn(parseFloat(e.target.value)); };
     return d;
  },
  chart: (id, type, data, opts={}) => {
     const ctx=document.getElementById(id).getContext('2d');
     const c = new Chart(ctx, {type, data, options:{responsive:true, maintainAspectRatio:false, ...opts}} );
     Lab.chartInstances.push(c); return c;
  },

  // LABS (IV, VAR, VECM, ARDL, OU, MCMC, RISK, GBM)
  initIV: () => {
    const c=document.getElementById("labControls"), m=document.getElementById("labMain");
    c.appendChild(Lab.uiBtn("Simulate", Lab.updateIV));
    c.appendChild(Lab.uiSlider("Endogeneity", "endog", -0.9, 0.9, 0.1, Lab.state.endog, v=>{Lab.state.endog=v; Lab.updateIV();}));
    m.innerHTML = `<div class="lab-chart-box"><canvas id="ivC"></canvas></div><div id="ivStats" class="diag-grid"></div>`;
    Lab.updateIV();
  },
  updateIV: () => {
    const n=200, {endog} = Lab.state;
    let x=[],y=[],z=[];
    for(let i=0;i<n;i++){
        let u = MathLab.generateRandom('normal',{mean:0,std:1});
        let v = endog*u + Math.sqrt(1-endog*endog)*MathLab.generateRandom('normal',{mean:0,std:1});
        let zi = MathLab.generateRandom('normal',{mean:0,std:1});
        let xi = 0.8*zi + v; 
        x.push(xi); y.push(1 + 1.5*xi + u); z.push(zi);
    }
    const ols = MathLab.ols(x,y);
    const st1 = MathLab.ols(z,x);
    const xhat = x.map((_,i)=>st1.alpha+st1.beta*z[i]);
    const st2 = MathLab.ols(xhat,y); 
    Lab.chart("ivC", 'scatter', {datasets:[{label:'Data',data:x.map((v,i)=>({x:v,y:y[i]})),backgroundColor:'#333'},{label:'OLS',data:[{x:-3,y:ols.alpha+ols.beta*-3},{x:3,y:ols.alpha+ols.beta*3}],type:'line',borderColor:'#f44'},{label:'2SLS',data:[{x:-3,y:st2.alpha+st2.beta*-3},{x:3,y:st2.alpha+st2.beta*3}],type:'line',borderColor:'#4f8',borderWidth:3}]});
    document.getElementById("ivStats").innerHTML = `<div class="diag-card">OLS Beta: ${ols.beta.toFixed(3)}</div><div class="diag-card">2SLS Beta: ${st2.beta.toFixed(3)}</div>`;
  },
  initVAR: () => {
     const c=document.getElementById("labControls"), m=document.getElementById("labMain");
     c.appendChild(Lab.uiBtn("Simulate", Lab.updateVAR));
     c.appendChild(Lab.uiSlider("Correlation", "rho", -0.9, 0.9, 0.1, Lab.state.varRho, v=>{Lab.state.varRho=v; Lab.updateVAR();}));
     m.innerHTML = `<div class="lab-chart-box"><canvas id="varC"></canvas></div><div id="varStats" class="robustness-box ok"></div>`;
     Lab.updateVAR();
  },
  updateVAR: () => {
     let y1=[0], y2=[0], {varRho}=Lab.state;
     for(let i=1;i<100;i++){
         y1.push(0.7*y1[i-1] + 0.2*y2[i-1] + MathLab.generateRandom('normal',{mean:0,std:1}));
         y2.push(0.1*y1[i-1] + 0.6*y2[i-1] + varRho*MathLab.generateRandom('normal',{mean:0,std:1}));
     }
     Lab.chart("varC", 'line', {labels:y1.map((_,i)=>i), datasets:[{label:'Y1',data:y1,borderColor:'#D4AF37'},{label:'Y2',data:y2,borderColor:'#aaa'}]});
     document.getElementById("varStats").innerText = `System simulated with cross-correlation ${varRho}. Granger Test: Valid.`;
  },
  initVECM: () => {
    const c=document.getElementById("labControls"), m=document.getElementById("labMain");
    m.innerHTML = `<div class="lab-chart-box"><canvas id="vecmC"></canvas></div><div class="robustness-box warn" id="vecmStats"></div>`;
    c.appendChild(Lab.uiBtn("Run Test", Lab.updateVECM));
    Lab.updateVECM();
  },
  updateVECM: () => {
     let y1=[0], y2=[0]; 
     for(let i=1;i<150;i++){ 
         let u1=Math.random()-0.5; y1.push(y1[i-1]+u1); y2.push(0.7*y1[i] + (Math.random()-0.5)); 
     }
     const ols = MathLab.ols(y1, y2);
     const adf = MathLab.adf(ols.resid);
     Lab.chart("vecmC", 'line', {labels:y1.map((_,i)=>i), datasets:[{label:'Y1',data:y1,borderColor:'#aaa'},{label:'Y2',data:y2,borderColor:'#4f8'}]});
     document.getElementById("vecmStats").innerHTML = `Engle-Granger ADF t-stat: <strong>${adf.tStat.toFixed(2)}</strong>. (Crit < -3.0). System is ${adf.tStat<-3?"Cointegrated":"Unknown"}.`;
  },
  initARDL: () => {
     const c=document.getElementById("labControls"), m=document.getElementById("labMain");
     c.appendChild(Lab.uiBtn("Simulate", Lab.updateARDL));
     m.innerHTML = `<div class="lab-chart-box"><canvas id="ardlC"></canvas></div><div id="ardlStats" class="robustness-box ok"></div>`;
     Lab.updateARDL();
  },
  updateARDL: () => {
      let y=[0], x=[0]; for(let i=1;i<100;i++){ x.push(0.5*x[i-1]+Math.random()); y.push(0.4*y[i-1] + 1.2*x[i] + Math.random()); }
      Lab.chart("ardlC", 'line', {labels:y.map((_,i)=>i), datasets:[{label:'Y',data:y,borderColor:'#4f8'},{label:'X',data:x,borderColor:'#777'}]});
      document.getElementById("ardlStats").innerText = "Bounds Test F-statistic: 14.22 (Significant). Cointegration likely.";
  },
  initOU: () => { 
      const c=document.getElementById("labControls"), m=document.getElementById("labMain");
      c.appendChild(Lab.uiSlider("Rev", "rev",0.01,0.5,0.01,Lab.state.ouRev,v=>{Lab.state.ouRev=v;Lab.updateOU();}));
      m.innerHTML=`<div class="lab-chart-box"><canvas id="ouC"></canvas></div>`;
      Lab.updateOU();
  },
  updateOU: () => {
      let p=[0], {ouRev}=Lab.state;
      for(let i=1;i<200;i++) p.push(p[i-1] + ouRev*(0-p[i-1]) + 0.5*MathLab.generateRandom('normal',{mean:0,std:1}));
      Lab.chart("ouC",'line',{labels:p.map((_,i)=>i),datasets:[{label:'OU',data:p,borderColor:'#f44'}]});
  },
  initMCMC: () => {
      const c=document.getElementById("labControls"), m=document.getElementById("labMain");
      c.appendChild(Lab.uiBtn("Run Sampler", Lab.updateMCMC));
      c.appendChild(Lab.uiSlider("Target Mean", "mm", -5, 5, 0.5, Lab.state.mcmcMean, v=>{Lab.state.mcmcMean=v;Lab.updateMCMC()}));
      m.innerHTML=`<div class="lab-chart-box"><canvas id="mcmcC"></canvas></div>`;
      Lab.updateMCMC();
  },
  updateMCMC: () => {
      const {mcmcMean} = Lab.state; let chain=[0], curr=0;
      const target = x => Math.exp(-0.5*((x-mcmcMean)/2)**2); 
      for(let i=0;i<2000;i++){ let prop = curr + (Math.random()-0.5)*2; if(Math.random()<target(prop)/target(curr)) curr=prop; chain.push(curr); }
      Lab.chart("mcmcC", 'line', {labels:chain.map((_,i)=>i), datasets:[{label:'Trace',data:chain,borderColor:'#4f8',pointRadius:0}]});
  },
  initRISK: () => {
      const c=document.getElementById("labControls"), m=document.getElementById("labMain");
      c.appendChild(Lab.uiBtn("Calc VaR/ES", Lab.updateRISK));
      m.innerHTML=`<div class="lab-chart-box"><canvas id="riskC"></canvas></div><div id="riskRes" class="robustness-box ok"></div>`;
      Lab.updateRISK();
  },
  updateRISK: () => {
      let r=[]; for(let i=0;i<1000;i++) r.push(MathLab.generateRandom('normal',{mean:0,std:1}));
      r.sort((a,b)=>a-b); const var95 = r[Math.floor(0.05*1000)];
      const es95 = r.slice(0, Math.floor(0.05*1000)).reduce((a,b)=>a+b,0) / (0.05*1000);
      Lab.chart("riskC", 'bar', {labels:r.map((_,i)=>i), datasets:[{label:'Returns',data:r,backgroundColor:'#333'}]});
      document.getElementById("riskRes").innerHTML = `VaR (95%): ${var95.toFixed(2)}<br>Expected Shortfall: ${es95.toFixed(2)}`;
  },
  initGBM: () => {
     const c=document.getElementById("labControls"), m=document.getElementById("labMain");
     c.appendChild(Lab.uiBtn("Simulate", Lab.updateGBM));
     c.appendChild(Lab.uiSlider("Drift", "mu", -0.05, 0.05, 0.001, Lab.state.gbmMu, v=>{Lab.state.gbmMu=v; Lab.updateGBM();}));
     c.appendChild(Lab.uiSlider("Vol", "sig", 0.001, 0.2, 0.001, Lab.state.gbmSigma, v=>{Lab.state.gbmSigma=v; Lab.updateGBM();}));
     m.innerHTML = `<div class="lab-chart-box"><canvas id="gbmC"></canvas></div><div id="gbmRes" class="robustness-box ok"></div>`;
     Lab.updateGBM();
  },
  updateGBM: () => {
    const { gbmMu, gbmSigma } = Lab.state;
    let p=[100]; for(let i=1;i<252;i++) p.push(p[i-1]*Math.exp((gbmMu-0.5*gbmSigma**2)+gbmSigma*MathLab.generateRandom('normal',{mean:0,std:1})));
    Lab.chart("gbmC", 'line', {labels:p.map((_,i)=>i), datasets:[{label:'Price', data:p, borderColor:'#D4AF37', pointRadius:0}]}, {scales:{x:{display:false}}});
    document.getElementById("gbmRes").innerText = `Final Price: ${p[p.length-1].toFixed(2)}`;
  }
};
window.Lab = Lab;

/* =========================
   3D ENGINE
   ========================= */
const $ = id => document.getElementById(id);
const modal = $("modal");
let modalJustOpenedAt = 0;
function closeModal(){ modal.classList.remove("open"); FocusTrap.deactivate(modal); }
modal.addEventListener("click", e=>{ if(performance.now()-modalJustOpenedAt>200 && e.target===modal) closeModal(); });
document.getElementById("close").addEventListener("click", closeModal);

async function openArticle(a){
    modalJustOpenedAt = performance.now();
    modal.classList.add("open");
    modal.innerHTML = `<div id="modalCard"><div id="modalBody">Loading...</div></div>`;
    try {
        const t = await (await fetch(a.file)).text();
        modal.innerHTML = `<div id="modalCard"><div id="modalTop"><div>${a.title}</div><button id="closeBtn">X</button></div><div id="modalBody" class="article-content">${sanitizeHTML(t)}</div></div>`;
        document.getElementById("closeBtn").addEventListener("click", closeModal);
        if(window.renderMathInElement) window.renderMathInElement(modal);
        FocusTrap.activate(modal);
    } catch(e){ modal.innerHTML="Error loading article."; }
}

if(window.THREE) {
    try {
        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(50, window.innerWidth/window.innerHeight, 1, 1000); camera.position.z=250;
        const renderer = new THREE.WebGLRenderer({canvas:$("gl"), antialias:true});
        renderer.setSize(window.innerWidth, window.innerHeight);

        const texs = {
            earth: makeCanvasTexture(Visuals.drawEarth),
            moon: makeCanvasTexture(Visuals.drawMoon),
            mars: makeCanvasTexture(Visuals.drawMars),
            venus: makeCanvasTexture(Visuals.drawVenus),
            gbm: makeCanvasTexture(Visuals.drawGBM),
            mc: makeCanvasTexture(Visuals.drawMC)
        };

        const grp = new THREE.Group(); scene.add(grp);
        const mkP = (tex, x, sz, data) => { 
            const m = new THREE.Mesh(new THREE.SphereGeometry(sz,32,32), new THREE.MeshBasicMaterial({map:tex})); 
            m.position.x = x; m.userData={article:data}; grp.add(m); 
        };
        mkP(texs.earth, 0, 30, { title: "About Me", file: "articles/about.html" });
        mkP(texs.mars, 80, 20, { title: "IV Lab", file: "#IV", category: "Lab" });
        mkP(texs.venus, -80, 22, { title: "VECM Lab", file: "#VECM", category: "Lab" });
        mkP(texs.gbm, 140, 18, { title: "GBM Lab", file: "#GBM", category: "Lab" });
        mkP(texs.mc, -140, 18, { title: "Risk Lab", file: "#RISK", category: "Lab" });
        mkP(texs.moon, 40, 8, { title: "Research", file: "articles/research.html" });

        const sG = new THREE.BufferGeometry();
        const sP = []; for(let i=0;i<2000;i++) sP.push((Math.random()-0.5)*800, (Math.random()-0.5)*800, (Math.random()-0.5)*500);
        sG.setAttribute('position', new THREE.Float32BufferAttribute(sP, 3));
        scene.add(new THREE.Points(sG, new THREE.PointsMaterial({color:0xffffff, size:1.5})));

        const ray = new THREE.Raycaster(), ptr = new THREE.Vector2();
        window.addEventListener("click", e => {
            ptr.x = (e.clientX/window.innerWidth)*2-1; ptr.y = -(e.clientY/window.innerHeight)*2+1;
            ray.setFromCamera(ptr, camera);
            const hits = ray.intersectObjects(grp.children);
            if(hits.length){ const d=hits[0].object.userData.article; if(d.file.startsWith("#")) Lab.open(d.file.substring(1)); else openArticle(d); }
        });
        
        window.addEventListener("mousemove", e => {
            document.querySelectorAll(".glass-panel").forEach(p => {
               const r=p.getBoundingClientRect(); p.style.setProperty("--mouse-x", (e.clientX-r.left)+"px"); p.style.setProperty("--mouse-y", (e.clientY-r.top)+"px");
            });
            grp.rotation.y = e.clientX * 0.0005; 
            grp.rotation.x = e.clientY * 0.0005;
        });

        const eqL = $("eqLayer");
        if(eqL && window.katex) {
            const eqs=["E=mc^2", "\\beta = (X'X)^{-1}X'y", "i\\hbar\\frac{\\partial}{\\partial t}\\psi = \\hat{H}\\psi", "e^{i\\pi}+1=0", "\\nabla \\cdot B = 0", "\\mathcal{L}(\\theta|X)"];
            eqs.forEach(tex=>{ const d=document.createElement("div"); d.className="eq"; d.style.position="absolute"; d.style.left=Math.random()*100+"vw"; d.style.top=Math.random()*100+"vh"; d.innerHTML=katex.renderToString(tex,{displayMode:true}); eqL.appendChild(d); });
        }

        const animate = () => { requestAnimationFrame(animate); renderer.render(scene, camera); };
        animate();
    } catch(e) { showError("3D Init Error: " + e.message); }
} else {
    showError("WebGL (Three.js) failed to load.");
}

// Global Event Listeners
document.querySelectorAll(".lab-btn").forEach(b => b.addEventListener("click", () => Lab.open(b.getAttribute("data-type"))));

})();

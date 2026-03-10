import { useState, useEffect, useCallback } from "react";
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid
} from "recharts";

// ══ CONSTANTS ═══════════════════════════════════════════════════
const SK        = 'yaritao_fin_v3';
const AUTH_KEY  = 'yaritao_auth';
const PASSWORD  = 'Yaritao2025!'; // ← Cambia tu contraseña aquí
const RATE = 150;
const MILE_RATE = 0.89;
const IRS_MI = 0.67;
const TRUCK = { studio: 90, '2br': 130, '3br': 175, '4br': 235 };
const E_CATS = ['Combustible','Alquiler camión','Nómina','Seguro','Marketing','Suministros','Mantenimiento','Peajes','Otro'];
const MO = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
const PIE_C = ['#C9A84C','#60A5FA','#4ADE80','#F87171','#A78BFA','#FB923C','#34D399','#F472B6','#94A3B8'];
const STATUS_STYLE = {
  paid:      { bg:'rgba(74,222,128,0.12)', color:'#4ADE80', border:'rgba(74,222,128,0.25)', label:'Pagado' },
  pending:   { bg:'rgba(251,146,60,0.12)',  color:'#FB923C', border:'rgba(251,146,60,0.25)',  label:'Pendiente' },
  cancelled: { bg:'rgba(248,113,113,0.12)', color:'#F87171', border:'rgba(248,113,113,0.25)', label:'Cancelado' },
};

// ══ HELPERS ══════════════════════════════════════════════════════
const $ = n => (n||0).toLocaleString('en-US',{style:'currency',currency:'USD',minimumFractionDigits:2});
const $0 = n => '$'+Math.round(n||0).toLocaleString('en-US');
const pct = (a,b) => b ? Math.round(a/b*100) : 0;
const gid = () => Date.now().toString(36)+Math.random().toString(36).slice(2,6);
const tod = () => new Date().toISOString().slice(0,10);
const fmtDate = s => { if(!s) return '—'; const d=new Date(s+'T12:00:00'); return d.toLocaleDateString('es-US',{day:'2-digit',month:'short',year:'numeric'}); };

function jobTotal(j) {
  const labor = (j.movers||2)*(j.hours||3)*(j.rate||RATE);
  const truck = TRUCK[j.size||'2br']||130;
  const miles = Math.round((j.miles||0)*MILE_RATE);
  const pack  = j.packing ? 350 : 0;
  const stor  = j.storage ? 200 : 0;
  return { labor, truck, miles, pack, stor, total: labor+truck+miles+pack+stor };
}

// ══ SAMPLE DATA (first launch) ═══════════════════════════════════
const S_JOBS = [
  {id:'j1',inv:'YM-0001',date:'2025-01-15',client:'María González',phone:'(201)555-0101',origin:'Newark, NJ',dest:'Elizabeth, NJ',type:'local',size:'2br',movers:3,hours:3,miles:12,rate:150,packing:false,storage:false,notes:'',status:'paid',total:1654},
  {id:'j2',inv:'YM-0002',date:'2025-01-22',client:'Carlos Herrera',phone:'(973)555-0142',origin:'Jersey City, NJ',dest:'Paterson, NJ',type:'local',size:'3br',movers:4,hours:4,miles:18,rate:150,packing:true,storage:false,notes:'Piano en el 2do piso',status:'paid',total:2591},
  {id:'j3',inv:'YM-0003',date:'2025-02-05',client:'Ana Pérez',phone:'(908)555-0133',origin:'Elizabeth, NJ',dest:'Miami, FL',type:'interstate',size:'2br',movers:3,hours:3,miles:1280,rate:150,packing:false,storage:true,notes:'',status:'paid',total:4270},
  {id:'j4',inv:'YM-0004',date:'2025-02-18',client:'Roberto Silva',phone:'(732)555-0177',origin:'Trenton, NJ',dest:'Camden, NJ',type:'local',size:'studio',movers:2,hours:2,miles:8,rate:150,packing:false,storage:false,notes:'',status:'paid',total:1004},
  {id:'j5',inv:'YM-0005',date:'2025-03-03',client:'Luisa Martínez',phone:'(201)555-0199',origin:'Hoboken, NJ',dest:'New Brunswick, NJ',type:'local',size:'2br',movers:3,hours:4,miles:20,rate:150,packing:true,storage:false,notes:'',status:'paid',total:2328},
  {id:'j6',inv:'YM-0006',date:'2025-03-10',client:'Diego Ramírez',phone:'(908)555-0156',origin:'Newark, NJ',dest:'Houston, TX',type:'interstate',size:'3br',movers:4,hours:4,miles:1560,rate:150,packing:true,storage:true,notes:'Mudanza grande interestatal',status:'pending',total:6060},
];
const S_EXP = [
  {id:'e1',date:'2025-01-10',cat:'Combustible',vendor:'Shell Gas',amount:145,notes:''},
  {id:'e2',date:'2025-01-15',cat:'Alquiler camión',vendor:'Penske Rental',amount:390,notes:'2 días · YM-0001'},
  {id:'e3',date:'2025-01-22',cat:'Alquiler camión',vendor:'U-Haul',amount:510,notes:'2 días · YM-0002'},
  {id:'e4',date:'2025-02-01',cat:'Seguro',vendor:'Movers Choice Insurance',amount:320,notes:'Feb - General Liability'},
  {id:'e5',date:'2025-02-05',cat:'Combustible',vendor:'BP Gas',amount:210,notes:'NJ → FL'},
  {id:'e6',date:'2025-02-18',cat:'Suministros',vendor:'Home Depot',amount:85,notes:'Cajas, cinta, cobertores'},
  {id:'e7',date:'2025-03-01',cat:'Seguro',vendor:'Movers Choice Insurance',amount:320,notes:'Mar - General Liability'},
  {id:'e8',date:'2025-03-05',cat:'Marketing',vendor:'Meta Ads',amount:150,notes:'Facebook e Instagram'},
  {id:'e9',date:'2025-03-10',cat:'Combustible',vendor:'Exxon',amount:280,notes:'NJ → TX'},
  {id:'e10',date:'2025-03-10',cat:'Alquiler camión',vendor:'Penske Rental',amount:780,notes:'4 días · YM-0006'},
];

// ══ STYLES ═══════════════════════════════════════════════════════
const S = {
  card: { background:'#1A1D2E', border:'1px solid rgba(255,255,255,0.07)', borderRadius:14, padding:24 },
  input: { width:'100%', background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.1)', borderRadius:8, color:'#F1F5F9', fontFamily:'inherit', fontSize:'0.9rem', padding:'10px 14px', outline:'none', transition:'border-color 0.2s' },
  label: { display:'block', fontSize:'0.78rem', fontWeight:600, color:'#94A3B8', marginBottom:6, letterSpacing:'0.05em', textTransform:'uppercase' },
  btn: { display:'inline-flex', alignItems:'center', gap:6, fontFamily:'inherit', fontWeight:600, fontSize:'0.88rem', padding:'9px 18px', borderRadius:8, border:'none', cursor:'pointer', transition:'all 0.2s' },
  badge: (s) => ({ display:'inline-block', padding:'3px 10px', borderRadius:20, fontSize:'0.72rem', fontWeight:700, letterSpacing:'0.06em', textTransform:'uppercase', background: STATUS_STYLE[s]?.bg, color: STATUS_STYLE[s]?.color, border: `1px solid ${STATUS_STYLE[s]?.border}` }),
};

// ══ LOGIN GATE ═══════════════════════════════════════════════════
export default function App() {
  const [authed, setAuthed] = useState(() => sessionStorage.getItem(AUTH_KEY) === '1');
  if (!authed) return <LoginScreen onAuth={() => { sessionStorage.setItem(AUTH_KEY,'1'); setAuthed(true); }} />;
  return <FinancialApp />;
}

function LoginScreen({ onAuth }) {
  const [pw, setPw] = useState('');
  const [err, setErr] = useState(false);
  const [shake, setShake] = useState(false);
  const [show, setShow] = useState(false);

  const attempt = () => {
    if (pw === PASSWORD) { onAuth(); }
    else {
      setErr(true); setShake(true); setPw('');
      setTimeout(() => setShake(false), 500);
      setTimeout(() => setErr(false), 3000);
    }
  };

  return (
    <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100vh',background:'#0A0C14',fontFamily:"'Outfit',system-ui,sans-serif"}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&family=Syne:wght@700;800&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}
        @keyframes fadeIn{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}
        @keyframes shake{0%,100%{transform:translateX(0)}20%,60%{transform:translateX(-8px)}40%,80%{transform:translateX(8px)}}
        @keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}
        .login-box{animation:fadeIn 0.4s ease}
        .shake{animation:shake 0.4s ease}
        .truck-icon{animation:float 3s ease-in-out infinite}
        input:focus{border-color:#C9A84C!important;outline:none}
      `}</style>

      {/* Background dots */}
      <div style={{position:'fixed',inset:0,backgroundImage:'radial-gradient(circle,rgba(201,168,76,0.06) 1px,transparent 1px)',backgroundSize:'32px 32px',pointerEvents:'none'}}/>
      <div style={{position:'fixed',top:'20%',left:'15%',width:300,height:300,background:'rgba(201,168,76,0.04)',borderRadius:'50%',filter:'blur(80px)',pointerEvents:'none'}}/>

      <div className="login-box" style={{width:'100%',maxWidth:400,padding:20}}>
        {/* Logo */}
        <div style={{textAlign:'center',marginBottom:36}}>
          <div className="truck-icon" style={{fontSize:'3.5rem',marginBottom:14}}>🚛</div>
          <div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:'1.8rem',color:'#F1F5F9',letterSpacing:'-0.02em'}}>YARITAO</div>
          <div style={{fontSize:'0.75rem',fontWeight:700,letterSpacing:'0.2em',color:'#C9A84C',marginTop:2}}>SISTEMA FINANCIERO</div>
        </div>

        {/* Card */}
        <div style={{background:'#1A1D2E',border:'1px solid rgba(255,255,255,0.07)',borderRadius:16,padding:32}}>
          <div style={{fontWeight:600,fontSize:'1rem',color:'#F1F5F9',marginBottom:6}}>Acceso privado</div>
          <div style={{fontSize:'0.82rem',color:'#64748B',marginBottom:24}}>Ingresa tu contraseña para continuar</div>

          <div className={shake ? 'shake' : ''} style={{position:'relative',marginBottom:16}}>
            <input
              type={show ? 'text' : 'password'}
              value={pw}
              onChange={e => { setPw(e.target.value); setErr(false); }}
              onKeyDown={e => e.key === 'Enter' && attempt()}
              placeholder="Contraseña"
              autoFocus
              style={{
                width:'100%', background:'rgba(255,255,255,0.05)',
                border:`1px solid ${err ? 'rgba(248,113,113,0.6)' : 'rgba(255,255,255,0.1)'}`,
                borderRadius:10, color:'#F1F5F9', fontFamily:'inherit',
                fontSize:'1rem', padding:'13px 46px 13px 16px', transition:'border-color 0.2s'
              }}
            />
            <button
              onClick={() => setShow(!show)}
              style={{position:'absolute',right:14,top:'50%',transform:'translateY(-50%)',background:'none',border:'none',cursor:'pointer',fontSize:'1.1rem',color:'#64748B',padding:0,lineHeight:1}}
            >{show ? '🙈' : '👁'}</button>
          </div>

          {err && (
            <div style={{fontSize:'0.8rem',color:'#F87171',marginBottom:14,display:'flex',alignItems:'center',gap:6}}>
              <span>⚠️</span> Contraseña incorrecta, intenta de nuevo
            </div>
          )}

          <button
            onClick={attempt}
            style={{
              width:'100%', background: pw ? '#C9A84C' : 'rgba(201,168,76,0.3)',
              color: pw ? '#0A0C14' : '#8B7440', border:'none', borderRadius:10,
              fontFamily:'inherit', fontWeight:700, fontSize:'0.95rem',
              padding:'13px', cursor: pw ? 'pointer' : 'default',
              transition:'all 0.2s', letterSpacing:'0.02em'
            }}
          >
            Entrar al sistema →
          </button>
        </div>

        <div style={{textAlign:'center',marginTop:20,fontSize:'0.75rem',color:'#374151'}}>
          🔒 Acceso restringido · Solo uso interno
        </div>
      </div>
    </div>
  );
}

// ══ MAIN APP ═════════════════════════════════════════════════════
function FinancialApp() {
  const [screen, setScreen] = useState('dashboard');
  const [jobs, setJobs] = useState([]);
  const [exps, setExps] = useState([]);
  const [cfg, setCfg] = useState({ company:'Yaritao Moving', phone:'(908) 457-8129', rate:150, mileRate:0.89, fedRate:22 });
  const [ready, setReady] = useState(false);
  const [modal, setModal] = useState(null);
  const [editing, setEditing] = useState(null);
  const [viewing, setViewing] = useState(null);
  const [toast, setToast] = useState(null);
  const [sideOpen, setSideOpen] = useState(true);
  const [filter, setFilter] = useState('all');

  // ── Storage ────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const raw = localStorage.getItem(SK); const r = raw ? { value: raw } : null;
        if (r?.value) {
          const d = JSON.parse(r.value);
          setJobs(d.jobs || S_JOBS);
          setExps(d.exps || S_EXP);
          if (d.cfg) setCfg(d.cfg);
        } else { setJobs(S_JOBS); setExps(S_EXP); }
      } catch { setJobs(S_JOBS); setExps(S_EXP); }
      setReady(true);
    })();
  }, []);

  const persist = useCallback(async (j,e,c) => {
    try { localStorage.setItem(SK, JSON.stringify({jobs:j,exps:e,cfg:c})); } catch {}
  }, []);

  const sJobs = j => { setJobs(j); persist(j,exps,cfg); };
  const sExps = e => { setExps(e); persist(jobs,e,cfg); };
  const sCfg  = c => { setCfg(c);  persist(jobs,exps,c); };

  const toast$ = msg => { setToast(msg); setTimeout(()=>setToast(null),3000); };
  const openModal = (type, item=null) => { setModal(type); setEditing(item); };
  const closeModal = () => { setModal(null); setEditing(null); };

  // ── Financial computations ─────────────────────────────────────
  const now = new Date();
  const mo = now.getMonth(), yr = now.getFullYear();

  const paidJobs = jobs.filter(j=>j.status==='paid');
  const pendJobs  = jobs.filter(j=>j.status==='pending');

  const revenue   = paidJobs.reduce((s,j)=>s+j.total,0);
  const expenses  = exps.reduce((s,e)=>s+e.amount,0);
  const netProfit = revenue - expenses;

  const moRev = paidJobs.filter(j=>{ const d=new Date(j.date); return d.getMonth()===mo&&d.getFullYear()===yr; }).reduce((s,j)=>s+j.total,0);
  const moExp = exps.filter(e=>{ const d=new Date(e.date); return d.getMonth()===mo&&d.getFullYear()===yr; }).reduce((s,e)=>s+e.amount,0);

  // Chart data — last 6 months
  const chartData = Array.from({length:6},(_,i)=>{
    const d = new Date(yr, mo-5+i, 1);
    const m=d.getMonth(), y=d.getFullYear();
    const rev = paidJobs.filter(j=>{ const jd=new Date(j.date); return jd.getMonth()===m&&jd.getFullYear()===y; }).reduce((s,j)=>s+j.total,0);
    const exp = exps.filter(e=>{ const ed=new Date(e.date); return ed.getMonth()===m&&ed.getFullYear()===y; }).reduce((s,e)=>s+e.amount,0);
    return { mo:MO[m], rev, exp, profit: rev-exp };
  });

  // Expense breakdown
  const expByCat = E_CATS.map(c=>({ name:c, value:exps.filter(e=>e.cat===c).reduce((s,e)=>s+e.amount,0) })).filter(c=>c.value>0);

  // Tax calcs
  const seTax = Math.max(0,netProfit)*0.9235*0.153;
  const seDeduct = seTax/2;
  const adjProfit = Math.max(0, netProfit-seDeduct);
  const fedTax = adjProfit*(cfg.fedRate/100);
  const njTax  = adjProfit*0.0637;
  const totalTax = seTax+fedTax+njTax;
  const quarterly = totalTax/4;
  const totalMiles = jobs.reduce((s,j)=>s+(j.miles||0),0);
  const mileDeduct = totalMiles*IRS_MI;

  if (!ready) return (
    <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100vh',background:'#0A0C14',color:'#C9A84C',fontFamily:'system-ui',gap:14,fontSize:'1rem'}}>
      <div style={{width:22,height:22,border:'2.5px solid #C9A84C',borderTopColor:'transparent',borderRadius:'50%',animation:'spin 0.8s linear infinite'}}/>
      Cargando sistema financiero...
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  const screens = {
    dashboard: <Dashboard chartData={chartData} expByCat={expByCat} jobs={jobs} exps={exps} moRev={moRev} moExp={moExp} netProfit={netProfit} revenue={revenue} expenses={expenses} pendJobs={pendJobs} setScreen={setScreen} setFilter={setFilter} />,
    jobs: <Jobs jobs={jobs} setJobs={sJobs} openModal={openModal} closeModal={closeModal} modal={modal} editing={editing} setViewing={setViewing} filter={filter} setFilter={setFilter} toast$={toast$} cfg={cfg} />,
    expenses: <Expenses exps={exps} setExps={sExps} openModal={openModal} closeModal={closeModal} modal={modal} editing={editing} toast$={toast$} />,
    reports: <Reports jobs={jobs} exps={exps} revenue={revenue} expenses={expenses} netProfit={netProfit} expByCat={expByCat} />,
    taxes: <Taxes netProfit={netProfit} seTax={seTax} fedTax={fedTax} njTax={njTax} totalTax={totalTax} quarterly={quarterly} mileDeduct={mileDeduct} totalMiles={totalMiles} cfg={cfg} adjProfit={adjProfit} />,
    settings: <Settings cfg={cfg} setCfg={sCfg} toast$={toast$} />,
  };

  return (
    <div style={{display:'flex',height:'100vh',background:'#0A0C14',color:'#F1F5F9',fontFamily:"'Outfit',system-ui,sans-serif",overflow:'hidden'}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&family=Syne:wght@700;800&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}
        ::-webkit-scrollbar{width:4px}::-webkit-scrollbar-thumb{background:#2a2d3e;border-radius:2px}
        input,select,textarea{outline:none;font-family:inherit}
        button{cursor:pointer;font-family:inherit}
        .fade{animation:fade 0.25s ease}
        @keyframes fade{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
        .hover-card:hover{transform:translateY(-2px);transition:all 0.2s}
        .nav-btn:hover{background:rgba(201,168,76,0.1)!important;color:#C9A84C!important}
        .nav-btn:hover .nav-ico{color:#C9A84C!important}
        input:focus,select:focus,textarea:focus{border-color:#C9A84C!important}
        .row:hover{background:rgba(255,255,255,0.025)!important}
        .ico-btn:hover{background:rgba(255,255,255,0.08)!important}
        @keyframes slideUp{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}
        .modal-inner{animation:slideUp 0.25s ease}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.4}}
      `}</style>

      {/* Sidebar */}
      <nav style={{width:sideOpen?220:60,background:'#0F1117',borderRight:'1px solid rgba(255,255,255,0.06)',display:'flex',flexDirection:'column',transition:'width 0.25s ease',flexShrink:0,overflow:'hidden'}}>
        {/* Logo */}
        <div style={{padding:sideOpen?'20px 20px 16px':'20px 0 16px',display:'flex',alignItems:'center',gap:10,justifyContent:sideOpen?'flex-start':'center',borderBottom:'1px solid rgba(255,255,255,0.05)',cursor:'pointer'}} onClick={()=>setSideOpen(!sideOpen)}>
          <div style={{width:32,height:32,borderRadius:8,background:'linear-gradient(135deg,#C9A84C,#8B6914)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
            <span style={{fontSize:'1rem'}}>🚛</span>
          </div>
          {sideOpen && <div>
            <div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:'0.9rem',color:'#F1F5F9',lineHeight:1.1}}>YARITAO</div>
            <div style={{fontSize:'0.65rem',color:'#C9A84C',fontWeight:700,letterSpacing:'0.12em'}}>FINANCIALS</div>
          </div>}
        </div>

        {/* Nav items */}
        <div style={{flex:1,padding:'12px 8px',display:'flex',flexDirection:'column',gap:2}}>
          {[
            {id:'dashboard',icon:'📊',label:'Dashboard'},
            {id:'jobs',icon:'🚛',label:'Mudanzas'},
            {id:'expenses',icon:'💸',label:'Gastos'},
            {id:'reports',icon:'📄',label:'P&L Report'},
            {id:'taxes',icon:'🧾',label:'Impuestos'},
          ].map(({id,icon,label})=>(
            <button key={id} className="nav-btn" onClick={()=>setScreen(id)} style={{display:'flex',alignItems:'center',gap:12,padding:sideOpen?'10px 14px':'10px 0',borderRadius:10,border:'none',background:screen===id?'rgba(201,168,76,0.12)':'transparent',color:screen===id?'#C9A84C':'#94A3B8',fontWeight:screen===id?600:400,fontSize:'0.88rem',textAlign:'left',width:'100%',justifyContent:sideOpen?'flex-start':'center',transition:'all 0.15s',cursor:'pointer'}}>
              <span className="nav-ico" style={{fontSize:'1rem',flexShrink:0,color:screen===id?'#C9A84C':'#64748B'}}>{icon}</span>
              {sideOpen && <span>{label}</span>}
            </button>
          ))}
        </div>

        {/* Settings at bottom */}
        <div style={{padding:'8px 8px 16px'}}>
          <button className="nav-btn" onClick={()=>setScreen('settings')} style={{display:'flex',alignItems:'center',gap:12,padding:sideOpen?'10px 14px':'10px 0',borderRadius:10,border:'none',background:screen==='settings'?'rgba(201,168,76,0.12)':'transparent',color:screen==='settings'?'#C9A84C':'#94A3B8',fontWeight:screen==='settings'?600:400,fontSize:'0.88rem',textAlign:'left',width:'100%',justifyContent:sideOpen?'flex-start':'center',transition:'all 0.15s'}}>
            <span style={{fontSize:'1rem',flexShrink:0}}>⚙️</span>
            {sideOpen && <span>Configuración</span>}
          </button>
        </div>
      </nav>

      {/* Main content */}
      <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden'}}>
        {/* Top bar */}
        <div style={{height:52,borderBottom:'1px solid rgba(255,255,255,0.05)',display:'flex',alignItems:'center',justifyContent:'space-between',padding:'0 24px',flexShrink:0,background:'#0A0C14'}}>
          <div style={{display:'flex',alignItems:'center',gap:8}}>
            <span style={{fontSize:'0.82rem',color:'#64748B'}}>
              {['dashboard','jobs','expenses','reports','taxes','settings'].includes(screen) &&
                ['📊 Dashboard','🚛 Mudanzas','💸 Gastos','📄 P&L Report','🧾 Impuestos','⚙️ Configuración'][['dashboard','jobs','expenses','reports','taxes','settings'].indexOf(screen)]
              }
            </span>
          </div>
          <div style={{display:'flex',alignItems:'center',gap:12}}>
            {pendJobs.length > 0 && (
              <div onClick={()=>{setScreen('jobs');setFilter('pending');}} style={{display:'flex',alignItems:'center',gap:6,background:'rgba(251,146,60,0.08)',border:'1px solid rgba(251,146,60,0.2)',borderRadius:20,padding:'4px 12px',fontSize:'0.75rem',color:'#FB923C',cursor:'pointer',fontWeight:500}}>
                <div style={{width:5,height:5,borderRadius:'50%',background:'#FB923C',animation:'pulse 2s infinite'}}/>
                {pendJobs.length} cobro{pendJobs.length>1?'s':''} pendiente{pendJobs.length>1?'s':''}
              </div>
            )}
            <div style={{width:30,height:30,borderRadius:'50%',background:'linear-gradient(135deg,#C9A84C,#8B6914)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'0.72rem',fontWeight:800,color:'#0A0C14'}}>YM</div>
            <button onClick={()=>{sessionStorage.removeItem(AUTH_KEY);window.location.reload();}} title="Cerrar sesión" style={{background:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.07)',borderRadius:7,color:'#64748B',padding:'5px 10px',fontSize:'0.75rem',cursor:'pointer',fontFamily:'inherit',display:'flex',alignItems:'center',gap:5}}>🔒 Salir</button>
          </div>
        </div>

        {/* Screen */}
        <div style={{flex:1,overflowY:'auto',padding:28}} className="fade" key={screen}>
          {screens[screen]}
        </div>
      </div>

      {/* Invoice viewer modal */}
      {viewing && <InvoiceModal job={viewing} onClose={()=>setViewing(null)} />}

      {/* Toast */}
      {toast && (
        <div style={{position:'fixed',bottom:24,right:24,background:'#1A1D2E',border:'1px solid rgba(74,222,128,0.3)',color:'#4ADE80',padding:'11px 18px',borderRadius:10,fontSize:'0.85rem',fontWeight:500,zIndex:9999,boxShadow:'0 8px 32px rgba(0,0,0,0.5)',animation:'fade 0.3s ease'}}>
          ✓ {toast}
        </div>
      )}
    </div>
  );
}

// ══ DASHBOARD ════════════════════════════════════════════════════
function Dashboard({chartData,expByCat,jobs,exps,moRev,moExp,netProfit,revenue,expenses,pendJobs,setScreen,setFilter}) {
  const margin = pct(netProfit, revenue);
  const avgJob = jobs.filter(j=>j.status==='paid').length ? revenue/jobs.filter(j=>j.status==='paid').length : 0;

  return (
    <div style={{display:'flex',flexDirection:'column',gap:24}}>
      <div>
        <h1 style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:'1.6rem',color:'#F1F5F9',marginBottom:4}}>Dashboard Financiero</h1>
        <p style={{color:'#64748B',fontSize:'0.88rem'}}>Vista general de tu empresa · {new Date().toLocaleDateString('es-US',{month:'long',year:'numeric'})}</p>
      </div>

      {/* KPI Grid */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(220px,1fr))',gap:16}}>
        {[
          {label:'Ingresos Totales',value:$0(revenue),sub:`${$0(moRev)} este mes`,icon:'💰',color:'#C9A84C',trend:'+'},
          {label:'Gastos Totales',value:$0(expenses),sub:`${$0(moExp)} este mes`,icon:'💸',color:'#F87171',trend:'-'},
          {label:'Ganancia Neta',value:$0(netProfit),sub:`Margen ${margin}%`,icon:'📈',color:netProfit>=0?'#4ADE80':'#F87171',trend:netProfit>=0?'+':'-'},
          {label:'Ticket Promedio',value:$0(avgJob),sub:`${jobs.filter(j=>j.status==='paid').length} mudanzas completadas`,icon:'🚛',color:'#60A5FA',trend:''},
        ].map((k,i)=>(
          <div key={i} className="hover-card" style={{...S.card,transition:'all 0.2s',cursor:'default'}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:16}}>
              <span style={{fontSize:'1.5rem'}}>{k.icon}</span>
              <span style={{fontSize:'0.7rem',fontWeight:700,letterSpacing:'0.1em',textTransform:'uppercase',color:k.color,background:`${k.color}18`,padding:'3px 8px',borderRadius:20}}>{k.label}</span>
            </div>
            <div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:'1.8rem',color:k.color,lineHeight:1,marginBottom:6}}>{k.value}</div>
            <div style={{fontSize:'0.78rem',color:'#64748B'}}>{k.sub}</div>
          </div>
        ))}
      </div>

      {/* Charts row */}
      <div style={{display:'grid',gridTemplateColumns:'1.6fr 1fr',gap:20}}>
        {/* Area chart */}
        <div style={S.card}>
          <div style={{marginBottom:20}}>
            <div style={{fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:'1rem',marginBottom:2}}>Ingresos vs Gastos</div>
            <div style={{fontSize:'0.78rem',color:'#64748B'}}>Últimos 6 meses</div>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={chartData} margin={{top:4,right:4,bottom:0,left:0}}>
              <defs>
                <linearGradient id="gRev" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#C9A84C" stopOpacity={0.25}/>
                  <stop offset="95%" stopColor="#C9A84C" stopOpacity={0}/>
                </linearGradient>
                <linearGradient id="gExp" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#F87171" stopOpacity={0.2}/>
                  <stop offset="95%" stopColor="#F87171" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)"/>
              <XAxis dataKey="mo" tick={{fill:'#64748B',fontSize:11}} axisLine={false} tickLine={false}/>
              <YAxis tick={{fill:'#64748B',fontSize:11}} axisLine={false} tickLine={false} tickFormatter={v=>v>=1000?'$'+(v/1000).toFixed(0)+'k':'$'+v}/>
              <Tooltip contentStyle={{background:'#1A1D2E',border:'1px solid rgba(255,255,255,0.08)',borderRadius:8,fontSize:'0.82rem'}} formatter={v=>[$(v)]}/>
              <Area type="monotone" dataKey="rev" name="Ingresos" stroke="#C9A84C" strokeWidth={2} fill="url(#gRev)"/>
              <Area type="monotone" dataKey="exp" name="Gastos" stroke="#F87171" strokeWidth={2} fill="url(#gExp)"/>
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Pie chart */}
        <div style={S.card}>
          <div style={{marginBottom:16}}>
            <div style={{fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:'1rem',marginBottom:2}}>Gastos por Categoría</div>
            <div style={{fontSize:'0.78rem',color:'#64748B'}}>Distribución total</div>
          </div>
          {expByCat.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={140}>
                <PieChart>
                  <Pie data={expByCat} dataKey="value" cx="50%" cy="50%" innerRadius={40} outerRadius={65} paddingAngle={2}>
                    {expByCat.map((_,i)=><Cell key={i} fill={PIE_C[i%PIE_C.length]}/>)}
                  </Pie>
                  <Tooltip contentStyle={{background:'#1A1D2E',border:'1px solid rgba(255,255,255,0.08)',borderRadius:8,fontSize:'0.8rem'}} formatter={v=>[$(v)]}/>
                </PieChart>
              </ResponsiveContainer>
              <div style={{display:'flex',flexDirection:'column',gap:5,marginTop:8}}>
                {expByCat.slice(0,4).map((c,i)=>(
                  <div key={i} style={{display:'flex',alignItems:'center',justifyContent:'space-between',fontSize:'0.76rem'}}>
                    <div style={{display:'flex',alignItems:'center',gap:6}}>
                      <div style={{width:8,height:8,borderRadius:'50%',background:PIE_C[i%PIE_C.length]}}/>
                      <span style={{color:'#94A3B8'}}>{c.name}</span>
                    </div>
                    <span style={{color:'#F1F5F9',fontWeight:500}}>{$0(c.value)}</span>
                  </div>
                ))}
              </div>
            </>
          ) : <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:160,color:'#64748B',fontSize:'0.85rem'}}>Sin gastos registrados</div>}
        </div>
      </div>

      {/* Recent jobs + Pending alerts */}
      <div style={{display:'grid',gridTemplateColumns:'1.5fr 1fr',gap:20}}>
        {/* Recent */}
        <div style={S.card}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20}}>
            <div style={{fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:'1rem'}}>Últimas Mudanzas</div>
            <button onClick={()=>setScreen('jobs')} style={{...S.btn,background:'rgba(201,168,76,0.1)',color:'#C9A84C',border:'none',padding:'5px 12px',fontSize:'0.75rem'}}>Ver todas →</button>
          </div>
          <div style={{display:'flex',flexDirection:'column',gap:2}}>
            {jobs.slice(-5).reverse().map(j=>(
              <div key={j.id} className="row" style={{display:'flex',alignItems:'center',gap:12,padding:'10px 8px',borderRadius:8,transition:'background 0.15s'}}>
                <div style={{flex:1}}>
                  <div style={{fontSize:'0.88rem',fontWeight:500,color:'#F1F5F9'}}>{j.client}</div>
                  <div style={{fontSize:'0.73rem',color:'#64748B',marginTop:2}}>{j.origin} → {j.dest}</div>
                </div>
                <div style={{textAlign:'right'}}>
                  <div style={{fontWeight:700,fontSize:'0.9rem',color:j.status==='paid'?'#4ADE80':'#FB923C'}}>{$0(j.total)}</div>
                  <div style={{fontSize:'0.7rem',marginTop:2}}><span style={S.badge(j.status)}>{STATUS_STYLE[j.status]?.label}</span></div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Pending payments */}
        <div style={S.card}>
          <div style={{fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:'1rem',marginBottom:4}}>⚡ Cobros Pendientes</div>
          <div style={{fontSize:'0.78rem',color:'#64748B',marginBottom:16}}>Total: <span style={{color:'#FB923C',fontWeight:700}}>{$0(pendJobs.reduce((s,j)=>s+j.total,0))}</span></div>
          {pendJobs.length === 0 ? (
            <div style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',height:120,gap:8,color:'#64748B',fontSize:'0.85rem'}}>
              <span style={{fontSize:'2rem'}}>✅</span>
              Todo al día
            </div>
          ) : (
            <div style={{display:'flex',flexDirection:'column',gap:8}}>
              {pendJobs.map(j=>(
                <div key={j.id} style={{background:'rgba(251,146,60,0.06)',border:'1px solid rgba(251,146,60,0.15)',borderRadius:10,padding:'12px 14px'}}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}>
                    <div>
                      <div style={{fontSize:'0.86rem',fontWeight:600,color:'#F1F5F9'}}>{j.client}</div>
                      <div style={{fontSize:'0.72rem',color:'#64748B',marginTop:2}}>{j.inv} · {fmtDate(j.date)}</div>
                    </div>
                    <div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:'1.1rem',color:'#FB923C'}}>{$0(j.total)}</div>
                  </div>
                </div>
              ))}
              <button onClick={()=>{setScreen('jobs');setFilter('pending');}} style={{...S.btn,background:'rgba(251,146,60,0.12)',color:'#FB923C',border:'1px solid rgba(251,146,60,0.2)',width:'100%',justifyContent:'center',marginTop:4}}>
                Gestionar cobros →
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ══ JOBS ═════════════════════════════════════════════════════════
function Jobs({jobs,setJobs,openModal,closeModal,modal,editing,setViewing,filter,setFilter,toast$,cfg}) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(null);
  const [search, setSearch] = useState('');

  const emptyForm = { client:'',phone:'',date:tod(),origin:'',dest:'',type:'local',size:'2br',movers:3,hours:3,miles:15,rate:cfg.rate||150,packing:false,storage:false,notes:'',status:'pending' };

  useEffect(() => {
    if (modal==='job') { setForm(editing ? {...editing} : emptyForm); setShowForm(true); }
    else if (!modal) { setShowForm(false); setForm(null); }
  }, [modal, editing]);

  const calc = f => f ? jobTotal(f) : {labor:0,truck:0,miles:0,pack:0,stor:0,total:0};
  const c = calc(form);

  const filtered = jobs.filter(j => {
    const matchFilter = filter==='all' || j.status===filter;
    const matchSearch = !search || j.client.toLowerCase().includes(search.toLowerCase()) || j.inv?.includes(search) || j.origin.toLowerCase().includes(search.toLowerCase());
    return matchFilter && matchSearch;
  });

  const saveJob = () => {
    if (!form.client||!form.origin||!form.dest) return alert('Completa cliente, origen y destino');
    const total = calc(form).total;
    if (editing) {
      setJobs(jobs.map(j=>j.id===editing.id ? {...form,id:editing.id,inv:editing.inv,total} : j));
      toast$('Mudanza actualizada');
    } else {
      const inv = 'YM-' + String(jobs.length+1).padStart(4,'0');
      setJobs([...jobs, {...form, id:gid(), inv, total}]);
      toast$('Mudanza creada · '+inv);
    }
    closeModal(); setShowForm(false);
  };

  const markPaid = id => { setJobs(jobs.map(j=>j.id===id?{...j,status:'paid'}:j)); toast$('Marcado como pagado ✓'); };
  const delJob  = id => { if(window.confirm('¿Eliminar esta mudanza?')) { setJobs(jobs.filter(j=>j.id!==id)); toast$('Mudanza eliminada'); } };

  const totals = { all: jobs.reduce((s,j)=>s+(j.status==='paid'?j.total:0),0), pending: jobs.filter(j=>j.status==='pending').reduce((s,j)=>s+j.total,0) };

  return (
    <div style={{display:'flex',flexDirection:'column',gap:20}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}>
        <div>
          <h1 style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:'1.5rem',marginBottom:4}}>Mudanzas</h1>
          <p style={{color:'#64748B',fontSize:'0.85rem'}}>{jobs.length} trabajos registrados · Cobrado: <span style={{color:'#4ADE80'}}>{$0(totals.all)}</span> · Pendiente: <span style={{color:'#FB923C'}}>{$0(totals.pending)}</span></p>
        </div>
        <button onClick={()=>openModal('job')} style={{...S.btn,background:'#C9A84C',color:'#0A0C14',fontWeight:700,fontSize:'0.9rem',padding:'10px 20px'}}>
          + Nueva Mudanza
        </button>
      </div>

      {/* Filters + Search */}
      <div style={{display:'flex',gap:10,flexWrap:'wrap'}}>
        {[['all','Todas'],['pending','Pendientes'],['paid','Pagadas'],['cancelled','Canceladas']].map(([v,l])=>(
          <button key={v} onClick={()=>setFilter(v)} style={{...S.btn,background:filter===v?'#C9A84C':'rgba(255,255,255,0.05)',color:filter===v?'#0A0C14':'#94A3B8',border:filter===v?'none':'1px solid rgba(255,255,255,0.08)',padding:'7px 16px',fontSize:'0.82rem'}}>{l}</button>
        ))}
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar cliente, factura..." style={{...S.input,width:'auto',flex:1,minWidth:180,padding:'7px 14px',fontSize:'0.85rem'}}/>
      </div>

      {/* Table */}
      <div style={S.card}>
        <div style={{overflowX:'auto'}}>
          <table style={{width:'100%',borderCollapse:'collapse',fontSize:'0.84rem'}}>
            <thead>
              <tr style={{borderBottom:'1px solid rgba(255,255,255,0.06)'}}>
                {['Factura','Fecha','Cliente','Ruta','Millas','Monto','Estado','Acciones'].map(h=>(
                  <th key={h} style={{textAlign:'left',padding:'10px 12px',color:'#64748B',fontSize:'0.72rem',fontWeight:700,letterSpacing:'0.08em',textTransform:'uppercase',whiteSpace:'nowrap'}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={8} style={{textAlign:'center',padding:40,color:'#64748B',fontSize:'0.88rem'}}>No hay mudanzas{filter!=='all'?' con este estado':''}</td></tr>
              )}
              {filtered.map(j=>(
                <tr key={j.id} className="row" style={{borderBottom:'1px solid rgba(255,255,255,0.04)',transition:'background 0.15s'}}>
                  <td style={{padding:'12px 12px'}}><span style={{fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:'0.8rem',color:'#C9A84C'}}>{j.inv}</span></td>
                  <td style={{padding:'12px 12px',color:'#94A3B8',whiteSpace:'nowrap'}}>{fmtDate(j.date)}</td>
                  <td style={{padding:'12px 12px'}}>
                    <div style={{fontWeight:500,color:'#F1F5F9'}}>{j.client}</div>
                    <div style={{fontSize:'0.72rem',color:'#64748B'}}>{j.phone}</div>
                  </td>
                  <td style={{padding:'12px 12px',maxWidth:180}}>
                    <div style={{fontSize:'0.78rem',color:'#94A3B8',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{j.origin}</div>
                    <div style={{fontSize:'0.73rem',color:'#64748B'}}>→ {j.dest}</div>
                  </td>
                  <td style={{padding:'12px 12px',color:'#94A3B8',textAlign:'center'}}>{(j.miles||0).toLocaleString()}</td>
                  <td style={{padding:'12px 12px'}}><span style={{fontFamily:"'Syne',sans-serif",fontWeight:700,color:'#F1F5F9'}}>{$0(j.total)}</span></td>
                  <td style={{padding:'12px 12px'}}><span style={S.badge(j.status)}>{STATUS_STYLE[j.status]?.label}</span></td>
                  <td style={{padding:'12px 12px'}}>
                    <div style={{display:'flex',gap:4}}>
                      <button className="ico-btn" onClick={()=>setViewing(j)} title="Ver factura" style={{background:'none',border:'none',color:'#94A3B8',padding:5,borderRadius:6,fontSize:'0.9rem'}}>👁</button>
                      <button className="ico-btn" onClick={()=>openModal('job',j)} title="Editar" style={{background:'none',border:'none',color:'#94A3B8',padding:5,borderRadius:6,fontSize:'0.9rem'}}>✏️</button>
                      {j.status==='pending' && <button className="ico-btn" onClick={()=>markPaid(j.id)} title="Marcar pagado" style={{background:'none',border:'none',color:'#4ADE80',padding:5,borderRadius:6,fontSize:'0.9rem'}}>✅</button>}
                      <button className="ico-btn" onClick={()=>delJob(j.id)} title="Eliminar" style={{background:'none',border:'none',color:'#F87171',padding:5,borderRadius:6,fontSize:'0.9rem'}}>🗑</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Job Form Modal */}
      {showForm && form && (
        <Modal title={editing?'Editar Mudanza':'Nueva Mudanza'} onClose={()=>{closeModal();setShowForm(false);}}>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14}}>
            <FG label="Cliente *"><input style={S.input} value={form.client} onChange={e=>setForm({...form,client:e.target.value})} placeholder="Nombre completo"/></FG>
            <FG label="Teléfono"><input style={S.input} value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})} placeholder="(xxx) xxx-xxxx"/></FG>
            <FG label="Fecha"><input type="date" style={S.input} value={form.date} onChange={e=>setForm({...form,date:e.target.value})}/></FG>
            <FG label="Tipo"><select style={S.input} value={form.type} onChange={e=>setForm({...form,type:e.target.value})}>
              <option value="local">Local (dentro de NJ)</option>
              <option value="interstate">Interestatal (fuera de NJ)</option>
            </select></FG>
            <FG label="Origen *"><input style={S.input} value={form.origin} onChange={e=>setForm({...form,origin:e.target.value})} placeholder="Ciudad, Estado"/></FG>
            <FG label="Destino *"><input style={S.input} value={form.dest} onChange={e=>setForm({...form,dest:e.target.value})} placeholder="Ciudad, Estado"/></FG>
            <FG label="Tamaño del hogar"><select style={S.input} value={form.size} onChange={e=>setForm({...form,size:e.target.value})}>
              <option value="studio">Estudio / 1 habitación</option>
              <option value="2br">2 habitaciones</option>
              <option value="3br">3 habitaciones</option>
              <option value="4br">4+ habitaciones</option>
            </select></FG>
            <FG label="Millas recorridas"><input type="number" style={S.input} value={form.miles} onChange={e=>setForm({...form,miles:+e.target.value})} min={0}/></FG>
            <FG label="Mudanceros"><input type="number" style={S.input} value={form.movers} onChange={e=>setForm({...form,movers:+e.target.value})} min={1} max={10}/></FG>
            <FG label="Horas trabajadas"><input type="number" style={S.input} value={form.hours} onChange={e=>setForm({...form,hours:+e.target.value})} min={1} max={24}/></FG>
            <FG label="Tarifa/hr por mudancero ($)"><input type="number" style={S.input} value={form.rate} onChange={e=>setForm({...form,rate:+e.target.value})} min={50}/></FG>
            <FG label="Estado"><select style={S.input} value={form.status} onChange={e=>setForm({...form,status:e.target.value})}>
              <option value="pending">Pendiente de pago</option>
              <option value="paid">Pagado</option>
              <option value="cancelled">Cancelado</option>
            </select></FG>
          </div>
          <div style={{display:'flex',gap:20,marginTop:10}}>
            <label style={{display:'flex',alignItems:'center',gap:8,cursor:'pointer',fontSize:'0.88rem',color:'#94A3B8'}}>
              <input type="checkbox" checked={form.packing} onChange={e=>setForm({...form,packing:e.target.checked})}/> Empaque completo (+$350)
            </label>
            <label style={{display:'flex',alignItems:'center',gap:8,cursor:'pointer',fontSize:'0.88rem',color:'#94A3B8'}}>
              <input type="checkbox" checked={form.storage} onChange={e=>setForm({...form,storage:e.target.checked})}/> Storage temporal (+$200)
            </label>
          </div>
          <FG label="Notas" style={{marginTop:10}}>
            <textarea style={{...S.input,minHeight:70,resize:'vertical'}} value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})} placeholder="Observaciones, artículos especiales..."/>
          </FG>

          {/* Live total breakdown */}
          <div style={{background:'rgba(201,168,76,0.06)',border:'1px solid rgba(201,168,76,0.2)',borderRadius:10,padding:16,marginTop:10}}>
            <div style={{fontSize:'0.75rem',fontWeight:700,letterSpacing:'0.1em',textTransform:'uppercase',color:'#C9A84C',marginBottom:10}}>Desglose del Estimado</div>
            {[
              [`👷 Mano de obra ($${form.rate}/hr × ${form.movers} mud. × ${form.hours} hrs)`, c.labor],
              [`🚛 Alquiler camión (${form.size||'2br'})`, c.truck],
              [`📍 ${form.miles||0} millas × $${MILE_RATE}/mi`, c.miles],
              form.packing && ['📦 Empaque completo', c.pack],
              form.storage && ['🗄 Storage temporal', c.stor],
            ].filter(Boolean).map(([label,val],i)=>(
              <div key={i} style={{display:'flex',justifyContent:'space-between',fontSize:'0.82rem',color:'#94A3B8',marginBottom:5}}>
                <span>{label}</span><span style={{color:'#F1F5F9',fontWeight:500}}>{$0(val)}</span>
              </div>
            ))}
            <div style={{borderTop:'1px solid rgba(201,168,76,0.2)',marginTop:8,paddingTop:8,display:'flex',justifyContent:'space-between',fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:'1.2rem'}}>
              <span style={{color:'#C9A84C'}}>TOTAL</span>
              <span style={{color:'#C9A84C'}}>{$0(c.total)}</span>
            </div>
          </div>

          <div style={{display:'flex',justifyContent:'flex-end',gap:10,marginTop:16}}>
            <button onClick={()=>{closeModal();setShowForm(false);}} style={{...S.btn,background:'rgba(255,255,255,0.06)',color:'#94A3B8',border:'1px solid rgba(255,255,255,0.08)'}}>Cancelar</button>
            <button onClick={saveJob} style={{...S.btn,background:'#C9A84C',color:'#0A0C14',fontWeight:700,padding:'9px 24px'}}>Guardar Mudanza</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ══ EXPENSES ═════════════════════════════════════════════════════
function Expenses({exps,setExps,openModal,closeModal,modal,editing,toast$}) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(null);
  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState('all');

  const emptyForm = { date:tod(), cat:'Combustible', vendor:'', amount:'', notes:'' };

  useEffect(()=>{ if(modal==='expense'){setForm(editing?{...editing}:emptyForm);setShowForm(true);} else if(!modal){setShowForm(false);setForm(null);} },[modal,editing]);

  const saveExp = () => {
    if(!form.vendor||!form.amount) return alert('Completa proveedor y monto');
    if(editing) { setExps(exps.map(e=>e.id===editing.id?{...form,id:editing.id,amount:+form.amount}:e)); toast$('Gasto actualizado'); }
    else { setExps([...exps,{...form,id:gid(),amount:+form.amount}]); toast$('Gasto registrado'); }
    closeModal(); setShowForm(false);
  };

  const delExp = id => { if(window.confirm('¿Eliminar este gasto?')){ setExps(exps.filter(e=>e.id!==id)); toast$('Gasto eliminado'); }};

  const cats = ['all',...new Set(exps.map(e=>e.cat))];
  const filtered = exps.filter(e=>(catFilter==='all'||e.cat===catFilter) && (!search||e.vendor.toLowerCase().includes(search.toLowerCase())||e.cat.toLowerCase().includes(search.toLowerCase()))).sort((a,b)=>b.date.localeCompare(a.date));

  return (
    <div style={{display:'flex',flexDirection:'column',gap:20}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}>
        <div>
          <h1 style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:'1.5rem',marginBottom:4}}>Gastos</h1>
          <p style={{color:'#64748B',fontSize:'0.85rem'}}>{exps.length} gastos · Total: <span style={{color:'#F87171'}}>{$0(exps.reduce((s,e)=>s+e.amount,0))}</span></p>
        </div>
        <button onClick={()=>openModal('expense')} style={{...S.btn,background:'#C9A84C',color:'#0A0C14',fontWeight:700,fontSize:'0.9rem',padding:'10px 20px'}}>+ Nuevo Gasto</button>
      </div>

      <div style={{display:'flex',gap:10,flexWrap:'wrap'}}>
        {cats.map(c=>(
          <button key={c} onClick={()=>setCatFilter(c)} style={{...S.btn,background:catFilter===c?'#C9A84C':'rgba(255,255,255,0.05)',color:catFilter===c?'#0A0C14':'#94A3B8',border:catFilter===c?'none':'1px solid rgba(255,255,255,0.08)',padding:'6px 14px',fontSize:'0.8rem'}}>{c==='all'?'Todas':c}</button>
        ))}
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar proveedor o categoría..." style={{...S.input,width:'auto',flex:1,minWidth:200,padding:'6px 14px',fontSize:'0.85rem'}}/>
      </div>

      <div style={S.card}>
        <div style={{overflowX:'auto'}}>
          <table style={{width:'100%',borderCollapse:'collapse',fontSize:'0.84rem'}}>
            <thead>
              <tr style={{borderBottom:'1px solid rgba(255,255,255,0.06)'}}>
                {['Fecha','Categoría','Proveedor / Descripción','Monto','Notas',''].map(h=>(
                  <th key={h} style={{textAlign:'left',padding:'10px 12px',color:'#64748B',fontSize:'0.72rem',fontWeight:700,letterSpacing:'0.08em',textTransform:'uppercase'}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length===0 && <tr><td colSpan={6} style={{textAlign:'center',padding:40,color:'#64748B'}}>Sin gastos registrados</td></tr>}
              {filtered.map(e=>(
                <tr key={e.id} className="row" style={{borderBottom:'1px solid rgba(255,255,255,0.04)',transition:'background 0.15s'}}>
                  <td style={{padding:'11px 12px',color:'#94A3B8',whiteSpace:'nowrap'}}>{fmtDate(e.date)}</td>
                  <td style={{padding:'11px 12px'}}>
                    <span style={{background:'rgba(255,255,255,0.05)',padding:'2px 10px',borderRadius:20,fontSize:'0.76rem',color:'#94A3B8'}}>{e.cat}</span>
                  </td>
                  <td style={{padding:'11px 12px',fontWeight:500,color:'#F1F5F9'}}>{e.vendor}</td>
                  <td style={{padding:'11px 12px'}}><span style={{fontFamily:"'Syne',sans-serif",fontWeight:700,color:'#F87171'}}>{$0(e.amount)}</span></td>
                  <td style={{padding:'11px 12px',color:'#64748B',fontSize:'0.8rem',maxWidth:160,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{e.notes||'—'}</td>
                  <td style={{padding:'11px 12px'}}>
                    <div style={{display:'flex',gap:4}}>
                      <button className="ico-btn" onClick={()=>openModal('expense',e)} style={{background:'none',border:'none',color:'#94A3B8',padding:5,borderRadius:6,fontSize:'0.85rem'}}>✏️</button>
                      <button className="ico-btn" onClick={()=>delExp(e.id)} style={{background:'none',border:'none',color:'#F87171',padding:5,borderRadius:6,fontSize:'0.85rem'}}>🗑</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showForm && form && (
        <Modal title={editing?'Editar Gasto':'Nuevo Gasto'} onClose={()=>{closeModal();setShowForm(false);}}>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14}}>
            <FG label="Fecha"><input type="date" style={S.input} value={form.date} onChange={e=>setForm({...form,date:e.target.value})}/></FG>
            <FG label="Categoría"><select style={S.input} value={form.cat} onChange={e=>setForm({...form,cat:e.target.value})}>
              {E_CATS.map(c=><option key={c}>{c}</option>)}
            </select></FG>
            <FG label="Proveedor / Descripción *"><input style={S.input} value={form.vendor} onChange={e=>setForm({...form,vendor:e.target.value})} placeholder="Ej. Penske Truck Rental"/></FG>
            <FG label="Monto ($) *"><input type="number" style={S.input} value={form.amount} onChange={e=>setForm({...form,amount:e.target.value})} placeholder="0.00" min={0} step={0.01}/></FG>
          </div>
          <FG label="Notas" style={{marginTop:8}}><input style={S.input} value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})} placeholder="Observaciones opcionales"/></FG>
          <div style={{display:'flex',justifyContent:'flex-end',gap:10,marginTop:16}}>
            <button onClick={()=>{closeModal();setShowForm(false);}} style={{...S.btn,background:'rgba(255,255,255,0.06)',color:'#94A3B8',border:'1px solid rgba(255,255,255,0.08)'}}>Cancelar</button>
            <button onClick={saveExp} style={{...S.btn,background:'#C9A84C',color:'#0A0C14',fontWeight:700}}>Guardar Gasto</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ══ REPORTS (P&L) ════════════════════════════════════════════════
function Reports({jobs,exps,revenue,expenses,netProfit,expByCat}) {
  const [period, setPeriod] = useState('all');
  const now = new Date();

  const filterDate = d => {
    if(period==='all') return true;
    const date = new Date(d+'T12:00:00');
    if(period==='month') return date.getMonth()===now.getMonth()&&date.getFullYear()===now.getFullYear();
    if(period==='quarter') {
      const q = Math.floor(now.getMonth()/3);
      return Math.floor(date.getMonth()/3)===q&&date.getFullYear()===now.getFullYear();
    }
    if(period==='year') return date.getFullYear()===now.getFullYear();
    return true;
  };

  const pJobs = jobs.filter(j=>j.status==='paid'&&filterDate(j.date));
  const pExps = exps.filter(e=>filterDate(e.date));
  const pRev  = pJobs.reduce((s,j)=>s+j.total,0);
  const pExp  = pExps.reduce((s,e)=>s+e.amount,0);
  const pNet  = pRev - pExp;
  const margin = pct(pNet,pRev);

  const expByC = E_CATS.map(c=>({ cat:c, total:pExps.filter(e=>e.cat===c).reduce((s,e)=>s+e.amount,0) })).filter(c=>c.total>0);

  const PLRow = ({label,value,bold,color,indent,borderTop})=>(
    <div style={{display:'flex',justifyContent:'space-between',padding:'9px 0',borderTop:borderTop?'1px solid rgba(255,255,255,0.08)':undefined,marginTop:borderTop?8:0}}>
      <span style={{fontWeight:bold?700:400,color:indent?'#94A3B8':'#F1F5F9',fontSize:bold?'0.95rem':'0.88rem',paddingLeft:indent?16:0}}>{label}</span>
      <span style={{fontWeight:bold?700:500,color:color||'#F1F5F9',fontFamily:bold?"'Syne',sans-serif":'inherit',fontSize:bold?'1rem':'0.88rem'}}>{$(value)}</span>
    </div>
  );

  return (
    <div style={{display:'flex',flexDirection:'column',gap:20}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}>
        <div>
          <h1 style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:'1.5rem',marginBottom:4}}>Estado de Resultados (P&L)</h1>
          <p style={{color:'#64748B',fontSize:'0.85rem'}}>Pérdidas y Ganancias automático · Yaritao Moving</p>
        </div>
        <div style={{display:'flex',gap:10,alignItems:'center'}}>
          <select value={period} onChange={e=>setPeriod(e.target.value)} style={{...S.input,width:'auto',padding:'8px 14px',fontSize:'0.85rem'}}>
            <option value="all">Todo el período</option>
            <option value="month">Este mes</option>
            <option value="quarter">Este trimestre</option>
            <option value="year">Este año</option>
          </select>
          <button onClick={()=>window.print()} style={{...S.btn,background:'rgba(255,255,255,0.06)',color:'#94A3B8',border:'1px solid rgba(255,255,255,0.08)'}}>🖨 Imprimir</button>
        </div>
      </div>

      {/* Summary cards */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:14}}>
        {[
          {l:'Ingresos',v:pRev,c:'#C9A84C'},{l:'Gastos',v:pExp,c:'#F87171'},
          {l:'Ganancia Neta',v:pNet,c:pNet>=0?'#4ADE80':'#F87171'},{l:'Margen Neto',v:margin+'%',c:'#60A5FA',pct:true},
        ].map((k,i)=>(
          <div key={i} style={{...S.card,padding:18,textAlign:'center'}}>
            <div style={{fontSize:'0.72rem',fontWeight:700,letterSpacing:'0.1em',textTransform:'uppercase',color:'#64748B',marginBottom:8}}>{k.l}</div>
            <div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:'1.5rem',color:k.c}}>{k.pct?k.v:$0(k.v)}</div>
          </div>
        ))}
      </div>

      <div style={{display:'grid',gridTemplateColumns:'1.4fr 1fr',gap:20}}>
        {/* P&L Statement */}
        <div style={S.card}>
          <div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:'1rem',color:'#C9A84C',marginBottom:16,paddingBottom:10,borderBottom:'1px solid rgba(255,255,255,0.06)'}}>
            📋 Estado de Pérdidas y Ganancias
          </div>

          <PLRow label="INGRESOS" value={pRev} bold color="#C9A84C"/>
          {pJobs.length > 0 && pJobs.slice(0,5).map(j=>(
            <PLRow key={j.id} label={`${j.inv} · ${j.client}`} value={j.total} indent/>
          ))}
          {pJobs.length > 5 && <div style={{fontSize:'0.78rem',color:'#64748B',paddingLeft:16,paddingBottom:4}}>+ {pJobs.length-5} trabajos más...</div>}

          <div style={{marginTop:12}}>
            <PLRow label="GASTOS OPERACIONALES" value={-pExp} bold color="#F87171" borderTop/>
            {expByC.map(c=><PLRow key={c.cat} label={c.cat} value={-c.total} indent/>)}
          </div>

          <div style={{marginTop:4,padding:'14px 0',borderTop:'2px solid rgba(201,168,76,0.3)'}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
              <span style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:'1.1rem',color:pNet>=0?'#4ADE80':'#F87171'}}>GANANCIA NETA</span>
              <span style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:'1.4rem',color:pNet>=0?'#4ADE80':'#F87171'}}>{$(pNet)}</span>
            </div>
            <div style={{fontSize:'0.75rem',color:'#64748B',marginTop:4}}>Margen: {margin}% · {pJobs.length} trabajos completados</div>
          </div>
        </div>

        {/* Expense breakdown + top jobs */}
        <div style={{display:'flex',flexDirection:'column',gap:14}}>
          <div style={S.card}>
            <div style={{fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:'0.95rem',marginBottom:14,color:'#F87171'}}>💸 Gastos por Categoría</div>
            {expByC.length===0 && <div style={{color:'#64748B',fontSize:'0.85rem'}}>Sin gastos en este período</div>}
            {expByC.map((c,i)=>(
              <div key={i} style={{marginBottom:10}}>
                <div style={{display:'flex',justifyContent:'space-between',fontSize:'0.82rem',marginBottom:4}}>
                  <span style={{color:'#94A3B8'}}>{c.cat}</span>
                  <span style={{fontWeight:600}}>{$0(c.total)} <span style={{color:'#64748B'}}>({pct(c.total,pExp)}%)</span></span>
                </div>
                <div style={{height:4,background:'rgba(255,255,255,0.06)',borderRadius:2,overflow:'hidden'}}>
                  <div style={{height:'100%',width:`${pct(c.total,pExp)}%`,background:PIE_C[i%PIE_C.length],borderRadius:2,transition:'width 0.5s ease'}}/>
                </div>
              </div>
            ))}
          </div>

          <div style={S.card}>
            <div style={{fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:'0.95rem',marginBottom:14,color:'#C9A84C'}}>🏆 Trabajos más rentables</div>
            {pJobs.sort((a,b)=>b.total-a.total).slice(0,4).map(j=>(
              <div key={j.id} style={{display:'flex',justifyContent:'space-between',padding:'7px 0',borderBottom:'1px solid rgba(255,255,255,0.04)',fontSize:'0.82rem'}}>
                <div>
                  <div style={{fontWeight:500,color:'#F1F5F9'}}>{j.client}</div>
                  <div style={{color:'#64748B',fontSize:'0.72rem'}}>{j.inv} · {(j.miles||0).toLocaleString()} mi</div>
                </div>
                <span style={{fontFamily:"'Syne',sans-serif",fontWeight:700,color:'#C9A84C'}}>{$0(j.total)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ══ TAXES ════════════════════════════════════════════════════════
function Taxes({netProfit,seTax,fedTax,njTax,totalTax,quarterly,mileDeduct,totalMiles,cfg,adjProfit}) {
  const quarters = [
    { q:'Q1 (Ene–Mar)', due:'15 Abr 2025', color:'#60A5FA' },
    { q:'Q2 (Abr–May)', due:'16 Jun 2025', color:'#A78BFA' },
    { q:'Q3 (Jun–Ago)', due:'15 Sep 2025', color:'#FB923C' },
    { q:'Q4 (Sep–Dic)', due:'15 Ene 2026', color:'#4ADE80' },
  ];

  const TaxRow = ({label,sub,value,color,bold})=>(
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'12px 0',borderBottom:'1px solid rgba(255,255,255,0.05)'}}>
      <div>
        <div style={{fontWeight:bold?700:500,fontSize:'0.9rem',color:color||'#F1F5F9'}}>{label}</div>
        {sub && <div style={{fontSize:'0.74rem',color:'#64748B',marginTop:2}}>{sub}</div>}
      </div>
      <div style={{fontFamily:bold?"'Syne',sans-serif":'inherit',fontWeight:bold?800:600,fontSize:bold?'1.2rem':'0.95rem',color:color||'#F1F5F9'}}>{$(value)}</div>
    </div>
  );

  return (
    <div style={{display:'flex',flexDirection:'column',gap:20}}>
      <div>
        <h1 style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:'1.5rem',marginBottom:4}}>Estimado de Impuestos 🇺🇸</h1>
        <p style={{color:'#64748B',fontSize:'0.85rem'}}>Cálculo automático · Self-Employed · New Jersey · Año fiscal actual</p>
      </div>

      {/* Alert box */}
      <div style={{background:'rgba(251,146,60,0.08)',border:'1px solid rgba(251,146,60,0.2)',borderRadius:12,padding:'16px 20px',display:'flex',gap:14,alignItems:'flex-start'}}>
        <span style={{fontSize:'1.4rem'}}>⚠️</span>
        <div>
          <div style={{fontWeight:700,fontSize:'0.9rem',color:'#FB923C',marginBottom:4}}>Debes apartar {$0(totalTax)} para impuestos</div>
          <div style={{fontSize:'0.82rem',color:'#94A3B8'}}>Como empresa self-employed debes pagar impuestos trimestrales al IRS. El próximo pago recomendado es <strong style={{color:'#F1F5F9'}}>{$0(quarterly)}</strong>. Este es un estimado — consulta con un CPA para tu situación exacta.</div>
        </div>
      </div>

      <div style={{display:'grid',gridTemplateColumns:'1.2fr 1fr',gap:20}}>
        {/* Tax breakdown */}
        <div style={S.card}>
          <div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:'1rem',marginBottom:16,color:'#C9A84C'}}>📊 Desglose de Impuestos</div>
          <TaxRow label="Ganancia neta total" value={netProfit} bold color="#4ADE80"/>
          <TaxRow label="Deducción SE (50% del SE Tax)" sub="Reducción permitida por ley" value={-seTax/2}/>
          <TaxRow label="Ganancia ajustada" value={adjProfit}/>
          <div style={{height:1,background:'rgba(255,255,255,0.08)',margin:'8px 0'}}/>
          <TaxRow label="SE Tax (Self-Employment)" sub="15.3% · Seguro Social + Medicare" value={seTax} color="#F87171"/>
          <TaxRow label={`Federal Income Tax (~${cfg.fedRate}%)`} sub="Estimado bracket actual" value={fedTax} color="#F87171"/>
          <TaxRow label="NJ State Income Tax (6.37%)" sub="New Jersey estado" value={njTax} color="#F87171"/>
          <div style={{background:'rgba(248,113,113,0.08)',border:'1px solid rgba(248,113,113,0.2)',borderRadius:10,padding:'14px 16px',marginTop:12}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
              <div>
                <div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:'1rem',color:'#F87171'}}>TOTAL IMPUESTOS</div>
                <div style={{fontSize:'0.75rem',color:'#64748B',marginTop:2}}>Estimado anual combinado</div>
              </div>
              <div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:'1.8rem',color:'#F87171'}}>{$0(totalTax)}</div>
            </div>
          </div>
        </div>

        {/* Quarterly schedule + mileage */}
        <div style={{display:'flex',flexDirection:'column',gap:16}}>
          <div style={S.card}>
            <div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:'0.95rem',marginBottom:14}}>📅 Pagos Trimestrales IRS</div>
            <div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:'2rem',color:'#C9A84C',marginBottom:4}}>{$0(quarterly)}</div>
            <div style={{fontSize:'0.78rem',color:'#64748B',marginBottom:16}}>por trimestre (4 pagos al año)</div>
            {quarters.map((q,i)=>(
              <div key={i} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'9px 0',borderBottom:'1px solid rgba(255,255,255,0.05)'}}>
                <div style={{display:'flex',alignItems:'center',gap:8}}>
                  <div style={{width:8,height:8,borderRadius:'50%',background:q.color}}/>
                  <div>
                    <div style={{fontSize:'0.84rem',fontWeight:500}}>{q.q}</div>
                    <div style={{fontSize:'0.72rem',color:'#64748B'}}>Vence: {q.due}</div>
                  </div>
                </div>
                <span style={{fontFamily:"'Syne',sans-serif",fontWeight:700,color:q.color}}>{$0(quarterly)}</span>
              </div>
            ))}
            <div style={{marginTop:12,fontSize:'0.75rem',color:'#64748B'}}>
              Paga en: <a href="https://www.irs.gov/payments" target="_blank" rel="noopener noreferrer" style={{color:'#60A5FA'}}>IRS Direct Pay</a> · <a href="https://www.irs.gov/businesses/small-businesses-self-employed/estimated-taxes" target="_blank" rel="noopener noreferrer" style={{color:'#60A5FA'}}>Guía Form 1040-ES</a>
            </div>
          </div>

          {/* Mileage deduction */}
          <div style={S.card}>
            <div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:'0.95rem',marginBottom:12,color:'#4ADE80'}}>🚗 Deducción por Millas (IRS 2025)</div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:12}}>
              <div style={{background:'rgba(74,222,128,0.06)',border:'1px solid rgba(74,222,128,0.15)',borderRadius:8,padding:12,textAlign:'center'}}>
                <div style={{fontSize:'0.7rem',color:'#64748B',marginBottom:4}}>MILLAS TOTALES</div>
                <div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:'1.3rem',color:'#4ADE80'}}>{totalMiles.toLocaleString()}</div>
              </div>
              <div style={{background:'rgba(74,222,128,0.06)',border:'1px solid rgba(74,222,128,0.15)',borderRadius:8,padding:12,textAlign:'center'}}>
                <div style={{fontSize:'0.7rem',color:'#64748B',marginBottom:4}}>DEDUCCIÓN TOTAL</div>
                <div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:'1.3rem',color:'#4ADE80'}}>{$0(mileDeduct)}</div>
              </div>
            </div>
            <div style={{fontSize:'0.78rem',color:'#64748B'}}>Tarifa IRS 2025: $0.67/milla de negocio · <strong style={{color:'#4ADE80'}}>{$0(mileDeduct)}</strong> menos en impuestos</div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ══ SETTINGS ═════════════════════════════════════════════════════
function Settings({cfg,setCfg,toast$}) {
  const [f,setF] = useState({...cfg});
  const save = () => { setCfg(f); toast$('Configuración guardada'); };

  return (
    <div style={{display:'flex',flexDirection:'column',gap:20,maxWidth:600}}>
      <div>
        <h1 style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:'1.5rem',marginBottom:4}}>Configuración</h1>
        <p style={{color:'#64748B',fontSize:'0.85rem'}}>Parámetros de tu empresa y cálculos financieros</p>
      </div>
      <div style={S.card}>
        <div style={{fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:'1rem',marginBottom:20,color:'#C9A84C'}}>🏢 Información de la empresa</div>
        <div style={{display:'flex',flexDirection:'column',gap:14}}>
          <FG label="Nombre de la empresa"><input style={S.input} value={f.company} onChange={e=>setF({...f,company:e.target.value})}/></FG>
          <FG label="Teléfono"><input style={S.input} value={f.phone} onChange={e=>setF({...f,phone:e.target.value})}/></FG>
        </div>
      </div>
      <div style={S.card}>
        <div style={{fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:'1rem',marginBottom:20,color:'#C9A84C'}}>💰 Tarifas de servicio</div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14}}>
          <FG label="Tarifa por hora por mudancero ($)"><input type="number" style={S.input} value={f.rate} onChange={e=>setF({...f,rate:+e.target.value})} min={50}/></FG>
          <FG label="Tarifa por milla ($)"><input type="number" style={S.input} value={f.mileRate} onChange={e=>setF({...f,mileRate:+e.target.value})} step={0.01} min={0}/></FG>
        </div>
      </div>
      <div style={S.card}>
        <div style={{fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:'1rem',marginBottom:20,color:'#C9A84C'}}>🧾 Parámetros fiscales</div>
        <FG label="Tasa federal de ingreso estimada (%)">
          <input type="number" style={S.input} value={f.fedRate} onChange={e=>setF({...f,fedRate:+e.target.value})} min={10} max={40}/>
          <div style={{fontSize:'0.74rem',color:'#64748B',marginTop:5}}>Bracket recomendado para ingreso bajo $100k: 22%. Consulta con un CPA para confirmar.</div>
        </FG>
      </div>
      <button onClick={save} style={{...S.btn,background:'#C9A84C',color:'#0A0C14',fontWeight:700,fontSize:'0.95rem',padding:'12px 28px',alignSelf:'flex-start'}}>Guardar Cambios</button>
    </div>
  );
}

// ══ INVOICE MODAL ════════════════════════════════════════════════
function InvoiceModal({job,onClose}) {
  const calc = jobTotal(job);
  return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.8)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:999,padding:20}} onClick={onClose}>
      <div className="modal-inner" style={{background:'#fff',color:'#0A0C14',borderRadius:14,padding:40,maxWidth:520,width:'100%',maxHeight:'90vh',overflowY:'auto'}} onClick={e=>e.stopPropagation()}>
        {/* Invoice header */}
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:28}}>
          <div>
            <div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:'1.6rem',color:'#0A0C14'}}>🚛 YARITAO MOVING</div>
            <div style={{fontSize:'0.82rem',color:'#64748B',marginTop:2}}>(908) 457-8129 · New Jersey, EE.UU.</div>
          </div>
          <div style={{textAlign:'right'}}>
            <div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:'1.1rem',color:'#C9A84C'}}>{job.inv}</div>
            <div style={{fontSize:'0.8rem',color:'#64748B',marginTop:2}}>{fmtDate(job.date)}</div>
          </div>
        </div>

        <div style={{background:'#F8F9FA',borderRadius:10,padding:'14px 18px',marginBottom:20}}>
          <div style={{fontWeight:700,fontSize:'0.75rem',letterSpacing:'0.1em',textTransform:'uppercase',color:'#64748B',marginBottom:8}}>Cliente</div>
          <div style={{fontWeight:700,fontSize:'1rem'}}>{job.client}</div>
          <div style={{fontSize:'0.84rem',color:'#64748B',marginTop:2}}>{job.phone}</div>
          <div style={{fontSize:'0.84rem',color:'#64748B',marginTop:6}}>📍 {job.origin} → {job.dest}</div>
          <div style={{fontSize:'0.78rem',color:'#94A3B8',marginTop:2}}>{(job.miles||0).toLocaleString()} millas · {job.movers} mudanceros · {job.hours} horas</div>
        </div>

        <table style={{width:'100%',borderCollapse:'collapse',marginBottom:16,fontSize:'0.86rem'}}>
          <thead>
            <tr style={{background:'#F1F5F9'}}>
              <th style={{textAlign:'left',padding:'8px 12px',fontWeight:700,fontSize:'0.72rem',letterSpacing:'0.08em',textTransform:'uppercase',color:'#64748B'}}>Concepto</th>
              <th style={{textAlign:'right',padding:'8px 12px',fontWeight:700,fontSize:'0.72rem',letterSpacing:'0.08em',textTransform:'uppercase',color:'#64748B'}}>Monto</th>
            </tr>
          </thead>
          <tbody>
            {[
              [`Mano de obra — $${job.rate||150}/hr × ${job.movers} mud. × ${job.hours} hrs`, calc.labor],
              [`Alquiler camión (${job.size||'2br'})`, calc.truck],
              [`Millas recorridas — ${job.miles||0} mi × $${MILE_RATE}`, calc.miles],
              job.packing && ['Empaque completo', calc.pack],
              job.storage && ['Almacenamiento temporal', calc.stor],
            ].filter(Boolean).map(([c,v],i)=>(
              <tr key={i} style={{borderBottom:'1px solid #F1F5F9'}}>
                <td style={{padding:'10px 12px',color:'#374151'}}>{c}</td>
                <td style={{padding:'10px 12px',textAlign:'right',fontWeight:600}}>{$0(v)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div style={{background:job.status==='paid'?'rgba(74,222,128,0.08)':'rgba(251,146,60,0.08)',border:`1px solid ${job.status==='paid'?'rgba(74,222,128,0.3)':'rgba(251,146,60,0.3)'}`,borderRadius:10,padding:'14px 18px',display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20}}>
          <div>
            <div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:'1.1rem',color:'#0A0C14'}}>TOTAL</div>
            <div style={{fontSize:'0.75rem',color:'#64748B',marginTop:2}}>{STATUS_STYLE[job.status]?.label}</div>
          </div>
          <div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:'2rem',color:job.status==='paid'?'#16A34A':'#EA580C'}}>{$0(job.total)}</div>
        </div>

        {job.notes && <div style={{fontSize:'0.82rem',color:'#64748B',marginBottom:20,fontStyle:'italic'}}>Notas: {job.notes}</div>}

        <div style={{display:'flex',gap:10,justifyContent:'flex-end'}}>
          <button onClick={()=>window.print()} style={{...S.btn,background:'#F1F5F9',color:'#374151',border:'1px solid #E2E8F0'}}>🖨 Imprimir</button>
          <button onClick={onClose} style={{...S.btn,background:'#C9A84C',color:'#0A0C14',fontWeight:700}}>Cerrar</button>
        </div>
      </div>
    </div>
  );
}

// ══ SHARED COMPONENTS ════════════════════════════════════════════
function Modal({title,onClose,children}) {
  return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.75)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:998,padding:20}} onClick={onClose}>
      <div className="modal-inner" style={{background:'#1A1D2E',border:'1px solid rgba(255,255,255,0.08)',borderRadius:14,padding:28,maxWidth:680,width:'100%',maxHeight:'92vh',overflowY:'auto'}} onClick={e=>e.stopPropagation()}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:22}}>
          <h2 style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:'1.15rem',color:'#F1F5F9'}}>{title}</h2>
          <button onClick={onClose} style={{background:'rgba(255,255,255,0.06)',border:'none',color:'#94A3B8',width:30,height:30,borderRadius:6,display:'flex',alignItems:'center',justifyContent:'center',fontSize:'1rem'}}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function FG({label,children,style}) {
  return (
    <div style={{display:'flex',flexDirection:'column',...style}}>
      <label style={S.label}>{label}</label>
      {children}
    </div>
  );
}

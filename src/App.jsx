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
// ── Truck specs UHaul (precios aproximados mercado NJ) ──────────
const TRUCK_SPECS = {
  '10ft': { label:'10 ft (Cargo Van)', ratePerDay:19.95, ratePerMile:0.79, insurancePerDay:14,
    oneWayBase:{ under50:149, r50_200:199, r200_500:349, r500p:599 } },
  '15ft': { label:'15 ft',            ratePerDay:29.95, ratePerMile:0.79, insurancePerDay:14,
    oneWayBase:{ under50:199, r50_200:299, r200_500:499, r500p:849 } },
  '20ft': { label:'20 ft',            ratePerDay:39.95, ratePerMile:0.79, insurancePerDay:14,
    oneWayBase:{ under50:299, r50_200:449, r200_500:699, r500p:1099 } },
  '26ft': { label:'26 ft (más grande)',ratePerDay:49.95, ratePerMile:0.79, insurancePerDay:14,
    oneWayBase:{ under50:449, r50_200:699, r200_500:999, r500p:1599 } },
};
const HOME_TO_TRUCK = { studio:'10ft', '1br':'15ft', '2br':'20ft', '3br':'26ft', '4br':'26ft', '5br':'26ft' };
const HOME_NOTES = {
  '4br':'⚠️ Puede requerir 2 viajes según volumen.',
  '5br':'⚠️ Muy probablemente 2 viajes. Confirmar con cliente.',
};

function calcUHaul(truckKey, moveType, miles, days, insurance) {
  const t = TRUCK_SPECS[truckKey]; if (!t) return 0;
  let sub = 0;
  if (moveType === 'local') {
    sub = t.ratePerDay * days + miles * t.ratePerMile;
  } else {
    const m = parseFloat(miles)||0;
    const base = m < 50 ? t.oneWayBase.under50 : m < 200 ? t.oneWayBase.r50_200 : m < 500 ? t.oneWayBase.r200_500 : t.oneWayBase.r500p;
    sub = base + Math.max(0, days-1) * t.ratePerDay;
  }
  const ins = insurance ? t.insurancePerDay * days : 0;
  return Math.round(sub + ins);
}

// ORS geocode + directions (API key en .env como VITE_ORS_API_KEY)
async function orsGetMiles(pickup, delivery) {
  const KEY = import.meta.env.VITE_ORS_API_KEY;
  if (!KEY) throw new Error('Falta VITE_ORS_API_KEY en .env');
  const geo = async (addr) => {
    const r = await fetch(`https://api.openrouteservice.org/geocode/search?api_key=${KEY}&text=${encodeURIComponent(addr)}&boundary.country=US&size=1`);
    const d = await r.json();
    if (!d.features?.length) throw new Error(`Dirección no encontrada: "${addr}"`);
    return d.features[0].geometry.coordinates;
  };
  const [o, dest] = await Promise.all([geo(pickup), geo(delivery)]);
  const r = await fetch(`https://api.openrouteservice.org/v2/directions/driving-car?api_key=${KEY}&start=${o[0]},${o[1]}&end=${dest[0]},${dest[1]}`);
  const d = await r.json();
  const seg = d.features?.[0]?.properties?.segments?.[0];
  if (!seg) throw new Error('No se pudo calcular la ruta');
  const miles = parseFloat((seg.distance / 1609.344).toFixed(1));
  const mins  = Math.round(seg.duration / 60);
  return { miles, mins };
}
const E_CATS = ['Combustible','Alquiler camión','Nómina','Seguro','Marketing','Suministros','Mantenimiento','Peajes','Otro'];
const MO = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
const PIE_C = ['#C9A84C','#60A5FA','#4ADE80','#F87171','#A78BFA','#FB923C','#34D399','#F472B6','#94A3B8'];
const PAY_METHODS = ['Efectivo','Zelle','PayPal','Stripe','Cheque','Venmo','Otro'];
const STATUS_STYLE = {
  paid:      { bg:'rgba(74,222,128,0.12)',  color:'#4ADE80', border:'rgba(74,222,128,0.25)',  label:'Pagado' },
  partial:   { bg:'rgba(96,165,250,0.12)',  color:'#60A5FA', border:'rgba(96,165,250,0.25)',  label:'Anticipo recibido' },
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
  // Si ya tiene truckCost calculado dinámicamente lo usa; si no, fallback a estimado base por tamaño
  const fallbackTruck = { studio:90, '1br':120, '2br':160, '3br':210, '4br':280, '5br':320 };
  const truck = j.truckCost != null && j.truckCost !== ''
    ? parseFloat(j.truckCost)
    : (fallbackTruck[j.size||'2br'] || 160);
  const miles = Math.round((j.miles||0)*MILE_RATE);
  const pack  = j.packing ? 350 : 0;
  const stor  = j.storage ? 200 : 0;
  return { labor, truck, miles, pack, stor, total: labor+truck+miles+pack+stor };
}

// ══ SAMPLE DATA (first launch) ═══════════════════════════════════
const S_JOBS = [
  {id:'j1',inv:'YM-0001',date:'2025-01-15',client:'María González',phone:'(201)555-0101',origin:'Newark, NJ',dest:'Elizabeth, NJ',type:'local',size:'2br',movers:3,hours:3,miles:12,rate:150,packing:false,storage:false,notes:'',status:'paid',total:1654,anticipo:300,payMethod:'Zelle',payLink:''},
  {id:'j2',inv:'YM-0002',date:'2025-01-22',client:'Carlos Herrera',phone:'(973)555-0142',origin:'Jersey City, NJ',dest:'Paterson, NJ',type:'local',size:'3br',movers:4,hours:4,miles:18,rate:150,packing:true,storage:false,notes:'Piano en el 2do piso',status:'paid',total:2591,anticipo:500,payMethod:'PayPal',payLink:'https://paypal.me/yaritaomoving'},
  {id:'j3',inv:'YM-0003',date:'2025-02-05',client:'Ana Pérez',phone:'(908)555-0133',origin:'Elizabeth, NJ',dest:'Miami, FL',type:'interstate',size:'2br',movers:3,hours:3,miles:1280,rate:150,packing:false,storage:true,notes:'',status:'paid',total:4270,anticipo:800,payMethod:'Stripe',payLink:'https://buy.stripe.com/example'},
  {id:'j4',inv:'YM-0004',date:'2025-02-18',client:'Roberto Silva',phone:'(732)555-0177',origin:'Trenton, NJ',dest:'Camden, NJ',type:'local',size:'studio',movers:2,hours:2,miles:8,rate:150,packing:false,storage:false,notes:'',status:'paid',total:1004,anticipo:200,payMethod:'Efectivo',payLink:''},
  {id:'j5',inv:'YM-0005',date:'2025-03-03',client:'Luisa Martínez',phone:'(201)555-0199',origin:'Hoboken, NJ',dest:'New Brunswick, NJ',type:'local',size:'2br',movers:3,hours:4,miles:20,rate:150,packing:true,storage:false,notes:'',status:'paid',total:2328,anticipo:400,payMethod:'Zelle',payLink:''},
  {id:'j6',inv:'YM-0006',date:'2025-03-10',client:'Diego Ramírez',phone:'(908)555-0156',origin:'Newark, NJ',dest:'Houston, TX',type:'interstate',size:'3br',movers:4,hours:4,miles:1560,rate:150,packing:true,storage:true,notes:'Mudanza grande interestatal',status:'partial',total:6060,anticipo:1200,payMethod:'Stripe',payLink:'https://buy.stripe.com/example2'},
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
  const [employees, setEmployees] = useState([]);
  const [payrollRecords, setPayrollRecords] = useState([]);

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
          if (d.employees) setEmployees(d.employees);
          else setEmployees([
            { id:1, name:'Carlos Méndez', pos:'Mover principal', rate:120, filing:'single', periods:26 },
            { id:2, name:'Luis Torres',   pos:'Ayudante',        rate:80,  filing:'single', periods:26 },
          ]);
          if (d.payrollRecords) setPayrollRecords(d.payrollRecords);
        } else {
          setJobs(S_JOBS); setExps(S_EXP);
          setEmployees([
            { id:1, name:'Carlos Méndez', pos:'Mover principal', rate:120, filing:'single', periods:26 },
            { id:2, name:'Luis Torres',   pos:'Ayudante',        rate:80,  filing:'single', periods:26 },
          ]);
        }
      } catch {
        setJobs(S_JOBS); setExps(S_EXP);
        setEmployees([
          { id:1, name:'Carlos Méndez', pos:'Mover principal', rate:120, filing:'single', periods:26 },
          { id:2, name:'Luis Torres',   pos:'Ayudante',        rate:80,  filing:'single', periods:26 },
        ]);
      }
      setReady(true);
    })();
  }, []);

  const persist = useCallback(async (j,e,c,emp,pr) => {
    try { localStorage.setItem(SK, JSON.stringify({jobs:j,exps:e,cfg:c,employees:emp,payrollRecords:pr})); } catch {}
  }, []);

  const sJobs = j => { setJobs(j); persist(j,exps,cfg,employees,payrollRecords); };
  const sExps = e => { setExps(e); persist(jobs,e,cfg,employees,payrollRecords); };
  const sCfg  = c => { setCfg(c);  persist(jobs,exps,c,employees,payrollRecords); };
  const sEmployees = emp => { setEmployees(emp); persist(jobs,exps,cfg,emp,payrollRecords); };
  const sPayroll = (pr, newExpense) => {
    setPayrollRecords(pr);
    // Auto-register as expense in P&L when payroll is processed
    if (newExpense) {
      const updated = [...exps, newExpense];
      setExps(updated);
      persist(jobs,updated,cfg,employees,pr);
    } else {
      persist(jobs,exps,cfg,employees,pr);
    }
  };

  const toast$ = msg => { setToast(msg); setTimeout(()=>setToast(null),3000); };
  const openModal = (type, item=null) => { setModal(type); setEditing(item); };
  const closeModal = () => { setModal(null); setEditing(null); };

  // ── Financial computations ─────────────────────────────────────
  const now = new Date();
  const mo = now.getMonth(), yr = now.getFullYear();

  const paidJobs    = jobs.filter(j=>j.status==='paid');
  const pendJobs    = jobs.filter(j=>j.status==='pending');
  const partialJobs = jobs.filter(j=>j.status==='partial');

  const revenue   = paidJobs.reduce((s,j)=>s+j.total,0);
  const expenses  = exps.reduce((s,e)=>s+e.amount,0);
  const netProfit = revenue - expenses;

  const anticipoTotal  = jobs.reduce((s,j)=>s+(j.anticipo||0),0);
  const balancePending = [...pendJobs,...partialJobs].reduce((s,j)=>s+(j.total-(j.anticipo||0)),0);

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
    dashboard: <Dashboard chartData={chartData} expByCat={expByCat} jobs={jobs} exps={exps} moRev={moRev} moExp={moExp} netProfit={netProfit} revenue={revenue} expenses={expenses} pendJobs={pendJobs} setScreen={setScreen} setFilter={setFilter} partialJobs={partialJobs} anticipoTotal={anticipoTotal} balancePending={balancePending} />,
    jobs: <Jobs jobs={jobs} setJobs={sJobs} openModal={openModal} closeModal={closeModal} modal={modal} editing={editing} setViewing={setViewing} filter={filter} setFilter={setFilter} toast$={toast$} cfg={cfg} />,
    expenses: <Expenses exps={exps} setExps={sExps} openModal={openModal} closeModal={closeModal} modal={modal} editing={editing} toast$={toast$} />,
    reports: <Reports jobs={jobs} exps={exps} revenue={revenue} expenses={expenses} netProfit={netProfit} expByCat={expByCat} />,
    taxes: <Taxes netProfit={netProfit} seTax={seTax} fedTax={fedTax} njTax={njTax} totalTax={totalTax} quarterly={quarterly} mileDeduct={mileDeduct} totalMiles={totalMiles} cfg={cfg} adjProfit={adjProfit} />,
    nomina: <Nomina employees={employees} setEmployees={sEmployees} payrollRecords={payrollRecords} setPayrollRecords={sPayroll} toast$={toast$} />,
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
            {id:'nomina',icon:'👥',label:'Nómina'},
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
              {['dashboard','jobs','expenses','reports','taxes','nomina','settings'].includes(screen) &&
                ['📊 Dashboard','🚛 Mudanzas','💸 Gastos','📄 P&L Report','🧾 Impuestos','👥 Nómina','⚙️ Configuración'][['dashboard','jobs','expenses','reports','taxes','nomina','settings'].indexOf(screen)]
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
      {viewing && <InvoiceModal job={viewing} onClose={()=>setViewing(null)} cfg={cfg} />}

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
function Dashboard({chartData,expByCat,jobs,exps,moRev,moExp,netProfit,revenue,expenses,pendJobs,setScreen,setFilter,partialJobs,anticipoTotal,balancePending}) {
  const margin = pct(netProfit, revenue);
  const avgJob = jobs.filter(j=>j.status==='paid').length ? revenue/jobs.filter(j=>j.status==='paid').length : 0;

  return (
    <div style={{display:'flex',flexDirection:'column',gap:24}}>
      <div>
        <h1 style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:'1.6rem',color:'#F1F5F9',marginBottom:4}}>Dashboard Financiero</h1>
        <p style={{color:'#64748B',fontSize:'0.88rem'}}>Vista general de tu empresa · {new Date().toLocaleDateString('es-US',{month:'long',year:'numeric'})}</p>
      </div>

      {/* KPI Grid */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(200px,1fr))',gap:16}}>
        {[
          {label:'Ingresos Cobrados',value:$0(revenue),sub:`${$0(moRev)} este mes`,icon:'💰',color:'#C9A84C'},
          {label:'Anticipos Recibidos',value:$0(anticipoTotal),sub:`${partialJobs.length} trabajo${partialJobs.length!==1?'s':''} con anticipo`,icon:'🤝',color:'#60A5FA'},
          {label:'Balance por Cobrar',value:$0(balancePending),sub:`${pendJobs.length+partialJobs.length} trabajos pendientes`,icon:'⏳',color:'#FB923C'},
          {label:'Ganancia Neta',value:$0(netProfit),sub:`Margen ${margin}%`,icon:'📈',color:netProfit>=0?'#4ADE80':'#F87171'},
          {label:'Gastos Totales',value:$0(expenses),sub:`${$0(moExp)} este mes`,icon:'💸',color:'#F87171'},
          {label:'Ticket Promedio',value:$0(avgJob),sub:`${jobs.filter(j=>j.status==='paid').length} completadas`,icon:'🚛',color:'#A78BFA'},
        ].map((k,i)=>(
          <div key={i} className="hover-card" style={{...S.card,transition:'all 0.2s',cursor:'default'}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:12}}>
              <span style={{fontSize:'1.4rem'}}>{k.icon}</span>
              <span style={{fontSize:'0.65rem',fontWeight:700,letterSpacing:'0.1em',textTransform:'uppercase',color:k.color,background:`${k.color}18`,padding:'3px 8px',borderRadius:20}}>{k.label}</span>
            </div>
            <div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:'1.7rem',color:k.color,lineHeight:1,marginBottom:5}}>{k.value}</div>
            <div style={{fontSize:'0.76rem',color:'#64748B'}}>{k.sub}</div>
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

        {/* Pending + Partial payments */}
        <div style={S.card}>
          <div style={{fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:'1rem',marginBottom:4}}>⚡ Cobros Pendientes</div>
          <div style={{fontSize:'0.78rem',color:'#64748B',marginBottom:16}}>
            Por cobrar: <span style={{color:'#FB923C',fontWeight:700}}>{$0(balancePending)}</span>
            {anticipoTotal > 0 && <span style={{marginLeft:10}}>· Anticipos: <span style={{color:'#60A5FA',fontWeight:700}}>{$0(anticipoTotal)}</span></span>}
          </div>
          {[...pendJobs,...partialJobs].length === 0 ? (
            <div style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',height:120,gap:8,color:'#64748B',fontSize:'0.85rem'}}>
              <span style={{fontSize:'2rem'}}>✅</span>Todo al día
            </div>
          ) : (
            <div style={{display:'flex',flexDirection:'column',gap:8}}>
              {[...partialJobs,...pendJobs].map(j=>{
                const balance = j.total - (j.anticipo||0);
                const isPartial = j.status==='partial';
                return (
                  <div key={j.id} style={{background:isPartial?'rgba(96,165,250,0.06)':'rgba(251,146,60,0.06)',border:`1px solid ${isPartial?'rgba(96,165,250,0.15)':'rgba(251,146,60,0.15)'}`,borderRadius:10,padding:'12px 14px'}}>
                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:isPartial?6:0}}>
                      <div>
                        <div style={{fontSize:'0.86rem',fontWeight:600,color:'#F1F5F9'}}>{j.client}</div>
                        <div style={{fontSize:'0.72rem',color:'#64748B',marginTop:2}}>{j.inv} · {fmtDate(j.date)}</div>
                      </div>
                      <div style={{textAlign:'right'}}>
                        <div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:'1rem',color:isPartial?'#60A5FA':'#FB923C'}}>{$0(balance)}</div>
                        <div style={{fontSize:'0.68rem',color:'#64748B'}}>balance</div>
                      </div>
                    </div>
                    {isPartial && (
                      <div style={{display:'flex',justifyContent:'space-between',fontSize:'0.74rem',color:'#64748B',paddingTop:4,borderTop:'1px solid rgba(255,255,255,0.05)'}}>
                        <span>Anticipo recibido: <span style={{color:'#4ADE80',fontWeight:600}}>{$0(j.anticipo)}</span></span>
                        <span>Total: {$0(j.total)}</span>
                      </div>
                    )}
                    {j.payLink && (
                      <a href={j.payLink} target="_blank" rel="noopener noreferrer" style={{display:'inline-flex',alignItems:'center',gap:4,marginTop:6,fontSize:'0.73rem',color:'#60A5FA',textDecoration:'none',background:'rgba(96,165,250,0.08)',padding:'3px 10px',borderRadius:20,border:'1px solid rgba(96,165,250,0.15)'}}>
                        🔗 Enviar enlace de pago
                      </a>
                    )}
                  </div>
                );
              })}
              <button onClick={()=>{setScreen('jobs');setFilter('pending');}} style={{...S.btn,background:'rgba(251,146,60,0.1)',color:'#FB923C',border:'1px solid rgba(251,146,60,0.2)',width:'100%',justifyContent:'center',marginTop:4}}>
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
  const [orsLoading, setOrsLoading] = useState(false);
  const [orsError, setOrsError] = useState('');

  // Cuando cambia tamaño de hogar → sugerir truck automáticamente
  const handleSizeChange = (size, currentForm) => {
    const suggested = HOME_TO_TRUCK[size] || '20ft';
    const newForm = { ...currentForm, size, truckSize: suggested };
    const cost = calcUHaul(suggested, newForm.moveType, newForm.miles||0, newForm.rentalDays||1, newForm.includeInsurance);
    setForm({ ...newForm, truckCost: cost });
  };

  // Cuando cambia cualquier parámetro de UHaul → recalcular costo
  const handleUHaulChange = (field, value, currentForm) => {
    const updated = { ...currentForm, [field]: value };
    const cost = calcUHaul(updated.truckSize, updated.moveType, updated.miles||0, updated.rentalDays||1, updated.includeInsurance);
    setForm({ ...updated, truckCost: cost });
  };

  // Calcular millas con ORS
  const handleCalcMiles = async () => {
    setOrsError('');
    if (!form.origin || !form.dest) return setOrsError('Ingresa origen y destino primero');
    setOrsLoading(true);
    try {
      const { miles, mins } = await orsGetMiles(form.origin, form.dest);
      const h = Math.floor(mins/60), m = mins%60;
      const dur = h > 0 ? `${h}h ${m}min` : `${m}min`;
      const cost = calcUHaul(form.truckSize, form.moveType, miles, form.rentalDays||1, form.includeInsurance);
      setForm(f => ({ ...f, miles, tripDuration: dur, truckCost: cost }));
    } catch(e) { setOrsError(e.message); }
    finally { setOrsLoading(false); }
  };

  const emptyForm = { client:'',phone:'',date:tod(),origin:'',dest:'',type:'local',size:'2br',movers:3,hours:3,miles:15,rate:cfg.rate||150,packing:false,storage:false,notes:'',status:'pending',anticipo:0,payMethod:'Zelle',payLink:'',
    truckSize:'20ft', moveType:'local', rentalDays:1, includeInsurance:true, truckCost:'', tripDuration:'' };

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

  const totals = {
    all: jobs.filter(j=>j.status==='paid').reduce((s,j)=>s+j.total,0),
    pending: jobs.filter(j=>j.status==='pending').reduce((s,j)=>s+j.total,0),
    anticipo: jobs.reduce((s,j)=>s+(j.anticipo||0),0),
    balance: jobs.filter(j=>j.status!=='paid'&&j.status!=='cancelled').reduce((s,j)=>s+(j.total-(j.anticipo||0)),0),
  };

  return (
    <div style={{display:'flex',flexDirection:'column',gap:20}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}>
        <div>
          <h1 style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:'1.5rem',marginBottom:4}}>Mudanzas</h1>
          <p style={{color:'#64748B',fontSize:'0.85rem'}}>{jobs.length} trabajos · Cobrado: <span style={{color:'#4ADE80'}}>{$0(totals.all)}</span> · Anticipos: <span style={{color:'#60A5FA'}}>{$0(totals.anticipo)}</span> · Balance: <span style={{color:'#FB923C'}}>{$0(totals.balance)}</span></p>
        </div>
        <button onClick={()=>openModal('job')} style={{...S.btn,background:'#C9A84C',color:'#0A0C14',fontWeight:700,fontSize:'0.9rem',padding:'10px 20px'}}>
          + Nueva Mudanza
        </button>
      </div>

      {/* Filters + Search */}
      <div style={{display:'flex',gap:10,flexWrap:'wrap'}}>
        {[['all','Todas'],['pending','Pendientes'],['partial','Anticipo'],['paid','Pagadas'],['cancelled','Canceladas']].map(([v,l])=>(
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
                {['Factura','Fecha','Cliente','Ruta','Total','Anticipo','Balance','Pago','Estado','Acciones'].map(h=>(
                  <th key={h} style={{textAlign:'left',padding:'10px 12px',color:'#64748B',fontSize:'0.72rem',fontWeight:700,letterSpacing:'0.08em',textTransform:'uppercase',whiteSpace:'nowrap'}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={8} style={{textAlign:'center',padding:40,color:'#64748B',fontSize:'0.88rem'}}>No hay mudanzas{filter!=='all'?' con este estado':''}</td></tr>
              )}
              {filtered.map(j=>{
                const balance = j.total - (j.anticipo||0);
                return (
                <tr key={j.id} className="row" style={{borderBottom:'1px solid rgba(255,255,255,0.04)',transition:'background 0.15s'}}>
                  <td style={{padding:'12px 12px'}}><span style={{fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:'0.8rem',color:'#C9A84C'}}>{j.inv}</span></td>
                  <td style={{padding:'12px 12px',color:'#94A3B8',whiteSpace:'nowrap'}}>{fmtDate(j.date)}</td>
                  <td style={{padding:'12px 12px'}}>
                    <div style={{fontWeight:500,color:'#F1F5F9'}}>{j.client}</div>
                    <div style={{fontSize:'0.72rem',color:'#64748B'}}>{j.phone}</div>
                  </td>
                  <td style={{padding:'12px 12px',maxWidth:160}}>
                    <div style={{fontSize:'0.78rem',color:'#94A3B8',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{j.origin}</div>
                    <div style={{fontSize:'0.73rem',color:'#64748B'}}>→ {j.dest}</div>
                  </td>
                  <td style={{padding:'12px 12px'}}><span style={{fontFamily:"'Syne',sans-serif",fontWeight:700,color:'#F1F5F9'}}>{$0(j.total)}</span></td>
                  <td style={{padding:'12px 12px'}}>
                    {(j.anticipo||0) > 0
                      ? <span style={{fontWeight:600,color:'#4ADE80'}}>{$0(j.anticipo)}</span>
                      : <span style={{color:'#374151',fontSize:'0.8rem'}}>—</span>}
                  </td>
                  <td style={{padding:'12px 12px'}}>
                    {j.status==='paid'
                      ? <span style={{color:'#4ADE80',fontSize:'0.8rem'}}>✓ Saldado</span>
                      : <span style={{fontWeight:700,color:balance>0?'#FB923C':'#4ADE80'}}>{$0(balance)}</span>}
                  </td>
                  <td style={{padding:'12px 12px'}}>
                    <div style={{display:'flex',alignItems:'center',gap:5}}>
                      <span style={{fontSize:'0.78rem',color:'#94A3B8'}}>{j.payMethod||'—'}</span>
                      {j.payLink && <a href={j.payLink} target="_blank" rel="noopener noreferrer" title="Enlace de pago" style={{color:'#60A5FA',fontSize:'0.85rem',textDecoration:'none'}}>🔗</a>}
                    </div>
                  </td>
                  <td style={{padding:'12px 12px'}}><span style={S.badge(j.status)}>{STATUS_STYLE[j.status]?.label}</span></td>
                  <td style={{padding:'12px 12px'}}>
                    <div style={{display:'flex',gap:4}}>
                      <button className="ico-btn" onClick={()=>setViewing(j)} title="Ver factura" style={{background:'none',border:'none',color:'#94A3B8',padding:5,borderRadius:6,fontSize:'0.9rem'}}>👁</button>
                      <button className="ico-btn" onClick={()=>openModal('job',j)} title="Editar" style={{background:'none',border:'none',color:'#94A3B8',padding:5,borderRadius:6,fontSize:'0.9rem'}}>✏️</button>
                      {(j.status==='pending'||j.status==='partial') && <button className="ico-btn" onClick={()=>markPaid(j.id)} title="Marcar pagado" style={{background:'none',border:'none',color:'#4ADE80',padding:5,borderRadius:6,fontSize:'0.9rem'}}>✅</button>}
                      <button className="ico-btn" onClick={()=>delJob(j.id)} title="Eliminar" style={{background:'none',border:'none',color:'#F87171',padding:5,borderRadius:6,fontSize:'0.9rem'}}>🗑</button>
                    </div>
                  </td>
                </tr>
                );
              })}
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

            {/* ── Origen y destino con botón de cálculo de millas ── */}
            <div style={{gridColumn:'1/-1',display:'grid',gridTemplateColumns:'1fr 1fr',gap:14}}>
              <FG label="📍 Dirección de Pickup *">
                <input style={S.input} value={form.origin} onChange={e=>setForm({...form,origin:e.target.value})} placeholder="123 Main St, Newark, NJ 07102"/>
              </FG>
              <FG label="🏁 Dirección de Delivery *">
                <input style={S.input} value={form.dest} onChange={e=>setForm({...form,dest:e.target.value})} placeholder="456 Oak Ave, Jersey City, NJ 07306"/>
              </FG>
            </div>
            <div style={{gridColumn:'1/-1',display:'flex',gap:12,alignItems:'center',flexWrap:'wrap',marginTop:-6}}>
              <button type="button" onClick={handleCalcMiles}
                disabled={orsLoading || !form.origin || !form.dest}
                style={{...S.btn, background: orsLoading||!form.origin||!form.dest ?'#2a2a2a':'#C9A84C', color: orsLoading||!form.origin||!form.dest?'#666':'#0A0C14', fontSize:'0.82rem', padding:'8px 16px'}}>
                {orsLoading ? '⏳ Calculando...' : '🗺️ Calcular Millas Automático'}
              </button>
              {form.miles > 0 && (
                <div style={{background:'rgba(74,222,128,0.08)',border:'1px solid rgba(74,222,128,0.2)',borderRadius:6,padding:'6px 12px',fontSize:'0.82rem',color:'#4ADE80',display:'flex',gap:12}}>
                  <span>🛣️ <strong>{form.miles} millas</strong></span>
                  {form.tripDuration && <span>⏱️ ~{form.tripDuration}</span>}
                </div>
              )}
              {orsError && <span style={{color:'#F87171',fontSize:'0.8rem'}}>⚠️ {orsError}</span>}
            </div>

            {/* ── Millas manual (por si prefiere escribir) ── */}
            <FG label="Millas recorridas (auto o manual)">
              <input type="number" style={S.input} value={form.miles} onChange={e=>{ const m=+e.target.value; const cost=calcUHaul(form.truckSize,form.moveType,m,form.rentalDays||1,form.includeInsurance); setForm({...form,miles:m,truckCost:cost}); }} min={0}/>
            </FG>

            {/* ── Tamaño del hogar → sugiere truck automáticamente ── */}
            <FG label="Tamaño del hogar">
              <select style={S.input} value={form.size} onChange={e=>handleSizeChange(e.target.value,form)}>
                <option value="studio">Studio / 1 cuarto</option>
                <option value="1br">1 Bedroom</option>
                <option value="2br">2 Bedrooms</option>
                <option value="3br">3 Bedrooms</option>
                <option value="4br">4 Bedrooms</option>
                <option value="5br">5+ Bedrooms</option>
              </select>
            </FG>

            {/* ── Truck UHaul ── */}
            <div style={{gridColumn:'1/-1',background:'rgba(201,168,76,0.04)',border:'1px solid rgba(201,168,76,0.15)',borderRadius:10,padding:'14px 16px',display:'flex',flexDirection:'column',gap:12}}>
              <div style={{fontSize:'0.75rem',fontWeight:700,letterSpacing:'0.08em',textTransform:'uppercase',color:'#C9A84C'}}>
                🚛 Truck UHaul {HOME_NOTES[form.size] ? <span style={{color:'#FB923C',fontWeight:400,textTransform:'none',fontSize:'0.76rem',marginLeft:6}}>{HOME_NOTES[form.size]}</span> : null}
              </div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
                <FG label="Tamaño del truck (auto-sugerido)">
                  <select style={S.input} value={form.truckSize||'20ft'} onChange={e=>handleUHaulChange('truckSize',e.target.value,form)}>
                    {Object.entries(TRUCK_SPECS).map(([k,v])=>(
                      <option key={k} value={k}>{v.label} {HOME_TO_TRUCK[form.size]===k?' ✦':''}</option>
                    ))}
                  </select>
                </FG>
                <FG label="Días de renta">
                  <input type="number" style={S.input} min={1} max={30} value={form.rentalDays||1} onChange={e=>handleUHaulChange('rentalDays',+e.target.value,form)}/>
                </FG>
              </div>
              <div style={{display:'flex',gap:0,borderRadius:6,overflow:'hidden',border:'1px solid rgba(255,255,255,0.08)'}}>
                {[['local','📍 Local (regresa el truck)'],['oneway','🏁 One-Way (otra ciudad)']].map(([v,l])=>(
                  <button key={v} type="button" onClick={()=>handleUHaulChange('moveType',v,form)}
                    style={{flex:1,padding:'8px',background:form.moveType===v?'#C9A84C':'transparent',color:form.moveType===v?'#0A0C14':'#94A3B8',border:'none',fontWeight:form.moveType===v?700:400,fontSize:'0.8rem',cursor:'pointer'}}>
                    {l}
                  </button>
                ))}
              </div>
              <label style={{display:'flex',alignItems:'center',gap:8,cursor:'pointer',fontSize:'0.83rem',color:'#94A3B8'}}>
                <input type="checkbox" checked={form.includeInsurance!==false} onChange={e=>handleUHaulChange('includeInsurance',e.target.checked,form)}/>
                Incluir SafeMove Insurance (${TRUCK_SPECS[form.truckSize||'20ft']?.insurancePerDay}/día) — recomendado
              </label>
              {form.truckCost > 0 && (
                <div style={{display:'flex',justifyContent:'space-between',background:'rgba(201,168,76,0.08)',borderRadius:6,padding:'8px 12px',fontSize:'0.85rem'}}>
                  <span style={{color:'#94A3B8'}}>Estimado UHaul ({TRUCK_SPECS[form.truckSize||'20ft']?.label}, {form.rentalDays} día{form.rentalDays>1?'s':''}, {form.moveType==='local'?'local':'one-way'})</span>
                  <span style={{color:'#C9A84C',fontWeight:700}}>${form.truckCost.toLocaleString()}</span>
                </div>
              )}
              <div style={{color:'#475569',fontSize:'0.7rem'}}>* Estimado basado en tarifas UHaul NJ. Confirmar precio exacto en uhaul.com según fecha y disponibilidad.</div>
            </div>
            <FG label="Mudanceros"><input type="number" style={S.input} value={form.movers} onChange={e=>setForm({...form,movers:+e.target.value})} min={1} max={10}/></FG>
            <FG label="Horas trabajadas"><input type="number" style={S.input} value={form.hours} onChange={e=>setForm({...form,hours:+e.target.value})} min={1} max={24}/></FG>
            <FG label="Tarifa/hr por mudancero ($)"><input type="number" style={S.input} value={form.rate} onChange={e=>setForm({...form,rate:+e.target.value})} min={50}/></FG>
            <FG label="Estado"><select style={S.input} value={form.status} onChange={e=>setForm({...form,status:e.target.value})}>
              <option value="pending">Pendiente de pago</option>
              <option value="partial">Anticipo recibido</option>
              <option value="paid">Pagado completo</option>
              <option value="cancelled">Cancelado</option>
            </select></FG>
            <FG label="Anticipo recibido ($)">
              <input type="number" style={S.input} value={form.anticipo||0} onChange={e=>setForm({...form,anticipo:+e.target.value})} min={0} placeholder="0"/>
            </FG>
            <FG label="Método de pago"><select style={S.input} value={form.payMethod||'Zelle'} onChange={e=>setForm({...form,payMethod:e.target.value})}>
              {PAY_METHODS.map(m=><option key={m}>{m}</option>)}
            </select></FG>
            <FG label="Enlace de pago (opcional)">
              <input style={S.input} value={form.payLink||''} onChange={e=>setForm({...form,payLink:e.target.value})} placeholder="https://buy.stripe.com/... o paypal.me/..."/>
            </FG>
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
              [`🚛 Truck UHaul (${TRUCK_SPECS[form.truckSize||'20ft']?.label||form.size}, ${form.rentalDays||1} día${(form.rentalDays||1)>1?'s':''})`, c.truck],
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
            {(form.anticipo||0) > 0 && (
              <>
                <div style={{display:'flex',justifyContent:'space-between',fontSize:'0.82rem',color:'#4ADE80',marginTop:8}}>
                  <span>✓ Anticipo recibido</span><span style={{fontWeight:600}}>-{$0(form.anticipo)}</span>
                </div>
                <div style={{display:'flex',justifyContent:'space-between',fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:'1rem',color:'#FB923C',marginTop:4,paddingTop:6,borderTop:'1px solid rgba(251,146,60,0.2)'}}>
                  <span>BALANCE POR COBRAR</span>
                  <span>{$0(c.total-(form.anticipo||0))}</span>
                </div>
              </>
            )}
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
function InvoiceModal({job, onClose, cfg}) {
  const calc = jobTotal(job);
  const balance = job.total - (job.anticipo||0);
  const isPaid = job.status === 'paid';
  const isPartial = job.status === 'partial';
  const dueDate = (() => {
    const d = new Date(job.date+'T12:00:00');
    d.setDate(d.getDate()+7);
    return d.toLocaleDateString('es-US',{day:'2-digit',month:'short',year:'numeric'});
  })();

  const printInvoice = () => {
    const el = document.getElementById('invoice-print-area');
    const w = window.open('','_blank','width=800,height=900');
    w.document.write(`
      <html><head>
      <title>Factura ${job.inv} · ${job.client}</title>
      <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&family=Syne:wght@700;800&display=swap" rel="stylesheet"/>
      <style>
        *{box-sizing:border-box;margin:0;padding:0}
        body{font-family:'Outfit',sans-serif;color:#1e293b;background:#fff;padding:0}
        @media print{@page{margin:15mm;size:A4}}
      </style>
      </head><body>${el.innerHTML}</body></html>
    `);
    w.document.close();
    setTimeout(()=>{ w.focus(); w.print(); },600);
  };

  const waText = encodeURIComponent(
    `Hola ${job.client} 👋\n\nAdjunto tu factura de Yaritao Moving:\n\n` +
    `📋 Factura: ${job.inv}\n` +
    `📅 Fecha: ${fmtDate(job.date)}\n` +
    `📍 ${job.origin} → ${job.dest}\n\n` +
    `💰 Total: $${job.total.toLocaleString()}\n` +
    ((job.anticipo||0)>0 ? `✅ Anticipo recibido: $${(job.anticipo).toLocaleString()}\n⏳ Balance pendiente: $${balance.toLocaleString()}\n` : '') +
    (job.payLink ? `\n🔗 Paga aquí: ${job.payLink}\n` : '') +
    `\n¡Gracias por confiar en nosotros! 🚛`
  );

  return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.85)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:999,padding:'16px'}} onClick={onClose}>
      <div className="modal-inner" style={{background:'#0F1117',border:'1px solid rgba(255,255,255,0.08)',borderRadius:16,width:'100%',maxWidth:680,maxHeight:'95vh',display:'flex',flexDirection:'column',overflow:'hidden'}} onClick={e=>e.stopPropagation()}>

        {/* Toolbar */}
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'14px 20px',borderBottom:'1px solid rgba(255,255,255,0.07)',flexShrink:0}}>
          <div style={{display:'flex',alignItems:'center',gap:10}}>
            <span style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:'0.95rem',color:'#F1F5F9'}}>Factura {job.inv}</span>
            <span style={S.badge(job.status)}>{STATUS_STYLE[job.status]?.label}</span>
          </div>
          <div style={{display:'flex',gap:8,alignItems:'center'}}>
            <a href={`https://wa.me/${(job.phone||'').replace(/\D/g,'')}?text=${waText}`} target="_blank" rel="noopener noreferrer"
              style={{...S.btn,background:'rgba(37,211,102,0.12)',color:'#25D366',border:'1px solid rgba(37,211,102,0.25)',padding:'7px 14px',fontSize:'0.8rem',textDecoration:'none'}}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
              WhatsApp
            </a>
            <button onClick={printInvoice} style={{...S.btn,background:'rgba(201,168,76,0.12)',color:'#C9A84C',border:'1px solid rgba(201,168,76,0.25)',padding:'7px 14px',fontSize:'0.8rem'}}>
              🖨 PDF / Imprimir
            </button>
            <button onClick={onClose} style={{background:'rgba(255,255,255,0.06)',border:'none',color:'#94A3B8',width:30,height:30,borderRadius:6,cursor:'pointer',fontSize:'1rem'}}>✕</button>
          </div>
        </div>

        {/* Invoice preview — scrollable */}
        <div style={{overflowY:'auto',flex:1,padding:24}}>
          <div id="invoice-print-area">
            {/* Printable invoice — white background */}
            <div style={{background:'#ffffff',color:'#1e293b',borderRadius:12,overflow:'hidden',fontFamily:"'Outfit',sans-serif",boxShadow:'0 4px 32px rgba(0,0,0,0.3)'}}>

              {/* Gold header bar */}
              <div style={{background:'linear-gradient(135deg,#B8914A,#C9A84C,#8B6914)',padding:'28px 36px',display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}>
                <div>
                  <div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:'1.8rem',color:'#fff',letterSpacing:'-0.02em',lineHeight:1}}>🚛 YARITAO MOVING</div>
                  <div style={{color:'rgba(255,255,255,0.8)',fontSize:'0.82rem',marginTop:6}}>{cfg?.phone||'(908) 457-8129'} · New Jersey, EE.UU.</div>
                  <div style={{color:'rgba(255,255,255,0.7)',fontSize:'0.76rem',marginTop:2}}>Servicio profesional de mudanzas · Español & English</div>
                </div>
                <div style={{textAlign:'right'}}>
                  <div style={{background:'rgba(255,255,255,0.15)',borderRadius:8,padding:'10px 16px',backdropFilter:'blur(8px)'}}>
                    <div style={{fontSize:'0.65rem',fontWeight:700,letterSpacing:'0.15em',color:'rgba(255,255,255,0.7)',textTransform:'uppercase',marginBottom:3}}>FACTURA</div>
                    <div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:'1.4rem',color:'#fff'}}>{job.inv}</div>
                  </div>
                  <div style={{color:'rgba(255,255,255,0.7)',fontSize:'0.75rem',marginTop:8}}>
                    <div>Emitida: {fmtDate(job.date)}</div>
                    {!isPaid && <div style={{marginTop:2}}>Vence: {dueDate}</div>}
                  </div>
                </div>
              </div>

              {/* Body */}
              <div style={{padding:'28px 36px'}}>

                {/* Client + Service info */}
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16,marginBottom:28}}>
                  <div style={{background:'#F8FAFC',borderRadius:10,padding:'16px 18px',borderLeft:'3px solid #C9A84C'}}>
                    <div style={{fontSize:'0.65rem',fontWeight:700,letterSpacing:'0.15em',color:'#94A3B8',textTransform:'uppercase',marginBottom:10}}>Facturado a</div>
                    <div style={{fontWeight:700,fontSize:'1.05rem',color:'#0f172a'}}>{job.client}</div>
                    {job.phone && <div style={{fontSize:'0.82rem',color:'#64748B',marginTop:4}}>📱 {job.phone}</div>}
                  </div>
                  <div style={{background:'#F8FAFC',borderRadius:10,padding:'16px 18px',borderLeft:'3px solid #60A5FA'}}>
                    <div style={{fontSize:'0.65rem',fontWeight:700,letterSpacing:'0.15em',color:'#94A3B8',textTransform:'uppercase',marginBottom:10}}>Detalles del servicio</div>
                    <div style={{fontSize:'0.82rem',color:'#374151',lineHeight:1.7}}>
                      <div>📍 <strong>Origen:</strong> {job.origin}</div>
                      <div>🏁 <strong>Destino:</strong> {job.dest}</div>
                      <div>🚛 <strong>Tipo:</strong> {job.type==='local'?'Mudanza Local (NJ)':'Mudanza Interestatal'}</div>
                    </div>
                  </div>
                </div>

                {/* Work details chips */}
                <div style={{display:'flex',gap:8,flexWrap:'wrap',marginBottom:24}}>
                  {[
                    `👷 ${job.movers} mudanceros`,
                    `⏱ ${job.hours} horas`,
                    `📍 ${(job.miles||0).toLocaleString()} millas`,
                    `💵 $${job.rate||150}/hr por mud.`,
                    job.packing && '📦 Empaque incluido',
                    job.storage && '🗄 Storage incluido',
                  ].filter(Boolean).map((chip,i)=>(
                    <span key={i} style={{background:'#EFF6FF',color:'#1d4ed8',border:'1px solid #BFDBFE',borderRadius:20,padding:'4px 12px',fontSize:'0.76rem',fontWeight:500}}>{chip}</span>
                  ))}
                </div>

                {/* Line items table */}
                <table style={{width:'100%',borderCollapse:'collapse',marginBottom:20}}>
                  <thead>
                    <tr style={{background:'#1e293b'}}>
                      <th style={{textAlign:'left',padding:'10px 14px',color:'#fff',fontSize:'0.72rem',fontWeight:700,letterSpacing:'0.1em',textTransform:'uppercase',borderRadius:'6px 0 0 6px'}}>Concepto</th>
                      <th style={{textAlign:'right',padding:'10px 14px',color:'#fff',fontSize:'0.72rem',fontWeight:700,letterSpacing:'0.1em',textTransform:'uppercase',borderRadius:'0 6px 6px 0',width:120}}>Monto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      { label:`Mano de obra`, detail:`$${job.rate||150}/hr × ${job.movers} mudanceros × ${job.hours} horas`, value: calc.labor },
                      { label:`Alquiler de camión`, detail:`Tamaño del hogar: ${job.size==='studio'?'Estudio/1 hab':job.size==='2br'?'2 habitaciones':job.size==='3br'?'3 habitaciones':'4+ habitaciones'}`, value: calc.truck },
                      { label:`Millas recorridas`, detail:`${(job.miles||0).toLocaleString()} millas × $${MILE_RATE}/mi`, value: calc.miles },
                      job.packing && { label:`Servicio de empaque completo`, detail:'Materiales + mano de obra de empaque', value: calc.pack },
                      job.storage && { label:`Almacenamiento temporal`, detail:'Hasta 30 días en instalaciones aseguradas', value: calc.stor },
                    ].filter(Boolean).map((row,i,arr)=>(
                      <tr key={i} style={{borderBottom: i<arr.length-1 ? '1px solid #F1F5F9' : 'none', background: i%2===0?'#fff':'#FAFBFC'}}>
                        <td style={{padding:'12px 14px'}}>
                          <div style={{fontWeight:600,color:'#1e293b',fontSize:'0.88rem'}}>{row.label}</div>
                          <div style={{fontSize:'0.74rem',color:'#94A3B8',marginTop:2}}>{row.detail}</div>
                        </td>
                        <td style={{padding:'12px 14px',textAlign:'right',fontWeight:700,fontSize:'0.92rem',color:'#1e293b'}}>${row.value.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {/* Totals block */}
                <div style={{background:'#F8FAFC',borderRadius:10,padding:'16px 18px',marginBottom:20}}>
                  <div style={{display:'flex',justifyContent:'space-between',fontSize:'0.88rem',color:'#64748B',marginBottom:8,paddingBottom:8,borderBottom:'1px solid #E2E8F0'}}>
                    <span>Subtotal</span>
                    <span style={{fontWeight:600,color:'#1e293b'}}>${job.total.toLocaleString()}</span>
                  </div>
                  {(job.anticipo||0) > 0 && (
                    <div style={{display:'flex',justifyContent:'space-between',fontSize:'0.88rem',color:'#16a34a',marginBottom:8,paddingBottom:8,borderBottom:'1px solid #E2E8F0'}}>
                      <span>✓ Anticipo recibido ({job.payMethod||''})</span>
                      <span style={{fontWeight:600}}>− ${(job.anticipo).toLocaleString()}</span>
                    </div>
                  )}
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                    <div>
                      <div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:'1rem',color: isPaid?'#16a34a' : '#1e293b'}}>
                        {isPaid ? '✓ PAGADO COMPLETO' : (job.anticipo||0)>0 ? 'BALANCE POR COBRAR' : 'TOTAL A PAGAR'}
                      </div>
                      {!isPaid && <div style={{fontSize:'0.72rem',color:'#94A3B8',marginTop:2}}>Método: {job.payMethod||'Por confirmar'}{!isPaid&&` · Vence: ${dueDate}`}</div>}
                    </div>
                    <div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:'2rem',color: isPaid?'#16a34a': isPartial?'#2563eb':'#B8914A'}}>
                      ${(isPaid ? job.total : balance).toLocaleString()}
                    </div>
                  </div>
                </div>

                {/* Payment link */}
                {job.payLink && !isPaid && (
                  <div style={{background:'#EFF6FF',border:'1px solid #BFDBFE',borderRadius:10,padding:'12px 16px',marginBottom:20,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                    <div>
                      <div style={{fontWeight:600,fontSize:'0.85rem',color:'#1d4ed8'}}>🔗 Paga en línea</div>
                      <div style={{fontSize:'0.74rem',color:'#60A5FA',marginTop:2}}>{job.payLink}</div>
                    </div>
                    <span style={{background:'#1d4ed8',color:'#fff',borderRadius:8,padding:'6px 14px',fontSize:'0.78rem',fontWeight:700}}>{job.payMethod} →</span>
                  </div>
                )}

                {/* Notes */}
                {job.notes && (
                  <div style={{background:'#FFFBEB',border:'1px solid #FDE68A',borderRadius:10,padding:'12px 16px',marginBottom:20}}>
                    <div style={{fontSize:'0.72rem',fontWeight:700,color:'#92400E',marginBottom:4,textTransform:'uppercase',letterSpacing:'0.08em'}}>Notas</div>
                    <div style={{fontSize:'0.84rem',color:'#78350F'}}>{job.notes}</div>
                  </div>
                )}

                {/* Footer terms */}
                <div style={{borderTop:'1px solid #E2E8F0',paddingTop:16,display:'flex',justifyContent:'space-between',alignItems:'flex-end'}}>
                  <div style={{fontSize:'0.72rem',color:'#94A3B8',lineHeight:1.6,maxWidth:320}}>
                    <div style={{fontWeight:700,color:'#64748B',marginBottom:4}}>Términos y Condiciones</div>
                    El cobro es por horas trabajadas a la tarifa acordada. Los tiempos estimados pueden variar según las condiciones del día. Todos los artículos están cubiertos por seguro básico durante el transporte. El pago debe realizarse el día del servicio o según lo acordado.
                  </div>
                  <div style={{textAlign:'right'}}>
                    <div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:'1rem',color:'#C9A84C'}}>🚛 YARITAO MOVING</div>
                    <div style={{fontSize:'0.72rem',color:'#94A3B8',marginTop:2}}>¡Gracias por su preferencia!</div>
                  </div>
                </div>

              </div>
            </div>
          </div>
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

// ══ NÓMINA MODULE ═════════════════════════════════════════════════

// Tax helpers
function nCalcFed(annual, filing) {
  const std = filing === 'married' ? 30000 : 15000;
  const taxable = Math.max(0, annual - std);
  const b = filing === 'married'
    ? [[0,23850,.10],[23850,96950,.12],[96950,206700,.22],[206700,394600,.24]]
    : [[0,11925,.10],[11925,48475,.12],[48475,103350,.22],[103350,197300,.24]];
  let t = 0;
  for (const [mn,mx,r] of b) { if (taxable <= mn) break; t += (Math.min(taxable,mx)-mn)*r; }
  return t;
}
function nCalcNJ(annual) {
  const b = [[0,20000,.014],[20000,35000,.0175],[35000,40000,.0245],[40000,75000,.035],[75000,500000,.05525],[500000,Infinity,.0637]];
  let t = 0;
  for (const [mn,mx,r] of b) { if (annual <= mn) break; t += (Math.min(annual,mx)-mn)*r; }
  return t;
}
function nCalcTaxes(gross, filing, periods) {
  const ann = gross * periods;
  const fed = nCalcFed(ann, filing) / periods;
  const nj  = nCalcNJ(ann) / periods;
  const ss  = gross * 0.062;
  const med = gross * 0.0145;
  const sdi = gross * 0.0026;
  const fli = gross * 0.0009;
  return { fed, nj, ss, med, sdi, fli, total: fed+nj+ss+med+sdi+fli };
}
const nFmt = n => '$'+parseFloat(n).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g,',');
const PMAP = {52:'Semanal',26:'Quincenal',24:'Semi-mensual',12:'Mensual'};

// Shared dark-themed sub-components
const NCard = ({children,style={}}) => (
  <div style={{background:'#1A1D2E',border:'1px solid rgba(255,255,255,0.07)',borderRadius:14,padding:24,marginBottom:14,...style}}>{children}</div>
);
const NMetric = ({label,value,color='#F1F5F9'}) => (
  <div style={{background:'rgba(255,255,255,0.04)',borderRadius:10,padding:'14px 16px'}}>
    <div style={{fontSize:'0.72rem',fontWeight:700,letterSpacing:'0.08em',textTransform:'uppercase',color:'#64748B',marginBottom:6}}>{label}</div>
    <div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:'1.5rem',color}}>{value}</div>
  </div>
);
const NPBtn = ({children,onClick,style={}}) => (
  <button onClick={onClick} style={{background:'#C9A84C',color:'#0A0C14',border:'none',borderRadius:8,padding:'9px 18px',fontFamily:'inherit',fontSize:'0.88rem',fontWeight:700,cursor:'pointer',...style}}>{children}</button>
);
const NSBtn = ({children,onClick,style={}}) => (
  <button onClick={onClick} style={{background:'rgba(255,255,255,0.05)',border:'1px solid rgba(255,255,255,0.1)',borderRadius:8,padding:'9px 14px',fontFamily:'inherit',fontSize:'0.85rem',fontWeight:500,color:'#94A3B8',cursor:'pointer',...style}}>{children}</button>
);
const NInput = ({style={},...props}) => (
  <input style={{width:'100%',background:'rgba(255,255,255,0.05)',border:'1px solid rgba(255,255,255,0.1)',borderRadius:8,color:'#F1F5F9',fontFamily:'inherit',fontSize:'0.9rem',padding:'10px 14px',...style}} {...props}/>
);
const NSelect = ({children,style={},...props}) => (
  <select style={{width:'100%',background:'#1A1D2E',border:'1px solid rgba(255,255,255,0.1)',borderRadius:8,color:'#F1F5F9',fontFamily:'inherit',fontSize:'0.9rem',padding:'10px 14px',...style}} {...props}>{children}</select>
);
const NTh = ({children,right=false}) => (
  <th style={{textAlign:right?'right':'left',padding:'8px 14px',color:'#64748B',fontSize:'0.72rem',fontWeight:700,letterSpacing:'0.08em',textTransform:'uppercase',borderBottom:'1px solid rgba(255,255,255,0.06)',background:'rgba(255,255,255,0.02)'}}>{children}</th>
);
const NTd = ({children,right=false,mono=false,style={}}) => (
  <td style={{padding:'11px 14px',borderBottom:'1px solid rgba(255,255,255,0.04)',fontSize:'0.88rem',color:'#94A3B8',textAlign:right?'right':'left',fontFamily:mono?'monospace':'inherit',...style}}>{children}</td>
);

// ── W-2 printer ──────────────────────────────────────────────────
function printW2(e, year) {
  const w = window.open('','_blank');
  w.document.write(`<!DOCTYPE html><html><head><title>W-2 ${year} — ${e.empName}</title>
  <style>body{font-family:Arial,sans-serif;padding:2rem;max-width:700px;margin:auto;font-size:13px}
  .hdr{display:flex;justify-content:space-between;border-bottom:2px solid #111;padding-bottom:12px;margin-bottom:16px}
  .grid{display:grid;grid-template-columns:1fr 1fr;border:1px solid #d1d5db}
  .box{border:1px solid #d1d5db;padding:8px 10px}
  .bl{font-size:10px;color:#6b7280;margin:0 0 2px}.bn{font-size:10px;color:#9ca3af;margin:0 0 2px}
  .bv{font-size:14px;font-weight:700;margin:0}.ir{display:flex;gap:16px;margin-bottom:6px}
  .il{font-size:11px;color:#6b7280;min-width:160px}.ft{font-size:10px;color:#9ca3af;margin-top:14px;border-top:1px solid #e5e7eb;padding-top:8px}
  </style></head><body>
  <div class="hdr"><div><strong style="font-size:16px">Wage and Tax Statement — W-2</strong><br><span style="color:#6b7280">Tax Year ${year}</span></div>
  <div style="text-align:right"><strong>Yaritao Moving LLC</strong><br><span style="color:#6b7280">New Jersey, NJ · EIN: XX-XXXXXXX</span></div></div>
  <div style="margin-bottom:14px">
  <div class="ir"><span class="il">Employee name:</span><strong>${e.empName}</strong></div>
  <div class="ir"><span class="il">Position:</span>${e.pos||'—'}</div>
  <div class="ir"><span class="il">Payroll periods processed:</span>${e.periods}</div>
  <div class="ir"><span class="il">Total trips completed:</span>${e.trips}</div></div>
  <div class="grid">
  <div class="box"><p class="bn">Box 1</p><p class="bl">Wages, tips, other compensation</p><p class="bv">${nFmt(e.gross)}</p></div>
  <div class="box"><p class="bn">Box 2</p><p class="bl">Federal income tax withheld</p><p class="bv">${nFmt(e.fed)}</p></div>
  <div class="box"><p class="bn">Box 3</p><p class="bl">Social Security wages</p><p class="bv">${nFmt(e.gross)}</p></div>
  <div class="box"><p class="bn">Box 4</p><p class="bl">Social Security tax withheld</p><p class="bv">${nFmt(e.ss)}</p></div>
  <div class="box"><p class="bn">Box 5</p><p class="bl">Medicare wages and tips</p><p class="bv">${nFmt(e.gross)}</p></div>
  <div class="box"><p class="bn">Box 6</p><p class="bl">Medicare tax withheld</p><p class="bv">${nFmt(e.med)}</p></div>
  <div class="box"><p class="bn">Box 16</p><p class="bl">State wages (NJ)</p><p class="bv">${nFmt(e.gross)}</p></div>
  <div class="box"><p class="bn">Box 17</p><p class="bl">State income tax (NJ)</p><p class="bv">${nFmt(e.nj)}</p></div>
  <div class="box"><p class="bn">Box 19 — SDI</p><p class="bl">NJ SDI withheld</p><p class="bv">${nFmt(e.sdi)}</p></div>
  <div class="box"><p class="bn">Box 19 — FLI</p><p class="bl">NJ FLI withheld</p><p class="bv">${nFmt(e.fli)}</p></div>
  </div>
  <p class="ft">Resumen de nómina interno. W-2 oficial debe ser presentado por un payroll provider certificado (Gusto, ADP) antes del 31 de enero.</p>
  </body></html>`);
  w.document.close(); w.print();
}

// Pay stub printer
function printStubN(r) {
  const w = window.open('','_blank');
  w.document.write(`<!DOCTYPE html><html><head><title>Pay Stub — Yaritao Moving</title>
  <style>body{font-family:Arial,sans-serif;padding:2rem;max-width:600px;margin:auto;color:#111}
  table{width:100%;border-collapse:collapse;margin:1rem 0}td,th{padding:8px 10px;border-bottom:1px solid #e5e7eb;font-size:13px}
  th{text-align:left;font-weight:600;background:#f9fafb}.right{text-align:right}.muted{color:#6b7280}.red{color:#dc2626}
  .net{font-size:16px;font-weight:700}.hdr{display:flex;justify-content:space-between}
  .ft{font-size:11px;color:#9ca3af;margin-top:1rem;border-top:1px solid #e5e7eb;padding-top:8px}
  </style></head><body>
  <div class="hdr"><div><strong style="font-size:16px">Yaritao Moving LLC</strong><br><span class="muted">New Jersey, NJ</span></div>
  <div style="text-align:right"><strong>Pay Stub</strong><br><span class="muted">Emitido: ${r.date}</span></div></div>
  <hr style="border:none;border-top:1px solid #e5e7eb;margin:1rem 0">
  <table><tr><th>Empleado</th><th>Cargo</th><th>Período</th><th>Viajes</th></tr>
  <tr><td>${r.empName}</td><td>${r.pos||'—'}</td><td>${r.start||'—'} → ${r.end||'—'}</td><td>${r.trips}</td></tr></table>
  <table><tr><th>Concepto</th><th class="right">Monto</th></tr>
  <tr><td>Pago bruto (${r.trips} viajes)</td><td class="right">${nFmt(r.gross)}</td></tr>
  <tr><td class="muted" style="padding-left:20px">Federal Income Tax</td><td class="right red">(${nFmt(r.fed)})</td></tr>
  <tr><td class="muted" style="padding-left:20px">NJ State Income Tax</td><td class="right red">(${nFmt(r.nj)})</td></tr>
  <tr><td class="muted" style="padding-left:20px">Social Security (6.20%)</td><td class="right red">(${nFmt(r.ss)})</td></tr>
  <tr><td class="muted" style="padding-left:20px">Medicare (1.45%)</td><td class="right red">(${nFmt(r.med)})</td></tr>
  <tr><td class="muted" style="padding-left:20px">NJ SDI (0.26%)</td><td class="right red">(${nFmt(r.sdi)})</td></tr>
  <tr><td class="muted" style="padding-left:20px">NJ FLI (0.09%)</td><td class="right red">(${nFmt(r.fli)})</td></tr>
  <tr style="border-top:2px solid #111"><td><strong>Pago neto</strong></td><td class="right net">${nFmt(r.net)}</td></tr></table>
  <p class="ft">Cálculos estimados según tasas vigentes 2025 (NJ/Federal). Consulte a su contador para confirmación oficial.</p>
  </body></html>`);
  w.document.close(); w.print();
}

// ── Pay stub view ─────────────────────────────────────────────────
function NPayStubView({r, onClose}) {
  return (
    <div style={{background:'#0F1117',border:'1px solid rgba(255,255,255,0.06)',borderRadius:14,padding:24,marginTop:16}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:18}}>
        <div style={{fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:'1rem',color:'#F1F5F9'}}>Pay Stub</div>
        <div style={{display:'flex',gap:8}}>
          <NPBtn onClick={()=>printStubN(r)} style={{fontSize:'0.8rem',padding:'7px 14px'}}>Imprimir / PDF</NPBtn>
          <NSBtn onClick={onClose} style={{fontSize:'0.8rem',padding:'7px 12px'}}>✕</NSBtn>
        </div>
      </div>
      <div style={{display:'flex',justifyContent:'space-between',marginBottom:14,paddingBottom:14,borderBottom:'1px solid rgba(255,255,255,0.06)'}}>
        <div><div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:'1rem',color:'#C9A84C'}}>Yaritao Moving LLC</div><div style={{fontSize:'0.75rem',color:'#64748B'}}>New Jersey, NJ</div></div>
        <div style={{textAlign:'right'}}><div style={{fontWeight:600,color:'#F1F5F9',fontSize:'0.88rem'}}>Emitido: {r.date}</div></div>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:16}}>
        {[['Empleado',r.empName],['Cargo',r.pos||'—'],['Período',`${r.start||'—'} → ${r.end||'—'}`],['Viajes',r.trips]].map(([k,v])=>(
          <div key={k}><div style={{fontSize:'0.7rem',color:'#64748B',marginBottom:2,textTransform:'uppercase',letterSpacing:'0.06em'}}>{k}</div><div style={{fontSize:'0.88rem',color:'#F1F5F9'}}>{v}</div></div>
        ))}
      </div>
      <table style={{width:'100%',borderCollapse:'collapse',marginBottom:12}}>
        <thead><tr><NTh>Concepto</NTh><NTh right>Monto</NTh></tr></thead>
        <tbody>
          <NTd style={{padding:'11px 14px',color:'#F1F5F9'}}>Pago bruto ({r.trips} viajes)</NTd>
          <NTd right mono style={{color:'#C9A84C',padding:'11px 14px'}}>{nFmt(r.gross)}</NTd>
          {[['Federal Income Tax',r.fed],['NJ State Income Tax',r.nj],['Social Security (6.20%)',r.ss],['Medicare (1.45%)',r.med],['NJ SDI (0.26%)',r.sdi],['NJ FLI (0.09%)',r.fli]].map(([name,val])=>(
            <tr key={name}><NTd style={{paddingLeft:28}}>{name}</NTd><NTd right mono style={{color:'#F87171'}}>({nFmt(val)})</NTd></tr>
          ))}
          <tr style={{borderTop:'1px solid rgba(201,168,76,0.3)'}}>
            <NTd style={{color:'#F1F5F9',fontWeight:700}}>Pago neto</NTd>
            <NTd right mono style={{color:'#4ADE80',fontSize:'1.1rem',fontWeight:700}}>{nFmt(r.net)}</NTd>
          </tr>
        </tbody>
      </table>
      <div style={{fontSize:'0.72rem',color:'#64748B'}}>Cálculos estimados según tasas vigentes 2025 (NJ/Federal).</div>
    </div>
  );
}

// ── Tab Empleados ─────────────────────────────────────────────────
function NTabEmpleados({employees, setEmployees}) {
  const [form, setForm] = useState({name:'',pos:'',rate:'',filing:'single',periods:'26'});
  const add = () => {
    if (!form.name.trim() || !form.rate) return;
    setEmployees([...employees, {id:Date.now(),name:form.name.trim(),pos:form.pos.trim(),rate:parseFloat(form.rate),filing:form.filing,periods:parseInt(form.periods)}]);
    setForm({name:'',pos:'',rate:'',filing:'single',periods:'26'});
  };
  return (
    <div>
      <NCard>
        <div style={{fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:'0.95rem',color:'#F1F5F9',marginBottom:16}}>Agregar empleado</div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(150px,1fr))',gap:10,marginBottom:14}}>
          <NInput placeholder="Nombre completo" value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/>
          <NInput placeholder="Cargo" value={form.pos} onChange={e=>setForm({...form,pos:e.target.value})}/>
          <NInput type="number" placeholder="$ por viaje" value={form.rate} onChange={e=>setForm({...form,rate:e.target.value})}/>
          <NSelect value={form.filing} onChange={e=>setForm({...form,filing:e.target.value})}>
            <option value="single">Soltero/a (Single)</option>
            <option value="married">Casado/a (Married)</option>
          </NSelect>
          <NSelect value={form.periods} onChange={e=>setForm({...form,periods:e.target.value})}>
            <option value="52">Semanal (52/año)</option>
            <option value="26">Quincenal (26/año)</option>
            <option value="24">Semi-mensual (24/año)</option>
            <option value="12">Mensual (12/año)</option>
          </NSelect>
        </div>
        <NPBtn onClick={add}>+ Agregar empleado</NPBtn>
      </NCard>
      <NCard>
        <table style={{width:'100%',borderCollapse:'collapse'}}>
          <thead><tr><NTh>Nombre</NTh><NTh>Cargo</NTh><NTh right>$ / viaje</NTh><NTh>Estado civil</NTh><NTh>Frecuencia</NTh><NTh></NTh></tr></thead>
          <tbody>
            {employees.length===0 ? (
              <tr><td colSpan={6} style={{padding:'2rem',textAlign:'center',color:'#64748B',fontSize:'0.85rem'}}>No hay empleados aún</td></tr>
            ) : employees.map(e=>(
              <tr key={e.id} className="row">
                <NTd style={{color:'#F1F5F9'}}>{e.name}</NTd>
                <NTd>{e.pos||'—'}</NTd>
                <NTd right mono style={{color:'#C9A84C'}}>{nFmt(e.rate)}</NTd>
                <NTd>{e.filing==='married'?'Casado/a':'Soltero/a'}</NTd>
                <NTd>{PMAP[e.periods]}</NTd>
                <NTd><NSBtn onClick={()=>setEmployees(employees.filter(x=>x.id!==e.id))} style={{padding:'4px 10px',fontSize:'0.78rem'}}>Eliminar</NSBtn></NTd>
              </tr>
            ))}
          </tbody>
        </table>
      </NCard>
    </div>
  );
}

// ── Tab Nueva Nómina ──────────────────────────────────────────────
function NTabNomina({employees, payrollRecords, setPayrollRecords, toast$}) {
  const today = new Date().toISOString().split('T')[0];
  const [empId, setEmpId] = useState(employees[0]?.id||'');
  const [start, setStart] = useState(today);
  const [end, setEnd] = useState(today);
  const [trips, setTrips] = useState('');
  const [stub, setStub] = useState(null);

  const emp = employees.find(e=>e.id===parseInt(empId));
  const gross = emp && trips ? emp.rate*parseInt(trips) : 0;
  const taxes = emp && gross>0 ? nCalcTaxes(gross, emp.filing, emp.periods) : null;
  const ann = gross*(emp?.periods||26);

  const process = () => {
    if (!emp || !taxes || !trips) return;
    const r = {
      id: Date.now(), empId:emp.id, empName:emp.name, pos:emp.pos,
      start, end, trips:parseInt(trips), gross,
      fed:taxes.fed, nj:taxes.nj, ss:taxes.ss, med:taxes.med, sdi:taxes.sdi, fli:taxes.fli,
      total:taxes.total, net:gross-taxes.total,
      date: new Date().toLocaleDateString('es-US')
    };
    const expEntry = { id:'nm'+Date.now(), date:start||today, cat:'Nómina', vendor:emp.name, amount:gross, notes:`Pay stub · ${parseInt(trips)} viajes · ${start||today}` };
    setPayrollRecords([r,...payrollRecords], expEntry);
    setTrips(''); setStub(null);
    toast$(`Nómina de ${emp.name} procesada y registrada en gastos`);
  };

  return (
    <div>
      <NCard>
        <div style={{fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:'0.95rem',color:'#F1F5F9',marginBottom:16}}>Calcular nómina</div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(150px,1fr))',gap:10,marginBottom:14}}>
          <div><label style={S.label}>Empleado</label>
            <NSelect value={empId} onChange={e=>setEmpId(e.target.value)}>
              {employees.map(e=><option key={e.id} value={e.id}>{e.name}</option>)}
            </NSelect>
          </div>
          <div><label style={S.label}>Fecha inicio</label><NInput type="date" value={start} onChange={e=>setStart(e.target.value)}/></div>
          <div><label style={S.label}>Fecha fin</label><NInput type="date" value={end} onChange={e=>setEnd(e.target.value)}/></div>
          <div><label style={S.label}>Viajes completados</label><NInput type="number" placeholder="0" min="0" value={trips} onChange={e=>setTrips(e.target.value)}/></div>
        </div>

        {taxes && gross>0 && (
          <div style={{borderTop:'1px solid rgba(255,255,255,0.06)',paddingTop:18,marginTop:6}}>
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(120px,1fr))',gap:10,marginBottom:16}}>
              <NMetric label="Pago bruto" value={nFmt(gross)} color="#C9A84C"/>
              <NMetric label="Deducciones" value={nFmt(taxes.total)} color="#F87171"/>
              <NMetric label="Pago neto" value={nFmt(gross-taxes.total)} color="#4ADE80"/>
            </div>
            <table style={{width:'100%',borderCollapse:'collapse',marginBottom:16}}>
              <thead><tr><NTh>Deducción</NTh><NTh right>Tasa efectiva</NTh><NTh right>Monto</NTh></tr></thead>
              <tbody>
                {[
                  ['Federal Income Tax',`${(nCalcFed(ann,emp.filing)/ann*100).toFixed(1)}%`,taxes.fed],
                  ['NJ State Income Tax',`${(nCalcNJ(ann)/ann*100).toFixed(1)}%`,taxes.nj],
                  ['Social Security (OASDI)','6.20%',taxes.ss],
                  ['Medicare','1.45%',taxes.med],
                  ['NJ SDI','0.26%',taxes.sdi],
                  ['NJ FLI','0.09%',taxes.fli],
                ].map(([name,rate,amount])=>(
                  <tr key={name} className="row">
                    <NTd style={{color:'#F1F5F9'}}>{name}</NTd>
                    <NTd right>{rate}</NTd>
                    <NTd right mono style={{color:'#F87171'}}>{nFmt(amount)}</NTd>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
              <NPBtn onClick={process}>✓ Procesar nómina → registrar en P&L</NPBtn>
              <NSBtn onClick={()=>setStub({empName:emp.name,pos:emp.pos,start,end,trips:parseInt(trips),gross,...taxes,net:gross-taxes.total,date:new Date().toLocaleDateString('es-US')})}>Vista previa pay stub</NSBtn>
            </div>
          </div>
        )}
      </NCard>
      {stub && <NPayStubView r={stub} onClose={()=>setStub(null)}/>}
    </div>
  );
}

// ── Tab Historial ─────────────────────────────────────────────────
function NTabHistorial({payrollRecords}) {
  const [stub, setStub] = useState(null);
  const tg = payrollRecords.reduce((a,r)=>a+r.gross,0);
  const tn = payrollRecords.reduce((a,r)=>a+r.net,0);
  const tt = payrollRecords.reduce((a,r)=>a+r.total,0);

  return (
    <div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(130px,1fr))',gap:12,marginBottom:16}}>
        <NMetric label="Total bruto pagado" value={nFmt(tg)} color="#C9A84C"/>
        <NMetric label="Total neto pagado" value={nFmt(tn)} color="#4ADE80"/>
        <NMetric label="Taxes retenidos" value={nFmt(tt)} color="#F87171"/>
        <NMetric label="Períodos procesados" value={payrollRecords.length} color="#60A5FA"/>
      </div>
      <NCard>
        <table style={{width:'100%',borderCollapse:'collapse'}}>
          <thead><tr><NTh>Período</NTh><NTh>Empleado</NTh><NTh right>Viajes</NTh><NTh right>Bruto</NTh><NTh right>Deducciones</NTh><NTh right>Neto</NTh><NTh></NTh></tr></thead>
          <tbody>
            {payrollRecords.length===0 ? (
              <tr><td colSpan={7} style={{padding:'2rem',textAlign:'center',color:'#64748B',fontSize:'0.85rem'}}>Sin registros — procesa tu primera nómina</td></tr>
            ) : payrollRecords.map(r=>(
              <tr key={r.id} className="row">
                <NTd style={{fontSize:'0.78rem'}}>{r.start||'—'} → {r.end||'—'}</NTd>
                <NTd style={{color:'#F1F5F9'}}>{r.empName}</NTd>
                <NTd right style={{color:'#F1F5F9'}}>{r.trips}</NTd>
                <NTd right mono style={{color:'#C9A84C'}}>{nFmt(r.gross)}</NTd>
                <NTd right mono style={{color:'#F87171'}}>{nFmt(r.total)}</NTd>
                <NTd right mono style={{color:'#4ADE80'}}>{nFmt(r.net)}</NTd>
                <NTd><NSBtn onClick={()=>setStub(r)} style={{padding:'4px 10px',fontSize:'0.78rem'}}>Pay stub</NSBtn></NTd>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{fontSize:'0.75rem',color:'#64748B',marginTop:12}}>✓ Cada nómina procesada se registra automáticamente como gasto de Nómina en el P&L.</div>
      </NCard>
      {stub && <NPayStubView r={stub} onClose={()=>setStub(null)}/>}
    </div>
  );
}

// ── Tab Reporte Empleador ─────────────────────────────────────────
function NTabReporte({payrollRecords, employees}) {
  const tg   = payrollRecords.reduce((a,r)=>a+r.gross,0);
  const tss  = payrollRecords.reduce((a,r)=>a+r.ss,0);
  const tmed = payrollRecords.reduce((a,r)=>a+r.med,0);
  const ec   = Math.max(1,employees.length);
  const futa = Math.min(tg,7000*ec)*0.006;
  const sui  = Math.min(tg,42300*ec)*0.017;
  const wf   = Math.min(tg,42300*ec)*0.000425;
  const total = tss+tmed+futa+sui+wf;

  return (
    <div>
      <NCard>
        <div style={{fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:'0.95rem',color:'#F1F5F9',marginBottom:4}}>Taxes a cargo del empleador</div>
        <div style={{fontSize:'0.8rem',color:'#64748B',marginBottom:16}}>Acumulado basado en la nómina procesada</div>
        <table style={{width:'100%',borderCollapse:'collapse'}}>
          <thead><tr><NTh>Concepto</NTh><NTh right>Tasa</NTh><NTh right>Base salarial</NTh><NTh right>Monto</NTh></tr></thead>
          <tbody>
            {[
              ['SS match empleador','6.20%',nFmt(tg),nFmt(tss)],
              ['Medicare match empleador','1.45%',nFmt(tg),nFmt(tmed)],
              ['FUTA (Federal Unemployment)','0.60%*',nFmt(Math.min(tg,7000*ec)),nFmt(futa)],
              ['NJ SUI (State Unemployment)','1.70%**',nFmt(Math.min(tg,42300*ec)),nFmt(sui)],
              ['NJ Workforce Development','0.0425%',nFmt(Math.min(tg,42300*ec)),nFmt(wf)],
            ].map(([name,rate,base,amount])=>(
              <tr key={name} className="row">
                <NTd style={{color:'#F1F5F9'}}>{name}</NTd>
                <NTd right>{rate}</NTd>
                <NTd right mono>{base}</NTd>
                <NTd right mono style={{color:'#F87171'}}>{amount}</NTd>
              </tr>
            ))}
            <tr style={{borderTop:'1px solid rgba(201,168,76,0.3)'}}>
              <td colSpan={3} style={{padding:'12px 14px',fontWeight:700,color:'#F1F5F9',fontSize:'0.88rem'}}>Total a cargo del empleador</td>
              <NTd right mono style={{color:'#C9A84C',fontWeight:700,fontSize:'1rem'}}>{nFmt(total)}</NTd>
            </tr>
          </tbody>
        </table>
      </NCard>
      <NCard style={{background:'rgba(201,168,76,0.06)',border:'1px solid rgba(201,168,76,0.2)'}}>
        <div style={{fontWeight:700,fontSize:'0.88rem',color:'#C9A84C',marginBottom:6}}>Depósitos federales — vencimiento mensual</div>
        <div style={{fontSize:'0.82rem',color:'#94A3B8',lineHeight:1.6}}>Como empleador nuevo (&lt;$50K en taxes anuales), los depósitos son <strong style={{color:'#F1F5F9'}}>mensuales</strong> — vencen el día 15 del mes siguiente vía <strong style={{color:'#F1F5F9'}}>EFTPS.gov</strong>.<br/>
        Total acumulado employer taxes: <span style={{color:'#C9A84C',fontWeight:700}}>{nFmt(total)}</span></div>
        <div style={{fontSize:'0.72rem',color:'#64748B',marginTop:8}}>* FUTA reducida por crédito SUI. ** NJ SUI tasa nueva empresa — verificar con NJ DOL cada año.</div>
      </NCard>
    </div>
  );
}

// ── Tab W-2 ───────────────────────────────────────────────────────
function NTabW2({payrollRecords, employees}) {
  const currentYear = String(new Date().getFullYear());
  const [year, setYear] = useState(currentYear);
  const years = [...new Set(payrollRecords.map(r=>(r.start||r.date||currentYear).slice(0,4)))].sort((a,b)=>b-a);
  if (!years.includes(currentYear)) years.unshift(currentYear);

  const byEmp = {};
  payrollRecords.forEach(r=>{
    const y = (r.start||r.date||currentYear).slice(0,4);
    if (y !== year) return;
    if (!byEmp[r.empId]) byEmp[r.empId]={empId:r.empId,empName:r.empName,pos:r.pos||'',periods:0,trips:0,gross:0,fed:0,ss:0,med:0,nj:0,sdi:0,fli:0};
    const e=byEmp[r.empId]; e.periods++; e.trips+=r.trips; e.gross+=r.gross;
    e.fed+=r.fed; e.ss+=r.ss; e.med+=r.med; e.nj+=r.nj; e.sdi+=r.sdi; e.fli+=r.fli;
  });
  const empList = Object.values(byEmp);

  return (
    <div>
      <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:16}}>
        <div style={{fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:'0.95rem',color:'#F1F5F9'}}>Resumen W-2 por empleado</div>
        <NSelect value={year} onChange={e=>setYear(e.target.value)} style={{width:'auto'}}>
          {years.map(y=><option key={y} value={y}>{y}</option>)}
        </NSelect>
      </div>
      {empList.length===0 ? (
        <NCard>
          <div style={{textAlign:'center',color:'#64748B',padding:'2rem 0',fontSize:'0.88rem'}}>Sin registros de nómina para {year}. Procesa nóminas primero.</div>
        </NCard>
      ) : empList.map(e=>(
        <NCard key={e.empId}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:16}}>
            <div>
              <div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:'1rem',color:'#F1F5F9'}}>{e.empName}</div>
              <div style={{fontSize:'0.75rem',color:'#64748B',marginTop:2}}>{e.pos||'—'} · {e.periods} períodos · {e.trips} viajes · Tax year {year}</div>
            </div>
            <NPBtn onClick={()=>printW2(e,year)} style={{fontSize:'0.8rem',padding:'7px 14px'}}>Imprimir W-2</NPBtn>
          </div>
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))',gap:1,border:'1px solid rgba(255,255,255,0.06)',borderRadius:8,overflow:'hidden'}}>
            {[
              ['Box 1 — Wages',e.gross,'Salario bruto total'],
              ['Box 2 — Fed withheld',e.fed,'Federal income tax'],
              ['Box 3 — SS wages',e.gross,'Social Security wages'],
              ['Box 4 — SS withheld',e.ss,'SS tax retenido (6.2%)'],
              ['Box 5 — Medicare wages',e.gross,'Medicare wages'],
              ['Box 6 — Medicare',e.med,'Medicare retenido (1.45%)'],
              ['Box 16 — NJ wages',e.gross,'Salario estatal NJ'],
              ['Box 17 — NJ tax',e.nj,'NJ income tax retenido'],
              ['Box 19 — SDI',e.sdi,'NJ SDI retenido'],
              ['Box 19 — FLI',e.fli,'NJ FLI retenido'],
            ].map(([box,val,desc])=>(
              <div key={box} style={{padding:'10px 14px',background:'rgba(255,255,255,0.02)',borderRight:'1px solid rgba(255,255,255,0.04)',borderBottom:'1px solid rgba(255,255,255,0.04)'}}>
                <div style={{fontSize:'0.68rem',color:'#64748B',letterSpacing:'0.08em',marginBottom:4,textTransform:'uppercase'}}>{box}</div>
                <div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:'1rem',color:'#C9A84C',marginBottom:2}}>{nFmt(val)}</div>
                <div style={{fontSize:'0.72rem',color:'#64748B'}}>{desc}</div>
              </div>
            ))}
          </div>
          <div style={{fontSize:'0.72rem',color:'#64748B',marginTop:10}}>Acumulado de {e.periods} {e.periods===1?'período':'períodos'} procesados en {year}.</div>
        </NCard>
      ))}
      <NCard style={{background:'rgba(248,113,113,0.06)',border:'1px solid rgba(248,113,113,0.2)'}}>
        <div style={{fontWeight:700,fontSize:'0.88rem',color:'#F87171',marginBottom:6}}>⚠ W-2 oficial — deadline 31 de enero</div>
        <div style={{fontSize:'0.82rem',color:'#94A3B8',lineHeight:1.6}}>Este resumen es para control interno. El W-2 oficial debe enviarse al empleado y al IRS usando un payroll provider certificado como <strong style={{color:'#F1F5F9'}}>Gusto</strong> (~$40/mes) o <strong style={{color:'#F1F5F9'}}>ADP</strong>. El EIN del negocio es obligatorio para presentar.</div>
      </NCard>
    </div>
  );
}

// ══ NÓMINA MAIN COMPONENT ═════════════════════════════════════════
function Nomina({employees, setEmployees, payrollRecords, setPayrollRecords, toast$}) {
  const [tab, setTab] = useState('empleados');
  const TABS = [
    {id:'empleados',label:'👤 Empleados'},
    {id:'nomina',label:'🧮 Nueva nómina'},
    {id:'historial',label:'📋 Historial'},
    {id:'reporte',label:'🏢 Reporte empleador'},
    {id:'w2',label:'📑 W-2 Anual'},
  ];

  return (
    <div style={{display:'flex',flexDirection:'column',gap:20}}>
      <div>
        <h1 style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:'1.6rem',color:'#F1F5F9',marginBottom:4}}>Nómina</h1>
        <p style={{color:'#64748B',fontSize:'0.88rem'}}>Cálculo automático de taxes federales y NJ · Pago por viaje · 2025</p>
      </div>

      {/* Tab bar */}
      <div style={{display:'flex',gap:2,borderBottom:'1px solid rgba(255,255,255,0.06)',paddingBottom:0,flexWrap:'wrap'}}>
        {TABS.map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)} className="nav-btn" style={{background:'none',border:'none',borderBottom:tab===t.id?'2px solid #C9A84C':'2px solid transparent',padding:'8px 16px',fontFamily:'inherit',fontSize:'0.85rem',cursor:'pointer',color:tab===t.id?'#C9A84C':'#64748B',fontWeight:tab===t.id?600:400,marginBottom:-1,transition:'all 0.15s'}}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="fade" key={tab}>
        {tab==='empleados' && <NTabEmpleados employees={employees} setEmployees={setEmployees}/>}
        {tab==='nomina'    && <NTabNomina employees={employees} payrollRecords={payrollRecords} setPayrollRecords={setPayrollRecords} toast$={toast$}/>}
        {tab==='historial' && <NTabHistorial payrollRecords={payrollRecords}/>}
        {tab==='reporte'   && <NTabReporte payrollRecords={payrollRecords} employees={employees}/>}
        {tab==='w2'        && <NTabW2 payrollRecords={payrollRecords} employees={employees}/>}
      </div>
    </div>
  );
}

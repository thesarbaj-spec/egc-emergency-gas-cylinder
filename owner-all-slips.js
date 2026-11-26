const SUPABASE_URL="https://szefvmvokkhvnzryodqu.supabase.co";
const SUPABASE_PUBLISHABLE_KEY="sb_publishable_S8aSsfmOKN6_7laRfgoMKA_Re2HzRS6";
const db=window.supabase.createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,storageKey:"egc-owner-auth"}});
const $=id=>document.getElementById(id), esc=v=>String(v??"—").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
const val=(o,ks,d="—")=>{for(const k of ks)if(o&&o[k]!==null&&o[k]!==undefined&&o[k]!=="")return o[k];return d};
const money=n=>"₹"+Number(n||0).toLocaleString("en-IN",{minimumFractionDigits:2,maximumFractionDigits:2});
const dt=v=>{if(!v)return"—";let d=new Date(v);return isNaN(d)?"—":d.toLocaleString("en-IN",{day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"})};
const title=v=>String(v||"pending").replace(/_/g," ").replace(/\b\w/g,c=>c.toUpperCase());
let groups=[];
async function auth(){let {data,error}=await db.auth.getSession();if(error||!data.session?.user){location.replace("owner-login.html");return false}return true}
async function fetchIds(table,ids){if(!ids.length)return[];let {data,error}=await db.from(table).select("*").in("id",ids);if(error){console.warn(table,error.message);return[]}return data||[]}
function isApproved(p){
 const vs=String(p.verification_status||"").toLowerCase();
 const ps=String(p.payment_status||"").toLowerCase();
 const approvedVerification=["approved","verified","success","successful","completed"].includes(vs) || !!p.owner_approved_at;
 const successfulPayment=["paid","approved","verified","success","successful","completed"].includes(ps);
 return approvedVerification && successfulPayment;
}
async function load(){
 $("body").innerHTML='<tr><td colspan="7" class="empty">Loading slips...</td></tr>';
 try{
  let {data:slips,error}=await db.from("request_slips").select("*").order("updated_at",{ascending:false,nullsFirst:false}).order("created_at",{ascending:false});if(error)throw error;slips=slips||[];
  let rids=[...new Set(slips.map(s=>s.request_id||s.original_request_id).filter(Boolean))],pids=[...new Set(slips.map(s=>s.payment_id).filter(Boolean))],uids=[...new Set(slips.map(s=>s.user_id).filter(Boolean))],aids=[...new Set(slips.map(s=>s.agency_id).filter(Boolean))];
  let [reqs,pays,profiles,agencies]=await Promise.all([fetchIds("cylinder_requests",rids),fetchIds("payments",pids),fetchIds("profiles",uids),fetchIds("agencies",aids)]);
  let [{data:history,error:he},{data:snapshots,error:se}]=await Promise.all([
   rids.length?db.from("payments").select("*").in("request_id",rids).order("payment_date",{ascending:true}):Promise.resolve({data:[],error:null}),
   rids.length?db.from("request_scheme_snapshots").select("*").in("request_id",rids):Promise.resolve({data:[],error:null})
  ]);
  if(he)console.warn("Payment history:",he.message);if(se)console.warn("Request scheme snapshots:",se.message);
  history=history||[];snapshots=snapshots||[];
  const snapshotMap=new Map(snapshots.map(x=>[String(x.request_id),x]));
  reqs=reqs.map(r=>({...r,__scheme_snapshot:snapshotMap.get(String(r.id))||null}));
  let rm=new Map(reqs.map(x=>[String(x.id),x])),pm=new Map(pays.map(x=>[String(x.id),x])),um=new Map(profiles.map(x=>[String(x.id),x])),am=new Map(agencies.map(x=>[String(x.id),x]));
  let rows=slips.map(s=>{let rid=s.request_id||s.original_request_id,r=rm.get(String(rid))||{},p=pm.get(String(s.payment_id))||{},u=um.get(String(s.user_id))||{},a=am.get(String(s.agency_id))||{};return {...s,_r:r,_p:p,_u:u,_a:a,_email:val(r,["customer_email","email"],val(u,["email"],val(p,["customer_email","email"]))),_history:history.filter(x=>String(x.request_id)===String(rid))}});
  let map=new Map();rows.forEach(s=>{let k=String(s.user_id);if(!map.has(k))map.set(k,{key:k,userId:s.user_id,slips:[]});map.get(k).slips.push(s)});
  groups=[...map.values()].map(g=>{g.slips.sort((a,b)=>new Date(b.updated_at||b.created_at||0)-new Date(a.updated_at||a.created_at||0));g.latest=g.slips[0];g.name=val(g.latest,["user_name"],val(g.latest._r,["customer_name"],val(g.latest._u,["full_name","name"],"Customer")));g.code=val(g.latest,["user_code"],val(g.latest._r,["egc_user_code"],val(g.latest._u,["egc_user_id","user_code","egc_id"])));g.mobile=val(g.latest,["mobile"],val(g.latest._r,["customer_mobile"],val(g.latest._u,["mobile","phone"])));g.email=g.latest._email;let ids=new Set(g.slips.map(s=>String(s.request_id||s.original_request_id)));g.payments=history.filter(p=>String(p.user_id)===g.key||g.slips.some(s=>String(s.payment_id)===String(p.id))).filter(p=>ids.has(String(p.request_id)));g.paid=g.payments.filter(isApproved).reduce((n,p)=>n+Number(p.payment_amount||0),0);return g});
  $("customers").textContent=groups.length;$("slips").textContent=rows.length;let all=groups.flatMap(g=>g.payments),ok=all.filter(isApproved);$("approved").textContent=ok.length;$("amount").textContent=money(ok.reduce((n,p)=>n+Number(p.payment_amount||0),0));render();
 }catch(e){console.error(e);$("body").innerHTML=`<tr><td colspan="7" class="empty">Could not load slips: ${esc(e.message)}</td></tr>`}
}
function render(){let q=$("search").value.toLowerCase().trim(),f=$("filter").value;let list=[...groups].sort((a,b)=>new Date(b.latest.updated_at||b.latest.created_at||0)-new Date(a.latest.updated_at||a.latest.created_at||0)).filter(g=>[g.name,g.code,g.mobile,g.email,g.userId,...g.slips.map(s=>s.slip_number)].join(" ").toLowerCase().includes(q)&&(f==="all"||g.slips.some(s=>String(s.slip_status).toLowerCase()===f)));if(!list.length){$("body").innerHTML='<tr><td colspan="7" class="empty">No slips found.</td></tr>';return}
 $("body").innerHTML=list.map(g=>`<tr><td><b>${esc(g.name)}</b><div class="muted">${esc(g.email)}</div></td><td>${esc(g.code)}</td><td>${esc(g.mobile)}<div class="muted">${esc(g.email)}</div></td><td>${g.slips.length}</td><td><b>${money(g.paid)}</b></td><td>${esc(g.latest.slip_number)}<div class="muted">${dt(g.latest.updated_at||g.latest.created_at)}</div></td><td><button class="blue" data-view="${esc(g.key)}">View All Slips</button></td></tr>`).join("")}
function item(k,v){return `<div class="item"><div class="label">${esc(k)}</div><div class="value">${esc(v)}</div></div>`}
function historyTable(s){let h=s._history||[];if(!h.length)return'<p class="muted">No payment / repayment rows linked to this request.</p>';return `<table class="history"><thead><tr><th>Payment Type</th><th>Date</th><th>Amount</th><th>Status</th><th>Owner Approval</th><th>Transaction ID</th></tr></thead><tbody>${h.map(p=>`<tr><td>${esc(title(p.payment_type||"payment"))}</td><td>${esc(dt(p.payment_date||p.created_at))}</td><td>${money(p.payment_amount)}</td><td>${esc(title(p.payment_status))}</td><td>${esc(title(p.verification_status))}</td><td>${esc(val(p,["transaction_id","payment_reference"]))}</td></tr>`).join("")}</tbody></table>`}
function schemeName(snapshot){
 if(!snapshot)return "Not recorded for this request";
 const raw=snapshot.scheme_snapshot||snapshot.snapshot||{};
 return val(snapshot,["scheme_name"],val(raw,["scheme_name","name"],"Scheme name unavailable"));
}
function schemeSlabsText(snapshot){
 if(!snapshot)return "Snapshot not found for this request";
 const raw=snapshot.scheme_snapshot||snapshot.snapshot||{};
 const slabs=Array.isArray(raw.slabs)?raw.slabs:(Array.isArray(snapshot.slabs)?snapshot.slabs:[]);
 if(!slabs.length)return "Snapshot exists; slab details unavailable";
 return slabs.map(x=>`${x.min_days??"?"}–${x.max_days??"+"} days: ${money(x.extra_charge??x.amount??0)}`).join(" | ");
}
function slipHtml(s,i){let r=s._r||{},a=s._a||{},p=s._p||{},ct=val(r,["cylinder_type","lpg_type","cylinder_category"]),w=val(r,["cylinder_weight","cylinder_weight_kg","weight","cylinder_size"]);if(w!=="—"&&!String(w).toLowerCase().includes("kg"))w+=" KG";
 return `<article class="slip"><div class="sliphead"><div><h2>EGC Payment Slip</h2><div class="muted">Emergency Gas Cylinder · Slip ${i+1}</div></div><span class="pill">${esc(title(s.payment_status))}</span></div>
 <div class="section">Slip Information</div><div class="grid">${item("Slip Number",s.slip_number)}${item("Request Number",s.request_number_snapshot||r.request_number)}${item("Slip Date",dt(s.created_at))}${item("Verification Code",s.verification_code)}${item("Slip Status",title(s.slip_status))}${item("Payment Status",title(s.payment_status))}</div>
 <div class="section">Customer Details</div><div class="grid">${item("Customer Name",s.user_name||r.customer_name)}${item("Mobile Number",s.mobile||r.customer_mobile)}${item("Email Address",s._email)}${item("EGC User ID",s.user_code||r.egc_user_code)}${item("Customer Address",val(r,["address","city","district"]))}${item("Customer ID",s.user_id)}</div>
 <div class="section">LPG & Agency Details</div><div class="grid">${item("Cylinder Type",ct)}${item("Cylinder Weight",w)}${item("LPG Company",s.lpg_company||r.lpg_company)}${item("Agency Name",s.agency_name||val(a,["agency_name","name"]))}${item("Agency Code",s.agency_code||a.agency_code)}${item("Agency Mobile",s.agency_mobile||val(a,["mobile","phone"]))}${item("Quantity",s.quantity||r.quantity||1)}${item("Agency Status",title(r.agency_status))}${item("Delivery Status",title(val(r,["delivery_status"],val(s,["delivery_status"],"pending"))))}${item("Delivery Date",dt(val(r,["delivery_date","delivered_at"],val(s,["delivered_at","delivery_date"]))))}${item("Booking Number",r.booking_number)}</div>
 <div class="section">All Payments & Repayments for this Request</div>${historyTable(s)}
 <div class="section">Saved Financial Details</div><div class="grid">${item("Cylinder Amount",money(val(r,["cylinder_amount","base_amount","amount"],val(s,["cylinder_amount"],0))))}${item("Initial Payment",money(val(r,["advance_amount","initial_payment"],val(s,["initial_payment"],0))))}${item("Extra Charge",money(val(r,["charge_amount","extra_charge","extra_charge_amount"],val(s,["extra_charge","charge_amount"],0))))}${item("This Slip Payment",money(val(p,["payment_amount","amount"],val(s,["payment_amount"],0))))}${item("Total Payable",money(val(r,["total_payable","total_amount"],val(s,["total_payable","total_amount"],0))))}${item("Remaining Amount",money(val(r,["remaining_amount"],val(s,["remaining_amount"],0))))}${item("Transaction ID",p.transaction_id||p.payment_reference||s.transaction_id)}${item("Payment Method",p.payment_method||s.payment_method)}${item("Approved At",dt(p.owner_approved_at||s.approved_at))}${item("Slip Type",title(s.slip_type))}</div>
  <div class="section">Request Scheme Snapshot</div><div class="grid">${item("Scheme Name",schemeName(r.__scheme_snapshot))}${item("Scheme Slabs",schemeSlabsText(r.__scheme_snapshot))}</div><div class="note">System-generated EGC record. Keep the slip number and verification code for reference.</div></article>`}
function view(key){let g=groups.find(x=>x.key===key);if(!g)return;$("mtitle").textContent=g.name+" — All Slips";$("msub").textContent=`${g.code} · ${g.mobile} · ${g.email} · ${g.slips.length} slip(s)`;$("content").innerHTML=g.slips.map(slipHtml).join("");$("modal").classList.add("show");document.body.style.overflow="hidden"}
function closeModal(){$("modal").classList.remove("show");document.body.style.overflow=""}
$("body").addEventListener("click",e=>{let b=e.target.closest("[data-view]");if(b)view(b.dataset.view)});$("close").onclick=closeModal;$("modal").onclick=e=>{if(e.target===$("modal"))closeModal()};$("print").onclick=()=>window.print();$("refreshBtn").onclick=load;$("search").oninput=render;$("filter").onchange=render;$("closePage").onclick=()=>location.href="owner-dashboard.html";document.addEventListener("keydown",e=>{if(e.key==="Escape")closeModal()});
let realtimeReloadTimer=null;
function startRealtimeUpdates(){
 db.channel("egc-owner-all-slips-live")
  .on("postgres_changes",{event:"*",schema:"public",table:"request_slips"},()=>{
    clearTimeout(realtimeReloadTimer);realtimeReloadTimer=setTimeout(load,500);
  })
  .on("postgres_changes",{event:"*",schema:"public",table:"payments"},()=>{
    clearTimeout(realtimeReloadTimer);realtimeReloadTimer=setTimeout(load,700);
  })
  .subscribe();
}
(async()=>{if(await auth()){await load();startRealtimeUpdates()}})();
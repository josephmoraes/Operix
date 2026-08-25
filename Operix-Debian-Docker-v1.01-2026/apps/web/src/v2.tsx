import React,{useEffect,useMemo,useState}from'react';import{createRoot}from'react-dom/client';import{BarChart3,Bell,Building2,CalendarDays,Camera,CarFront,Check,ChevronDown,ChevronLeft,ChevronRight,ClipboardCheck,Clock,Download,FileSpreadsheet,FileText,FolderTree,HardHat,Headphones,Image,LayoutDashboard,Menu,MessageSquare,Package,Palette,Plus,Save,Settings,ShieldCheck,Star,Trash2,Upload,Users,Wrench,X,XCircle}from'lucide-react';import SignaturePad from'./SignaturePad';import type{Company,Material,Order,OrderStatus,Role,Screen,Sector,Ticket}from'./v2-types';import'./styles.css';import'./workflow.css';import'./management.css';import'./hotfix.css';import'./v2.css';
import AdminV3 from'./AdminV3';import SafetyV3 from'./SafetyV3';import OrdersV3 from'./OrdersV3';import{createDefaultPermissions,defaultRoles,screenCatalog,type PermissionMap}from'./permissions';
import MaintenanceV4 from'./MaintenanceV4';
import VehicleMaintenance from'./VehicleMaintenance';
import NotificationCenter from'./NotificationCenter';
import{ExportButtons}from'./data-export';
import AuthGate from'./AuthGate';
import{setActiveTenant}from'./api';
import ThemeToggle from'./ThemeToggle';
import UserAccount from'./UserAccount';
import FleetManagement from'./FleetManagement';
import OrdersHub from'./OrdersHub';
import HRV1 from'./HRV1';
import WarehouseV1,{WarehouseRequestLauncher}from'./WarehouseV1';
import TrainingHub from'./TrainingHub';
import{EpiRequestLauncher}from'./SafetyV3';
import SafetyManagement from'./SafetyManagement';
import TicketsV2 from'./TicketsV2';
import ModuleErrorBoundary from'./ModuleErrorBoundary';
import GlobalSearch from'./GlobalSearch';
import NavigationAssistant from'./NavigationAssistant';
import'./v3.css';
import'./crud-epi.css';
import'./motion.css';
import'./brand-themes.css';
import'./fleet.css';
import'./notifications.css';
import'./auth.css';
import'./theme-mode.css';
import'./dark-contrast.css';
import'./order-detail.css';
import'./order-detail-fix.css';
import'./profile.css';
import'./fleet-routes.css';
import'./operations-modules.css';
import'./orders-hub.css';
import'./safety-management.css';
import'./ux-fixes.css';
import'./workflow-refinement.css';
import'./initial-build.css';
const companies:Company[]=['Grafmarques','INFINNI','M.Print'];const roleDisplay:Partial<Record<Role,string>>={Padrao:'Padrão',Tecnico:'Técnico','Tecnico de Seguranca do Trabalho':'Técnico de Segurança do Trabalho'};const companyInitials:Record<Company,string>={'Grafmarques':'GM','INFINNI':'IN','M.Print':'MP'};const loadCompanyLogos=():Record<Company,string>=>({
 'Grafmarques':'',
 'INFINNI':'',
 'M.Print':''
 });const initialSectors:Record<Company,string[]>={'Grafmarques':[],'INFINNI':[],'M.Print':[]};const services=['Limpeza','Preventiva','Troca de equipamento','Substituicao'];const checklistItems:Record<string,string[]>={'Inspecao mecanica':['Protecoes instaladas','Lubrificacao conferida','Teste sem carga realizado'],'Seguranca eletrica':['Equipamento desenergizado','Aterramento verificado','Quadro identificado'],'Entrega de TI':['Equipamento testado','Usuario orientado','Patrimonio registrado']};const allowedDash=(r:Role)=>['Gerente','Coordenador','Diretor','Administrador'].includes(r),allowedReview=(r:Role)=>['Gerente','Coordenador','Administrador'].includes(r),technical=(r:Role)=>r!=='Padrao';const currentAccount=()=>{try{return JSON.parse(sessionStorage.getItem('operix.auth.user')||'{}')as{name?:string;role?:Role;company?:Company}}catch{return{}}};const loadRoles=():Role[]=>{try{const saved=JSON.parse(localStorage.getItem('operix.roles')||'[]')as Role[];if(saved.length)return saved}catch{}return defaultRoles};const loadPermissions=():PermissionMap=>{try{const saved=JSON.parse(localStorage.getItem('operix.permissions')||'null')as PermissionMap;if(saved)return saved}catch{}return createDefaultPermissions()};
companies.forEach(company=>{try{initialSectors[company]=(JSON.parse(localStorage.getItem(`operix.sectors.${company}`)||'[]')as {name?:string}[]).map(item=>item.name||'').filter(Boolean)}catch{initialSectors[company]=[]}});
const currentSectors=(company:Company)=>{try{return(JSON.parse(localStorage.getItem(`operix.sectors.${company}`)||'[]')as {name?:string}[]).map(item=>item.name||'').filter(Boolean)}catch{return[]}};
const seedTickets:Ticket[]=[];
const seedOrders:Order[]=[];

function switchCompany(
 next:Company,
 setter:(company:Company)=>void
){
 try{
  const memberships=JSON.parse(
   sessionStorage.getItem('operix.memberships')||'[]'
  )as{
   tenantId:string;
   tenantName:string;
   role:string;
   sectorId:string|null;
  }[];

  const membership=memberships.find(
   item=>item.tenantName===next
  );

  if(!membership){
   console.error(
    'Usuário sem membership para a empresa:',
    next
   );
   return;
  }

  setActiveTenant(
   membership.tenantId,
   membership.tenantName,
   membership.role,
   membership.sectorId
  );

  setter(next);

 }catch(error){
  console.error(
   'Erro ao trocar empresa ativa:',
   error
  );
 }
}

function toast(message:string){let b=document.getElementById('v2-toast');if(!b){b=document.createElement('div');b.id='v2-toast';b.className='toast-inline';document.body.appendChild(b)}b.textContent=message;b.style.display='flex';setTimeout(()=>b!.style.display='none',2500)}
function Modal({title,close,children,wide=false}:{title:string;close:()=>void;children:React.ReactNode;wide?:boolean}){return <div className="overlay v2-overlay" onMouseDown={e=>{if(e.target===e.currentTarget)close()}}><div className={'modal v2-modal '+(wide?'wide-modal':'')}><div><h2>{title}</h2><button onClick={close}><X/></button></div>{children}</div></div>}
function Photo({label,value,onChange}:{label:string;value:string;onChange:(v:string)=>void}){return <label className="photo-field"><input type="file" accept="image/*" onChange={e=>{const f=e.target.files?.[0];if(f)onChange(URL.createObjectURL(f))}}/>{value?<img src={value}/>:<><Camera/><b>{label}</b><small>Selecionar imagem</small></>}</label>}
function Nav({screen,go,role,permissions,collapsed,setCollapsed}:{screen:Screen;go:(s:Screen)=>void;role:Role;permissions:PermissionMap;collapsed:boolean;setCollapsed:(v:boolean)=>void}){
 const[systemMedia,setSystemMedia]=useState(localStorage.getItem('operix.system.media')||'');
 useEffect(()=>{const refresh=()=>setSystemMedia(localStorage.getItem('operix.system.media')||'');window.addEventListener('operix-system-media',refresh);return()=>window.removeEventListener('operix-system-media',refresh)},[]);
 const links:[Screen,string,any][]=[['dashboard','Visão geral',LayoutDashboard],['tickets','Chamados',Headphones],['orders','Ordens de serviço',ClipboardCheck],['maintenance','Gestão de Manutenção',Wrench],['it','Gestão de TI',Headphones],['fleet','Gestão de frota',CarFront],['safety','Gestão de Segurança do Trabalho',HardHat],['hr','Gestão de RH',Users],['warehouse','Gestão de almoxarifado',Package],['training','Treinamentos e Informativos',FileText],['admin','Administração',Settings]];
 return <aside><div className="brand"><span className={systemMedia?'has-system-media':''}>{systemMedia?(systemMedia.startsWith('data:video')?<video src={systemMedia} autoPlay loop muted playsInline/>:<img src={systemMedia} alt="Logo do sistema"/>):'O'}</span><div>OPERIX<small>Gestão operacional</small></div></div><nav>{links.filter(([id])=>permissions[role]?.[id]?.view).map(([id,label,Icon])=><a href="#" title={label} className={screen===id?'active':''} onClick={e=>{e.preventDefault();go(id)}} key={id}><Icon/><span>{label}</span></a>)}</nav><button className="collapse-nav" onClick={()=>setCollapsed(!collapsed)}>{collapsed?<ChevronRight/>:<><ChevronLeft/><span>Recolher menu</span></>}</button><div className="secure"><ShieldCheck/><div><strong>Ambiente protegido</strong><small>Acesso controlado por grupo</small></div></div></aside>
}
function Layout({company,setCompany,companyLogos,role,permissions,screen,go,children,systemName,collapsed,setCollapsed}:{company:Company;setCompany:(c:Company)=>void;companyLogos:Record<Company,string>;role:Role;permissions:PermissionMap;screen:Screen;go:(s:Screen)=>void;children:React.ReactNode;systemName:string;collapsed:boolean;setCollapsed:(v:boolean)=>void}){const theme=`theme-${company.toLowerCase().replace(/[^a-z]/g,'')}`,logo=companyLogos[company],allowedScreens=screenCatalog.map(item=>item.id).filter(id=>permissions[role]?.[id]?.view) as Screen[];return <div className={`shell ${theme} ${collapsed?'nav-collapsed':''}`}><Nav screen={screen} go={go} role={role} permissions={permissions} collapsed={collapsed} setCollapsed={setCollapsed}/><main><header><div className={'company-logo '+(logo?'has-image':'')}>{logo?<img src={logo} alt={`Logo ${company}`}/>:companyInitials[company]}</div><div className="company"><small>EMPRESA ATIVA</small><select value={company} onChange={e=>switchCompany(e.target.value as Company,setCompany)}>{companies.map(c=><option key={c}>{c}</option>)}</select><ChevronDown/></div><GlobalSearch onNavigate={go}/><NavigationAssistant allowedScreens={allowedScreens} onNavigate={go}/><div className="system-title">{systemName}</div><div className="role-switch"><small>TIPO DE USUÁRIO</small><div className="role-value">{roleDisplay[role]||role}</div></div><div className="header-tools"><ThemeToggle/><NotificationCenter/></div><UserAccount/></header>{children}</main></div>}
function Dashboard({role,orders,go}:{role:Role;orders:Order[];go:(s:Screen)=>void}){if(!allowedDash(role))return <section className="content"><div className="welcome"><div><span>INÍCIO</span><h1>Bem-vindo ao Operix.</h1><p>Nenhum informativo ou treinamento foi publicado para você.</p></div></div></section>;const groups:[string,Order[]][]=[['Abertas',orders.filter(o=>o.status==='Aberta')],['Em andamento',orders.filter(o=>o.status==='Em andamento')],['Finalizadas',orders.filter(o=>o.status==='Finalizada')],['Canceladas',orders.filter(o=>o.status==='Cancelada')]],ratings=['Excelente','Bom','Regular','Ruim','Péssimo'],total=orders.length;return <section className="content"><div className="page-title"><div><span>PAINEL GERENCIAL</span><h1>Visão geral</h1><p>Indicadores operacionais da empresa ativa.</p></div><ExportButtons title="Visão geral das ordens de serviço" columns={[{key:'situação',label:'Situação'},{key:'quantidade',label:'Quantidade'}]} rows={groups.map(([name,items])=>({situação:name,quantidade:items.length}))}/></div><div className="metric-grid">{groups.map(([name,items])=><article onClick={()=>go('orders')} key={name}><small>ORDENS DE SERVIÇO</small><b>{items.length}</b><span>{name}</span></article>)}</div><div className="charts-grid"><article className="panel"><h2>Percentual por situação</h2>{total?<div className="chart-legend">{groups.map(([name,items])=><span key={name}><i className="ok"/>{name} {Math.round(items.length/total*100)}%</span>)}</div>:<div className="empty-list">Nenhuma ordem de serviço cadastrada.</div>}</article><article className="panel"><h2>Avaliações</h2>{ratings.map(rating=><button className="rating-line" key={rating} onClick={()=>go('reviews')}><span>{rating}</span><div><i style={{width:`${total?orders.filter(order=>order.rating===rating).length/total*100:0}%`}}/></div><b>{orders.filter(order=>order.rating===rating).length}</b></button>)}</article></div><div className="dash-lower schedules"><article className="panel"><h2>Próximas manutenções</h2><div className="empty-list">Nenhum cronograma cadastrado.</div></article><article className="panel overdue-list"><h2>Cronogramas atrasados</h2><div className="empty-list">Nenhum cronograma cadastrado.</div></article></div></section>}
function TicketForm({company,sectors,save,cancel}:{company:Company;sectors:string[];save:(t:Ticket)=>void;cancel:()=>void}){const[team,setTeam]=useState<'MANUTENCAO'|'T.I.'>('MANUTENCAO'),[sector,setSector]=useState(''),[request,setRequest]=useState(''),[signature,setSignature]=useState(''),[confirmed,setConfirmed]=useState(false),[error,setError]=useState('');return <section className="content page-enter"><div className="page-title"><div><span>NOVO CHAMADO</span><h1>Enviar solicitacao</h1></div></div><form className="workflow-form" onSubmit={e=>{e.preventDefault();if(!sector||request.length<10||!signature||!confirmed){setError('Informe setor, descreva a solicitacao, desenhe e confirme a assinatura.');return}save({id:'CH-'+Date.now().toString().slice(-5),company,team,sector,request,requester:currentAccount().name||'Usuário',extension:'214',status:'Novo',createdAt:new Date().toLocaleString('pt-BR'),signature})}}>{error&&<div className="form-alert">{error}</div>}<div className="team-choice"><button type="button" className={team==='MANUTENCAO'?'selected':''} onClick={()=>setTeam('MANUTENCAO')}><Wrench/><b>MANUTENCAO</b></button><button type="button" className={team==='T.I.'?'selected':''} onClick={()=>setTeam('T.I.')}><Headphones/><b>T.I.</b></button></div><div className="form-grid"><label>Setor<select value={sector} onChange={e=>setSector(e.target.value)}><option value="">Selecione</option>{sectors.map(s=><option key={s}>{s}</option>)}</select></label><label>Solicitacao<textarea value={request} onChange={e=>setRequest(e.target.value)} placeholder="Descreva o problema ou servico necessario."/></label><label>Assinatura do solicitante<SignaturePad value={signature} confirmed={confirmed} onChange={setSignature} onConfirmedChange={setConfirmed} label="assinatura do solicitante"/></label></div><div className="form-actions"><button type="button" onClick={cancel}>Cancelar</button><button className="primary" disabled={!signature||!confirmed}><Check/>Enviar solicitacao</button></div></form></section>}
function Tickets({tickets,role,newTicket,approve}:{tickets:Ticket[];role:Role;newTicket:()=>void;approve:(t:Ticket)=>void}){const[selected,setSelected]=useState<Ticket|undefined>(tickets[0]);return <section className="content"><div className="page-title"><div><span>CHAMADOS</span><h1>{technical(role)?'Fila técnica':'Meus chamados'}</h1><p>Solicitações da empresa ativa.</p></div><div className="page-title-actions"><ExportButtons title="Solicitações" columns={[{key:'codigo',label:'Código'},{key:'equipe',label:'Equipe'},{key:'setor',label:'Setor'},{key:'solicitacao',label:'Solicitação'},{key:'solicitante',label:'Solicitante'},{key:'situacao',label:'Situação'},{key:'abertura',label:'Abertura'}]} rows={tickets.map(ticket=>({codigo:ticket.id,equipe:ticket.team,setor:ticket.sector,solicitacao:ticket.request,solicitante:ticket.requester,situacao:ticket.status,abertura:ticket.createdAt}))}/><button className="primary" onClick={newTicket}><Plus/>Abrir chamado</button></div></div><div className="queue-layout"><article className="panel queue">{tickets.map(t=><button className={selected?.id===t.id?'selected':''} onClick={()=>setSelected(t)} key={t.id}><div><b>{t.id}</b><span className={'ticket-state '+t.status.toLowerCase()}>{t.status}</span></div><strong>{t.request}</strong><small>{t.team} - {t.sector}</small></button>)}</article>{selected&&<article className="panel detail-panel"><div className="detail-top"><div><span>{selected.id}</span><h2>{selected.team}</h2></div><span className="ticket-state novo">{selected.status}</span></div><dl><div><dt>Setor</dt><dd>{selected.sector}</dd></div><div><dt>Solicitante</dt><dd>{selected.requester}</dd></div><div><dt>Abertura</dt><dd>{selected.createdAt}</dd></div><div className="full-detail"><dt>Solicitação</dt><dd>{selected.request}</dd></div></dl>{technical(role)&&selected.status==='Novo'&&<div className="decision-actions"><button className="deny-btn" onClick={()=>toast('Chamado negado com justificativa registrada.')}><XCircle/>Negar</button><button className="primary" onClick={()=>approve(selected)}><Check/>Aprovar e criar OS</button></div>}</article>}</div></section>}
function Orders({orders,role,update}:{orders:Order[];role:Role;update:(o:Order)=>void}){const[statuses,setStatuses]=useState<OrderStatus[]>(['Aberta','Em andamento','Aguardando avaliacao','Finalizada','Cancelada']),[selectedId,setSelectedId]=useState(sessionStorage.getItem('selected-order')||orders[0]?.id),[error,setError]=useState('');const selected=orders.find(o=>o.id===selectedId),visible=orders.filter(o=>statuses.includes(o.status));const patch=(data:Partial<Order>)=>selected&&update({...selected,...data}),toggle=(s:OrderStatus)=>setStatuses(v=>v.includes(s)?v.filter(x=>x!==s):[...v,s]);return <section className="content"><div className="page-title"><div><span>ORDENS DE SERVICO</span><h1>Acompanhamento e execucao</h1></div></div><div className="status-checkboxes">{(['Aberta','Em andamento','Aguardando avaliacao','Finalizada','Cancelada']as OrderStatus[]).map(s=><label key={s}><input type="checkbox" checked={statuses.includes(s)} onChange={()=>toggle(s)}/>{s}</label>)}</div><div className="orders-layout"><article className="panel order-list">{visible.map(o=><button className={selected?.id===o.id?'selected':''} onClick={()=>setSelectedId(o.id)} key={o.id}><div><b>{o.id}</b><span className="order-state">{o.status}</span></div><strong>{o.request}</strong><small>{o.openedAt}</small></button>)}</article>{selected&&<article className="panel order-form"><div className="order-heading"><div><span>{selected.id}</span><h2>{selected.request}</h2><p>{selected.sector} - {selected.status}</p></div></div>{error&&<div className="form-alert">{error}</div>}<div className="form-grid three"><label>Prioridade<select value={selected.priority} onChange={e=>patch({priority:e.target.value})}><option value="">Selecione</option><option>Normal</option><option>Alta</option><option>Critica</option></select></label><label>Tipo de servico<select value={selected.serviceType} onChange={e=>patch({serviceType:e.target.value})}><option value="">Selecione</option>{services.map(s=><option key={s}>{s}</option>)}</select></label><label>Inicio<input type="datetime-local" value={selected.startedAt} onChange={e=>patch({startedAt:e.target.value})}/></label><label>Lider<input value={selected.lead} onChange={e=>patch({lead:e.target.value})}/></label><label>Tecnico<input value={selected.technician} onChange={e=>patch({technician:e.target.value})}/></label><label>Checklist<select value={selected.checklist} onChange={e=>patch({checklist:e.target.value,checkAnswers:{}})}><option value="">Sem checklist</option>{Object.keys(checklistItems).map(x=><option key={x}>{x}</option>)}</select></label><label className="wide">Servico realizado<textarea value={selected.workDone} onChange={e=>patch({workDone:e.target.value})}/></label></div>{selected.checklist&&<div className="checklist-box"><h3>{selected.checklist}</h3>{checklistItems[selected.checklist].map(item=><label key={item}><input type="checkbox" checked={!!selected.checkAnswers[item]} onChange={e=>patch({checkAnswers:{...selected.checkAnswers,[item]:e.target.checked}})}/>{item}</label>)}</div>}<Materials value={selected.materials} onChange={materials=>patch({materials})}/><div className="photo-grid"><Photo label="Foto inicial" value={selected.beforePhoto} onChange={v=>patch({beforePhoto:v})}/><Photo label="Foto final" value={selected.afterPhoto} onChange={v=>patch({afterPhoto:v})}/></div><label className="signature-label">Assinatura tecnica<SignaturePad value={selected.technicianSignature} onChange={v=>patch({technicianSignature:v})}/></label><div className="form-actions"><button onClick={()=>patch({status:'Em andamento'})}>Salvar andamento</button><button className="primary" disabled={selected.status==='Aguardando avaliacao'||selected.status==='Finalizada'} onClick={()=>{const checklistOk=!selected.checklist||checklistItems[selected.checklist].every(x=>selected.checkAnswers[x]);if(!selected.serviceType||!selected.startedAt||selected.workDone.length<5||!selected.technicianSignature||!checklistOk){setError('Preencha tipo, inicio, servico, assinatura e todo o checklist selecionado.');return}setError('');patch({status:'Aguardando avaliacao',closedAt:new Date().toLocaleString('pt-BR')});toast('OS finalizada e enviada ao solicitante para assinatura e avaliacao.')}}><Clock/>Finalizar servico</button></div></article>}</div></section>}
function Materials({value,onChange}:{value:Material[];onChange:(v:Material[])=>void}){const add=(kind:Material['kind'])=>onChange([...value,{kind,description:'',quantity:1}]);return <div className="materials-box"><div><h3>Pecas, almoxarifado e compras</h3><p>Opcional - nao impede a finalizacao.</p><button onClick={()=>add('ALMOXARIFADO')}><Package/>Item do almoxarifado</button><button onClick={()=>add('COMPRA')}><Plus/>Compra realizada</button></div>{value.map((m,i)=><div className="material-row" key={i}><span>{m.kind==='ALMOXARIFADO'?'Estoque':'Compra'}</span><input value={m.description} onChange={e=>onChange(value.map((x,n)=>n===i?{...x,description:e.target.value}:x))} placeholder="Descricao do item"/><input type="number" min="1" value={m.quantity} onChange={e=>onChange(value.map((x,n)=>n===i?{...x,quantity:Number(e.target.value)}:x))}/><button onClick={()=>onChange(value.filter((_,n)=>n!==i))}><Trash2/></button></div>)}</div>}
function Maintenance({orders,sectors}:{orders:Order[];sectors:string[]}){const[tab,setTab]=useState<'orders'|'schedule'|'checklists'>('orders'),[modal,setModal]=useState<'schedule'|'checklist'|null>(null),[schedules,setSchedules]=useState(['CNC 03 - 23/08/2026 - Preventiva','Compressor - 25/08/2026 - Limpeza']),[checks,setChecks]=useState(Object.keys(checklistItems)),[from,setFrom]=useState(''),[to,setTo]=useState('');return <section className="content"><div className="page-title"><div><span>MANUTENCAO</span><h1>Gestao da manutencao</h1></div>{tab==='schedule'&&<button className="primary" onClick={()=>setModal('schedule')}><Plus/>Novo cronograma</button>}{tab==='checklists'&&<button className="primary" onClick={()=>setModal('checklist')}><Plus/>Novo checklist</button>}</div><div className="management-tabs"><button className={tab==='orders'?'active':''} onClick={()=>setTab('orders')}>Ordens de servico</button><button className={tab==='schedule'?'active':''} onClick={()=>setTab('schedule')}>Cronograma preventivo</button><button className={tab==='checklists'?'active':''} onClick={()=>setTab('checklists')}>Checklists</button></div>{tab==='orders'&&<><div className="date-filters"><label>Abertura a partir de<input type="date" value={from} onChange={e=>setFrom(e.target.value)}/></label><label>Fechamento ate<input type="date" value={to} onChange={e=>setTo(e.target.value)}/></label></div><div className="maintenance-list">{orders.map(o=><article className="panel" key={o.id}><b>{o.id}</b><span>{o.status}</span><h3>{o.request}</h3><small>Abertura: {o.openedAt} | Fechamento: {o.closedAt||'-'}</small></article>)}</div></>}{tab==='schedule'&&<div className="maintenance-list">{schedules.map(x=><article className="panel" key={x}><CalendarDays/><h3>{x}</h3></article>)}</div>}{tab==='checklists'&&<div className="maintenance-list">{checks.map(x=><article className="panel" key={x}><ClipboardCheck/><h3>{x}</h3><small>{checklistItems[x]?.length||0} itens</small></article>)}</div>}{modal==='schedule'&&<Modal title="Novo cronograma preventivo" close={()=>setModal(null)}><form onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);setSchedules(v=>[...v,`${f.get('target')} - ${f.get('date')} - ${f.get('service')}`]);setModal(null);toast('Cronograma cadastrado.')}} className="modal-form"><label>Setor/equipamento<select name="target">{sectors.map(s=><option>{s}</option>)}<option>CNC 03</option><option>Plotter 01</option></select></label><label>Data<input name="date" type="date" required/></label><label>Tipo de servico<select name="service">{services.map(s=><option>{s}</option>)}</select></label><label>Prioridade<select><option>Normal</option><option>Alta</option><option>Critica</option></select></label><label>Checklist<select><option>Sem checklist</option>{checks.map(c=><option>{c}</option>)}</select></label><button className="primary">Salvar cronograma</button></form></Modal>}{modal==='checklist'&&<Modal title="Criar checklist" close={()=>setModal(null)}><form onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget),name=String(f.get('name'));if(name)setChecks(v=>[...v,name]);setModal(null);toast('Checklist cadastrado.')}} className="modal-form"><label>Nome<input name="name" required/></label><label>Itens do checklist<textarea name="items" placeholder="Um item por linha" required/></label><button className="primary">Salvar checklist</button></form></Modal>}</section>}
function Safety(){const[modal,setModal]=useState<'epi'|'training'|'info'|null>(null),[records,setRecords]=useState<string[]>([]);const save=(label:string,e:React.FormEvent<HTMLFormElement>)=>{e.preventDefault();setRecords(v=>[...v,label]);setModal(null);toast(`${label} salvo.`)};return <section className="content"><div className="page-title"><div><span>SEGURANCA DO TRABALHO</span><h1>EPI, treinamentos e informativos</h1></div></div><div className="safety-grid"><article className="panel"><HardHat/><h2>Solicitacao de EPI</h2><p>Fluxo guiado baseado no sistema anterior.</p><button className="primary" onClick={()=>setModal('epi')}>Abrir painel de EPI</button></article><article className="panel"><Users/><h2>Treinamentos</h2><p>Videos, slides e textos em PDF.</p><button onClick={()=>setModal('training')}>Adicionar treinamento</button></article><article className="panel"><MessageSquare/><h2>Informativos</h2><p>Videos, textos e PDFs.</p><button onClick={()=>setModal('info')}>Novo informativo</button></article></div><div className="registry-list safety-records">{records.map(x=><div key={x}><span>{x}</span></div>)}</div>{modal==='epi'&&<Modal title="Solicitar EPI" close={()=>setModal(null)}><form className="modal-form" onSubmit={e=>save('Solicitacao de EPI',e)}><label>Tipo de solicitacao<select><option>Primeiro fornecimento</option><option>Reposicao por desgaste</option><option>Reposicao por dano</option></select></label><label>EPI<select><option>Capacete de seguranca</option><option>Oculos de protecao</option><option>Luva de protecao</option><option>Botina de seguranca</option></select></label><label>Quantidade<input type="number" min="1" defaultValue="1"/></label><label>Motivo<textarea required/></label><button className="primary">Enviar solicitacao de EPI</button></form></Modal>}{modal==='training'&&<Modal title="Adicionar treinamento" close={()=>setModal(null)}><form className="modal-form" onSubmit={e=>save('Treinamento cadastrado',e)}><label>Titulo<input required/></label><label>Formato<select><option>Video</option><option>Slides</option><option>Texto/PDF</option></select></label><label>Arquivo<input type="file" accept="video/*,.pdf,.ppt,.pptx"/></label><button className="primary">Salvar treinamento</button></form></Modal>}{modal==='info'&&<Modal title="Novo informativo" close={()=>setModal(null)}><form className="modal-form" onSubmit={e=>save('Informativo publicado',e)}><label>Titulo<input required/></label><label>Formato<select><option>Texto</option><option>Video</option><option>PDF</option></select></label><label>Conteudo<textarea required/></label><label>Arquivo<input type="file" accept="video/*,.pdf"/></label><button className="primary">Publicar informativo</button></form></Modal>}</section>}
function Reviews({orders}:{orders:Order[]}){return <section className="content"><div className="page-title"><div><span>AVALIACOES</span><h1>Qualidade dos servicos</h1></div></div><div className="metric-grid">{['Excelente','Bom','Regular','Ruim','Pessimo','Nao realizado'].map(x=><article key={x}><small>AVALIACAO</small><b>{orders.filter(o=>o.rating===x).length}</b><span>{x}</span></article>)}</div></section>}
function SectorTree({items,setItems}:{items:Sector[];setItems:(v:Sector[])=>void}){const[name,setName]=useState(''),[parent,setParent]=useState('');const branch=(node:Sector):React.ReactNode=><li key={node.id}><div><FolderTree/><b>{node.name}</b><button onClick={()=>setItems(items.filter(x=>x.id!==node.id&&x.parentId!==node.id))}><Trash2/></button></div>{items.some(x=>x.parentId===node.id)&&<ul>{items.filter(x=>x.parentId===node.id).map(branch)}</ul>}</li>;return <><div className="sector-create"><label>Novo setor<input value={name} onChange={e=>setName(e.target.value)}/></label><label>Setor Pai<select value={parent} onChange={e=>setParent(e.target.value)}><option value="">Nenhum - criar Pai</option>{items.map(x=><option value={x.id}>{x.name}</option>)}</select></label><button className="primary" onClick={()=>{if(name){setItems([...items,{id:crypto.randomUUID(),name,parentId:parent||null}]);setName('');setParent('')}}}><Plus/>Cadastrar</button></div><div className="org-tree dynamic"><ul>{items.filter(x=>x.parentId===null).map(branch)}</ul></div></>}
function Admin({company,systemName,setSystemName}:{company:Company;systemName:string;setSystemName:(v:string)=>void}){const[tab,setTab]=useState('Usuarios'),[newUser,setNewUser]=useState(false),[users,setUsers]=useState<string[]>([]),[sectors,setSectors]=useState<Sector[]>([]),[roles,setRoles]=useState(['Padrao','Tecnico','Gerente','Diretor','Administrador']),[registries,setRegistries]=useState<Record<string,string[]>>({'Empresas':['Grafmarques','INFINNI','M.Print'],'Colaboradores':[],'Prioridades':[],'Servicos':[],'Tipos de equipamento':[],'Equipamentos':[]}),[entry,setEntry]=useState(''),[globalMessage,setGlobalMessage]=useState(''),[colors,setColors]=useState({primary:'#0d9c89',text:'#17233c',background:'#f5f7fb'});const tabs=['Usuarios','Empresas','Colaboradores','Setores','Tipos de usuario','Prioridades','Servicos','Tipos de equipamento','Equipamentos','Aparencia','Mensagem global'];const addGeneric=()=>{if(entry){setRegistries(v=>({...v,[tab]:[...(v[tab]||[]),entry]}));setEntry('')}};return <section className="content"><div className="page-title"><div><span>ADMINISTRACAO - {company}</span><h1>Cadastros e configuracoes</h1></div></div><div className="admin-shell"><div className="admin-tree"><b><FolderTree/>Cadastros</b>{tabs.map(x=><button className={tab===x?'active':''} onClick={()=>{setTab(x);setNewUser(false)}} key={x}>{x}</button>)}</div><article className="panel admin-content">{tab==='Usuarios'?<>{!newUser?<><div className="content-head"><div><h2>Usuarios da empresa ativa</h2><p>{company}</p></div><button className="primary" onClick={()=>setNewUser(true)}><Plus/>Cadastrar novo usuario</button></div><div className="registry-list">{users.map((u,i)=><div key={u}><span>{u}</span><button onClick={()=>setUsers(users.filter((_,n)=>n!==i))}><Trash2/></button></div>)}</div></>:<form className="modal-form" onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);setUsers(v=>[...v,`${f.get('name')} - ${f.get('role')}`]);setNewUser(false);toast('Usuario cadastrado.')}}><h2>Novo usuario</h2><label>Nome completo<input name="name" required/></label><label>CPF<input required/></label><label>Telefone<input required/></label><label>E-mail<input type="email" required/></label><label>Empresa<input value={company} disabled/></label><label>Tipo<select name="role">{roles.map(r=><option>{r}</option>)}</select></label><label>Ramal<input required/></label><label>Foto<input type="file" accept="image/*"/></label><div className="form-actions"><button type="button" onClick={()=>setNewUser(false)}>Voltar</button><button className="primary">Salvar usuario</button></div></form>}</>:tab==='Setores'?<><h2>Setores Pai e relacionados</h2><SectorTree items={sectors} setItems={setSectors}/></>:tab==='Tipos de usuario'?<><h2>Tipos de usuario e permissoes</h2><div className="registry-create"><input value={entry} onChange={e=>setEntry(e.target.value)} placeholder="Novo tipo de usuario"/><button className="primary" onClick={()=>{if(entry){setRoles(v=>[...v,entry]);setEntry('')}}}>Adicionar</button></div><div className="registry-list">{roles.map((r,i)=><div key={r}><span>{r}</span><button disabled={r==='Administrador'} onClick={()=>setRoles(roles.filter((_,n)=>n!==i))}><Trash2/></button></div>)}</div></>:tab==='Equipamentos'?<><h2>Cadastro completo de equipamento</h2><form className="modal-form equipment-form" onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget),pat='PAT-'+String((registries.Equipamentos?.length||0)+1).padStart(4,'0');setRegistries(v=>({...v,Equipamentos:[...(v.Equipamentos||[]),`${f.get('name')} - ${pat}`]}));(e.currentTarget as HTMLFormElement).reset();toast(`Equipamento salvo com patrimonio ${pat}.`)}}><label>Nome<input name="name" required/></label><label>Tipo<select>{registries['Tipos de equipamento'].map(x=><option>{x}</option>)}</select></label><label>Data de compra<input type="date" required/></label><label>Numero de serie<input required/></label><label>Modelo<input required/></label><label>Setor<select>{sectors.map(x=><option>{x.name}</option>)}</select></label><button className="primary">Gerar patrimonio e salvar</button></form><div className="registry-list">{(registries.Equipamentos||[]).map(x=><div><span>{x}</span></div>)}</div></>:tab==='Empresas'?<><h2>Empresas e identidade</h2><form className="modal-form" onSubmit={e=>{e.preventDefault();toast('Empresa e imagens salvas.')}}><label>Nome da empresa<input defaultValue={company}/></label><label>Logo da empresa<input type="file" accept="image/*"/></label><label>Imagem de fundo da empresa<input type="file" accept="image/*"/></label><button className="primary">Salvar empresa</button></form></>:tab==='Aparencia'?<><h2>Aparencia do sistema</h2><div className="color-settings"><label>Cor principal<input type="color" value={colors.primary} onChange={e=>setColors({...colors,primary:e.target.value})}/></label><label>Cor dos textos<input type="color" value={colors.text} onChange={e=>setColors({...colors,text:e.target.value})}/></label><label>Cor de fundo<input type="color" value={colors.background} onChange={e=>setColors({...colors,background:e.target.value})}/></label><label>Nome do sistema<input value={systemName} onChange={e=>setSystemName(e.target.value)}/></label><label>Logo do sistema<input type="file" accept="image/*"/></label><button className="primary" onClick={()=>toast('Aparencia salva.')}>Salvar aparencia</button></div></>:tab==='Mensagem global'?<><h2>Mensagem global do sistema</h2><label className="message-field">Mensagem<textarea value={globalMessage} onChange={e=>setGlobalMessage(e.target.value)}/></label><button className="primary" onClick={()=>toast('Mensagem global publicada.')}>Publicar para todos</button></>:<><h2>{tab}</h2><div className="registry-create"><input value={entry} onChange={e=>setEntry(e.target.value)} placeholder={`Novo registro em ${tab}`}/><button className="primary" onClick={addGeneric}>Adicionar</button></div><div className="registry-list">{(registries[tab]||[]).map((x,i)=><div key={x+i}><span>{x}</span><button onClick={()=>setRegistries(v=>({...v,[tab]:v[tab].filter((_,n)=>n!==i)}))}><Trash2/></button></div>)}</div></>}</article></div></section>}
function App(){
 const account=currentAccount(),initialCompany=companies.includes(account.company as Company)?account.company as Company:'Grafmarques';

 const changeCompany=(next:Company)=>{
  try{
   const memberships=JSON.parse(
    sessionStorage.getItem('operix.memberships')||'[]'
   )as{
    tenantId:string;
    tenantName:string;
    role:string;
    sectorId:string|null;
   }[];

   const membership=memberships.find(
    item=>item.tenantName===next
   );

   if(!membership){
    toast('Seu usuário não possui acesso a esta empresa.');
    return;
   }

   setActiveTenant(
    membership.tenantId,
    membership.tenantName,
    membership.role,
    membership.sectorId
   );

   setCompany(next);

  }catch(error){
   console.error(error);
   toast('Não foi possível trocar a empresa ativa.');
  }
 };

const[company,setCompany]=useState<Company>(initialCompany),[companyLogos,setCompanyLogos]=useState<Record<Company,string>>(loadCompanyLogos),[role]=useState<Role>(account.role||'Administrador'),[roles,setRoles]=useState<Role[]>(loadRoles),[permissions,setPermissions]=useState<PermissionMap>(loadPermissions),[screen,setScreen]=useState<Screen>('dashboard'),[creating,setCreating]=useState(false),[collapsed,setCollapsed]=useState(false),[systemName,setSystemName]=useState(localStorage.getItem('operix.system.name')||'Operix'),[tickets,setTickets]=useState<Ticket[]>(seedTickets),[orders,setOrders]=useState<Order[]>(seedOrders);
 useEffect(()=>{
  const refreshBranding=()=>{
   void fetch('/api/branding')
    .then(response=>{
     if(!response.ok)throw new Error('Falha ao carregar branding');
     return response.json();
    })
    .then((rows:{name:string;logoData:string}[])=>{
     const next={
      'Grafmarques':'',
      'INFINNI':'',
      'M.Print':''
     }as Record<Company,string>;

     rows.forEach(row=>{
      if(companies.includes(row.name as Company)){
       next[row.name as Company]=row.logoData||'';
      }
     });

     setCompanyLogos(next);
    })
    .catch(error=>console.error(error));
  };

  refreshBranding();

  window.addEventListener(
   'operix-branding-changed',
   refreshBranding
  );

  return()=>{
   window.removeEventListener(
    'operix-branding-changed',
    refreshBranding
   );
  };
 },[]);

 useEffect(()=>localStorage.setItem('operix.roles',JSON.stringify(roles)),[roles]);useEffect(()=>localStorage.setItem('operix.permissions',JSON.stringify(permissions)),[permissions]);const saveCompanyLogo=(tenant:Company,logo:string)=>{
 setCompanyLogos(current=>({...current,[tenant]:logo}));
};
 const requesterName=account.name||'Administrador',companyTickets=tickets.filter(t=>t.company===company&&(role!=='Padrao'||t.requester===requesterName)),companyOrders=orders.filter(o=>o.company===company&&(role!=='Padrao'||o.requester===requesterName));
 const maintenanceIds=new Set(tickets.filter(t=>t.team==='MANUTENCAO').map(t=>t.id)),itIds=new Set(tickets.filter(t=>t.team==='T.I.').map(t=>t.id));
 const maintenanceOrders=companyOrders.filter(o=>maintenanceIds.has(o.ticketId)),itOrders=companyOrders.filter(o=>itIds.has(o.ticketId));
 const go=(next:Screen)=>{if(!permissions[role]?.[next]?.view){toast('Este grupo não possui permissão para acessar esta aba.');return}setCreating(false);setScreen(next)};
 const changeRole=(_next:Role)=>{};
 const approve=(ticket:Ticket)=>{const approvedAt=new Date().toLocaleString('pt-BR'),orderId='OS-'+Date.now().toString().slice(-4);setTickets(current=>current.map(item=>item.id===ticket.id?{...item,status:'Aprovado',decidedAt:approvedAt,orderId}:item));const order:Order={id:orderId,company:ticket.company,ticketId:ticket.id,sector:ticket.sector,request:ticket.request,requester:ticket.requester,status:'Aberta',openedAt:ticket.createdAt,approvedAt,priority:'',serviceType:'',startedAt:'',lead:'',technician:'',workDone:'',beforePhoto:'',afterPhoto:'',technicianSignature:'',requesterSignature:'',checklist:'',checkAnswers:{},materials:[]};setOrders(current=>[order,...current]);toast('Chamado aprovado e ordem de serviço criada.')};
 const deny=(ticket:Ticket,reason:string)=>{const decidedAt=new Date().toLocaleString('pt-BR');setTickets(current=>current.map(item=>item.id===ticket.id?{...item,status:'Negado',decidedAt,decisionReason:reason}:item));toast('Chamado negado com data, hora e justificativa registradas.')};
 const updateOrder=(order:Order)=>setOrders(current=>current.map(item=>item.id===order.id?order:item));const deleteOrder=(id:string)=>{if(role!=='Administrador')return;setOrders(current=>current.filter(item=>item.id!==id));setTickets(current=>current.map(ticket=>ticket.orderId===id?{...ticket,status:'Novo',orderId:undefined}:ticket));sessionStorage.removeItem('selected-order');toast('Ordem de serviço excluída pelo administrador.')};
 let content:React.ReactNode;
 if(creating)content=<TicketForm company={company} sectors={currentSectors(company)} cancel={()=>setCreating(false)} save={ticket=>{setTickets(current=>[ticket,...current]);setCreating(false);setScreen('tickets');toast(`Solicitação enviada para ${ticket.team}.`)}}/>;
 else if(screen==='dashboard')content=<Dashboard role={role} orders={companyOrders} go={go}/>;
 else if(screen==='tickets')content=<><div className="content request-center"><div className="request-launchers"><EpiRequestLauncher company={company}/><WarehouseRequestLauncher company={company}/></div></div><TicketsV2 tickets={companyTickets} orders={companyOrders.filter(order=>order.requester===requesterName)} newTicket={()=>permissions[role]?.tickets?.create?setCreating(true):toast('Seu tipo de usuário não possui permissão para criar chamados.')} updateOrder={updateOrder}/></>;
 else if(screen==='orders')content=<ModuleErrorBoundary name="Ordens de serviço"><OrdersHub orders={companyOrders} role={role} update={updateOrder} remove={deleteOrder}/></ModuleErrorBoundary>;
 else if(screen==='maintenance')content=<MaintenanceV4 orders={maintenanceOrders} tickets={tickets.filter(ticket=>ticket.company===company&&ticket.team==='MANUTENCAO')} sectors={currentSectors(company)} area="Manutenção" approve={approve} deny={deny} openOrder={id=>{sessionStorage.setItem('selected-order',id);go('orders')}}/>;
 else if(screen==='it')content=<MaintenanceV4 orders={itOrders} tickets={tickets.filter(ticket=>ticket.company===company&&ticket.team==='T.I.')} sectors={currentSectors(company)} area="T.I." approve={approve} deny={deny} openOrder={id=>{sessionStorage.setItem('selected-order',id);go('orders')}}/>;
 else if(screen==='fleet')content=<FleetManagement company={company}/>;
 else if(screen==='safety')content=<SafetyManagement role={role} company={company}/>;
 else if(screen==='hr')content=<HRV1 company={company}/>;
 else if(screen==='warehouse')content=<WarehouseV1 company={company} role={role}/>;
 else if(screen==='training')content=<TrainingHub company={company} role={role}/>;
 else content=<AdminV3 key={company} company={company} companyLogo={companyLogos[company]} onSaveCompanyLogo={saveCompanyLogo} systemName={systemName} setSystemName={setSystemName} roles={roles} setRoles={setRoles} permissions={permissions} setPermissions={setPermissions}/>;
 return <Layout company={company} setCompany={next=>{setCompany(next);go('dashboard')}} companyLogos={companyLogos} role={role} permissions={permissions} screen={screen} go={go} systemName={systemName} collapsed={collapsed} setCollapsed={setCollapsed}>{content}</Layout>
}
createRoot(document.getElementById('root')!).render(<AuthGate><App/></AuthGate>);

import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import pg from 'pg';
import {z} from 'zod';
import {canReadAll,newRefresh,signAccess,verifyAccess,type Session,type Role} from './auth.js';
import {canDecideTicket,canOperateWorkOrder,requireFinishFields} from './workflow.js';
import {runSearch,searchQuerySchema,type SearchType} from './search.js';
import {semanticRerank,semanticSearchEnabled} from './semantic-search.js';
import {askNavigationAssistant,localNavigationAnswer,navigationScreens,type NavigationScreen} from './navigation-assistant.js';

const pool=new pg.Pool({connectionString:process.env.DATABASE_URL,max:20});
const app=express(); app.disable('x-powered-by'); app.use(helmet()); app.use(cors({origin:process.env.APP_ORIGIN,credentials:true})); app.use(express.json({limit:'1mb'}));
const attempts=new Map<string,{count:number;until:number}>();
const loginSchema=z.object({email:z.string().email(),password:z.string().min(8)});

async function auth(req:any,res:any,next:any){try{const value=req.headers.authorization;if(!value?.startsWith('Bearer ')) return res.status(401).json({error:'Autenticacao necessaria'}); req.session=await verifyAccess(value.slice(7));next();}catch{return res.status(401).json({error:'Sessao invalida ou expirada'});}}
function tenant(req:any,res:any,next:any){const wanted=String(req.headers['x-tenant-id']??req.session.tenantId);const membership=req.session.memberships.find((m:any)=>m.tenantId===wanted);if(!membership)return res.status(403).json({error:'Empresa fora do seu escopo'});req.scope={...membership,tenantId:wanted};next();}
function technical(req:any,res:any,next:any){if(!canDecideTicket(req.scope.role as Role))return res.status(403).json({error:'Acao exclusiva da equipe tecnica'});next();}
function adminOnly(req:any,res:any,next:any){
  if(!['ADMIN','SUPER_ADMIN'].includes(String(req.scope.role)))
    return res.status(403).json({error:'Acesso exclusivo da administracao'});
  next();
}

async function scoped<T>(tenantId:string,fn:(c:pg.PoolClient)=>Promise<T>){const c=await pool.connect();try{await c.query('BEGIN');await c.query("SELECT set_config('app.tenant_id',$1,true)",[tenantId]);const out=await fn(c);await c.query('COMMIT');return out;}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}}

app.get('/api/health',async(_req,res)=>{await pool.query('SELECT 1');res.json({status:'ok'});});
app.post('/api/auth/login',async(req,res)=>{const parsed=loginSchema.safeParse(req.body);if(!parsed.success)return res.status(400).json({error:'Dados de acesso invalidos'});const key=req.ip+parsed.data.email.toLowerCase();const state=attempts.get(key);if(state&&state.until>Date.now())return res.status(429).json({error:'Muitas tentativas. Aguarde alguns minutos.'});const q=await pool.query(`SELECT u.id,u.password_hash,u.must_change_password,p.full_name FROM users u JOIN people p ON p.id=u.person_id WHERE lower(u.email)=lower($1) AND u.active`,[parsed.data.email]);const user=q.rows[0];const ok=user&&(await pool.query('SELECT crypt($1,$2)=$2 ok',[parsed.data.password,user.password_hash])).rows[0].ok;if(!ok){const count=(state?.count??0)+1;attempts.set(key,{count,until:count>=5?Date.now()+15*60_000:0});return res.status(401).json({error:'E-mail ou senha incorretos'});}attempts.delete(key);const ms=await pool.query(`SELECT m.tenant_id "tenantId",t.name "tenantName",m.role,m.sector_id "sectorId" FROM memberships m JOIN tenants t ON t.id=m.tenant_id WHERE m.user_id=$1 AND m.active AND t.active ORDER BY t.name`,[user.id]);const first=ms.rows[0];const session:Session={sub:user.id,tenantId:first.tenantId,role:first.role,sectorId:first.sectorId,memberships:ms.rows};const accessToken=await signAccess(session);const refresh=newRefresh();await pool.query(`INSERT INTO refresh_tokens(user_id,token_hash,expires_at) VALUES($1,$2,now()+interval '7 days')`,[user.id,refresh.hash]);await pool.query(`INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id,ip) VALUES($1,'LOGIN','USER',$2,$3)`,[user.id,user.id,req.ip]);res.json({accessToken,refreshToken:refresh.raw,user:{name:user.full_name,mustChangePassword:user.must_change_password},memberships:ms.rows});});
app.get('/api/dashboard',auth,tenant,async(req:any,res)=>{const s=req.scope;const data=await scoped(s.tenantId,async c=>{const visibility=canReadAll(s.role as Role)?'TRUE':'requester_id=(SELECT person_id FROM users WHERE id=$2)';const [counts,recent]=await Promise.all([c.query(`SELECT count(*) FILTER(WHERE status NOT IN ('CLOSED','CANCELLED'))::int open,count(*) FILTER(WHERE status='IN_PROGRESS')::int in_progress,count(*) FILTER(WHERE due_at<now() AND status NOT IN ('RESOLVED','CLOSED','CANCELLED'))::int overdue FROM tickets WHERE tenant_id=$1 AND ${visibility}`,[s.tenantId,req.session.sub]),c.query(`SELECT number,title,status,requested_at FROM tickets WHERE tenant_id=$1 AND ${visibility} ORDER BY requested_at DESC LIMIT 6`,[s.tenantId,req.session.sub])]);const assets=await c.query(`SELECT count(*)::int total FROM assets WHERE tenant_id=$1 AND status='ACTIVE'`,[s.tenantId]);return {tickets:counts.rows[0],assets:assets.rows[0].total,recent:recent.rows};});res.json(data);});
app.get('/api/sectors',auth,tenant,async(req:any,res)=>{const rows=await scoped(req.scope.tenantId,async c=>(await c.query('SELECT id,name FROM sectors WHERE tenant_id=$1 AND active ORDER BY name',[req.scope.tenantId])).rows);res.json(rows);});
app.get('/api/search',auth,tenant,async(req:any,res)=>{
  const parsed=searchQuerySchema.safeParse(req.query);
  if(!parsed.success)return res.status(400).json({error:'Informe uma busca com pelo menos 2 caracteres e tipos validos'});
  const startedAt=Date.now();
  const searchInput={
    tenantId:req.scope.tenantId,
    userId:req.session.sub,
    role:req.scope.role as Role,
    query:parsed.data.q,
    limit:parsed.data.limit,
    types:parsed.data.types as SearchType[]
  };
  let mode:'local'|'hybrid-ai'='local';
  let results;
  if(semanticSearchEnabled()){
    try{
      const candidates=await scoped(req.scope.tenantId,c=>runSearch(c,{
        ...searchInput,
        limit:Math.min(150,Math.max(60,parsed.data.limit*6)),
        includeWeakMatches:true
      }));
      results=await semanticRerank(parsed.data.q,candidates,parsed.data.limit);
      mode='hybrid-ai';
    }catch(error){
      console.warn('Busca semantica indisponivel; usando ranking local.',error instanceof Error?error.message:'erro desconhecido');
    }
  }
  if(!results)results=await scoped(req.scope.tenantId,c=>runSearch(c,searchInput));
  res.json({query:parsed.data.q,count:results.length,durationMs:Date.now()-startedAt,mode,results});
});
app.post('/api/assistant/navigation',auth,tenant,async(req:any,res)=>{
  const parsed=z.object({message:z.string().trim().min(3).max(500),allowedScreens:z.array(z.enum(Object.keys(navigationScreens) as [NavigationScreen,...NavigationScreen[]])).min(1).max(20)}).safeParse(req.body);
  if(!parsed.success)return res.status(400).json({error:'Explique o que você deseja fazer.'});
  try{
    res.json(await askNavigationAssistant(parsed.data.message,parsed.data.allowedScreens));
  }catch(error){
    console.warn('Assistente de navegacao indisponivel; usando orientacao local.',error instanceof Error?error.message:'erro desconhecido');
    res.json(localNavigationAnswer(parsed.data.message,parsed.data.allowedScreens));
  }
});
app.get('/api/tickets',auth,tenant,async(req:any,res)=>{const all=canReadAll(req.scope.role as Role);const rows=await scoped(req.scope.tenantId,async c=>(await c.query(`SELECT t.id,t.number,t.title,t.description,t.status,t.category,t.requested_at,t.requester_name,t.requester_extension,s.name sector_name FROM tickets t LEFT JOIN sectors s ON s.id=t.sector_id WHERE t.tenant_id=$1 AND ($3 OR t.requester_id=(SELECT person_id FROM users WHERE id=$2)) ORDER BY t.requested_at DESC`,[req.scope.tenantId,req.session.sub,all])).rows);res.json(rows);});
app.post('/api/tickets',auth,tenant,async(req:any,res)=>{const body=z.object({sectorId:z.string().uuid(),request:z.string().min(10).max(5000),requesterName:z.string().min(3).max(160),extension:z.string().min(1).max(20),signatureKey:z.string().min(8).max(500),category:z.enum(['MAINTENANCE','IT']).default('MAINTENANCE')}).safeParse(req.body);if(!body.success)return res.status(400).json({error:'Preencha setor, solicitacao, nome, ramal e assinatura'});const d=body.data;const out=await scoped(req.scope.tenantId,async c=>{const pending=(await c.query(`SELECT 1 FROM work_orders w JOIN tickets t ON t.id=w.ticket_id JOIN users u ON u.person_id=t.requester_id WHERE w.tenant_id=$1 AND u.id=$2 AND w.status='AWAITING_REQUESTER' LIMIT 1`,[req.scope.tenantId,req.session.sub])).rowCount;if(pending)throw new Error('Avalie a ordem de servico finalizada antes de abrir um novo chamado');const valid=await c.query('SELECT 1 FROM sectors WHERE id=$1 AND tenant_id=$2 AND active',[d.sectorId,req.scope.tenantId]);if(!valid.rowCount)throw new Error('Setor invalido');const row=(await c.query(`INSERT INTO tickets(tenant_id,sector_id,requester_id,category,title,description,requester_name,requester_extension,requester_signature_key) SELECT $1,$2,person_id,$3,left($4,140),$4,$5,$6,$7 FROM users WHERE id=$8 RETURNING id,number,status`,[req.scope.tenantId,d.sectorId,d.category,d.request,d.requesterName,d.extension,d.signatureKey,req.session.sub])).rows[0];await c.query(`INSERT INTO audit_logs(tenant_id,actor_user_id,action,entity_type,entity_id,details) VALUES($1,$2,'TICKET_CREATED','TICKET',$3,$4)`,[req.scope.tenantId,req.session.sub,row.id,JSON.stringify({sectorId:d.sectorId})]);return row;});res.status(201).json(out);});
app.post('/api/tickets/:id/deny',auth,tenant,technical,async(req:any,res)=>{const body=z.object({reason:z.string().min(10).max(2000),signatureKey:z.string().min(8).max(500)}).safeParse(req.body);if(!body.success)return res.status(400).json({error:'Informe a justificativa e assine a decisao'});const out=await scoped(req.scope.tenantId,async c=>{const person=(await c.query('SELECT person_id FROM users WHERE id=$1',[req.session.sub])).rows[0];const row=(await c.query(`UPDATE tickets SET status='CANCELLED',denial_reason=$1,decision_signature_key=$2,decision_at=now(),decided_by=$3 WHERE id=$4 AND tenant_id=$5 AND status IN ('NEW','TRIAGE') RETURNING id,number,status`,[body.data.reason,body.data.signatureKey,person.person_id,req.params.id,req.scope.tenantId])).rows[0];if(!row)throw new Error('Chamado nao esta disponivel para decisao');await c.query(`INSERT INTO audit_logs(tenant_id,actor_user_id,action,entity_type,entity_id,details) VALUES($1,$2,'TICKET_DENIED','TICKET',$3,$4)`,[req.scope.tenantId,req.session.sub,row.id,JSON.stringify({reason:body.data.reason})]);return row;});res.json(out);});
app.post('/api/tickets/:id/approve',auth,tenant,technical,async(req:any,res)=>{const out=await scoped(req.scope.tenantId,async c=>{const person=(await c.query('SELECT person_id FROM users WHERE id=$1',[req.session.sub])).rows[0];const ticket=(await c.query(`UPDATE tickets SET status='PLANNED',decision_at=now(),decided_by=$1 WHERE id=$2 AND tenant_id=$3 AND status IN ('NEW','TRIAGE') RETURNING id,asset_id`,[person.person_id,req.params.id,req.scope.tenantId])).rows[0];if(!ticket)throw new Error('Chamado nao esta disponivel para aprovacao');const order=(await c.query(`INSERT INTO work_orders(tenant_id,ticket_id,asset_id,kind,status) VALUES($1,$2,$3,'CORRECTIVE','OPEN') RETURNING id,number,status`,[req.scope.tenantId,ticket.id,ticket.asset_id])).rows[0];await c.query(`INSERT INTO audit_logs(tenant_id,actor_user_id,action,entity_type,entity_id,details) VALUES($1,$2,'TICKET_APPROVED','WORK_ORDER',$3,$4)`,[req.scope.tenantId,req.session.sub,order.id,JSON.stringify({ticketId:ticket.id})]);return order;});res.status(201).json(out);});
app.get('/api/work-orders',auth,tenant,technical,async(req:any,res)=>{const rows=await scoped(req.scope.tenantId,async c=>(await c.query(`SELECT w.id,w.number,w.status,w.started_at,w.finished_at,t.number ticket_number,t.description,s.name sector_name,p.name priority_name FROM work_orders w JOIN tickets t ON t.id=w.ticket_id LEFT JOIN sectors s ON s.id=t.sector_id LEFT JOIN priorities p ON p.id=w.priority_id WHERE w.tenant_id=$1 ORDER BY w.number DESC`,[req.scope.tenantId])).rows);res.json(rows);});
app.put('/api/work-orders/:id',auth,tenant,technical,async(req:any,res)=>{if(!canOperateWorkOrder(req.scope.role as Role))return res.status(403).json({error:'Sem permissao'});const body=z.object({priorityId:z.string().uuid(),leadId:z.string().uuid(),technicianId:z.string().uuid(),startedAt:z.string().datetime(),serviceDescription:z.string().min(10).max(5000),beforePhotoKey:z.string().min(4).max(500),checklistId:z.string().uuid().nullable().optional(),materials:z.array(z.object({itemId:z.string().uuid().nullable().optional(),description:z.string().min(2).max(200),source:z.enum(['STOCK','PURCHASE','OTHER']),warehouseId:z.string().uuid().nullable().optional(),quantity:z.number().positive(),unitCost:z.number().nonnegative().optional()})).max(50)}).safeParse(req.body);if(!body.success)return res.status(400).json({error:'Revise os campos da ordem de servico'});const d=body.data;const out=await scoped(req.scope.tenantId,async c=>{const row=(await c.query(`UPDATE work_orders SET priority_id=$1,lead_id=$2,technician_id=$3,started_at=$4,service_description=$5,before_photo_key=$6,checklist_id=$7,status='IN_PROGRESS' WHERE id=$8 AND tenant_id=$9 AND status IN ('OPEN','IN_PROGRESS') RETURNING id,number,status`,[d.priorityId,d.leadId,d.technicianId,d.startedAt,d.serviceDescription,d.beforePhotoKey,d.checklistId??null,req.params.id,req.scope.tenantId])).rows[0];if(!row)throw new Error('OS nao disponivel');await c.query('DELETE FROM work_order_materials WHERE work_order_id=$1',[row.id]);for(const m of d.materials)await c.query(`INSERT INTO work_order_materials(tenant_id,work_order_id,item_id,description,source,warehouse_id,quantity,unit_cost) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,[req.scope.tenantId,row.id,m.itemId??null,m.description,m.source,m.warehouseId??null,m.quantity,m.unitCost??null]);return row;});res.json(out);});
app.post('/api/work-orders/:id/finish',auth,tenant,technical,async(req:any,res)=>{const body=z.object({afterPhotoKey:z.string().min(4).max(500),technicianSignatureKey:z.string().min(8).max(500),checklistAnswers:z.record(z.string(),z.unknown()).optional()}).safeParse(req.body);if(!body.success)return res.status(400).json({error:'Foto final e assinatura tecnica sao obrigatorias'});const out=await scoped(req.scope.tenantId,async c=>{const current=(await c.query('SELECT * FROM work_orders WHERE id=$1 AND tenant_id=$2 FOR UPDATE',[req.params.id,req.scope.tenantId])).rows[0];if(!current||current.status!=='IN_PROGRESS')throw new Error('OS nao esta em execucao');if(!requireFinishFields({...current,startedAt:current.started_at,beforePhotoKey:current.before_photo_key,afterPhotoKey:body.data.afterPhotoKey,technicianSignatureKey:body.data.technicianSignatureKey,serviceDescription:current.service_description}))throw new Error('Preencha servico, inicio, fotos e assinatura');const materials=(await c.query(`SELECT * FROM work_order_materials WHERE work_order_id=$1 AND source='STOCK'`,[current.id])).rows;for(const m of materials){if(!m.item_id||!m.warehouse_id)throw new Error('Material de estoque sem item ou almoxarifado');const balance=Number((await c.query(`SELECT coalesce(sum(CASE WHEN movement_type='IN' THEN quantity ELSE -quantity END),0) balance FROM stock_movements WHERE tenant_id=$1 AND warehouse_id=$2 AND item_id=$3`,[req.scope.tenantId,m.warehouse_id,m.item_id])).rows[0].balance);if(balance<Number(m.quantity))throw new Error(`Saldo insuficiente para ${m.description}`);await c.query(`INSERT INTO stock_movements(tenant_id,warehouse_id,item_id,work_order_id,movement_type,quantity,unit_cost) VALUES($1,$2,$3,$4,'OUT',$5,$6)`,[req.scope.tenantId,m.warehouse_id,m.item_id,current.id,m.quantity,m.unit_cost]);}if(current.checklist_id)await c.query(`INSERT INTO work_order_checklist_results(tenant_id,work_order_id,checklist_id,answers,completed_by,completed_at) VALUES($1,$2,$3,$4,$5,now())`,[req.scope.tenantId,current.id,current.checklist_id,JSON.stringify(body.data.checklistAnswers??{}),current.technician_id]);const row=(await c.query(`UPDATE work_orders SET after_photo_key=$1,technician_signature_key=$2,finished_at=now(),status='AWAITING_REQUESTER',labor_minutes=greatest(1,round(extract(epoch from(now()-started_at))/60)) WHERE id=$3 RETURNING id,number,status,finished_at`,[body.data.afterPhotoKey,body.data.technicianSignatureKey,current.id])).rows[0];const requester=(await c.query(`SELECT u.id FROM tickets t JOIN users u ON u.person_id=t.requester_id WHERE t.id=$1`,[current.ticket_id])).rows[0];if(requester)await c.query(`INSERT INTO notifications(tenant_id,user_id,type,title,message,entity_type,entity_id) VALUES($1,$2,'WORK_ORDER_FINISHED','Servico finalizado',$3,'WORK_ORDER',$4)`,[req.scope.tenantId,requester.id,`A OS ${row.number} aguarda sua assinatura e avaliacao.`,current.id]);await c.query(`INSERT INTO audit_logs(tenant_id,actor_user_id,action,entity_type,entity_id) VALUES($1,$2,'WORK_ORDER_AWAITING_REQUESTER','WORK_ORDER',$3)`,[req.scope.tenantId,req.session.sub,current.id]);return row;});res.json(out);});
app.post('/api/work-orders/:id/accept',auth,tenant,async(req:any,res)=>{const body=z.object({signatureKey:z.string().min(8).max(500),rating:z.enum(['NOT_PERFORMED','EXCELLENT','GOOD','REGULAR','BAD','TERRIBLE']),feedback:z.string().min(5).max(2000)}).safeParse(req.body);if(!body.success)return res.status(400).json({error:'Assinatura, avaliacao e justificativa sao obrigatorias'});const out=await scoped(req.scope.tenantId,async c=>{const row=(await c.query(`UPDATE work_orders w SET requester_signature_key=$1,service_rating=$2,requester_feedback=$3,requester_confirmed_at=now(),status='COMPLETED' FROM tickets t,users u WHERE w.id=$4 AND w.tenant_id=$5 AND w.status='AWAITING_REQUESTER' AND t.id=w.ticket_id AND u.person_id=t.requester_id AND u.id=$6 RETURNING w.id,w.number,w.status,w.service_rating`,[body.data.signatureKey,body.data.rating,body.data.feedback,req.params.id,req.scope.tenantId,req.session.sub])).rows[0];if(!row)throw new Error('OS nao esta disponivel para sua confirmacao');await c.query(`UPDATE tickets SET status='CLOSED' WHERE id=(SELECT ticket_id FROM work_orders WHERE id=$1)`,[row.id]);await c.query(`INSERT INTO audit_logs(tenant_id,actor_user_id,action,entity_type,entity_id,details) VALUES($1,$2,'WORK_ORDER_ACCEPTED','WORK_ORDER',$3,$4)`,[req.scope.tenantId,req.session.sub,row.id,JSON.stringify({rating:body.data.rating,feedback:body.data.feedback})]);return row;});res.json(out);});
app.get('/api/reviews/dashboard',auth,tenant,technical,async(req:any,res)=>{const data=await scoped(req.scope.tenantId,async c=>(await c.query(`SELECT count(*)::int total,count(*) FILTER(WHERE service_rating IN ('EXCELLENT','GOOD'))::int positive,count(*) FILTER(WHERE service_rating='NOT_PERFORMED')::int not_performed,jsonb_object_agg(coalesce(service_rating,'UNRATED'),amount) distribution FROM (SELECT service_rating,count(*)::int amount FROM work_orders WHERE tenant_id=$1 AND requester_confirmed_at IS NOT NULL GROUP BY service_rating) x`,[req.scope.tenantId])).rows[0]);res.json(data);});


const adminRoleSchema=z.enum([
  'REQUESTER',
  'USER',
  'TECHNICIAN',
  'MANAGER',
  'DIRECTOR',
  'ADMIN',
  'SUPER_ADMIN'
]);

const adminSectorSchema=z.object({
  name:z.string().trim().min(2).max(160),
  costCenter:z.string().trim().max(100).nullable().optional(),
  parentId:z.string().uuid().nullable().optional()
});

const adminUserSchema=z.object({
  name:z.string().trim().min(3).max(160),
  document:z.string().trim().min(3).max(40),
  email:z.string().email(),
  phone:z.string().trim().max(40).nullable().optional(),
  extension:z.string().trim().max(30).nullable().optional(),
  jobTitle:z.string().trim().max(160).nullable().optional(),
  sectorId:z.string().uuid().nullable().optional(),
  role:adminRoleSchema,
  password:z.string().min(8).max(200).optional(),
  active:z.boolean().default(true)
});

app.get('/api/admin/tenants',auth,async(req:any,res)=>{
  const ids=(req.session.memberships??[]).map((m:any)=>m.tenantId);
  const rows=(await pool.query(
    `SELECT id,code,name,active
       FROM tenants
      WHERE id=ANY($1::uuid[])
      ORDER BY name`,
    [ids]
  )).rows;
  res.json(rows);
});

app.get('/api/admin/sectors',auth,tenant,adminOnly,async(req:any,res)=>{
  const rows=await scoped(req.scope.tenantId,async c=>
    (await c.query(
      `SELECT
         id,
         name,
         cost_center "costCenter",
         parent_id "parentId",
         active
       FROM sectors
       WHERE tenant_id=$1
       ORDER BY name`,
      [req.scope.tenantId]
    )).rows
  );
  res.json(rows);
});

app.post('/api/admin/sectors',auth,tenant,adminOnly,async(req:any,res)=>{
  const parsed=adminSectorSchema.safeParse(req.body);
  if(!parsed.success)
    return res.status(400).json({error:'Dados do setor invalidos'});

  const d=parsed.data;

  const row=await scoped(req.scope.tenantId,async c=>{
    if(d.parentId){
      const parent=await c.query(
        `SELECT 1 FROM sectors
          WHERE id=$1 AND tenant_id=$2 AND active`,
        [d.parentId,req.scope.tenantId]
      );
      if(!parent.rowCount)throw new Error('Setor pai invalido');
    }

    return (await c.query(
      `INSERT INTO sectors(
         tenant_id,name,cost_center,parent_id
       ) VALUES($1,$2,$3,$4)
       RETURNING
         id,
         name,
         cost_center "costCenter",
         parent_id "parentId",
         active`,
      [
        req.scope.tenantId,
        d.name,
        d.costCenter??null,
        d.parentId??null
      ]
    )).rows[0];
  });

  res.status(201).json(row);
});

app.put('/api/admin/sectors/:id',auth,tenant,adminOnly,async(req:any,res)=>{
  const parsed=adminSectorSchema.safeParse(req.body);
  if(!parsed.success)
    return res.status(400).json({error:'Dados do setor invalidos'});

  const d=parsed.data;

  if(d.parentId===req.params.id)
    return res.status(400).json({error:'Um setor nao pode ser pai dele mesmo'});

  const row=await scoped(req.scope.tenantId,async c=>{
    if(d.parentId){
      const parent=await c.query(
        `SELECT 1 FROM sectors
          WHERE id=$1 AND tenant_id=$2 AND active`,
        [d.parentId,req.scope.tenantId]
      );
      if(!parent.rowCount)throw new Error('Setor pai invalido');
    }

    return (await c.query(
      `UPDATE sectors
          SET name=$1,
              cost_center=$2,
              parent_id=$3
        WHERE id=$4 AND tenant_id=$5
        RETURNING
          id,
          name,
          cost_center "costCenter",
          parent_id "parentId",
          active`,
      [
        d.name,
        d.costCenter??null,
        d.parentId??null,
        req.params.id,
        req.scope.tenantId
      ]
    )).rows[0];
  });

  if(!row)return res.status(404).json({error:'Setor nao encontrado'});
  res.json(row);
});

app.delete('/api/admin/sectors/:id',auth,tenant,adminOnly,async(req:any,res)=>{
  const row=await scoped(req.scope.tenantId,async c=>
    (await c.query(
      `UPDATE sectors
          SET active=false
        WHERE id=$1 AND tenant_id=$2
        RETURNING id`,
      [req.params.id,req.scope.tenantId]
    )).rows[0]
  );

  if(!row)return res.status(404).json({error:'Setor nao encontrado'});
  res.json({ok:true});
});

app.get('/api/admin/users',auth,tenant,adminOnly,async(req:any,res)=>{
  const rows=await scoped(req.scope.tenantId,async c=>
    (await c.query(
      `SELECT
         p.id "personId",
         u.id "userId",
         p.full_name "name",
         p.document,
         p.email,
         p.phone,
         p.extension,
         p.job_title "jobTitle",
         p.sector_id "sectorId",
         s.name "sectorName",
         p.photo_key "photoKey",
         m.role,
         u.must_change_password "mustChangePassword",
         u.active
       FROM memberships m
       JOIN users u ON u.id=m.user_id
       JOIN people p ON p.id=u.person_id
       LEFT JOIN sectors s ON s.id=p.sector_id
       WHERE m.tenant_id=$1
         AND m.active
       ORDER BY p.full_name`,
      [req.scope.tenantId]
    )).rows
  );

  res.json(rows);
});

app.post('/api/admin/users',auth,tenant,adminOnly,async(req:any,res)=>{
  const parsed=adminUserSchema.extend({
    password:z.string().min(8).max(200)
  }).safeParse(req.body);

  if(!parsed.success)
    return res.status(400).json({
      error:'Revise nome, documento, e-mail, perfil e senha inicial'
    });

  const d=parsed.data;

  const result=await scoped(req.scope.tenantId,async c=>{
    if(d.sectorId){
      const sector=await c.query(
        `SELECT 1 FROM sectors
          WHERE id=$1 AND tenant_id=$2 AND active`,
        [d.sectorId,req.scope.tenantId]
      );
      if(!sector.rowCount)throw new Error('Setor invalido');
    }

    const person=(await c.query(
      `INSERT INTO people(
         tenant_id,
         sector_id,
         full_name,
         document,
         email,
         phone,
         extension,
         job_title
       ) VALUES($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING id`,
      [
        req.scope.tenantId,
        d.sectorId??null,
        d.name,
        d.document,
        d.email.toLowerCase(),
        d.phone??null,
        d.extension??null,
        d.jobTitle??null
      ]
    )).rows[0];

    const user=(await c.query(
      `INSERT INTO users(
         person_id,
         email,
         password_hash,
         must_change_password,
         active
       ) VALUES(
         $1,$2,crypt($3,gen_salt('bf',12)),true,$4
       )
       RETURNING id`,
      [
        person.id,
        d.email.toLowerCase(),
        d.password,
        d.active
      ]
    )).rows[0];

    await c.query(
      `INSERT INTO memberships(
         user_id,
         tenant_id,
         sector_id,
         role,
         active
       ) VALUES($1,$2,$3,$4,true)`,
      [
        user.id,
        req.scope.tenantId,
        d.sectorId??null,
        d.role
      ]
    );

    await c.query(
      `INSERT INTO audit_logs(
         tenant_id,
         actor_user_id,
         action,
         entity_type,
         entity_id,
         details
       ) VALUES($1,$2,'USER_CREATED','USER',$3,$4)`,
      [
        req.scope.tenantId,
        req.session.sub,
        user.id,
        JSON.stringify({email:d.email,role:d.role})
      ]
    );

    return {personId:person.id,userId:user.id};
  });

  res.status(201).json(result);
});

app.put('/api/admin/users/:id',auth,tenant,adminOnly,async(req:any,res)=>{
  const parsed=adminUserSchema.safeParse(req.body);

  if(!parsed.success)
    return res.status(400).json({error:'Dados do usuario invalidos'});

  const d=parsed.data;

  const result=await scoped(req.scope.tenantId,async c=>{
    const current=(await c.query(
      `SELECT u.id,p.id "personId"
       FROM users u
       JOIN people p ON p.id=u.person_id
       JOIN memberships m ON m.user_id=u.id
       WHERE u.id=$1 AND m.tenant_id=$2`,
      [req.params.id,req.scope.tenantId]
    )).rows[0];

    if(!current)return null;

    if(d.sectorId){
      const sector=await c.query(
        `SELECT 1 FROM sectors
          WHERE id=$1 AND tenant_id=$2 AND active`,
        [d.sectorId,req.scope.tenantId]
      );
      if(!sector.rowCount)throw new Error('Setor invalido');
    }

    await c.query(
      `UPDATE people
          SET sector_id=$1,
              full_name=$2,
              document=$3,
              email=$4,
              phone=$5,
              extension=$6,
              job_title=$7,
              active=$8
        WHERE id=$9`,
      [
        d.sectorId??null,
        d.name,
        d.document,
        d.email.toLowerCase(),
        d.phone??null,
        d.extension??null,
        d.jobTitle??null,
        d.active,
        current.personId
      ]
    );

    await c.query(
      `UPDATE users
          SET email=$1,
              active=$2
        WHERE id=$3`,
      [d.email.toLowerCase(),d.active,req.params.id]
    );

    if(d.password){
      await c.query(
        `UPDATE users
            SET password_hash=crypt($1,gen_salt('bf',12)),
                must_change_password=true,
                failed_attempts=0,
                locked_until=null
          WHERE id=$2`,
        [d.password,req.params.id]
      );
    }

    await c.query(
      `UPDATE memberships
          SET sector_id=$1,
              role=$2,
              active=$3
        WHERE user_id=$4 AND tenant_id=$5`,
      [
        d.sectorId??null,
        d.role,
        d.active,
        req.params.id,
        req.scope.tenantId
      ]
    );

    await c.query(
      `INSERT INTO audit_logs(
         tenant_id,
         actor_user_id,
         action,
         entity_type,
         entity_id
       ) VALUES($1,$2,'USER_UPDATED','USER',$3)`,
      [req.scope.tenantId,req.session.sub,req.params.id]
    );

    return {ok:true};
  });

  if(!result)return res.status(404).json({error:'Usuario nao encontrado'});
  res.json(result);
});

app.delete('/api/admin/users/:id',auth,tenant,adminOnly,async(req:any,res)=>{
  if(req.params.id===req.session.sub)
    return res.status(400).json({
      error:'O administrador conectado nao pode desativar a propria conta'
    });

  const result=await scoped(req.scope.tenantId,async c=>{
    const membership=(await c.query(
      `UPDATE memberships
          SET active=false
        WHERE user_id=$1 AND tenant_id=$2
        RETURNING user_id`,
      [req.params.id,req.scope.tenantId]
    )).rows[0];

    if(!membership)return null;

    const remaining=await c.query(
      `SELECT 1 FROM memberships
        WHERE user_id=$1 AND active
        LIMIT 1`,
      [req.params.id]
    );

    if(!remaining.rowCount){
      await c.query(
        `UPDATE users SET active=false WHERE id=$1`,
        [req.params.id]
      );
    }

    await c.query(
      `INSERT INTO audit_logs(
         tenant_id,
         actor_user_id,
         action,
         entity_type,
         entity_id
       ) VALUES($1,$2,'USER_DISABLED','USER',$3)`,
      [req.scope.tenantId,req.session.sub,req.params.id]
    );

    return {ok:true};
  });

  if(!result)return res.status(404).json({error:'Usuario nao encontrado'});
  res.json(result);
});

app.get('/api/admin/permissions',auth,tenant,adminOnly,async(req:any,res)=>{
  const rows=await scoped(req.scope.tenantId,async c=>
    (await c.query(
      `SELECT
         role,
         module,
         can_view "canView",
         can_create "canCreate",
         can_edit "canEdit",
         can_delete "canDelete"
       FROM role_permissions
       WHERE tenant_id=$1
       ORDER BY role,module`,
      [req.scope.tenantId]
    )).rows
  );

  res.json(rows);
});

app.put('/api/admin/permissions',auth,tenant,adminOnly,async(req:any,res)=>{
  const parsed=z.object({
    role:adminRoleSchema,
    module:z.string().min(1).max(100),
    canView:z.boolean(),
    canCreate:z.boolean(),
    canEdit:z.boolean(),
    canDelete:z.boolean()
  }).safeParse(req.body);

  if(!parsed.success)
    return res.status(400).json({error:'Permissao invalida'});

  const d=parsed.data;

  if(d.role==='SUPER_ADMIN')
    return res.status(400).json({
      error:'SUPER_ADMIN possui acesso total protegido'
    });

  await scoped(req.scope.tenantId,async c=>{
    await c.query(
      `INSERT INTO role_permissions(
         tenant_id,
         role,
         module,
         can_view,
         can_create,
         can_edit,
         can_delete
       ) VALUES($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT(tenant_id,role,module)
       DO UPDATE SET
         can_view=excluded.can_view,
         can_create=excluded.can_create,
         can_edit=excluded.can_edit,
         can_delete=excluded.can_delete`,
      [
        req.scope.tenantId,
        d.role,
        d.module,
        d.canView,
        d.canCreate,
        d.canEdit,
        d.canDelete
      ]
    );
  });

  res.json({ok:true});
});




const brandingSchema=z.object({
 logoData:z.string().max(5000000).nullable().optional(),
 backgroundData:z.string().max(10000000).nullable().optional()
});

app.get('/api/branding',async(_req,res)=>{
 const rows=(await pool.query(
  `SELECT
     t.id "tenantId",
     t.code,
     t.name,
     COALESCE(b.logo_data,'') "logoData",
     COALESCE(b.background_data,'') "backgroundData"
   FROM tenants t
   LEFT JOIN tenant_branding b
     ON b.tenant_id=t.id
   WHERE t.active
   ORDER BY t.name`
 )).rows;

 res.json(rows);
});

app.get('/api/admin/branding',auth,tenant,adminOnly,async(req:any,res)=>{
 const row=await scoped(req.scope.tenantId,async c=>
  (await c.query(
   `SELECT
      t.id "tenantId",
      t.code,
      t.name,
      COALESCE(b.logo_data,'') "logoData",
      COALESCE(b.background_data,'') "backgroundData"
    FROM tenants t
    LEFT JOIN tenant_branding b
      ON b.tenant_id=t.id
    WHERE t.id=$1`,
   [req.scope.tenantId]
  )).rows[0]
 );

 if(!row)
  return res.status(404).json({error:'Empresa nao encontrada'});

 res.json(row);
});

app.put('/api/admin/branding',auth,tenant,adminOnly,async(req:any,res)=>{
 const parsed=brandingSchema.safeParse(req.body);

 if(!parsed.success)
  return res.status(400).json({
   error:'Imagem invalida ou arquivo muito grande'
  });

 const d=parsed.data;

 const row=await scoped(req.scope.tenantId,async c=>{

  const saved=(await c.query(
   `INSERT INTO tenant_branding(
      tenant_id,
      logo_data,
      background_data,
      updated_at
    )
    VALUES($1,$2,$3,now())
    ON CONFLICT(tenant_id)
    DO UPDATE SET
      logo_data=excluded.logo_data,
      background_data=excluded.background_data,
      updated_at=now()
    RETURNING
      tenant_id "tenantId",
      COALESCE(logo_data,'') "logoData",
      COALESCE(background_data,'') "backgroundData",
      updated_at "updatedAt"`,
   [
    req.scope.tenantId,
    d.logoData??null,
    d.backgroundData??null
   ]
  )).rows[0];

  await c.query(
   `INSERT INTO audit_logs(
      tenant_id,
      actor_user_id,
      action,
      entity_type,
      entity_id
    )
    VALUES($1,$2,'BRANDING_UPDATED','TENANT',$3)`,
   [
    req.scope.tenantId,
    req.session.sub,
    req.scope.tenantId
   ]
  );

  return saved;
 });

 res.json(row);
});


app.use((_req,res)=>res.status(404).json({error:'Rota nao encontrada'}));
app.use((err:any,_req:any,res:any,_next:any)=>{console.error(err);res.status(500).json({error:'Erro interno; o evento foi registrado'});});
const port=Number(process.env.PORT??3000);app.listen(port,'0.0.0.0',()=>console.log(`Operix API na porta ${port}`));

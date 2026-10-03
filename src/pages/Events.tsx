import{useEffect,useState}from'react';
import{Link}from'react-router-dom';
import QRCode from'qrcode';
import{adminEvents,adminStats,assetUrl,setEventStatus}from'../lib/events';
import type{EventRecord}from'../types';
import{Brand,Status}from'../components/Brand';

export default function Events({admin=false}:{admin?:boolean}){
 const[events,setEvents]=useState<EventRecord[]>([]),[stats,setStats]=useState<{users:number;events:number;active_events:number}|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState('');
 const base=admin?'/admin/events':'/account/events';
 useEffect(()=>{Promise.all([adminEvents().then(setEvents),admin?adminStats().then(setStats):Promise.resolve()]).catch(e=>setError(e.message)).finally(()=>setLoading(false))},[admin]);
 async function qr(e:EventRecord){const data=await QRCode.toDataURL(`${location.origin}/e/${e.slug}`,{width:1200,margin:2}),a=document.createElement('a');a.href=data;a.download=`qr-${e.slug}.png`;a.click()}
 async function toggle(e:EventRecord){try{const updated=await setEventStatus(e.id,e.status==='active'?'inactive':'active');setEvents(list=>list.map(item=>item.id===e.id?updated:item))}catch(err:any){setError(err.message)}}
 return <main className="admin"><aside><Brand light/><nav><Link className="active" to={base}>{admin?'Toàn bộ dấu ấn':'Dấu ấn của tôi'}</Link><Link to={`${base}/new`}>Đăng ký mới</Link><Link to="/">Trang công khai</Link></nav><small>{admin?'HỆ THỐNG QUẢN TRỊ':'KHU VỰC CÁ NHÂN'}</small></aside><section className="admin-content"><header><div><p className="eyebrow">{admin?'QUẢN LÝ TỔNG':'THƯ VIỆN CỦA TÔI'}</p><h1>{admin?'Toàn bộ dấu ấn':'Dấu ấn của tôi'}</h1></div><Link className="button primary" to={`${base}/new`}>＋ Đăng ký dấu ấn mới</Link></header>{admin&&stats&&<div className="summary"><b>{stats.users}</b><span>Người dùng</span><b>{stats.events}</b><span>Tổng dấu ấn</span><b>{stats.active_events}</b><span>Đang hoạt động</span></div>}{!admin&&<div className="summary"><b>{events.length}</b><span>Dấu ấn của tôi</span><b>{events.filter(e=>e.status==='active').length}</b><span>Đang hoạt động</span></div>}{error&&<p className="error">{error}</p>}{loading?<p>Đang tải…</p>:<div className="event-list">{events.map(e=><article key={e.id}><img src={assetUrl(e.thumbnail_path)} alt=""/><div><Status value={e.status}/><h2>{e.title}</h2><p>{e.partner_name} · {new Date(e.event_date).toLocaleDateString('vi-VN')}{admin&&(e as any).owner_email?` · ${(e as any).owner_email}`:''}</p></div><div className="row-actions"><Link to={`/e/${e.slug}`}>Xem</Link><button onClick={()=>toggle(e)}>{e.status==='active'?'Tắt':'Bật'}</button><button onClick={()=>qr(e)}>Tải QR</button></div></article>)}</div>}</section></main>
}

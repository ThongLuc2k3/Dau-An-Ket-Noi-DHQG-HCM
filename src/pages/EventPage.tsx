import{useEffect,useState}from'react';
import{Link,useParams}from'react-router-dom';
import{assetUrl,publicEvent}from'../lib/events';
import type{EventRecord}from'../types';
import{Brand}from'../components/Brand';

export default function EventPage({watch=false}:{watch?:boolean}){
 const{slug=''}=useParams(),[event,setEvent]=useState<EventRecord|null|undefined>(),[error,setError]=useState('');
 useEffect(()=>{publicEvent(slug).then(setEvent).catch(e=>setError(e.message))},[slug]);
 if(error)return <State title="Không thể tải dấu ấn" text={error}/>;
 if(event===undefined)return <State title="Đang mở dấu ấn…"/>;
 if(!event)return <State title="Không tìm thấy video phù hợp" text="Ảnh hoặc mã QR này chưa được liên kết với video nào."/>;
 if(!event.video_path)return <State title="Dấu ấn chưa có video" text="Sự kiện đã được nhận diện nhưng chưa có video trong kho lưu trữ."/>;
 if(watch)return <Watch event={event}/>;
 return <main className="event-public"><nav><Brand/><Link to="/" className="text-link">Về trang chủ</Link></nav><section className="event-hero"><div className="event-poster"><img src={assetUrl(event.thumbnail_path)} alt={`Ảnh đại diện ${event.title}`}/><span>DẤU ẤN · {new Date(event.event_date).getFullYear()}</span></div><div><p className="eyebrow">KHOẢNH KHẮC ĐƯỢC LƯU GIỮ</p><h1>{event.title}</h1><p className="partner">{event.partner_name} · {new Date(event.event_date).toLocaleDateString('vi-VN')}</p><p>{event.description}</p><div className="actions"><Link to={`/e/${event.slug}/watch`} className="button primary">Xem lại video</Link><Link to="/scan" className="button secondary">Quét dấu ấn khác</Link></div></div></section></main>
}

function Watch({event}:{event:EventRecord}){
 const src=assetUrl(event.video_path);
 return <main className="watch-page"><img className="watch-logo" src="/brand/vnu-hcm-logo.png" alt="Đại học Quốc gia TP. Hồ Chí Minh"/><Link className="watch-close" to={`/e/${event.slug}`} aria-label="Đóng video">✕</Link><section><video src={src} poster={assetUrl(event.thumbnail_path)} controls playsInline preload="metadata"/><div className="watch-meta"><div><b>{event.title}</b><span>{event.partner_name} · Video có âm thanh stereo</span></div><a className="button secondary download-button" href={src} download><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M12 3v12m0 0 5-5m-5 5-5-5M5 21h14"/></svg><span>Tải video</span></a></div></section></main>
}

function State({title,text}:{title:string;text?:string}){return <main className="center-state"><img className="state-logo" src="/brand/vnu-hcm-logo.png" alt="Đại học Quốc gia TP. Hồ Chí Minh"/><h1>{title}</h1>{text&&<p>{text}</p>}<div className="actions"><Link className="button primary" to="/scan">Quét lại</Link><Link className="button secondary" to="/">Về trang đầu</Link></div></main>}

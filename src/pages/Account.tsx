import{FormEvent,useState}from'react';
import{Link,useNavigate}from'react-router-dom';
import{Brand}from'../components/Brand';
import{clearSession,sessionRole}from'../lib/auth';

export default function Account(){
 const role=sessionRole()!,email=localStorage.getItem('dakn_email')||'',navigate=useNavigate(),[name,setName]=useState(localStorage.getItem('dakn_name')||''),[saved,setSaved]=useState(false),managePath=role==='admin'?'/admin/events':'/account/events';
 function save(e:FormEvent){e.preventDefault();localStorage.setItem('dakn_name',name.trim());setSaved(true)}
 function logout(){clearSession();navigate('/login',{replace:true})}
 return <main className="account-page"><header><Brand/><Link to="/">← Trang chủ</Link></header><section className="account-card"><p className="eyebrow">THÔNG TIN CÁ NHÂN</p><h1>Tài khoản</h1><form onSubmit={save}><label>Tên hiển thị<input value={name} onChange={e=>{setName(e.target.value);setSaved(false)}} placeholder="Nhập tên của bạn"/></label><label>Email<input value={email} readOnly/></label><label>Vai trò<input value={role==='admin'?'Quản trị viên':'Người dùng'} readOnly/></label>{saved&&<p className="account-saved">Đã lưu thông tin.</p>}<div className="account-page-actions"><button className="button primary">Lưu thay đổi</button><Link className="button secondary" to={managePath}>Quản lý dấu ấn</Link></div></form><hr/><button type="button" className="account-logout" onClick={logout}>Đăng xuất</button></section></main>
}

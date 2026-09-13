import{FormEvent,useState}from'react';
import{Link,useNavigate}from'react-router-dom';
import{Brand}from'../components/Brand';
import{request}from'../lib/api';

export default function Register(){
 const[email,setEmail]=useState(''),[password,setPassword]=useState(''),[confirm,setConfirm]=useState(''),[error,setError]=useState(''),nav=useNavigate();
 async function submit(e:FormEvent){e.preventDefault();if(password!==confirm)return setError('Mật khẩu nhập lại không khớp.');setError('');try{const data=await request<{token:string;email:string}>('/auth/register',{method:'POST',body:JSON.stringify({email,password})});localStorage.setItem('dakn_token',data.token);localStorage.setItem('dakn_email',data.email);nav('/')}catch(e:any){setError(e.message)}}
 return <main className="auth"><section className="auth-brand"><blockquote>“Tạo tài khoản để quét và lưu giữ những dấu ấn của bạn.”</blockquote></section><section className="auth-form"><header className="auth-topbar"><Brand/><Link to="/">← Trang công khai</Link></header><form onSubmit={submit}><p className="eyebrow">TẠO TÀI KHOẢN</p><h1>Đăng ký</h1><p>Mật khẩu cần có ít nhất 8 ký tự.</p><label>Email<input type="email" required autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)}/></label><label>Mật khẩu<input type="password" required minLength={8} autoComplete="new-password" value={password} onChange={e=>setPassword(e.target.value)}/></label><label>Nhập lại mật khẩu<input type="password" required minLength={8} autoComplete="new-password" value={confirm} onChange={e=>setConfirm(e.target.value)}/></label>{error&&<p className="error">{error}</p>}<button className="button primary">Đăng ký →</button><p className="auth-switch">Đã có tài khoản? <Link to="/admin/login">Đăng nhập</Link></p></form></section></main>
}

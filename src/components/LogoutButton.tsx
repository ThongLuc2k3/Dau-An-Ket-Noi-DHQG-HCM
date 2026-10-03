import{useNavigate}from'react-router-dom';
import{clearSession}from'../lib/auth';

export function LogoutButton(){
 const navigate=useNavigate();
 function logout(){clearSession();navigate('/login',{replace:true})}
 return <button type="button" className="logout-button" onClick={logout}>Đăng xuất</button>
}

import type{ReactNode}from'react';
import{Routes,Route,Navigate,useLocation}from'react-router-dom';
import Home from'./pages/Home';
import Scan from'./pages/Scan';
import EventPage from'./pages/EventPage';
import Login from'./pages/Login';
import Register from'./pages/Register';
import Events from'./pages/Events';
import EventEditor from'./pages/EventEditor';
import Account from'./pages/Account';
import{sessionRole}from'./lib/auth';

function ProtectedScan(){const location=useLocation();return sessionRole()?<Scan/>:<Navigate replace to={`/login?next=${encodeURIComponent(location.pathname)}`}/>}
function ProtectedAccount({children}:{children:ReactNode}){const location=useLocation();return sessionRole()?children:<Navigate replace to={`/login?next=${encodeURIComponent(location.pathname)}`}/>}
function ProtectedAdmin({children}:{children:ReactNode}){const location=useLocation();return sessionRole()==='admin'?children:<Navigate replace to={`/admin/login?next=${encodeURIComponent(location.pathname)}`}/>}

export default function App(){
 return <Routes><Route path="/" element={<Home/>}/><Route path="/scan" element={<ProtectedScan/>}/><Route path="/e/:slug" element={<EventPage/>}/><Route path="/e/:slug/watch" element={<EventPage watch/>}/><Route path="/login" element={<Login/>}/><Route path="/admin/login" element={<Login admin/>}/><Route path="/register" element={<Register/>}/><Route path="/account" element={<ProtectedAccount><Account/></ProtectedAccount>}/><Route path="/account/events" element={<ProtectedAccount><Events/></ProtectedAccount>}/><Route path="/account/events/new" element={<ProtectedAccount><EventEditor/></ProtectedAccount>}/><Route path="/admin/events" element={<ProtectedAdmin><Events admin/></ProtectedAdmin>}/><Route path="/admin/events/new" element={<ProtectedAdmin><EventEditor admin/></ProtectedAdmin>}/><Route path="/admin/events/:id" element={<ProtectedAdmin><EventEditor admin/></ProtectedAdmin>}/><Route path="*" element={<Navigate to="/"/>}/></Routes>
}

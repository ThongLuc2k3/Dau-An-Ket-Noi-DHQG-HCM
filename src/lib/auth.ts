export type SessionRole='admin'|'user';

export function sessionRole():SessionRole|null{
 const stored=localStorage.getItem('dakn_role');
 if(stored==='admin'||stored==='user')return stored;
 const token=localStorage.getItem('dakn_token');
 if(!token)return null;
 try{
  const payload=JSON.parse(atob(token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));
  return payload.role==='admin'?'admin':'user'
 }catch{return null}
}

export function saveSession(data:{token:string;email?:string;role?:SessionRole},fallbackEmail=''){
 const role=data.role||(readTokenRole(data.token));
 localStorage.setItem('dakn_token',data.token);
 localStorage.setItem('dakn_email',data.email||fallbackEmail);
 localStorage.setItem('dakn_role',role)
}

export function clearSession(){
 localStorage.removeItem('dakn_token');
 localStorage.removeItem('dakn_email');
 localStorage.removeItem('dakn_role')
}

function readTokenRole(token:string):SessionRole{
 try{const payload=JSON.parse(atob(token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));return payload.role==='admin'?'admin':'user'}catch{return'user'}
}

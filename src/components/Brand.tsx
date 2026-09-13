import{Link}from'react-router-dom';
export function Brand({light=false}:{light?:boolean}){return <Link className={'brand '+(light?'light':'')} to="/"><span className="brand-mark" aria-hidden>VNU</span><span><b>DẤU ẤN KẾT NỐI</b><small>Lưu dấu sự kiện · Gìn giữ kết nối</small></span></Link>}
export function Status({value}:{value:string}){const names:Record<string,string>={active:'Đang hoạt động',ready:'Sẵn sàng',draft:'Bản nháp',processing:'Đang xử lý',inactive:'Đã tắt',failed:'Lỗi'};return <span className={'status '+value}>{names[value]||value}</span>}

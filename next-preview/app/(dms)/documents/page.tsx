import { redirect } from 'next/navigation';

// /documents KHÔNG có trang danh sách riêng — chuyển hướng sang /search.
// Auth do middleware xử lý trước (chưa đăng nhập → /signin?callbackUrl=/documents).
// /search ≠ /documents nên không gây redirect loop.
export default function DocumentsIndexRoute(): never {
  redirect('/search');
}

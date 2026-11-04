import { redirect } from 'next/navigation';

// 未知网页内容路径回到唯一的正式首页，不显示第四个独立内容页。
export default function PageNotFound(): never {
  redirect('/');
}

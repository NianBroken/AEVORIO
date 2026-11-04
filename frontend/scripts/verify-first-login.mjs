import { chromium, expect } from '@playwright/test';
import console from 'node:console';
import process from 'node:process';
import { setTimeout } from 'node:timers';
import fs from 'node:fs';
import ports from '../../shared/ports.json' with { type: 'json' };
const origin=`http://127.0.0.1:${ports.frontend}`;
(async()=>{const browser=await chromium.launch({headless:true});try{
const context=await browser.newContext();const page=await context.newPage();page.setDefaultTimeout(15000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
for(const route of ['/','/products','/about']){const response=await page.goto(`http://127.0.0.1:${ports.frontend}`+route);expect(response.status()).toBe(200);await expect(page.locator('h1').first()).toBeVisible();await page.locator('img').evaluateAll(async imgs=>{for(const i of imgs)i.loading='eager';await Promise.race([Promise.all(imgs.map(i=>i.decode())),new Promise((_,reject)=>setTimeout(()=>reject(new Error('图片加载超时')),15000))]);});console.log('页面验证通过：'+route);}
await page.goto(origin+'/admin/');await page.getByLabel('用户名',{exact:true}).fill('Nian');await page.getByLabel('密码',{exact:true}).fill('Nian123456');await page.getByRole('button',{name:'登录后台',exact:true}).click();await expect(page.getByRole('heading',{name:'设置管理密码',exact:true})).toBeVisible();
await page.reload();await expect(page.getByRole('heading',{name:'设置管理密码',exact:true})).toBeVisible();
const api=context.request;
expect((await api.get(origin+'/api/v1/admin/overview')).status()).toBe(403);
const session=(await (await api.get(origin+'/api/v1/admin/auth/session')).json()).Data;
const patch=async(currentPassword,newPassword)=>api.patch(origin+'/api/v1/admin/auth/password',{headers:{Origin:origin,'X-CSRF-Token':session.csrfToken},data:{currentPassword,newPassword}});
for(const value of ['1234567','x'.repeat(33),'abc defg','abc\tdefg','密码123456'])expect((await patch('Nian123456',value)).status()).toBe(400);
await page.getByLabel('当前临时密码',{exact:true}).fill('Nian123456');await page.getByLabel('新密码',{exact:true}).fill('Check12!');await page.getByRole('button',{name:'设置密码并进入后台',exact:true}).click();await expect(page.getByRole('heading',{name:'工作概览',exact:true})).toBeVisible();expect((await api.get(origin+'/api/v1/admin/overview')).status()).toBe(200);
expect((await patch('Check12!','A'.repeat(31)+'!')).status()).toBe(200);
const anon=await browser.newContext();const token=(await (await anon.request.get(origin+'/api/v1/admin/auth/session')).json()).Data.csrfToken;
const login=async password=>anon.request.post(origin+'/api/v1/admin/auth/login',{headers:{Origin:origin,'X-CSRF-Token':token},data:{username:'Nian',password}});
expect((await login('Nian123456')).status()).toBe(401);expect((await login('A'.repeat(31)+'!')).status()).toBe(200);expect(errors).toEqual([]);
fs.writeFileSync('reports/first-login-verification.json',JSON.stringify({passed:true,verifiedAt:new Date().toISOString(),checks:['三个前台页面及图片','默认登录','刷新后强制改密','业务接口拦截','非法密码拒绝','8位密码界面改密','32位密码接口改密','改密后业务访问','旧密码失效','新密码登录','无浏览器异常']},null,2),'utf8');console.log('首次登录、强制改密、密码边界、页面与接口验收通过。');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});

# 本轮目录与承载整改

前台：http://127.0.0.1:24681/

后台：http://127.0.0.1:24681/admin

frontend 包含全部网站及后台组件、样式、路由和 Next.js 构建配置。backend 仅包含 Express、数据库、鉴权和业务处理。shared 保存双方共用的数据定义和端口配置。

前端在 24681 提供全部页面，并将 /api 与 /media 同源转发至 24682。后端 /admin/ 及旧后台资源路径返回 404。管理请求来源使用 FRONTEND_ORIGIN。

项目根目录启动命令：./frontend/scripts/start-site.ps1。脚本识别并释放固定端口占用，守护进程管理两个服务。主动停止命令：./frontend/scripts/stop-site.ps1。

正式数据库及管理员密码保留。迁移浏览器验收在 frontend 目录执行 node scripts/verify-migration.mjs，自动创建并回收隔离测试库，不重置正式管理员。

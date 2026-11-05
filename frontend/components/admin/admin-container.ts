// 弹窗与菜单挂载到等比例画布，沿用视口缩放和滚动定位。
export const adminContainer = () => document.querySelector<HTMLElement>(".admin-stage") ?? document.body;

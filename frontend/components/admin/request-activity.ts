// 请求计数按开始与结束成对维护，并发请求全部结束后才清除公共状态。
let pending = 0;
const listeners = new Set<() => void>();
export const getPendingRequests = () => pending;
export const subscribeRequests = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export function beginRequest() {
  pending += 1;
  listeners.forEach((listener) => listener());
  let complete = false;
  return () => {
    if (complete) return;
    complete = true;
    pending -= 1;
    listeners.forEach((listener) => listener());
  };
}

// 前后端共用密码范围，ASCII 可见字符不包含空格和控制字符。
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 32;
export const PASSWORD_PATTERN = /^[!-~]{8,32}$/u;
export const PASSWORD_MESSAGE = "密码须为 8 至 32 个 ASCII 可见字符，不含空格。";

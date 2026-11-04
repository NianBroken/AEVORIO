import { describe, it, expect } from 'vitest';
import { PASSWORD_PATTERN } from '../../shared/password';
describe('统一密码规则', () => {
  it('接受 8 位、32 位及全部 ASCII 可见符号', () => {
    for (const value of ['Abcd123!', 'x'.repeat(32), '!"#$%&\'()*+,-./:;<=>?@[\\]^_`{|}~']) expect(PASSWORD_PATTERN.test(value)).toBe(true);
  });
  it('拒绝越界、空白、控制字符和非 ASCII 字符', () => {
    for (const value of ['a'.repeat(7), 'a'.repeat(33), 'abc defg', 'abc\tdefg', 'abcdefgh\n', '密码123456', 'abc\u200bdefgh']) expect(PASSWORD_PATTERN.test(value)).toBe(false);
  });
});

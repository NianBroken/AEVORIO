import { hash, Algorithm } from "@node-rs/argon2";

const passwordOptions = {
  algorithm: Algorithm.Argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
};
export const hashPassword = (password: string) =>
  hash(password, passwordOptions);

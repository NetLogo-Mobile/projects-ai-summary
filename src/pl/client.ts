// @ts-expect-error
import pl from 'plweb';

import { config } from '../config';

pl.setConfig({
  baseURL: config.plBaseUrl,
  timeout: 10000,
  consolelog: true,
  consoleResponse: false,
  consoleError: true,
  checkHttpsAgent: false
});

export async function createUser() {
  return createUserWithCredentials(config.plUsername, config.plPassword);
}

export async function createUserWithCredentials(username: string, password: string) {
  const user = new pl.User();
  user.username = username;
  user.password = password;
  await user.user.login();
  return user;
}

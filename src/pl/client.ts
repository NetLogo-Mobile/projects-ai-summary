import pl from 'physics-lab-web-api';
import { config } from '../config';

pl.setConfig({
  timeout: 10000,
  consolelog: false,
  consoleResponse: false,
  consoleError: true,
  checkHttpsAgent: false
});

export async function createUser() {
  const user = new pl.User();
  await user.auth.login(config.plUsername, config.plPassword);
  return user;
}

export function createBot(processFn: (msg: { Content: string }) => Promise<string>) {
  return new pl.Bot(config.plUsername, config.plPassword, processFn);
}

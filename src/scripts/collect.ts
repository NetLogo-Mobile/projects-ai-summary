import { assertEnv, config } from '../config';
import { initDatabase } from '../db/client';
import { initTable } from '../db/repository';
import { collectByTypeWithOptions } from '../services/collector';

function parseArgs(): { skip: number; model?: string; take: number } {
  const args: string[] = process.argv.slice(2);
  let skip: number | undefined;
  let model: string | undefined;
  let take: number | undefined;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--skip' && i + 1 < args.length) {
      skip = parseInt(args[i + 1], 10);
      if (isNaN(skip)) {
        console.error('错误: --skip 参数必须是数字');
        process.exit(1);
      }
      i++;
    } else if (arg === '--model' && i + 1 < args.length) {
      model = args[i + 1];
      i++;
    } else if (arg === '--take' && i + 1 < args.length) {
      take = parseInt(args[i + 1], 10);
      if (isNaN(take)) {
        console.error('错误: --take 参数必须是数字');
        process.exit(1);
      }
      i++;
    }
  }

  return {
    skip: skip ?? config.skip,
    model,
    take: take ?? config.take
  };
}

async function main() {
  const { skip, model, take } = parseArgs();
  
  console.log(`[flexible-collect] 开始收集数据`);
  console.log(`  跳过: ${skip}`);
  console.log(`  模型: ${model || config.model} (默认: ${config.model})`);
  console.log(`  获取数量: ${take}`);

  assertEnv();
  await initDatabase();
  await initTable();
  
  const results = [];
  for (const type of ['Experiment', 'Discussion']) {
    console.log(`  类型: ${type}`);
    results.push(await collectByTypeWithOptions(type, skip, model, take));
  }
  console.log('[flexible-collect] 完成!', {
    inserted: results.reduce((total, result) => total + result.inserted, 0),
    skipped: results.reduce((total, result) => total + result.skipped, 0),
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

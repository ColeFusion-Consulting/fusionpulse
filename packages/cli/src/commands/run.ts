import { Command } from 'commander';
import chalk from 'chalk';
import { execSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';

export const runCommand = new Command('run')
  .description('Run Playwright tests (wraps npx playwright test)')
  .argument('[files...]', 'Specific test files to run')
  .option('--headed', 'Run in headed mode', false)
  .option('--debug', 'Run in debug mode', false)
  .action(async (files: string[], opts) => {
    if (!existsSync('fusionpulse.config.json')) {
      console.error(chalk.red('No fusionpulse.config.json found. Run `fusionpulse init` first.'));
      process.exit(1);
    }

    const args = ['npx', 'playwright', 'test'];
    if (files.length > 0) args.push(...files);
    if (opts.headed) args.push('--headed');
    if (opts.debug) args.push('--debug');

    console.log(chalk.cyan(`Running: ${args.join(' ')}\n`));

    try {
      execSync(args.join(' '), { stdio: 'inherit' });
    } catch {
      process.exit(1);
    }
  });

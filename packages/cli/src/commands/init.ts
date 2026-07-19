import { Command } from 'commander';
import chalk from 'chalk';
import { writeFileSync, existsSync, mkdirSync } from 'fs';

const FUSIONPULSE_CONFIG = `{
  "version": "0.1.0",
  "baseUrl": "http://localhost:3000",
  "testDir": "./tests",
  "screenshots": "./screenshots",
  "reports": "./reports",
  "ai": {
    "provider": "openai",
    "model": "gpt-4o-mini"
  },
  "monitoring": {
    "enabled": false,
    "intervalSeconds": 300
  }
}`;

export async function initAction() {
  const configPath = 'fusionpulse.config.json';

  if (existsSync(configPath)) {
    console.log(chalk.yellow('fusionpulse.config.json already exists'));
    return;
  }

  writeFileSync(configPath, FUSIONPULSE_CONFIG);

  if (!existsSync('./tests')) mkdirSync('./tests');
  if (!existsSync('./screenshots')) mkdirSync('./screenshots');

  console.log(chalk.green('\nInitialized FusionPulse!'));
  console.log(chalk.gray('Created:'));
  console.log(chalk.gray('  fusionpulse.config.json'));
  console.log(chalk.gray('  tests/'));
  console.log(chalk.gray('  screenshots/'));
  console.log(chalk.gray('\nNext: Run `fusionpulse generate` to create your first test\n'));
}

export const initCommand = new Command('init')
  .description('Initialize a FusionPulse config in the current directory')
  .action(initAction);

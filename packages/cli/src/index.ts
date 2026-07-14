#!/usr/bin/env node
import { Command } from 'commander';
import { generateCommand } from './commands/generate.js';
import { initCommand } from './commands/init.js';
import { runCommand } from './commands/run.js';

const program = new Command();

program
  .name('fusionpulse')
  .description('AI-powered test generation — describe what to test in plain English')
  .version('0.1.0');

program.addCommand(generateCommand);
program.addCommand(initCommand);
program.addCommand(runCommand);

if (process.env.NODE_ENV !== 'test') {
  program.parse();
}

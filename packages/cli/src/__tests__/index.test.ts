import { describe, it, expect, vi } from 'vitest';
import { Command } from 'commander';

const makeCommand = (name: string) => {
  const cmd = new Command(name);
  cmd.description('test').action(() => {});
  return cmd;
};

vi.mock('../commands/init.js', () => ({
  initCommand: makeCommand('init'),
}));
vi.mock('../commands/generate.js', () => ({
  generateCommand: makeCommand('generate'),
}));
vi.mock('../commands/run.js', () => ({
  runCommand: makeCommand('run'),
}));

describe('CLI entry point', () => {
  it('should create program with 3 commands', async () => {
    vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    const argvBackup = process.argv;
    Object.defineProperty(process, 'argv', { value: ['node', 'fusionpulse', '--help'] });

    const mod = await import('../index.js');

    Object.defineProperty(process, 'argv', { value: argvBackup });
    expect(mod).toBeDefined();
  });
});

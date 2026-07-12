import { Command } from 'commander';
import inquirer from 'inquirer';
import chalk from 'chalk';
import OpenAI from 'openai';
import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

const SYSTEM_PROMPT = `You are a QA test engineer. Generate Playwright E2E test code in TypeScript.

You MUST respond with ONLY a valid JSON object:
{
  "code": "// full Playwright test code as a string",
  "fileName": "test-name.spec.ts",
  "description": "Brief description"
}

The code should:
- Use @playwright/test
- Use modern test.describe / test syntax
- Include proper page object patterns where appropriate
- Use expect() assertions
- Be production-quality`;

export const generateCommand = new Command('generate')
  .description('Generate a Playwright test from a plain English description')
  .option('-p, --prompt <description>', 'Test description')
  .option('-o, --output <dir>', 'Output directory', './tests')
  .option('--model <model>', 'AI model to use', 'gpt-4o-mini')
  .action(async (opts) => {
    let prompt = opts.prompt;
    if (!prompt) {
      const answer = await inquirer.prompt([{
        type: 'input',
        name: 'prompt',
        message: 'Describe what to test:',
      }]);
      prompt = answer.prompt;
    }

    console.log(chalk.cyan('\nGenerating test steps...'));

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      console.error(chalk.red('Set OPENAI_API_KEY environment variable'));
      process.exit(1);
    }

    const openai = new OpenAI({ apiKey });
    const response = await openai.chat.completions.create({
      model: opts.model,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: prompt },
      ],
      temperature: 0.3,
      max_tokens: 4096,
    });

    const content = response.choices[0]?.message?.content || '';
    let jsonStr = content;
    const match = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (match) jsonStr = match[1];
    const objMatch = jsonStr.match(/\{[\s\S]*\}/);
    if (objMatch) jsonStr = objMatch[0];

    const result = JSON.parse(jsonStr);

    const outDir = opts.output;
    if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

    const filePath = join(outDir, result.fileName);
    writeFileSync(filePath, result.code);

    console.log(chalk.green(`\nGenerated: ${filePath}`));
    console.log(chalk.gray(`Description: ${result.description}`));
    console.log(chalk.gray(`\nRun with: npx playwright test ${filePath}\n`));
  });

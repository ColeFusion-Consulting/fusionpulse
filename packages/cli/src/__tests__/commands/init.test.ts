import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFs = {
  existsSync: vi.fn(),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
};

vi.mock('fs', () => mockFs);

const { initAction } = await import('../../commands/init.js');

describe('init', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should create fusionpulse.config.json with default settings', async () => {
    mockFs.existsSync.mockReturnValue(false);

    await initAction();

    expect(mockFs.writeFileSync).toHaveBeenCalledWith(
      'fusionpulse.config.json',
      expect.stringContaining('"version": "0.1.0"'),
    );
    expect(mockFs.writeFileSync).toHaveBeenCalledWith(
      'fusionpulse.config.json',
      expect.stringContaining('"baseUrl": "http://localhost:3000"'),
    );
  });

  it('should create tests/ and screenshots/ directories', async () => {
    mockFs.existsSync.mockReturnValue(false);

    await initAction();

    expect(mockFs.mkdirSync).toHaveBeenCalledWith('./tests');
    expect(mockFs.mkdirSync).toHaveBeenCalledWith('./screenshots');
  });
});

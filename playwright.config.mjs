import { defineConfig } from '@playwright/test';

export default defineConfig({
    testDir: './test',
    testMatch: '*.pw.mjs',
    workers: 1,
    timeout: 240000,
    expect: { timeout: 15000 },
    reporter: 'list',
    use: {
        baseURL: 'http://127.0.0.1:4187/repository/',
        viewport: { width: 1440, height: 1000 },
        screenshot: 'only-on-failure',
        trace: 'retain-on-failure',
        launchOptions: {
            ...(process.env.CHROME_BIN ? { executablePath: process.env.CHROME_BIN } : {}),
            args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
        },
    },
    webServer: {
        command: 'npm run dev',
        env: { PORT: '4187', BASE: '/repository/' },
        url: 'http://127.0.0.1:4187/repository/',
        reuseExistingServer: false,
    },
});

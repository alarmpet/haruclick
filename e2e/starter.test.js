describe('Starter Test', () => {
    beforeAll(async () => {
        await device.launchApp();
    });

    beforeEach(async () => {
        await device.reloadReactNative();
    });

    it('should show login screen', async () => {
        // Verify login screen elements are visible
        // Based on LoginScreen implementation: accessibilityLabels "이메일 입력창", "로그인 버튼"
        await expect(element(by.label('이메일 입력창'))).toBeVisible();
        await expect(element(by.label('로그인 버튼'))).toBeVisible();
    });

    it('should show welcome text', async () => {
        // Check for "하루클릭" text
        await expect(element(by.text('하루클릭'))).toBeVisible();
    });
});

const { withAndroidManifest } = require('@expo/config-plugins');

module.exports = function withAndroidManifestFix(config) {
    return withAndroidManifest(config, async (config) => {
        const androidManifest = config.modResults;
        const application = androidManifest.manifest.application[0];

        // Add 'tools:replace="android:appComponentFactory"' to <application>
        if (!application.$) {
            application.$ = {};
        }

        // Ensure tools namespace is available (usually is, but good to be safe)
        // androidManifest.manifest.$['xmlns:tools'] = "http://schemas.android.com/tools";

        // 1. Add 'android:appComponentFactory' value (Required because we are replacing it)
        application.$['android:appComponentFactory'] = "androidx.core.app.CoreComponentFactory";

        // 2. Append to existing tools:replace or create new
        if (application.$['tools:replace']) {
            const existing = application.$['tools:replace'];
            if (!existing.includes('android:appComponentFactory')) {
                application.$['tools:replace'] = `${existing},android:appComponentFactory`;
            }
        } else {
            application.$['tools:replace'] = 'android:appComponentFactory';
        }

        return config;
    });
};

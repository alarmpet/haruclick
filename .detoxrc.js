/** @type {import('Detox').DetoxConfig} */
module.exports = {
    testRunner: {
        args: {
            '$0': 'jest',
            config: 'e2e/jest.config.js'
        },
        jest: {
            setupTimeout: 120000
        }
    },
    apps: {
        'android.debug': {
            type: 'android.apk',
            binaryPath: 'android/app/build/outputs/apk/debug/app-debug.apk',
            build: 'cd android && gradlew.bat assembleDebug'
        },
        'android.release': {
            type: 'android.apk',
            binaryPath: 'android/app/build/outputs/apk/release/app-release.apk',
            build: 'cd android && gradlew.bat assembleRelease'
        }
    },
    devices: {
        emulator: {
            type: 'android.emulator',
            device: {
                avdName: 'Medium_Phone_API_36.1'
            }
        }
    },
    configurations: {
        'android.emu.debug': {
            device: 'emulator',
            app: 'android.debug'
        },
        'android.emu.release': {
            device: 'emulator',
            app: 'android.release'
        }
    }
};

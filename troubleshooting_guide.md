# Troubleshooting "Error loading app: timeout"

If you see a timeout error when connecting to the development server, follow these steps.

## 0. CLEARTEXT policy error on Android
If you see:
`CLEARTEXT communication to 192.168.x.x not permitted by network security policy`

It means Android is blocking HTTP LAN traffic to Metro (`:8081`).

What to do:
1. Rebuild and reinstall the Development Build (native config changed):
   - `.\run-android-local.bat` (or Android Studio Run)
2. Start server in LAN mode:
   - `npx expo start --dev-client --lan --port 8081`
3. Retry from the dev client app.

## 1. Network Basics (Most Common)
- **Same Wi-Fi**: Ensure your Phone and PC are connected to the **exact same Wi-Fi network** (5GHz vs 2.4GHz is usually fine, but same SSID is best).
- **No VPN**: Turn off VPNs on both PC and Phone.

## 2. Windows Firewall Check
The Windows Firewall often blocks incoming connections to Node.js.
1. Press `Win + R`, type `wf.msc`, and press Enter.
2. Click **Inbound Rules**.
3. Look for **Node.js JavaScript Runtime**.
4. Ensure there are **Allow** rules for **Private** networks. 
   - If blocked or missing, create a New Rule -> Program -> Select your node.exe path -> Allow the connection -> Check Domain/Private/Public.

## 3. Find Your Local IP
1. Open terminal on PC: `ipconfig`.
2. Find `IPv4 Address` (e.g., `192.168.0.x`).
3. On the phone app, if it asks for a URL, try entering: `http://192.168.0.x:8081` manually.

## 4. Restart Everything
Sometimes the Metro Bundler gets stuck.
1. Close the terminal running the server.
2. Run `start-dev-server.bat` again.
3. On the phone, force close the app and reopen it.

## 5. Tunnel Mode (Last Resort)
If your router isolates devices (common in cafes/offices), use `ngrok`.
1. Modify `start-dev-server.bat`:
   Change:
   `npx expo start --dev-client`
   To:
   `npx expo start --dev-client --tunnel`
2. **Note**: Tunnel mode is much slower.

## 6. Auto Tunnel Script Behavior
`auto-run-tunnel.bat` now tries tunnel first and automatically falls back to LAN mode if ngrok times out.
- Tunnel command: `npx expo start --dev-client --tunnel --port 8081 --clear`
- Fallback command: `npx expo start --dev-client --lan --port 8081 --clear`
- Timeout detection: script checks both process exit code and log text (`ngrok tunnel took too long to connect`).

If tunnel keeps failing:
1. Run `fix-ngrok-firewall.ps1` as Administrator.
2. Disable VPN/proxy and retry.
3. Use LAN/USB mode for development stability.

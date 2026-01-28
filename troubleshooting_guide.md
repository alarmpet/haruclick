# Troubleshooting "Error loading app: timeout"

If you see a timeout error when connecting to the development server, follow these steps.

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

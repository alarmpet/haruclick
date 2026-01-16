const https = require('https');
const fs = require('fs');
const path = require('path');

// Basic .env parser
function loadEnv() {
    try {
        const envPath = path.resolve(__dirname, '.env');
        const envContent = fs.readFileSync(envPath, 'utf8');
        const env = {};
        envContent.split('\n').forEach(line => {
            const match = line.match(/^([^=]+)=(.*)$/);
            if (match) {
                const key = match[1].trim();
                const value = match[2].trim();
                env[key] = value;
            }
        });
        return env;
    } catch (e) {
        console.error("Could not read .env file");
        return {};
    }
}

const env = loadEnv();
const apiKey = env.EXPO_PUBLIC_OPENAI_API_KEY;

if (!apiKey) {
    console.error("❌ No EXPO_PUBLIC_OPENAI_API_KEY found in .env");
    process.exit(1);
}

const data = JSON.stringify({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: "Hello" }],
    max_tokens: 5
});

const options = {
    hostname: 'api.openai.com',
    path: '/v1/chat/completions',
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'Content-Length': data.length
    }
};

console.log("Testing OpenAI API Connection...");

const req = https.request(options, (res) => {
    let responseBody = '';

    res.on('data', (chunk) => {
        responseBody += chunk;
    });

    res.on('end', () => {
        if (res.statusCode === 200) {
            console.log("✅ OpenAI API Key is valid and working.");
            console.log("Response Status:", res.statusCode);
            const parsed = JSON.parse(responseBody);
            console.log("Model Used:", parsed.model);
        } else {
            console.error("❌ OpenAI API Request Failed.");
            console.error("Status:", res.statusCode);
            console.error("Response:", responseBody);
        }
    });
});

req.on('error', (error) => {
    console.error("❌ Request Error:", error);
});

req.write(data);
req.end();

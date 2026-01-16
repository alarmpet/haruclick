const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
const PACKAGE_JSON_PATH = path.join(ROOT_DIR, 'package.json');
const TEMPLATE_PATH = path.join(ROOT_DIR, 'README.template.md');
const README_PATH = path.join(ROOT_DIR, 'README.md');

// Ignores for tree generation
const IGNORE_DIRS = ['node_modules', '.git', '.expo', '.gemini', 'android', 'ios', 'dist'];
const IGNORE_FILES = ['.DS_Store', 'package-lock.json', 'yarn.lock'];

function getTree(dir, prefix = '') {
    const name = path.basename(dir);
    if (IGNORE_DIRS.includes(name)) return '';

    let output = '';
    const items = fs.readdirSync(dir, { withFileTypes: true });

    // Sort: Directories first, then files
    items.sort((a, b) => {
        if (a.isDirectory() && !b.isDirectory()) return -1;
        if (!a.isDirectory() && b.isDirectory()) return 1;
        return a.name.localeCompare(b.name);
    });

    // Filter ignored
    const filtered = items.filter(item =>
        !IGNORE_DIRS.includes(item.name) &&
        !IGNORE_FILES.includes(item.name) &&
        !item.name.startsWith('.')
    );

    filtered.forEach((item, index) => {
        const isLast = index === filtered.length - 1;
        const pointer = isLast ? '└── ' : '├── ';
        const itemPrefix = isLast ? '    ' : '│   ';

        output += `${prefix}${pointer}${item.name}\n`;

        if (item.isDirectory()) {
            output += getTree(path.join(dir, item.name), prefix + itemPrefix);
        }
    });

    return output;
}

function generateReadme() {
    console.log('📖 Generating README.md...');

    // 1. Read package.json
    const packageJson = JSON.parse(fs.readFileSync(PACKAGE_JSON_PATH, 'utf8'));

    // 2. Read Template
    let template = fs.readFileSync(TEMPLATE_PATH, 'utf8');

    // 3. Generate Content
    const tree = getTree(ROOT_DIR).trim();

    let scriptsTable = '';
    if (packageJson.scripts) {
        for (const [key, value] of Object.entries(packageJson.scripts)) {
            scriptsTable += `| \`npm run ${key}\` | \`${value}\` |\n`;
        }
    }

    // 4. Replace Placeholders
    let content = template
        .replace('{{NAME}}', packageJson.name || 'Project')
        .replace('{{VERSION}}', packageJson.version || '0.0.1')
        .replace('{{DESCRIPTION}}', packageJson.description || 'No description provided.')
        .replace('{{TREE}}', tree)
        .replace('{{SCRIPTS_TABLE}}', scriptsTable);

    // 5. Write File
    fs.writeFileSync(README_PATH, content);
    console.log('✅ README.md generated successfully!');
}

generateReadme();

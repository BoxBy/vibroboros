
import * as fs from 'fs';
import * as path from 'path';

const AGENTS_DIR = path.join(__dirname, '../agents');
const EXCLUDED_FILES = ['PLAN.md', 'PROGRESS.md', '_folder_overview.md', 'core'];

async function verifyAgents() {
    console.log('Starting Agent Verification...');
    
    // Get all agent files (flattened)
    const files: string[] = [];
    
    async function collectFiles(dir: string) {
        const items = fs.readdirSync(dir);
        for (const item of items) {
            if (EXCLUDED_FILES.some(ex => item.includes(ex))) continue;
            
            const fullPath = path.join(dir, item);
            const stat = fs.statSync(fullPath);
            if (stat.isDirectory()) {
                await collectFiles(fullPath);
            } else if (item.endsWith('Agent.ts')) {
                files.push(fullPath);
            }
        }
    }

    await collectFiles(AGENTS_DIR);
    console.log(`Found ${files.length} agent files.`);

    let errors = 0;

    for (const file of files) {
        const content = fs.readFileSync(file, 'utf-8');
        const fileName = path.basename(file);
        
        console.log(`Checking ${fileName}...`);

        // 1. Check if class is exported
        const classNameMatch = content.match(/export class (\w+Agent)/);
        if (!classNameMatch) {
            console.error(`❌ [${fileName}] No exported class found ending in Agent.`);
            errors++;
            continue;
        }
        const className = classNameMatch[1];

        // 2. Check for execute method (unless abstract BaseAgent)
        if (className !== 'BaseAgent' && !content.includes('execute(') && !content.includes('async execute')) {
             // Check if it inherits from a class that might implement it, but for now we expect explicit implementation or BaseAgent extension
             // Actually, if it extends BaseAgent, it *must* implement execute unless it's abstract.
             if (!content.includes('abstract class')) {
                 console.error(`❌ [${fileName}] Missing 'execute' method implementation.`);
                 errors++;
             }
        }

        // 3. Orchestrator Specific Checks
        if (className === 'OrchestratorAgent') {
            if (!content.includes('acceptMessage(')) {
                console.error(`❌ [${fileName}] Missing 'acceptMessage' method.`);
                errors++;
            }
            if (!content.includes('handleUIMessage(')) {
                console.error(`❌ [${fileName}] Missing 'handleUIMessage' method.`);
                errors++;
            }
            if (!content.includes('getInstance(')) {
                 console.error(`❌ [${fileName}] Missing 'getInstance' method (Singleton).`);
                 errors++;
            }
        }

        // 4. Check for constructor
        if (!content.includes('constructor(')) {
            console.warn(`⚠️ [${fileName}] No constructor found. (Might use default)`);
        }

        console.log(`✅ [${fileName}] Passed checks.`);
    }

    if (errors === 0) {
        console.log('\nAll agents verified successfully!');
    } else {
        console.error(`\nFound ${errors} errors.`);
        process.exit(1);
    }
}

verifyAgents().catch(err => console.error(err));

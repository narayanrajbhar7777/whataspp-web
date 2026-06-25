const fs = require('fs');
const html = fs.readFileSync('public/index.html', 'utf8');
const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>/);
const js = scriptMatch[1];

// Use acorn-style: just wrap in async function and try to parse
const wrapped = '(async function(){' + js + '})';
try {
    new Function('return ' + wrapped);
    console.log('✅ Script syntax OK!');
} catch(e) {
    // Find approximate location
    const msg = e.message;
    console.log('❌ Syntax error:', msg);

    // Try to find the problematic line
    const lines = js.split('\n');
    let bal = 0;
    for (let i = 0; i < lines.length; i++) {
        const L = lines[i];
        // Very rough: count non-string braces
        let inQ = false, qc = '';
        for (let j = 0; j < L.length; j++) {
            const c = L[j];
            if (inQ) { if (c === qc && L[j-1] !== '\\') inQ = false; }
            else if (c === '"' || c === "'") { inQ = true; qc = c; }
            else if (c === '`') { break; } // skip rest of template literal lines
            else if (c === '{') bal++;
            else if (c === '}') { bal--; if (bal < 0) { console.log('Likely stray } at HTML line ~' + (i+2365) + ': ' + L.trim()); break; } }
        }
        if (bal < 0) break;
    }
}

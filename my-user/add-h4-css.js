const fs = require('fs');
const p = 'e:/KHANH XUAN/UEL_study/N3HK2/WEB NANG CAO/PROJECT/VitaCare/VitaCare/my-user/src/app/features/policies';
function w(d) {
    let r = [];
    fs.readdirSync(d).forEach(f => {
        let y = d + '/' + f;
        if (fs.statSync(y).isDirectory()) r = r.concat(w(y));
        else if (f.endsWith('.css')) r.push(y);
    });
    return r;
}
w(p).forEach(f => {
    let c = fs.readFileSync(f, 'utf8');
    if (c.includes('.pc-section h4')) {
        c = c.replace(/(\.pc-section h4\s*\{[^}]*font-size:\s*)\d+px/g, '$115px');
        console.log('Updated existing in', f);
    } else {
        c += `\n.pc-section h4 {\n    font-size: 15px;\n    font-weight: bold;\n    margin-top: 16px;\n    margin-bottom: 8px;\n}\n`;
        console.log('Appended to', f);
    }
    fs.writeFileSync(f, c, 'utf8');
});

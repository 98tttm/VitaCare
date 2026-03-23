const fs = require('fs');
const path = require('path');

function walk(dir) {
    let results = [];
    const list = fs.readdirSync(dir);
    list.forEach(function (file) {
        file = dir + '/' + file;
        const stat = fs.statSync(file);
        if (stat && stat.isDirectory()) {
            results = results.concat(walk(file));
        } else {
            if (file.endsWith('.html')) {
                results.push(file);
            }
        }
    });
    return results;
}

const dir = 'e:/KHANH XUAN/UEL_study/N3HK2/WEB NANG CAO/PROJECT/VitaCare/VitaCare/my-user/src/app/features/policies';
const files = walk(dir);

let count = 0;
files.forEach(file => {
    let content = fs.readFileSync(file, 'utf8');
    if (content.includes('/chinh-sach/')) {
        let newContent = content.replace(/\/chinh-sach\//g, '/policy/');
        fs.writeFileSync(file, newContent, 'utf8');
        console.log('Updated', file);
        count++;
    }
});
console.log('Total files updated:', count);

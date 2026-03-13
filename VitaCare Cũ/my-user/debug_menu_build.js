const fs = require('fs');
const path = require('path');

// Mock Data Loading
// Adjust path to point to data/categories.json
// Current File: my-user/debug_menu_build.js
// Target: ../data/categories.json
const categoriesPath = path.join(__dirname, '../data/categories.json');

try {
    const rawData = fs.readFileSync(categoriesPath, 'utf8');
    const categories = JSON.parse(rawData);
    console.log(`Loaded ${categories.length} categories.`);

    const category_pills = [
        'Thực phẩm chức năng',
        'Dược mỹ phẩm',
        'Thuốc',
        'Chăm sóc cá nhân',
        'Thiết bị y tế',
        'Bệnh & Góc sức khỏe',
        'Hệ thống nhà thuốc'
    ];

    const megaMenuData = {};

    category_pills.forEach(rootName => {
        // Strict check: parentId must be falsy (null, undefined, "") 
        // OR explicit 'null' string if data is weird.
        const root = categories.find(c => c.name === rootName && !c.parentId);

        if (!root) {
            console.log(`[MISSING ROOT] "${rootName}" - check name exactly or parentId`);
            // Debug: find if it exists with name at least
            const exists = categories.find(c => c.name === rootName);
            if (exists) console.log(`   (Found "${rootName}" with parentId: ${exists.parentId})`);
            return;
        }

        console.log(`[FOUND ROOT] "${rootName}" (_id: ${root._id})`);

        const l2 = categories.filter(c => c.parentId === root._id);
        console.log(`   -> Level 2 Children: ${l2.length}`);

        if (l2.length > 0) {
            megaMenuData[rootName] = { type: 'mega', count: l2.length };
        }
    });

} catch (err) {
    console.error("Error reading categories:", err.message);
}

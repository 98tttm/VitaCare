const http = require('http');

async function testApi(skip = 0, limit = 12) {
    return new Promise((resolve, reject) => {
        const url = `http://localhost:3000/api/blogs/topic-counts?skip=${skip}&limit=${limit}`;
        http.get(url, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    resolve(json);
                } catch (e) {
                    reject(e);
                }
            });
        }).on('error', reject);
    });
}

async function runTests() {
    try {
        console.log('--- Testing Initial Load (limit=12) ---');
        const res1 = await testApi(0, 12);
        console.log('Success:', res1.success);
        console.log('Total:', res1.total);
        console.log('Counts length:', res1.counts.length);
        if (res1.counts.length > 0) {
            console.log('First Item:', res1.counts[0].name);
        }

        if (res1.total > 12) {
            console.log('\n--- Testing Next Page (skip=12, limit=12) ---');
            const res2 = await testApi(12, 12);
            console.log('Success:', res2.success);
            console.log('Counts length:', res2.counts.length);
            if (res2.counts.length > 0) {
                console.log('First Item on Page 2:', res2.counts[0].name);
            }
        }
    } catch (err) {
        console.error('Test failed:', err);
        if (err.stack) console.error(err.stack);
    }
}

runTests();
